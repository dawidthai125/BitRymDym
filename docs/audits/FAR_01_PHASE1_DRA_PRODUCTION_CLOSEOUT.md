# FAR-01 / STORAGE-ARCH-02-KEY — PHASE 1 DR-A — PRODUCTION CLOSEOUT

**Type:** Production closeout (documentation only)  
**Date:** 2026-10-02  
**Surface:** STORAGE-ARCH-02-KEY / FAR-01 · Phase 1 DR-A (controlled dual-accept)  
**Status:** **SHIPPED** · **PRODUCTION VERIFIED — GREEN WITH EVIDENCE LIMITATIONS**

```text
FAR-01 PHASE 1 DR-A        = SHIPPED / PRODUCTION VERIFIED — GREEN WITH EVIDENCE LIMITATIONS @ f514a51
IMPLEMENTED                = YES (Phase 1 only)
COMMITTED                  = YES @ f514a51
PUSHED                     = YES (origin/main)
DEPLOYED                   = YES
PRODUCTION VERIFIED        = GREEN WITH EVIDENCE LIMITATIONS
BACKFILL                   = NOT STARTED
RETIREMENT                 = NOT STARTED
DR-B                       = DEFERRED
ORPHANS                    = ARCH-04/05 (untouched · 30)
NEXT GATE                  = PHASE 0 SOAK / BACKFILL READINESS AUDIT
```

**This closeout does NOT authorize backfill, dual-write, DR-B, retirement, or orphan GC.**

Parent Production tip before this ship: `0afa29b` (Polish UX).

---

## 1. Production Evidence

| Field | Value |
|-------|--------|
| Production URL | https://www.bitrymdym.pl |
| **Application SHA** | `f514a516f2ac0a978b2fe5a3fb05dc300c6ab40e` (`f514a51`) |
| Commit message | `feat(storage): add FAR-01 DR-A dual-read` |
| GitHub Production deployment | `6817346937` |
| Vercel deployment | `dpl_HuRoZ9MQ7VM5jYmeJ19YJsoasM7h` |
| Deployment state | Ready / success |
| Alias | `www.bitrymdym.pl` → this deployment |
| Final verification | **PRODUCTION VERIFIED — GREEN WITH EVIDENCE LIMITATIONS** |

### Exact product files in release `f514a51` (8)

1. `src/lib/beats/audio-validation.ts`
2. `src/lib/beats/user-audio-authz.ts`
3. `src/lib/beats/far01-dra-dual-accept.test.ts`
4. `src/lib/takes/wave2-live.test.ts`
5. `src/lib/takes/wave3-live.test.ts`
6. `src/lib/takes/wave4-live.test.ts`
7. `src/lib/takes/d02-live.test.ts`
8. `src/lib/grants/wave5-live.test.ts`

---

## 2. Scope closed (Phase 1 only)

| Item | Status |
|------|--------|
| Shared DR-A helper `isAuthorizedUserBeatObjectKeyRepresentation` | DONE |
| Deterministic legacy twin builder (READ/ACCEPT only) | DONE |
| `assertUserBeatObjectKeyBinding` dual-accept | DONE |
| `assertUserAssetBinding` uses shared helper (no exact-canonical-only gate) | DONE |
| Canonical WRITE SSOT `buildUserBeatAudioObjectKey` unchanged | DONE |
| Stop new legacy seeding in live test fixtures (OD-KEY-06) | DONE |
| Dual-write | **NOT IMPLEMENTED** (OD-KEY-04 = NO) |
| DR-B storage fallback | **DEFERRED** (OD-KEY-09) |
| Backfill / Storage copy / DB mass update | **NOT STARTED** |
| Legacy retirement | **NOT STARTED** |
| Orphan GC | **OUT OF SCOPE** (ARCH-04/05) |
| UI | **NONE** |

---

## 3. Production verification matrix

| ID | Check | Result |
|----|-------|--------|
| PV-01 | Production SHA `f514a51` | **PASS** |
| PV-02 | Canonical MASTER playback | **PASS** (platform) · **PARTIAL** (USER canonical = DRAFT only) |
| PV-03 | Legacy twin Access Gate / opaque DB key | **PASS** |
| PV-03b | DR-A binding/publish ACCEPT for legacy twin | **NOT VERIFIED** (safe prod limitation) |
| PV-04 | Cross-owner DENY live | **NOT VERIFIED** (unit covered) |
| PV-05 | Arbitrary legacy DENY live | **NOT VERIFIED** (unit covered) |
| PV-06 | Canonical writer | **PASS** |
| PV-07 | No dual-write | **PASS** |
| PV-08 | No backfill | **PASS** |
| PV-09 | Orphans untouched (30) | **PASS** |
| Regression | Beat detail / Access Gate / signed URL | **PASS** |
| Unit | `far01-dra-dual-accept.test.ts` | **14/14 PASS** @ deployed SHA |

Do **not** treat NOT VERIFIED / PARTIAL rows as FAIL or as observed regression.

---

## 4. Evidence limitations (exact — preserve)

Unit security contract verified at deployed SHA; selected production binding/IDOR scenarios remain **NOT VERIFIED** because safe production execution would require mutation/fixtures.

### A. DR-A binding / publish ACCEPT for legacy twin

**NOT VERIFIED** in production.

**Reason:** All **68** legacy USER assets are **PUBLISHED**. Exercising transport binding / publish dual-accept safely would require status/asset mutation.

### B. USER canonical playback

**PARTIAL.**

**Reason:** Only **2** USER canonical assets exist and both are **DRAFT** (no public catalog Access Gate path).

### C. PV-04 Cross-owner

**NOT VERIFIED** live. Unit contract coverage exists at `f514a51`.

### D. PV-05 Arbitrary legacy

**NOT VERIFIED** live. Unit contract coverage exists at `f514a51`.

---

## 5. Live inventory (unchanged by Phase 1)

| Shape | Count | Notes |
|-------|------:|-------|
| Legacy USER `…/master/{asset}.bin` | **68** | All PUBLISHED — **not migrated** |
| Canonical USER `…/{asset}/master.bin` | **2** | DRAFT only |
| Platform canonical | **3** | |
| Orphan `beat-audio` objects | **30** | ARCH-04/05 · untouched |

Phase 1 did **not** migrate legacy inventory.

---

## 6. Explicitly NOT authorized by this closeout

```text
BACKFILL                 = NOT STARTED · requires separate Owner GO after soak
RETIREMENT               = NOT STARTED · OD-KEY-07 after backfill + soak + readiness
DR-B                     = DEFERRED · not Phase 1
DUAL-WRITE               = FORBIDDEN (OD-KEY-04 = NO)
ORPHAN GC                = ARCH-04/05
EXTERNAL OBJECT STORAGE  = STORAGE-ARCH-02 (separate)
```

**Next gate:** **PHASE 0 SOAK / BACKFILL READINESS AUDIT**  
Backfill requires a **separate Owner GO** after soak/evidence. This closeout does **not** grant it.

---

## 7. Canonical docs

| Doc | Role |
|-----|------|
| [AUDIT_STORAGE_ARCH_02_KEY_FAR_01.md](./AUDIT_STORAGE_ARCH_02_KEY_FAR_01.md) | Audit |
| [DESIGN_FREEZE_STORAGE_ARCH_02_KEY_FAR_01.md](./DESIGN_FREEZE_STORAGE_ARCH_02_KEY_FAR_01.md) | Design Freeze |
| [ARCH_REVIEW_STORAGE_ARCH_02_KEY_FAR_01.md](./ARCH_REVIEW_STORAGE_ARCH_02_KEY_FAR_01.md) | Arch Review |
| [OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md](./OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md) | Owner Decisions LOCKED |
| This file | Phase 1 Production Closeout |

---

## 8. Repository safety (closeout session)

| Check | Result |
|-------|--------|
| Product code changed (this closeout) | **NO** |
| DB / Storage / Auth / ENV | **NO** |
| Backfill / retirement | **NONE** |
| Commit (closeout docs) | **NONE** (Owner: stop after docs) |
| Push / Deploy | **NONE** |
