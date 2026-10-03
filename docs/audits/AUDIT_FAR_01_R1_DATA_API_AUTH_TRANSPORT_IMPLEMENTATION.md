# AUDIT — FAR-01 R1 Data API Auth Transport Implementation

**Type:** Implementation audit (code + tests; no production Verify / dry-run)
**Date:** 2026-10-03
**HEAD (baseline):** `f9500b3`
**Owner GO:** IMPLEMENT R1 Data API Auth Transport
**Sources:** RCA + PLAN `*_R1_DATA_API_AUTH_TRANSPORT.md`

```text
PRODUCTION R1 VERIFY       = NOT EXECUTED (await separate GO)
PRODUCTION DRY-RUN         = NOT EXECUTED
DB / STORAGE MUTATION      = 0
SERVICE-ROLE FALLBACK      = NO
SECRETS IN THIS AUDIT      = NONE
COMMIT / PUSH / DEPLOY     = NO
```

---

## 1. Changed files (allowlist)

| File | Change |
|------|--------|
| `src/lib/beats/far01-backfill/readonly-client.ts` | Split apikey vs Authorization transport |
| `src/lib/beats/far01-backfill/far01-prod-dry-run.test.ts` | Transport / fail-closed unit tests |
| `.env.example` | Comment-only FAR-01 env contract docs |
| `docs/audits/AUDIT_FAR_01_R1_DATA_API_AUTH_TRANSPORT_IMPLEMENTATION.md` | This audit |
| `.env.far01.local` (gitignored) | Comment-only note for optional `FAR01_DRYRUN_API_KEY` — JWT not modified by intent |

**Not changed:** DB schema/grants/RLS, Storage policies, R1 role, adapters (IA-1/IA-2), mutators, batch, migrations, service-role config, production data.

---

## 2. Old transport

```ts
createClient(url, FAR01_DRYRUN_READONLY_KEY /* R1 JWT */, { auth: … })
// → apikey = R1 JWT
// → Authorization = Bearer R1 JWT
// Data API: Invalid API key (observed in Verify)
```

---

## 3. New transport

```ts
createClient(url, publishableOrAnonApiKey, {
  accessToken: async () => r1Jwt,
  auth: { persistSession: false, autoRefreshToken: false },
})
// → apikey = anon/publishable
// → Authorization = Bearer R1 JWT  (supabase-js@2.117.2 accessToken)
```

Helpers:

- `resolveFar01DryRunApiKey`
- `resolveFar01DryRunClientTransport` (enforces `apiKey !== r1Jwt`)
- `buildFar01DryRunCreateClientArgs` (testable composition)

---

## 4. Env contract

| Name | Role |
|------|------|
| `FAR01_DRYRUN_SUPABASE_URL` | URL |
| `FAR01_DRYRUN_READONLY_KEY` | R1 JWT (**Authorization only**) |
| `FAR01_DRYRUN_CREDENTIAL_CLASS=readonly` | Class gate |
| `FAR01_DRYRUN_API_KEY` | Preferred `apikey` (anon/publishable) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Allowed `apikey` fallback |

**Rejected as apikey:** service-role equality, `sb_secret_…`, equality with R1 JWT.

---

## 5. Security boundary

| Control | Status |
|---------|--------|
| R1 Postgres role unchanged | Preserved (no grant/RLS edits) |
| NOBYPASSRLS | Preserved |
| SELECT-only / write_privs=0 / write_policies=0 | Preserved |
| Service-role fallback | **NO** (explicit denies) |
| R1 JWT as apikey | **DENIED** by transport guard |
| Anon as R1 identity | **NO** — JWT via `accessToken` |
| C-R1-01 | **OPEN / ACKNOWLEDGED** |

---

## 6. Tests

| Suite | Result |
|-------|--------|
| `far01-prod-dry-run.test.ts` | **PASS** (30 tests; +transport cases) |
| `far01-backfill-blockers.test.ts` | **PASS** (29) |
| `far01-backfill.test.ts` | **PASS** (21) |
| **Total** | **80/80 PASS** |

Covered: apikey≠JWT, accessToken returns JWT, missing API key / JWT fail closed, service-role and `sb_secret_` deny, anon fallback without service-role env.

---

## 7. Typecheck / lint / build

| Check | Result |
|-------|--------|
| `tsc --noEmit` | **PASS** (run in implementation session) |
| eslint on changed FAR-01 files | **PASS** (run in implementation session) |
| `next build` | **PASS** (run in implementation session) |

---

## 8. Production mutation

| Metric | Count |
|--------|-------|
| Production DB mutation | **0** |
| Production Storage mutation | **0** |

---

## 9. Definition of Done (implementation)

| Criterion | Status |
|-----------|--------|
| anon/publishable as apikey | **YES** (code) |
| R1 JWT as Authorization via accessToken | **YES** (code) |
| R1 JWT not used as apikey | **YES** (guard + tests) |
| No service-role fallback | **YES** |
| Fail closed | **YES** |
| Storage path unchanged (same client factory) | **YES** (no inspector regression in unit suite) |
| Tests / typecheck / lint scope / build | **YES** |
| No deploy / commit | **YES** |

**Live production R1 Verify:** **NOT EXECUTED** — awaits separate Owner GO.

---

## 10. Classification

# **IMPLEMENTATION PASS** (await RE-RUN VERIFY R1)

---

**STOP — await OWNER GO — RE-RUN VERIFY R1**
