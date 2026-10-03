# AUDIT — FAR-01 Canary GO Readiness (N=5)

**Type:** Canary GO readiness audit only (not Canary execution)
**Date:** 2026-10-03
**Prerequisite:** LIVE CREDENTIAL VERIFICATION = PASS
**Classification:** see §12

```text
CANARY EXECUTION                       = NOT EXECUTED
BACKFILL / FLEET / RETIREMENT          = NOT EXECUTED
DB MUTATIONS                           = 0
STORAGE MUTATIONS                      = 0
SERVICE-ROLE                           = NO
COMMIT / PUSH / DEPLOY                 = NO
```

---

## 1. Executive summary

Live production inventory was re-verified read-only via R1. Deterministic canary selection for **N=5** succeeds. Quarantine asset remains permanently excluded. LIVE credentials, A2 fail-closed gates, mutation safety, rollback design, OD-BF-03 telemetry, and stop conditions are in place.

**This audit does not authorize Canary execution.** A separate Owner Canary GO (with signed A2 artifact) is still required.

### Final classification

# **CANARY GO READINESS = READY**

| Item | Result |
|------|--------|
| N=5 | LOCKED (`FAR01_OWNER_CANARY_N`) |
| Deterministic selection | **PASS** |
| Candidates available | **5** |
| Quarantine excluded | **PASS** |
| LIVE credentials | **PASS** |
| A2 mechanism / fail-closed | **PASS** |
| Mutation gates | **PASS** |
| Rollback design | **PASS** |
| Telemetry OD-BF-03 | **PASS** |
| Stop conditions | **PASS** |
| Gate C evidence binding vs live inventory | **MATCH** |

**Blockers:** NONE

---

## 2. LIVE credentials (current env — metadata only)

| Check | Result |
|-------|--------|
| LIVE credential available | YES |
| Credential class | `live_mutator` |
| Identity (JWT role) | `far01_live_mutator` (not expired) |
| R1 credential separate | YES (`far01_dryrun_readonly` / `readonly`) |
| LIVE JWT ≠ R1 JWT | YES |
| Service-role | **NO** |
| Negative boundary (prior verification) | **PASS** |

No JWT / secret values recorded.

---

## 3. Production inventory (live re-verify)

Loaded at: `2026-10-03T04:01:23.787Z` (read-only R1 + Storage HEAD/list).

| Class | Count |
|-------|------:|
| legacy USER | **68** |
| canonical USER | **2** |
| platform | **3** |
| orphan Storage | **28** |

| Action (USER master rows) | Count |
|---------------------------|------:|
| MIGRATE | **67** |
| SKIP (canonical) | **2** |
| QUARANTINE | **1** |

Destination conflicts: **0**
Migration candidates (MIGRATE): **67**

`FAR01_GATE_C_EVIDENCE_BINDING_V1` matches live inventory on all pinned fields (legacy/canonical/platform/orphan, eligible 67, quarantine 1, canary_n 5).

---

## 4. Canary candidates (N=5) — selected, not migrated

Selection: `selectCanaryAssetIds` · sort `created_at ASC, id ASC` · `canaryLimit=5`.
Determinism: re-run on reversed input → **identical IDs**.

| # | asset_id | USER | MIGRATE | source present | dest absent | quarantine | checksum_status |
|---|----------|------|---------|----------------|-------------|------------|-----------------|
| 1 | `06f0226f-86e4-48fd-98ce-05bf333959d2` | YES | YES | YES | YES | NO | UNKNOWN |
| 2 | `5810a1a7-d494-461e-b994-a060c27f68d4` | YES | YES | YES | YES | NO | UNKNOWN |
| 3 | `2a24d6f5-f330-4d7b-93d3-05dc5a304bfa` | YES | YES | YES | YES | NO | UNKNOWN |
| 4 | `6170c8ee-cbe3-4b62-9ecc-459224869673` | YES | YES | YES | YES | NO | UNKNOWN |
| 5 | `10b7d85a-4aef-4d03-9626-e4c546f81215` | YES | YES | YES | YES | NO | UNKNOWN |

Per-candidate inventory gates: **PASS** (identity OK, not quarantine, legacy source present, canonical destination absent, MIGRATE).

Execution-time gates (AuthZ / A2 / mutation) are enforced in code at Canary GO — not executed here.

---

## 5. Quarantine (OD-BF-01)

| Item | Result |
|------|--------|
| Asset | `000d406d-265e-4e49-bd3f-a542d5dd0b41` |
| Locked constant `FAR01_LOCKED_QUARANTINE_ASSET_IDS` | YES |
| Live action | **QUARANTINE** |
| identity_anomaly | true |
| In canary selection | **NO** |
| Auto Canary/Backfill | **PERMANENTLY EXCLUDED** |

No migrate attempt.

---

## 6. Checksum evidence (OD-BF-02)

Campaign evidence: `docs/audits/evidence/far01-checksum-campaign-2026-10-03.json` (`far01-checksum-campaign-2026-10-03`).

| Item | Result |
|------|--------|
| Legacy assets processed | **68/68** |
| Observed hash available | **68** |
| Size equality | **68/68** |
| DB `checksum_sha256` | NULL for all 68 → status **UNKNOWN** |
| DB checksum persistence this audit | **NO** |
| OD-BF-02 size-only + UNKNOWN labeling | **RESPECTED** |
| Canary candidate checksum_status | UNKNOWN (eligible under OD-BF-02) |

No checksum writes. No asset modifications.

---

## 7. Mutation safety (code + config — not executed)

### Storage (`prod-storage-mutator` / `live-mutation` / `mutators`)

| Control | Status |
|---------|--------|
| Source intact (re-HEAD before COPY) | YES |
| Destination absent (re-HEAD hard stop) | YES |
| COPY `upsert: false` required | YES |
| Destination re-HEAD after COPY | YES |
| Hard stop if destination present | YES |
| Deterministic canonical destination only | YES |

### DB (`prod-db-mutator` / `gates`)

| Control | Status |
|---------|--------|
| Optimistic re-read before UPDATE | YES |
| UPDATE `object_key` only | YES |
| Optimistic lock `id` + `object_key` (+ bucket) | YES |
| Post-update verification | YES |
| No checksum / status / beat_id / owner update | YES |
| Quarantine id hard-deny | YES |

### Identity

| Control | Status |
|---------|--------|
| Exact binding (`assertFar01MutationIdentityGate`) | YES |
| Quarantine hard stop | YES |

**This audit performed zero COPY / zero UPDATE.**

---

## 8. Rollback readiness (design — not executed)

| Item | Status |
|------|--------|
| Source retention (no source delete) | YES (`planFar01Rollback` / mutator fail paths) |
| DB revert to legacy `object_key` while source exists | YES (`canRevert` when source retained) |
| No retirement dependency | YES |
| No feature-flag dependency for revert plan | YES |
| Rollback executed this audit | **NO** |

---

## 9. A2 attestation (OD-ATT-01)

| Check | Result |
|-------|--------|
| Signed GO artifact mechanism | YES (`attestation.ts`) |
| Boolean-only `backfillGo` insufficient | YES (`assertLiveGrantAuthorized`) |
| LIVE credential alone insufficient | YES (verified grant required) |
| Mode gate fail-closed (`mode !== LIVE` → DENY) | YES |
| DRY_RUN cannot execute LIVE mutation | YES |
| `od_bf_08` must be false on A2 | YES (Backfill GO separate) |
| Evidence binding matches live inventory | YES (`FAR01_GATE_C_EVIDENCE_BINDING_V1`) |

**Note:** A signed Owner Canary GO artifact is still required at Canary execution time. Readiness confirms mechanism + binding alignment only.

---

## 10. Observability (OD-BF-03)

`Far01AssetTelemetry` / `buildAssetTelemetry` / `report-archive` remnant section:

| Field | Present |
|-------|---------|
| batch_id | YES |
| asset_id | YES |
| source_key | YES |
| destination_key | YES |
| started_at | YES |
| finished_at | YES |
| status | YES |
| failure_reason | YES |
| source_size | YES |
| destination_size | YES |
| checksum_status | YES |
| DB_update_status | YES |
| retry_count | YES |

Also: per-asset audit rows · batch summary · retry/failure filters · remnant visibility in archive builder.

---

## 11. Canary stop conditions

Enforced in LIVE mutation / mutators / gates / credentials / attestation:

| Condition | Hard stop |
|-----------|-----------|
| Identity mismatch | YES |
| Destination already present | YES |
| Failed source read / missing source | YES |
| Failed destination verification | YES |
| Failed DB optimistic lock | YES |
| Failed post-update verification | YES |
| Credential gate failure | YES |
| A2 failure / missing grant | YES |
| Unexpected mutation path / wrong mode | YES |
| Quarantine asset | YES |

---

## 12. Classification

```text
CANARY GO READINESS = READY
```

**Blockers:** NONE

**Not issued by this audit:** Canary GO · Backfill GO · Fleet GO · Retirement GO.

---

## 13. Tests / typecheck / lint

| Item | Result |
|------|--------|
| Vitest `src/lib/beats/far01-backfill` | **PASS** 124/124 |
| Typecheck | **PASS** |
| ESLint (canary / live-mutation / attestation / telemetry / gates / quarantine) | **PASS** |

---

## 14. STOP

Readiness audit complete. **Canary not executed.** Awaiting Architect / Owner Canary GO.
