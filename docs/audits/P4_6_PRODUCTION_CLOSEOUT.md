# P4.6 TAKE_EXPORT — PRODUCTION CLOSEOUT

**Date:** 2026-10-08
**Status:** **CLOSED / PRODUCTION VERIFIED / LIVE E2E VERIFIED / GREEN**
**Type:** Evidence index for production release (docs plane)

---

## Production tip (canonical)

| Field | Value |
|-------|--------|
| Production SHA | `a72fed9e85db71acc900df6fe88b4e7b0faa4765` (**`a72fed9`**) |
| Deployment | `dpl_8PDyhXVZDMyBm8fgiWNgj9ZPwnJY` · **READY** |
| URL | https://www.bitrymdym.pl |
| Repository HEAD / origin/main | **`65ebc46`** (docs tip after closeout) |
| Chain | `836679a` → `0b0ca04` (docs) → `a72fed9` (Phase 1 code) → `65ebc46` (docs dual-plane closeout) |

**Dual-plane:** REPOSITORY TIP `65ebc46` ≠ PRODUCTION APP SHA `a72fed9` · **NO REDEPLOY REQUIRED**.

**Previous production tip (HISTORY):** `836679a` · `dpl_5J2cRHA2XRg7SKCZuyFvVZhBpJpT`

---

## Closure path

| Stage | Status | Notes |
|-------|--------|--------|
| Phase 1 CODE | DONE | TAKE_EXPORT worker pipeline · commit `a72fed9` |
| Phase 2 INFRA | DONE | Contabo oneshot · FFmpeg/libmp3lame |
| Phase 3 LIVE (pre-deploy Contabo) | DONE | Historical verify · production app then still `836679a` |
| Docs checkpoint | DONE | `0b0ca04` |
| Controlled push | DONE | `0b0ca04` + `a72fed9` → `origin/main` |
| Vercel production deploy | DONE | `dpl_8PDy…` · Git `main` @ `a72fed9` |
| Post-deploy verification | DONE | HTTP 200 · route live · SHA in build logs |
| Production LIVE E2E | DONE | MP3_192 · take-only · Contabo single-job |

---

## Production LIVE E2E (canonical)

| Field | Value |
|-------|--------|
| Take | `a9542a12-174d-43d7-805f-61f3d47e56ce` · READY · **no new Take** |
| Owner | user_number **1** · `fdf04726-e971-42a7-9d46-8b9bdd099c23` |
| Job | `a5b6e8e0-87e8-463a-bda6-c84bded52a22` |
| kind | `TAKE_EXPORT` |
| quality | `MP3_192` |
| mix_session_id | `NULL` |
| Lifecycle | `QUEUED` → `RUNNING` → **`SUCCEEDED`** |
| Artifact | `d7b05d44-e0c0-4589-b6a4-4ac0f402fb47` |
| Bucket | `audio-artifacts` |
| Object key | `user/{owner}/take-export/{takeId}/jobs/{jobId}/MP3_192.mp3` |
| Source | `take-audio` · Take mic.bin · **MIX used: NO** |
| Encoder | `ffmpeg+libmp3lame` |
| Bitrate | stream **192000** · format ~193222 |
| Duration / size | ~10.80 s · **260850** bytes |
| Owner download | **PASS** |
| Non-owner | **DENIED** |
| Worker host | Contabo `161.97.72.197` · single-job `e3:worker:once` |
| Worker after test | **STOPPED / DISABLED / NO_WORKER_PROCESS** |

**Fixture note (P3):** Prior Phase 3 READY MP3_192 artifact was expired (service_role) so product READY-reuse would not short-circuit enqueue — **not** a production incident.

**Test artifacts left in place:** job `a5b6e8e0-…` · artifact `d7b05d44-…` · original Take unchanged.

---

## Contabo (capability vs runtime)

| Plane | State |
|-------|--------|
| P4.6 TAKE_EXPORT capability | **PRODUCTION VERIFIED — GREEN** |
| Contabo permanent worker runtime | **STOPPED / DISABLED** (not always-on) |
| Live E2E method | Controlled single-job execution only |

---

## Evidence chain

1. [P4_6_E3_WORKER_ARCHITECTURE_AUDIT.md](./P4_6_E3_WORKER_ARCHITECTURE_AUDIT.md)
2. [P4_6_PHASE1_CODE_IMPLEMENTATION_REPORT.md](./P4_6_PHASE1_CODE_IMPLEMENTATION_REPORT.md)
3. [P4_6_PHASE2_WORKER_INFRASTRUCTURE_REPORT.md](./P4_6_PHASE2_WORKER_INFRASTRUCTURE_REPORT.md)
4. [P4_6_PHASE3_LIVE_VERIFICATION.md](./P4_6_PHASE3_LIVE_VERIFICATION.md)
5. This closeout (push · deploy · post-deploy · production LIVE E2E)

---

## Next gate

**P6.8 = NOT STARTED / OWNER DECISION**
Do not start Automation / Autotune / E3 Studio Render / Undo / Autosave / P7 / Contabo permanent enable without separate Owner GO.
