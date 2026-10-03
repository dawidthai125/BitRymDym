# AUDIT — FAR-01 Post-Fleet Evidence Review + Orphan Classification RCA

**Type:** READ-ONLY post-fleet reconcile + orphan accounting RCA
**Date:** 2026-10-03
**Fleet batch:** `far01-bf-2026-10-03T04-16-29-485Z`
**Canary batch (context):** `far01-bf-2026-10-03T04-06-42-045Z`
**Fleet evidence:** `docs/audits/evidence/far01-fleet-62-far01-bf-2026-10-03T04-16-29-485Z.json`

```text
POST-FLEET                               = PASS
ORPHAN ACCOUNTING                        = EXPLAINED
RETIREMENT                               = NOT EXECUTED
CLEANUP                                  = NOT EXECUTED
SERVICE-ROLE                             = NO
DB mutations (this audit)                = 0
Storage mutations (this audit)           = 0
COMMIT / PUSH / DEPLOY                   = NO
```

---

## 1. Classification

# **POST-FLEET = PASS**

# **ORPHAN ACCOUNTING = EXPLAINED**

| Gate | Result |
|------|--------|
| Fleet 62 reconcile (DB + Storage + identity) | **PASS** (62/62) |
| Fleet-created canonical in orphan set | **0 / 62** |
| Orphan delta math `95 − 62 = 33` | **MATCH** (pre-fleet orphan baseline) |
| Mechanism | Retained **legacy source** keys after `object_key` rewrite (source retention) — **not** canonical misclassification |
| Remaining MIGRATE | **0** |
| Quarantine untouched | **YES** |
| Service-role | **NO** |
| Audit mutations | DB **0** / Storage **0** |
| Retirement / Cleanup | **NOT EXECUTED** |

**Rejected hypothesis label:** `ORPHAN COUNT INCREASE EXPLAINED BY CANONICAL CLASSIFICATION GAP`
**Accepted mechanism label:** `ORPHAN COUNT INCREASE EXPLAINED BY RETAINED LEGACY SOURCE KEYS`

---

## 2. Initial inventory (pre-fleet)

| Class | Count |
|------:|------:|
| legacy USER | **63** |
| canonical USER | **7** |
| platform | **3** |
| orphans | **33** |

---

## 3. Final inventory (live, this audit)

| Class | Count |
|------:|------:|
| legacy USER | **1** |
| canonical USER | **69** |
| platform | **3** |
| orphans | **95** |
| inventory actions | SKIP **69** · QUARANTINE **1** · MIGRATE **0** |
| DB `object_key` rows (bucket) | **73** (= 69 USER + 3 PLATFORM + 1 quarantine legacy) |
| Storage keys under `user/` | **165** |

---

## 4. Krok 1 — Reconcile 62 Fleet assets

For every Fleet `per_asset` row (n=62), live READ-ONLY checks:

| Check | Result |
|-------|--------|
| DB `asset_id` present in inventory | 62/62 |
| DB `object_key` == Fleet `destination_key` | 62/62 |
| Canonical destination HEAD exists | 62/62 |
| Canonical key present in DB `object_key` set | 62/62 |
| Canonical key in orphan set | **0/62** |
| Legacy source HEAD exists (retention) | 62/62 |
| Legacy source in DB `object_key` set | **0/62** |
| Legacy source in orphan set | **62/62** |
| Identity anomaly | **0/62** |
| Inventory action | SKIP (already canonical) × 62 |

**Verdict:** None of the 62 new canonical objects are classified as orphans. All 62 retained legacy sources are classified as orphans (by inventory definition).

---

## 5. Krok 2 — Orphan breakdown (`orphans = 95`)

Orphan definition (code, unchanged): Storage keys under prefix `user` whose key is **not** in `beat_audio_assets.object_key`
(`prod-dry-run.ts` → `listOrphanStorageKeys` = `storageKeys.filter(k => !dbKeys.has(k))`).

| Cat | Description | Count |
|-----|-------------|------:|
| **A** | New Canary/Fleet **canonical** objects in orphan set | **0** |
| **A′** | FAR-01 retained **legacy source** keys (Canary 5 + Fleet 62) in orphan set | **67** |
| **B** | Historical orphan objects (user-shaped, pre-FAR-01 retention) | **28** |
| **C** | Platform objects misclassified as orphans | **0** |
| **D** | Objects linked by DB asset but unrecognized by inventory | **0** |
| **E** | True orphans (no DB binding; equals historical B) | **28** |
| **F** | Other / UNKNOWN shape | **0** |

**Sum check:** `0 + 67 + 28 = 95`.

Canary cross-check: canary destination keys in orphan set = **0**; canary source keys in orphan set = **5**.

---

## 6. Krok 3 — Expected accounting

| Expression | Value | Match |
|------------|------:|-------|
| Final orphans | **95** | live |
| Fleet-created retained legacy sources | **62** | evidence + live |
| `95 − 62` | **33** | **= pre-fleet orphan baseline 33** |
| Canary retained legacy (inside the 33) | **5** | live |
| `95 − 67` (all FAR-01 retained legacy) | **28** | **= pre-canary historical orphan baseline** |

**Confirmed:** orphan count increase `33 → 95` (+62) is fully explained by the 62 Fleet-retained legacy source keys becoming unreferenced after DB `object_key` moved to canonical.

**Not confirmed:** canonical destinations miscounted as orphans (0 such keys).

---

## 7. Krok 4 — Inventory logic RCA (no code change)

### Why canonical `user/{owner}/{beat}/{asset}/master.bin` is **not** orphan after FAR-01

1. Fleet/Canary UPDATE sets `beat_audio_assets.object_key` to the canonical destination.
2. Orphan listing loads **all** bucket `object_key` values via `listBeatAudioObjectKeys()`.
3. Canonical keys are members of that set → excluded from orphans.
4. Live proof: Fleet destinations in orphan set = **0**; inventory `canonical_user` = **69** (= 7 pre-fleet + 5 canary + 62 fleet).

### Why retained legacy `user/{owner}/{beat}/master/{asset}.bin` **is** orphan after FAR-01

1. Source retention leaves the legacy object in Storage.
2. DB no longer references that key.
3. Orphan predicate is key-set difference only — it does **not** correlate “former source of migrated asset” vs “never-referenced blob”.
4. Therefore every successful migrate with source retention increments `orphan_storage` by +1 per retained legacy key.
5. This is expected under OD-BF source-retention / Retirement NOT EXECUTED — not a destination classification bug.

### Classification gap (precise)

| Gap | Present? |
|-----|----------|
| Canonical destination classified as orphan | **NO** |
| Retained legacy source classified as orphan | **YES (by design of current orphan predicate)** |
| Inventory USER canonical counter wrong | **NO** (69 correct) |

---

## 8. Krok 5 — Legacy accounting

| Item | Value |
|------|-------|
| legacy USER | **1** |
| canonical USER | **69** |
| platform | **3** |
| remaining MIGRATE candidates | **0** |
| Quarantine asset | `000d406d-265e-4e49-bd3f-a542d5dd0b41` |
| Quarantine locked | **YES** |
| Quarantine action | **QUARANTINE** |
| Quarantine identity_anomaly | **true** |
| Quarantine still legacy shape | **YES** |
| Quarantine auto-migrate | **FORBIDDEN** (locked; not a Fleet candidate) |

**Disposition:** remaining legacy USER = quarantine blocker/decision only. Not an automatic migration candidate. No migrate attempted this audit.

---

## 9. Krok 6 — Fleet telemetry

Batch `far01-bf-2026-10-03T04-16-29-485Z` (evidence JSON, read-only):

| Metric | Value |
|--------|------:|
| SUCCESS | **62** |
| FAIL | **0** |
| RETRY | **0** |
| REMNANT | **0** |
| Classification | `FLEET_EXECUTION_PASS` |

Telemetry unchanged.

---

## 10. Krok 7 — Security / safety (this audit)

| Item | Value |
|------|-------|
| Client plane | dry-run readonly JWT |
| Service-role | **NO** |
| DB mutations | **0** |
| Storage mutations | **0** |
| DELETE / COPY / UPDATE / INSERT | **NOT EXECUTED** |

---

## 11. Krok 8 — Retirement gate

| Item | Value |
|------|-------|
| Retirement | **NOT EXECUTED** |
| Legacy source deletion | **NOT EXECUTED** |
| Orphan cleanup | **NOT EXECUTED** |
| Owner Decisions | unchanged |

---

## 12. Tests / typecheck / lint (read-only verification)

| Item | Result |
|------|--------|
| Vitest FAR-01 suite (`far01-backfill` + DRA dual-accept) | **PASS** 141/141 |
| Typecheck (`tsc --noEmit`) | **PASS** |
| ESLint (FAR-01 scoped paths) | **PASS** |

---

## 13. Summary tables (Architect sheet)

| Field | Value |
|-------|-------|
| Initial | 63 legacy / 7 canonical / 3 platform / 33 orphans |
| Final | 1 legacy / 69 canonical / 3 platform / 95 orphans |
| Fleet-created canonical (in orphan set) | **0** |
| Fleet-retained legacy (in orphan set) | **62** |
| Canary-retained legacy (in orphan set) | **5** |
| Historical orphans | **28** |
| True orphans (E) | **28** |
| Unclassified / OTHER (F) | **0** |
| Orphan delta | `+62` = Fleet retained legacy sources |
| Accounting | `95 − 62 = 33` (= pre-fleet orphans) |
| Remaining migration candidates | **0** |
| Remaining legacy | **1** (quarantine) |
| Quarantine | **1 untouched** |
| Fleet telemetry | **PASS** |
| Service-role | **NO** |
| DB mutations | **0** |
| Storage mutations | **0** |
| Retirement | **NOT EXECUTED** |
| Cleanup | **NOT EXECUTED** |
| Blockers | **NONE** for post-fleet evidence; quarantine disposition remains Owner decision (out of scope) |

---

## 14. STOP

Post-fleet evidence review complete. **No cleanup. No Retirement. No code change. No commit / push / deploy.**
Awaiting Architect Review.
