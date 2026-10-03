# ARCHITECTURE REVIEW — STORAGE-ARCH-02-KEY / FAR-01

**Type:** Architecture Review only (NO IMPLEMENTATION)
**Date:** 2026-10-02
**Reviewer:** Cursor Agent
**Audit:** [AUDIT_STORAGE_ARCH_02_KEY_FAR_01.md](./AUDIT_STORAGE_ARCH_02_KEY_FAR_01.md)
**Design Freeze:** [DESIGN_FREEZE_STORAGE_ARCH_02_KEY_FAR_01.md](./DESIGN_FREEZE_STORAGE_ARCH_02_KEY_FAR_01.md)
**Production app:** `0afa29b` · Docs tip: `b667e54`

```text
PRODUCT CODE CHANGED   = NO
DB / STORAGE / AUTH    = NO
COMMIT / PUSH / DEPLOY = NONE
```

**Final status:** **ARCH REVIEW COMPLETE — OWNER DECISIONS LOCKED**
**Owner Decisions:** [OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md](./OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md)
**Implementation GO:** **NOT GRANTED**

**Security Gate:** **PASS WITH CONDITIONS** (not BLOCKED — see §11 / §15)

---

## 1. Review Scope

Review proposed **Strategy B** (dual-read → backfill → verification → retirement) and related freeze designs against **live code + prior audit evidence**.

**In scope:** beat-audio USER key FAR-01 · DR-A · DR-B · no dual-write claim · backfill · guardrail · retirement · security · observability · rollback.

**Out of scope:** implementation · orphans (30 → ARCH-04/05) · external Object Storage · UI redesign · Owner strategy selection.

**Principles checked:** SSOT FIRST · REUSE FIRST · ZERO DUPLICATE LOGIC · PATH ≠ AUTHORIZATION.

---

## 2. Evidence Base

| Layer | Source | Used |
|-------|--------|------|
| CODE | `audio-validation.ts`, `user-audio-authz.ts`, `audio-access.ts`, `audio-transport.ts`, `service.ts` (publish), `render-source-core.ts` | YES |
| LIVE SQL | Audit 2026-10-02 (68/73, orphans 30) | YES (not re-run this review) |
| Design Freeze | DESIGN_FREEZE_STORAGE_ARCH_02_KEY_FAR_01.md | YES |
| Docs SSOT | STORAGE-ARCH-01 OD-SA-02 | Context only |

**Hierarchy:** CODE > live SQL (audit) > freeze docs.

---

## 3. Current Architecture

### 3.1 Consistency matrix (proposed B vs code)

| Element | Evidence | Status |
|---------|----------|--------|
| Canonical key builder | `buildUserBeatAudioObjectKey` → `user/{owner}/{beat}/{asset}/{purpose}.bin` | **PASS** |
| Playback | `requestBeatAudioAccess`: AuthZ (`canRequestBeatAudioAccess`) → `resolveActiveAsset` from DB → `createSignedUrl(asset.object_key)` — **no** key-shape validate | **PASS** |
| Publish binding | `assertActiveMasterReadyForPublish` → `assertUserBeatObjectKeyBinding` on DB `object_key` | **PASS** (canonical-only today) |
| USER transport binding | `assertUserAssetBinding`: ownership checks → `assertUserBeatObjectKeyBinding` → **exact** `=== buildUserBeatAudioObjectKey` | **PASS** (canonical-only today) |
| Storage access | Service-role admin client; private `beat-audio` | **PASS** |
| Signed URL | After Access Gate / after transport AuthZ | **PASS** |
| Validators | `validateObjectKey` UUID on segment 4 for USER → rejects legacy (`master` not UUID) | **PASS** |
| Ownership checks | Transport: `assertUserDraftTransportAccess` before bind; Access Gate: beat status + purpose; asset.beat_id match | **PASS** |
| Client object_key | `rejectClientChosenStorageParams` | **PASS** |
| Render beat source | `assertRenderBeatEligibleAtBake` uses DB `asset.object_key` opaque — no shape validate | **PASS** |
| Dual-read today | Absent | **PASS** (matches freeze) |
| Dual-write today | Absent; no product `/master/` writer under `src/lib/beats` | **PASS** |

### 3.2 Critical code facts for dual-accept

Legacy and canonical both split to **5** path parts. Rejection of legacy is **not** length — it is:

1. `assertUuidSegment(parts[3])` fails when `parts[3] === "master"`.
2. Prefix / exact equality to `buildUserBeatAudioObjectKey` fails.

**DR-A must change more than `validateObjectKey` alone:** `assertUserAssetBinding` also requires `object_key === expected` canonical (**lines 88–98** `user-audio-authz.ts`). Dual-accept without updating that second check = **still DENY**. Conditionally required in §15.

---

## 4. Strategy B Review

| Criterion | Assessment |
|-----------|------------|
| Aligns OD-SA-02 | Yes (dual-read before migrate; no big-bang delete) |
| Minimal? | More than A/D; justified if Owner wants key normalization + unblock publish on same asset row |
| Fits existing AuthZ-first access | Yes — playback already AuthZ→DB→sign |
| Safe for 68 PUBLISHED | Yes **if** backfill retains legacy until retirement + verify gates |
| Reversible pre-retirement | Yes (DB pointer + retained source) |
| Testable / prod-verifiable | Yes (SQL remaining legacy + sample signed URL + ST suite) |
| Owner must still choose A/B/C/D | **Yes** — Arch does not select |

**Verdict: APPROVED FOR DESIGN** (as a valid architecture; not mandatory over A/D).

**UI CHANGE:** **NONE EXPECTED** (storage/backend only).

---

## 5. DR-A Review

### 5.1 Placement (code-anchored)

| Location | Role today | DR-A change |
|----------|------------|-------------|
| `assertUserBeatObjectKeyBinding` / shape helper | Canonical-only | Accept K-01 **or** well-formed K-02 iff owner/beat/asset match |
| `assertUserAssetBinding` | Exact canonical equality | Must accept legacy when twin-bound (or replace both checks with **one** shared helper — REUSE / ZERO DUPLICATE) |
| `assertActiveMasterReadyForPublish` | Calls binding helper | Inherits DR-A via shared helper |
| `audio-access` / render bake | Opaque DB key | **No DR-A required** for playback (already works) |

### 5.2 Authorization surface

| Question | Answer | Evidence |
|----------|--------|----------|
| Does dual-accept expand who can access audio? | **No**, if applied only to **DB-loaded** `asset.object_key` after ownership/Access Gate | Transport loads asset by id; publish loads READY master from DB; client cannot pass object_key |
| AuthZ before key acceptance? | **Required condition** — already true on current call sites | `assertUserDraftTransportAccess` / publish caller AuthZ before gate |
| Key = locator only? | **Yes** under correct design | PATH ≠ AUTH |
| owner/beat/asset must match? | **Yes — mandatory** | Parse legacy: `parts[1]=owner`, `parts[2]=beat`, `parts[3]=master`, `parts[4]={assetId}.bin` |
| Submit foreign legacy key? | Blocked if client cannot supply key; if mis-implemented API accepts key → **IDOR** | Current APIs reject client keys — **keep** |
| Synthetic twin? | Must DENY unless equals deterministic map of **this** asset’s UUIDs | Freeze §9.4 |
| Bypass DB via path? | Forbidden — never sign from path alone | Current Access Gate does not |

### 5.3 Security Gate (DR-A)

Design as written **can** satisfy PATH ≠ AUTHORIZATION.

**BLOCKED only if** implementation accepts arbitrary legacy-shaped strings or signs before DB ownership.

**Arch condition:** single shared `assertUserBeatObjectKeyBinding` (or successor) is the **only** dual-accept entry; no second ad-hoc regex in transport/publish.

**Verdict: APPROVED WITH CONDITIONS** (see §15).

---

## 6. DR-B Review

| Question | Answer |
|----------|--------|
| When needed? | Only if **preferred** `DB.object_key` object is **missing** but deterministic twin still exists (cutover/ops fault) |
| Necessary for Phase 1 (unblock publish)? | **No** — playback already uses DB key; DR-A alone unblocks binding |
| Necessary during backfill happy path? | **No** — update DB only after target verified; preferred always exists |
| Duplicate storage logic risk? | Medium if open-coded in access + transport + render |
| Mitigation | One `resolveAuthorizedBeatAudioObjectKey(asset, beat)` helper; **migration-window flag**; default OFF after soak |

**Verdict: APPROVED WITH CONDITIONS — optional; NOT REQUIRED for DR-A-only or happy-path B.** Prefer **NOT REQUIRED** for initial Implementation GO of Phase 1; enable DR-B only if Owner wants cutover safety net (**OD-KEY-03** can split DR-A vs DR-B).

---

## 7. Dual-Write Review

Searched product beat paths for legacy producers:

- `src/lib/beats`: **no** `/master/` string builders in product modules (grep empty).
- Writers: `buildUserBeatAudioObjectKey` / `buildBeatAudioObjectKey` only.
- Consumers of beat audio bytes/URLs: DB `object_key` (access, transport download, render bake).
- Legacy hardcoded keys: **live tests / fixtures only** (`wave*-live`, `d02-live`, `grants/wave5-live`).

**No worker / API / export / preview / external integration** found that requires legacy beat key shape.

**Verdict: NOT REQUIRED** — confirms Design Freeze. **OD-KEY-04** expected **NO** unless new evidence appears.

---

## 8. Backfill Review

| Invariant | Guarantee under freeze design | Status |
|-----------|-------------------------------|--------|
| Determinism | Same UUIDs reorder via `buildUserBeatAudioObjectKey` | **PASS** |
| Collision | Check target exists + content compare | **PASS** (designed) |
| Idempotency | Optimistic lock `WHERE object_key = legacy` | **PASS** (designed) |
| Ownership | Parse must equal beat.owner / beat.id / asset.id | **PASS** (designed) |
| SOURCE EXISTS | Pre-check | **PASS** (designed) |
| TARGET EXISTS | Post-copy | **PASS** (designed) |
| CONTENT MATCHES | size + checksum if `checksum_sha256` present | **PARTIAL** — null checksum rows need size-only or hash-on-read **GAP** to specify in impl freeze |
| DB REFERENCE SAFE | Update after verify; retain legacy | **PASS** (designed) |
| PLAYBACK VERIFIED | Sample/per-row signed URL | **PASS** (designed) |
| Retry / partial failure | Row-level; no mass delete | **PASS** (designed) |
| Platform excluded | Scope USER legacy only | **PASS** |
| DRAFT migrate set | LIVE DRAFT already canonical (n=2); migrate set = 68 PUBLISHED | **PASS** |

**Verdict: APPROVED WITH CONDITIONS** — define checksum-null policy before Implementation GO.

---

## 9. Legacy Seeding Review (OD-KEY-06)

| Class | Evidence | Action |
|-------|----------|--------|
| **A. Real production writer** | Canonical only (`audio-transport` create session) | **Do not block** — already correct |
| **B. Test/fixture writer** | Live tests insert K-02 | Primary OD-KEY-06 target |
| **C. SQL seed** | Possible; not proven this review | Detect via periodic SQL |
| **D. Migration artifact** | None for keys | N/A |
| **E. Historical-only** | 68 rows + orphans | No active product writer |

**Verdict: APPROVED WITH CONDITIONS** — guardrail = stop **B** (+ detect C); **not** a rewrite of product upload path.

---

## 10. Retirement Review

Freeze requires: migration complete · verification · legacy reads/refs = 0 · rollback window · then delete.

| Check | Status |
|-------|--------|
| Non-destructive until GO | **PASS** (designed) |
| Rollback after retirement | Recovery-only — **correct** |
| Backup/recovery evidence before delete | **GAP** — not proven in-repo; **BLOCKING for Phase 4**, not for Phases 0–3 |
| Orphans not deleted as “legacy retirement” of the 68 | Must not conflate 28 orphan legacy objects with DB-referenced set | **Condition** |

**Verdict: APPROVED WITH CONDITIONS** — Phase 4 separate (**OD-KEY-05**); no retirement without backup/recovery confirmation.

---

## 11. Security Review

| ID | Invariant | Status | Notes |
|----|-----------|--------|-------|
| **SEC-01** | User A no signed URL for User B asset | **PASS** (current Access Gate by beat status/public rules; ownership for mutate) · IDOR suite still required for DR-A | Design OK |
| **SEC-02** | Legacy key ≠ auth credential | **PASS** if DR-A only on DB key | Condition |
| **SEC-03** | Twin no cross-owner | **PASS** if twin UUIDs must match row | Condition |
| **SEC-04** | DB ownership before signing | **PASS** today on access/transport | Must preserve |
| **SEC-05** | Fallback no access expansion | **PASS** if DR-B only deterministic twin of authorized asset | Condition |
| **SEC-06** | Publish/binding server-authorized | **PASS** today | Preserve |
| **SEC-07** | Path traversal / crafted path | **PASS** if `..` rejected + UUID checks on both shapes | Condition |
| **SEC-08** | Platform out of migrate | **PASS** (scope) | |
| **SEC-09** | DRAFT outside FAR-01 migrate set | **PASS** — 2 DRAFT already canonical; backfill targets 68 PUBLISHED | Dual-accept may still apply to any future legacy DRAFT binding — OK |

**SECURITY GATE:** **PASS WITH CONDITIONS** — not BLOCKED. Implementation that violates conditions → treat as BLOCKED before ship.

**UI CHANGE:** **NONE EXPECTED.**

---

## 12. Observability Review

| Signal | Necessary? | How (design) |
|--------|------------|--------------|
| `remaining_legacy_assets` | **Required** | SQL classify `object_key` (exists today as audit query) |
| `migration_success/failure` | **Required** if Phase 2 | Backfill job logs |
| `legacy_write_count` | **Required** if OD-KEY-06 | SQL watermark / CI policy |
| `fallback_count` | Required **iff DR-B ON** | Code counter |
| `legacy_read_count` / `canonical_read_count` | Useful soak | Optional log field on Access Gate |
| `orphan_count` | Optional here | ARCH-04/05; monitor only |
| `remaining_legacy_references` | = remaining DB legacy if no secondary refs | Required (= assets) unless new refs invented |

No existing product telemetry counters for these — SQL + job logs can cover Phase 0–2 without a full metrics stack (**minimal**).

**Verdict: APPROVED WITH CONDITIONS** — require SQL inventory + job evidence; full read/fallback counters scale with DR-B / soak needs.

---

## 13. Rollback Review

| Phase | Possible? | Evidence |
|-------|-----------|----------|
| PRE-BACKFILL | **YES** | Feature flag off; no Storage mutation |
| MID-BACKFILL | **YES** | Leave DB on legacy until target verified; abandon incomplete targets carefully |
| POST-BACKFILL pre-retirement | **YES** | Restore `object_key` to legacy **while source retained** |
| POST-RETIREMENT | **Recovery only** | No perfect rollback; backup required |

**Verdict: APPROVED FOR DESIGN** for Phases 0–3; Phase 4 recovery-only acknowledged.

---

## 14. Architecture Risks

### AR-01
- **Risk:** Dual-accept implemented only in `validateObjectKey` but `assertUserAssetBinding` exact equality remains → still DENY or inconsistent paths.
- **Evidence:** `user-audio-authz.ts` 88–98.
- **Impact:** Broken Phase 1 / duplicate logic.
- **Mitigation:** One shared binding helper; update all call sites.
- **Blocking:** **YES** for Implementation GO of DR-A.

### AR-02
- **Risk:** DR-B open-coded in multiple layers → ZERO DUPLICATE LOGIC violation / IDOR drift.
- **Evidence:** access + transport + render all download/sign today.
- **Impact:** Security inconsistency.
- **Mitigation:** Single resolver helper + flag; or defer DR-B.
- **Blocking:** **YES** if DR-B enabled without helper; **NO** if DR-B deferred.

### AR-03
- **Risk:** Backfill updates DB before content verify.
- **Evidence:** Freeze algorithm order is correct; impl could regress.
- **Impact:** Broken playback.
- **Mitigation:** AC-09 gate; tests.
- **Blocking:** **YES** if order violated.

### AR-04
- **Risk:** Retirement deletes DB-referenced or wrong orphans.
- **Evidence:** 30 orphans adjacent; 96 storage legacy vs 68 DB.
- **Impact:** Data loss.
- **Mitigation:** Delete only keys with no DB ref + soak; OD-KEY-05.
- **Blocking:** **YES** for Phase 4 without checklist.

### AR-05
- **Risk:** Live tests continue seeding legacy → inventory never stable.
- **Evidence:** Audit +17 growth · test hardcodes.
- **Impact:** Endless migrate / false AC-10.
- **Mitigation:** OD-KEY-06 Phase 0.
- **Blocking:** **NO** for Arch of B; **YES** for declaring migration “done” without guardrail.

### AR-06
- **Risk:** Null `checksum_sha256` weakens CONTENT MATCHES.
- **Evidence:** Column exists; not all rows guaranteed hashed.
- **Impact:** Silent wrong-object collision accept.
- **Mitigation:** Hash-on-read when null; or size+sample bytes.
- **Blocking:** **YES** for backfill Implementation GO until policy set.

---

## 15. Required Conditions

Before any Implementation GO for Strategy B / DR-A:

1. **Shared dual-accept helper** used by publish + `assertUserAssetBinding` (no split-brain).
2. **AuthZ-before-key** preserved; never accept client `object_key`.
3. Legacy accept only when parsed UUIDs == beat.ownerId, beat.id, asset.id and folder/`master` shape exact.
4. **DR-B** either deferred or single flagged helper (default recommendation: **defer** for Phase 1).
5. **Dual-write** remains OFF.
6. Backfill: verify before DB update; retain legacy objects; checksum-null policy written.
7. **OD-KEY-06** Phase 0 before claiming stable inventory.
8. Phase 4 retirement: separate GO + backup/recovery evidence + no orphan conflation.
9. Security tests ST-01…09 (freeze) required in impl plan.
10. Platform + orphans untouched.

**Design Freeze revision?** Not mandatory — conditions can attach to Implementation Design / Owner GO. Optional freeze errata: (a) call out second equality check in `assertUserAssetBinding`; (b) mark DR-B optional/deferred; (c) checksum-null policy. **Not** elevating to DESIGN REVISION REQUIRED unless Owner wants freeze text updated before Arch sign-off.

---

## 16. Owner Decisions

**Registered / LOCKED:** [OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md](./OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md)

| ID | Locked | Arch alignment |
|----|--------|----------------|
| **OD-KEY-01** | **GO** | Decision lock for FAR-01 realization |
| **STRATEGY** | **B** | Matches Arch **APPROVED FOR DESIGN** |
| **OD-KEY-03** | Phase 1 **DR-A**; DR-B optional | Matches Arch split |
| **OD-KEY-04** | **NO** | Matches **NOT REQUIRED** |
| **OD-KEY-05** | Backfill only after dual-read verified | Aligns staged B / OD-SA-02 |
| **OD-KEY-06** | **TAK** stop legacy seeding | Matches guardrail |
| **OD-KEY-07** | Retirement after backfill + soak + readiness | Matches phased retirement |
| **OD-KEY-08** | NULL checksum ≠ auto PASS | Closes AR-06 |
| **OD-KEY-09** | DR-B **not** in Phase 1 | Matches Arch default |

Orphans remain **OUT OF SCOPE** (ARCH-04/05) per Arch AC / prior review — not reassigned by OD-KEY-07.

**Implementation GO:** still **NOT GRANTED**.

---

## 17. Architecture Verdict

| Item | Verdict |
|------|---------|
| **A. Strategy B** | **APPROVED FOR DESIGN** |
| **B. DR-A** | **APPROVED WITH CONDITIONS** |
| **C. DR-B** | **APPROVED WITH CONDITIONS** / effectively **NOT REQUIRED** for Phase 1 |
| **D. No dual-write** | **NOT REQUIRED** (confirmed) · treat OD-KEY-04=NO as evidence-aligned |
| **E. Backfill design** | **APPROVED WITH CONDITIONS** |
| **F. Legacy write guardrail** | **APPROVED WITH CONDITIONS** |
| **G. Retirement strategy** | **APPROVED WITH CONDITIONS** |
| **H. Security model** | **APPROVED WITH CONDITIONS** · Gate not BLOCKED |
| **I. Observability** | **APPROVED WITH CONDITIONS** |
| **J. Rollback** | **APPROVED FOR DESIGN** (Phases 0–3) |

---

## 18. Implementation Readiness

| Gate | Status |
|------|--------|
| **DESIGN FREEZE** | **PASS WITH CONDITIONS** |
| **ARCH REVIEW** | **PASS WITH CONDITIONS** |
| **OWNER DECISIONS** | **LOCKED** — [OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md](./OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md) |
| **OWNER IMPLEMENTATION GO** | **NOT GRANTED** |
| **IMPLEMENTATION** | **NOT READY** |

---

## 19. Repository Safety

| Check | Result |
|-------|--------|
| Product code changed | **NO** |
| DB changed | **NO** |
| Storage changed | **NO** |
| Auth changed | **NO** |
| ENV changed | **NO** |
| Infrastructure changed | **NO** |
| Commit | **NONE** |
| Push | **NONE** |
| Deploy | **NONE** |
| Artifact | **This file only** — uncommitted |

---

## FINAL STATUS

**ARCH REVIEW COMPLETE — OWNER DECISION REQUIRED**
