# FAR-01 SOAK START

**Type:** Formal OD-BF-05 soak clock start + READ-ONLY baseline
**Date:** 2026-10-03
**Evidence JSON:** `docs/audits/evidence/far01-soak-start-baseline.json`
**Design lock updated:** `docs/audits/DESIGN_FAR_01_BACKFILL.md` §12 / OD-BF-05 table

```text
SOAK START                               = PASS
OD-BF-05                                 = 24h
SOAK COMPLETED                           = NO
RETIREMENT                               = NOT EXECUTED
RETIREMENT GO                            = NOT ISSUED
CLEANUP                                  = NOT EXECUTED
SERVICE-ROLE                             = NO
DB mutations                             = 0
Storage mutations                        = 0
COMMIT / PUSH / DEPLOY                   = NO
```

---

## Owner Decision

**OD-BF-05 = 24h**

Owner formally set the required FAR-01 post-fleet soak duration to:

**SOAK DURATION = 24 HOURS**

This is an Owner Decision (not Agent-invented). It does **not** authorize Retirement GO, cleanup, or source deletion.

---

## Soak Parameters

| Parameter | Value |
|-----------|-------|
| duration | **24h** |
| started_at | **2026-10-03T04:40:56.645Z** |
| target_end | **2026-10-04T04:40:56.645Z** (`started_at + 24h`) |
| elapsed_at_audit | **~0.027h** (98 106 ms wall time from `started_at` through baseline probe completion) |
| elapsed at formal start instant | **≈ 0h** |
| completed | **NO** |

No fictitious elapsed. Soak is **not** marked complete.

---

## Baseline Inventory

LIVE READ-ONLY snapshot at soak start (matches expected preserve state):

| Class | Count |
|-------|------:|
| legacy USER | **1** |
| canonical USER | **77** |
| platform | **3** |
| retained legacy sources | **67** |
| true/historical orphans | **30** |
| · legacy-shaped | **28** |
| · canonical-shaped | **2** |
| total orphan Storage | **97** |
| quarantine | **1** |
| migration candidates | **0** |
| new orphan delta (vs prior soak observation) | **0** |

Baseline match to required preserve state: **YES**.

---

## Baseline Reconciliation

| Check | Result |
|-------|--------|
| Canonical USER reconciliation | **PASS = 77 / MISMATCH = 0 / MISSING = 0 / UNKNOWN = 0** → **77/77 PASS** |
| Retained legacy reconciliation | **PASS = 67 / MISMATCH = 0 / MISSING = 0 / UNKNOWN = 0** → **67/67 PASS** |
| Source missing | **NO** |

---

## Quarantine

Asset: `000d406d-265e-4e49-bd3f-a542d5dd0b41`

| Check | Result |
|-------|--------|
| LOCKED | **YES** |
| identity_anomaly | **YES** |
| legacy DB ref | **YES** |
| auto-migrate forbidden | **YES** |
| untouched | **YES** |

Disposition: **NOT TAKEN**.

---

## Canonical-shaped Orphans

**2 tracked / unchanged** — observation only. No delete. No modify. No cleanup.

1. `user/384dc32d-c4af-4673-bb4e-0a5e2bc189e4/832ab70f-3b1c-4034-88fe-cdef95038669/d27a8bda-a7d0-4518-8bd2-133c99d6e4e6/master.bin` — exists · real orphan · unchanged
2. `user/b91ad2fd-739f-41ec-b8b4-ef6e7e91626f/1a61cd77-6ccc-4ebe-91fe-ff5974982580/32892c5c-5f09-4f28-9f21-ab7d4e8ac64f/master.bin` — exists · real orphan · unchanged

Additional canonical-shaped orphans beyond tracked: **0**.

---

## Playback evidence

| Item | Value |
|------|-------|
| Evidence class | **LIMITED** |
| Sample | 15 canonical USER |
| HEAD / binding / signed URL (readonly plane) | **15/15** |
| Service-role | **NO** |
| Limitation | Not full product Access Gate AuthZ path |

---

## Backup evidence

**BACKUP EVIDENCE = NOT VERIFIED**

No backup executed. No fictitious PASS.

---

## Safety

| Item | Value |
|------|-------|
| DB mutations | **0** |
| Storage mutations | **0** |
| service-role | **NO** |
| Retirement | **NOT EXECUTED** |
| Cleanup | **NOT EXECUTED** |
| ENV changes | **NONE** |
| Commit / Push / Deploy | **NO** |

---

## Exit Conditions

After a minimum of **24h** from `SOAK STARTED_AT` (i.e. not before `SOAK TARGET_END`):

1. Execute a separate **SOAK END / RETIREMENT READINESS AUDIT** (read-only).
2. Do **not** treat soak clock alone as Retirement GO.
3. Do **not** delete retained legacy sources or orphans in this phase.
4. Quarantine disposition and backup policy remain separate Owner gates.

---

## Final

**SOAK START = PASS**

- SOAK DURATION = 24h
- SOAK STARTED_AT = 2026-10-03T04:40:56.645Z
- SOAK TARGET_END = 2026-10-04T04:40:56.645Z
- SOAK COMPLETED = NO
- DB mutations = 0
- Storage mutations = 0
- service-role = NO
- Retirement = NOT EXECUTED
- Cleanup = NOT EXECUTED
- Commit = NO
- Push = NO
- Deploy = NO

STOP.
