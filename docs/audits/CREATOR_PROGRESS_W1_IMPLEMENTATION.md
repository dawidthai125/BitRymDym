# Creator Progress W1 — Implementation Note

**Status:** IMPLEMENTED (pending Owner Commit GO)
**Design Freeze:** `docs/decisions/CREATOR_PROGRESS_PREMIUM_DESIGN_FREEZE_V1.md` @ `1e66cae`
**Wave:** W1 only — Experience ledger + Rank derivation + trusted awards
**Production DB:** migrations applied via Supabase MCP (W1 schema live); app commit/push pending Owner GO

### Migrations (repo)

1. `20261003210121_creator_progress_w1_experience.sql` — ledger, `experience_total`, RPC, RLS
2. `20261003210130_creator_progress_w1_award_rpc_fix.sql` — RPC hardening
3. `20261003210309_creator_progress_w1_award_role_guard.sql` — service_role + postgres maintainer guard
4. `20261003210322_creator_progress_w1_profile_experience_guard.sql` — profiles trigger allows award path

### DB smoke (live)

- First `ADMIN_CORRECTION` award → `awarded: true`
- Duplicate idempotency key → `IDEMPOTENT`, total unchanged
- Compensating cleanup → total back to prior

## In scope (W1)

- Table `creator_experience_events` (ledger SSOT)
- Column `profiles.experience_total` (derived cache, server-write)
- RPC `award_creator_experience` (service_role only, atomic insert + total)
- Pure `deriveCreatorRank(experience_total)` — **≠** `profiles.account_level`
- Trusted hooks: profile complete, beat approve/publish, take READY (auth), render SUCCEEDED (+ mix first export)
- Anti-abuse: idempotency unique key, daily caps, RLS select-own, mutation service_role only
- Tests: rank thresholds, amounts, contract/security static, protected fields

## Out of scope (unchanged / deferred)

- Premium tiers / `premium_entitlements.tier`
- `resolveProductEntitlement` product facade
- Capability matrix / downloads / Mix Pro / render premium limits
- Recording hybrid / overlay
- `/ranks` `/premium` UI
- Billing / checkout
- Artifact janitor / Gold 90d PRODUCTION
- ACCOUNT/PROFILE-01 redesign

## Delete account

W1 uses `ON DELETE CASCADE` from `profiles` → ledger so existing delete orchestrator continues without modification (ACCOUNT/PROFILE-01 CLOSED).
Future GO may add explicit delete (premium-style RESTRICT) for audit ordering.

## OPEN decisions (unchanged)

- OD-04, OD-07 OPEN; OD-08 candidate CLOSE; OD-09 OPEN (not Rank labels)
- Recording overlay numbers OPEN
- OD-SA-05 unchanged

## Anti-abuse summary

- Client cannot INSERT ledger / set amount / event / user / bypass idempotency
- Daily caps: RENDER 2/UTC day, TAKE 10× capped at 3/UTC day
- Anonymous take: no award path
- Failed/retry/republish: 0 via idempotency / no hook
- Admin correction: `ADMIN_CORRECTION` + metadata.reason via service_role RPC
