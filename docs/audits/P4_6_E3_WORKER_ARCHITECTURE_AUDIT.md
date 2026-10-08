# P4.6 / E3 WORKER ARCHITECTURE AUDIT

**Type:** READ-ONLY architecture audit
**Date:** 2026-10-07
**Owner GO:** P4.6 / E3 Worker Architecture Audit — NO IMPLEMENTATION
**Prior live verify:** `docs/audits/P4_6_LIVE_WORKER_VERIFICATION.md`
**Final decision:** **D — P4.6 CODE + INFRASTRUCTURE REQUIRED**

---

## 1. Executive Summary

P4.6 **enqueue / schema / capability / UI / encode helper / artifact key builder** are shipped in `bface6c ⊂ 836679a`. Live completion is blocked for **two independent reasons**:

1. **Code gap:** E3 EXTERNAL worker pipeline is **MIX-only**. It **rejects** `kind=TAKE_EXPORT`, does **not** dispatch `MP3_192`, does **not** use `buildTakeExportArtifactObjectKey`, and does **not** insert `audio_artifacts.take_id`. Take-only render is an intentional stub throw, not a finished worker branch.
2. **Infrastructure gap:** Contabo VM (`161.97.72.197` / `vmi3622761`) is powered, FFmpeg is installed, but the encode **process is intentionally STOPPED/DISABLED** (no systemd unit, no always-on daemon; historical runner = one-shot `e3:worker:once`).

**Architecture contract is clear** (P4 Design Freeze + E3 OAD-02): reuse `render_jobs` + EXTERNAL worker + FFmpeg; do **not** invent a second worker. **No Owner product-architecture ambiguity** on WHAT to build — only Implementation + Ops GOs remain.

Starting Contabo alone **cannot** complete P4.6. Shipping Contabo without code wiring would still fail claim/source resolution.

---

## 2. Baseline

| Field | Value |
|-------|--------|
| Production | https://www.bitrymdym.pl |
| SHA | `836679a` |
| Deployment | `dpl_5J2cRHA2XRg7SKCZuyFvVZhBpJpT` |
| P4 CORE | `bface6c` |
| P4.1 | LIVE VERIFIED GREEN |
| P4.2–P4.5 | SHIPPED GREEN |
| P4.6 | CODE SHIPPED · LIVE BLOCKED |
| Contabo | VM UP · worker process STOPPED |
| Audit mode | READ-ONLY · no enqueue · no start · no mutation |

---

## 3. P4.6 Runtime Path

Traced from production code (no assumptions):

```text
UI TakeDownloadMenu.onExport
  src/components/takes/take-download-menu.tsx
  POST /api/takes/export
    { takeId, quality, idempotencyKey: "take-export:{takeId}:{quality}" }
        ↓
  src/app/api/takes/export/route.ts
        ↓
  createTakeExportJob → createTakeExportJobFor
    src/lib/takes/take-export-service.ts
        ↓ AuthZ
  requireUser / AuthContext
  resolveProductEntitlementForAuthContext + canExportOwnTake(quality)
  resolveAudioEntitlementForAuthContext + assertAudioCapability(tier)
  assertOwnReadyTakeAccess(purpose: "export")
  daily/concurrent/quota caps (render_job-core)
        ↓ Idempotency
  render_jobs by (owner_id, idempotency_key)
  OR reuse audio_artifacts READY (take_id + quality_tier) → prior SUCCEEDED job
        ↓ Enqueue
  INSERT render_jobs:
    kind = 'TAKE_EXPORT'
    take_id = <take>
    mix_session_id = NULL
    requested_tier = BASIC_MP3 | MP3_192 | HQ_MP3 | WAV
    status = QUEUED
    entitlement_snapshot = frozen
        ↓ Response
  workerInfraStatus = "BLOCKED_INFRA"  ← HARDCODED in mapTakeExportJob
  UI shows infra note; does NOT poll artifact / signed download
        ↓ (intended, NOT implemented)
  EXTERNAL worker claim
  POST /api/mix/worker/claim  Bearer E3_RENDER_WORKER_SECRET { jobId }
        ↓
  claimRenderJobAsWorker
    src/lib/audio/render-job-service.ts
        ↓
  resolveAuthorizedRenderSourcesForJob
    src/lib/audio/render-source-resolution.ts
        ★ if kind === TAKE_EXPORT → THROW INVALID (explicit block)
        ↓ (MIX only today)
  runRealRenderWorkerJob dispatcher
    BASIC_MP3 | HQ_MP3 | WAV only
    ★ MP3_192 → TIER_UNSUPPORTED
        ↓
  bake beat+take (MIX) → encode → buildAudioArtifactObjectKey (mix/...)
    ★ buildTakeExportArtifactObjectKey EXISTS but UNUSED
        ↓
  upload audio-artifacts → insert audio_artifacts → job SUCCEEDED
        ↓
  GET /api/mix/artifacts/[id]/download (generic owner artifact download)
    ★ Take UI not wired to poll/fetch artifact id after TAKE_EXPORT SUCCEEDED
```

**Break point:** first worker touch of a TAKE_EXPORT job fails in source resolution (before FFmpeg). Even if that throw were removed, dispatcher/keys/completion still assume MIX.

---

## 4. TAKE_EXPORT Contract

### Design freeze (canonical)

`docs/decisions/P4_RECORDING_IDENTITY_ELIGIBILITY_DOWNLOAD_DESIGN_FREEZE.md`

| Item | Frozen |
|------|--------|
| Job plane | Prefer `render_jobs.kind = TAKE_EXPORT` (not separate table) |
| XOR | TAKE_EXPORT ⇒ `take_id` NOT NULL, `mix_session_id` NULL |
| Source | Take MIC (`take-audio` …/mic.bin) — **take-only** render (≠ E3 mix bake) |
| Output bucket | `audio-artifacts` |
| Output key | `user/{ownerId}/take-export/{takeId}/jobs/{jobId}/{TIER}.{mp3\|wav}` |
| Qualities | MP3_128 / MP3_192 / MP3_320 / WAV via TAKE_EXPORT ladder |
| AuthZ | `canExportOwnTake` (stricter than MIX) + ownership + READY |
| Worker | EXTERNAL FFmpeg; not Vercel request path |
| Ops note | Contabo STOPPED ⇒ enablement GO required for live |

### Shipped enqueue payload (`render_jobs`)

| Column | Value |
|--------|--------|
| `kind` | `TAKE_EXPORT` |
| `take_id` | take UUID |
| `mix_session_id` | `null` |
| `requested_tier` | mapped from quality |
| `status` | `QUEUED` |
| `idempotency_key` | client-supplied string (UI: `take-export:{takeId}:{quality}`) |
| `entitlement_snapshot` | product + default mix params blob (reuse helper) |

Migration: `supabase/migrations/20261005230000_p4_recording_identity_download_foundation.sql`.

### Who should claim

Same EXTERNAL worker class as E3 MIX: `claimRenderJobAsWorker` + `runRealRenderWorkerJob` (freeze: reuse, extend by `kind`). **No separate TAKE_EXPORT claim API exists or is required by freeze.**

### Was P4.6 shipped ahead of worker?

**YES — evidence:**

1. `resolveAuthorizedRenderSourcesForJob` contains an explicit TAKE_EXPORT throw: *“worker infra BLOCKED until Contabo GO”*.
2. `mapTakeExportJob` always returns `workerInfraStatus: "BLOCKED_INFRA"`.
3. UI treats BLOCKED_INFRA as expected ops posture.
4. `encodeMp3192FromBake` + `buildTakeExportArtifactObjectKey` exist as **primitives**, not wired into the worker completion path.
5. P4 foundation test asserts BLOCKED_INFRA and “no ffmpeg in enqueue”, and marks worker infra blocked.

---

## 5. Existing Worker Job Types

| Job kind | Supported by worker today? | Handler | Input | Output |
|----------|----------------------------|---------|-------|--------|
| `MIX` + `BASIC_MP3` | **YES** | `runClaimedBasicMp3WorkerJob` | mix_session → take + beat | `user/.../mix/.../BASIC_MP3.mp3` |
| `MIX` + `HQ_MP3` | **YES** | `runClaimedPremiumWorkerJob` | mix_session + parameters.pro | `.../HQ_MP3.mp3` |
| `MIX` + `WAV` | **YES** | `runClaimedPremiumWorkerJob` | same | `.../WAV.wav` |
| `MIX` + `MP3_192` | **NO** (create path rejects) | — | — | MIX forbids MP3_192 |
| `TAKE_EXPORT` + any | **NO** | rejected in source resolution | take_id | intended take-export key |

**Lifecycle (MIX):** `QUEUED` → claim → `RUNNING` (+ timeout) → encode/QC/upload/DB → `SUCCEEDED` or `FAILED` / timeout. Fake-complete exists (secret-gated) ≠ Final Truth.

**Auth:** Bearer `E3_RENDER_WORKER_SECRET` (timing-safe). Unauth claim → **401** (verified prior).

**Adapter:** `createFakeRenderWorkerAdapter` — records `worker_ref` only; real progression is EXTERNAL claim/complete (not a queue broker).

---

## 6. Dispatcher

**File:** `src/lib/audio/render-worker-pipeline.ts`
**Entry:** `runRealRenderWorkerJob(jobId)`
**CLI:** `scripts/e3-render-worker-once.ts` / `npm run e3:worker:once -- <jobId>`

```text
claimRenderJobAsWorker(jobId)
  → if BASIC_MP3 → basic bake + encodeBasicMp3FromBake
  → if HQ_MP3 | WAV → pro bake + encodeHq / encodeWav
  → else FAIL TIER_UNSUPPORTED
```

**MP3_192:** falls to unsupported.
**TAKE_EXPORT:** fails earlier in `resolveAuthorizedRenderSourcesForJob` (called from claim).
**Take-only bake:** not present — MIX path always downloads **take + beat** and runs `bakeServerBasicV1` / `bakeServerProV1`.

---

## 7. MP3 Encoder / FFmpeg

| Primitive | Location | Status |
|-----------|----------|--------|
| Native FFmpeg wrapper | `src/lib/audio/native-ffmpeg.ts` | REUSE |
| Shared encode PCM→MP3 | `encodeMp3FromBakePcm` in `mp3-encode.ts` | REUSE |
| 128 kbps | `encodeBasicMp3FromBake` | Wired (MIX) |
| 320 kbps | `encodeHqMp3FromBake` | Wired (MIX) |
| **192 kbps** | `encodeMp3192FromBake` | **Exists · unwired** |
| Bitrate constant | `AUDIO_CODEC.MP3_192_BITRATE_KBPS = 192` | Present |
| Capability | `EXPORT_MP3_192` in `audio-render` + premium matrix | Present |
| QC | `qcMp3Bytes` via encode path | REUSE |
| WAV | `encodeWavFromBake` | Wired (MIX) |

**Conclusion:** Do **not** create a second encoding subsystem. Extend dispatcher + take-only source → call existing `encodeMp3192FromBake` / basic / hq / wav helpers with take-export object keys.

**Missing primitive (code):** take-only source resolution + take-only “bake/transcode” path (MIC → PCM → encode **without** beat mix). Exact algorithm not implemented; freeze requires take-only, not MIX bake.

---

## 8. E3 Architecture

| Question | Answer | Evidence |
|----------|--------|----------|
| A. Intended for TAKE_EXPORT from day 1 of E3? | **No** — E3 locked MIX + OAD-06 128/320/WAV | E3 Final Architecture Lock |
| B. Generic worker that can be extended? | **YES** | P4 freeze preferred `kind` on `render_jobs`; same claim API |
| C. Unrelated? | **No** | Shared jobs, artifacts, FFmpeg, Contabo |
| D. Obsolete? | **No** | Production MIX path + Contabo role CURRENT |
| E. Placeholder? | Worker class real; TAKE_EXPORT branch **placeholder/block** | Explicit throw + BLOCKED_INFRA |

| Concern | Mechanism |
|---------|-----------|
| Runtime | Node + `tsx` one-shot on EXTERNAL host |
| Lifecycle | Manual start/stop (ops); STOPPED after PE verify |
| Queue | DB `render_jobs.status=QUEUED` (no Redis) |
| Claim | HTTP claim + CAS `QUEUED→RUNNING` |
| Concurrency | Product caps on create; worker one-job-once script |
| Retry | `attempt` field / max attempts in domain (MIX) |
| Heartbeat | None dedicated — timeout from claim |
| Timeout | `AUDIO_RENDER_JOB_TIMEOUT_SECONDS` from claim |
| Idempotency | `idempotency_key` unique per owner; artifact reuse on enqueue |
| Secrets | `E3_RENDER_WORKER_SECRET` server-only; worker also needs Supabase service credentials on host |
| Health | No public health endpoint |
| Deploy | Repo has Oracle TF leftovers; Contabo = ops host + git bootstrap `92496d4`; **no systemd unit in repo** |

**Classification of E3 vs P4.6:** **B — extend existing EXTERNAL worker** for `TAKE_EXPORT` (not a new worker architecture).

---

## 9. Contabo Infrastructure

| Fact | Evidence |
|------|----------|
| Host | `ubuntu@161.97.72.197` · `vmi3622761` |
| Role | EXTERNAL COMPUTE (ephemeral encode) · ≠ Storage SSOT |
| VM power | UP (prior probe) |
| FFmpeg | 6.1.1 + libmp3lame |
| systemd unit | **None** in `/etc/systemd/system` for bitrymdym/e3 |
| Worker process | **None** |
| Repo deploy artifacts | `scripts/e3-render-worker-once.ts` · Oracle `infra/oracle/*` (**superseded**) · **no Contabo Dockerfile/systemd** |
| Why process absent | **Intentional STOPPED/DISABLED** after controlled E3 PE renders (SSOT / CHANGELOG / PE freeze rollback §15.2 “Stop EXTERNAL worker process(es)”) — not “VM broken” |

**Not:** missing FFmpeg. **Not:** unreachable host.
**Is:** ops posture + lack of checked-in always-on unit + P4.6 code unfinished.

---

## 10. Security

| Control | Status |
|---------|--------|
| Worker auth | Bearer secret · timingSafeEqual · 401/403 |
| Claim body | `{ jobId }` only · `rejectClientRenderSourceClaims` |
| Source keys | Server-resolved; client object_key rejected |
| Tier / bitrate | From DB `requested_tier` + capability at enqueue; not client encode params |
| Output key | Server-built; complete path rejects mismatched key |
| service_role | Admin client on server/worker host only · never to browser |
| TAKE_EXPORT AuthZ at enqueue | Owner + READY + `canExportOwnTake` + audio capability |
| MIX vs TAKE_EXPORT capability | Separated (`canExportOwnTake` stricter) |

No security regression found in this audit. Completing TAKE_EXPORT must keep take-only AuthZ and take-export key binding.

---

## 11. Storage

| Plane | Bucket | Path |
|-------|--------|------|
| Source (TAKE_EXPORT) | `take-audio` | existing take `object_key` (mic.bin) |
| Output (intended) | `audio-artifacts` | `user/{owner}/take-export/{takeId}/jobs/{jobId}/{TIER}.{ext}` |
| Output (MIX today) | `audio-artifacts` | `user/{owner}/mix/{mixSessionId}/jobs/{jobId}/{TIER}.{ext}` |

| Metadata | Contract |
|----------|----------|
| `audio_artifacts.take_id` | Schema supports XOR with `mix_session_id` (P4 migration) |
| Retention | Entitlement snapshot / tier retention seconds → `expires_at` |
| Download | Existing `createOwnArtifactDownloadSignedUrl*` by `artifactId` (MIX UI). Take export UI **does not** yet resolve artifactId → signed GET after SUCCEEDED |

---

## 12. Idempotency

| Scenario | Current behavior | Safety |
|----------|------------------|--------|
| Duplicate enqueue same idempotencyKey | Returns existing job | **SAFE** |
| Ready artifact same take+tier | Returns prior SUCCEEDED job | **SAFE** (enqueue) |
| Claim race | CAS on status | **SAFE** (MIX) |
| TAKE_EXPORT worker crash | N/A — never enters running success path | **PARTIAL** |
| Upload then DB fail (MIX) | Removes object / fails job | **SAFE** (MIX pattern to reuse) |
| Take UI after BLOCKED_INFRA | No second phase download | **PARTIAL** product |

**Overall for P4.6 live:** **PARTIAL** — enqueue idempotency good; worker/completion/idempotent take-export download **unimplemented**.

---

## 13. Missing Components

1. Take-only `resolveAuthorizedRenderSourcesForJob` branch (load take by `take_id`, no mix_session).
2. Take-only worker job runner (decode take → PCM → encode; **no beat mix**).
3. Dispatcher support for `MP3_192` (+ TAKE_EXPORT routing for 128/320/WAV).
4. Wire `buildTakeExportArtifactObjectKey` + `expectedTakeExportArtifactObjectKey`.
5. `completeRealArtifactAfterEncode` (or sibling) writing `take_id`, null `mix_session_id`, take-export key validation.
6. Dynamic `workerInfraStatus` (or remove hard BLOCKED when worker GO).
7. UI: poll job / resolve artifact / call existing artifact download API.
8. Ops: documented Contabo start/stop (systemd or supervised one-shot loop) + secrets on host.
9. Live verification harness for EXPORT_MP3_192.

**Exists already:** enqueue, schema, capability, encode192 helper, key builder, claim API, FFmpeg host, MIX completion pattern to copy.

---

## 14. Gap Classification

| Missing piece | Class | Evidence |
|---------------|-------|----------|
| TAKE_EXPORT source resolution | **B Code-only** | Explicit throw in `render-source-resolution.ts` |
| Dispatcher MP3_192 + take-only runner | **B Code-only** | `runRealRenderWorkerJob` branches |
| Artifact key/completion take_id | **B Code-only** | `buildTakeExportArtifactObjectKey` unused; complete uses mix key |
| UI post-SUCCEEDED download | **B Code-only** | `take-download-menu` stops at enqueue note |
| Contabo process STOPPED | **A Infrastructure-only** | SSOT STOPPED; no unit; PE rollback |
| Always-on/supervised runner docs | **A Infrastructure-only** | One-shot script only |
| Combined live GREEN | **C Code + infrastructure** | Both required |
| New DB migration | **Not required** (schema present) | P4 migration already additive |
| New Storage bucket/policy | **Not required** | Reuse `audio-artifacts` |
| New worker product architecture | **G Not needed** | Freeze: extend E3 |
| Owner ambiguity on MIX vs TAKE_EXPORT | **None** | Freeze closed |

---

## 15. Minimal Completion Plan

### PHASE 1 — Code (no Contabo required to unit-test)

| Item | Detail |
|------|--------|
| Files (expected) | `render-source-resolution.ts`, `render-worker-pipeline.ts`, possibly thin `take-export-worker.ts`, `take-export-service.ts` (infra status), `take-download-menu.tsx`, tests under `p4-foundation` / new unit |
| Changes | Take-only resolve · dispatch TAKE_EXPORT tiers incl. MP3_192 via `encodeMp3192FromBake` · take-export keys · artifact insert with `take_id` · UI poll/download · stop hardcoding BLOCKED when appropriate |
| Risks | Accidentally routing TAKE_EXPORT through MIX bake; breaking MIX claim; key mismatch; IDOR on artifact |
| Tests | Unit: kind branch, MP3_192 encode wiring, key expect, spoof denial, MIX regression |
| Verify | Vitest + tsc · **no** prod enqueue |

### PHASE 2 — Worker deployment (ops)

| Item | Detail |
|------|--------|
| Components | Contabo host · env secrets · FFmpeg already present · supervised run of `e3:worker:once` loop or equivalent |
| Changes | Documented start/stop · **no** app redeploy required if code already on `836679a`+fix SHA |
| Risks | Secret leak · concurrent claims · leaving worker always-on cost |
| Tests | Claim 401/403 · one MIX smoke optional (OUT OF NARROW if Owner forbids) · TAKE_EXPORT after Phase 1 |
| Verify | Process running · claim succeeds for TAKE_EXPORT |

### PHASE 3 — Live verification

| Item | Detail |
|------|--------|
| Method | One controlled EXPORT_MP3_192 on designated existing Take (Owner-approved target) |
| Evidence | Job timeline · FFmpeg · bitrate ~192 · artifact key · signed GET · no MIX pollution |
| Forbidden | New users/beats · mass jobs · cleanup without GO |

### PHASE 4 — Production gate

| Item | Detail |
|------|--------|
| Criteria | Enqueue · pickup · FFmpeg · MP3_192 · Storage · integrity · security · MIX regression · worker stop procedure |
| Docs | Evidence audit only · living SSOT tip only on Owner docs GO |
| Then | Optional return Contabo to STOPPED if ops policy requires |

**Do not implement in this audit GO.**

---

## 16. Risks

| Risk | Severity |
|------|----------|
| Implement take export as MIX bake (wrong product) | High |
| Deploy Contabo before code wiring | Wasted ops / FAILED jobs |
| Leave worker always-on without caps monitoring | Cost / abuse |
| Soften AuthZ while wiring | Security |
| Touch E3 MIX contracts “while here” | Scope creep |
| Treat Oracle TF as Contabo deploy | Wrong infra |

---

## 17. Out of Scope

- P6.8 · SA-07 · Studio bounce/render · MIX quality changes · Automation · Autotune · Mobile · Catalog
- New worker vendor / rewrite queue system
- Changing OAD-06 MIX codec set
- Artwork / Project tables
- Unrelated E3 debt (fake adapter productization, Oracle capacity history)

Recorded as **OUT OF SCOPE** if encountered during future GOs.

---

## 18. Final Decision

```text
D. P4.6 CODE + INFRASTRUCTURE REQUIRED
```

**Meaning:** Both the TAKE_EXPORT worker **code path** and Contabo **process enablement** are genuinely incomplete. Architecture **is** clear (extend E3 EXTERNAL worker; reuse FFmpeg/encode helpers/keys) — this is **not** option B ambiguity, and **not** option C (deploy-only).

**Not A** only because “READY FOR IMPLEMENTATION” understates that infra ops is also mandatory for live GREEN; the **plan above is ready** for a subsequent Owner Implementation GO.

**STOP — waiting for OWNER DECISION** (authorize Phase 1 code GO / Phase 2 ops GO / accept BLOCKED / other).

---

### Audit hygiene

| Item | Result |
|------|--------|
| Product code changes | **NONE** |
| DB / Storage / worker start | **NONE** |
| Commit / push / deploy | **NONE** |
| WIP | **UNTOUCHED** |
| Only new artifact | this file |
