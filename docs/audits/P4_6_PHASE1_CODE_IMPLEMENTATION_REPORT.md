# P4.6 PHASE 1 — CODE IMPLEMENTATION

**Date:** 2026-10-07
**Owner GO:** P4.6 Phase 1 — TAKE_EXPORT worker code only
**Final status:** **P4.6 PHASE 1 — GREEN / READY FOR INFRA GO**

---

## Baseline

| Field | Value |
|-------|--------|
| Production SHA | `836679a` (unchanged · not redeployed) |
| Deployment | `dpl_5J2cRHA2XRg7SKCZuyFvVZhBpJpT` |
| Local HEAD at start | `836679a` |
| Architecture audit | `docs/audits/P4_6_E3_WORKER_ARCHITECTURE_AUDIT.md` → **D** |
| Contabo | **NOT STARTED** (Phase 2) |
| Production enqueue | **NONE** |
| Commit / push / deploy | **NONE** |

---

## Contract

- `kind=TAKE_EXPORT` · `take_id` required · `mix_session_id=NULL`
- Take-only source (`take-audio` mic.bin) · **no beat · no MIX bake**
- Tiers: `BASIC_MP3` · `MP3_192` · `HQ_MP3` · `WAV`
- Key: `user/{owner}/take-export/{takeId}/jobs/{jobId}/{TIER}.{ext}`
- Bucket: `audio-artifacts`
- AuthZ: owner + READY + `canExportOwnTake` + existing claim secret
- `workerInfraStatus`: **`PREPARED_CODE`** (code ready; Contabo still STOPPED — not false live READY)

---

## Files Changed

| File | Why |
|------|-----|
| `src/lib/audio/render-source-resolution.ts` | `resolveAuthorizedTakeExportSourcesForJob` take-only |
| `src/lib/audio/render-job-service.ts` | Claim branches on `kind`; `mixSessionId` nullable; fake-complete MIX-only |
| `src/lib/audio/render-worker-pipeline.ts` | `runClaimedTakeExportWorkerJob` + TAKE_EXPORT completion |
| `src/lib/takes/take-export-service.ts` | `PREPARED_CODE` + artifactId on status |
| `src/app/api/takes/export/route.ts` | GET `?jobId=` status; POST note for PREPARED_CODE |
| `src/components/takes/take-download-menu.tsx` | Poll job → reuse `/api/mix/artifacts/[id]/download` |
| `src/lib/takes/p4-take-export-worker.test.ts` | **NEW** T01–T20 contracts |
| `src/lib/takes/p4-foundation.test.ts` | Align PREPARED_CODE / Phase 2 note |
| `scripts/e3-render-worker-once.ts` | Comment: TAKE_EXPORT supported |

**Not touched:** recording-eligibility WIP · SA-07 · living SSOT · migrations · Contabo.

---

## TAKE_EXPORT Source Resolution

- New: `resolveAuthorizedTakeExportSourcesForJob`
- Loads job by id · requires `kind=TAKE_EXPORT` · `take_id` · `mix_session_id=null`
- Loads take · `assertRenderTakeEligibleAtBake` (owner / READY / key binding)
- Signs take-audio URL · **no beat**
- MIX resolver still rejects TAKE_EXPORT (must use take-only function)

---

## Worker Dispatcher

- `runRealRenderWorkerJob`: if `kind===TAKE_EXPORT` → take-only runner; else existing MIX branches unchanged
- Claim: TAKE_EXPORT → take-export resolve; MIX → existing resolve

---

## Tier Dispatch

| Tier | Helper |
|------|--------|
| BASIC_MP3 | `encodeBasicMp3FromBake` |
| MP3_192 | **`encodeMp3192FromBake`** |
| HQ_MP3 | `encodeHqMp3FromBake` |
| WAV | `encodeWavFromBake` |

PCM via `decodeRenderSourceToStereoPcm` → `decodedPcmToBakeInput` · **never** `bakeServerBasicV1` / `bakeServerProV1`.

---

## Artifact Completion

- `completeRealArtifactAfterEncode({ artifactMode: "TAKE_EXPORT", takeId })`
- Validates `expectedTakeExportArtifactObjectKey`
- Inserts `take_id` · `mix_session_id=null`
- Upload failure → remove object + FAIL job (existing pattern)
- MIX award hook only when `mix_session_id` present

---

## UI Completion

```text
POST /api/takes/export
  → if SUCCEEDED+artifactId → GET /api/mix/artifacts/{id}/download
  → else poll GET /api/takes/export?jobId=
  → if still QUEUED (Contabo STOPPED) → PREPARED_CODE infra note
```

No new download endpoint. P4.4/P4.5 RAW path unchanged.

---

## Security

| Control | Status |
|---------|--------|
| Client object_key / tier / bitrate | Rejected / server-derived |
| Claim Bearer secret | Unchanged |
| TAKE_EXPORT AuthZ | `canExportOwnTake` at enqueue |
| service_role | Server/worker only |
| Fake-complete | MIX only |

---

## Tests

| Suite | Result |
|-------|--------|
| `p4-take-export-worker.test.ts` (24) | **PASS** |
| `p4-foundation.test.ts` (23) | **PASS** |
| `wave4-unit.test.ts` (14) | **PASS** |
| `e3-1-foundation` · `e3-5-render-jobs` · `e3-6-e` · `e3-7-f` | **PASS** |

T01–T20 covered via pure AuthZ + source contracts.

---

## MIX Regression

MIX Basic/HQ/WAV paths still call beat+take bake. Separate take-export runner. E3 unit suites PASS.

---

## TypeScript

`tsc --noEmit` → **PASS**

---

## git diff --check

**PASS** on Phase 1 files.

---

## DB

**NONE** — no migration (schema already XOR-capable).

---

## Storage

**NONE** — no production mutation; bucket reuse only in code.

---

## Contabo

**NOT STARTED** — Phase 2 Owner GO required.

---

## Production

**No enqueue · no deploy · baseline remains `836679a`.**

---

## WIP

| Item | Touched? |
|------|----------|
| `recording-eligibility-service.ts` `context?` | **NO** |
| `p4-live-verify.test.ts` | **NO** |
| SA-07 / storage WIP | **NO** |

---

## Known Limitations

1. Live FFmpeg/Contabo still STOPPED — jobs enqueue as QUEUED until Phase 2.
2. UI short-poll then shows PREPARED_CODE note when worker absent (expected).
3. Creator-progress MIX award skipped for TAKE_EXPORT (no mix_session).
4. Living SSOT tip not updated (docs GO separate).

---

## Final Status

```text
P4.6 PHASE 1 — GREEN / READY FOR INFRA GO
```

**STOP** — waiting for OWNER DECISION on Phase 2 (Contabo enablement + live verify).
No commit · no push · no deploy · no Contabo start.
