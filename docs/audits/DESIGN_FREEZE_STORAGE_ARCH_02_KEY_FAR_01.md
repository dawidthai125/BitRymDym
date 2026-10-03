# DESIGN FREEZE — STORAGE-ARCH-02-KEY / FAR-01

**Type:** Plan + Design Freeze (NO IMPLEMENTATION)
**Date:** 2026-10-02
**Status:** **OWNER DECISIONS LOCKED** — Implementation GO **NOT GRANTED**
**Audit source:** [AUDIT_STORAGE_ARCH_02_KEY_FAR_01.md](./AUDIT_STORAGE_ARCH_02_KEY_FAR_01.md)
**Owner Decisions (canonical):** [OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md](./OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md)
**Parent policy:** OD-SA-02 · [STORAGE_ARCH_01_DESIGN_FREEZE.md](./STORAGE_ARCH_01_DESIGN_FREEZE.md)
**Production app:** `0afa29b` · Docs tip: `b667e54`

```text
PRODUCT CODE CHANGED   = NO
DB / STORAGE / AUTH    = NO
COMMIT / PUSH / DEPLOY = NONE
```

**Evidence hierarchy:** CODE > live SQL (audit) > production > docs > assumption.

**Owner Decisions are LOCKED** in [OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md](./OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md) (**STRATEGY = B**). This freeze remains the design reference; it does **not** grant Implementation GO.

---

## 1. Problem

Sixty-eight **PUBLISHED USER** `beat_audio_assets` rows store **legacy** object keys:

```text
user/{ownerId}/{beatId}/master/{assetId}.bin
```

Current product **writes** new USER masters with **canonical** keys:

```text
user/{ownerId}/{beatId}/{assetId}/master.bin
```

**Split-brain:**

| Path | Behavior today |
|------|----------------|
| Playback / signed URL | Uses DB `object_key` as opaque path → **legacy PLAYBACK works** (CODE-VERIFIED) |
| Publish hard-gate / USER asset binding | Canonical-only validators → **legacy DENY** |
| Dual-read | **ABSENT** |
| Dual-write | **ABSENT** |

**Goal of this freeze:** define a safe transition strategy that does **not**:

- lose existing assets,
- break playback,
- introduce IDOR / cross-user access,
- break ownership,
- mint unsafe signed URLs,
- delete legacy objects prematurely.

**Non-goal of this document:** implement dual-read, backfill, telemetry, or any production change.

---

## 2. Current State

| Fact | Evidence |
|------|----------|
| `beat_audio_assets` total | **73** |
| Legacy USER keys | **68** — all on **PUBLISHED USER** beats |
| Canonical USER keys | **2** — **DRAFT** only |
| Platform keys | **3** |
| Dual-read / dual-write | ABSENT |
| Canonical writer | `buildUserBeatAudioObjectKey` (`audio-validation.ts`) |
| Binding / publish | `assertUserBeatObjectKeyBinding` / `assertUserAssetBinding` / publish gate — canonical-only |
| Playback | `audio-access` → `createSignedUrl(asset.object_key)` |
| Orphan `beat-audio` objects | **30** — **OUT OF SCOPE** (ARCH-04/05) |
| Missing storage for 68 DB rows | **0** (audit) |

Historical count drift: ARCH-01 = 51 legacy → audit = 68 (+17). Cause of growth = **HYPOTHESIS** (live tests / fixtures seeding legacy). Guardrail designed in §12.

---

## 3. Scope

**IN SCOPE (STORAGE-ARCH-02-KEY / FAR-01):**

1. USER `beat-audio` key convention: legacy **K-02** ↔ canonical **K-01**.
2. Compatibility layer design (dual-accept / dual-read semantics) for authorized paths.
3. Logical backfill design for the **68** DB-referenced legacy assets.
4. Legacy write / seed guardrail design (OD-KEY-06).
5. Publish / binding policy during and after transition.
6. Playback phase model with measurable evidence.
7. Security invariants + required tests (design only).
8. Observability counters (design only).
9. Rollback / recovery design per phase.
10. Acceptance criteria + Owner Decision list.

**Bucket:** `beat-audio` only.
**Table:** `beat_audio_assets` USER rows with MASTER purpose (legacy shape).

---

## 4. Out of Scope

| Item | Destination |
|------|-------------|
| External Object Storage / R2 / S3 | STORAGE-ARCH-02 (docs-complete; separate impl) |
| 30 orphan storage objects / GC | STORAGE-ARCH-04/05 |
| Staged physical retirement as sole cleanup wave | STORAGE-ARCH-06 (may consume outputs of this wave) |
| `take-audio` / `audio-artifacts` key changes | Separate domains |
| Contabo / worker / VPS | Unrelated |
| Artwork bucket | OD-SA-04 deferred |
| Live Production fixture cleanup campaigns | Separate H/D02-class waves |
| Implementation of dual-read / backfill / telemetry | **After** Arch Review + Owner Implementation GO |
| Changing validators / code / DB in this session | **FORBIDDEN** |

**K-04** `users/{owner}/beats/...` (2 orphans): inventory-only; not part of the 68; no DB mapping → out of FAR-01 backfill set.

---

## 5. Current Canonical Key

**Source of truth (code — do not invent a new format):**

`buildUserBeatAudioObjectKey` in `src/lib/beats/audio-validation.ts`:

```text
user/{ownerId}/{beatId}/{assetId}/{purposeLower}.bin
```

For MASTER (catalog physical file):

```text
user/{ownerId}/{beatId}/{assetId}/master.bin
```

### Required fields

| Field | Type | Role |
|-------|------|------|
| `ownerId` | UUID | Path segment 2 · ownership |
| `beatId` | UUID | Path segment 3 · beat binding |
| `assetId` | UUID | Path segment 4 · asset binding |
| `purpose` | enum → lowercase | Filename stem (`master`, …) |

### Invariants (WRITE SSOT)

1. Client never supplies path segments.
2. Server builds key only via `buildUserBeatAudioObjectKey`.
3. `object_key` must end with `.bin`.
4. No `..` / `//` / non-UUID segments.
5. USER keys have **exactly 5** `/`-split parts: `user`, owner, beat, asset, `purpose.bin`.
6. Binding compares reconstructed expected key / prefix to DB+context owner/beat/asset — **not** client claims.

### PLATFORM (unchanged, not FAR-01 migrate target)

```text
platform/{beatId}/{assetId}/{purposeLower}.bin
```

---

## 6. Legacy Key

```text
user/{ownerId}/{beatId}/master/{assetId}.bin
```

| Property | Value |
|----------|-------|
| Segments | `user` / owner / beat / **`master` folder** / **`{assetId}.bin`** |
| LIVE set | 68 PUBLISHED USER READY active |
| Product writer today | **None** |
| Test seeders | Still hardcode this shape (audit F-KEY-07) |

### Deterministic mapping legacy → canonical?

**YES — 1:1 deterministic** for well-formed legacy USER MASTER keys:

| Legacy segment | Canonical segment |
|----------------|-------------------|
| `user` | `user` |
| `{ownerId}` | `{ownerId}` |
| `{beatId}` | `{beatId}` |
| `master` (folder) | `{assetId}` (folder) |
| `{assetId}.bin` | `master.bin` |

```text
LEGACY:     user/{ownerId}/{beatId}/master/{assetId}.bin
CANONICAL:  user/{ownerId}/{beatId}/{assetId}/master.bin
```

**Mapping inputs:** parse legacy regex + verify UUIDs + purpose MASTER.
**Target builder:** `buildUserBeatAudioObjectKey({ ownerId, beatId, assetId, purpose: "MASTER" })`.

**Collision check required:** target must not already exist for a **different** asset, and must not collide with an unrelated object. Same asset re-run = idempotent (see §11).

**Not reversible by folder alone without `assetId`:** both shapes embed the same UUIDs → reversible if pattern matches.

---

## 7. Strategy Options

Owner selects; this freeze does **not** choose.

### OPTION A — Leave legacy keys (no migration)

| Aspect | Design |
|--------|--------|
| Mechanism | No dual-read · no backfill · keep DB keys as-is · playback continues via opaque `object_key` |
| Code changes | Optional: document-only · optional guardrail against new legacy seeds |
| Security | Unchanged read path · binding/publish remain DENY for legacy rows |
| Risk | Owners cannot re-publish / bind existing legacy asset without **new upload** (new assetId → canonical). Catalog playback OK if objects remain |
| Rollback | N/A (no change) |
| Impact 68 | Unchanged |
| New assets | Already canonical |
| Playback | Continues |
| Publish | Remains DENY on legacy rows |
| Storage / DB | Unchanged |
| Testability | High (status quo) |
| Prod verify | Confirm playback sample + DENY on publish still expected |

**Fits if:** Owner accepts publish/rework only via **new** MASTER upload; no need to normalize keys.

---

### OPTION B — Dual-read (authorized dual-accept) → backfill → retirement

| Aspect | Design |
|--------|--------|
| Mechanism | Phase 1: binding/validators **accept K-01 or K-02** only when bound to DB owner/beat/asset. Phase 2: copy object to canonical path + update `object_key` after verify. Phase 3: stop accepting K-02 when remaining=0. Phase 4: delete retired legacy objects (separate GO) |
| Dual-write | **Not required** (see §10) |
| Security | Fallback never authorizes by path alone; AuthZ first |
| Risk | Medium — backfill bugs; mitigated by verify gates |
| Rollback | Keep legacy objects until retirement; revert DB `object_key` if needed |
| Impact 68 | Eventually all point to K-01 |
| New assets | Canonical only |
| Playback | Phase 0–2 safe if DB+object consistent |
| Publish | After dual-accept: legacy rows can pass binding; after backfill: canonical-only again |
| Storage | Temporary dual objects during backfill |
| DB | `object_key` updates after verify |
| Testability | Strong AC matrix |
| Prod verify | Counters + sample signed URLs + remaining legacy = 0 |

**Aligns with OD-SA-02** (“dual-read → staged migration”).

---

### OPTION C — Dual-read + dual-write → backfill → verification → retirement

| Aspect | Design |
|--------|--------|
| Mechanism | Like B, plus during transition **new** writes optionally also write legacy path (or rewrite both) |
| When useful | Only if a consumer **must** read a fixed legacy path outside DB (audit found **no** such product consumer) |
| Risk | **Higher** — two objects · drift · partial failures · larger attack/ops surface |
| Rollback | Harder (two writes) |
| Recommendation in analysis | **Not needed** given evidence (see §10) unless Arch Review finds a hidden consumer |

---

### OPTION D — Compatibility-only (dual-accept binding) · **no** physical backfill

| Aspect | Design |
|--------|--------|
| Mechanism | Extend binding/publish to accept legacy **or** canonical when ownership matches; leave objects at legacy paths indefinitely |
| Security | Same dual-accept rules as B Phase 1 |
| Risk | Permanent two-shape SSOT · future waves harder · opposite of “canonical WRITE SSOT” |
| Rollback | Easy (revert validator) |
| Impact 68 | Unchanged on Storage |
| Publish | Unblocked without migrate |
| Fits if | Owner wants re-publish ASAP without Storage copy campaign |

**Note:** Does **not** satisfy full OD-SA-02 staged migration; may be an interim Owner choice before B.

---

### Comparison (informational)

| Criterion | A | B | C | D |
|-----------|---|---|---|---|
| Unblocks publish on legacy rows | No* | Yes | Yes | Yes |
| Normalizes Storage keys | No | Yes | Yes | No |
| Dual-write complexity | None | None | High | None |
| Aligns OD-SA-02 migrate | No | Yes | Yes | Partial |
| Ops cost | Lowest | Medium | Highest | Low |

\*Unless owner creates a **new** MASTER asset (canonical) and activates it.

---

## 8. Proposed Architecture

**Proposed (for Arch Review — not Owner-approved):** prefer **OPTION B** as the architecture that matches OD-SA-02 and audit evidence, with **OPTION A** and **OPTION D** as explicit Owner alternatives.

```text
AUTHZ (session / role / beat ownership / Access Gate)
  → resolve asset row from DB (never client object_key)
  → authorize purpose (PLAYBACK / DOWNLOAD / mutate)
  → resolve storage key:
        prefer DB.object_key
        [PHASE 1–3 ONLY] if dual-read enabled AND policy allows:
            if DB key is canonical and object missing → try deterministic legacy twin
            if DB key is legacy → use as-is (or after backfill, DB is canonical)
  → createSignedUrl(resolvedKey) via service role
  → never sign a key that fails ownership binding
```

**Logical modules (names illustrative — not implemented):**

| Module | Responsibility |
|--------|----------------|
| `buildUserBeatAudioObjectKey` | Canonical WRITE SSOT (exists) |
| `parseLegacyUserMasterKey` / `legacyToCanonical` | Pure deterministic map (design) |
| `assertUserBeatObjectKeyBinding` (evolved) | Accept K-01 **or** K-02 iff owner/beat/asset match |
| `resolveBeatAudioStorageKey` | Optional storage dual-read during migrate |
| Backfill job | Ops/admin only · dry-run · verify · commit |
| Guardrail | Deny/detect new legacy writes & test seeds |

**Hard rule:** Path string is **never** an authorization mechanism. Authorization is DB row + beat ownership + Access Gate.

---

## 9. Dual-Read Design

### 9.1 Two distinct meanings (must not conflate)

| Kind | Meaning | Where |
|------|---------|-------|
| **DR-A Dual-accept (validators)** | Binding/publish accept legacy **or** canonical shape when bound to expected UUIDs | `assertUserBeatObjectKeyBinding` / publish gate / transport finalize |
| **DR-B Storage fallback** | If authorized asset’s preferred key missing, try **only** its deterministic twin | Signed URL / download bytes after AuthZ |

OD-SA-02 “dual-read before migration” is satisfied by enabling **DR-A** (and **DR-B** during/after backfill window) **before** destructive retirement — not by “any legacy path.”

### 9.2 Where fallback may live

**Allowed:**

- Server-side Access Gate / transport / render-source **after** asset loaded from DB.
- Backfill verifier.

**Forbidden:**

- Client-supplied alternate keys.
- Fallback before AuthZ.
- Fallback to arbitrary `user/**` listing.
- Using Storage existence alone to grant access.

### 9.3 What must NOT get fallback

- Client `object_key` / `bucket` / `ownerId` request fields.
- Cross-asset “search by filename.”
- Platform keys ↔ USER keys.
- K-04 `users/...` ultra-legacy (no DB row → no AuthZ subject).
- Orphan objects without `beat_audio_assets` row.

### 9.4 Security bypass prevention

1. Load asset by `assetId` / beat context from DB.
2. Verify beat ownership / Access Gate / purpose.
3. Derive **allowed key set** = `{ db.object_key }` ∪ optional `{ deterministicTwin(db) }` **only if** twin parses to **same** ownerId, beatId, assetId as the row.
4. Sign only a key in that set.
5. Reject if twin’s parsed UUIDs ≠ row.

### 9.5 Logging / metrics (design)

On each fallback use: `asset_id`, `beat_id`, `from=canonical|legacy`, `to=…`, `reason=missing_preferred|binding_dual_accept` — **no** signed URL in logs.

### 9.6 Ending fallback

Exit criteria: `remaining_legacy_db_refs = 0` for ≥ N days (Owner sets N) **and** `fallback_count = 0` in window **and** AC-10/11 PASS → disable DR-B → later disable DR-A → retirement GO.

---

## 10. Dual-Write Decision

**Analysis: dual-write is NOT required for OPTION B.**

| Question | Answer |
|----------|--------|
| Needed? | **No** under current evidence |
| Why not? | All product consumers resolve keys from **DB**; no live consumer hardcodes legacy path for beats |
| When would it be? | Only if a non-DB consumer required a frozen legacy path during cutover (none found) |
| Risk if added | Two objects · partial write · checksum drift · larger cleanup |
| Rollback | Worse than single-write + copy-on-migrate |

**Design Freeze stance (proposal):** Dual-write = **NO** unless Arch Review discovers a hidden consumer. Owner confirms via **OD-KEY-04**.

---

## 11. Backfill Design

**Logical design only — do not run.**

### 11.1 Set

- Source rows: 68 legacy `beat_audio_assets` (refresh inventory at execution time — count may change).
- Bucket: `beat-audio`.
- Exclude: platform, already-canonical, orphans without rows, K-04.

### 11.2 Per-row algorithm

```text
1. SELECT asset + beat (owner_id, ownership_type=USER)
2. Assert object_key matches legacy regex
3. Parse ownerId, beatId, assetId from key
4. Assert segments == beat.owner_id, beat.id, asset.id
5. targetKey = buildUserBeatAudioObjectKey(...)
6. Assert no collision:
     - if target exists AND is same bytes as source → treat as copy-done
     - if target exists AND differs → FAIL row (manual)
7. HEAD/metadata: source exists (required)
8. COPY source → target (server/service role)
9. Verify:
     SOURCE EXISTS
     TARGET EXISTS
     SIZE MATCH (and checksum if available: asset.checksum_sha256 vs target hash)
10. Optional: createSignedUrl(target) smoke (AuthZ path)
11. UPDATE beat_audio_assets.object_key = targetKey
      WHERE id = assetId AND object_key = legacyKey  -- optimistic lock
12. Re-read row; confirm canonical
13. Do NOT delete legacy yet
```

### 11.3 Idempotency

- Re-run safe if: DB already canonical + target exists + verifies.
- Optimistic lock on `object_key = legacy` prevents double-update races.

### 11.4 Failure handling

- Row-level FAIL → leave legacy DB pointer · leave any partial target for retry/cleanup policy.
- No batch “delete all legacy” on partial success.
- Retry: finite · alert on persistent FAIL.

### 11.5 Success definition (not mere copy)

| Check | Required |
|-------|----------|
| SOURCE EXISTS | YES |
| TARGET EXISTS | YES |
| CONTENT MATCHES (size ± checksum) | YES |
| DB REFERENCE SAFE (update committed) | YES |
| PLAYBACK SAFE (signed URL on target under AuthZ) | YES (sample or per-row) |
| Ownership 1:1 | YES |

### 11.6 Rollback during/after backfill

- **Before DB update:** delete incomplete target only if verified not referenced.
- **After DB update:** restore `object_key` to legacy **if** legacy object still exists (mandatory retain until retirement).
- **Never** delete legacy in the same transaction as first cutover.

---

## 12. Legacy Write Guardrail

**OD-KEY-06 design (no implementation):**

### Where legacy can still appear

| Source | Evidence |
|--------|----------|
| Product USER upload | **Should not** — uses `buildUserBeatAudioObjectKey` |
| Live tests / fixtures | Hardcoded K-02 strings |
| Manual SQL / ops | Possible |
| Unknown historical writers | K-04 orphans |

### Guardrail layers (logical)

1. **Code:** Keep single WRITE builder; no alternate legacy builder in product.
2. **CI / test policy:** Forbid inserting K-02 into shared Production project (or ban live tests that write beats to prod).
3. **Detection query (ops):** periodic count of new legacy-shaped rows since watermark.
4. **Alert:** `legacy_write_count > 0` after guardrail GO.
5. **Optional hard deny:** reject INSERT/update to legacy shape in app-layer finalize (defense in depth) — still AuthZ-first.

Canonical writer **already sufficient** for product paths; gap is **non-product writers**.

---

## 13. Publish / Binding

| Phase | Policy |
|-------|--------|
| Today | Canonical-only → legacy **DENY** |
| OPTION A | Keep DENY; rework = new upload |
| OPTION B/D Phase 1 | **Dual-accept:** legacy **or** canonical iff owner/beat/asset binding holds |
| After backfill + AC-10 | Return to **canonical-only** |

**Do not** weaken by: accepting any `user/**` string, skipping UUID checks, or trusting Storage listing.

**Prefer:** data migrate (B) or dual-accept (D) over permanent “open” validator. Temporary dual-accept is a controlled exception with metrics + end criteria.

---

## 14. Playback

| Phase | Behavior | Measurable evidence |
|-------|----------|---------------------|
| **0** | Status quo: DB key → signed URL; legacy works | Sample PLAYBACK on ≥1 legacy PUBLISHED beat PASS |
| **1** | Compatibility: dual-accept + optional DR-B | `fallback_count` instrumented; no IDOR fails |
| **2** | Backfill complete: DB keys canonical; legacy objects retained | `remaining_legacy_db_refs = 0`; playback sample PASS |
| **3** | Legacy usage = 0 (reads + refs) | `legacy_read_count=0`, `fallback_count=0` for window |
| **4** | Retirement | Delete only unreferenced legacy objects after GO; playback still PASS |

---

## 15. Security Invariants

1. User A cannot read User B’s asset (ownership / Access Gate).
2. Signed URL issued only after server AuthZ.
3. Fallback does not expand access beyond the authorized asset’s deterministic key set.
4. Legacy key string is **not** an authorization token.
5. Object existence in Storage does **not** bypass DB ownership.
6. Publish / binding remain server-authorized; client cannot choose keys.
7. Twin-key parse must equal `asset.id`, `beat.id`, `beat.owner_id`.
8. No public bucket; service-mediated signing only.

### Required security tests (design — not written now)

| ID | Test |
|----|------|
| ST-01 | Owner PLAYBACK legacy (Phase 0/1) PASS |
| ST-02 | Non-owner PLAYBACK DENY |
| ST-03 | Client-supplied object_key DENY |
| ST-04 | Dual-accept: wrong owner UUID in legacy shape DENY |
| ST-05 | Dual-accept: correct legacy shape + matching DB PASS |
| ST-06 | Storage fallback never signs twin of a different asset |
| ST-07 | Publish gate: after dual-accept, only owner can publish |
| ST-08 | After retirement flag off, legacy shape DENY again |
| ST-09 | IDOR: swap asset ids across users DENY |

---

## 16. Observability

Minimal counters / queries (design only):

| Signal | Purpose |
|--------|---------|
| `legacy_read_count` | Reads where DB key was legacy |
| `canonical_read_count` | Reads where DB key was canonical |
| `fallback_count` | DR-B twin used |
| `legacy_write_count` | New rows/objects with legacy shape (should be 0 post-guardrail) |
| `canonical_write_count` | New USER uploads |
| `migration_success_count` | Backfill rows OK |
| `migration_failure_count` | Backfill rows FAIL |
| `remaining_legacy_assets` | DB count legacy shape |
| `remaining_legacy_references` | Same + any secondary refs if introduced |
| `orphan_count` | Storage without DB (ARCH-04/05; monitor only here) |

---

## 17. Rollback / Recovery

| Moment | Rollback / recovery |
|--------|---------------------|
| Before backfill | Disable dual-accept feature flag → return to DENY; no Storage change |
| During backfill | Stop job · leave DB on legacy for failed rows · retain sources · retry |
| After backfill (pre-retirement) | `UPDATE object_key` back to legacy **while legacy object kept** |
| Before retirement | Do not delete; disable DR-B first |
| After retirement | **Destructive** — no perfect rollback; **recovery** = restore from backup / re-copy if backup exists. **Do not retire without backup policy decision** (ties to STORAGE-ARCH-07 conceptually for masters) |

**Design rule:** Retirement is irreversible without backup → separate Owner GO · never automatic.

---

## 18. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| **AC-01** | All in-scope legacy assets have a deterministic canonical target via `buildUserBeatAudioObjectKey` |
| **AC-02** | No colliding target (different content / other asset) before commit |
| **AC-03** | Ownership preserved 1:1 (parsed UUIDs = beat.owner / beat.id / asset.id) |
| **AC-04** | Playback of existing in-scope assets PASS at Phase 0 and after cutover |
| **AC-05** | Publish/binding remain security-safe (no client key; ST-0x PASS) |
| **AC-06** | New production writes do not create legacy keys (`legacy_write_count=0`) |
| **AC-07** | If dual-read chosen: fallback usage measurable (`fallback_count`) |
| **AC-08** | Backfill idempotent (safe re-run) |
| **AC-09** | Target content verified (exists + size/checksum) |
| **AC-10** | Legacy DB refs = 0 before retirement |
| **AC-11** | Retirement does not delete objects still referenced by DB |
| **AC-12** | Security / IDOR regression tests PASS |
| **AC-13** | `missing_storage` for in-scope DB rows remains 0 throughout |
| **AC-14** | Platform keys untouched |
| **AC-15** | Orphans (30) untouched by FAR-01 backfill/retirement |
| **AC-16** | Dual-write absent unless OD-KEY-04 = YES |
| **AC-17** | Feature flags / phase exits documented with evidence artifacts |

---

## 19. Release Phases

**Proposed sequence (Owner may reorder via OD):**

| Phase | Name | Content | Exit |
|-------|------|---------|------|
| **0** | Guardrail | Stop legacy seeding (OD-KEY-06) · inventory freeze snapshot | `legacy_write_count=0` for window |
| **1** | Compatibility | DR-A dual-accept (+ optional DR-B) | ST tests PASS · metrics live |
| **2** | Backfill | Copy+verify+DB update for legacy set | AC-01…09 · remaining legacy DB = 0 |
| **3** | Verification | Soak · playback samples · fallback→0 | AC-04/07/10 soak |
| **4** | Retirement | Delete unreferenced legacy objects only | AC-11 + separate GO |

**Alternative:** Owner picks **OPTION A** → only Phase 0 (guardrail) + document DENY as permanent.
**Alternative:** Owner picks **OPTION D** → Phase 0–1 only; defer Phase 2–4.

---

## 20. Owner Decisions

**Canonical lock:** [OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md](./OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md)

| ID | Status | Locked value |
|----|--------|--------------|
| **OD-KEY-01** | **GO** | Realize STORAGE-ARCH-02-KEY / FAR-01 (decision lock; not Implementation GO) |
| **STRATEGY** | **B** | dual-read → backfill → retirement |
| **OD-KEY-03** | **LOCKED** | Phase 1 = **DR-A**; DR-B optional cutover net only |
| **OD-KEY-04** | **NO** | Dual-write not required |
| **OD-KEY-05** | **LOCKED** | Backfill only after dual-read deployed + verified |
| **OD-KEY-06** | **TAK** | Stop further legacy seeding; no new legacy writers; no ad-hoc legacy mutation |
| **OD-KEY-07** | **LOCKED** | Retirement only after backfill + soak + safety/rollback readiness |
| **OD-KEY-08** | **LOCKED** | `checksum = NULL` ≠ auto PASS; integrity per available evidence |
| **OD-KEY-09** | **DEFERRED** | Do not implement DR-B in Phase 1 |

**Implementation GO:** still required separately before any code/Storage change.

---

## 21. Open Questions

1. Exact soak window length for AC-10 / fallback=0 before retirement?
2. Is Production backup of `beat-audio` masters mandatory before Phase 4? (links STORAGE-ARCH-07)
3. Confirm whether any external/ops tool still writes K-02 (beyond tests).
4. Should dual-accept apply to REJECTED rework only, or also first-time publish of any remaining legacy DRAFT (none today)?
5. Who operates backfill (Owner script vs CI vs admin-only job)?
6. Accept +17 growth hypothesis and mandate live-test isolation from Production?

---

## 22. Implementation Boundary

**This freeze does not authorize:**

- code changes,
- migrations,
- dual-read/dual-write implementation,
- backfill execution,
- object copy/delete,
- RLS / Storage policy changes,
- ENV / deploy / commit / push.

**Next gates:**

```text
DESIGN FREEZE (this doc)
  → ARCH REVIEW
  → OWNER IMPLEMENTATION GO (per phase)
  → IMPLEMENT (phase-scoped)
  → PRODUCTION VERIFY
```

---

## 23. Repository Safety

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
| Artifact | **This file only** |

---

## Document control

| Field | Value |
|-------|--------|
| Freeze type | Plan + Design Freeze draft |
| Implementation GO | **NOT GRANTED** |
| Arch Review | **PENDING** |
| Supersedes | Nothing — complements STORAGE-ARCH-01 OD-SA-02 |
| Related audit | AUDIT_STORAGE_ARCH_02_KEY_FAR_01.md |
