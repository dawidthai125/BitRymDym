# AUDIT — FAR-01 Post-Fleet Soak / Retirement Readiness

**Type:** READ-ONLY soak readiness + retirement readiness audit
**Date:** 2026-10-03
**Fleet batch (prior):** `far01-bf-2026-10-03T04-16-29-485Z`
**Canary batch (prior):** `far01-bf-2026-10-03T04-06-42-045Z`
**Post-fleet evidence:** `docs/audits/AUDIT_FAR_01_POST_FLEET_EVIDENCE.md`

```text
POST-FLEET SOAK                          = READY
RETIREMENT READINESS                     = BLOCKED
RETIREMENT                               = NOT EXECUTED
CLEANUP                                  = NOT EXECUTED
SERVICE-ROLE                             = NO
DB mutations (this audit)                = 0
Storage mutations (this audit)           = 0
COMMIT / PUSH / DEPLOY                   = NO
```

**This audit does NOT authorize Retirement GO, Storage DELETE, orphan GC, or further migration.**

---

## 1. Classification

# **POST-FLEET SOAK = READY**

# **RETIREMENT READINESS = BLOCKED**

| Gate | Result | Notes |
|------|--------|-------|
| Migration execution complete | PASS | Dry-run → checksum → identity → LIVE creds → Canary 5 → Fleet 62 |
| Remaining MIGRATE candidates | **0** | live |
| Fleet remnants / failures | **0** | evidence |
| Source retention intact (67) | PASS | live HEAD × 67 |
| Canonical DB↔Storage reconcile | PASS | live **77/77** |
| Orphan accounting explained (FAR-01) | PASS | retained legacy still 67; see inventory delta |
| Quarantine locked / separate | PASS | disposition unresolved (Owner) |
| Owner-defined soak duration (OD-BF-05) | **NOT SET** | cannot invent clock; blocks retirement readiness |
| Soak window elapsed | **NO EVIDENCE** | no Owner soak clock started/closed |
| Legacy DB refs = 0 (retirement precondition) | **FAIL** | quarantine legacy USER = 1 |
| RETIREMENT GO | **NO** | not issued; READY ≠ GO |

---

## 2. Production inventory (LIVE — this audit)

Reference (post-fleet evidence) vs live:

| Class | Post-fleet reference | LIVE now | Δ |
|-------|---------------------:|---------:|--:|
| legacy USER | 1 | **1** | 0 |
| canonical USER | 69 | **77** | **+8** |
| platform | 3 | **3** | 0 |
| orphan Storage (total) | 95 | **97** | **+2** |
| retained legacy sources (Canary+Fleet) | 67 | **67** | 0 |
| true/historical orphans (excl. retained) | 28 | **30** | **+2** |
| quarantine | 1 | **1** | 0 |
| MIGRATE candidates | 0 | **0** | 0 |
| inventory actions | SKIP 69 / QUARANTINE 1 | SKIP **77** / QUARANTINE **1** | — |

**Inventory matches reference:** **NO** — differences marked below. **No auto-repair.**

### 2.1 Inventory delta RCA (read-only)

**+8 canonical USER** — all created after Fleet batch timestamp (`2026-10-03T04:16:29Z`), between `04:22:19Z`–`04:23:06Z`:

| asset_id | created_at (UTC) | beat status |
|----------|------------------|-------------|
| `076ca007-b5ac-4417-80aa-80e78a6fce86` | 04:22:19 | PUBLISHED |
| `884a8b92-42a5-4b29-9e8f-e54978176a7c` | 04:22:33 | PUBLISHED |
| `3fb1e18d-4f94-4ca2-be3c-a24e028bc433` | 04:22:39 | PUBLISHED |
| `1106eee4-e40c-412e-80fe-d3cd00446d82` | 04:22:48 | PUBLISHED |
| `3dc7efee-9977-46ac-926b-3a10b1e23052` | 04:22:51 | PUBLISHED |
| `120e3f04-325a-499b-b404-d9d4980b9159` | 04:23:00 | PUBLISHED |
| `337aea8a-4f6c-4506-a7b7-33e2230e9147` | 04:23:05 | PUBLISHED |
| `ce7e05c6-72f3-4dff-9420-ce3e1aa74903` | 04:23:06 | PUBLISHED |

- Not in Canary/Fleet migrate set.
- Canonical `object_key` shape; DB-linked; reconcile PASS.
- Consistent with post-migrate **canonical writers** (OD-KEY-06), not FAR-01 job residue.
- Likely organic / live-test product activity after Fleet.

**+2 orphan Storage** — canonical-shaped keys **not** in DB `object_key` set, **not** in FAR-01 retained-legacy set:

1. `user/384dc32d-…/832ab70f-…/d27a8bda-…/master.bin`
2. `user/b91ad2fd-…/1a61cd77-…/32892c5c-…/master.bin`

- Shape: canonical · exists · size 2646044 · no DB row.
- True/historical orphan count therefore **30** = **28** prior legacy-shaped + **2** new canonical-shaped.
- **Not** explained as Fleet retained sources. Flagged as unresolved soak observation (ARCH-04/05 orphan scope; no cleanup in this audit).

---

## 3. Canonical DB ↔ Storage reconciliation

Scope: all LIVE canonical USER assets (**77**).

Per asset (read-only): `asset_id`, `owner_id`, `beat_id`, DB `object_key`, Storage HEAD existence, exact key match to expected canonical, identity binding, storage size vs DB `byte_size`, integrity under **OD-BF-02** (checksum NULL → UNKNOWN; size evidence only).

| Classification | Count |
|----------------|------:|
| **PASS** | **77** |
| MISMATCH | **0** |
| MISSING | **0** |
| UNKNOWN | **0** |

FAR-01 migrated assets still canonical: **67/67** (Canary 5 + Fleet 62).
Checksum: UNKNOWN under OD-BF-02 where `checksum_sha256` NULL (expected; not written).

**No DB writes. No checksum backfill. No COPY.**

---

## 4. Playback / signed URL readiness

| Check | Result |
|-------|--------|
| Sample size | **15** canonical USER (stratified) |
| Canonical object HEAD | **15/15** |
| Identity binding (key == builder(owner,beat,asset)) | **15/15** |
| Signed URL via FAR-01 dry-run readonly client | **15/15** |
| Legacy-only DB dependency | **0/15** |
| Service-role | **NO** |
| Full product Access Gate (AuthZ + download limits) | **NOT EXECUTED** |

**Canonical playback: LIMITED**

Limitation: production Access Gate (`audio-access.ts`) signs via `createSupabaseAdminClient` (service-role). This audit deliberately does **not** use service-role. Playback evidence is Storage signed-URL generation + existence + binding on the readonly plane for a representative sample — not full end-to-end product AuthZ/playback path for all 77.

---

## 5. Retained legacy sources (67)

Canary sources (5) + Fleet sources (62). For each: source exists, legacy shape, DB does not point to legacy, DB points to corresponding canonical, intentional retention (orphan-by-definition).

| Classification | Count |
|----------------|------:|
| **PASS** | **67** |
| MISMATCH | **0** |
| MISSING | **0** |
| UNKNOWN | **0** |

**No source deleted.**

---

## 6. Quarantine

Asset: `000d406d-265e-4e49-bd3f-a542d5dd0b41`

| Check | Result |
|-------|--------|
| LOCKED | **YES** |
| identity_anomaly | **YES** |
| action | **QUARANTINE** |
| auto-migrate forbidden | **YES** |
| still legacy shape | **YES** |
| source exists | **YES** |
| Automatic Retirement | **NO** |
| Automatic cleanup | **NO** |

**Quarantine: PASS** (control integrity). Disposition remains Owner decision — not resolved here.

---

## 7. True / historical orphans

| Item | Count |
|------|------:|
| Orphan Storage total | **97** |
| FAR-01 retained legacy in orphan set | **67** |
| FAR-01 canonical destinations in orphan set | **0** |
| Platform misclassified | **0** |
| True/historical (excl. retained) | **30** |
| · legacy-shaped | **28** |
| · canonical-shaped (post-fleet new) | **2** |
| UNKNOWN shape | **0** |
| Overlap with retained legacy | **0** |
| Overlap with DB keys | **0** |

**True orphan verification: LIMITED** — 28 historical legacy-shaped confirmed disjoint from retained/canonical/platform; +2 new canonical-shaped orphans observed post-fleet (unresolved observation; no cleanup plan executed).

---

## 8. FAR-01 Retirement preconditions (OD-BF-05 / OD-KEY-07)

| Precondition | Evidence | Met? |
|--------------|----------|------|
| Migration complete (eligible set) | MIGRATE=0; Fleet 62 SUCCESS | **YES** |
| All eligible assets canonical | 67 migrated + prior SKIP; quarantine excluded | **YES** (eligible) |
| Source retention intact | 67/67 PASS | **YES** |
| Canonical playback verified | LIMITED (readonly sample) | **PARTIAL** |
| No unresolved migration candidate | 0 | **YES** |
| No unexplained FAR-01 orphan accounting | retained 67 explained; +2 new orphans not FAR-01 | **PARTIAL** |
| Quarantine disposition separate | LOCKED; Owner open | **YES** (separate) / unresolved |
| Soak evidence available (canary/fleet/reconcile) | audits + live probe | **YES** (enter soak) |
| Owner-defined soak elapsed | duration **unset**; no closed soak clock | **NO** |
| Legacy DB refs = 0 | quarantine legacy = 1 | **NO** |
| Rollback evidence remains possible | 67/67 sources exist; `planFar01Rollback` canRevert theory | **YES** |
| No active migration incidents | Fleet 0 FAIL / 0 REMNANT | **YES** |
| Backup policy confirmed | not verified this audit | **NO EVIDENCE** |

**Retirement readiness cannot be READY** while soak duration unset, soak not evidenced as elapsed, and residual legacy DB ref (quarantine) remains.

---

## 9. Soak readiness (OD-BF-05)

| Evidence | Status |
|----------|--------|
| Canary success | PASS (5/5) |
| Fleet success | PASS (62/62) |
| Post-fleet reconciliation | PASS (prior audit + this live) |
| Canonical availability | PASS (77/77 HEAD+binding) |
| Legacy retention | PASS (67/67) |
| Telemetry | PASS (0 remnant) |
| Zero migration candidates | PASS |
| Approved automated soak monitor | **NOT PRESENT** — not invented |
| Owner soak duration parameter | **UNSET** — not invented as PASS for elapsed soak |

**POST-FLEET SOAK = READY** means: evidence is sufficient to **enter / continue** the post-fleet soak observation window under OD-BF-05.
It does **not** mean soak has completed. Owner must set/acknowledge soak duration and close the window before retirement readiness can clear.

---

## 10. Rollback readiness

| Item | Result |
|------|--------|
| Retained legacy sources exist | **67/67** |
| DB currently on canonical | **67/67** migrated |
| `planFar01Rollback` design (revert `object_key`, no delete) | present |
| Remote rollback executed | **NO** (correct) |
| Accidental source delete | **NOT OBSERVED** |

**Rollback readiness: PASS** (theoretical revert remains possible while sources retained).

---

## 11. Unresolved items

1. **Owner soak duration (OD-BF-05)** — unset; soak elapsed cannot be claimed.
2. **Quarantine disposition** — `000d406d-…` remains Owner decision; blocks “legacy DB refs = 0”.
3. **Inventory drift** — +8 organic canonical USER assets post-fleet (documented; not FAR-01 migrate).
4. **+2 new canonical-shaped orphans** — unexplained vs post-fleet baseline; ARCH-04/05 scope; no cleanup.
5. **Playback** — product Access Gate path not fully exercised (service-role forbidden here).
6. **Backup policy** — not evidenced this audit.
7. **RETIREMENT GO** — not issued (and must not be inferred from this audit).

---

## 12. Safety

| Item | Value |
|------|-------|
| Service-role | **NO** |
| DB mutations | **0** |
| Storage mutations | **0** |
| Retirement | **NOT EXECUTED** |
| Cleanup | **NOT EXECUTED** |
| COPY / UPDATE object_key / DELETE | **NOT EXECUTED** |

---

## 13. Tests / typecheck / lint

| Item | Result |
|------|--------|
| Vitest FAR-01 suite | **PASS** 141/141 |
| Typecheck | **PASS** |
| ESLint (FAR-01 scoped) | **PASS** |

---

## 14. STOP

Soak readiness recorded. Retirement readiness **BLOCKED**.
**No Retirement. No legacy delete. No orphan cleanup. No commit / push / deploy.**
Awaiting Architect Review.
