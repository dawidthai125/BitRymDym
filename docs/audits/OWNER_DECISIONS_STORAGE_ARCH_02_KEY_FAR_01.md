# OWNER DECISIONS — STORAGE-ARCH-02-KEY / FAR-01

**Type:** Owner Decision Record (registration only)  
**Date:** 2026-10-02  
**Status:** **LOCKED** · **Phase 1 DR-A SHIPPED** @ `f514a51`  
**Sources:**  
- [AUDIT_STORAGE_ARCH_02_KEY_FAR_01.md](./AUDIT_STORAGE_ARCH_02_KEY_FAR_01.md)  
- [DESIGN_FREEZE_STORAGE_ARCH_02_KEY_FAR_01.md](./DESIGN_FREEZE_STORAGE_ARCH_02_KEY_FAR_01.md)  
- [ARCH_REVIEW_STORAGE_ARCH_02_KEY_FAR_01.md](./ARCH_REVIEW_STORAGE_ARCH_02_KEY_FAR_01.md)  
- [FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md](./FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md)

```text
PHASE 1 DR-A               = SHIPPED / PRODUCTION VERIFIED — GREEN WITH EVIDENCE LIMITATIONS @ f514a51
BACKFILL                   = NOT STARTED
RETIREMENT                 = NOT STARTED
DR-B                       = DEFERRED
NEXT GATE                  = PHASE 0 SOAK / BACKFILL READINESS AUDIT
```

**This document registers Owner Decisions.**  
Phase 1 Implementation GO was granted and shipped separately.  
**Backfill / retirement still require separate Owner GO.**

---

## Gate posture

| Gate | Status |
|------|--------|
| Audit | COMPLETE |
| Design Freeze | COMPLETE (PASS WITH CONDITIONS) |
| Arch Review | COMPLETE (PASS WITH CONDITIONS) |
| **Owner Decisions (this record)** | **LOCKED** |
| Phase 1 Implementation GO | **GRANTED / SHIPPED** @ `f514a51` |
| Phase 1 Production Verify | **GREEN WITH EVIDENCE LIMITATIONS** |
| Backfill / Retirement GO | **NOT GRANTED** |

---

## Locked strategy

**STRATEGY = B**

```text
dual-read (Phase 1 = DR-A)
  → backfill (only after dual-read deployed + verified)
  → verification / soak
  → legacy retirement (only after backfill + soak + safety/rollback readiness)
```

Dual-write: **OFF**  
DR-B Phase 1: **DEFERRED / NOT IMPLEMENTED**

---

## Critical implementation condition (Arch Review — binding)

Dual-accept **MUST NOT** be implemented solely via `validateObjectKey`.

`assertUserAssetBinding` currently requires exact canonical match and **MUST** be covered by a **shared, controlled helper** that accepts **only**:

1. canonical DB `object_key`, or  
2. the deterministic legacy twin derived from the **same** asset / owner / beat context.

PATH ≠ AUTHORIZATION. AuthZ before key acceptance. Client-chosen keys remain DENY.

---

## Decision table

| ID | Status | Decision (Owner — exact) |
|----|--------|--------------------------|
| **OD-KEY-01** | **GO** | GO dla realizacji STORAGE-ARCH-02-KEY / FAR-01. |
| **STRATEGY** | **B** | B — dual-read → backfill → retirement. |
| **OD-KEY-03** | **LOCKED** | Phase 1 używa **DR-A**. **DR-B** nie jest wymagane w Phase 1 i pozostaje opcjonalnym cutover net. |
| **OD-KEY-04** | **NO** | Dual-write nie jest wymagane. |
| **OD-KEY-05** | **LOCKED** | Backfill może nastąpić dopiero po poprawnym wdrożeniu i zweryfikowaniu dual-read. |
| **OD-KEY-06** | **TAK** | Należy zatrzymać dalsze seedowanie legacy object keys. Nie dodawać nowych writerów legacy. Nie modyfikować istniejących legacy rekordów poza kontrolowanym procesem migracyjnym. |
| **OD-KEY-07** | **LOCKED** | Retirement legacy keys dopiero po zakończeniu backfill + verification/soak window oraz po spełnieniu wszystkich warunków bezpieczeństwa i rollback readiness. |
| **OD-KEY-08** | **LOCKED** | `checksum = NULL` oznacza brak możliwości wykonania checksum verification. Nie traktować NULL jako automatycznego PASS. Migracja musi zachować integralność danych zgodnie z dostępnym poziomem evidence. |
| **OD-KEY-09** | **DEFERRED** | DR-B deferred / optional. Nie implementować DR-B w Phase 1. |

---

## Verification checklist (registration)

| # | Check | Result |
|---|-------|--------|
| 1 | OD-KEY-01..09 unambiguous | **PASS** |
| 2 | Strategy B explicit | **PASS** |
| 3 | DR-A = Phase 1 | **PASS** (OD-KEY-03) |
| 4 | DR-B deferred | **PASS** (OD-KEY-03 · OD-KEY-09) |
| 5 | Dual-write off | **PASS** (OD-KEY-04 = NO) |
| 6 | Retirement not premature | **PASS** (OD-KEY-07 after backfill + soak + readiness) |
| 7 | checksum=NULL semantics | **PASS** (OD-KEY-08 — not auto PASS) |
| 8 | Implementation NOT READY until separate Owner GO | **PASS** |

---

## Out of scope (unchanged; not re-decided)

| Item | Status |
|------|--------|
| 30 orphan `beat-audio` objects | ARCH-04/05 — not FAR-01 migrate/retire set |
| External Object Storage | STORAGE-ARCH-02 docs-complete — separate |
| Platform keys | Untouched |
| Living SSOT (`PROJECT_STATE`, `MASTER_HANDOFF`, `CHANGELOG`) | **Not modified** in this registration |

---

## Phase authorization map (informational)

| Phase | Content | Authorized by this record? |
|-------|---------|----------------------------|
| Decision lock | Strategy B + OD-KEY-* | **YES** |
| Implementation Phase 0 (guardrail) | OD-KEY-06 | **NO** — needs Implementation GO |
| Implementation Phase 1 (DR-A) | OD-KEY-03 · OD-KEY-09 | **NO** — needs Implementation GO |
| Implementation Phase 2 (backfill) | OD-KEY-05 · OD-KEY-08 | **NO** — needs Implementation GO **after** dual-read verified |
| Implementation Phase 4 (retirement) | OD-KEY-07 | **NO** — needs Implementation GO **after** soak + readiness |

---

## Repository safety

| Check | Result |
|-------|--------|
| Product code changed | **NO** |
| DB / Storage / Auth / ENV | **NO** |
| Commit / Push / Deploy | **NONE** |
| Artifact | This decision record + pointers in Design Freeze / Arch Review |

---

**OWNER DECISION RECORD COMPLETE**  
**IMPLEMENTATION: NOT READY**  
**COMMIT/PUSH/DEPLOY: NONE**
