# AUDIT — FAR-01 LIVE Credential Verification

**Type:** LIVE + R1 interactive JWT mint + credential verification (not Canary / Backfill / Fleet / Retirement)
**Date:** 2026-10-03
**Architect GO:** Interactive LIVE + R1 JWT mint (SecureString; secret not persisted)
**Classification:** see §10

```text
CANARY / BACKFILL / FLEET / RETIREMENT = NOT EXECUTED
DB MUTATIONS                           = 0
STORAGE MUTATIONS                      = 0
SERVICE-ROLE AS OPERATOR CREDENTIAL    = NO
SECRETS / JWT IN REPO / AUDIT / LOGS   = NONE
COMMIT / PUSH / DEPLOY                 = NO
```

---

## 1. Executive summary

Interactive local mint accepted `SUPABASE_JWT_SECRET` via PowerShell `Read-Host -AsSecureString` in a separate console window. Secret was used only in process memory to HS256-sign operator JWTs and was **not** written to any file.

Both credentials were written to gitignored `.env.far01.local` (JWT keys + class + URL only).
`scripts/far01-verify-live-and-r1-credentials.ts` returned **PASS**.

### Final classification

# **LIVE CREDENTIAL VERIFICATION = PASS**

---

## 2. Mint mechanism

| Item | Detail |
|------|--------|
| Helper | TEMP `%TEMP%\far01_mint_live_and_r1_jwt.ps1` (outside repo) |
| Secret input | Interactive SecureString (`Read-Host -AsSecureString`) |
| Secret in argv / stdout / log / file | **NO** |
| `SUPABASE_JWT_SECRET` persisted | **NO** |
| Helper after run | **DELETED** |
| Repo mint script modified | **NO** (`scripts/far01-mint-role-jwt.ts` unchanged for this GO) |

---

## 3. LIVE JWT

| Field | Value |
|-------|-------|
| State | **MINTED** |
| Role claim | `far01_live_mutator` |
| Credential class | `live_mutator` |
| Env key | `FAR01_LIVE_MUTATOR_KEY` |
| Expired at verify | **false** |
| Expires at (UTC) | `2026-10-04T03:57:56.000Z` |
| TTL | 86400 seconds |

---

## 4. R1 JWT

| Field | Value |
|-------|-------|
| State | **REMINTED** (replaced expired token) |
| Role claim | `far01_dryrun_readonly` |
| Credential class | `readonly` |
| Env key | `FAR01_DRYRUN_READONLY_KEY` |
| Expired at verify | **false** |
| Expires at (UTC) | `2026-10-04T03:57:56.000Z` |
| TTL | 86400 seconds |

---

## 5. Identity / DB / Storage

| Check | Result |
|-------|--------|
| LIVE identity | **PASS** (`far01_live_mutator`) |
| LIVE class | **PASS** (`live_mutator`) |
| R1 identity | **PASS** (`far01_dryrun_readonly`) |
| R1 class | **PASS** (`readonly`) |
| LIVE beats SELECT | **PASS** |
| LIVE beat_audio_assets SELECT | **PASS** |
| R1 beats SELECT | **PASS** |
| R1 beat_audio_assets SELECT | **PASS** |
| LIVE Storage HEAD probe | **PASS** (no copy/upload/delete) |
| R1 Storage HEAD | **PASS** |

---

## 6. Credential separation

| Check | Result |
|-------|--------|
| LIVE JWT ≠ R1 JWT | **PASS** (distinct keys) |
| Roles distinct | **PASS** |
| Classes distinct | **PASS** (`live_mutator` vs `readonly`) |
| R1 as LIVE mutator | **DENY_OK** |
| LIVE as R1 readonly | **DENY_OK** |
| service-role as operator | **NO** / **DENY_OK** (apikey gate) |

---

## 7. Negative privilege boundary

HTTP probes against nonexistent UUID (no durable row mutation):

| Probe | Result | HTTP |
|-------|--------|------|
| LIVE INSERT | DENY | 403 |
| LIVE DELETE | DENY | 403 |
| LIVE update status | DENY | 403 |
| LIVE update checksum | DENY | 403 |
| R1 INSERT | DENY | (denied) |
| R1 UPDATE | DENY | (denied) |
| R1 DELETE | DENY | (denied) |

Auth / mode gates (no mutation):

| Gate | Result |
|------|--------|
| LIVE + DRY_RUN mode | **DENY_OK** |
| LIVE missing A2 | **DENY_OK** |
| LIVE service-role apikey | **DENY_OK** |
| R1 dry-run path usable (SELECT/HEAD under R1) | **PASS** |

Not executed: COPY · UPDATE `object_key` · real INSERT/DELETE · Storage overwrite/delete.

---

## 8. Integrity / safety

| Item | Status |
|------|--------|
| DB mutations | **0** |
| Storage mutations | **0** |
| service-role | **NO** |
| Canary | NOT EXECUTED |
| Backfill | NOT EXECUTED |
| Fleet | NOT EXECUTED |
| Retirement | NOT EXECUTED |
| `.env.far01.local` gitignored | **YES** (`.env*`) |
| `.env.far01.local` tracked | **NO** |
| `SUPABASE_JWT_SECRET` in `.env.far01.local` | **MISSING** (by design) |
| Secret/JWT in this audit | **NO** |

---

## 9. Tests / typecheck / lint

| Item | Result |
|------|--------|
| Vitest `src/lib/beats/far01-backfill` | **PASS** 124/124 |
| Typecheck (`tsc --noEmit`) | **PASS** |
| ESLint (far01-backfill + far01 scripts) | **PASS** |

---

## 10. Classification

```text
LIVE CREDENTIAL VERIFICATION = PASS
LIVE JWT                     = MINTED
R1 JWT                       = REMINTED
```

**Blocker:** NONE

---

## 11. STOP

Credential verification complete. No Canary. No Backfill. No production mutation.
Commit / Push / Deploy = **NO**. Awaiting Architect Review.
