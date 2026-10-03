# AUDIT — FAR-01 PHASE 0 SOAK / BACKFILL READINESS

**Type:** Evidence-first readiness audit (documentation only)
**Date:** 2026-10-02
**Surface:** STORAGE-ARCH-02-KEY / FAR-01 · Phase 0 after Phase 1 DR-A
**Classification:** **READY WITH CONDITIONS**

```text
PHASE 1 DR-A               = SHIPPED / PRODUCTION VERIFIED — GREEN WITH EVIDENCE LIMITATIONS @ f514a51
PHASE 0 THIS AUDIT         = COMPLETE (docs-only)
BACKFILL                   = NOT STARTED · NOT AUTHORIZED by this audit
RETIREMENT                 = NOT STARTED
DR-B                       = DEFERRED
DUAL-WRITE                 = NO (OD-KEY-04)
ORPHANS                    = ARCH-04/05 · 30 unchanged
NEXT GATE                  = BACKFILL DESIGN / IMPLEMENTATION PLAN + OWNER GO
```

**This audit does NOT authorize backfill, Storage copy/move/delete, DB updates, dual-write, DR-B, retirement, or orphan GC.**

---

## 1. Executive Summary

FAR-01 Phase 1 DR-A is deployed and inventory-reconciled. Logical mapping for Strategy B backfill is largely sound: **68/68** legacy sources exist in Storage, **0/68** canonical destinations exist, **0** DB `object_key` duplicates, **0** DB rows already pointing at the computed canonical twin.

**Conditions / blockers that prevent an unconditional Owner GO:**

1. **Real blocker (1 row):** one legacy USER asset has `object_key` path-asset UUID ≠ `beat_audio_assets.id`. DR-A twin equality **fails** for that row (binding/publish would DENY). Naive “rebuild legacy from asset.id” is wrong; backfill must treat **stored** `object_key` as source and still needs an explicit Owner decision for this anomaly.
2. **Operational gap:** no backfill job, no migration telemetry, no DR-A feature-flag kill-switch (Design Freeze rollback assumes a flag that **is not implemented**).
3. **Integrity evidence gap:** all **68** legacy rows have `checksum_sha256 = NULL` → verification is size/existence only; per OD-KEY-08 this is **UNKNOWN**, not PASS.
4. **Evidence limitations retained** from Phase 1 Production Verify (live binding ACCEPT / cross-owner / arbitrary DENY not safely exercised).

**Verdict:** **READY WITH CONDITIONS** — Owner may proceed to a **backfill design/plan gate** after deciding the anomalous row and accepting observability/rollback gaps; this document is **not** an Owner GO for execution.

---

## 2. Current Baseline

| Item | Evidence | Status |
|------|----------|--------|
| Local HEAD | `3fb920f` `docs: close FAR-01 Phase 1` | **PASS** |
| `origin/main` | `3fb920f` | **PASS** |
| Production feature SHA | `f514a51` (`f514a516f2ac0a978b2fe5a3fb05dc300c6ab40e`) | **PASS** |
| GitHub Production deployment `6817346937` | `sha = f514a51…` · environment Production | **PASS** |
| FAR-01 implementation present | `audio-validation.ts`, `user-audio-authz.ts`, `far01-dra-dual-accept.test.ts`, live fixture writer updates | **PASS** |
| FAR-01 Phase 1 closeout docs | `FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md` @ `3fb920f` | **PASS** |
| Strategy B / OD-KEY-* | LOCKED in Owner Decisions | **PASS** (decision record) |
| Dual-write | No product dual-write path found | **PASS** (code) |
| Backfill tooling | None in repo | **NOT STARTED** |
| Retirement | None | **NOT STARTED** |
| DR-B | Deferred; no storage fallback twin fetch | **DEFERRED** |

---

## 3. Evidence Sources

| Source | Role | Used |
|--------|------|------|
| Git (`HEAD`, `origin/main`, `git show f514a51` / `3fb920f`) | Repo baseline | YES |
| GitHub Deployments API (`6817346937`) | Production feature SHA | YES |
| Code: `src/lib/beats/audio-validation.ts`, `user-audio-authz.ts`, `audio-access.ts`, `audio-transport.ts`, `service.ts` | DR-A / writer / Access Gate | YES |
| Unit: `far01-dra-dual-accept.test.ts` | Security contract (14 cases) | Cited (not re-executed this audit) |
| Supabase SQL `public.beat_audio_assets` + `public.beats` | Inventory / mapping | YES · **READ-ONLY** |
| Supabase SQL `storage.objects` (`bucket_id = 'beat-audio'`) | Source/destination/orphan existence | YES · **READ-ONLY** |
| Phase 1 closeout + Design Freeze + Owner Decisions | Prior gates / OD-KEY-08 / rollback design | YES (secondary to live evidence) |

**Not mutated:** Storage objects, DB rows, ENV, product code, deploy.

---

## 4. DR-A Soak Verification

| Check | Evidence | Result |
|-------|----------|--------|
| Canonical read path | Access Gate signs `asset.object_key`; canonical USER rows exist (DRAFT); platform playback verified in Phase 1 | **PASS** (platform) · **PARTIAL** (USER canonical still DRAFT-only) |
| Legacy twin read path (opaque DB key) | Access Gate uses DB `object_key` as-is; Phase 1 PV-03 PASS | **PASS** (playback) |
| Shared authorization helper | `isAuthorizedUserBeatObjectKeyRepresentation` + `assertUserBeatObjectKeyBinding` | **PASS** (code) |
| `assertUserAssetBinding` uses shared helper | `user-audio-authz.ts` | **PASS** (code) |
| Publish binding uses shared helper | `service.ts` → `assertUserBeatObjectKeyBinding` | **PASS** (code) |
| AuthZ-first / PATH ≠ AUTH | Identities from beat/asset DB context; path not used to establish ownership | **PASS** (code) |
| Exact DB/context-bound `assetId` | Binding compares to params/`asset.id` | **PASS** (code) |
| Exact `ownerId` / `beatId` binding | Twin/canonical built from authorized identities | **PASS** (code) |
| Arbitrary object_key rejection | Helper equality only; unit coverage | **PASS** (unit) · live **NOT VERIFIED** (Phase 1 PV-05) |
| Cross-owner rejection | Unit coverage | **PASS** (unit) · live **NOT VERIFIED** (Phase 1 PV-04) |
| Legacy binding ACCEPT live | Would require PUBLISHED→mutation / DRAFT fixtures | **NOT VERIFIED** (Phase 1 PV-03b) |
| No legacy write path (product) | WRITE SSOT = `buildUserBeatAudioObjectKey` in `audio-transport.ts` | **PASS** (code) |
| No dual-write | No second Storage write of legacy twin | **PASS** (code search) |
| No backfill | No migration/copy job | **PASS** |
| No retirement | No delete of legacy masters | **PASS** |
| No implicit fallback beyond DR-A | Access Gate does **not** attempt DR-B twin fetch; signs DB key only | **PASS** (code) · DR-B still **DEFERRED** |
| Soak window duration / AC-10 metrics | No defined elapsed window; no `fallback_count` / `legacy_read_count` instrumentation | **NOT VERIFIED** (operational) |

**Soak note:** “Soak” here means post-deploy dual-accept is live without observed regression (Phase 1 Regression PASS) **and** inventory stable. It does **not** mean a quantified retirement soak (AC-10). That remains a future gate.

---

## 5. Inventory Reconciliation

**Live read-only SQL (2026-10-02) — `beat_audio_assets` ⋈ `beats` ⋈ `storage.objects`.**

### 5.1 Shape × beat status

| Shape | Beat status | Asset status | Count |
|-------|-------------|--------------|------:|
| Legacy USER `…/master/{uuid}.bin` | PUBLISHED | READY | **68** |
| Canonical USER `…/{asset}/master.bin` | DRAFT | READY | **2** |
| Platform | PUBLISHED | READY | **2** |
| Platform | DRAFT | READY | **1** |

Asset enum is `READY` (not “PUBLISHED”); closeout language “68 legacy USER published” refers to **beat** PUBLISHED — confirmed.

### 5.2 Storage reconcile (`bucket_id = 'beat-audio'`)

| Metric | Count |
|--------|------:|
| DB rows (`beat-audio`) | **73** |
| Storage objects | **103** |
| `missing_storage` (DB key absent in Storage) | **0** |
| Orphans (Storage without DB) | **30** |
| Storage legacy-shaped objects | **96** (= 68 DB + 28 orphan legacy) |
| Storage K-04 `users/…` | **2** |
| Storage canonical USER | **2** |
| Storage platform | **3** |

Orphans remain **ARCH-04/05** — not FAR-01 migrate set.

### 5.3 Duplicates / collisions (DB)

| Check | Result |
|-------|--------|
| Duplicate `object_key` among DB rows | **0** |
| Distinct computed canonical targets for 68 legacy | **68** (1:1) |
| DB row already storing computed canonical twin | **0** |
| Storage object already at computed canonical twin | **0** |
| Legacy source exists in Storage | **68 / 68** |

### 5.4 Path vs DB identity (critical)

| Check | Count |
|-------|------:|
| Legacy rows where path owner/beat/asset == DB owner/beat/`id` | **67** |
| Legacy rows where path **asset** UUID ≠ `beat_audio_assets.id` | **1** |
| Owner/beat path mismatches | **0** |
| Non-USER ownership among legacy | **0** |

**Anomaly (BLOCKER for unconditional fleet GO):**

| Field | Value |
|-------|--------|
| Asset id | `000d406d-265e-4e49-bd3f-a542d5dd0b41` |
| Beat id | `520b9eb8-1ae8-49e6-8a4a-e5f7a8533d85` |
| Stored `object_key` | `user/e5f13715-…/520b9eb8-…/master/ef9e21dc-d941-4608-b26e-ee4ea417ad63.bin` |
| Path asset UUID | `ef9e21dc-d941-4608-b26e-ee4ea417ad63` |
| `replaced_by_asset_id` | NULL |
| Row for path UUID `ef9e21dc-…` | **not found** in `beat_audio_assets` |
| DR-A expected twin (from `asset.id`) | `…/master/000d406d-….bin` ≠ stored key |
| DR-A binding for this row | **Would DENY** |
| Access Gate playback | Still possible via opaque DB `object_key` (no twin rebuild) |

### 5.5 Checksums

| Population | `checksum_sha256` NULL | `byte_size` NULL |
|------------|------------------------:|----------------:|
| Legacy USER (68) | **68** | **0** |
| Canonical USER (2) | **0** | **0** |
| Platform (3) | **0** | **0** |

Per **OD-KEY-08**: NULL checksum = **UNKNOWN / unverifiable via hash**, not automatic PASS.

---

## 6. Legacy Writer Audit

Search scope: `src/`, `scripts/`, `*.sql` for legacy shape builders / literals / uploads.

| ID | Location | Function / context | Character | Writes Storage? | Production reachable? |
|----|----------|--------------------|-----------|-----------------|------------------------|
| W-01 | `audio-validation.ts` `buildLegacyUserBeatMasterObjectKey` | Twin derivation for DR-A compare | **D. read-only legacy reference** | NO | YES (import) but **not** used as upload key |
| W-02 | `audio-validation.ts` `isAuthorized…` / `assertUserBeatObjectKeyBinding` | Accept canonical **or** twin | **D** | NO | YES (AuthZ) |
| W-03 | `audio-transport.ts` USER session | `buildUserBeatAudioObjectKey` → `createSignedUploadUrl` | **A. production writer (canonical)** | YES (canonical only) | YES |
| W-04 | `audio-transport.ts` platform paths | `buildBeatAudioObjectKey` | **A. production writer (platform)** | YES | YES |
| W-05 | `far01-dra-dual-accept.test.ts` | Constructs legacy strings for DENY/ACCEPT | **B. test/fixture** | NO | NO |
| W-06 | Live tests (`wave2–4`, `d02`, `wave5`) | Seed via `buildUserBeatAudioObjectKey` (post Phase 1) | **B. test/fixture (canonical)** | YES if run against live project | Only if live tests executed against Production |
| W-07 | `scripts/_live_verify_phase15_audio.mjs` | Uploads `platform/{draft}/…` | Platform script | YES | Ops-only · not legacy USER |
| W-08 | SQL migrations / seeds | No `/master/{asset}.bin` USER writers found | — | — | **NONE found** |
| W-09 | Admin/API client-chosen key | `rejectClientChosenStorageParams` | DENY | NO | YES (rejects) |

**Summary**

- **A. production writer creating K-02:** **NONE found**
- **B. test/fixture K-02 writers:** unit strings only; live fixtures stopped seeding legacy (Phase 1)
- **C. migration/backfill tooling:** **NONE**
- **D. read-only legacy reference:** twin builder + validators

**Residual risk (ops):** historical growth of legacy inventory and live-test access to Production remains an Owner open question (Design Freeze Q3/Q6) — **NOT VERIFIED** that no external/ops tool writes K-02 outside this repo.

---

## 7. Mapping Safety

Target mapping (Strategy B):

```text
source (stored):  user/{owner}/{beat}/master/{…}.bin   (= row.object_key)
target (DB ids):  user/{owner}/{beat}/{assetId}/master.bin
                  via buildUserBeatAudioObjectKey({ ownerId, beatId, assetId, purpose: MASTER })
```

| Question | Answer | Evidence |
|----------|--------|----------|
| A. Deterministic? | **YES** for target from DB owner/beat/`asset.id` | Code builder |
| B. 1:1? | **YES** for 68 distinct targets | SQL |
| C. `asset_id` unambiguous? | **YES** as PK; **BUT** 1 stored path embeds a different UUID | SQL anomaly |
| D. owner/beat from DB? | **MUST** — Design Freeze / DR-A; path may be cross-checked | Code + SQL (owner/beat match on all 68) |
| E. Canonical destination collide? | **NO** DB or Storage collision today | SQL |
| F. Source object exists? | **YES** 68/68 | `storage.objects` |
| G. DB `object_key` == Storage source? | **YES** (`missing_storage=0`) | SQL |
| H. Checksum/size verification possible? | Size: **YES**; checksum: **NO** for legacy (all NULL) | Schema + SQL |
| I. NULL checksum semantics? | **UNKNOWN / NIEPOTWIERDZONE** — not auto PASS (OD-KEY-08) | Locked OD |
| J. Rollback before retirement? | **Designed** (retain source; revert `object_key`) · **not implemented** as tooling | Design Freeze §17 |
| K. Legacy source retained during backfill? | **Required by design**; nothing deletes today | Design + code absence |

**Safe operational rule for future backfill (design only):**

1. `sourceKey = row.object_key` (never rebuild from path parse alone).
2. `targetKey = buildUserBeatAudioObjectKey(DB owner, beat.id, asset.id)`.
3. Require `source exists` AND `destination absent` (or identical content policy).
4. Quarantine rows where `object_key ≠ buildLegacyUserBeatMasterObjectKey(DB ids)` until Owner decision — **currently 1 row**.

---

## 8. Destination Collision Audit

| Scenario | Count | Classification |
|----------|------:|----------------|
| Destination absent (Storage) | **68** | **CLEAR** for copy |
| Destination already exists (Storage) | **0** | — |
| Destination already referenced by another DB row | **0** | — |
| Same bytes / copy-done candidates | **0 observed** | N/A |

**No fleet-wide CONFLICT.**
**Per-row exception:** identity-mismatched asset (Section 5.4) = **BLOCKER / NEEDS DECISION** before including that row in any backfill batch (not a destination conflict; an identity/integrity conflict).

---

## 9. Security Gate

| Invariant | Code / test evidence | Live prod |
|-----------|----------------------|-----------|
| AuthZ first | Access Gate + transport AuthZ before sign/upload | Phase 1 regression PASS |
| DB asset lookup | Access / transport load asset by id | PASS (architecture) |
| Owner / beat / asset binding | Shared DR-A helper | Unit PASS · binding live **NOT VERIFIED** |
| Bucket binding | `storage_bucket === beat-audio` in `assertUserAssetBinding` | PASS (code) |
| Purpose binding | MASTER required in binding | PASS (code) |
| Canonical representation | Equality to WRITE SSOT | Unit PASS |
| Legacy twin representation | Equality to deterministic twin | Unit PASS · **67/68** rows match twin; **1** would DENY |
| Arbitrary path rejection | Non-twin legacy DENY | Unit PASS · live **NOT VERIFIED** |
| Cross-owner rejection | Unit PASS · live **NOT VERIFIED** |
| Client-supplied `object_key` rejection | `rejectClientChosenStorageParams` | PASS (code) |
| Encoded traversal `..` / `//` | Rejected in helper + `validateObjectKey` | Unit PASS |
| Duplicate representation | Only two exact strings accepted | PASS (code) |

Unit security contract at deployed SHA: **`far01-dra-dual-accept.test.ts` = 14/14** (Phase 1 evidence).
**Do not claim** full production binding/IDOR proof.

---

## 10. Observability Readiness

Design Freeze §16 lists counters (`legacy_read_count`, `migration_success_count`, …).

| Signal | Implemented in product? |
|--------|-------------------------|
| Successful / failed copies | **GAP** — no backfill job |
| Source missing / destination conflict | **GAP** (SQL can be run manually) |
| Checksum / size mismatch | **GAP** (size available; checksum NULL) |
| DB update success/failure | **GAP** |
| Remaining legacy / canonical counts | **Manual SQL only** (this audit) |
| Fallback reads / legacy reads | **GAP** — Access Gate has no counter; DR-B absent |

**Classification:** **OPERATIONAL GAP** — does not block writing a backfill **plan**, but **must** be addressed before unsupervised production execution.

---

## 11. Rollback Readiness

| Phase | Design intent | Implemented? |
|-------|---------------|--------------|
| PRE-BACKFILL | Feature flag / gate OFF → dual-accept DENY; sources intact | **GAP** — **no feature flag**; DR-A is compile-time always-on @ `f514a51`. Sources intact = **YES** |
| MID-BACKFILL | Stop job; leave failed rows on legacy `object_key`; retain sources; detect partial progress | **Documented only** — no job exists |
| POST-BACKFILL | Retain sources through soak; retirement decoupled | **Documented** (OD-KEY-07) · retirement **NOT STARTED** |

**Rollback readiness:** **PARTIAL / DOCUMENTED** — safe physical rollback depends on **retaining legacy objects** (currently true) and ability to `UPDATE object_key` back. Pre-backfill “flag OFF” recovery path is **not** available without a code change (out of scope here).

---

## 12. Evidence Limitations

Preserve explicitly (from Phase 1 + this audit):

1. DR-A binding/publish ACCEPT for legacy twin — **NOT VERIFIED** live (68 beats PUBLISHED; safe test needs mutation/fixtures).
2. USER canonical playback — **PARTIAL** (2 DRAFT only).
3. Cross-owner DENY — **NOT VERIFIED** live (unit covered).
4. Arbitrary legacy DENY — **NOT VERIFIED** live (unit covered).
5. Quantified soak window / `fallback_count=0` — **NOT VERIFIED** (metrics absent; window unset).
6. External/ops writers outside repo — **NOT VERIFIED**.
7. Content hash integrity for legacy fleet — **UNKNOWN** (`checksum_sha256` NULL × 68).

Unit security contract verified at deployed SHA; selected production binding/IDOR scenarios remain **NOT VERIFIED** because safe production execution would require mutation/fixtures.

---

## 13. Blockers

| ID | Type | Detail |
|----|------|--------|
| **B-01** | **Real blocker** | 1/68 legacy row: path asset UUID ≠ `asset.id` → DR-A twin DENY; must not be auto-migrated without Owner decision + explicit source=stored-key policy |
| **B-02** | Condition (ops) | No backfill implementation / runbook / kill-switch flag |
| **B-03** | Condition (integrity) | 68/68 legacy checksum NULL → size-only verify |

No fleet-wide destination CONFLICT found.

---

## 14. Operational Gaps

1. No migration job / dry-run CLI.
2. No product telemetry for legacy/canonical reads or migration outcomes.
3. No DR-A feature flag (Design Freeze rollback assumption unmet).
4. Soak duration for post-backfill retirement still **OPEN** (Design Freeze Q1).
5. Operator model unset (Owner script vs CI vs admin-only — Q5).
6. Live-test / Production isolation policy still OPEN (Q6).

---

## 15. Owner Decisions Required

Before any Backfill Implementation GO:

1. **Disposition of anomaly asset** `000d406d-…` (exclude / manual repair / migrate using stored `object_key` after content review).
2. **Accept size-only integrity** for legacy fleet under OD-KEY-08, or mandate pre-backfill checksum fill (separate change).
3. **Observability minimum** required before production batch (manual SQL OK vs product counters).
4. **Rollback story without feature flag** — accept code-revert / always-on dual-accept during backfill window, or require a flag gate first.
5. **Soak window length** post-backfill before retirement planning.
6. **Who operates** the backfill and against which environment controls.
7. Separate **Owner GO** for backfill execution after plan/Design (this audit ≠ GO).

---

## 16. Final Readiness Classification

### **READY WITH CONDITIONS**

| Category | Assessment |
|----------|------------|
| Real blocker | **B-01** anomalous identity row (1) |
| Evidence limitation | Phase 1 live IDOR/binding gaps + no soak metrics |
| Operational gap | Tooling, telemetry, feature-flag rollback |
| Documentation gap | Minor — freeze/rollback documented; flag not real |

**Not** `READY FOR OWNER GO` (unconditional).
**Not** `NOT READY` for planning — destination safety and mapping determinism for **67/68** are evidence-backed.

---

## 17. Recommended Next Gate

```text
NEXT GATE = FAR-01 BACKFILL DESIGN / IMPLEMENTATION PLAN
            (docs + Owner decisions on B-01 / OD-KEY-08 / observability)
         → then separate OWNER IMPLEMENTATION GO
         → then controlled dry-run / batch backfill
         → retirement remains LATER (OD-KEY-07)
```

**Explicitly not next:** Design Freeze rewrite, Arch Review, Owner GO text claiming execution authority, code, Storage copy, DB update, deploy.

---

## Repository safety (this audit session)

| Check | Result |
|-------|--------|
| Product code changed | **NO** |
| DB / Storage / Auth / ENV | **NO** (read-only SQL only) |
| Backfill / retirement executed | **NONE** |
| Files written | **Only** this audit markdown |
| Commit / Push / Deploy | **NONE** |

---

**PHASE 0 AUDIT COMPLETE**
**CLASSIFICATION: READY WITH CONDITIONS**
**BACKFILL: NOT STARTED · NOT AUTHORIZED**
