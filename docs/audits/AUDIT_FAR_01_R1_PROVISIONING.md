# AUDIT — FAR-01 R1 Provisioning

**Type:** Provisioning evidence (not verification)
**Date:** 2026-10-03
**Baseline HEAD:** `f9500b3`
**Owner GO:** **GO — PROVISION R1** (separate from Verify / Dry-Run Execution / Backfill GO)

```text
PROVISIONING THIS STEP     = ROLE + GRANTS + RLS + STORAGE SELECT POLICY
VERIFY R1                  = NOT EXECUTED
PRODUCTION DRY-RUN         = NOT EXECUTED
SERVICE-ROLE AS R1 KEY     = REJECTED / NOT USED
SECRETS IN REPO / OUTPUT   = NONE (values redacted)
BACKFILL GO / OD-BF-08     = NO
APPLICATION DATA MUTATION  = NONE
STORAGE OBJECT MUTATION    = NONE
```

---

## 1. Scope

| In | Out |
|----|-----|
| Create `far01_dryrun_readonly` | Verify R1 positive/negative tests |
| SELECT-only DB + Storage grants/policies | Production dry-run / inventory refresh |
| Env **names** + non-secret URL/class wiring | Minting/printing JWT/key values |
| Minimal migration | IA-1…IA-6 code changes |
| C-R1-01 residual acknowledgment | Backfill / canary / retirement |

---

## 2. Owner GO

| Gate | Status |
|------|--------|
| GO — PROVISION R1 | **EXECUTED** (this step) |
| GO — VERIFY R1 | **NOT GRANTED / NOT EXECUTED** |
| Production Dry-Run Execution GO | **NOT GRANTED** |
| Backfill GO / OD-BF-08 | **NO** |

---

## 3. R1 role

| Attribute | Value | Evidence |
|-----------|-------|----------|
| Role name | `far01_dryrun_readonly` | `pg_roles` |
| Present | **YES** | SQL inspect after migration |
| LOGIN | **NO** (`NOLOGIN`) | JWT role-switch via authenticator |
| SUPERUSER | **NO** | |
| BYPASSRLS | **NO** | |
| CREATEROLE / CREATEDB | **NO** | |
| Granted to `authenticator` | **YES** | `pg_has_role(...)=true` |

Migration:

- Remote: applied via Supabase `apply_migration` name `far01_r1_dryrun_readonly_role`
- Repo file: `supabase/migrations/20261003010000_far01_r1_dryrun_readonly_role.sql`

---

## 4. DB grants

| Object | Privilege | Notes |
|--------|-----------|-------|
| `public.beats` | **SELECT** only | Inventory join / ownership |
| `public.beat_audio_assets` | **SELECT** only | Filtered by RLS to `storage_bucket='beat-audio'` |
| Enum USAGE | beat_status, beat_ownership_type, beat_audio_purpose, beat_audio_asset_status | PostgREST casting |
| INSERT / UPDATE / DELETE / TRUNCATE on those tables | **NONE** for R1 | Confirmed absent in `table_privileges` |

RLS policies (SELECT only):

| Policy | Table | CMD |
|--------|-------|-----|
| `far01_dryrun_readonly_select_beats` | `public.beats` | SELECT |
| `far01_dryrun_readonly_select_beat_audio_assets` | `public.beat_audio_assets` | SELECT (`storage_bucket = 'beat-audio'`) |

Write policies for R1: **0**.

---

## 5. Storage grants

| Object | Privilege | Scope |
|--------|-----------|-------|
| `storage.buckets` | SELECT | Required for Storage API |
| `storage.objects` | SELECT | Metadata/list |
| Write privileges on storage tables for R1 | **NONE** | REVOKE applied |

RLS:

| Policy | Table | CMD | Predicate |
|--------|-------|-----|-----------|
| `far01_dryrun_readonly_select_beat_audio_objects` | `storage.objects` | SELECT | `bucket_id = 'beat-audio'` |

No INSERT/UPDATE/DELETE/ALL policies for R1.
No other buckets authorized.

---

## 6. Credential configuration

| Item | Status |
|------|--------|
| Credential class target | `readonly` |
| Env names (contract) | `FAR01_DRYRUN_SUPABASE_URL` · `FAR01_DRYRUN_READONLY_KEY` · `FAR01_DRYRUN_CREDENTIAL_CLASS` |
| URL configured (gitignored local template) | **YES** — project API URL (public project URL) |
| Class configured in template | **YES** — `readonly` |
| `FAR01_DRYRUN_READONLY_KEY` value | **NOT PROVISIONED** — JWT mint requires project JWT secret (not available in agent secure channel without Owner) |
| Service-role used as R1 key | **NO** |
| `createSupabaseAdminClient` as dry-run client | **NO** |

**Owner action remaining (before Verify / dry-run):**

Mint a JWT with claim `role = far01_dryrun_readonly` (signed with project JWT secret from Supabase Dashboard → Settings → API). Place **only** in gitignored operator env (e.g. `.env.far01.local`, already gitignored by `.env*`). Never commit or paste into audits/chat.

Template file (no secret value): `.env.far01.local` (gitignored).

---

## 7. Secret handling

| Rule | Result |
|------|--------|
| Secret in Git | **NO** |
| Secret in this audit | **NO** (REDACTED / unset) |
| Secret printed to terminal by agent | **NO** |
| Service-role copied into R1 env | **NO** |
| JWT secret used in repo files | **NO** |

---

## 8. C-R1-01 residual

**Status: OPEN / ACKNOWLEDGED**

Storage SELECT on `storage.objects` for `beat-audio` may technically allow **download** via Storage API, not only list/HEAD.

Mitigation remains **adapter capability boundary** (`prod-storage-inspector` exposes `list`/HEAD mapping only — no `.download` / `.upload` / `.remove` / `.copy`).

Not expanded. Not “fixed” by broader privileges.

---

## 9. Security boundary

```text
ALLOW (R1):
  DB SELECT on beats + beat_audio_assets (beat-audio rows)
  Storage SELECT/list metadata on beat-audio

DENY (R1):
  DB INSERT/UPDATE/DELETE/TRUNCATE
  Storage UPLOAD/COPY/DELETE/MOVE/OVERWRITE policies
  Other buckets
  BYPASSRLS / SUPERUSER
  Service-role-as-R1
  Backfill GO / signing keys / mutators / HTTP backfill trigger
```

Application data rows and Storage objects were **not** modified by this provisioning step.

---

## 10. Evidence

| Evidence item | Result |
|---------------|--------|
| Role created/present | **YES** |
| Grant summary | SELECT-only on `beats`, `beat_audio_assets`, `storage.buckets`, `storage.objects` |
| Storage permission summary | SELECT policy `bucket_id='beat-audio'` only; 0 write policies |
| Credential class configured | `readonly` (template + contract) |
| ENV names present (template) | URL + CLASS yes; KEY unset |
| Secret value | **REDACTED / NOT SET** |
| Service-role fallback | **NO** |
| Migration file | `supabase/migrations/20261003010000_far01_r1_dryrun_readonly_role.sql` |
| Remote migration applied | **YES** (`far01_r1_dryrun_readonly_role`) |

---

## 11. Verification NOT YET PERFORMED

Explicitly **not** executed in this step:

- Positive SELECT / Storage HEAD / inventory read as formal Verify
- Negative DB INSERT/UPDATE/DELETE
- Negative Storage COPY/UPLOAD/DELETE
- Formal service-role fallback denial against live R1 key
- Production dry-run
- Production inventory refresh

---

## 12. Remaining gate

```text
NEXT = OWNER GO — VERIFY R1

Prerequisites for Verify:
  1) Owner mints FAR01_DRYRUN_READONLY_KEY (JWT role=far01_dryrun_readonly)
  2) Operator env complete (URL + KEY + CLASS=readonly)
  3) Secret still outside Git

THEN (later, separate GOs):
  PRODUCTION DRY-RUN READINESS RE-AUDIT
  OWNER GO — Execute production dry-run
  (OD-BF-08 remains NO)
```

---

## 13. Final classification

# **R1 PROVISIONED — VERIFICATION PENDING**

**Not** R1 VERIFIED.
**Not** production dry-run ready solely by this step (JWT key material still Owner-supplied).
**Not** Backfill GO.

| Component | Status |
|-----------|--------|
| Role / grants / RLS / Storage SELECT policy | **PROVISIONED** |
| Runtime JWT/key secret | **NOT PROVISIONED** (Owner mint required) |
| Verify R1 | **PENDING** |

---

## Repository safety

| Check | Result |
|-------|--------|
| Code IA-1…IA-6 | **UNTOUCHED** |
| App data / object_keys / Storage objects | **UNTOUCHED** |
| Commit / Push / Deploy | **NONE** this step |
| Secrets committed | **NO** |

---

**STOP — await OWNER GO — VERIFY R1**
