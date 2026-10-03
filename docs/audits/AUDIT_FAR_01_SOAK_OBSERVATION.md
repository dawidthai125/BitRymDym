# AUDIT — FAR-01 Soak Continuation / Observation

**Type:** READ-ONLY soak observation (continuation)
**Observed at:** 2026-10-03T04:34:48.740Z
**Prior readiness:** `docs/audits/AUDIT_FAR_01_POST_FLEET_SOAK_RETIREMENT_READINESS.md`
**Fleet batch:** `far01-bf-2026-10-03T04-16-29-485Z`
**Canary batch:** `far01-bf-2026-10-03T04-06-42-045Z`

```text
SOAK OBSERVATION                         = READY
SOAK DURATION (at this observation)      = UNSET  ← superseded by AUDIT_FAR_01_SOAK_START.md
SOAK ELAPSED                             = NOT CLAIMED
RETIREMENT READINESS                     = BLOCKED
RETIREMENT                               = NOT EXECUTED
CLEANUP                                  = NOT EXECUTED
SERVICE-ROLE                             = NO
DB mutations (this audit)                = 0
Storage mutations (this audit)           = 0
COMMIT / PUSH / DEPLOY                   = NO
```

**Supersession:** Owner later set **OD-BF-05 = 24h** and formally started the soak clock in `docs/audits/AUDIT_FAR_01_SOAK_START.md`. This observation remains historical evidence of pre-start stability.
**This audit did NOT authorize Retirement GO, delete sources/orphans, or change quarantine disposition.**

---

## 1. Classification

# **SOAK OBSERVATION = READY**

| Item | Result |
|------|--------|
| Soak status | **READY / DURATION UNSET** |
| Soak elapsed | **NOT CLAIMED** |
| Retirement readiness | **BLOCKED** (not re-evaluated to READY) |
| Retirement | **NOT EXECUTED** |
| Source retention intact | **PASS** (67/67) |
| New FAR-01 migration activity | **NONE** (MIGRATE = 0) |
| Source missing | **NO** |

---

## 2. Current inventory (LIVE)

| Class | Count |
|-------|------:|
| legacy USER | **1** |
| canonical USER | **77** |
| platform | **3** |
| retained legacy sources (Canary+Fleet) | **67** |
| true/historical orphans | **30** |
| · legacy-shaped | **28** |
| · canonical-shaped | **2** |
| orphan Storage total | **97** |
| quarantine | **1** |
| migration candidates (MIGRATE) | **0** |
| inventory actions | SKIP **77** · QUARANTINE **1** |

Organic canonical writers after Fleet (created_at > fleet batch): **8** — DB-linked canonical assets; **not** counted as FAR-01 migration without migrate evidence.

---

## 3. Inventory delta

### vs post-fleet evidence baseline (69 / 95)

| Metric | Δ |
|--------|--:|
| canonical USER | **+8** |
| orphan Storage | **+2** |
| true/historical orphans | **+2** |
| retained legacy | **0** |
| legacy USER | **0** |

### vs prior soak readiness audit (77 / 97)

| Metric | Δ |
|--------|--:|
| canonical USER | **0** |
| orphan Storage | **0** |
| true/historical orphans | **0** |
| retained legacy | **0** |

**Drift since last soak audit:** stable (no further change).

---

## 4. Canonical reconciliation

All LIVE canonical USER assets (**77**). READ-ONLY: DB key, Storage HEAD, exact match, identity binding, size vs `byte_size`, OD-BF-02 checksum UNKNOWN where NULL.

| Classification | Count |
|----------------|------:|
| **PASS** | **77** |
| MISMATCH | **0** |
| MISSING | **0** |
| UNKNOWN | **0** |

No mutations.

---

## 5. Retained legacy soak (67)

| Classification | Count |
|----------------|------:|
| **PASS** | **67** |
| MISMATCH | **0** |
| MISSING | **0** |
| UNKNOWN | **0** |

Per asset: source exists · legacy-shaped · DB points to canonical (not legacy) · canonical destination exists · source untouched.

**Source-missing BLOCKER:** **NO**.

---

## 6. Quarantine observation

Asset: `000d406d-265e-4e49-bd3f-a542d5dd0b41`

| Check | Result |
|-------|--------|
| LOCKED | **YES** |
| identity_anomaly | **YES** |
| action | **QUARANTINE** |
| legacy DB reference | **YES** (still legacy shape) |
| auto-migrate forbidden | **YES** |
| source exists | **YES** |
| disposition | **NOT TAKEN** (untouched) |

**Quarantine: PASS** (observation / control integrity).

---

## 7. Tracked +2 canonical-shaped orphans

Both previously detected objects still present; status unchanged; no additional canonical-shaped orphans.

| # | object_key | exists | size | in orphan set | DB `object_key` match | path asset_id in DB | organic writer+DB | real orphan | unchanged |
|---|------------|--------|-----:|:-------------:|:---------------------:|:-------------------:|:-----------------:|:-----------:|:---------:|
| 1 | `user/384dc32d-c4af-4673-bb4e-0a5e2bc189e4/832ab70f-3b1c-4034-88fe-cdef95038669/d27a8bda-a7d0-4518-8bd2-133c99d6e4e6/master.bin` | YES | 2646044 | YES | NO | NO (`d27a8bda-…`) | NO | **YES** | **YES** |
| 2 | `user/b91ad2fd-739f-41ec-b8b4-ef6e7e91626f/1a61cd77-6ccc-4ebe-91fe-ff5974982580/32892c5c-5f09-4f28-9f21-ab7d4e8ac64f/master.bin` | YES | 2646044 | YES | NO | NO (`32892c5c-…`) | NO | **YES** | **YES** |

Created/observed timing: first recorded in post-fleet soak readiness audit (after Fleet `04:16:29Z`); Storage list API does not expose reliable created_at in this plane — timing remains **observation-window inferred**, not Storage birth timestamp.

**Additional canonical-shaped orphans beyond tracked:** **0**
**New orphan delta (this observation vs prior soak):** **0**

No deletion.

---

## 8. Playback evidence

| Check | Result |
|-------|--------|
| Plane | FAR-01 dry-run readonly |
| Service-role | **NO** |
| Sample | **15** canonical USER |
| HEAD | **15/15** |
| Binding | **15/15** |
| Signed URL | **15/15** |
| Legacy-only DB dependency | **0** |

**Playback evidence: LIMITED**

Limitation (explicit): product Access Gate (`audio-access.ts`) uses `createSupabaseAdminClient` for signed URLs. This observation does **not** exercise full product AuthZ / download-limit / Access Gate path. Readonly signed URL + HEAD + binding ≠ full product playback verification.

---

## 9. Backup evidence

Searched FAR-01 / Owner Decision docs for verified backup policy evidence applicable to retirement:

- Design references backup policy as a **retirement readiness** condition (OD-BF-05 / OD-KEY-07 adjacency; STORAGE-ARCH-07 conceptual).
- No FAR-01 audit artifact verifying a live backup / restore / PITR policy for retained masters.

**BACKUP EVIDENCE = NOT VERIFIED**

No backup executed this audit. No fictitious PASS.

---

## 10. Soak observation (OD-BF-05)

| Item | Value |
|------|-------|
| Owner soak duration | **UNSET** |
| Soak elapsed | **NOT CLAIMED** |
| Soak status | **READY / DURATION UNSET** |
| Fictional elapsed time | **NOT CREATED** |
| Retirement readiness declared READY | **NO** |

---

## 11. Unresolved items

1. OD-BF-05 Owner soak duration unset
2. Quarantine residual legacy DB reference (`000d406d-…`)
3. +2 canonical-shaped orphans (still present; real orphans; no cleanup)
4. Full product playback AuthZ path not verified
5. Backup policy evidence missing (**NOT VERIFIED**)
6. Retirement GO absent

---

## 12. Safety

| Item | Value |
|------|-------|
| DB mutations | **0** |
| Storage mutations | **0** |
| Service-role | **NO** |
| Retirement | **NOT EXECUTED** |
| Cleanup | **NOT EXECUTED** |

---

## 13. Tests / typecheck / lint

| Item | Result |
|------|--------|
| Vitest FAR-01 suite | **PASS** 141/141 |
| Typecheck | **PASS** |
| ESLint (FAR-01 scoped) | **PASS** |

---

## 14. STOP

Soak observation complete. Inventory stable vs prior soak audit.
**No Retirement. No legacy/orphan delete. No quarantine change. Owner soak duration not set by Agent.**
Awaiting Architect Review.
