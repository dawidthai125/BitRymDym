# Creator Progress W1 — Implementation Note

**Status:** PRODUCTION VERIFIED WITH OPEN ITEMS
**Design Freeze:** `docs/decisions/CREATOR_PROGRESS_PREMIUM_DESIGN_FREEZE_V1.md` @ `1e66cae`
**Wave:** W1 only — Experience ledger + Rank derivation + trusted awards
**Commit:** `76a47572f6e9342e0afe48e9a29108815089412a` (short `76a4757`)
**Production app:** `76a4757` — DEPLOYED / VERIFIED
**Closeout:** [CREATOR_PROGRESS_W1_CLOSEOUT.md](./CREATOR_PROGRESS_W1_CLOSEOUT.md)

### Production DB migrations

1. `20261003210121` — `creator_progress_w1_experience`
2. `20261003210130` — `creator_progress_w1_award_rpc_fix`
3. `20261003210309` — `creator_progress_w1_award_role_guard`
4. `20261003210322` — `creator_progress_w1_profile_experience_guard`

Repo filenames match production versions (reconciled before commit).

### Tests (pre-commit / verify)

- W1 contract: 6/6
- Focused creator-progress (`award-config` + `rank` + `w1-contract`): 15/15
- Typecheck: PASS
- Build: PASS

### DB smoke (live, historical)

- First `ADMIN_CORRECTION` award → `awarded: true`
- Duplicate idempotency key → `IDEMPOTENT`, total unchanged
- Compensating cleanup → total back to prior

Live product award rows are still limited (see OPEN-03). Do not claim full live product-path coverage.

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
- Recording hybrid / overlay numbers
- `/ranks` `/premium` UI
- Billing / checkout
- Artifact janitor / Gold 90d PRODUCTION
- ACCOUNT/PROFILE-01 redesign

## Delete account

W1 uses `ON DELETE CASCADE` from `profiles` → ledger so existing delete orchestrator continues without modification (ACCOUNT/PROFILE-01 CLOSED).
**Live Delete Account + ledger CASCADE E2E = OPEN / NOT LIVE VERIFIED** (OPEN-02).

## OPEN items (preserved)

| ID | Item | Status |
|----|------|--------|
| OPEN-01 | Defense-in-depth `REVOKE INSERT/UPDATE/DELETE` on `creator_experience_events` for anon/authenticated | OPEN / NON-BLOCKING |
| OPEN-02 | ACCOUNT-01 live Delete Account + ledger CASCADE E2E | OPEN / NOT LIVE VERIFIED |
| OPEN-03 | Live product award coverage (ledger currently compensated ADMIN_CORRECTION smoke only) | LIMITED / NON-BLOCKING |

## OPEN decisions (unchanged by W1)

- OD-04, OD-07 OPEN; OD-08 candidate CLOSE; OD-09 OPEN (Account Level display names — **not** Creator Rank labels)
- Recording Premium overlay numbers OPEN
- OD-SA-05 unchanged
- W1 does **not** authorize Premium implementation (W2 requires separate Owner GO)

## Anti-abuse summary

- Client cannot INSERT ledger / set amount / event / user / bypass idempotency
- Daily caps: RENDER 2/UTC day, TAKE 10× capped at 3/UTC day
- Anonymous take: no award path
- Failed/retry/republish: 0 via idempotency / no hook
- Admin correction: `ADMIN_CORRECTION` + metadata.reason via service_role RPC
