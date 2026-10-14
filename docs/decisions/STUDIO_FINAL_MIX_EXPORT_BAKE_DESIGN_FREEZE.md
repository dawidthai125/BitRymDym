# Studio Final Mix Export — Bake / Artifact Design Freeze (Stage F)

**Status:** DESIGN FREEZE ACCEPTED + **Stage G LOCAL IMPLEMENTATION**
**Date:** 2026-10-10
**Stage F:** architecture lock · **Stage G:** local code + unit tests (this update)
**Parent freeze:** [STUDIO_FINAL_MIX_DESIGN_FREEZE.md](./STUDIO_FINAL_MIX_DESIGN_FREEZE.md)
**Offline core:** [STUDIO_FINAL_MIX_SFM2_OFFLINE_RENDER.md](../architecture/STUDIO_FINAL_MIX_SFM2_OFFLINE_RENDER.md)
**Repo HEAD at Stage G authoring:** `4c39e6c24c6f5f78c08cafe185f1d01f524f9c9c`
**Sacred WIP:** `src/lib/takes/recording-eligibility-service.ts` — **out of scope**

```text
OWNER ACCEPT: OD-SFM-F01…F07 (F04 modified — no silent tail trim)
STAGE G–I: IMPLEMENTED · landed PR #4 @ faf734b · dpl_9YDCy…
APP DEPLOYED · I.45DR narrow Contabo WAV canary PASS
J2 DOWNLOAD AUTHZ: PASS / CLOSED (I.45EX-A16/A17/A18)
STAGE J: CLOSED (GO-SJ-DOCS-CLOSE · audits/STAGE_J_FINAL_CLOSURE.md)
FINAL MIX GREEN CRITERIA: FROZEN (GO-FM-CRITERIA)
Final Mix Production GREEN: VERIFIED (audits/FINAL_MIX_PRODUCTION_GREEN_CLOSEOUT.md · frozen IN only)
Empty-session production gate: PASS
FULL FIXTURE VERIFIED: PASS (audits/FINAL_MIX_FULL_FIXTURE_VERIFIED_CLOSEOUT.md)
FM IN open: none (all IN PASS)
FM WAIVE: Contabo always-on · bit-perfect PCM · P6.8
≠ Contabo always-on · ≠ bit-perfect PCM · ≠ P6.8 · ≠ OUT items
E3 MIX / TAKE_EXPORT CONTRACTS: UNCHANGED
STAGE J CRITERIA: decisions/STAGE_J_CLOSURE_CRITERIA_FREEZE.md
FM CRITERIA: decisions/FINAL_MIX_PRODUCTION_GREEN_CRITERIA_FREEZE.md
```

### Stage G implementation status (2026-10-10)

| Area | Status |
|------|--------|
| Artifact model Option A (`project_id` XOR) | **IMPLEMENTED** (migration file only) |
| Object key OD-SFM-F02 | **IMPLEMENTED** + unit tested |
| Retention via `artifactRetentionSeconds` | **IMPLEMENTED** (reuses MIX/TAKE complete path) |
| FX post-roll F04 (max 3000 ms; no silent trim) | **IMPLEMENTED** + unit tested |
| Offline bake dispatcher | **IMPLEMENTED** (`runClaimedStudioExportWorkerJob`) |
| Partial success / upsert / repair | **IMPLEMENTED** (code path; integration not run) |
| ARTIFACT / unsupported FX fail-closed | **IMPLEMENTED** (offline renderer) |
| Unit / contract tests | **UNIT TESTED** |
| Local worker / Storage / DB bake | **LOCAL INTEGRATION NOT RUN** |
| Live Web Audio parity | **FUNCTIONAL EVIDENCE ACCEPTED (I.14-01)** — not full PCM / bit-perfect parity |
| Production / Contabo | **APP DEPLOYED** (Git tip = **GO-A** docs integrity · parent `50d7788` · prior `2adb569` I.48 HISTORY; prod last-known `dpl_sAyrsHC…` @ `2adb569` · **I.48-A0** Ready · **≠** Git tip · GO-A did not re-verify; prior `dpl_28oH…` @ `f730a7a` = HISTORY I.46-A10; app-code tip `ce2f0cc` / prior `dpl_1P8ixpt…`; PR #4 history `@faf734b`) · Contabo **not** always-on · **I.45DR** narrow canary **PASS** · **J2 PASS / CLOSED** · **object_key reject-only PASS** (narrow) · Stage J **OPEN** · Full Final Mix GREEN **OPEN** · apex redirect e2e **NOT VERIFIED** |

**Legend used below**

| Tag | Meaning |
|-----|---------|
| `REPO FACT` | Confirmed in current code / migrations / docs |
| `ARCHITECTURAL RECOMMENDATION` | Author recommendation for Stage G |
| `OWNER DECISION REQUIRED` | Must be accepted/rejected by Owner before Stage G |

---

## 1. Status and scope

### IN (this freeze)

1. Canonical artifact model for `STUDIO_EXPORT` (schema posture).
2. Storage object-key contract and download AuthZ posture.
3. Retention / cleanup for job, snapshot, WAV, failed/partial uploads.
4. FX-tail policy for first shippable bake.
5. Live/offline FX parity acceptance bar (honest, non–bit-identical).
6. Target bake lifecycle, failure classes, retry/idempotency.
7. Acceptance criteria and Stage G+ sequencing.

### OUT

- Any application code, SQL migration application, worker/Contabo start.
- UI Export wiring (parent freeze OD-SFM-05 — separate GO).
- Changing MIX / TAKE_EXPORT semantics, buckets, or RLS for those kinds.
- True Peak / LUFS / brickwall oversampling.
- ARTIFACT clip export (remains fail-closed).
- Sacred WIP / eligibility / premium matrix redesign.

---

## 2. Architectural problem

> **Historical Stage F posture (pre–Stage G):** at freeze authoring time, enqueue + HTTP + SQL constraints for `STUDIO_EXPORT` existed while the worker still fail-closed bake with `STUDIO_EXPORT bake is not implemented…`. That gap was closed in Stage G (`runClaimedStudioExportWorkerJob`) and exercised locally in H2 / Stage I.7. Do not treat the bullets below as current living code state.

`REPO FACT` (Stage F snapshot) — Enqueue + HTTP + SQL constraints for `STUDIO_EXPORT` exist; worker **then** fail-closed bake:

- `runRealRenderWorkerJob` → `failRunningJob(..., "STUDIO_EXPORT bake is not implemented...")`
  (`src/lib/audio/render-worker-pipeline.ts`) — **superseded by Stage G bake dispatcher**.
- Offline PCM renderer exists separately: `renderStudioDocumentOffline`
  (`src/lib/studio/studio-offline-render.ts`) + unit tests.
- `audio_artifacts` XOR allows only `(mix_session_id)` XOR `(take_id)`
  (`supabase/migrations/20261005230000_p4_recording_identity_download_foundation.sql`) — later extended for Studio `project_id` in Stage G migration.
- Object-key builders exist only for MIX and TAKE_EXPORT
  (`src/lib/audio/artifact-object-key.ts`) — later + Studio export key builder.
- WAV encode/QC exists and is reused by E3/TAKE paths
  (`src/lib/audio/wav-encode.ts`).

**Gap (Stage F):** no locked contract for Studio artifact row + key + bake compensation + FX tail + parity bar before wiring Stage G.

---

## 3. Repo facts (verified paths)

| Topic | Fact | Path |
|-------|------|------|
| Job kind | `MIX` \| `TAKE_EXPORT` \| `STUDIO_EXPORT` | `types` / Stage A migration `20261010185003_*` (was local `20261010010000_*`; prod I.26) |
| Snapshot | `document_snapshot` jsonb; STUDIO requires NOT NULL | `20261010185020_*` (was local `20261010020000_*`; prod I.26) |
| Claim re-AuthZ | Studio resolver at claim; MIX resolver rejects STUDIO | `studio-export-source-resolution.ts`, `render-source-resolution.ts` |
| Bake dispatch | STUDIO → DISABLED fail-closed | `render-worker-pipeline.ts` |
| Offline render | TAKE/BEAT_REF; ARTIFACT unsupported; end = `timelineLengthMs` | `studio-offline-render.ts` |
| Delay max | ≤ 2s feedback line | SFM-2 doc + `studio-offline-fx-delay` |
| Reverb | Seeded offline IR; live `Math.random` | `studio-fx-impulse.ts`, `studio-fx-graph.ts` |
| Artifact bucket | `audio-artifacts` | `AUDIO_ARTIFACTS_BUCKET` in `audio-render.ts` |
| MIX key | `user/{owner}/mix/{mixSessionId}/jobs/{jobId}/{TIER}.{ext}` | `artifact-object-key.ts` |
| TAKE key | `user/{owner}/take-export/{takeId}/jobs/{jobId}/{TIER}.{ext}` | same |
| Artifact XOR | mix XOR take only | P4 migration |
| Unique job→artifact | `audio_artifacts_render_job_uidx` on `render_job_id` | E3.1 foundation migration |
| Claim timeout | 180s from CLAIM | `AUDIO_RENDER_JOB_TIMEOUT_SECONDS` |
| Max attempts | 3 | `AUDIO_RENDER_MAX_ATTEMPTS` |
| Download TTL class | 300s signed GET | `AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS` |
| Retention SSOT | `limitsForPremiumTier(...).artifactRetentionSeconds` | `premium-tiers` / `render-job-core.ts` |
| Contabo | STOPPED/DISABLED until Ops GO | parent freeze + `REUSE_SSOT_MAP.md` |
| MVP tier | `STUDIO_EXPORT_MVP_TIER = "WAV"` | `audio-render.ts` |
| Enqueue | Does not start worker | `studio-export-service.ts` |

**Working-tree note:** Stage A/B/C/D export modules may still be untracked/local relative to remote; facts above are from the current workspace tree at authoring HEAD.

---

## 4. F1 — Canonical artifact model

### Option A — Extend `audio_artifacts` (recommended)

`ARCHITECTURAL RECOMMENDATION`

Additive migration (Stage G, not now):

1. `ADD COLUMN project_id uuid NULL REFERENCES studio_projects(id) ON DELETE RESTRICT`.
2. Replace `audio_artifacts_source_xor_chk` with ternary XOR:

```text
(mix_session_id NOT NULL AND take_id IS NULL AND project_id IS NULL)  -- MIX
OR (take_id NOT NULL AND mix_session_id IS NULL AND project_id IS NULL) -- TAKE_EXPORT
OR (project_id NOT NULL AND mix_session_id IS NULL AND take_id IS NULL) -- STUDIO_EXPORT
```

3. Keep `render_job_id` UNIQUE (one artifact row per job).
4. Partial index `WHERE project_id IS NOT NULL`.
5. No change to existing MIX/TAKE rows (new column NULL).

| Criterion | Assessment |
|-----------|------------|
| SSOT | Same table/bucket/download plane as E3 — REUSE FIRST |
| Backward compat | Additive; existing XOR rows remain valid |
| FK/XOR risk | Must stay aligned with `render_jobs` kind XOR |
| Idempotent retry | Same `render_job_id` unique + deterministic object key |
| AuthZ | Continue service_role write; owner SELECT RLS |
| Cost | One migration + key helper + worker branch |
| Cleanup | Reuse expires_at + existing delete patterns |
| Duplication | Avoids second artifact subsystem |

### Option B — Separate Studio artifact table

New table (e.g. `studio_export_artifacts`) + RLS + grants + cleanup + download API.

| Criterion | Assessment |
|-----------|------------|
| SSOT | Second durable-export plane — conflicts with ZERO DUPLICATE LOGIC |
| Compat | Isolates MIX/TAKE, but doubles ops surface |
| Cost | Higher (schema, services, tests, retention jobs) |
| Risk | Drift vs `audio_artifacts` download AuthZ |

### Other patterns considered

- Store only Storage object without Postgres row: **rejected** — breaks owner list/download AuthZ and job linkage used by MIX/TAKE.
- Reuse MIX row with null mix_session: **rejected** — violates current XOR and confuses product semantics.

### Recommendation

**Option A.**
`OWNER ACCEPTED` — OD-SFM-F01 Option A (Stage G migration file authored; not applied).

---

## 5. F2 — Object key and Storage

### Deterministic object key (proposed)

`ARCHITECTURAL RECOMMENDATION`

```text
user/{ownerId}/studio-export/{projectId}/jobs/{jobId}/WAV.wav
```

| Segment | Rule |
|---------|------|
| Bucket | `audio-artifacts` only (`REPO FACT`) |
| ownerId / projectId / jobId | Server UUIDs from job row — never client path |
| Tier filename | MVP locked to `WAV.wav` (OD-SFM-02 parent default) |
| Collision | Distinct prefix from `mix/` and `take-export/` |

Helper (Stage G): `buildStudioExportArtifactObjectKey` + `expectedStudioExportArtifactObjectKey` mirroring TAKE/MIX helpers.

### Separation of concerns

| Layer | Responsibility |
|-------|----------------|
| 1. Object key | Pure function of owner+project+job (+tier) |
| 2. Postgres metadata | `audio_artifacts` row: owner, project_id, render_job_id, format, quality_tier, byte_size, checksum, expires_at, status |
| 3. Storage ops | service_role upload/overwrite to canonical key; on failure remove orphan object |
| 4. Download AuthZ | Existing owner-scoped artifact download patterns; reject client `object_key` / URL (`rejectClientRenderSourceClaims`) |

`OWNER DECISION REQUIRED` — OD-SFM-F02 accept key shape above (or propose alternate prefix).

---

## 6. F3 — Retention and cleanup

### Repo facts (retention)

- Artifact `expires_at` set from entitlement snapshot / `retentionSecondsForTier` at MIX/TAKE complete paths (`render-job-service.ts`).
- Tier matrix holds `artifactRetentionSeconds` (and design-seconds) via `limitsForPremiumTier` — **do not invent new SSOT numbers in Stage G**.
- Stage B migration comment: snapshot retention follows the job row lifecycle.

### Proposed policy (Studio)

| Asset | Policy | Tag |
|-------|--------|-----|
| `render_jobs` row | Keep through terminal status; no auto-purge in MVP bake GO | `ARCHITECTURAL RECOMMENDATION` |
| `document_snapshot` | Lives on job row; deleted only with job (or redacted on admin purge later) | `ARCHITECTURAL RECOMMENDATION` |
| WAV artifact | Same `expires_at` formula as MIX/TAKE via existing premium limits | `ARCHITECTURAL RECOMMENDATION` — reuse SSOT |
| FAILED (pre-upload) | No artifact row; no Storage object; job terminal FAILED | `ARCHITECTURAL RECOMMENDATION` |
| FAILED (post-upload / meta fail) | Compensating Storage delete + no READY row (mirror MIX complete error paths) | `REPO FACT` pattern exists |
| Partial upload | Delete Storage object before leaving FAILED; never mark READY without QC+row | `ARCHITECTURAL RECOMMENDATION` |
| Retry same jobId | Overwrite same object key; upsert-by-`render_job_id` forbidden if SUCCEEDED; only reclaim from QUEUED | `ARCHITECTURAL RECOMMENDATION` |
| Re-enqueue (new idempotency) | New jobId → new key → new artifact | `REPO FACT` enqueue model |
| Delete artifact while job SUCCEEDED | Forbidden for owner self-serve in MVP; expires_at governs | `OWNER DECISION REQUIRED` OD-SFM-F03 |

`OWNER DECISION REQUIRED` — OD-SFM-F03: confirm **reuse existing premium `artifactRetentionSeconds`** for Studio WAV (no special Studio TTL).

---

## 7. F4 — FX tails policy

`REPO FACT` — Offline render duration is `min(timelineLengthMs, maxDurationMs?)` with hard cap 180_000 ms; **no dedicated post-roll**.

| Option | Behavior | Pros | Cons |
|--------|----------|------|------|
| **A. Exact timeline** | Export length = document timeline | Predictable; matches grid end | May truncate delay (≤2s) / reverb tails |
| **B. Fixed post-roll** | Timeline + constant tail (proposed **3000 ms**), then clamp to 180s | Simple; covers delay max 2s + short reverb | Slightly longer files; clamp at 180s still truncates |
| **C. Effect-aware tail** | Compute from enabled delay/reverb params (capped) | Minimal extra silence when dry | Complex; harder tests; still needs clamp |

### Owner decision (ACCEPTED with modification)

**OD-SFM-F04 ACCEPTED** — bounded post-roll (max **3000 ms**) when enabled wet delay/reverb requires it; **no silent trim**.

**Implemented rule** (`studio-export-fx-post-roll.ts`):

```text
bypass / disabled / mix≤0 → contribution 0
enabled delay mix>0 → request MAX 3000 ms (feedback can exceed MAX; not full ring-down)
enabled reverb mix>0 → min(3000, ceil(decaySeconds*1000))
postRoll = min(3000, max contributions)
exportMs = timelineMs + postRoll
if exportMs > 180_000 → STUDIO_RENDER_TAIL_DURATION_CAP (typed; never silent trim)
```

3000 ms does **not** guarantee full audible decay for high-feedback delay.

---

## 8. F5 — Live / offline FX parity bar

`REPO FACT` — Offline ≠ bit-identical live (seeded IR vs `Math.random`; Node dynamics ≈ Web Audio; NOT True Peak). Documented in SFM-2.

### Must be functionally aligned (MVP)

| Item | Bar |
|------|-----|
| Signal order | clip → track FX → track gain/pan → Σ → master FX → master gain/pan |
| Mute/solo/audible set | Same interpretation SSOT |
| Geometry / fades / offsets | Same `interpretStudioSessionAtPlayhead` + `effectiveClipGain` |
| EQ / delay / compressor topology | Same enabled chain order; bypass = dry |
| Sample rate / channels | 44.1 kHz stereo |
| ARTIFACT | Fail-closed both planes |

### Acceptable differences (MVP)

| Item | Allowed |
|------|---------|
| Reverb IR realization | Seeded offline vs live random |
| Compressor/limiter detector | Node approx vs `DynamicsCompressorNode` |
| True Peak / LUFS | Out of scope |
| Partitioned convolve latency | Small wet delay vs live Convolver |

### Block export (fail-closed)

| Condition | Action |
|-----------|--------|
| Enabled unsupported FX type/schema | `STUDIO_RENDER_FX_UNSUPPORTED` → job FAILED |
| ARTIFACT clip present | FAILED (not silent skip at bake) — note: enqueue collector currently skips ARTIFACT; bake must still refuse if snapshot contains ARTIFACT |
| Missing/unauthorized source at claim | SOURCE_* → FAILED |
| PCM/WAV QC fail | ENCODE_FAILED / INVALID → FAILED |

### How to test without bit-identity

1. Unit: offline deterministic golden PCM hashes for fixed fixtures.
2. Correlation: energy/onset windows live-offline vs render-offline on shared fixtures (thresholded).
3. Regression: MIX/TAKE_EXPORT suites still green.
4. No requirement: sample-identical WAV vs browser tap.

`OWNER ACCEPTED` — OD-SFM-F05: functional + deterministic offline.

**Owner risk freeze I.14 (2026-10-10) — supersedes “live not verified” for canary *planning* only:**

| ID | Decision | Binding effect |
|----|----------|----------------|
| **I.14-01 Evidence** | Plane B **9/9 PASS** = **functional evidence**, not full Live↔Offline PCM / bit-perfect parity | Missing harness metrics remain a limitation; do not claim full sonic identity |
| **I.14-02 Mute** | Fully inaudible session → controlled **`STUDIO_RENDER_EMPTY_SESSION`** at offline renderer; **no** automatic silent WAV | **I.17:** job persists `error_code=STUDIO_RENDER_EMPTY_SESSION` (typed; not collapsed to `ENCODE_FAILED`); public status allowlists code + safe PL message; no READY artifact / no SUCCEEDED. **I.18:** confirmed locally (worker/DB/Storage) per historical session notes — evidence file **MISSING ON CURRENT MAIN** (`STUDIO_EXPORT_I18_EMPTY_SESSION_INTEGRATION.md` · **HISTORICAL LOCAL EVIDENCE — NOT COMMITTED**) |
| **I.14-03 Reverb** | Live vs offline IR differences accepted for V1 | No IR / seed / convolve changes in I.15 |
| **I.14-04 Resampling** | Linear resample accepted for V1 parity harness | No new resampler; export remains 44.1 kHz stereo |

### Stage I.45E — STUDIO_EXPORT source PCM resampling (addendum)

| Item | Decision / fact |
|------|-----------------|
| Scope | **STUDIO_EXPORT only** — after `decodeRenderSourceToStereoPcm`, before `pcmByTake` / `pcmByBeat` |
| Mechanism | Reuse existing E3 MIX helper `resampleStereoInterleaved` (linear) → `AUDIO_CODEC.WAV_SAMPLE_RATE` |
| Identity | When decoded rate already equals WAV target, no conversion (same reference) |
| Input rates | Any finite positive rate that passes duration / projected-frame safety guards (aligned with `AUDIO_RENDER_MAX_SOURCE_DURATION_SECONDS`) |
| Anti-alias filter | **None** — same linear limitation as E3 MIX V1 |
| Offline/live | **No** bit-perfect parity claim; export remains offline PCM @ 44.1 kHz stereo |
| Unchanged | `decodeRenderSourceToStereoPcm`, `assertValidPcm`, `renderStudioDocumentOffline`, E3 MIX, TAKE_EXPORT, Sacred WIP |
| Fail-closed | Invalid rate / shape / unsafe projected allocation → `StudioExportPcmPrepareError` → job `SOURCE_UNAVAILABLE` |
| Tests | `src/lib/audio/studio-export-resample-i45.test.ts` (local) |
| Not authorized by this addendum | Production canary · Contabo · commit/push/deploy |

Evidence freeze (FX parity): `STUDIO_FX_PARITY_I13F_EVIDENCE.json` + `STUDIO_FX_PARITY_I13F_REPORT.md` — **MISSING ON CURRENT MAIN** · **HISTORICAL LOCAL EVIDENCE — NOT COMMITTED** (do not treat as tip-available artifacts).

**Chronology (empty-session / failure contract):**

| Stage | Scope | Evidence class |
|-------|--------|----------------|
| **I.15** | Renderer contract + unit/source tests | Local code/tests |
| **I.17** | Typed `error_code` + allowlisted status GET + UI | Local code/tests |
| **I.18** | Worker-once + DB + Storage + public status | **Local integration PASS** (historical Owner session; frozen in I.20 docs) — evidence file **MISSING ON CURRENT MAIN** (`STUDIO_EXPORT_I18_EMPTY_SESSION_INTEGRATION.md` · **HISTORICAL LOCAL EVIDENCE — NOT COMMITTED**) |

**Not authorized by I.14–I.18:** production migrations, prod deploy, canary, Contabo, prod enqueue, commit/push/deploy.

---

## 9. F6 — Target bake lifecycle (**IMPLEMENTED** in Stage G code; integration not run)

```text
1. Worker authenticates (E3_RENDER_WORKER_SECRET)
2. claimRenderJobAsWorker(jobId)
   - status QUEUED only
   - kind gate STUDIO_EXPORT
   - parseStudioExportDocumentSnapshot + digest check
   - live project ownership
   - authorizeStudioExportSourcesForDocument (TAKE/BEAT from DB)
   - on AuthZ fail → FAILED SOURCE_* (no RUNNING)
3. QUEUED → RUNNING + timeout_at = now+180s
4. Download source bytes via authorized bucket/key only
5. Decode → DecodedPcmStereo (existing render-decode)
6. Map snapshot.document → StudioEngineDocument
7. renderStudioDocumentOffline({ document, resolvePcm, exportDurationMs: exportMs })
8. Validate PCM (finite samples, channels, SR)
9. encodeWavFromBake + qcWavBytes
10. Upload to buildStudioExportArtifactObjectKey (upsert/overwrite)
11. Insert audio_artifacts (project_id set; mix/take null) READY + expires_at
    - on insert fail → delete Storage object → FAILED
12. Job RUNNING → SUCCEEDED (only if artifact READY)
13. Crash/retry:
    - reclaim only from QUEUED (existing canClaim)
    - if RUNNING timed out → existing timeout sweeper patterns
    - Storage+DB not one TX: compensate Storage on meta failure;
      if artifact READY and job not SUCCEEDED → repair path: complete job OR delete artifact (Stage G must implement one idempotent reconciler)
```

### Security invariants

- Client never supplies object keys, URLs, source id lists as authority.
- Snapshot is content SSOT, **not** AuthZ SSOT (FINDING-01).
- Fail-closed on every AuthZ/QC miss.
- Contabo/always-on not started by enqueue.

### TOCTOU

`REPO FACT` — Enqueue already re-checks `document_version` before insert; residual race accepted with frozen snapshot.
Bake uses snapshot document, not live CAS version, for PCM content; live AuthZ for sources/ownership at claim.

---

## 10. F7 — Contracts and statuses

### Job status (reuse existing enum)

| From | To | Actor |
|------|----|-------|
| QUEUED | RUNNING | Worker claim |
| QUEUED | FAILED | Claim-time SOURCE_*/AuthZ |
| RUNNING | SUCCEEDED | Worker after artifact READY |
| RUNNING | FAILED | Bake/QC/Storage/persistence errors |
| RUNNING | TIMEOUT | Timeout sweeper (existing) |
| QUEUED/RUNNING | CANCELLED | User cancel (existing capability) |

No resurrect from SUCCEEDED/FAILED/TIMEOUT/CANCELLED (`canCompleteRenderJobSuccess` only RUNNING).

### Error classes (Studio bake)

| Class | Examples | error_code family |
|-------|----------|-------------------|
| Source | Missing take/beat, unpublished beat, foreign take | SOURCE_* |
| Snapshot | Digest/envelope invalid | INVALID |
| Renderer | FX unsupported, ARTIFACT, duration/memory | ENCODE_FAILED / INVALID / LIMIT |
| QC | WAV header/format fail | ENCODE_FAILED |
| Storage | Upload fail | ENCODE_FAILED / infra code as today |
| Persistence | Artifact insert fail | ENCODE_FAILED + compensate |
| Disabled | Bake not wired / flag off | DISABLED |

### Limits (reuse)

| Limit | Value | Source |
|-------|-------|--------|
| Wall from claim | 180s | `AUDIO_RENDER_JOB_TIMEOUT_SECONDS` |
| Attempts | 1..3 | `AUDIO_RENDER_MAX_ATTEMPTS` |
| Timeline/export | ≤180s | offline DURATION_CAP (+ tail clamp) |
| Concurrent/daily/quota | Premium matrix | existing enqueue caps |
| Download TTL | 300s | `AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS` |

### Telemetry (minimal, no secrets)

Job id, kind, status transitions, error_code, durations (claim→encode→upload), byte_size, exportMs, peakAbs/rms optional — **never** object payloads, JWTs, or source URLs.

---

## 11. Owner decisions (Stage G)

| ID | Decision | Owner | Implemented |
|----|----------|-------|-------------|
| **OD-SFM-F01** | Artifact model A | **ACCEPT** | migration `20261010185034_*` (**applied on production** in I.26; was local filename `20261010030000_*`) |
| **OD-SFM-F02** | Object key studio-export/…/WAV.wav | **ACCEPT** | `buildStudioExportArtifactObjectKey` |
| **OD-SFM-F03** | Reuse `artifactRetentionSeconds` | **ACCEPT** | complete path |
| **OD-SFM-F04** | Post-roll max 3000; **no silent trim** | **ACCEPT (modified)** | `planStudioExportDuration` |
| **OD-SFM-F05** | Functional parity bar | **ACCEPT** | documented; live not verified |
| **OD-SFM-F06** | ARTIFACT → fail | **ACCEPT** | offline renderer |
| **OD-SFM-F07** | Local code first; worker once separate | **ACCEPT** | no worker run in Stage G |

Parent decisions: OD-SFM-01…06 in [STUDIO_FINAL_MIX_DESIGN_FREEZE.md](./STUDIO_FINAL_MIX_DESIGN_FREEZE.md). **Note (2026-10-14):** OD-SFM-02 (WAV-only product ladder) is **SUPERSEDED** for living product scope by [STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md](./STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md).

**F-addendum OWNER ACCEPTED (docs · NOT IMPLEMENTED):** [STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md](./STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md)

| ID | Living status |
|----|---------------|
| **OD-SFM-F01** | **IN FORCE** (unchanged) |
| **OD-SFM-F02** | **SUPERSEDED (SFM scope only)** by **F02b** — history in this table/§5 retained |
| **OD-SFM-F02b** | **OWNER ACCEPTED** — multi-format version-scoped keys · current READY invariant · AuthZ/downgrade — **NOT IMPLEMENTED** |
| **OD-SFM-F03** | **SUPERSEDED (SFM scope only)** by **F03b** — history retained |
| **OD-SFM-F03b** | **OWNER ACCEPTED** — SFM 90d from `MASTER_SUCCEEDED` · does **not** change TAKE/RAW/E3 — **NOT IMPLEMENTED** |
| **OD-SFM-F04…F07** | **IN FORCE** (unchanged) |

Shipping code may still follow historical F02 WAV-only + F03 matrix until Implementation GO.

---

## 12. Acceptance criteria (for Stage G implementation GO)

| ID | Criterion |
|----|-----------|
| AC-F01 | Worker bake path implements §9 without calling MIX/TAKE bake |
| AC-F02 | Artifact row uses Option A XOR + Studio object key |
| AC-F03 | Idempotent retry does not create second READY artifact for same `render_job_id` |
| AC-F04 | AuthZ fail-closed at claim; no client key influence |
| AC-F05 | FX tail policy matches OD-SFM-F04 |
| AC-F06 | Offline determinism tests green; parity bar OD-SFM-F05 documented in tests |
| AC-F07 | MIX/TAKE_EXPORT regression suites PASS |
| AC-F08 | Enqueue still does not auto-start Contabo |
| AC-F09 | Sacred WIP untouched |
| AC-F10 | Compensating cleanup on partial Storage/DB failure |

---

## 13. Next stages (ordering only — not authorized)

```text
Stage F  Design Freeze — DONE (Owner ACCEPT OD-SFM-F01…F07 w/ F04 mod)
Stage G  Local implementation — DONE in workspace (unit tested)
Stage H  Local isolated worker smoke — DONE locally (H2 SUCCEEDED + WAV QC; Contabo still STOPPED)
Stage I  UI Export wiring (parent OD-SFM-05) — DONE in workspace
Stage I.3A Export dialog focus/a11y — DONE in main workspace (unit + prior local browser)
Stage I.7 Controlled local E2E — PASS (UI→API→worker-once→WAV→Storage→download→cleanup)
Stage I.8 Main↔worktree I.3A reconcile + SSOT docs — historical
Stage I land PR #4 @ faf734b / dpl_9YDCy… — I.17 + I.45AU/AW recovery · narrow prod smoke I.45BK/BM/BO
Stage J  Contabo / prod canary — **I.45DR narrow WAV canary PASS** (2026-10-12) · **J2 Download AuthZ PASS / CLOSED** (I.45EX-A16/A17/A18) · Stage J **OPEN** (J2 only) · Full Final Mix GREEN / remaining gates still **OPEN**
```

### Stage I status (2026-10-11; Contabo/Stage J living rows updated 2026-10-12)

| Plane | Status |
|-------|--------|
| UI control `StudioExportControl` | **IMPLEMENTED** — replaces OD-VS-03 deep-link in transport |
| Enqueue | `POST /api/studio/projects/[projectId]/export` |
| Status | `GET …/export?jobId=` — owner + project-scoped; returns `artifactId` when READY |
| Latest recovery (I.45AU) | `GET …/export` (no `jobId`) — owner + project ownership; `found:false` when empty; **no enqueue**; UI restores on dialog open |
| Download | Existing `GET /api/mix/artifacts/[id]/download` (owner AuthZ / FINDING-03) |
| UI unit/source tests | **RUN locally** (`studio-export-ui.test.ts` incl. I.3A focus contracts) |
| Dialog focus / a11y (I.3A) | **IMPLEMENTED in main** (`studio-dialog-focus.ts`) · unit tested · prior local browser I.3B |
| Runtime UI → API → worker → download | **PASS Stage I.7** (local isolated) · **I.45DR** prod Contabo enqueue→transient worker→READY artifact **PASS (narrow WAV)** · owner download of I.45DR artifact **not** re-claimed here |
| Production app | **DEPLOYED** · Git tip = **GO-A** (parent **`50d7788`** · prior **`2adb569`** I.48 HISTORY) · prod last-known **`dpl_sAyrsHC…`** @ **`2adb569`** (**I.48-A0** Ready · **≠** Git tip · GO-A did not re-verify) · aliases www + `bitrymdym.vercel.app` + `bitrymdym.pl` last-known · apex redirect e2e **NOT VERIFIED** · app-code tip **`ce2f0cc`** / prior `dpl_1P8ixpt…` (PR #5) = last-established evidence · prior `dpl_28oH…` @ `f730a7a` = HISTORY (I.46-A10) · prior `dpl_7Cp2gQ9…` @ `df37048` = HISTORY · prior PR #4 `@faf734b` / `dpl_9YDCy…` = HISTORY |
| Contabo / Stage J | **I.45DR — PASS:** narrow production STUDIO_EXPORT WAV canary · Contabo **not** always-on · **J2 PASS / CLOSED** · **Stage J: CLOSED** ([final closeout](../audits/STAGE_J_FINAL_CLOSURE.md) · [GO-SJ-CRITERIA](./STAGE_J_CLOSURE_CRITERIA_FREEZE.md)) · **Final Mix GREEN criteria FROZEN** ([GO-FM-CRITERIA](./FINAL_MIX_PRODUCTION_GREEN_CRITERIA_FREEZE.md)) · living **Final Mix Production GREEN: VERIFIED** ([closeout](../audits/FINAL_MIX_PRODUCTION_GREEN_CLOSEOUT.md) · frozen IN only) · Contabo always-on **WAIVED** for GREEN (Ops GO separate) |
| Contabo pipeline / markers (last-known) | Byte-synced only: `src/lib/audio/render-worker-pipeline.ts` SHA256 `4a737f94…` (= `@faf734b`; I.45BV/BW) · persistent service **disabled/inactive** · **markers I.45CF APPLIED:** tip `faf734b` · selective · **≠ full-tree** · **I.45CB** closure 67: 1 RAW_MATCH + 66 LINE_ENDING_ONLY · API-outside-closure drift **OPEN** · `E3_RENDER_JOBS_ENABLED` **TRUE** — last confirmed I.45DO/I.45DR · **I.45DR** ops path: transient `systemd-run --wait --collect` + `EnvironmentFile=-/etc/bitrymdym-e3-worker/worker.env` as `bitrymdym-e3` (unit `bitrymdym-e3-canary-53398f9e` · collected) · **I.45DP** manual `source` as service user **FAIL** (no claim; no chmod) · **≠** continuous-mode / full-tree claim |
| Live/offline FX parity | **FUNCTIONAL EVIDENCE (I.13F/I.14-01)** — not full PCM parity · I.13F report/json **MISSING ON CURRENT MAIN** (**HISTORICAL LOCAL EVIDENCE — NOT COMMITTED**) |
| Cross-user download AuthZ (J2) | **PASS / CLOSED** — I.45EX-A16 owner HTTP **200** ALLOW · I.45EX-A17 other-user HTTP **403** DENY · I.45EX-A18 unauth HTTP **401** DENY · artifact `c596e7bc-a031-4df8-a17b-31c4fd2cce8b` · ≠ full module audit · **object_key reject-only (tested scope) PASS** (separate · [closeout](../audits/STAGE_J_OBJECT_KEY_REJECT_ONLY_PROBE_CLOSEOUT.md)) · **P5/P6 owner download endpoint PASS** (JSON only · ≠ WAV retrieval · [closeout](../audits/STAGE_J_P5_P6_OWNER_DOWNLOAD_PROBE_CLOSEOUT.md)) · FIXTURE VERIFIED **NOT CONFIRMED** · Stage J close **WAIVE** byte-level WAV/RIFF ([criteria freeze](./STAGE_J_CLOSURE_CRITERIA_FREEZE.md)) · J2 [closeout](../audits/I45EX_J2_DOWNLOAD_AUTHZ_GATE_CLOSEOUT.md) |
| Empty-session contract (I.15 → I.18 + prod) | **I.15** renderer · **I.17** typed public failure (variant B, in PR #4) · **I.18 local PASS** ON MAIN ([report](../audits/STUDIO_EXPORT_I18_EMPTY_SESSION_INTEGRATION.md)) · **empty-session production PASS** ([closeout](../audits/STUDIO_EXPORT_EMPTY_SESSION_PRODUCTION_CLOSEOUT.md) · job `dac8ccb9-…` · `STUDIO_RENDER_EMPTY_SESSION` · no WAV) · freeze-time “MISSING / not claimed” wording = **historical** |
| Prod smoke (I.45BK/BM/BO) | Recovery GET-only **PASS** · existing WAV download **PASS** (API 200 · RIFF/WAVE · size match · Windows `WAV.wav`) |
| Owner status (I.45BY) | Job `61b7cdf1-…` / project `d07f3011-…` · HTTP 200 · `STUDIO_EXPORT` · **SUCCEEDED** · artifact present · **do not re-run** |
| Contabo canary (I.45DR) | Job `53398f9e-7b7f-4dc5-bc76-34e9648c6aa1` / project `bfc3d223-6107-4e11-a96a-470d88439f0b` · `STUDIO_EXPORT` · `WAV` · attempt 1 · **SUCCEEDED** · artifact `21d98be2-29b2-4d1d-8efb-b1c40af4709e` **READY** · bucket `audio-artifacts` · 10,584,044 B (= `storage.objects`) · 60,000 ms · encoder `pcm_s16le_wav` · **do not re-run** |
| Project delete × export history (I.45CV) | **PRODUCTION VERIFIED (narrow)** @ `ce2f0cc` / PR #5 — DELETE project with `render_jobs`/`audio_artifacts` → HTTP **409** + PL copy · project + deps retained · FK RESTRICT unchanged · empty-project delete **NOT TESTED** · soft-delete **OUT** |

### I.45AU / I.45AW addendum — export recovery (landed PR #4)

- **Problem:** UI held `jobId` only in React state; reload → IDLE and a new POST could create a duplicate job.
- **Contract:** `GET /api/studio/projects/{projectId}/export` without `jobId` returns the latest own `STUDIO_EXPORT` (`created_at DESC`, `id DESC` tie-break) after project ownership check. Empty: `{ success: true, found: false, projectId }`. Existing `?jobId=` unchanged.
- **I.17:** Both GET paths return allowlisted `errorCode` / `errorMessage` (never raw DB/renderer text). UI uses safe `mapped.message` for FAILED in poll and recovery.
- **UI:** On dialog open only — GET latest (AbortController + generation guard). Never POST on mount/recovery/poll. `SUCCEEDED` + READY → download; without READY → `UNAVAILABLE` + „Sprawdź status” (GET only).
- **I.45AW:** `UNAVAILABLE` with tracked `jobId` does **not** show generic „Ponów”; optional explicit „Utwórz nowy eksport mimo braku gotowego pliku” uses `forceNewAttempt` + new `attemptId`.
- **Prod evidence (narrow):** I.45BK recovery GET-only PASS · I.45BM/BO owner WAV download PASS · **I.45DR** Contabo WAV canary PASS — does **not** close Full Final Mix Production GREEN / always-on Contabo / full parity / Studio migration.
- **Non-goals:** No migration/new table · no `localStorage` SSOT · no download AuthZ change · no Contabo always-on from this addendum.

---

## 14. Explicit non-actions (Stage G session)

- No commit/push/deploy · no applied migrations · no worker/Contabo · no real bake/upload · no prod · no Sacred WIP edits · no Owner `:3000` touch

---

## 15. Stop line

```text
STAGE G LOCAL IMPLEMENTATION COMPLETE — AWAITING STAGE H GO
NEXT: Owner GO for local migration apply + worker-once integration smoke
```

---

## 16. Stage I.14 / I.15 — contract freeze addendum (2026-10-10)

### Empty / muted session (I.14-02) — confirmed locally

1. Audible set SSOT: `planVoicesAtPlayhead` / `interpretStudioSessionAtPlayhead` (clip mute, track mute, solo).
2. Offline probe with no voices → `StudioOfflineRenderError("STUDIO_RENDER_EMPTY_SESSION")` in `renderStudioDocumentOffline` (**before** PCM mix / WAV). **I.15.**
3. Same code also used for non-positive `timelineLengthMs` in duration planning — not an RMS gate.
4. Worker `runClaimedStudioExportWorkerJob`: catch → `mapStudioOfflineRenderFail` → `failRunningJob` **before** `encodeWavFromBake` / Storage / `completeRealArtifactAfterEncode`.
5. **I.17:** empty session persists typed `error_code=STUDIO_RENDER_EMPTY_SESSION` (not collapsed to `ENCODE_FAILED`); status GET returns allowlisted `errorCode` + safe `errorMessage`; UI shows Polish empty-session copy.
6. **I.18 (local integration PASS):** historical Owner session on local Supabase (`127.0.0.1:54321` / `:54322`) — enqueue → worker-once → FAILED + typed code; no SUCCEEDED / READY / WAV; public message ≠ internal DB text; fixture cleaned. Evidence **ON MAIN:** [STUDIO_EXPORT_I18_EMPTY_SESSION_INTEGRATION.md](../audits/STUDIO_EXPORT_I18_EMPTY_SESSION_INTEGRATION.md). *(I.20 froze the report; did not re-run. Older “MISSING ON MAIN” notes = historical.)*
7. Live Studio playback may still produce near-silence when muted (UX); **export bake must not** emit silent WAV for an empty audible set.
8. **Production empty-session PASS (2026-10-13):** fixture `a8b42570-…` · job `dac8ccb9-…` · single Contabo oneshot · terminal `FAILED` + `STUDIO_RENDER_EMPTY_SESSION` · `artifactId=null` · always-on remained disabled/inactive · [production closeout](../audits/STUDIO_EXPORT_EMPTY_SESSION_PRODUCTION_CLOSEOUT.md). **≠** Final Mix GREEN · **≠** FULL FIXTURE VERIFIED.

### Evidence classes (do not conflate)

| Class | Meaning |
|-------|---------|
| **Confirmed local behavior** | I.15–I.18 above (code + local integration) |
| **Historical session evidence** | I.13F FX freeze · I.18 empty-session freeze (session-dated; not re-executed in I.20) |
| **Production unverified (remaining)** | Contabo always-on (Ops) · full Live↔Offline PCM parity (WAIVE) · P6.8 (WAIVE) · OUT items · **Final Mix Production GREEN VERIFIED** under freeze via [GREEN closeout](../audits/FINAL_MIX_PRODUCTION_GREEN_CLOSEOUT.md) · **FULL FIXTURE VERIFIED PASS** via [fixture closeout](../audits/FINAL_MIX_FULL_FIXTURE_VERIFIED_CLOSEOUT.md) |

> **Supersession (I.26 / I.28 / PR #4 / I.45DR / I.45EJ-R1 / PR #10 / PR #11 / I.46-A10 / I.47 / PR #12 / I.48-A0):** The I.18 row above remains a session-dated evidence class. Production applied Studio Export migrations as `20261010185003` / `20261010185020` / `20261010185034` (I.26); local files renamed in I.28 (SQL unchanged). App code **DEPLOYED** (app-code tip `ce2f0cc`; Git tip `2adb569` PR #12 docs; prod observed `dpl_sAyrsHC…` @ `2adb569` per **I.48-A0** — I.48-A2/A3 do not re-verify; Ready ≠ Final Mix GREEN; prior `f730a7a` / `dpl_28oH…` = HISTORY I.46-A10; prior `df37048` / `dpl_7Cp2gQ9…` = HISTORY; PR #4 history `@faf734b`). **I.45DR** recorded a narrow Contabo WAV canary PASS. Contabo always-on / Full Final Mix Production GREEN / remaining parity gates remain separate Owner GOs.

**Migration filename mapping (I.26–I.28):** original local `20261010010000` / `20261010020000` / `20261010030000` → repo + prod history `20261010185003` / `20261010185020` / `20261010185034`. Do not treat old prefixes as current filesystem paths.

### Open (Owner may decide later)

- Stronger Live↔Offline numeric thresholds (I.14-01 keeps functional bar).
- Contabo always-on (Ops) — separate Owner GO (**Final Mix GREEN VERIFIED** under freeze; **FULL FIXTURE VERIFIED PASS**; **J2** **PASS / CLOSED**; Stage J **CLOSED**; empty-session **prod PASS**).
- Full FX/PCM parity · Loop/Metronom · P6.8 (WAIVE for GREEN).

### Explicit non-authorization (unchanged)

No Contabo always-on · no Final Mix GREEN claim · no DSP/reverb/resampler edits · no Sacred WIP edits · no commit/push/deploy from this living-status update alone · no re-run of SUCCEEDED jobs `53398f9e-…` / `61b7cdf1-…`.

### Stage I.17 — typed failure contract (variant B, local)

| Item | Decision / fact |
|------|-----------------|
| Owner choice | **Variant B** accepted for local implementation |
| Public code | `STUDIO_RENDER_EMPTY_SESSION` preserved in `mapStudioOfflineRenderFail` → `render_jobs.error_code` |
| Schema | **No migration** — uses existing `error_code` / `error_message` columns |
| Status GET | Returns allowlisted `errorCode` + safe `errorMessage` (never raw DB/renderer text) |
| UI | Polish empty-session copy vs generic FAILED; does not display raw `errorMessage` trustlessly |
| MIX/TAKE_EXPORT | Unchanged taxonomy and mappers |
| Unit/source tests | `studio-export-failure-i17.test.ts` |
| Local worker/DB integration | **Done in I.18** (see evidence freeze); **does not** replace production verification |
| Still separate GO | Contabo poller **impl/enable** ([GO-DF-CONTABO-POLL freeze](./CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md) ACCEPTED · ≠ enable) · P6.8 · full IDOR · apex · empty-project delete (Final Mix GREEN **VERIFIED** · ≠ expand GREEN to WAIVE/OUT) |

### Stage I.20 — SSOT reconciliation (docs only)

- Corrected stale I.14-02 binding that claimed job-layer `ENCODE_FAILED` only.
- Replaced “no worker+DB integration” with I.18 local PASS + production-unverified caveat.
- Added link to I.18 evidence freeze. No code, tests, Supabase, or canary authorization.