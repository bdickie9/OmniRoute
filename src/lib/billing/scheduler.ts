/**
 * Flint Tech — Durable Recovery Scheduler
 *
 * Best design for real revenue recovery:
 *
 * 1. PRIMARY (production): BullMQ + Redis
 *    - Jobs survive process restarts, deploys, and crashes
 *    - Safe across multiple instances
 *    - Built-in delayed jobs + job-level retries
 *
 * 2. FALLBACK (local / no Redis): in-memory timers
 *    - Same API surface so callers do not change
 *    - Acceptable for single-node desktop / quick testing only
 *
 * Recovery steps remain idempotent: workers always re-fetch the
n * invoice / PaymentIntent and skip if already paid/succeeded.
 */

import { attemptRecovery, type RecoveryContext } from "./recovery.js";
import { getStripeClient, isLiveBillingEnabled } from "./stripe-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduledRecovery {
  paymentId: string;
  delaySeconds: number;
  attemptNumber: number;
  reason: string;
  scheduledAt: string;
  runAt: string;
  backend: "bullmq" | "memory";
}

export interface RecoveryJobPayload {
  paymentId: string;
  attemptNumber: number;
  reason: string;
}

const QUEUE_NAME = "flint-revenue-recovery";
const JOB_NAME = "recovery.retry";

// ---------------------------------------------------------------------------
// Memory fallback (v1 behaviour)
// ---------------------------------------------------------------------------

const memoryPending = new Map<string, NodeJS.Timeout>();

function scheduleInMemory(opts: {
  paymentId: string;
  delaySeconds: number;
  attemptNumber: number;
  reason: string;
}): ScheduledRecovery {
  const scheduledAt = new Date();
  const runAt = new Date(scheduledAt.getTime() + opts.delaySeconds * 1000);

  const existing = memoryPending.get(opts.paymentId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    memoryPending.delete(opts.paymentId);
    await executeRecoveryJob({
      paymentId: opts.paymentId,
      attemptNumber: opts.attemptNumber,
      reason: opts.reason,
    });
  }, opts.delaySeconds * 1000);

  if (typeof timer.unref === "function") timer.unref();
  memoryPending.set(opts.paymentId, timer);

  console.info("[Flint Recovery] Scheduled (memory fallback)", {
    paymentId: opts.paymentId,
    delaySeconds: opts.delaySeconds,
    runAt: runAt.toISOString(),
  });

  return {
    paymentId: opts.paymentId,
    delaySeconds: opts.delaySeconds,
    attemptNumber: opts.attemptNumber,
    reason: opts.reason,
    scheduledAt: scheduledAt.toISOString(),
    runAt: runAt.toISOString(),
    backend: "memory",
  };
}

// ---------------------------------------------------------------------------
// BullMQ (durable) — lazy init so the package is optional until installed
// ---------------------------------------------------------------------------

let bullQueue: any = null;
let bullWorker: any = null;
let bullInitAttempted = false;
let bullAvailable: boolean | null = null;

async function ensureBullMQ(): Promise<boolean> {
  if (bullInitAttempted) return bullAvailable === true;
  bullInitAttempted = true;

  const redisUrl =
    process.env.FLINT_RECOVERY_REDIS_URL ??
    process.env.REDIS_URL ??
    process.env.OMNIROUTE_REDIS_URL;

  if (!redisUrl) {
    bullAvailable = false;
    console.info(
      "[Flint Recovery] No Redis URL — using memory fallback. Set FLINT_RECOVERY_REDIS_URL for durable jobs."
    );
    return false;
  }

  try {
    // Dynamic import so the app still boots if bullmq is not yet installed
    const bullmq = await import("bullmq");
    const { Queue, Worker } = bullmq;

    const connection = { url: redisUrl };

    bullQueue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
      },
    });

    // Worker runs in-process. For large scale, run a dedicated worker process.
    bullWorker = new Worker(
      QUEUE_NAME,
      async (job: { data: RecoveryJobPayload }) => {
        await executeRecoveryJob(job.data);
      },
      { connection, concurrency: 2 }
    );

    bullWorker.on("failed", (job: any, err: Error) => {
      console.error("[Flint Recovery] BullMQ job failed", {
        paymentId: job?.data?.paymentId,
        error: err?.message,
      });
    });

    bullWorker.on("completed", (job: any) => {
      console.info("[Flint Recovery] BullMQ job completed", {
        paymentId: job?.data?.paymentId,
      });
    });

    bullAvailable = true;
    console.info("[Flint Recovery] BullMQ durable queue ready", { queue: QUEUE_NAME });
    return true;
  } catch (err) {
    bullAvailable = false;
    console.warn(
      "[Flint Recovery] BullMQ unavailable — falling back to memory.",
      err instanceof Error ? err.message : String(err),
      "Install with: npm install bullmq"
    );
    return false;
  }
}

async function scheduleWithBullMQ(opts: {
  paymentId: string;
  delaySeconds: number;
  attemptNumber: number;
  reason: string;
}): Promise<ScheduledRecovery> {
  const scheduledAt = new Date();
  const runAt = new Date(scheduledAt.getTime() + opts.delaySeconds * 1000);

  // Dedupe: one active delayed job per paymentId
  const jobId = `recovery:${opts.paymentId}`;

  await bullQueue.add(
    JOB_NAME,
    {
      paymentId: opts.paymentId,
      attemptNumber: opts.attemptNumber,
      reason: opts.reason,
    } satisfies RecoveryJobPayload,
    {
      jobId,
      delay: opts.delaySeconds * 1000,
      // If a job with same id exists, replace delay (BullMQ 4+ removeOnComplete etc. already set)
    }
  );

  console.info("[Flint Recovery] Scheduled (BullMQ durable)", {
    paymentId: opts.paymentId,
    delaySeconds: opts.delaySeconds,
    runAt: runAt.toISOString(),
    jobId,
  });

  return {
    paymentId: opts.paymentId,
    delaySeconds: opts.delaySeconds,
    attemptNumber: opts.attemptNumber,
    reason: opts.reason,
    scheduledAt: scheduledAt.toISOString(),
    runAt: runAt.toISOString(),
    backend: "bullmq",
  };
}

// ---------------------------------------------------------------------------
// Shared execution (idempotent)
// ---------------------------------------------------------------------------

async function executeRecoveryJob(payload: RecoveryJobPayload): Promise<void> {
  const { paymentId, attemptNumber } = payload;

  if (!isLiveBillingEnabled()) {
    console.warn("[Flint Recovery] Live billing disabled — skipping", paymentId);
    return;
  }

  const stripe = getStripeClient();
  if (!stripe) return;

  try {
    if (paymentId.startsWith("in_")) {
      const invoice = await stripe.invoices.retrieve(paymentId);
      if (invoice.status === "paid") {
        console.info("[Flint Recovery] Invoice already paid — skip", paymentId);
        return;
      }

      const ctx: RecoveryContext = {
        paymentId,
        customerId:
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id ?? "",
        amount: invoice.amount_due ?? 0,
        currency: invoice.currency ?? "usd",
        attemptCount: attemptNumber,
        failedAt: new Date().toISOString(),
      };

      const result = await attemptRecovery(ctx);
      console.info("[Flint Recovery] Attempt finished", {
        paymentId,
        success: result.success,
        reason: result.decision.reason,
        backend: bullAvailable ? "bullmq" : "memory",
      });
      return;
    }

    if (paymentId.startsWith("pi_")) {
      const pi = await stripe.paymentIntents.retrieve(paymentId);
      if (pi.status === "succeeded") {
        console.info("[Flint Recovery] PaymentIntent already succeeded — skip", paymentId);
        return;
      }

      const ctx: RecoveryContext = {
        paymentId,
        customerId:
          typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? "",
        amount: pi.amount ?? 0,
        currency: pi.currency ?? "usd",
        attemptCount: attemptNumber,
        failedAt: new Date().toISOString(),
        declineCode: pi.last_payment_error?.decline_code,
        failureMessage: pi.last_payment_error?.message,
      };

      const result = await attemptRecovery(ctx);
      console.info("[Flint Recovery] Attempt finished", {
        paymentId,
        success: result.success,
        reason: result.decision.reason,
        backend: bullAvailable ? "bullmq" : "memory",
      });
    }
  } catch (err) {
    console.error("[Flint Recovery] Execution error", {
      paymentId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Re-throw so BullMQ can apply job-level retries
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API (unchanged for callers)
// ---------------------------------------------------------------------------

/**
 * Schedule a delayed recovery attempt.
 * Uses BullMQ when Redis is configured; otherwise memory fallback.
 */
export async function scheduleDelayedRecovery(opts: {
  paymentId: string;
  delaySeconds: number;
  attemptNumber: number;
  reason: string;
}): Promise<ScheduledRecovery> {
  const useBull = await ensureBullMQ();

  if (useBull && bullQueue) {
    try {
      return await scheduleWithBullMQ(opts);
    } catch (err) {
      console.warn(
        "[Flint Recovery] BullMQ enqueue failed — falling back to memory",
        err instanceof Error ? err.message : String(err)
      );
      return scheduleInMemory(opts);
    }
  }

  return scheduleInMemory(opts);
}

/** Diagnostic: memory-pending payment IDs (BullMQ state lives in Redis). */
export function listPendingRecoveries(): string[] {
  return Array.from(memoryPending.keys());
}

/** Whether the durable backend is active in this process. */
export async function isDurableQueueActive(): Promise<boolean> {
  return ensureBullMQ();
}
