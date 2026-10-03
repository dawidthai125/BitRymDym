# RCA — FAR-01 R1 Data API Auth Transport

**Type:** Root-cause analysis only (no implementation)
**Date:** 2026-10-03
**HEAD:** `f9500b3`
**Related:** [AUDIT_FAR_01_R1_VERIFICATION.md](./AUDIT_FAR_01_R1_VERIFICATION.md) · [PLAN_FAR_01_R1_CREDENTIAL_PROVISIONING.md](./PLAN_FAR_01_R1_CREDENTIAL_PROVISIONING.md)
**Owner GO:** RCA + PLAN for Data API auth transport blocker

```text
THIS RCA AUTHORIZES        = NOTHING
IMPLEMENTATION             = NONE
PRODUCTION DRY-RUN         = NOT EXECUTED
DB / STORAGE MUTATION      = 0
SERVICE-ROLE               = NOT REQUIRED / FORBIDDEN as R1
```

---

## 1. Symptom

R1 live verification:

| Surface | Result |
|---------|--------|
| JWT identity `role=far01_dryrun_readonly` | Confirmed (payload decode) |
| Storage `beat-audio` list/metadata | Succeeded |
| Data API SELECT `public.beats` | Failed |
| Data API SELECT `public.beat_audio_assets` | Failed |

Operator-visible error from PostgREST/Data API path:

```text
Invalid API key
```

Client under test matched production dry-run factory:

`createFar01DryRunReadonlyClient` → `createClient(url, FAR01_DRYRUN_READONLY_KEY)`.

---

## 2. Observed error

| Field | Value |
|-------|-------|
| Error text | `Invalid API key` |
| Surfaces | `.from('beats').select…` · `.from('beat_audio_assets').select…` |
| Same JWT as Storage test | Yes |
| Mutations from failed SELECT | None |

---

## 3. Exact current client contract (code evidence)

**File:** `src/lib/beats/far01-backfill/readonly-client.ts`

```ts
return createClient(creds.url, creds.key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
```

Where `creds.key` = `FAR01_DRYRUN_READONLY_KEY` = R1 custom JWT (`role=far01_dryrun_readonly`).

**Consumers of that client (unchanged inject-only adapters):**

| Module | Role |
|--------|------|
| `adapters/prod-db-reader.ts` | `Far01DbReader` SELECT |
| `adapters/prod-storage-inspector.ts` | Storage list/HEAD |
| `prod-dry-run.ts` `buildDefaultPorts` | Wires single client to DB + Storage + inventory aux |

**Library version:** `@supabase/supabase-js@2.117.2` (resolved).

### What supabase-js sends (library evidence)

From `node_modules/@supabase/supabase-js/src/lib/fetch.ts` `fetchWithAuth`:

1. Always sets `apikey` = `supabaseKey` (2nd arg to `createClient`) when header absent.
2. Sets `Authorization: Bearer <token>` where token = session/`accessToken` result, else falls back to `supabaseKey`.

With **current** FAR-01 factory (no `accessToken` option, no session):

| Header | Value today |
|--------|-------------|
| `apikey` | **R1 JWT** |
| `Authorization` | **Bearer R1 JWT** |

Both layers currently carry the custom-role JWT. There is **no** project publishable/anon API key in the request.

---

## 4. Why Storage can succeed while Data API fails

**Confirmed observation:** same client, Storage list returned entries; Data API returned `Invalid API key`.

**Interpretation (gateway asymmetry — not a grants/RLS contradiction):**

- Supabase **API gateway / Kong** validates `apikey` against **project API keys** (legacy anon/service JWT keys and/or `sb_publishable_…` / `sb_secret_…`).
- A custom Postgres-role JWT (`role=far01_dryrun_readonly`) is **not** a project API key. Data API (PostgREST via `/rest/v1`) rejects it as `Invalid API key` **before** RLS evaluation.
- Storage (`/storage/v1`) was observed to accept the same request sufficiently to list under `beat-audio`. That does **not** prove the R1 JWT is a valid project API key; it shows **path-dependent gateway behavior**. It also does **not** prove Authorization-vs-apikey split is unnecessary for Data API.

**Not claimed without further probe:** exact Kong rule table for Storage vs REST. Not required to fix Data API: REST failure + library header contract are sufficient for root cause of the SELECT failure.

---

## 5. Root cause

**Root cause:** Auth **transport mismatch**.

FAR-01 places the R1 JWT in `createClient`’s **API key** slot. Data API requires a **project API key** in `apikey` and expects the caller JWT (here: R1 custom role) in `Authorization: Bearer …`.

Therefore Data API never reaches R1 RLS/GRANTs for SELECT; it fails at API-key validation.

```text
CURRENT (broken for Data API):
  apikey        = R1 JWT          ← invalid project API key
  Authorization = Bearer R1 JWT

REQUIRED (target):
  apikey        = publishable/anon (low-privilege project API key)
  Authorization = Bearer R1 JWT   ← Postgres role / RLS identity
```

---

## 6. Contributing factors

1. R1 provisioning designed a **custom Postgres role JWT** (correct for RLS).
2. `readonly-client` assumed that JWT alone could fill the supabase-js **key** parameter (incorrect for current Data API gateway).
3. Live Verify exercised the real factory path and exposed the mismatch.
4. Storage success masked the issue until Data API was tested.
5. No separate API-key env was defined in the original R1 env contract.

---

## 7. Security impact

| Topic | Assessment |
|-------|------------|
| Is R1 over-privileged? | **No evidence** — grants/policies still SELECT-only; writes denied |
| Does failure hide a privilege bug? | **No** — failure is admission control, not silent elevation |
| Risk of “fix” by using service-role as apikey | **High / forbidden** — must remain DENY |
| Risk of using anon as apikey | **Acceptable if** Authorization is always R1 JWT; anon alone is publishable and RLS-limited; must not replace R1 JWT |
| Residual C-R1-01 | Unchanged (Storage SELECT may allow download) |

---

## 8. Why this is NOT an R1 provisioning failure

| Provisioned item | Status |
|------------------|--------|
| Role `far01_dryrun_readonly` | Present |
| SELECT grants / RLS SELECT policies | Present |
| Storage SELECT policy `beat-audio` | Present |
| write_privs / write_policies | 0 |
| JWT `role` claim | Correct |

Provisioning succeeded. The **client transport** does not present credentials in the shape Data API requires.

---

## 9. Why this is NOT a DB grants / RLS failure

Data API returns `Invalid API key` — a **gateway/API-key** error, not `42501` / RLS denial / empty RLS result.

Catalog still shows SELECT-only privileges and zero write policies. No grant change is indicated by this symptom.

---

## 10. Recommended correction (design only)

Use `@supabase/supabase-js@2.117.2` supported option `accessToken`:

```ts
createClient(url, publishableOrAnonApiKey, {
  accessToken: async () => r1Jwt,
  auth: { persistSession: false, autoRefreshToken: false },
});
```

Library behavior (`fetchWithAuth` + `_getSessionToken`):

| Header | Value after fix |
|--------|-----------------|
| `apikey` | publishable/anon API key |
| `Authorization` | `Bearer` + R1 JWT from `accessToken` |

**Do not** use `SUPABASE_SERVICE_ROLE_KEY` / `sb_secret_…` as the API key.
**Do not** change R1 JWT role claim or re-provision role/grants for this fix.

---

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Omitting `accessToken` → requests run as `anon` | Fail closed if R1 JWT missing; tests that SELECT requires R1 |
| Using service-role/secret as apikey | Explicit deny in resolver |
| Confusing env names | Keep `FAR01_DRYRUN_READONLY_KEY` = JWT only; separate API key source |
| Storage regression | Re-test list/HEAD after change |
| Importing `server-only` into CLI path | Prefer reading `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` or dedicated FAR01 API key env without `admin.ts` |

---

## 12. Verification plan (after future Implementation GO)

1. Positive Data API SELECT `beats` + `beat_audio_assets` via factory.
2. Storage list/HEAD regression on `beat-audio`.
3. Negative write boundary still denies; mutations = 0.
4. Fail closed: missing API key, missing JWT, wrong class, service-role/secret as API key.
5. Confirm JWT not used as `apikey` (optional header-level unit with mocked fetch).
6. Re-run **VERIFY R1** → aim `R1 VERIFIED — WITH C-R1-01 OPEN`.
7. Still no production dry-run without separate Execution GO.

---

## 13. RCA status

**RCA: COMPLETE**

Root cause confirmed from: live Verify evidence + `readonly-client.ts` contract + supabase-js `fetchWithAuth` / `accessToken` implementation at v2.117.2.
