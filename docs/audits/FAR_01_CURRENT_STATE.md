# FAR-01 — CURRENT STATE (LIVING)

**Updated:** 2026-10-05
**Type:** Living operational status · not a historical closeout
**Rule:** Prefer this file + LIVE evidence over stale soak-baseline inventory (77 / 97 / 67 / 1) in older handoffs.

```text
FAR-01 DR-A (Phase 1)     = SHIPPED / PRODUCTION VERIFIED
FAR-01 CAMPAIGN           = SOAK COMPLETE / CONTAMINATED
FAR-01 CLOSED             = NO
FAR-01 RETIREMENT         = NOT EXECUTED
MIGRATE candidates        = 0
ARCH-04/05 orphan GC      = READY FOR OWNER DELETE GO · SAFE 32/32 · DELETE 0
```

**Forbidden claims:** FAR-01 CLOSED · formal FAR-01 retirement completed · 67 retained sources “retired by FAR-01” · SOAK ACTIVE · living inventory 77/97/67/1.

---

## 1. Planes

| Plane | Value |
|-------|--------|
| Repository tip (docs) | `0784309` family — docs may advance after this reconciliation |
| Production app SHA | `ddcee65` (W4 app; docs tip ≠ app SHA) |
| Production deployment | `dpl_6PjSxhA8SVW7ufnBDjSAguPb5ram` |
| Production DB tip | `20261004174202` |
| DB FAR-01 roles | `far01_dryrun_readonly` · `far01_live_mutator` |
| FAR-01 role migrations | `20261002231150` · `20261003012453` |

---

## 2. Campaign progress

| Gate | Status |
|------|--------|
| R1 readonly role | APPLIED + repo reconciled |
| LIVE mutator role | APPLIED + repo reconciled |
| Production dry-run | EXECUTED (evidence) |
| Checksum / identity | RESOLVED for campaign gates (evidence) |
| Canary N=5 | **PASS** |
| Fleet N=62 | **PASS** |
| Soak start | `2026-10-03T04:40:56.645Z` |
| Soak end (target) | `2026-10-04T04:40:56.645Z` |
| Soak clock | **ELAPSED** |
| Interim soak | **PASS** (at start window; no drift then) |
| Final soak audit | **COMPLETE** (read-only) |
| Soak integrity | **FAILED / CONTAMINATED** |
| FAR-01 RETIREMENT | **NOT EXECUTED** |

**Correct summary sentence:**
FAR-01 backfill ran canary + fleet; 24h soak clock elapsed; final soak audit found inventory contaminated; formal FAR-01 retirement was never executed; original retain-set is already absent outside the FAR-01 retirement flow.

---

## 3. Inventory

### 3.1 Superseded soak baseline (historical only)

Do **not** use as living truth:

| Class | Count (soak start / interim) |
|-------|------:|
| legacy USER | 1 |
| canonical USER | 77 |
| platform | 3 |
| retained legacy sources | 67 |
| true/historical orphans | 30 |
| total orphan Storage | 97 |
| quarantine | 1 |
| MIGRATE | 0 |

Evidence of that baseline (historical):
`AUDIT_FAR_01_SOAK_START.md` · `AUDIT_FAR_01_INTERIM_SOAK.md` · `evidence/far01-soak-start-baseline.json` · `evidence/far01-interim-soak.json`.

### 3.2 Living inventory (FINAL SOAK AUDIT — 2026-10-04)

| Class | Count |
|-------|------:|
| living USER masters (DB-linked) | **8** |
| platform masters | **3** |
| beat-audio total objects | **11** (post ARCH-05 DELETE) |
| DB keys missing Storage | **0** |
| retained FAR-01 sources | **0** |
| quarantine | **0** |
| MIGRATE candidates | **0** |
| historical / orphan / delete-residue objects | **0** (ARCH-05 deleted **32/32**) |

Pre-ARCH-05 shape of the **32** (historical — deleted 2026-10-05):

| Shape | Count |
|-------|------:|
| pre-FAR-01 `user/…/master/{id}.bin` | 28 |
| canonical_v2 orphans (incl. 2 soak-tracked + 2 post-soak) | 4 |

---

## 4. Retain-set disposition (critical)

| Claim | Truth |
|-------|--------|
| Original FAR-01 retained sources | **67** at soak baseline |
| Present now | **0** |
| FAR-01 RETIREMENT GO | **NEVER ISSUED** |
| FAR-01 RETIREMENT executed | **NO** |
| How retain-set disappeared | Removed **outside** FAR-01 retirement flow — attributed to **USER-CLEANUP-01** fixture Storage/user deletion (collateral), **not** formal FAR-01 retirement |

**Do not** document the absence of the 67 as “FAR-01 retired successfully”.

Quarantine asset `000d406d-…`: **gone** · disposition unresolved as a FAR-01 control (object no longer present).

---

## 5. Findings (FAR-01 plane — non-blocking unless Owner elevates)

| Finding | Status |
|---------|--------|
| Soak integrity broken / contaminated | OPEN |
| +2 post-soak orphan objects | OPEN |
| Quarantine disposition unresolved (object absent) | OPEN |
| Storage object backup evidence | **PRESENT** · Local/VPS **43/43 RETAINED** · ARCH-05 **CLOSED** (DELETE **32/32**) |
| Historical local DB dump | **FOUND** · ≠ Storage object bytes — [HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md](./HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md) |
| Continuous soak telemetry | **NOT VERIFIED** |
| FAR-01 R1 credentials missing in local operator env | OPEN |

P0 = 0 · P1 = 0 (no severity change without new evidence).

---

## 6. ARCH-04 / ARCH-05

The former **32** orphan / historical / delete-residue objects are:

```text
ARCH-05 = CLOSED / VERIFIED
SAFE → OWNER APPROVED → DELETE EXECUTED → POST-DELETE VERIFIED
Production Storage orphans = 0 · live inventory 11/8/3/0/0
Local/VPS evidence of the 32 = RETAINED (43/43)
≠ automatic FAR-01 retirement
SSOT: ARCH_05_POST_DELETE_RECONCILIATION.md (execution: ARCH_05_DELETE_EXECUTION.md)
```

These keys were **not** FAR-01 retained sources (living retain-set = **0**). FAR-01 campaign CONTAMINATED/NOT CLOSED remains a campaign fact and was not the delete authority — ARCH-05 Owner GO + allowlist was.

**Separation:** historical local PostgreSQL dump **EXISTS** (DB/Auth recovery artifact). Storage object-byte DR evidence retained on VPS + Local (including deleted orphans).

---

## 7. Next gate

```text
Owner Review (ARCH-05 closed — no further Storage GC)
  · optional AWS immutable DR
  · FAR-01 campaign remains CONTAMINATED / NOT CLOSED (separate plane)
```

Do **not** auto-start: further orphan cleanup · FAR-01 key retirement · STORAGE-ARCH-02 external storage · VPS/local prune of retained orphan evidence.
Do **not** treat ARCH-05 closeout as “FAR-01 RETIREMENT” — original retain-set is gone and formal retirement was never executed.

---

## 8. Historical note

Phase 1 DR-A dual-accept closeout remains valid history:
[FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md](./FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md)

Pre-campaign Phase 1 numbers and soak-baseline **77/97/67/1** are **historical**, superseded for living ops by §3.2.
