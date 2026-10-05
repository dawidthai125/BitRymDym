# P1 — Sample Policy Matrix (Premium Tier)

**Status:** IMPLEMENTATION COMPLETE (production verify after deploy)  
**Owner GO:** B1/B2/B3/B4 TAK  
**Commit message target:** `feat(recording): add tiered sample policy matrix`

---

## 1. Scope

Central Sample Policy for recording samples:
- max recording duration
- TTL
- daily sessions
- active READY cap
- `canDownloadOwnTake` capability (P4 enforcement deferred)

Axis: **Premium Tier** (`ANONYMOUS | FREE | BRONZE | SILVER | GOLD`), not Account Level.

## 2. Owner decisions

| ID | Decision |
|----|----------|
| B1 | Sample Policy ← Premium Tier |
| B2 | `canDownloadOwnTake` capability only — no take-download.ts change |
| B3 | Admin DB overrides for BRONZE/SILVER/GOLD duration |
| B4 | ANONYMOUS = 15 s |

## 3. Before state

- SSOT: Account Level (`BEGINNER/PRO/LEGEND`) via `entitlement.ts`
- ANON max 30 s; BEGINNER 30 s / 24 h / 3 ready / 10 day
- No Admin duration settings table

## 4. Target state

| Actor | Duration | TTL | Active | Day | canDownloadOwnTake |
|-------|----------|-----|--------|-----|--------------------|
| ANONYMOUS | 15 | 2 h | 1 | 3 | false |
| FREE | 30 | 12 h | 3 | 3 | false |
| BRONZE | 60* | 36 h | 5 | 5 | false |
| SILVER | 120* | 60 h | 7 | 7 | false |
| GOLD | 180* | 84 h | 10 | 10 | true |

\* Admin-overridable (1..180). Global max = 180.

## 5. Premium Tier resolution

- Auth: `resolveProductEntitlementForAuthContext` → `premiumTier`
- Missing/expired/inactive → FREE
- ANONYMOUS ≠ FREE (separate cookie identity path)
- Account Level unused for sample limits

## 6–7. Architecture / Admin overrides

- Pure resolver: `getSamplePolicy(...)` in `src/lib/takes/entitlement.ts`
- Defaults: `src/config/recording.ts` → `SAMPLE_POLICY_DEFAULTS`
- DB SSOT: `sample_policy_settings` (singleton)
- Load: `loadSamplePolicyDurationOverrides()`
- Mutate: `updateSamplePolicySettings` + `requireRole(["ADMIN"])`
- UI: `/admin/sample-policy`

## 8. DB SSOT

Migration: `20261005180000_p1_sample_policy_settings.sql`
- Table + RLS deny anon/authenticated
- Audit action `SAMPLE_POLICY_UPDATE` on `admin_audit_events`

## 9–10. Security / server enforcement

- Client cannot supply tier or max seconds
- Session create resolves entitlement + overrides → policy → RPC caps / `expires_at` / snapshot
- Finalize probes duration vs `recording_max_seconds_snapshot` (session-time policy)
- USER/MODERATOR cannot mutate settings

## 11–13. TTL / daily / active READY

- TTL via `policy.ttlSeconds` → `expires_at` (existing janitor reused)
- Daily: `SESSION_DAY_CAP` with new numbers
- Active READY: `ACTIVE_READY_CAP` DENY (no replace / P2)

## 14. Tests

- `p1-sample-policy.test.ts` — full matrix + admin validation + forged tier/duration
- `p1-sample-policy-settings.test.ts` — migration + ADMIN gate
- Updated wave1/2/4/d02/wave5/w2b unit + live tests
- P0 regression suite kept green

## 15–16. Production verification / data safety

Filled after deploy.

## 17–18. Deferred

- P2 replace
- P4 GOLD own-take download + 5/day
- P3 claim, P5 plays, P6 ratings

## 19. Known limitations

- Existing READY takes keep prior `expires_at` (no take migration)
- New sessions only get new TTL/caps
- `canDownloadOwnTake` not enforced until P4
