# PLAN — FAR-01 R1 Credential Provisioning

**Type:** Design / audit of provisioning step only
**Date:** 2026-10-03
**Baseline HEAD:** `f9500b3`
**Owner decision:** OA-2 = GO (design authorized; **provisioning not executed in this step**)
**Related:** [AUDIT_FAR_01_POST_IMPLEMENTATION.md](./AUDIT_FAR_01_POST_IMPLEMENTATION.md) · [AUDIT_FAR_01_PRODUCTION_DRY_RUN_READINESS.md](./AUDIT_FAR_01_PRODUCTION_DRY_RUN_READINESS.md) · [PLAN_FAR_01_PRODUCTION_DRY_RUN_READINESS.md](./PLAN_FAR_01_PRODUCTION_DRY_RUN_READINESS.md)

```text
THIS PLAN AUTHORIZES       = DESIGN ONLY
PROVISIONING THIS STEP     = NONE
CREDENTIALS CREATED        = NO
SQL / STORAGE OPS          = NONE
ENV CHANGED                = NO
PRODUCTION DRY-RUN         = NOT EXECUTED
BACKFILL GO / OD-BF-08     = NO
SERVICE-ROLE FALLBACK      = DENY / REJECTED
```

---

## 1. Scope

| In | Out |
|----|-----|
| Exact DB/Storage permission model for R1 | Creating roles/keys now |
| Supabase feasibility vs current RLS | Applying migrations now |
| Env contract alignment with `readonly-client.ts` | Changing IA-1…IA-6 code |
| Verification / negative-test **procedures** | Running those tests now |
| Secret storage / Git hygiene | Committing secrets |
| Rollback of credentials (not data) | Production dry-run execution |

**Code consumers (read-only):**

- `createFar01DryRunReadonlyClient` → single Supabase JS client
- DB: `createFar01ProdDbReader` / `createFar01ProdInventoryDbAux` — `from().select()` only
- Storage: `createFar01ProdStorageInspector` / `listFar01StorageObjectKeys` — `storage.from('beat-audio').list()` only
- Entrypoint: `scripts/far01-backfill-prod-dry-run.ts` (execution still needs separate Owner GO)

---

## 2. Current credential boundary

### Application contract (already implemented)

| Env name | Required value | Role |
|----------|----------------|------|
| `FAR01_DRYRUN_SUPABASE_URL` | Project API URL | Client URL |
| `FAR01_DRYRUN_READONLY_KEY` | R1 credential material | Client key / JWT |
| `FAR01_DRYRUN_CREDENTIAL_CLASS` | exactly `readonly` | Class gate |

**Fail closed:** missing URL/key · wrong class · `FAR01_DRYRUN_READONLY_KEY === SUPABASE_SERVICE_ROLE_KEY` · `FAR01_DRYRUN_USE_SERVICE_ROLE=1`.

**No fallback** to `createSupabaseAdminClient` / `SUPABASE_SERVICE_ROLE_KEY`.

### Runtime status (post-implementation audit)

| Item | Status |
|------|--------|
| R1 env names in process / `.env.local` | **ABSENT** |
| R1 Postgres role / JWT / Storage policy | **NOT PROVISIONED** |
| OA-2 | **OPEN** until provisioned + verified |

### Current Supabase posture (repo migrations — evidence)

| Surface | Today | Implication for R1 |
|---------|-------|--------------------|
| `public.beats` | RLS: published / own / staff SELECT; admin writes | Anon/authenticated **cannot** inventory all USER MASTER rows |
| `public.beat_audio_assets` | RLS: published SELECT; staff SELECT; admin writes | Same — **anon key insufficient** for FAR-01 inventory |
| `storage.buckets` `beat-audio` | **Private**; **no** SELECT policies for anon/authenticated | Storage list today requires **service_role bypass** or a **new SELECT-only policy** |
| Table GRANTs | `authenticated` has INSERT/UPDATE/DELETE on assets (RLS-gated) | R1 must use a **dedicated role** without write GRANTs |

**Conclusion:** Reusing `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` is **not** R1. A dedicated identity + grants + Storage SELECT policy is required.

---

## 3. Required DB permissions

### Tables / columns needed by code

| Table | Operations | Columns (minimum) |
|-------|------------|-------------------|
| `public.beat_audio_assets` | **SELECT** | `id, beat_id, purpose, status, storage_bucket, object_key, content_type, byte_size, checksum_sha256, is_active, replaced_by_asset_id, created_at` |
| `public.beats` | **SELECT** (join / filter) | `id, owner_id, ownership_type, status` |

### Filters used by adapters (authorization stays DB-side)

- USER MASTER inventory: `purpose=MASTER`, `storage_bucket=beat-audio`, `status IN ('READY')`, `beats.ownership_type=USER`
- Platform count: same purpose/bucket + `ownership_type=PLATFORM`
- Destination claim: `SELECT id WHERE storage_bucket=beat-audio AND object_key=?`
- Orphan aux: `SELECT object_key WHERE storage_bucket=beat-audio`

### MUST GRANT

```text
GRANT USAGE ON SCHEMA public TO far01_dryrun_readonly;
GRANT SELECT ON TABLE public.beats TO far01_dryrun_readonly;
GRANT SELECT ON TABLE public.beat_audio_assets TO far01_dryrun_readonly;
-- enum USAGE if needed for PostgREST casting (purpose/status/ownership types)
GRANT USAGE ON TYPE public.beat_audio_purpose TO far01_dryrun_readonly;
GRANT USAGE ON TYPE public.beat_audio_asset_status TO far01_dryrun_readonly;
GRANT USAGE ON TYPE public.beat_ownership_type TO far01_dryrun_readonly;
GRANT USAGE ON TYPE public.beat_status TO far01_dryrun_readonly;
```

### MUST NOT GRANT / MUST REVOKE

```text
REVOKE INSERT, UPDATE, DELETE ON public.beats FROM far01_dryrun_readonly;
REVOKE INSERT, UPDATE, DELETE ON public.beat_audio_assets FROM far01_dryrun_readonly;
-- No EXECUTE on mutation RPCs / Backfill-related functions
-- No BYPASSRLS, no SUPERUSER, no CREATEROLE
```

### RLS policies (required — table GRANT alone is insufficient under RLS)

Dedicated policies for role `far01_dryrun_readonly` only, e.g.:

- `beats`: `FOR SELECT TO far01_dryrun_readonly USING (true)`
  (or narrowed if Owner prefers; join needs ownership_type for USER+PLATFORM accounting)
- `beat_audio_assets`: `FOR SELECT TO far01_dryrun_readonly USING (storage_bucket = 'beat-audio')`
  (optional tighter: `purpose = 'MASTER'`)

**No** INSERT/UPDATE/DELETE policies for this role.

### Answer: Can DB role be SELECT-only?

**YES.** Postgres supports a login/JWT role with SELECT-only table privileges + SELECT-only RLS. This is the R1 DB model.

---

## 4. Required Storage permissions

### Code operations

| Call | Bucket | Need |
|------|--------|------|
| `storage.from('beat-audio').list(folder, { search })` | `beat-audio` | List / metadata (exists, size, contentType) |
| Recursive list under `user/` for orphans | `beat-audio` | List only |

### MUST

- Ability to **list** objects in bucket `beat-audio` (and prefixes under `user/`).
- Prefer policies that allow **SELECT** on `storage.objects` where `bucket_id = 'beat-audio'` for role `far01_dryrun_readonly` only.

### MUST NOT

- INSERT (upload)
- UPDATE (overwrite/move metadata writes)
- DELETE (remove)
- No policies enabling write for R1
- No access to other buckets (`take-audio`, `audio-artifacts`, etc.) unless explicitly denied by `bucket_id` predicate

### Can Storage be limited to “HEAD only”?

| Ideal | Supabase reality |
|-------|------------------|
| Metadata-only capability | Storage RLS models **SELECT** (list/download) vs INSERT/UPDATE/DELETE |
| Pure HEAD without byte download | **Not separately enforceable** via standard Storage policies |

**Residual (must be Owner-accepted):**
`SELECT` on `storage.objects` typically enables **download** as well as **list**. R1 therefore:

1. Enforces **list-only in application adapters** (already: no `.download` / `.upload` / `.remove` / `.copy` on inspector), **and**
2. Enforces **no write policies** at Storage RLS, **and**
3. Documents residual: byte download possible if someone abuses the same JWT outside adapters.

**Separate Storage credential?**
Not required if one JWT/role covers both PostgREST and Storage (same Supabase project key). Preferred: **single R1 identity**. Split credentials only if Owner later wants DB-only vs Storage-only keys (would need code change — out of scope unless requested).

---

## 5. Credential architecture

### REJECTED

| Option | Status |
|--------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` for dry-run | **REJECTED / OVER-PRIVILEGED** |
| “Use service-role but only in dry-run” | **DENY** (no residual acceptance on this gate) |
| Reuse anon key without new policies | **INSUFFICIENT** (incomplete inventory + no Storage list) |
| Staff user password in Git | **REJECTED** |

### PREFERRED — R1-A: Dedicated Postgres role + JWT

```text
Postgres role: far01_dryrun_readonly
  · NOSUPERUSER · NOBYPASSRLS · NOCREATEROLE · NOCREATEDB
  · SELECT-only GRANTs (§3)
  · SELECT-only RLS (§3–4)
  · Storage SELECT policy bucket_id = 'beat-audio' only

Credential material: JWT signed with project JWT secret
  · claim role = far01_dryrun_readonly
  · short TTL preferred (Owner chooses rotation)
  · stored as FAR01_DRYRUN_READONLY_KEY outside Git

FAR01_DRYRUN_SUPABASE_URL = https://<project>.supabase.co
FAR01_DRYRUN_CREDENTIAL_CLASS = readonly
```

Compatible with existing `createClient(url, key)` without IA code changes.

### ALTERNATE — R1-B: Dedicated Auth user + uid-scoped policies

Ops signs in (or mints user JWT) as a dedicated Auth user; RLS uses `auth.uid() = <fixed uuid>`. Heavier for non-interactive CLI; same SELECT-only Storage policy pattern. Acceptable if Owner prefers Auth over custom JWT role.

### Feasibility: Does Supabase allow this model?

**YES**, with Owner-applied DDL:

1. `CREATE ROLE far01_dryrun_readonly …`
2. GRANTs + REVOKE writes
3. RLS policies on `beats`, `beat_audio_assets`, `storage.objects`
4. JWT (or Auth session) presenting that role/uid

**Does not** require service-role for the dry-run client after policies exist.

**Owner note:** JWT minting/rotation uses privileged ops (JWT secret or Auth admin) **outside** the dry-run path — never embed JWT secret or service-role into FAR-01 dry-run env as the dry-run key.

---

## 6. Secret storage model

| Rule | Requirement |
|------|-------------|
| Storage location | Operator secret store / password manager / CI secret (Owner-chosen) — **not** Git |
| Allowed local | Process env or **gitignored** `.env.local` / `.env.far01.local` (confirm in `.gitignore`) |
| Forbidden | Commit of key/JWT · PR paste · audit JSON · chat logs · `docs/audits/evidence/*` |
| Lifetime | Prefer short-lived JWT + documented rotation |
| Access | Operator identity required by CLI (`--operator-id`); secret holders = minimal set |
| Audit | Log provisioning/revocation events Owner-side (who/when/why) — no secret values in logs |

---

## 7. Environment contract

Exact names required by `readonly-client.ts`:

```text
FAR01_DRYRUN_SUPABASE_URL=<project API URL>
FAR01_DRYRUN_READONLY_KEY=<R1 JWT or equivalent>
FAR01_DRYRUN_CREDENTIAL_CLASS=readonly
```

Optional ops (already supported by entrypoint, not secrets):

```text
FAR01_DRYRUN_GIT_SHA=<sha>   # or pass --git-sha
```

### Credentials that MUST NOT be used as `FAR01_DRYRUN_READONLY_KEY`

| Forbidden | Reason |
|-----------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | Over-privileged; equality DENY in code |
| Production Backfill GO private signing key | Unrelated; LIVE-only |
| Anon key without R1 policies | Insufficient / wrong class of access |
| Any key that can INSERT/UPDATE/DELETE DB or Storage write | Violates R1 |
| Values committed to repo | Git hygiene |

---

## 8. Provisioning procedure

**Status of this document:** procedure is **designed**, not executed.

### Phase P0 — Owner prerequisites

1. Confirm OA-2 design acceptance (this plan).
2. Confirm residual acceptance: Storage SELECT ⇒ download possible outside adapters (**C-R1-01**).
3. Choose R1-A (preferred) or R1-B.
4. Choose secret store + JWT TTL/rotation.
5. Issue separate **Owner GO — Provision R1** (distinct from this design GO).

### Phase P1 — Create role (Owner / privileged SQL — future GO only)

1. Create role `far01_dryrun_readonly` with restrictive attributes.
2. Apply SELECT GRANTs + REVOKE writes (§3).
3. Add SELECT-only RLS on `beats` + `beat_audio_assets`.
4. Add Storage SELECT-only policy on `storage.objects` for `bucket_id = 'beat-audio'`.
5. Confirm **no** write policies for that role.

### Phase P2 — Issue credential material (Owner)

1. Mint JWT (R1-A) or Auth session (R1-B) with role/uid bound to R1.
2. Store in secret store as `FAR01_DRYRUN_READONLY_KEY`.
3. Set `FAR01_DRYRUN_SUPABASE_URL` + `FAR01_DRYRUN_CREDENTIAL_CLASS=readonly` in operator env (not Git).
4. Confirm value ≠ service-role key.

### Phase P3 — Do not yet run production dry-run

Stop after provisioning until **Verification GO** and readiness re-audit / Execution GO.

---

## 9. Verification procedure

**Not executed in this step.** Requires separate Owner GO.

### Positive (must succeed)

| # | Test | Expected |
|---|------|----------|
| V+1 | `SELECT` via R1 client: list USER MASTER READY join beats | Rows or empty set; **no** auth error |
| V+2 | `storage.from('beat-audio').list('user', …)` via R1 | Metadata list works |
| V+3 | `resolveFar01DryRunReadonlyCredentials` with env | Accepts class `readonly` |
| V+4 | Adapter `headObject` on a known key (Owner fixture or known object) | `{ exists, size?, contentType? }` |

### Negative (must fail — prove no write)

| # | Test | Expected |
|---|------|----------|
| V−1 | `INSERT` into `beat_audio_assets` as R1 | **DENIED** |
| V−2 | `UPDATE` `object_key` on any asset as R1 | **DENIED** |
| V−3 | `DELETE` asset/beat as R1 | **DENIED** |
| V−4 | Storage `upload` to `beat-audio` as R1 | **DENIED** |
| V−5 | Storage `remove` / copy / move as R1 | **DENIED** |
| V−6 | Use `SUPABASE_SERVICE_ROLE_KEY` as `FAR01_DRYRUN_READONLY_KEY` | App **FAIL CLOSED** |
| V−7 | Missing env / wrong class | App **FAIL CLOSED** |

### Explicitly out of R1 scope (must remain unavailable)

| # | Check |
|---|-------|
| V−8 | No access to Backfill GO private signing key via R1 env |
| V−9 | No ability to issue signed GO artifact with R1 material |
| V−10 | No HTTP public backfill trigger (unchanged architecture) |

### Evidence packaging (after Verification GO)

Record pass/fail **without** pasting secrets. Store operator notes + timestamps outside Git or in redacted audit.

---

## 10. Negative security tests (catalog)

To be run **only after** Owner Verification GO:

1. DB mutation attempts (INSERT/UPDATE/DELETE) with R1 client.
2. Storage mutation attempts (upload/remove/copy/move).
3. Cross-bucket list (`take-audio`, `audio-artifacts`) → expect deny/empty.
4. Service-role equality / USE_SERVICE_ROLE flags.
5. Attempt to set `FAR01_BACKFILL_MODE=LIVE` on prod entrypoint → LIVE_REFUSED.
6. Confirm mutators still not injectable via entrypoint.
7. Confirm archive writer cannot open DB/Storage mutate APIs.

**This design step does not run them.**

---

## 11. Rollback procedure

Rollback targets **credentials/role**, not production audio/DB content.

| Step | Action |
|------|--------|
| R1 | Revoke/delete JWT / rotate JWT secret claims / ban Auth user (R1-B) |
| R2 | `DROP POLICY` R1 SELECT policies on DB + Storage |
| R3 | `REVOKE` SELECT from `far01_dryrun_readonly` |
| R4 | `DROP ROLE` (after REASSIGN/DROP OWNED if needed) |
| R5 | Remove env vars from operator machines/secret store |
| R6 | Confirm dry-run entrypoint fail-closed without credentials |

**Must not:** DELETE Storage objects · UPDATE `object_key` · retire sources · run backfill.

---

## 12. Failure modes

| Mode | Detection | Response |
|------|-----------|----------|
| R1 missing | CLI CREDENTIAL_GATE | Fail closed; do not fall back |
| R1 over-privileged (writes succeed) | Negative tests fail open | **Abort** · revoke · do not dry-run |
| Storage list denied after DB works | Inventory partial fail | Fail closed (code already) |
| Anon/staff key mis-set as R1 | Incomplete inventory or write GRANT risk | Reject in verification |
| Secret leaked to Git | Repo scan / accident | Rotate JWT · purge history if needed · incident |
| Operator runs prod dry-run before Verification | Process violation | Stop; no Execution GO yet |

---

## 13. Owner actions

| ID | Action | When |
|----|--------|------|
| OA-2-D1 | Accept this design (incl. Storage SELECT residual C-R1-01) | Now |
| OA-2-P1 | Issue **Owner GO — Provision R1** | Before any SQL/role |
| OA-2-P2 | Create role + GRANTs + RLS + Storage SELECT policy | After P1 |
| OA-2-P3 | Mint/store JWT or Auth session in secret store | After P2 |
| OA-2-P4 | Set operator env (not Git) | After P3 |
| OA-2-V1 | Issue **Owner GO — Verify R1** (positive + negative tests) | After P4 |
| OA-2-V2 | Sign off R1 VERIFIED evidence (redacted) | After V1 |
| OA-6 | Keep OD-BF-08 = NO | Continuous |

---

## 14. Cursor actions

| ID | Action | Status |
|----|--------|--------|
| CA-0 | This design document | **THIS STEP** |
| CA-1 | Assist Owner with redacted SQL/policy drafts **after** Provision GO | Blocked until GO |
| CA-2 | Assist Verification GO scripts (read-only probes / expected deny) | Blocked until Verification GO |
| CA-3 | Production dry-run readiness re-audit | After R1 VERIFIED |
| CA-4 | Production dry-run execution | **Forbidden** until separate Execution GO |

**Cursor must not** in this step: create credentials · change Supabase · change ENV · run SQL · Storage ops · dry-run · commit secrets.

---

## 15. Definition of Ready — R1 READY

All must hold:

1. Credential material exists in Owner secret store.
2. Material is **outside Git**.
3. DB permissions are SELECT-only (GRANTs + RLS).
4. Storage permissions are read (SELECT/list) only — **no** write policies.
5. `readonly-client` accepts the three env vars with class `readonly`.
6. Service-role fallback does not exist (code + ops).
7. Missing credentials → FAIL CLOSED (code — already).
8. Wrong credential class → FAIL CLOSED (code — already).
9. Verification procedure is defined (this doc §9–10).

**R1 READY ≠ R1 VERIFIED ≠ production dry-run executed.**

---

## 16. Definition of Verified — R1 VERIFIED

Requires evidence from Verification GO:

1. Positive SELECT/read test (DB).
2. Negative DB mutation attempts denied.
3. Positive Storage list/HEAD.
4. Negative Storage mutation attempts denied.
5. No Backfill GO / private signing key access via R1.
6. Proof dry-run path can operate using **only** this read capability (env wired; no admin client).

Creating a credential alone is **insufficient** for VERIFIED.

---

## 17. Production Dry-Run gate after provisioning

```text
OA-2 design (this doc)
  → Owner GO — Provision R1
  → R1 READY
  → Owner GO — Verify R1
  → R1 VERIFIED
  → PRODUCTION DRY-RUN READINESS RE-AUDIT
  → Owner GO — Execute production dry-run   ← still separate
  → Evidence archive
  → Backfill GO Review (OD-BF-08 still NO unless new Owner act)
```

Until R1 VERIFIED: production dry-run remains **blocked**.

---

## Direct answers (checklist)

| # | Question | Answer |
|---|----------|--------|
| 1 | DB permissions? | SELECT on `beats` + `beat_audio_assets` (+ enum USAGE); dedicated RLS |
| 2 | Storage permissions? | SELECT/list on `storage.objects` for `beat-audio` only |
| 3 | Supabase allows R1? | **YES** via custom role + policies + JWT/Auth |
| 4 | SELECT-only DB role? | **YES** |
| 5 | Limit Storage to metadata/HEAD? | App-level list-only; RLS = SELECT (download residual C-R1-01) |
| 6 | Separate Storage credential? | Not required; single R1 identity preferred |
| 7 | ENV names? | `FAR01_DRYRUN_SUPABASE_URL` · `FAR01_DRYRUN_READONLY_KEY` · `FAR01_DRYRUN_CREDENTIAL_CLASS=readonly` |
| 8 | Forbidden credentials? | Service-role · anon-without-policies · GO signing keys · anything with writes |
| 9 | Verify no write? | Negative mutation tests (§9–10) after Verification GO |
| 10 | Read-only verification? | Positive SELECT + Storage list (§9) |
| 11 | Prove no INSERT/UPDATE/DELETE? | V−1…V−3 must DENY |
| 12 | Prove no COPY/UPLOAD/DELETE Storage? | V−4…V−5 must DENY |
| 13 | Rollback without touching data? | Revoke JWT/policies/role/env (§11) |
| 14 | Store secret? | Operator secret store; gitignored local only |
| 15 | Avoid Git? | Never commit keys; scan; rotate on leak |

---

## Conditions

| ID | Condition |
|----|-----------|
| C-R1-01 | Storage SELECT may allow download; adapters must not download; Owner accepts residual |
| C-R1-02 | Service-role remains DENY for dry-run |
| C-R1-03 | Provisioning/verification/execution are **three separate** Owner GOs |
| C-R1-04 | Historical inventory 68/2/3/30 is never live truth |
| C-R1-05 | OD-BF-08 remains NO |

---

## Repository safety (this design step)

| Check | Result |
|-------|--------|
| Only new file | `docs/audits/PLAN_FAR_01_R1_CREDENTIAL_PROVISIONING.md` |
| Credentials created | **NO** |
| Supabase / SQL / Storage / ENV | **UNTOUCHED** |
| Code IA-1…IA-6 | **UNTOUCHED** |
| Commit / Push / Deploy | **NONE** |
| Production dry-run | **NOT EXECUTED** |

---

**PLAN COMPLETE — OA-2 DESIGNED / NOT PROVISIONED**
**NEXT = Owner accept design → Owner GO — Provision R1**
**NOT NOW = create credentials · verify against prod · run dry-run**
