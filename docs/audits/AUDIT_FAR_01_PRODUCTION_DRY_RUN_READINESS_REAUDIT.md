# AUDIT — FAR-01 Production Dry-Run Readiness RE-AUDIT

**Type:** Readiness re-audit only (not execution)
**Date:** 2026-10-03
**Owner GO:** PRODUCTION DRY-RUN READINESS RE-AUDIT
**Prior audit:** `AUDIT_FAR_01_PRODUCTION_DRY_RUN_READINESS.md` → **NOT READY**
**This re-audit:** evaluates closure of B-PDR-01…06 after IA adapters + R1 Verify + transport fix

```text
GIT HEAD (committed)       = f9500b3
WORKING TREE               = f9500b3 + uncommitted FAR-01 IA / R1 / transport
R1 VERIFICATION            = VERIFIED (WITH C-R1-01 OPEN)
PRODUCTION DRY-RUN         = NOT EXECUTED
BACKFILL / CANARY / FLEET  = NOT EXECUTED
PRODUCTION DB MUTATION     = 0
PRODUCTION STORAGE MUTATION= 0
THIS AUDIT AUTHORIZES      = NOTHING
COMMIT / PUSH / DEPLOY     = NO
```

**AUDIT ≠ EXECUTE DRY-RUN ≠ BACKFILL GO ≠ CANARY ≠ FLEET ≠ RETIREMENT**

---

## 1. Executive status

# **PRODUCTION DRY-RUN READY**

Capability path for a **read-only** production dry-run is present in the current workspace, proven by:

- code (adapters + entrypoint + archive + R1 client transport),
- live R1 Verify (Data API SELECT + Storage list + write DENY `42501`),
- live read-only inventory refresh (this re-audit).

**Explicit recommendation:** Owner **may** issue a separate **EXECUTE PRODUCTION DRY-RUN** GO.
**This re-audit does not authorize that execution.**

| Gate | Status |
|------|--------|
| Backfill GO (OD-BF-08) | **NO** |
| Canary / Fleet / Retirement | **NO** |
| Execute production dry-run | **Awaits separate Owner GO** |

---

## 2. Baseline

| Item | Value | Evidence class |
|------|-------|----------------|
| Committed HEAD | `f9500b3` harden FAR-01 backfill execution | CODE / GIT |
| Required dry-run path files | Present **locally** (many still uncommitted) | CODE |
| Historical inventory 68/2/3/30 | Baseline only — **not** live truth | DOCUMENTATION |
| Live inventory (this re-audit) | 68 / 2 / 3 / **28** orphans | LIVE READ |
| R1 role | `far01_dryrun_readonly` | LIVE + SCHEMA |
| Transport | apikey=anon/publishable; Authorization=Bearer R1 JWT | CODE + LIVE VERIFY |
| Prior readiness | NOT READY (adapters/CLI/creds/inventory missing) | PRIOR AUDIT |

**Execution note (condition, not PDR reopen):** Operator dry-run **must** run from a tree that includes the uncommitted IA/R1/transport files (or an equivalent commit). Bare `f9500b3` alone lacks adapters and correct Data API transport.

---

## 3. R1 evidence (verified baseline)

Source: `docs/audits/AUDIT_FAR_01_R1_VERIFICATION.md` (RE-RUN after transport fix).

| Check | Result |
|-------|--------|
| Identity `role=far01_dryrun_readonly`, class `readonly` | **PASS** |
| Data API SELECT `beats` / `beat_audio_assets` | **PASS** |
| Storage list `beat-audio` | **PASS** |
| INSERT/UPDATE/DELETE | **DENIED** (`42501`) |
| NOBYPASSRLS / write_privs=0 / write_policies=0 | **PASS** |
| Service-role fallback | **NO** |
| Mutations | **0** |
| C-R1-01 | **OPEN / ACKNOWLEDGED** |

Transport confirmed:

- `apikey` ≠ R1 JWT
- `Authorization` = Bearer R1 JWT via `accessToken`

---

## 4. Current inventory evidence (B-PDR-06)

**Method:** read-only `refreshFar01Inventory` via production adapters + R1 client.
**Not executed:** production dry-run archive, batch ops GO, mutations.

| Metric | Historical baseline | Live (2026-10-02T23:35:14.330Z) | Δ |
|--------|--------------------:|--------------------------------:|--:|
| legacy_user | 68 | **68** | 0 |
| canonical_user | 2 | **2** | 0 |
| platform | 3 | **3** | 0 |
| orphan_storage | 30 | **28** | **−2** |

| Live loader snapshot | Value |
|----------------------|------:|
| user_master_rows | 70 |
| candidate_count | 70 |
| destination_conflicts | 0 |
| Action MIGRATE | 67 |
| Action SKIP | 2 |
| Action QUARANTINE | 1 |
| elapsed_ms | ~58029 |
| DB / Storage mutations | **0** |

**Delta documentation only — no auto-repair.** Orphan count reduced by 2 vs historical Phase 0 closeout; treat historical 30 as stale.

---

## 5. B-PDR blocker matrix

| ID | Prior | Current | Evidence | Status |
|----|-------|---------|----------|--------|
| **B-PDR-01** production DB reader | OPEN | `adapters/prod-db-reader.ts` SELECT-only; used by inventory refresh; R1 live SELECT PASS | CODE + LIVE | **CLOSED** |
| **B-PDR-02** Storage HEAD | OPEN | `adapters/prod-storage-inspector.ts` metadata/`list` only; inventory refresh HEADs; R1 Storage PASS | CODE + LIVE | **CLOSED** |
| **B-PDR-03** prod dry-run entrypoint | OPEN | `scripts/far01-backfill-prod-dry-run.ts` + `prod-dry-run.ts`; LIVE/`--live` refused; mutators not wired | CODE + UNIT | **CLOSED** |
| **B-PDR-04** loader → DRY_RUN archive | OPEN | `report-archive.ts` + `runFar01ProdDryRun` composition; unit tests force DRY_RUN / `live_mutations_attempted=0` | CODE + UNIT | **CLOSED** |
| **B-PDR-05** read-scoped credentials | OPEN | R1 role + live Verify + transport; no service-role fallback | LIVE + CODE | **CLOSED** |
| **B-PDR-06** current inventory | OPEN | Live refresh §4 | LIVE READ | **CLOSED** |

No PDR blocker remains **OPEN**.

---

## 6. Security review (read-only)

| Area | Result | Notes |
|------|--------|-------|
| Identity | **PASS** | JWT claim `far01_dryrun_readonly` |
| AuthZ / RLS | **PASS** | SELECT policies; writes `42501`; NOBYPASSRLS |
| IDOR / path binding | **PASS** | Mapping + preflight identity; quarantine path |
| Storage boundary | **PASS** | bucket `beat-audio`; inspector has no upload/copy/move/delete API |
| Credentials | **PASS** | R1 + anon apikey; service-role denied |
| Secret handling | **PASS** | `.env.far01.local` gitignored; archive secret scanners |
| Mutation boundary | **PASS** | Dry-run omits mutators; LIVE requires A2 grant |
| Replay / expiry | **PASS** (LIVE) | Signed GO `expires_at` |
| Archive leakage | **PASS** (design) | Secret key/value refuse |
| Fail closed | **PASS** | Missing URL/JWT/API key / LIVE flags |
| C-R1-01 residual Storage SELECT breadth | **OPEN / ACKNOWLEDGED** | Not a PDR reopen |

---

## 7. Attestation review (A2)

| Check | Result |
|-------|--------|
| Boolean `backfillGo` alone insufficient | **PASS** (code) |
| Ed25519 signed artifact required for LIVE | **PASS** |
| Scope / issuer / expiry / signature DENY | **PASS** |
| Required for DRY_RUN execution? | **N/A** — dry-run uses default deny auth; no GO artifact |
| C-ATT-01 (`Symbol.for` brand residual) | **CONDITIONAL** — retained for LIVE; not a dry-run blocker |
| New attestation minted this audit | **NO** |

**A2 attestation (for readiness of gate):** **PASS** (mechanism correct; unused by dry-run path).

---

## 8. Canary gate review

| Check | Result |
|-------|--------|
| OD-CANARY-N = 5 | **PASS** (`FAR01_OWNER_CANARY_N`) |
| Pipeline DRY_RUN → CANARY → VERIFY → APPROVAL → FLEET | **PASS** (library) |
| null / 0 / non-int / >inventory DENY | **PASS** |
| FLEET without VERIFY/APPROVAL DENY | **PASS** |
| Canary executed | **NO** (correct) |

**Canary gate:** **PASS** (pre-LIVE controls; not required before dry-run).

---

## 9. Mutation gate review

| Check | Result |
|-------|--------|
| `upsert: false` contract | **PASS** |
| Preflight / mutation split | **PASS** |
| Mandatory re-HEAD before DB | **PASS** (LIVE path) |
| Optimistic lock SQL helper | **PASS** (`object_key = source`) |
| Source retained / no retirement | **PASS** (`planFar01Rollback`) |
| Dry-run wires mutators? | **NO** — omitted in `runFar01ProdDryRun` |
| Mutator executed this audit | **NO** |

**Mutation gate:** **PASS**.

---

## 10. Dry-run entrypoint review

| Check | Result |
|-------|--------|
| Forced `mode: "DRY_RUN"` | **PASS** |
| `--live` / `FAR01_*_MODE=LIVE` → exit 2 | **PASS** |
| `liveRequested` → `LIVE_REFUSED` | **PASS** |
| No storageMutator / dbMutator | **PASS** |
| Credential resolve fail-closed | **PASS** |
| Inventory refresh before batch | **PASS** |
| Archive after batch | **PASS** (composition) |
| Auto Backfill GO | **NO** |
| Env auto-load `.env.far01.local` | **NOT IN SCRIPT** — operator must export env (condition) |

**Dry-run entrypoint:** **PASS**.

---

## 11. Archive / telemetry integrity review

Required per-asset fields present on `Far01AssetTelemetry` / archive:

| Field | Present |
|-------|---------|
| batch_id | **YES** |
| asset_id | **YES** |
| source_key / destination_key | **YES** |
| started_at / finished_at | **YES** |
| status / failure_reason | **YES** |
| source_size / destination_size | **YES** |
| checksum_status | **YES** |
| DB_update_status | **YES** |
| retry_count | **YES** |
| per-asset + summary + failures/retries/remnant | **YES** |
| live_mutations_attempted = 0 enforced | **YES** |
| secret refuse | **YES** |
| durable path `docs/audits/evidence/<batch>.json` (`wx`) | **YES** |

Ops archive artifact from authorized run: **not produced** (execution GO not granted).

**Archive:** **PASS** (capability).

---

## 12. Credential review

| Check | Result |
|-------|--------|
| R1 SELECT-only | **PASS** (live + grants) |
| Storage read-only for R1 | **PASS** (policy + live upload DENY) |
| bucket = beat-audio | **PASS** |
| service-role / admin / elevated fallback | **NO** |
| Alternate credential path in prod dry-run | **NO** (ports injectable for tests only) |
| Live R1 sufficient to enter dry-run | **YES** |

**Credential scope:** **PASS**.

---

## 13. Remaining conditions (not PDR reopen)

| ID | Condition |
|----|-----------|
| **C-PDR-R01** | Execute using workspace code that includes IA adapters + R1 transport (not bare `f9500b3`) |
| **C-PDR-R02** | Operator must supply env: `FAR01_DRYRUN_SUPABASE_URL`, `FAR01_DRYRUN_READONLY_KEY`, `FAR01_DRYRUN_CREDENTIAL_CLASS=readonly`, and anon/publishable apikey (`FAR01_DRYRUN_API_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — script does not load `.env.far01.local` itself |
| **C-PDR-R03** | Pass `--operator-id` and `--git-sha` (prefer SHA that identifies the executed tree) |
| **C-PDR-R04** | C-R1-01 remains **OPEN / ACKNOWLEDGED** |
| **C-PDR-R05** | OD-BF-08 Backfill GO remains **NO** through and after dry-run |
| **C-PDR-R06** | Live orphan count is **28** (not historical 30) — report must use live inventory |
| **C-PDR-R07** | Separate Owner GO required: **EXECUTE PRODUCTION DRY-RUN** |
| **C-ATT-01** | Symbol.for brand residual — LIVE only |

---

## 14. Explicit GO / NO-GO recommendation

| Decision | Recommendation |
|----------|----------------|
| Production Dry-Run **capability** | **GO / READY** |
| **EXECUTE** Production Dry-Run now | **NO-GO** until separate Owner GO |
| Backfill GO | **NO-GO** |
| Canary / Fleet / Retirement | **NO-GO** |

```text
NEXT ≠ automatic dry-run
NEXT ≠ Backfill GO
NEXT = OWNER GO — "EXECUTE PRODUCTION DRY-RUN"
        (read-only · R1 · archive evidence · OD-BF-08 still NO)
```

---

## 15. Definition of Ready checklist

| Criterion | Met? |
|-----------|------|
| R1 live verified | **YES** |
| Current inventory refresh works | **YES** (live) |
| DB reader works | **YES** |
| Storage HEAD works | **YES** |
| Production entrypoint exists | **YES** |
| DRY_RUN forced / LIVE refused | **YES** |
| Archive works | **YES** (code+unit) |
| Telemetry fields complete | **YES** |
| A2 attestation gate correct | **YES** |
| Canary gate correct | **YES** |
| Mutation gate correct | **YES** |
| Rollback path documented | **YES** |
| Credentials least privilege | **YES** |
| No service-role | **YES** |
| No open PDR blockers | **YES** |
| Owner execution parameters known | **YES** (§13) |

---

## 16. Explicit non-actions (this re-audit)

| Action | Status |
|--------|--------|
| Production dry-run archive run | **NOT EXECUTED** |
| Backfill / canary / fleet / retirement | **NOT EXECUTED** |
| DB / Storage mutation | **0** |
| Commit / push / deploy | **NO** |

---

## Repository safety

| Check | Result |
|-------|--------|
| New file this audit | `docs/audits/AUDIT_FAR_01_PRODUCTION_DRY_RUN_READINESS_REAUDIT.md` |
| Temp inventory script | Removed after run |
| Secrets in audit | **NONE** |

---

**PRODUCTION DRY-RUN READINESS RE-AUDIT COMPLETE**
**CLASSIFICATION: PRODUCTION DRY-RUN READY**
**EXECUTION: AWAITS SEPARATE OWNER GO — EXECUTE PRODUCTION DRY-RUN**
**BACKFILL GO: NO**

**STOP**
