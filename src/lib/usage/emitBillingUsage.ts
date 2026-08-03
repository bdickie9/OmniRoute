/**
 * Called from saveRequestUsage after a successful INSERT (not on dedup).
 * Kept in a tiny module so usageHistory only needs a 2-line change site.
 */
import { emitUsageRecordedDetail } from "./usageEvents";
import type { UsageEntry } from "./usageHistory";

export function emitBillingUsageAfterInsert(
  entry: UsageEntry,
  tokensInput: number,
  tokensOutput: number
): void {
  emitUsageRecordedDetail({
    provider: entry.provider,
    connectionId: entry.connectionId,
    model: entry.model,
    apiKeyId: entry.apiKeyId,
    apiKeyName: entry.apiKeyName,
    tokensInput,
    tokensOutput,
    success: entry.success !== false,
    endpoint: entry.endpoint,
  });
}
