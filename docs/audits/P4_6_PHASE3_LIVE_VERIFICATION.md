# P4.6 PHASE 3 — CONTROLLED LIVE VERIFICATION

**Date:** 2026-10-07
**Owner GO:** P4.6 PHASE 3 — CONTROLLED LIVE VERIFICATION
**Final verdict:** **P4.6 PHASE 3 — GREEN / LIVE VERIFIED**
**Recommendation:** **P4.6 — READY TO CLOSE**

---

## 1. Scope

Controlled E2E of existing TAKE_EXPORT path on Contabo E3 worker:

```text
READY Take → TAKE_EXPORT (MP3_192) → claim → take-audio only → FFmpeg/libmp3lame
  → audio-artifacts → audio_artifacts → signed download
```

No second worker, queue, FFmpeg stack, bucket, Vercel deploy, commit, or living-SSOT tip change.

---

## 2. Owner GO

Accepted Phase 1 (code) + Phase 2 (infra). Phase 3 = live verify only. Absolute stop after evidence.

---

## 3. Baseline

| Field | Value |
|-------|--------|
| Production URL | https://www.bitrymdym.pl |
| Production SHA | `836679a` (`836679adc146de13c4833763fe2dec4769b64265`) — **unchanged** |
| Production deployment | `dpl_5J2cRHA2XRg7SKCZuyFvVZhBpJpT` · Ready — **unchanged** |
| Contabo | `161.97.72.197` · FFmpeg 6.1.1 · libmp3lame PRESENT |
| Phase 1 | GREEN (local accepted delta) |
| Phase 2 | GREEN (systemd oneshot + env) |

### Pre-enqueue baseline (after old-job cancel)

| Metric | Count |
|--------|-------|
| render_jobs | 2 |
| TAKE_EXPORT | 1 (CANCELLED legacy) |
| QUEUED TAKE_EXPORT | 0 |
| audio_artifacts | 0 |

---

## 4. Existing queued job inventory

| Field | Value |
|-------|--------|
| job_id | `7ceeb1a0-0c62-4b3e-be5a-f6379ac956e9` |
| take_id | `1548685f-6e04-4b00-9597-c2d247669adc` |
| owner_id | `fdf04726-e971-42a7-9d46-8b9bdd099c23` |
| requested_tier | `MP3_192` |
| status (pre) | `QUEUED` |
| created_at | `2026-10-05 21:28:37.275834+00` |
| updated_at | `2026-10-05 21:28:37.275834+00` |
| idempotency_key | `prod-verify-export-1791235715265` |
| take status | **EXPIRED** (would fail source resolve if claimed) |

---

## 5. How queued job was protected

**Mechanism used:** existing lifecycle `cancelRenderJobFor` → status `CANCELLED` (CAS on QUEUED/RUNNING; owner-scoped).

| Step | Result |
|------|--------|
| Cancel | `status=CANCELLED` · `errorCode=CANCELLED` |
| Ad-hoc SQL status edit | **NOT USED** |
| Worker start | Only with **new** job id; legacy id hard-refused in start script |
| Post-run legacy status | Still `CANCELLED` |

---

## 6. Worker SHA

| Field | Value |
|-------|--------|
| WORKER_TARGET_SHA | `836679a+phase1@18E87A885F0D` |
| BASE | `836679adc146de13c4833763fe2dec4769b64265` |
| PHASE1 | accepted-uncommitted-delta (Phase 1 report files only) |
| Contabo `.git` | **ABSENT** (deploy tree + `DEPLOYED_COMMIT` / `WORKER_TARGET_SHA` markers) |
| Sync method | Clean worktree @ `836679a` + overlay Phase 1 files → tar → Contabo `/opt/bitrymdym-e3-worker` `src/` + `scripts/` |
| Prior Contabo tip | `92496d4` (backed up under `_backup_*`) |

Phase 1 files synced:
`render-source-resolution.ts`, `render-job-service.ts`, `render-worker-pipeline.ts`, `take-export-service.ts`, `takes/export/route.ts`, `take-download-menu.tsx`, `e3-render-worker-once.ts`, related tests.

**Not synced:** unrelated dirty WIP (`context?`, SA-07, etc.).

---

## 7. Contabo runtime

| Check | Result |
|-------|--------|
| Unit | `bitrymdym-e3-worker.service` oneshot · requires `E3_RENDER_JOB_ID` |
| During run | Executed `npm run e3:worker:once -- 725cb062-…` |
| After run | **inactive** · **disabled** · `NO_WORKER_PROCESS` |
| FFmpeg | 6.1.1 host binary |
| Secret | PRESENT (ENV) · value REDACTED |

---

## 8. Selected Take

| Field | Value |
|-------|--------|
| take_id | `a9542a12-174d-43d7-805f-61f3d47e56ce` |
| owner_id | `fdf04726-e971-42a7-9d46-8b9bdd099c23` |
| status | **READY** (unchanged after test) |
| storage | `take-audio` · `…/takes/a9542a12-…/mic.bin` · object **exists** |
| duration | ~11s |
| premium | GOLD (active) · EXPORT_MP3_192 allowed |
| New take created? | **NO** |

---

## 9. Enqueue evidence

Via existing `createTakeExportJobFor` (same service as `POST /api/takes/export`; Phase 1 local code against production DB — **no Vercel deploy**).

| Field | Value |
|-------|--------|
| job_id | `725cb062-0d38-4105-9b0e-15f251bb3569` |
| kind | `TAKE_EXPORT` |
| take_id | `a9542a12-174d-43d7-805f-61f3d47e56ce` |
| mix_session_id | `NULL` |
| requested_tier | `MP3_192` |
| status | `QUEUED` → later `SUCCEEDED` |
| idempotencyKey | `take-export:a9542a12-…:MP3_192:phase3-1791404485865` |
| workerInfraStatus | **`PREPARED_CODE`** (not `BLOCKED_INFRA`) |

Client payload surface: `takeId` + `quality` + `idempotencyKey` only (no object_key / bucket / bitrate).

---

## 10. Claim evidence

| Field | Evidence |
|-------|----------|
| Path | `claimRenderJobAsWorker` inside `runRealRenderWorkerJob` |
| Timeline | QUEUED → RUNNING (`started_at=2026-10-07 20:21:54+00`) → SUCCEEDED (`finished_at=20:21:57+00`) |
| attempt | 1 |
| Legacy job claimed? | **NO** |

Journal shows worker invoked with **only** the controlled job id.

---

## 11. Source resolution evidence

| Check | Result |
|-------|--------|
| TAKE_EXPORT source | **take-audio** (canonical take object key) |
| beat source | **NONE** |
| MIX bake | **NONE** |
| mix_session_id on job | **NULL** |
| Client object_key | **NOT USED** |

Contabo code path: `runClaimedTakeExportWorkerJob` + `resolveAuthorizedTakeExportSourcesForJob` (grep counts PRESENT after sync).

---

## 12. FFmpeg evidence

| Check | Result |
|-------|--------|
| FFmpeg invoked | **YES** (live encode; not capability-only) |
| Worker encoder field | `ffmpeg+libmp3lame` |
| Target | `MP3_192` |
| CPU time (unit) | ~8.27s |

---

## 13. MP3_192 bitrate evidence (ffprobe on real file)

Downloaded object to Contabo `/tmp` (deleted after probe):

| Metric | Value |
|--------|--------|
| codec_name | `mp3` |
| stream bit_rate | **192000** |
| format bit_rate | ~192494 |
| sample_rate | 44100 |
| channels | 2 |
| duration | ~10.84s |
| byteSize | 260850 |
| container TAG:encoder | `Lavf60.16.100` (muxer); encode path = libmp3lame per worker |

**requested_tier alone not used as proof** — ffprobe confirms ~192 kbps.

---

## 14. Artifact key

| | Value |
|--|--------|
| expected | `user/{ownerId}/take-export/{takeId}/jobs/{jobId}/MP3_192.mp3` |
| actual | `user/fdf04726-e971-42a7-9d46-8b9bdd099c23/take-export/a9542a12-174d-43d7-805f-61f3d47e56ce/jobs/725cb062-0d38-4105-9b0e-15f251bb3569/MP3_192.mp3` |
| Match | **IDENTICAL** |

---

## 15. audio_artifacts DB evidence

| Field | Value |
|-------|--------|
| artifact_id | `e2ea1fd1-2134-42ad-b9e2-5193e2f69bf2` |
| take_id | `a9542a12-174d-43d7-805f-61f3d47e56ce` |
| mix_session_id | **NULL** |
| render_job_id | `725cb062-0d38-4105-9b0e-15f251bb3569` |
| quality_tier | `MP3_192` |
| status | `READY` |
| storage_bucket | `audio-artifacts` |
| object_key | (matches §14) |
| byte_size | 260850 |
| duration_ms | 10841 |
| bitrate_kbps | 192 |
| format | `audio/mpeg` |

---

## 16. Storage evidence

| Check | Result |
|-------|--------|
| Object in `audio-artifacts` | **EXISTS** (`storage_obj=1`) |
| Extra objects created by this GO | None observed beyond this key |
| Bucket / policies mutated | **NO** |

---

## 17. Signed download evidence

Via existing `createOwnArtifactDownloadSignedUrlFor` (same AuthZ as `GET /api/mix/artifacts/[id]/download`):

| Check | Result |
|-------|--------|
| Owner download | **SIGNED DOWNLOAD = PASS** · HTTP **200** on signed HEAD |
| Signed URL printed | **NO** (tokenized URL redacted) |

---

## 18. Security evidence

| Check | Result |
|-------|--------|
| Owner download | **allowed** |
| Non-owner download | **DENIED** (`Not artifact owner.`) |
| Extra account created | **NO** (used existing other profile) |

---

## 19. MIX regression

| Check | Result |
|-------|--------|
| TAKE_EXPORT `mix_session_id` | NULL |
| Beat consumed | NONE |
| MIX artifact created | NO (only take-export artifact) |
| Existing MIX / non-TAKE_EXPORT jobs updated in window | **0** |
| Legacy CANCELLED job resurrected | **NO** |

---

## 20. Idempotency

Replay same `idempotencyKey` via `createTakeExportJobFor`:

| Result | Same `jobId` `725cb062-…` · status `SUCCEEDED` · **no second render / no second artifact** |

---

## 21. Final job lifecycle

```text
QUEUED → RUNNING → SUCCEEDED
```

No FAILED path; no automatic retries; no second render.

---

## 22. Worker stop

| Check | Result |
|-------|--------|
| systemd | **inactive** · **disabled** |
| process | **NO_WORKER_PROCESS** |
| Left running | **NO** |

---

## 23. Production safety verification

| Check | Result |
|-------|--------|
| Production SHA | `836679a` **PASS** |
| Production deployment | `dpl_5J2cRHA2XRg7SKCZuyFvVZhBpJpT` Ready **PASS** |
| Vercel deploy this GO | **NONE** |
| Selected Take | READY · `updated_at` still `2026-10-06` **unchanged** |
| Beat catalog | not mutated |
| Unrelated render_jobs | not mutated (MIX window count 0) |

---

## 24. DB/Storage mutation summary

| Mutation | Intentional? |
|----------|----------------|
| Legacy job → CANCELLED | YES (safety) |
| New TAKE_EXPORT job → SUCCEEDED | YES (controlled test) |
| New `audio_artifacts` row | YES (one) |
| New `audio-artifacts` object | YES (one, expected key) |
| Schema / migrations | **NONE** |
| Take / beat / MIX session rows | **NONE** |

---

## 25. Files changed

| Path | Notes |
|------|--------|
| Contabo `/opt/bitrymdym-e3-worker/src|scripts` | Synced to WORKER_TARGET |
| Contabo `DEPLOYED_COMMIT` / `WORKER_TARGET_SHA` | Markers |
| Contabo `_backup_*` | Pre-sync backup |
| `docs/audits/P4_6_PHASE3_LIVE_VERIFICATION.md` | **THIS REPORT** |
| `scripts/_p46_phase3_ops.ts` | Local ops helper (cancel/enqueue/signed) — **not for commit unless Owner asks** |

No living SSOT tip edits. No WIP `context?` / SA-07 / P6.8 touches.

---

## 26. Git status

| Item | Value |
|------|--------|
| Commit / push | **NOT DONE** |
| Local HEAD | `836679a` |
| Phase 1 delta | Still local WIP (accepted, uncommitted) |
| Contabo git | N/A (no `.git`) |

---

## 27. Known limitations

1. Phase 1 application code still **not** on Vercel — enqueue for this test used Phase 1 service against production DB; production HTTP stamp may still differ until deploy GO.
2. Contabo has **no git repo** — identity via `WORKER_TARGET_SHA` marker, not `git rev-parse`.
3. Phase 1 remains **uncommitted** locally (Owner ban across Phase 1–3).
4. One intentional CANCELLED historical job remains in DB (not deleted).
5. One controlled LIVE artifact remains in Storage/DB (Owner may later decide retention/cleanup — **not** done here).

---

## 28. Final verdict

### Critical checklist

| Criterion | Status |
|-----------|--------|
| existing queued job safely handled | **PASS** (CANCELLED via lifecycle) |
| exact Phase 1 worker code synced | **PASS** (`836679a+phase1@18E87A885F0D`) |
| selected existing READY Take | **PASS** |
| exactly one controlled TAKE_EXPORT | **PASS** |
| tier = MP3_192 | **PASS** |
| claim = PASS | **PASS** |
| source = take-audio | **PASS** |
| beat source = NONE | **PASS** |
| MIX bake = NONE | **PASS** |
| FFmpeg actually executed | **PASS** |
| libmp3lame used | **PASS** |
| actual artifact ≈ 192 kbps | **PASS** (ffprobe 192000) |
| expected key = actual key | **PASS** |
| audio_artifacts.take_id correct | **PASS** |
| audio_artifacts.mix_session_id NULL | **PASS** |
| artifact exists in audio-artifacts | **PASS** |
| signed download PASS | **PASS** |
| security PASS | **PASS** (owner allow / non-owner deny) |
| MIX regression PASS | **PASS** |
| no unrelated mutation | **PASS** |
| worker stopped | **PASS** |
| production unchanged | **PASS** |

```text
P4.6 PHASE 3 — GREEN / LIVE VERIFIED
P4.6 — READY TO CLOSE
```

**STOP.** Awaiting Owner review of evidence. No commit · no push · no deploy · no SSOT tip close · no next EPIC.
