# STORAGE-ARCH-02-KEY / FAR-01 — AUDIT REPORT

**Type:** Technical audit only (READ-ONLY)
**Date:** 2026-10-02
**Auditor:** Cursor Agent
**Production app SHA:** `0afa29b` · deployment `dpl_9EDrc78ompk8B2QZk6tDwQurntus`
**Docs tip / HEAD:** `b667e54`
**Status:** **AUDIT COMPLETE — READY FOR OWNER DECISION**

```text
PRODUCT CODE CHANGED   = NO
DB / SUPABASE CHANGED  = NO (read-only SQL)
STORAGE / AUTH / ENV   = NO
COMMIT / PUSH / DEPLOY = NONE
```

**Evidence hierarchy:** CODE > remote schema / live SQL > production evidence > documentation > assumption.

---

## 1. Executive Summary

**STORAGE-ARCH-02-KEY / FAR-01** dotyczy **wewnętrznej** niezgodności kluczy `beat-audio` USER:

| Shape | Pattern | LIVE DB rows |
|-------|---------|-------------:|
| **LEGACY** | `user/{owner}/{beatId}/master/{assetId}.bin` | **68** |
| **CANONICAL** | `user/{owner}/{beatId}/{assetId}/master.bin` | **2** |
| **PLATFORM** | `platform/{beatId}/{assetId}/master.bin` | **3** |
| **TOTAL** | `beat_audio_assets` rows | **73** |

**68 / 73 jest zreconciliowane z LIVE Production SQL** (nie z repo, nie z documentation alone).

| Question | Answer |
|----------|--------|
| Dual-read | **ABSENT** |
| Dual-write | **ABSENT** |
| Canonical USER writer (app) | **YES** — `buildUserBeatAudioObjectKey` |
| Canonical-only validators on mutate/publish paths | **YES** — reject legacy shape |
| Playback / signed URL read of legacy | **Works via DB `object_key`** (no re-validate) — CODE-VERIFIED |
| External Object Storage | **OUT OF SCOPE** (STORAGE-ARCH-02) |
| Implementation readiness | **NOT READY** — need Design Freeze for dual-read then Owner GO |

**Najważniejszy finding produkcyjny:** 68/68 legacy assets są na **PUBLISHED USER** beats. Publish hard-gate i transport binding wymagają dziś **canonical** shape → **re-publish / analyze/finalize na legacy row** byłby **DENIED**. Nowe DRAFT uploady używają canonical (2 DRAFT).

---

## 2. Canonical Scope

| Item | Value |
|------|--------|
| Wave | **STORAGE-ARCH-02-KEY** |
| Alias | **FAR-01** |
| Parent policy | OD-SA-02 (STORAGE-ARCH-01 Design Freeze) |
| Bucket in scope | **`beat-audio`** USER key convention drift |
| Related (adjacent, not this wave) | Orphan GC → STORAGE-ARCH-04/05 · staged physical migrate → STORAGE-ARCH-06 |
| Explicitly out | R2/S3 provider choice · Contabo · take-audio convention change · artifact janitor · dual-read **implementation** |

**FAR-01 (docs):** Legacy USER beat keys vs canonical validators — dual-read → staged migration; **no Implementation GO** until Owner decides after this audit.

---

## 3. Relationship to STORAGE-ARCH-02

| Wave | Meaning | Status |
|------|---------|--------|
| **STORAGE-ARCH-02** | Future **external** Object Storage scalability **docs** | AUDIT COMPLETE → **docs-complete** |
| **STORAGE-ARCH-02-KEY** | **Inside-Supabase** legacy↔canonical **key** dual-read / migration foundation | **This audit** · NOT IMPLEMENTED |

Nie wolno mieszać: brak dual-read kluczy ≠ brak zewnętrznego storage.

Docs drift (FINAL_COLD_START still says “STORAGE-ARCH-02 dual-read”) — dokumentowane wcześniej (F-E-02); **nie zmieniane w tej sesji**.

---

## 4. Legacy Key Inventory

### 4.1 Patterns discovered (evidence-backed)

| ID | Key / Pattern | Bucket | Producer (current code) | Consumer | Read | Write | Delete | Status |
|----|---------------|--------|-------------------------|----------|------|-------|--------|--------|
| **K-01** | `user/{owner}/{beat}/{asset}/master.bin` | `beat-audio` | `buildUserBeatAudioObjectKey` · `audio-transport.ts` create USER upload | Access Gate / download bytes / render source (via DB key) | Y | Y (new) | via asset lifecycle | **ACTIVE** (canonical writer) |
| **K-02** | `user/{owner}/{beat}/master/{asset}.bin` | `beat-audio` | **No product writer today** · historical + **live tests** still seed this shape | Access Gate / download (DB key) · **binding/publish DENY** | Y* | N (app) | not in product migrate | **LEGACY** · LIVE majority |
| **K-03** | `platform/{beat}/{asset}/master.bin` | `beat-audio` | `buildBeatAudioObjectKey` · admin/platform transport | Access Gate | Y | Y | admin flows | **ACTIVE** |
| **K-04** | `users/{owner}/beats/{beat}/master/{asset}.bin` | `beat-audio` | **Unknown** (no code builder found) | None (not in DB) | N | N | — | **ORPHANED** · storage-only (n=2) |
| **K-05** | `user/{owner}/takes/{take}/mic.bin` | `take-audio` | `buildUserTakeObjectKey` | take preview/download/render | Y | Y | takes-janitor | **ACTIVE** · **OUT OF FAR-01** |
| **K-06** | `anon/{hash}/takes/{take}/mic.bin` | `take-audio` | `buildAnonTakeObjectKey` | anon preview | Y | Y | janitor | **ACTIVE** · **OUT OF FAR-01** |
| **K-07** | `user/{owner}/mix/{session}/jobs/{job}/{TIER}.{ext}` | `audio-artifacts` | `buildAudioArtifactObjectKey` | artifact download | Y | Y | render cleanup | **ACTIVE** · empty table LIVE · **OUT OF FAR-01** |

\*Read of K-02: **CODE-VERIFIED** path uses stored `object_key` without `validateObjectKey` on Access Gate.

### 4.2 Classification rules used

Status requires producer/consumer evidence — not name alone. K-02 is LEGACY because: LIVE rows exist, product builder no longer emits it, validators reject it on binding paths.

---

## 5. 68 / 73 Reconciliation

### 5.1 Verdict: **RECONCILED** (LIVE SQL 2026-10-02)

| Symbol | Meaning | Value | Source |
|--------|---------|------:|--------|
| **73** | Total rows in `beat_audio_assets` | 73 | `SELECT count(*) FROM beat_audio_assets` |
| **68** | Rows whose `object_key` matches **legacy** USER MASTER folder shape | 68 | regex classify on `object_key` |
| **2** | Canonical USER MASTER | 2 | same |
| **3** | Canonical PLATFORM MASTER | 3 | same |
| Identity | 68 + 2 + 3 = 73 | ✓ | arithmetic |

**Not:** number of patterns (1 legacy pattern) · not documentation fiction · not repo constant.

### 5.2 What 68 / 73 is

- **Unit:** DB **records** (`beat_audio_assets` rows), each pointing at one storage object key.
- **Numerator 68:** legacy-shaped **USER** keys.
- **Denominator 73:** all beat audio asset rows (all `is_active=true`, all `status=READY` in this snapshot).

### 5.3 Join to beats (critical)

| ownership | beat status | key shape | n |
|-----------|-------------|-----------|--:|
| USER | **PUBLISHED** | **legacy** | **68** |
| USER | **DRAFT** | **canonical_user** | **2** |
| PLATFORM | PUBLISHED/DRAFT | platform | 3 |

**Interpretation:** Entire published USER catalog masters still use legacy keys. Only unfinished DRAFT uploads use the new canonical writer.

### 5.4 Historical drift of the count

| When | Legacy | Canonical USER | Platform | Total assets | Source |
|------|-------:|---------------:|---------:|-------------:|--------|
| H/D02 design freeze era | 49 (cited) | — | — | — | H_D02 freeze docs |
| STORAGE-ARCH-01 audit | **51** | 2 | 3 | 56 | STORAGE_ARCH_01_AUDIT.md |
| Fala E + this audit | **68** | 2 | 3 | **73** | Live SQL |

**+17 legacy DB rows** since ARCH-01. Product writer emits canonical only → growth is **not** explained by current `buildUserBeatAudioObjectKey`.

**HYPOTHESIS (not proven):** live integration tests / fixture seeders still construct K-02 (`wave*-live.test.ts`, `d02-live.test.ts`, `grants/wave5-live.test.ts`) and may have written additional PUBLISHED assets against Production. Alternative hypotheses: historical batch import, manual SQL, older deploy still writing legacy. **Owner Decision may require fixture hygiene GO** (OD-KEY-06).

### 5.5 Storage object layer (related, not the 68/73 denominator)

| Metric | Value |
|--------|------:|
| `storage.objects` in `beat-audio` | 103 |
| Matched to `beat_audio_assets.object_key` | 73 |
| **Orphan storage objects** (no DB row) | **30** |
| Of which legacy K-02 orphans | 28 (96 storage legacy − 68 in DB) |
| Of which K-04 `users/...` orphans | 2 |
| Missing storage for DB rows | **0** |

Orphans → **STORAGE-ARCH-04/05** (adjacent). All 68 referenced legacy objects **exist** in Storage (**missing_storage=0**).

---

## 6. Storage Path Matrix

| Domain | Canonical builder | Validator / binding | LIVE majority | Dual-read | Dual-write |
|--------|-------------------|---------------------|---------------|-----------|------------|
| beat-audio USER | `buildUserBeatAudioObjectKey` | `validateObjectKey` (5 segments) · `assertUserBeatObjectKeyBinding` · `assertUserAssetBinding` | legacy K-02 | ABSENT | ABSENT |
| beat-audio PLATFORM | `buildBeatAudioObjectKey` | `validateObjectKey` (4 segments) | canonical K-03 | N/A | N/A |
| take-audio | `buildUserTakeObjectKey` / `buildAnonTakeObjectKey` | `expectedUserTakeObjectKey` exact match | canonical K-05/06 | ABSENT | ABSENT |
| audio-artifacts | `buildAudioArtifactObjectKey` | `expectedAudioArtifactObjectKey` | empty table | ABSENT | ABSENT |

---

## 7. Producer / Consumer Graph

### 7.1 Canonical USER beat (K-01) — ACTIVE write path

```text
USER (session)
  → createUserBeatSignedUploadSessionFor  [audio-transport.ts ~719]
  → buildUserBeatAudioObjectKey           [audio-validation.ts ~72]
  → INSERT beat_audio_assets (PENDING) + createSignedUploadUrl
  → client PUT to signed URL
  → analyzeUserBeatPendingUploadFor       [assertUserAssetBinding ~792]
  → finalizeUserBeatAfterUploadFor        [assertUserAssetBinding ~904]
  → READY + activate
  → later: audio-access createSignedUrl(asset.object_key)  [read]
```

### 7.2 Legacy USER beat (K-02) — LIVE read path

```text
HISTORICAL PRODUCER (absent in current product code)
  → object written under .../master/{assetId}.bin
  → beat_audio_assets.object_key = legacy string (68 PUBLISHED)

READ (works today):
  Access Gate / audio-access.ts ~199
    → createSignedUrl(asset.object_key)   // no validateObjectKey
  downloadBeatAudioObjectBytes(object_key)
  render-source-resolution (DB-resolved key)

MUTATE / PUBLISH (blocked by current code):
  assertUserAssetBinding / assertUserBeatObjectKeyBinding
    → validateObjectKey rejects parts.length !== 5
    → OR exact !== buildUserBeatAudioObjectKey(...)
  service.ts assertActiveMasterReadyForPublish ~115
    → would FORBIDDEN on legacy READY master
```

### 7.3 Duplicate / conflicting builders

| Component A | Component B | Conflict |
|-------------|-------------|----------|
| `buildUserBeatAudioObjectKey` (product) | Live tests hardcoding K-02 | Tests model **legacy** catalog while product writes **canonical** |
| `validateObjectKey` / binding (canonical-only) | Access Gate read (DB key opaque) | Split brain: read OK / bind DENY |
| STORAGE_ARCH_02_FUTURE_SCALABILITY example key | Still shows **legacy** path as example | Docs example ≠ code canonical |

No second product builder emitting K-02 was found in `src/` outside tests.

---

## 8. Canonical Storage Abstraction

**CANONICAL STORAGE PATH BUILDER: PARTIAL**

There is **no** single `StorageRouter`. There **are** per-domain server builders (SSOT within each domain):

| Domain | File | Function |
|--------|------|----------|
| Beat USER | `src/lib/beats/audio-validation.ts` | `buildUserBeatAudioObjectKey` |
| Beat PLATFORM | same | `buildBeatAudioObjectKey` |
| Take USER/ANON | `src/lib/takes/object-key.ts` | `buildUserTakeObjectKey` / `buildAnonTakeObjectKey` |
| Mix artifacts | `src/lib/audio/artifact-object-key.ts` | `buildAudioArtifactObjectKey` |

**FAR-01 gap:** validators for beats do not accept both K-01 and K-02 (no dual-read helper).

---

## 9. Dual-Read Status

**ABSENT**

- No fallback legacy→canonical lookup.
- No alternate key trial on signed URL miss.
- `validateObjectKey` / `assertUserBeatObjectKeyBinding` accept **only** canonical USER shape (5 path segments after split).

Coverage: N/A.

---

## 10. Dual-Write Status

**ABSENT**

- New USER uploads write **only** K-01.
- No code path writes both K-01 and K-02.
- Platform writes only K-03.

---

## 11. Storage Domains

### A. beat-audio — **IN SCOPE**

| Item | Evidence |
|------|----------|
| Bucket | `beat-audio` · `public=false` |
| Key conventions | K-01 canonical · K-02 legacy · K-03 platform · K-04 ultra-legacy orphan |
| Producer | USER: `audio-transport` canonical · PLATFORM: admin/platform builders |
| Consumer | `audio-access`, transport download, render source resolution |
| Auth boundary | Session + Access Gate + ownership; signed URL via service role |
| Lifecycle | PENDING_UPLOAD → READY; publish gate |
| Legacy | **68** DB · **96** storage objects (incl. orphans) |
| Migration risk | **HIGH** without dual-read before key rewrite |

### B. take-audio — OUT OF FAR-01 (inventory only)

Canonical take keys LIVE (12 user + 91 anon rows with keys). Bucket objects: 24. Separate TTL/janitor domain.

### C. audio-artifacts — OUT OF FAR-01

Builder present; LIVE `audio_artifacts` empty; bucket absent from current `storage.objects` grouping (0 objects). Janitor = STORAGE-ARCH-03.

### D. Other

K-04 `users/.../beats/...` — 2 orphan objects only; no DB refs; no code builder found.

---

## 12. Security / Ownership

| Property | Assessment | Evidence class |
|----------|------------|----------------|
| Private bucket | All V1 buckets private | CODE + prior schema · PASS |
| Client-chosen object_key | Rejected on USER transport | CODE-VERIFIED |
| Signed URL after AuthZ | Access Gate then sign DB key | CODE-VERIFIED |
| IDOR via path segments | Binding compares owner/beat/asset for **canonical** keys | CODE-VERIFIED for new assets |
| Legacy key ownership | Owner UUID still embedded in path segment 2; Access Gate trusts DB row + beat ownership more than re-parse | CODE-VERIFIED read path |
| Publish/bind vs legacy | Canonical-only check can **deny** owner mutate/publish of otherwise valid READY legacy asset | CODE-VERIFIED · **production-impacting for re-publish / re-analyze of legacy rows** |
| Dual-read weakening ownership | N/A (absent); freeze says dual-read must not weaken binding | Policy only |
| Live IDOR exploit test | Not run | **NOT VERIFIED** |

**Does not prove:** that every PUBLISHED legacy beat plays in browser today (would need E2E). Code path strongly suggests yes if object exists (and missing_storage=0).

---

## 13. Code vs Schema vs Production vs Docs

| Domain | Code | Schema | Production | Docs | Drift |
|--------|------|--------|------------|------|-------|
| Canonical USER builder | PASS | N/A (path in text column) | 2 DRAFT rows | PASS (freeze) | — |
| Legacy USER keys | No writer | `object_key` text | **68 PUBLISHED** | FAR-01 known | Count 51→68 **DRIFT** |
| Dual-read | ABSENT | ABSENT | ABSENT | Required before migrate (OD-SA-02) | Docs ahead of code · expected |
| Validators canonical-only | PASS | N/A | Blocks legacy bind | Documented FAR-01 | Intentional gap until 02-KEY |
| Orphan beat-audio objects | No janitor | storage.objects | **30** orphans | ARCH-01 AR-03 | Adjacent wave |
| Naming STORAGE-ARCH-02 vs 02-KEY | — | — | — | Cold-start conflates | **DRIFT** (docs) |
| take / artifacts | Separate builders | OK | Separate | Separate | OUT OF SCOPE |

---

## 14. Migration Safety Analysis

**(Audit analysis only — not an approved implementation plan.)**

Per OD-SA-02 locked sequence: dual-read → inventory → validate → staged migration → verify → cleanup.

| Layer | Dependency | Evidence required | Risk | Blocking condition |
|-------|------------|-------------------|------|--------------------|
| **1. Inventory** | Read-only SQL + object existence | This audit + refresh before impl | Low | Stale counts if fixtures keep writing legacy |
| **2. Canonical key definition** | Freeze K-01 as sole WRITE SSOT | Already in code + ARCH-01 | Low | Owner confirms no third shape |
| **3. Compatibility / dual-read** | Validators + binding accept K-01 **or** K-02 with ownership checks | Design Freeze + tests | **HIGH** if skipped | **OD-SA-02: REQUIRED before migrate** |
| **4. Optional dual-write** | Only if rewrite-while-serving | Usually unnecessary if migrate copy-then-swap | Medium complexity | Owner OD-KEY-04 |
| **5. Backfill** | Copy/move object + update `object_key` transactionally | Dry-run inventory · per-row verify | **HIGH** data loss if blind | Dual-read live · no big-bang |
| **6. Verification** | 100% DB↔storage match · playback sample | SQL + signed URL smoke | Medium | Fail → stop cleanup |
| **7. Legacy retirement** | Delete old keys only after verify + GO | Orphan + migrated leftovers | **HIGH** if early | Separate release (ARCH-06 / OD-KEY-05) |

**Forbidden by freeze:** big-bang rename · mass delete · blind rewrite · re-upload-all as first step.

---

## 15. Architecture Findings

| ID | Layer | Finding | Evidence | Severity | Status |
|----|-------|---------|----------|----------|--------|
| **F-KEY-01** | Data | 68/73 `beat_audio_assets` are legacy USER keys; all 68 on PUBLISHED | Live SQL | HIGH (debt) | **CONFIRMED** |
| **F-KEY-02** | Code | Dual-read **ABSENT**; validators canonical-only | `audio-validation.ts` · `user-audio-authz.ts` | HIGH (mutate/publish) | **CONFIRMED** |
| **F-KEY-03** | Code | Access Gate **reads** legacy via opaque DB key | `audio-access.ts` | INFO (compat) | **CONFIRMED** |
| **F-KEY-04** | Process | Legacy count grew 51→68 without product legacy writer | ARCH-01 vs live · tests still seed K-02 | MEDIUM | **HYPOTHESIS** on cause |
| **F-KEY-05** | Storage | 30 orphan `beat-audio` objects (28 legacy + 2 `users/`…) | SQL reconcile | MEDIUM | **CONFIRMED** · ARCH-04/05 |
| **F-KEY-06** | Docs | Cold-start / example docs still alias dual-read as STORAGE-ARCH-02 | FINAL_COLD_START · FUTURE_SCALABILITY example | LOW | **DRIFT** |
| **F-KEY-07** | Tests | Live tests hardcode legacy beat keys for fixtures | `wave*-live.test.ts` etc. | MEDIUM | **CONFIRMED** |

---

## 16. RCA

### RCA-KEY-01 — Split-brain read vs bind (FAR-01 core)

- **Symptom:** LIVE catalog keys fail `validateObjectKey` / publish binding; playback path does not call those validators.
- **Evidence:** §5 join table · `assertUserAssetBinding` · `audio-access` signed URL.
- **Root cause:** USER key convention changed to `.../{assetId}/master.bin` in community transport builders; existing objects retained `.../master/{assetId}.bin`; dual-read never shipped (OD-SA-02 deferred).
- **Affected layer:** beat-audio keys + AuthZ binding + publish gate.
- **Severity:** HIGH for **write/publish of legacy rows**; MEDIUM for catalog health debt; playback likely OK.
- **Production impact:** **YES** for owner re-upload finalize against legacy asset id / re-publish gate; **LIKELY NO** for anonymous PLAYBACK of already PUBLISHED beats (CODE-VERIFIED path; E2E **NOT VERIFIED**).
- **Migration impact:** Dual-read must land before any key rewrite (locked).

### RCA-KEY-02 — Legacy row growth after ARCH-01

- **Symptom:** +17 legacy DB rows (51→68).
- **Evidence:** Count tables §5.4; no product K-02 writer in `src/` (tests only).
- **Root cause:** **HYPOTHESIS** — production-touching live tests / fixtures inserting K-02; or other non-app writers.
- **Affected layer:** data hygiene / test isolation.
- **Severity:** MEDIUM.
- **Production impact:** Increases migration inventory; may pollute catalog.

---

## 17. Owner Decisions

### OD-KEY-01 — Start STORAGE-ARCH-02-KEY implementation track?

- **Decision:** Czy po tym audycie otwieramy Design Freeze → Arch Review → Implementation GO dla dual-read?
- **Current evidence:** FAR-01 confirmed · 68 legacy PUBLISHED · dual-read ABSENT.
- **Options:** A) Proceed to Design Freeze · B) Defer · C) Docs-only close without code.
- **Impact:** Unblocks safe mutate/publish for legacy-era beats; prerequisite for ARCH-06.
- **Blocked by:** None for choosing A/B.
- **Recommendation (informational):** **A** if community owners must replace audio / re-publish; else B with monitoring.

### OD-KEY-02 — Confirm canonical USER key format?

- **Decision:** Czy zamrażamy K-01 `user/{owner}/{beat}/{asset}/{purpose}.bin` as sole WRITE SSOT (already in code)?
- **Current evidence:** Builder + validators already assume K-01.
- **Options:** Confirm K-01 · propose alternate (would expand scope).
- **Recommendation:** Confirm **K-01**.

### OD-KEY-03 — Dual-read required before any backfill?

- **Decision:** Potwierdzenie OD-SA-02.
- **Current evidence:** Locked freeze · this audit.
- **Options:** Keep REQUIRED · Owner override (unsafe).
- **Recommendation:** Keep **REQUIRED**.

### OD-KEY-04 — Dual-write needed?

- **Decision:** Czy nowe uploadery mają pisać legacy+canonical?
- **Current evidence:** Writers already canonical-only; dual-write adds complexity.
- **Options:** No (prefer dual-read + staged migrate) · Yes temporary.
- **Recommendation:** **No** unless Design Freeze finds a hard constraint.

### OD-KEY-05 — Legacy retirement as separate release?

- **Decision:** Cleanup delete of old keys / orphans = STORAGE-ARCH-06 (+04/05) osobno?
- **Current evidence:** Freeze forbids cleanup in dual-read gate; 30 orphans exist.
- **Options:** Separate releases (aligned with freeze) · combine (riskier).
- **Recommendation:** **Separate**.

### OD-KEY-06 — Stop legacy key seeding into Production?

- **Decision:** Czy live tests / fixtures muszą przejść na K-01 i mieć zakaz seedowania K-02 na prod?
- **Current evidence:** Tests hardcode K-02 · count grew · HYPOTHESIS on cause.
- **Options:** Fixture hygiene GO · ignore · investigate only.
- **Recommendation:** Investigate + hygiene if Owner wants stable inventory.

### OD-KEY-07 — Scope orphans in this wave?

- **Decision:** Czy 30 orphan objects wchodzą do 02-KEY Design Freeze, czy zostają w ARCH-04/05?
- **Current evidence:** Orphans confirmed; freeze maps orphan GC to later waves.
- **Recommendation:** Keep in **04/05**; inventory cross-link only.

---

## 18. Acceptance Criteria

| AC | Question | Evidence | Status |
|----|----------|----------|--------|
| **AC-01** | All legacy key patterns known? | K-01…K-04 on beat-audio; K-05–07 adjacent | **PASS** |
| **AC-02** | Producer/consumer per material pattern? | §7 graphs | **PASS** |
| **AC-03** | 68/73 reconciled? | Live SQL §5 | **PASS** |
| **AC-04** | Dual-read exists? | Code scan → ABSENT | **PASS** (answered) |
| **AC-05** | Dual-write exists? | Code scan → ABSENT | **PASS** (answered) |
| **AC-06** | Security/ownership boundaries? | §12 CODE-VERIFIED + gaps | **PASS** with NOT VERIFIED E2E |
| **AC-07** | Safe migration dependencies? | §14 + OD-SA-02 | **PASS** (analysis) |
| **AC-08** | Owner Decisions listed? | §17 OD-KEY-01…07 | **PASS** |

---

## 19. NOT VERIFIED / Evidence Gaps

| Gap | Why |
|-----|-----|
| Browser PLAYBACK E2E on a legacy PUBLISHED beat | Not run this audit |
| Exact provenance of +17 legacy rows | No audit trail SQL; HYPOTHESIS only |
| Whether any owner already hit publish/bind DENY in UX | No support logs pulled |
| Contabo / external storage | Out of scope |
| take-audio object↔row orphan math | Adjacent; not fully expanded |

---

## 20. Implementation Readiness

| Gate | Status | Evidence |
|------|--------|----------|
| **DESIGN FREEZE** | **NOT READY** | Need freeze of dual-read acceptance rules, binding semantics, test matrix, non-goals (no migrate yet) |
| **ARCH REVIEW** | **NOT READY** | Depends on Design Freeze artifact |
| **OWNER GO** (implementation) | **NOT READY** | Audit GO only; OD-KEY-01 pending |
| **IMPLEMENTATION** | **NOT READY** | Dual-read ABSENT · migration FORBIDDEN until dual-read + staged plan |

**This audit:** sufficient for Owner to choose next gate (Design Freeze vs Defer).

---

## 21. Recommended Next Step

**Informational only:**

1. Owner resolves **OD-KEY-01** (and preferably **OD-KEY-02/03/06**).
2. If proceed: **DESIGN FREEZE** for STORAGE-ARCH-02-KEY — dual-read validators + binding that accept K-01 **or** K-02 with ownership proofs; **no** backfill in that freeze.
3. Keep orphan GC and physical key migration in later waves (04/05/06).
4. Do **not** delete legacy objects, implement dual-write, or start R2/S3 under this wave.

---

## 22. Repository Safety

| Check | Result |
|-------|--------|
| Product code changed | **NO** |
| DB changed | **NO** |
| Supabase changed | **NO** (read-only SQL) |
| Storage changed | **NO** |
| Auth changed | **NO** |
| ENV changed | **NO** |
| Infrastructure changed | **NO** |
| Commit | **NONE** |
| Push | **NONE** |
| Deploy | **NONE** |
| Artifact | **This file only** — `docs/audits/AUDIT_STORAGE_ARCH_02_KEY_FAR_01.md` — **uncommitted** |

---

## FINAL STATUS

**AUDIT COMPLETE — READY FOR OWNER DECISION**
