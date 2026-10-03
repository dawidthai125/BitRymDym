# AUDIT — FAR-01 LIVE Credential Provisioning

**Type:** Credential provisioning + privilege verification (not Canary / Backfill)
**Date:** 2026-10-03
**Architect GO:** LIVE MUTATOR CREDENTIAL PROVISIONING only
**Classification:** see §14

```text
CANARY / BACKFILL / FLEET / RETIREMENT = NOT EXECUTED
PRODUCTION BUSINESS MUTATIONS          = 0
SERVICE-ROLE AS LIVE CREDENTIAL        = NO
SECRETS IN REPO / AUDIT / LOGS         = NONE
OD-BF-08                               = NO
```

---

## 1. Executive summary

Postgres role **`far01_live_mutator`** was provisioned with minimal grants, RLS, Storage INSERT/SELECT policies, and a scoped privilege-trigger exception for **object_key-only** UPDATE on USER assets.

**JWT key material was not minted** in this session: `SUPABASE_JWT_SECRET` is not available in the agent environment. Without it, Data API Authorization for LIVE cannot be completed. Concurrently, the existing R1 JWT expired (`exp` passed during this session), so live R1 HTTP regression returned 401.

### Final classification

# **LIVE CREDENTIAL PROVISIONING BLOCKED**

**Blocked on:** Owner mint of `FAR01_LIVE_MUTATOR_KEY` via `scripts/far01-mint-role-jwt.ts live_mutator` (requires `SUPABASE_JWT_SECRET`).
**Also required for R1 regression:** remint `FAR01_DRYRUN_READONLY_KEY` via same script with `readonly`.

**Provisioned and verified without mutation:** role · grants · column privileges · RLS · Storage policies · trigger scope · runtime class gates · unit tests.

---

## 2. Credential class

| Item | Value |
|------|-------|
| Credential class | `live_mutator` |
| Env | `FAR01_LIVE_CREDENTIAL_CLASS=live_mutator` |
| Postgres role | `far01_live_mutator` |
| JWT claim `role` | must equal `far01_live_mutator` |
| Distinct from R1 | **YES** (`readonly` / `far01_dryrun_readonly`) |
| Distinct from service_role / anon / admin | **YES** |

---

## 3. Privilege scope (exact)

### 3.1 DB grants

| Object | Privilege |
|--------|-----------|
| `public.beat_audio_assets` | **SELECT** |
| `public.beat_audio_assets.object_key` | **UPDATE** (column-only) |
| `public.beats` | **SELECT** only |
| INSERT / DELETE / TRUNCATE on assets | **REVOKED** |
| UPDATE on status / checksum / beat_id / owner fields | **NO column privilege** |
| `public.beats` writes | **REVOKED** |

### 3.2 Storage grants

| Object | Privilege |
|--------|-----------|
| `storage.buckets` | SELECT |
| `storage.objects` | **SELECT + INSERT** |
| `storage.objects` UPDATE / DELETE | **REVOKED** (no overwrite / delete) |

### 3.3 RLS

| Policy | CMD | Scope |
|--------|-----|-------|
| `far01_live_mutator_select_beat_audio_assets` | SELECT | `storage_bucket='beat-audio'` |
| `far01_live_mutator_update_object_key` | UPDATE | beat-audio ∧ not quarantine id |
| `far01_live_mutator_select_beats` | SELECT | beats |
| `far01_live_mutator_select_beat_audio_objects` | SELECT | `bucket_id='beat-audio'` |
| `far01_live_mutator_insert_canonical_master` | INSERT | beat-audio ∧ canonical USER MASTER path regex |

### 3.4 Privilege trigger (required — not service-role bypass)

`prevent_beat_audio_privilege_escalation` updated so `auth.role()='far01_live_mutator'` may **UPDATE object_key only** on USER beats, with quarantine hard deny. INSERT/DELETE still denied for LIVE. ADMIN/service_role paths unchanged otherwise.

**Rationale:** Without this scoped exception, LIVE UPDATE is impossible except via service_role — which Architect rejects.

Migration:

- Repo: `supabase/migrations/20261003020000_far01_live_mutator_role.sql`
- Remote: applied as `far01_live_mutator_role`

---

## 4. DB write scope

**Allowed (capability):** UPDATE `beat_audio_assets.object_key` only, under optimistic lock + trigger immutability checks.

**Denied:** owner_id · beat_id · status · checksum · metadata · created_at · INSERT · DELETE · bulk patterns · other tables.

---

## 5. Storage write scope

**Allowed (capability):** INSERT new canonical `user/{owner}/{beat}/{asset}/master.bin` object (COPY create) + SELECT/HEAD.

**Denied:** DELETE · UPDATE/overwrite · arbitrary destination path · arbitrary bucket.

**Not executed this step:** any COPY / UPLOAD / DELETE.

---

## 6. Negative verification (zero mutation)

Catalog privileges (`has_*_privilege`):

| Check | Result |
|-------|--------|
| assets SELECT | true |
| assets INSERT | **false** |
| assets DELETE | **false** |
| column UPDATE object_key | true |
| column UPDATE status | **false** |
| column UPDATE checksum_sha256 | **false** |
| column UPDATE beat_id | **false** |
| beats UPDATE | **false** |
| storage SELECT | true |
| storage INSERT | true |
| storage UPDATE | **false** |
| storage DELETE | **false** |
| R1 assets UPDATE | **false** |
| R1 storage INSERT | **false** |
| rolbypassrls | **false** |
| granted to authenticator | **true** |

Transactional SET ROLE probes for INSERT/DELETE/status UPDATE → denied; rolled back; **mutations = 0**.

---

## 7. R1 separation

| Check | Result |
|-------|--------|
| Separate role | `far01_dryrun_readonly` vs `far01_live_mutator` |
| Separate class | `readonly` vs `live_mutator` |
| Separate env keys | `FAR01_DRYRUN_*` vs `FAR01_LIVE_*` |
| Dry-run rejects LIVE JWT role claim | **YES** (code) |
| LIVE rejects R1 JWT role claim | **YES** (code) |
| Key equality mix denied | **YES** |
| R1 HTTP regression this session | **FAIL — R1 JWT expired** (not a privilege regression) |

---

## 8. Service-role absence

| Check | Result |
|-------|--------|
| LIVE default = service_role | **NO** |
| Admin client factory on LIVE path | **FORBIDDEN** |
| apikey = service_role denied | **YES** |
| LIVE JWT = service_role denied | **YES** |

---

## 9. Secret hygiene

| Rule | Result |
|------|--------|
| Secret in git | **NO** |
| Secret in this audit | **NO** |
| Secret printed by mint/regression | **NO** |
| `.env.far01.local` | gitignored; class/url set; LIVE JWT **not** written (mint blocked) |

---

## 10. Runtime gates (code)

| Gate | Status |
|------|--------|
| class ≠ live_mutator → DENY | PASS (tests) |
| missing env → DENY | PASS |
| expired JWT → DENY | PASS |
| R1 JWT on LIVE → DENY | PASS |
| LIVE JWT on R1 → DENY | PASS |
| DRY_RUN mode mutation → DENY | PASS (live-mutation) |
| missing A2 → DENY | PASS |
| service-role / admin → DENY | PASS |
| Client factory inject-only | PASS (no FromEnv auto mutation) |

---

## 11. Positive capability (non-mutating)

| Check | Result |
|-------|--------|
| Role identity present | **PASS** |
| Credential class contract | **PASS** |
| SELECT privilege | **PASS** (catalog) |
| HEAD/list privilege (Storage SELECT) | **PASS** (catalog + RLS policy) |
| Adapter construct from injected client | **PASS** |
| LIVE JWT Data API identity | **BLOCKED** — key not minted |
| Real COPY / DB UPDATE | **NOT EXECUTED** |

---

## 12. Limitations / remaining blockers

1. **GC-LIVE-JWT-01** — mint `FAR01_LIVE_MUTATOR_KEY` with `SUPABASE_JWT_SECRET`
   `npx tsx scripts/far01-mint-role-jwt.ts live_mutator`
2. **R1 JWT expired** — remint readonly for regression
   `npx tsx scripts/far01-mint-role-jwt.ts readonly`
3. **Canary GO = NO**
4. **OD-BF-08 / Backfill GO = NO**
5. Storage SELECT still allows download under same JWT (adapter boundary + C-R1-01-class residual for LIVE)

---

## 13. Test results

| Suite | Result |
|-------|--------|
| FAR-01 vitest | **124 / 124** |
| `tsc --noEmit` | PASS (after fixes) |
| relevant eslint | PASS |
| Live R1 HTTP regression | **BLOCKED** (expired R1 JWT) |
| SQL privilege verification | PASS · mutations 0 |

---

## 14. Classification

# **LIVE CREDENTIAL PROVISIONING BLOCKED**

Role/privilege plane: **PROVISIONED + VERIFIED**.
Operator JWT plane: **NOT COMPLETE** (secret not available to agent).

After Owner mints LIVE (+ remints R1), re-run:

- `npx tsx scripts/far01-r1-live-regression-check.ts`
- LIVE resolve → `RESOLVED`
- Optional: HEAD-only Storage list under LIVE JWT (still no COPY)

Then Architect may re-classify to **LIVE CREDENTIALS PROVISIONED — VERIFICATION COMPLETE**.

---

## 15. Safety report

| Control | Result |
|---------|--------|
| Production DB mutations | **0** |
| Production Storage mutations | **0** |
| Service-role | **NO** |
| Canary | **NOT EXECUTED** |
| Backfill | **NOT EXECUTED** |
| Fleet | **NOT EXECUTED** |
| Retirement | **NOT EXECUTED** |
| Commit / Push / Deploy | **NO** |

---

## 16. Files changed

| Path | Role |
|------|------|
| `supabase/migrations/20261003020000_far01_live_mutator_role.sql` | Role/grants/RLS/trigger |
| `src/lib/beats/far01-backfill/live-credentials.ts` | LIVE resolve/client/transport |
| `src/lib/beats/far01-backfill/readonly-client.ts` | R1 rejects LIVE JWT |
| `src/lib/beats/far01-backfill/far01-live-credentials.test.ts` | Boundary tests |
| `src/lib/beats/far01-backfill/far01-backfill-blockers.test.ts` | Updated LIVE apikey deny |
| `scripts/far01-mint-role-jwt.ts` | Local mint (no secret print) |
| `scripts/far01-r1-live-regression-check.ts` | R1/LIVE regression |
| `.env.example` | LIVE env names |
| `.env.far01.local` (gitignored) | LIVE class/url stubs only |
| `docs/audits/AUDIT_FAR_01_LIVE_CREDENTIAL_PROVISIONING.md` | This audit |

---

## 17. STOP

Await **Architect Review**.
Do not execute Canary. Do not execute Backfill.
Owner action: provide `SUPABASE_JWT_SECRET` once (out of band) and run mint script(s).
