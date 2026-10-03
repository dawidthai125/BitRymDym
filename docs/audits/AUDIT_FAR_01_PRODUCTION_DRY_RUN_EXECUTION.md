# AUDIT — FAR-01 Production Dry-Run Execution

**Type:** Authorized production dry-run execution evidence
**Owner GO:** EXECUTE PRODUCTION DRY-RUN
**Execution timestamp (batch):** `2026-10-02T23:37:58.039Z` → `2026-10-02T23:37:58.041Z`
**Inventory loaded_at:** `2026-10-02T23:37:58.037Z`

```text
MODE                       = DRY_RUN (forced)
LIVE / --live              = NOT USED
BACKFILL GO (OD-BF-08)     = NO
CANARY / FLEET / RETIREMENT= NOT EXECUTED
SERVICE-ROLE FALLBACK      = NO
PRODUCTION DB MUTATION     = 0
PRODUCTION STORAGE MUTATION= 0
live_mutations_attempted   = 0
SECRETS IN THIS AUDIT      = NONE
COMMIT / PUSH / DEPLOY     = NO
```

---

## 1. Owner GO reference

| Field | Value |
|-------|-------|
| Decision | **GO — EXECUTE PRODUCTION DRY-RUN** |
| Scope | Read-only inventory + analysis + durable archive |
| Explicitly not authorized | Backfill · Canary · Fleet · Retirement · legacy/orphan cleanup |

---

## 2. Execution timestamp / identity of run

| Field | Value |
|-------|-------|
| batch_id | `far01-bf-2026-10-02T23-37-58-039Z` |
| started_at | `2026-10-02T23:37:58.039Z` |
| finished_at | `2026-10-02T23:37:58.041Z` |
| operator_id | `owner-prod-dry-run-2026-10-03` |
| Entrypoint | `scripts/far01-backfill-prod-dry-run.ts` → `runFar01ProdDryRun` |

---

## 3. Commit / HEAD

| Field | Value |
|-------|-------|
| Committed HEAD | `f9500b321735cfa705565bc73c7ab7016c3808fd` |
| Archive `git_sha` | `f9500b321735cfa705565bc73c7ab7016c3808fd+uncommitted-ia-r1-transport` |
| Environment | Operator local workspace targeting production Supabase (URL via R1 env; value not logged) |

**Deviation:** Execution used uncommitted IA/R1/transport workspace files required for readiness; SHA suffix records that fact.

---

## 4. Credential class / R1 identity

| Field | Value |
|-------|-------|
| Credential class | `readonly` |
| R1 role (JWT claim) | `far01_dryrun_readonly` |
| Transport | apikey = anon/publishable (`NEXT_PUBLIC_SUPABASE_ANON_KEY`); Authorization = Bearer R1 JWT |
| `FAR01_DRYRUN_API_KEY` | unset (anon fallback used) |
| Service-role used | **NO** |
| Credential values logged | **NO** |

---

## 5. Inventory snapshot (live)

| Class | Live count | Historical | Δ |
|-------|----------:|-----------:|--:|
| legacy_user | **68** | 68 | 0 |
| canonical_user | **2** | 2 | 0 |
| platform (excluded) | **3** | 3 | 0 |
| orphan_storage (excluded) | **28** | 30 | **−2** |
| user_master_rows / candidates | **70** | — | — |
| destination_conflicts | **0** | — | — |

**Current inventory:** **VERIFIED** (matches readiness baseline 68/2/3/28).
Orphans: **evidence only** — NOT IN FAR-01 BACKFILL SCOPE; no delete/move/copy/relink/cleanup.

---

## 6. Asset result summary

### Actions (disposition)

| Action | Count | Meaning for Owner |
|--------|------:|-------------------|
| MIGRATE | **67** | Eligible for future canary/backfill (not executed) |
| SKIP | **2** | Already canonical / non-migrate disposition |
| QUARANTINE | **1** | Identity mismatch — no automigrate |
| FAIL | **0** | — |
| OWNER_REVIEW | **0** | — |
| **Total candidates** | **70** | USER MASTER READY in loader scope |

### Integrity `status` (contract states)

| Status | Count |
|--------|------:|
| PASS | **2** |
| FAIL | **0** |
| UNKNOWN | **67** |
| ANOMALY | **1** |
| QUARANTINE (as action; status=ANOMALY) | **1** |

**Note:** Dry-run MIGRATE rows keep `checksum_status=UNKNOWN` / `content_identity=UNKNOWN` when DB checksum is NULL — **not** promoted to PASS (C-03).

### Checksum / DB update (dry-run)

| Field | Distribution |
|-------|--------------|
| checksum_status | UNKNOWN = **70** |
| DB_update_status | SKIPPED = 67 (dry-run migrate path); NOT_ATTEMPTED = 3 |
| retry_count > 0 | **0** |

---

## 7. Orphan summary

| Item | Value |
|------|-------|
| Live orphan Storage keys | **28** |
| Classification | ORPHAN / NOT IN FAR-01 BACKFILL SCOPE |
| Cleanup / delete / relink | **NOT EXECUTED** |
| Historical delta 30 → 28 | Documented; cause **not** asserted without evidence |

---

## 8. Integrity summary

| Check | Result |
|-------|--------|
| Identity binding applied | **YES** |
| Deterministic destination keys | **YES** (in archive per-asset) |
| Source/destination HEAD metadata | **YES** (loader + inspector) |
| NULL checksum → UNKNOWN | **YES** (70/70 UNKNOWN) |
| UNKNOWN → PASS coercion | **NO** |
| ANOMALY/QUARANTINE → PASS coercion | **NO** |

---

## 9. Quarantine summary

| asset_id | status | failure_reason |
|----------|--------|----------------|
| `000d406d-265e-4e49-bd3f-a542d5dd0b41` | ANOMALY | `identity_mismatch` |

**Rule applied:** identity mismatch → QUARANTINE · no automigrate.

---

## 10. Anomaly summary

| Count | Detail |
|------:|--------|
| 1 | Same as quarantine asset (`identity_mismatch`) |

SKIP assets (status PASS — already canonical shape):

| asset_id | status |
|----------|--------|
| `4e68c869-892d-4b79-a4b1-1e80db22b47f` | PASS |
| `e31ae14a-925d-40dc-9515-eb80249d460f` | PASS |

---

## 11. Mutation safety

| Gate | Result |
|------|--------|
| DRY_RUN forced | **TRUE** |
| Mutators wired | **NO** |
| live_mutations_attempted | **0** |
| Production DB mutation | **0** |
| Production Storage mutation | **0** |
| COPY / UPLOAD / MOVE / DELETE / DB UPDATE | **NOT EXECUTED** |

---

## 12. Durable archive

| Field | Value |
|-------|-------|
| Path | `docs/audits/evidence/far01-prod-dry-run-2026-10-03.json` |
| schema | `far01-prod-dry-run-archive/v1` |
| mode | `DRY_RUN` |
| live_mutations_attempted | `0` |
| Secret-like content scan | **PASS** (none detected) |
| Contains JWT / API keys / Authorization | **NO** |
| authorization.backfillGo | `false` |

---

## 13. Deviations

1. Workspace executed with **uncommitted** IA/R1/transport code; recorded in `git_sha` suffix.
2. CLI stdout still labels `productionDryRunExecutionGo: separate_owner_gate` (stale capability banner) — Owner GO for this run was granted separately; does not affect dry-run safety.
3. All 70 assets `checksum_status=UNKNOWN` (NULL checksums) — expected contract behavior, not a run failure.
4. Orphan count remains 28 vs historical 30 — inventory delta only.

---

## 14. Blockers for Backfill GO (still NO)

| Blocker | Notes |
|---------|-------|
| OD-BF-08 Backfill GO | **NO** — unchanged by dry-run |
| Canary N=5 | Required before fleet; **not** authorized |
| A2 signed LIVE artifact | Required for LIVE; not issued |
| Checksum UNKNOWN on 67 MIGRATE | Content identity not cryptographically proven |
| 1 QUARANTINE identity_mismatch | Must not enter canary/migrate set |
| C-R1-01 | OPEN / ACKNOWLEDGED |
| Orphans 28 | Out of backfill scope; no cleanup GO |
| Production mutator adapters for LIVE | Not part of this dry-run path |

---

## 15. Explicit statement

# **BACKFILL GO: NO**

Canary: **NOT EXECUTED**
Fleet: **NOT EXECUTED**
Retirement: **NOT EXECUTED**

---

## 16. Owner Q&A (evidence answers)

| Question | Answer |
|----------|--------|
| Ile assetów w loader scope? | **70** |
| Ile kwalifikuje się do MIGRATE? | **67** |
| Ile PASS (status)? | **2** |
| Ile FAIL? | **0** |
| Ile UNKNOWN (status)? | **67** |
| Ile ANOMALY? | **1** |
| Ile QUARANTINE (action)? | **1** |
| Ile orphan? | **28** (evidence only) |
| mutation_attempts / live_mutations_attempted? | **0** |
| Inventory spójne z live baseline? | **YES** — 68/2/3/28 |
| Konkretne blokery Backfill? | §14 |

---

**PRODUCTION DRY-RUN EXECUTION: PASS**
**STOP — await OWNER REVIEW; no automatic Backfill/Canary**
