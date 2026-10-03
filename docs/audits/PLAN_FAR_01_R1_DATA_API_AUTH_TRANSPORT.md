# PLAN — FAR-01 R1 Data API Auth Transport

**Type:** Implementation plan only (no code changes in this step)
**Date:** 2026-10-03
**HEAD:** `f9500b3`
**Source RCA:** [RCA_FAR_01_R1_DATA_API_AUTH_TRANSPORT.md](./RCA_FAR_01_R1_DATA_API_AUTH_TRANSPORT.md)
**Blocked gate:** R1 Verification INCOMPLETE (Data API `Invalid API key`)

```text
THIS PLAN AUTHORIZES       = NOTHING
IMPLEMENTATION THIS STEP   = NONE
PRODUCTION DRY-RUN         = NOT EXECUTED
DB GRANTS / RLS CHANGES    = NONE REQUIRED
R1 ROLE RE-PROVISION       = NONE REQUIRED
SERVICE-ROLE               = FORBIDDEN
```

---

## 1. Goal

Minimal change so FAR-01 read-only client can:

1. Authenticate to Supabase **Data API** with a valid **project API key**, and
2. Authorize as Postgres role `far01_dryrun_readonly` via **R1 JWT** in `Authorization`.

Without elevating privileges or using service-role.

---

## 2. Current → target transport

### CURRENT (broken for Data API)

```ts
createClient(url, R1_JWT, { auth: { persistSession: false, autoRefreshToken: false } })
// → apikey: R1_JWT
// → Authorization: Bearer R1_JWT
```

### TARGET (`@supabase/supabase-js@2.117.2`)

```ts
createClient(url, publishableOrAnonApiKey, {
  accessToken: async () => r1Jwt,
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
// → apikey: publishable/anon
// → Authorization: Bearer R1_JWT  (from accessToken; no session fallback to apikey when token returned)
```

**Library basis:** `SupabaseClientOptions.accessToken` + `fetchWithAuth` in supabase-js 2.117.2 (see RCA).

**Rejected alternatives:**

| Approach | Why rejected |
|----------|----------------|
| Keep JWT as sole `createClient` key | Data API `Invalid API key` (observed) |
| Manual raw `fetch` to PostgREST | Unnecessary; SDK supports `accessToken` |
| `apikey` = service_role / `sb_secret_` | Over-privilege; forbidden |
| Change DB grants/RLS to compensate | Wrong layer |

---

## 3. Security boundary

### Separation of duties

| Credential | Layer | Privilege meaning |
|------------|-------|-------------------|
| Publishable / legacy **anon** API key | Gateway / project admission (`apikey`) | Identifies the Supabase project; **not** R1 Postgres role when Bearer JWT present |
| R1 JWT (`role=far01_dryrun_readonly`) | Authorization / Postgres role + RLS | SELECT-only identity for FAR-01 |

**Answer (explicit):** Yes — publishable/anon API key is **gateway/application identification**. With `Authorization: Bearer <R1 JWT>`, the **effective Postgres role and RLS** remain those of `far01_dryrun_readonly`, not `anon`.

### Must preserve

- R1 role, NOBYPASSRLS, SELECT-only grants
- Storage write policies absent for R1
- No service-role / secret API key
- Fail closed if API key **or** R1 JWT missing/wrong
- Deny if API key equals service-role or is `sb_secret_…`
- Existing deny: R1 JWT must not equal service-role
- C-R1-01 remains OPEN / ACKNOWLEDGED

### Does anon apikey grant extra R1 power?

**No elevation of R1 role** when Bearer is R1 JWT.
Residual: if `accessToken` were omitted/broken, requests could fall back toward anon JWT behavior (anon RLS) — mitigated by fail-closed + tests asserting Authorization uses R1 and Data API SELECT that anon alone cannot satisfy (full USER MASTER inventory).

---

## 4. Environment contract

### Keep

| Name | Meaning |
|------|---------|
| `FAR01_DRYRUN_SUPABASE_URL` | Project URL |
| `FAR01_DRYRUN_READONLY_KEY` | **R1 JWT only** (Authorization) |
| `FAR01_DRYRUN_CREDENTIAL_CLASS=readonly` | Class gate |

### Add / resolve API key (minimal)

**Preferred (explicit ops clarity):**

| Name | Meaning |
|------|---------|
| `FAR01_DRYRUN_API_KEY` | Project **publishable** or legacy **anon** key only |

**Allowed fallback (documented):** `NEXT_PUBLIC_SUPABASE_ANON_KEY` if `FAR01_DRYRUN_API_KEY` unset — same public class of key already used by the app (`getSupabasePublicEnv`), readable from `process.env` **without** importing `server-only` / `admin.ts`.

**Resolution order:**

1. `FAR01_DRYRUN_API_KEY` if present
2. else `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. else **FAIL CLOSED**

**Reject as API key:**

- `SUPABASE_SERVICE_ROLE_KEY`
- values equal to service-role
- `sb_secret_…`
- empty / placeholder

**Do not** store Legacy JWT signing secret in env for runtime.
**Do not** change R1 JWT mint role claim for this fix.

### `.env.far01.local` (gitignored) after Implementation GO

```text
FAR01_DRYRUN_SUPABASE_URL=...
FAR01_DRYRUN_CREDENTIAL_CLASS=readonly
FAR01_DRYRUN_READONLY_KEY=<R1 JWT>
FAR01_DRYRUN_API_KEY=<anon or sb_publishable_...>   # optional if NEXT_PUBLIC_SUPABASE_ANON_KEY already loaded
```

---

## 5. Files to change (implementation — future GO only)

| File | Change |
|------|--------|
| `src/lib/beats/far01-backfill/readonly-client.ts` | Resolve API key; `createClient(url, apiKey, { accessToken: async () => jwt, … })`; fail-closed rules |
| `src/lib/beats/far01-backfill/far01-prod-dry-run.test.ts` | Unit tests for env resolution, deny secret/service as API key, accessToken wiring (mock) |
| `.env.example` (optional comment only) | Document FAR01 API key names — **no secrets** |
| `docs/audits/AUDIT_FAR_01_R1_VERIFICATION.md` | After re-Verify (later) |

**Do not change (for this fix):**

| File | Reason |
|------|--------|
| `adapters/prod-db-reader.ts` | Still receives `SupabaseClient`; IA-1 OK |
| `adapters/prod-storage-inspector.ts` | IA-2 OK |
| `loader.ts` / mutators / batch | Unaffected |
| DB migrations / grants / RLS | Not required |
| R1 role provisioning | Not required |

**IA impact:**

| IA | Impact |
|----|--------|
| IA-1 / IA-2 | None (inject client) |
| IA-5 | **Yes** — credential/transport boundary |
| IA-3 / IA-4 / IA-6 | Benefit once factory fixed; no structural change required |

---

## 6. Implementation sketch (not executed now)

```ts
// Conceptual — do not apply in this step
const apiKey = resolveFar01DryRunApiKey(env); // anon/publishable only
const jwt = resolveFar01DryRunReadonlyCredentials(env).key;
return createClient(url, apiKey, {
  accessToken: async () => jwt,
  auth: { persistSession: false, autoRefreshToken: false },
});
```

Also extend equality/class guards:

- API key ≠ service role
- API key does not start with `sb_secret_`
- Keep existing JWT ≠ service role + class `readonly`

---

## 7. Test plan

### Unit

| Test | Expect |
|------|--------|
| Missing API key and missing anon fallback | FAIL CLOSED |
| Missing R1 JWT | FAIL CLOSED |
| Wrong credential class | FAIL CLOSED |
| API key = service role | FAIL CLOSED |
| API key `sb_secret_…` | FAIL CLOSED |
| JWT = service role | FAIL CLOSED (existing) |
| `createClient` called with `(url, apiKey, { accessToken })` | Contract assert via mock |

### Live / Verify R1 (after Implementation GO + Owner Verify GO)

| Test | Expect |
|------|--------|
| SELECT `beats` | Succeeds under R1 |
| SELECT `beat_audio_assets` | Succeeds under R1 |
| Storage list/HEAD `beat-audio` | Still succeeds (regression) |
| INSERT/UPDATE/DELETE/upload | Still denied; mutations = 0 |
| Secret hygiene | Unchanged |

### Explicit non-goals of test plan

- Production dry-run execution
- Backfill / canary / retirement

---

## 8. Rollback

1. Revert `readonly-client.ts` (+ tests) to prior transport.
2. No DB/Storage rollback needed (no grant changes).
3. Env: remove `FAR01_DRYRUN_API_KEY` if added; JWT unchanged.

---

## 9. Production verification sequence (later gates)

```text
Owner GO — Implement auth transport
  → unit tests green
  → Owner GO — RE-RUN VERIFY R1
  → R1 VERIFIED — WITH C-R1-01 OPEN (target)
  → Production Dry-Run Readiness Re-Audit
  → separate Execution GO for dry-run
  → OD-BF-08 remains NO
```

---

## 10. Definition of Ready — IMPLEMENTATION READY

| Condition | Status |
|-----------|--------|
| Root cause confirmed | **YES** (RCA) |
| supabase-js contract confirmed (`accessToken` @ 2.117.2) | **YES** |
| API key class = publishable/anon only | **YES** (planned) |
| R1 JWT remains Authorization credential | **YES** |
| Service-role required | **NO** |
| RLS remains active | **YES** (no policy change) |
| write privileges remain 0 | **YES** (no grant change) |
| Test plan ready | **YES** |
| DB grants/policies change needed | **NO** |
| R1 re-provisioning needed | **NO** |

# **IMPLEMENTATION READY = YES**

Await separate **Owner GO — Implement R1 Data API auth transport**.

---

## 11. Repository safety (this plan step)

| Check | Result |
|-------|--------|
| Code changed | **NO** |
| Commit / push / deploy | **NO** |
| Production mutations | **0** |
| Only docs added | RCA + this PLAN |
