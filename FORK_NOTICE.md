# Fork notice

This repository is a fork of https://github.com/diegosouzapw/OmniRoute by diegosouzapw, licensed under the MIT License (see `LICENSE`, "Copyright (c) 2026 diegosouzapw"). The original code remains the property of its authors under that license. Modifications by Bradley S Dickover (d/b/a Flinttech), if any, are listed in the commit history and are provided under the same license.

Bradley S Dickover claims no ownership of the upstream code. The upstream `LICENSE` and copyright notices in this repository are unchanged and must be kept.

## Bradley's modifications in this fork

These commits by Bradley Dickover (July 23–24, 2026, merged via PR #1) add Flinttech Stripe billing/metering and a revenue-recovery module. Like the rest of this repository they are provided under the MIT License:

- `14d6a8750` 2026-07-24 feat(flint): usageBridge reads latest usage_history row on emitUsageRecorded
- `251d5b1c4` 2026-07-24 feat(flint): emit detailed usage events from saveRequestUsage for Stripe metering
- `6790dd95b` 2026-07-24 feat(flint): register usage→Stripe metering bridge at startup
- `a74e870e1` 2026-07-24 feat(flint): wire Stripe metering into saveRequestUsage path
- `0c2933773` 2026-07-23 feat(flint): wire checkout API + request-path metering hooks
- `3029fc3e4` 2026-07-23 feat(flint): live Stripe revenue catalog + customer mapping for max revenue
- `c02306f47` 2026-07-23 feat(flint): durable recovery queue with BullMQ (Redis) + memory fallback
- `9bacf51e6` 2026-07-23 feat(flint): add live Stripe billing webhook route + delayed recovery scheduler skeleton
- `945fd908b` 2026-07-23 docs(flint): mark Revenue Recovery Engine + webhook handler as implemented
- `05d5c5b6e` 2026-07-23 feat(flint): implement Hyperswitch-inspired Revenue Recovery Engine
- `cd8e68e07` 2026-07-23 feat(flint): bootstrap Apex combined architecture + live Stripe foundation

The upstream MIT notice must stay in every copy or substantial portion of this code, including any copy used in a paid product. The MIT License does not grant rights to the name "OmniRoute".

_Added 2026-09-27._
