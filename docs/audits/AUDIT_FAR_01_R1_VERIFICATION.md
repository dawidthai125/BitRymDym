# AUDIT — FAR-01 R1 Verification

**Type:** Live verification of provisioned R1 (GO — RE-RUN VERIFY R1)
**Timestamp:** 2026-10-03T01:31+02:00 (this re-run)
**HEAD:** `f9500b3` (+ local uncommitted transport fix; not committed)
**Owner GO:** RE-RUN VERIFY R1 (post Data API auth transport implementation)

```text
CLIENT PATTERN TESTED     = createClient(url, anon/publishable, {
                              accessToken: async () => r1Jwt
                            })
                            (readonly-client.ts after transport fix)
PRODUCTION DRY-RUN        = NOT EXECUTED
BACKFILL / CANARY / FLEET = NOT EXECUTED
SECRETS IN REPORT         = NONE
```

---

## 0. Delta vs previous Verify

| Gate | PREVIOUS (pre-transport fix) | CURRENT (this re-run) |
|------|------------------------------|------------------------|
| Data API SELECT | **FAIL** — `Invalid API key` | **PASS** |
| Transport | `createClient(url, R1_JWT)` → apikey=R1 JWT | apikey=anon/publishable; Authorization=Bearer R1 JWT via `accessToken` |
| Storage list `beat-audio` | **PASS** | **PASS** |
| Classification | **R1 VERIFICATION INCOMPLETE** | **R1 VERIFIED — WITH C-R1-01 OPEN** |

---

## 0b. Final classification

# **R1 VERIFIED — WITH C-R1-01 OPEN**

| Required for VERIFIED | Result |
|-----------------------|--------|
| Identity | **PASS** |
| Live DB SELECT | **PASS** |
| Live Storage HEAD/list | **PASS** |
| Negative privilege boundary | **PASS** |
| RLS / grants catalog | **PASS** |
| Secret hygiene | **PASS** |
| Service-role fallback | **NO** |
| Production DB mutation | **0** |
| Production Storage mutation | **0** |
| C-R1-01 | **OPEN / ACKNOWLEDGED** |

---

## 1. Auth / identity

| Check | Result | Evidence |
|-------|--------|----------|
| KEY present non-empty | **PASS** | Structural inspect (value not logged) |
| Class `readonly` | **PASS** | `FAR01_DRYRUN_CREDENTIAL_CLASS` |
| URL present | **PASS** | env |
| JWT structure (3 segments) | **PASS** | |
| Payload `role` | **PASS** | `far01_dryrun_readonly` (decoded locally; token not logged) |
| Payload `iss` | **PASS** | `supabase` |
| `exp` in future | **PASS** | `expOk=true` |
| Equals `SUPABASE_SERVICE_ROLE_KEY` | **PASS** — **false** | |
| API key equals R1 JWT | **PASS** — **false** | transport guard + live |
| API key equals service-role | **PASS** — **false** | |
| Service-role fallback used | **NO** | |
| NOBYPASSRLS (role attribute) | **PASS** | `rolbypassrls=false` (catalog SQL) |

---

## 2. Transport model (effective)

| Header / channel | Value class | Result |
|------------------|-------------|--------|
| `apikey` | anon/publishable (`NEXT_PUBLIC_SUPABASE_ANON_KEY` fallback; `FAR01_DRYRUN_API_KEY` unset) | **PASS** — not R1 JWT |
| `Authorization` | Bearer R1 JWT via `accessToken` | **PASS** — `accessTokenReturnsR1=true` |
| Effective Postgres role | `far01_dryrun_readonly` | **PASS** (JWT claim + live SELECT under that role) |

---

## 3. Positive live DB tests

| Test | Result | Evidence |
|------|--------|----------|
| SELECT `public.beats` (`id, owner_id, ownership_type, status`, limit 3) | **PASS** | `ok=true`, `rows=3`, `count=81`, `error=null` |
| SELECT `public.beat_audio_assets` (FAR-01 loader fields, `storage_bucket=beat-audio`, limit 3) | **PASS** | `ok=true`, `rows=3`, `count=73`, `error=null` |
| Row content / PII logged | **NO** | counts only |

---

## 4. Positive live Storage tests

| Test | Result | Evidence |
|------|--------|----------|
| `storage.from('beat-audio').list('user', { limit: 5 })` | **PASS** | `listedEntries=5`, `fileEntries=0`, `error=null` |
| Full audio download | **NOT TESTED** | avoided by design |
| Bucket boundary exercised | **PASS** | only `beat-audio` |

---

## 5. Negative privilege verification

| Test | Result | Method / evidence |
|------|--------|-------------------|
| INSERT `beat_audio_assets` | **PASS** (denied) | Live → `42501` `permission denied for table beat_audio_assets`; `mutationsDb` unchanged |
| UPDATE nonexistent UUID | **PASS** (denied) | Live → `42501` `permission denied for table beat_audio_assets`; `rows=0` |
| DELETE nonexistent UUID | **PASS** (denied) | Live → `42501` `permission denied for table beat_audio_assets`; `rows=0` |
| TRUNCATE | **PASS** (catalog) | `write_privs=0`; no live TRUNCATE |
| Storage upload probe | **PASS** (denied) | Live → `mime type application/octet-stream is not supported`; object not retained; `mutationsStorage=0` |
| Storage copy/move/overwrite/remove | **PASS** (catalog) | no Storage write policies for R1; no write grants on `storage.objects` |

**Catalog (supporting):**

| Check | Result |
|-------|--------|
| `write_privs` for R1 | **0** — **PASS** |
| `write_policies` for R1 | **0** — **PASS** |
| Table privileges | SELECT only on `public.beats`, `public.beat_audio_assets`, `storage.objects`, `storage.buckets` |

---

## 6. RLS / grants

| Check | Result | Evidence |
|-------|--------|----------|
| NOBYPASSRLS | **PASS** | `rolbypassrls=false`, `rolsuper=false`, `rolcanlogin=false` |
| SELECT-only grants | **PASS** | see §5 catalog |
| write_privs=0 | **PASS** | SQL count |
| write_policies=0 | **PASS** | SQL count |
| Storage SELECT policy `bucket_id='beat-audio'` | **PASS** | `far01_dryrun_readonly_select_beat_audio_objects` |
| No Storage write policy for R1 | **PASS** | policies listed: SELECT only (beats, beat_audio_assets, storage.objects) |
| Live RLS under accepted JWT | **PASS** | Data API SELECT succeeded; writes `42501` |

---

## 7. Secret hygiene

| Check | Result |
|-------|--------|
| `.env.far01.local` gitignored | **PASS** (`.gitignore` `.env*`) |
| Not git-tracked | **PASS** |
| JWT not in this audit | **PASS** |
| JWT-like blobs in tracked repo | **PASS** — none found via `git grep` |
| Legacy JWT secret in repo | **PASS** — not present |
| Authorization header in logs | **PASS** — not logged |
| Service-role as R1 | **NO** |
| Temp verify scripts removed | **PASS** |

---

## 8. Mutation counts

| Metric | Count |
|--------|-------|
| Production DB mutation | **0** |
| Production Storage mutation | **0** |

---

## 9. C-R1-01

**OPEN / ACKNOWLEDGED**

Residual: Storage SELECT policy for R1 can list/metadata within `beat-audio` (required for dry-run inventory). Full object download capability remains a residual concern tracked under C-R1-01; this Verify intentionally did not download audio bytes.

---

## 10. Service-role

| Check | Result |
|-------|--------|
| Fallback attempted | **NO** |
| R1 JWT equals service-role | **false** |
| API key equals service-role | **false** |

---

## 11. Explicit non-actions

| Action | Status |
|--------|--------|
| Production dry-run | **NOT EXECUTED** |
| Backfill / canary / fleet / retirement | **NOT EXECUTED** |
| Commit / push / deploy | **NO** |
| Schema / grant / policy changes | **NONE** |

---

## 12. Owner / next actions (outside this GO)

1. R1 credential is **VERIFIED** with **C-R1-01 OPEN**.
2. Production Dry-Run still requires a **separate Owner GO**.
3. Backfill / canary / fleet / retirement remain **blocked** until their own Owner GOs (OD-BF-08 remains NO unless separately overturned).

---

**STOP**
