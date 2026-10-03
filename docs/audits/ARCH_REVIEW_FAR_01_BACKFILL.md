# ARCH REVIEW — FAR-01 BACKFILL DESIGN

**Type:** Formal Architecture Review (documentation only)
**Date:** 2026-10-02
**Subject:** [DESIGN_FAR_01_BACKFILL.md](./DESIGN_FAR_01_BACKFILL.md)
**Prior gate:** [AUDIT_FAR_01_BACKFILL_DESIGN_FREEZE.md](./AUDIT_FAR_01_BACKFILL_DESIGN_FREEZE.md) · **DESIGN READY WITH CONDITIONS**
**Final decision:** **APPROVED WITH CONDITIONS**

```text
ARCH REVIEW                 = COMPLETE
FINAL DECISION              = APPROVED WITH CONDITIONS
IMPLEMENTATION GO           = NO
BACKFILL GO                 = NO
RETIREMENT GO               = NO
BACKFILL EXECUTION          = NOT STARTED · NOT AUTHORIZED
THIS REVIEW AUTHORIZES      = NOTHING executable
NEXT GATE                   = OWNER IMPLEMENTATION GO (separate) · then OD-BF-08
```

**APPROVED WITH CONDITIONS ≠ IMPLEMENT NOW.**
**APPROVED WITH CONDITIONS ≠ BACKFILL GO.**
**APPROVED WITH CONDITIONS ≠ RETIREMENT GO.**

---

## 1. Executive Summary

FAR-01 Backfill Design is architecturally fit for Strategy B after shipped DR-A (`f514a51`). Mapping, identity quarantine (OD-BF-01), integrity vocabulary with checksum NULL = UNKNOWN (OD-BF-02), destination non-overwrite, optimistic-lock DB gate, source-retaining rollback without feature flag (OD-BF-04), required telemetry (OD-BF-03), canary sequence (OD-BF-07), and separated authorization layers are coherent with existing FAR-01 code and locked OD-KEY-*.

Design Freeze Conditions **C-01…C-05** remain in force. This Arch Review **reaffirms C-04** (all GO flags stay NO) and **does not remove or reinterpret** any condition.

**Blockers for Arch approval:** NONE.
**Authorization to build or run:** NONE until separate Owner acts.

---

## 2. Architecture Context

| Layer | State |
|-------|--------|
| Strategy B | LOCKED (dual-read → backfill → retirement) |
| Phase 1 DR-A | SHIPPED @ `f514a51` |
| Dual-write | NO (OD-KEY-04) |
| DR-B | DEFERRED (OD-KEY-09) |
| Phase 0 readiness | READY WITH CONDITIONS |
| Backfill Design + OD-BF-01…08 | Design complete · policy locked |
| Design Freeze Audit | DESIGN READY WITH CONDITIONS · blockers NONE for Arch Review |
| Orphans | ARCH-04/05 · out of FAR-01 migrate set |
| Retirement | Separate future gate (OD-KEY-07) |

Canonical shapes:

```text
LEGACY:     user/{owner}/{beat}/master/{pathAsset}.bin
CANONICAL:  user/{owner}/{beat}/{assetId}/master.bin
```

Product SSOT @ `f514a51`: `buildUserBeatAudioObjectKey` (WRITE) · `buildLegacyUserBeatMasterObjectKey` (READ twin) · `isAuthorizedUserBeatObjectKeyRepresentation` (DR-A).

---

## 3. Evidence Sources

| Source | Role |
|--------|------|
| `DESIGN_FAR_01_BACKFILL.md` | Subject |
| `AUDIT_FAR_01_PHASE0_SOAK_BACKFILL_READINESS.md` | Live inventory / B-01 / checksum NULL ×68 |
| `AUDIT_FAR_01_BACKFILL_DESIGN_FREEZE.md` | C-01…C-05 · design consistency |
| `DESIGN_FREEZE_STORAGE_ARCH_02_KEY_FAR_01.md` | Prior Strategy B freeze |
| `ARCH_REVIEW_STORAGE_ARCH_02_KEY_FAR_01.md` | Prior FAR-01 arch conditions |
| `OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md` | OD-KEY-* |
| `FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md` | Live evidence limitations |
| Code helpers @ `f514a51` | Mapping / AuthZ existence (not backfill tooling) |

**Hierarchy:** CODE + REMOTE SCHEMA + PRODUCTION EVIDENCE > prose. Design text is not proof of implemented backfill tooling (none exists).

---

## 4. Architectural Fit

| Invariant | Preserved? | Verdict |
|-----------|------------|---------|
| Strategy B | YES | **PASS** |
| DR-A | YES (assumed live; dual-accept retained) | **PASS** |
| Canonical writer | Dest via WRITE SSOT only | **PASS** |
| Shared authorization helper | Twin equality via legacy builder; PATH ≠ AUTH | **PASS** |
| DB-authoritative identity | `asset.id` / `beats.owner_id` / `beat_id` | **PASS** |
| No dual-write | Explicit non-goal / AC-BF-17 | **PASS** |
| DR-B deferred | No Access Gate twin fetch in plan | **PASS** |
| Legacy source retention | OD-BF-04 | **PASS** |
| Separate retirement gate | RETIREMENT GO = NO | **PASS** |
| Orphans ARCH-04/05 | Out of set | **PASS** |

**No strategy contradiction.** Backfill Design’s stored-key + quarantine model correctly improves on Freeze §11.2 path-parse assert (aligned with Phase 0 identity anomaly).

---

## 5. Data Migration Safety

| Property | Assessment |
|----------|------------|
| Deterministic mapping | Dest from DB owner/beat/`asset.id` via SSOT builder · **PASS** |
| Authoritative identity | DB PK / FK · path is cross-check only · **PASS** |
| Owner / beat / asset binding | Required for MIGRATE · **PASS** |
| Destination uniqueness | Phase 0: 0 Storage / 0 DB collisions · design forbids overwrite · **PASS** (design) |
| No overwrite / no delete | Explicit · **PASS** |
| Source retention | Through backfill + soak · **PASS** |
| Resumability / idempotency | State table + optimistic lock · **PASS** |

**RISK (R-01):** Partial fleet (some rows canonical, some legacy) is inherent mid-batch; mitigated by DR-A dual-accept + source retention + detectable batch progress — acceptable for Strategy B.

---

## 6. Identity Anomaly Review (OD-BF-01)

| Requirement | Design | Arch verdict |
|-------------|--------|--------------|
| `asset.id` ≠ path UUID → QUARANTINE | YES | **PASS** |
| NO AUTOMATIC MIGRATION | YES | **PASS** |
| NO DB MUTATION | YES | **PASS** |
| No automatic repair | YES (new Owner act required for exception) | **PASS** |

**Architectural safety:** Quarantine-first avoids inventing ownership from path UUID and avoids rewriting identity without Owner review. **APPROVED** as the safe default for the known Phase 0 row and future mismatches.

---

## 7. Integrity Review (OD-BF-02)

| Requirement | Design | Verdict |
|-------------|--------|---------|
| PASS / FAIL / UNKNOWN / ANOMALY | Explicit §4.1 | **PASS** |
| checksum NULL = UNKNOWN ≠ PASS | Locked | **PASS** |
| Size-only path Owner-locked with explicit `checksum_status=UNKNOWN` | §4.4 / §7 | **PASS** |
| C-01 respected | Design keeps UNKNOWN label; Arch requires implementer discipline | **PASS** (condition remains) |

---

## 8. Size vs Cryptographic Identity (C-03)

| Claim | Allowed? |
|-------|----------|
| Source size == dest size ⇒ size match PASS | YES |
| Size match ⇒ cryptographic / content / checksum identity | **NO** |
| checksum NULL ⇒ overall checksum PASS | **NO** · remains UNKNOWN |

Arch Review **locks interpretation:** under current fleet (checksum NULL ×68), destination “identical” resume paths are **size-identity** unless a future checksum PASS exists. Aligns with OD-BF-02 and C-03. **Do not simplify.**

---

## 9. Preflight / Failure Model

Preflight covers required hazard classes with dispositions (FAIL / QUARANTINE / SKIP / MIGRATE / OWNER_REVIEW). Mutating preflight forbidden — **PASS**.

**CONDITION carry-forward (C-02):** “Unsupported asset/beat status” lacks a fixed Status cell and Owner-bound eligibility set. Architecturally acceptable as an **operational parameter** to bind **before Implementation GO**; not a strategy defect.

---

## 10. DB Mutation Gate

UPDATE `object_key` legacy → canonical only after:

identity OK · owner/beat OK · no OD-BF-01 anomaly · source exists · dest exists · size PASS · checksum PASS **or** OD-BF-02 UNKNOWN path with explicit telemetry · no conflict · optimistic lock `WHERE object_key = :sourceKey` · re-read confirm.

UNKNOWN is not silently promoted to checksum PASS — **PASS**.

**CONDITION (C-01):** Tooling output / operator reports must keep `checksum_status=UNKNOWN` visible when that path is used.

---

## 11. Rollback Architecture (OD-BF-04)

| Phase | Source | DB | Arch verdict |
|-------|--------|-----|--------------|
| PRE | Intact | No mutation | **PASS** |
| MID | Retained; partial detectable; revert migrated rows to legacy key possible | Leave incomplete on legacy | **PASS** |
| POST | Retained through soak; revert to legacy possible | No retirement | **PASS** |
| Retirement | Separate future gate | Not in backfill | **PASS** |

Rollback without feature flag is **architecturally viable** because Access Gate signs DB `object_key` and DR-A still accepts legacy twin for non-quarantined identities; reverting `object_key` restores the opaque legacy pointer while source bytes remain. **No source destruction required.**

**RISK (R-02):** Quarantined identity-mismatch rows may not regain DR-A binding ACCEPT even after “rollback” of a never-migrated row — playback via opaque key may still work; publish/binding remains DENY. Acceptable; do not “fix” via backfill.

---

## 12. Observability (OD-BF-03)

Required fields present and marked **REQUIRED** before live: `batch_id`, `asset_id`, `source_key`, `destination_key`, `started_at`, `finished_at`, `status`, `failure_reason`, `source_size`, `destination_size`, `checksum_status`, `DB_update_status`, `retry_count`.

Supports auditability, resume, incident diagnosis, batch reconciliation — **PASS** (design).
Runtime implementation — **EVIDENCE LIMITATION** / absent (expected).

---

## 13. Canary Architecture (OD-BF-07)

```text
DRY-RUN → CANARY → CANARY VERIFY → APPROVAL → FLEET
```

Same logic as fleet · no overwrite/delete · stoppable · auditable · non-anomalous only.
**Canary count = OWNER-DEFINED OPERATIONAL PARAMETER** — Agent must not set it. **PASS.**

---

## 14. Security Architecture

| Boundary | Verdict |
|----------|---------|
| DB-authoritative identity | **PASS** |
| Owner / beat / asset / bucket / purpose binding | **PASS** |
| No client object_key authority | **PASS** |
| No arbitrary path / cross-owner / traversal | **PASS** |
| No DR-B expansion | **PASS** |
| FAR-01 live IDOR / binding ACCEPT | **EVIDENCE LIMITATION** (NOT VERIFIED) — unchanged |

Backfill must not weaken product AuthZ; it migrates Storage+DB keys under operator control, not client-chosen paths.

---

## 15. Operational Model (OD-BF-06)

Authorized operator · preflight · dry-run · approval · canary · stop/abort · post-verify · audit — **PASS**.
No public UI / end-user trigger — **PASS**.
Named person/role = Owner-defined operational parameter — **PASS** (not invented here).

**RISK (R-03):** Operator error on LIVE without OD-BF-08 discipline — mitigated by explicit GO gate + canary + telemetry; remains a process risk until tooling hard-enforces mode gates.

---

## 16. C-01…C-05 Review

Exact text from Design Freeze Audit §21 — **not removed or reinterpreted**.

| ID | Condition (exact sense) | Architectural consequence | Design respects? | Further Owner decision? | Arch disposition |
|----|-------------------------|---------------------------|------------------|-------------------------|------------------|
| **C-01** | Preserve checksum UNKNOWN in all success narratives under OD-BF-02 | Prevents false integrity claims | YES in design policy | Enforce in impl schema/tests | **RETAIN** |
| **C-02** | Bind or clarify unsupported status eligibility before Implementation GO | Deterministic preflight disposition | PARTIAL (soft row) | YES — operational parameter before Impl GO | **RETAIN** |
| **C-03** | Treat “identical destination” as size-identity unless checksum PASS exists | Avoid crypto-equivalence fallacy | YES in Arch interpretation; design wording soft | Enforce naming in tooling | **RETAIN** |
| **C-04** | Arch Review must reaffirm Impl / Backfill / Retirement GO remain NO until separate Owner acts | Authorization boundary | YES | This review reaffirms **NO / NO / NO** | **RETAIN · REAFFIRMED** |
| **C-05** | Carry Phase 1 / Phase 0 evidence limitations unchanged | Honesty of proof | YES (this review §17 risks / limitations) | No reinterpretation | **RETAIN** |

---

## 17. Architectural Risks

| ID | Class | Description |
|----|-------|-------------|
| — | **BLOCKER** | **NONE** for Arch approval of the design |
| C-01…C-05 | **CONDITION** | See §16 |
| R-01 | **RISK** | Partial migration mid-fleet (mitigated by DR-A + retain source) |
| R-02 | **RISK** | Quarantined identity rows remain binding-DENY (by design) |
| R-03 | **RISK** | Operator LIVE without hard mode gates until impl enforces |
| R-04 | **RISK** | Retry leaving orphan dest objects if DB UPDATE never commits (design: no overwrite; cleanup policy later) |
| E-01…E-09 | **EVIDENCE LIMITATION** | Live binding/cross-owner/arbitrary NOT VERIFIED; checksum NULL ×68; telemetry unimplemented; external writers NOT VERIFIED; USER canonical PARTIAL; anomaly row exists |

---

## 18. Implementation Boundary

```text
Implementation GO = NO
Backfill GO       = NO
Retirement GO     = NO
```

This Arch Review may state architectural readiness of the **design**. It does **not**:

- authorize building tooling
- authorize dry-run against Production
- authorize canary/fleet copy or DB UPDATE
- authorize retirement

Phrase permitted: design is **APPROVED WITH CONDITIONS** for a future Implementation GO decision.
Phrase **forbidden** as an effect of this document: **IMPLEMENT NOW**.

---

## 19. Final Arch Decision

### **APPROVED WITH CONDITIONS**

Not selected:

- APPROVED FOR IMPLEMENTATION *(as an execution grant — not issued)*
- NOT APPROVED

Clarification: “APPROVED WITH CONDITIONS” means the **architecture of the design** is acceptable to proceed to the **next Owner authorization gate** (Implementation GO), subject to C-01…C-05. It is **not** an Implementation GO, Backfill GO, or Retirement GO.

---

## 20. Required Conditions

All remain mandatory:

1. **C-01** — Preserve checksum UNKNOWN in OD-BF-02 success narratives / telemetry.
2. **C-02** — Bind unsupported status eligibility before Implementation GO.
3. **C-03** — Identical destination = size-identity unless checksum PASS.
4. **C-04** — Implementation GO / Backfill GO / Retirement GO remain **NO** until separate Owner acts (**REAFFIRMED**).
5. **C-05** — Preserve Phase 0 / Phase 1 evidence limitations; do not rewrite NOT VERIFIED → PASS.

Additional Arch expectations (non-blocking, for Implementation Design / GO):

- AC-BF-01…17 remain the test contract when tooling is authorized.
- Canary count and soak duration remain Owner-defined operational parameters.
- Quarantine set includes known identity-mismatch asset until separate Owner disposition beyond OD-BF-01 default.

---

## 21. Next Gate

```text
NEXT GATE = OWNER IMPLEMENTATION GO
            (separate act · currently NO)
            must acknowledge C-01…C-05

THEN     = implement tooling + AC-BF tests (only if Impl GO granted)
THEN     = DRY-RUN → CANARY → VERIFY → APPROVAL
THEN     = OD-BF-08 OWNER BACKFILL GO (currently NO)
THEN     = FLEET LIVE
THEN     = post-backfill soak (OD-BF-05)
THEN     = retirement readiness — SEPARATE · RETIREMENT GO = NO
```

---

## Repository safety (this review)

| Check | Result |
|-------|--------|
| Existing docs modified | **NO** |
| Product code / DB / Storage | **NO** |
| Artifact | **Only** `docs/audits/ARCH_REVIEW_FAR_01_BACKFILL.md` |
| Commit / Push / Deploy | **NONE** |
| Dry-run / canary / copy / UPDATE | **NONE** |

---

**ARCH REVIEW COMPLETE**
**DECISION: APPROVED WITH CONDITIONS**
**IMPLEMENTATION GO = NO · BACKFILL GO = NO · RETIREMENT GO = NO**
