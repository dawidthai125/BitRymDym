# E3 — EXTERNAL WORKER INFRASTRUCTURE (GO #2)

**Type:** Ops / readiness record  
**Date:** 2026-09-30  
**Owner GO:** #2 — EXTERNAL WORKER INFRASTRUCTURE  
**Application baseline (at GO #2 authorship):** `9026fa9`  
**Documentation tip (at authorship):** `65e791f` (+ this continuity update)

```text
GO #2 LIVING STATUS                  = CLOSED / SUPERSEDED
REASON                               = Oracle A1 capacity blocker was superseded by Contabo E3 worker infrastructure
CONTABO WORKER                       = PROVISIONED · STOPPED / DISABLED after controlled renders
WORKER BOOTSTRAP COMMIT              = 92496d4
```

> **History below is preserved as the GO #2 point-in-time record** (including original BLOCKED state and Oracle findings). Do not rewrite the historical body as if Oracle succeeded.

```text
GO #2 STATUS (historical at authorship) = BLOCKED (partial progress)
WORKER INFRASTRUCTURE (historical)      = NOT READY FOR PRODUCTION CLAIM
FFMPEG (agent/candidate machine)        = READY (verified)
FFMPEG (approved Production host)       = N/A — host not Owner-approved (at authorship)
E3_RENDER_WORKER_SECRET                 = CONFIGURED (Vercel Production project env)
SECRET LIVE ON CURRENT DEPLOYMENT       = PENDING REDEPLOY (GO #2 forbids Next.js app redeploy)
E3_MIX_ENABLED                          = UNSET
E3_RENDER_JOBS_ENABLED                  = UNSET
E3_PUBLIC_AUDIO                         = UNSET
PRODUCTION JOB CLAIMED                  = NO
PRODUCTION RENDER                       = NOT EXECUTED
ARTIFACTS CREATED                       = NONE
```

---

## 1. Baseline confirmation

| Item | Value |
|------|--------|
| HEAD / origin/main | `65e791f` (docs tip) |
| Production application | `9026fa9` |
| W6.2/W6.3 | CLOSED / PRODUCTION VERIFIED |
| E3 PE Design Freeze | COMPLETE |
| Design Freeze refs | [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md) |

---

## 2. Worker host — OWNER INFRA DECISION REQUIRED

Architecture SSOT (OAD-02 / OD-E36-04 = C):

- Worker class = **EXTERNAL** (not Vercel Route Handler encode)
- Encode stack = **native/system FFmpeg + libmp3lame**
- **Vendor / concrete Production host productization = Owner GO if needed** (Final Architecture Lock)

**No approved Production worker host name/vendor is recorded in canonical docs.**

Agent must **not** unilaterally choose Railway / Fly / EC2 / etc.

### Host requirements (spec only)

| Requirement | Spec |
|-------------|------|
| Runtime | Node.js compatible with project (verified agent: **v24.16.0**) + `tsx` / equivalent to run worker entry |
| FFmpeg | System `ffmpeg` + `ffprobe` on PATH (or `E3_FFMPEG_PATH` / `E3_FFPROBE_PATH`) with **libmp3lame** + **pcm_s16le** |
| Network | Outbound HTTPS to `https://www.bitrymdym.pl` (claim API) + Supabase Storage |
| Secrets | Secure env for `E3_RENDER_WORKER_SECRET` (+ app Supabase service credentials as required by pipeline) — never in git/frontend |
| Process | Manual start/stop · restartable · no public inbound worker API |
| Logs | Persistent enough for controlled verify · no secret/signed-URL dumps |
| Resources | CPU/RAM/disk adequate for ≤180s source encode (OAD-03) |

**Candidate (NOT approved):** Owner/agent Windows workstation used for GO #2 local FFmpeg smoke — **must not** be treated as Production worker host without Owner decision.

**FINDING F-W2-01:** Approved Production worker host = **MISSING** · Owner must name host / vendor before AC-W2-01 PASS.

---

## 3. FFmpeg verification (candidate machine)

Executed on agent environment (not Production host):

| Check | Result |
|-------|--------|
| `ffmpeg -version` | **9.0.2** full_build (gyan) |
| `libmp3lame` | PRESENT |
| `pcm_s16le` | PRESENT |
| Local smoke WAV 44.1 kHz / 16-bit / stereo | PASS |
| Local smoke MP3 128 kbps stereo via libmp3lame | PASS |

**AC-W2-03/04 on approved Production host:** **NOT MET** until host exists and same checks run there.

---

## 4. Worker script / lifecycle

| Item | Path / note |
|------|-------------|
| Entry | `scripts/e3-render-worker-once.ts` |
| Pipeline | `src/lib/audio/render-worker-pipeline.ts` (`runRealRenderWorkerJob`) |
| Claim API | `POST /api/mix/worker/claim` |
| Fake-complete | `POST /api/mix/worker/fake-complete` · secret-gated · **≠ Final Truth** |

### F-W2-02 — worker CLI `server-only` bootstrap — **CLOSED / PASS**

**Status:** CLOSED / PASS (Owner GO closeout · Owner Review ACCEPT)

**Root cause:** Package `server-only` throws under plain Node/`tsx` (`default` export). Next RSC uses `react-server` → empty. Vitest aliases to `src/test/server-only-stub.ts`. EXTERNAL CLI had no alias.

**Minimal fix:** CLI-only Node register stub — does **not** remove `import "server-only"` from app modules. Patch is process-local and loads only with explicit `--import`.

```text
Command:
  npx tsx --import ./scripts/register-server-only-stub.mjs scripts/e3-render-worker-once.ts
  # or: npm run e3:worker:once --

Files:
  scripts/register-server-only-stub.mjs  → Module._resolveFilename + ESM resolve
  scripts/server-only-empty.cjs          → module.exports = {}
  → maps specifier "server-only" → empty CJS stub (worker CLI process only)
```

| Result | Meaning |
|--------|---------|
| **PASS F-W2-02** | No `server-only` / Client Component module error; worker CLI loads pipeline import chain · `tsc --noEmit` PASS |
| **NOT VERIFIED** | Production credentials, jobId, Supabase, FFmpeg, host, secrets, flags — separate gates |

**Out of scope for F-W2-02:** hosting · Vercel · Production enablement · E3 flags · secrets · real render.

---

## 5. Secret

| Item | Status |
|------|--------|
| `E3_RENDER_WORKER_SECRET` in Vercel **Production** project env | **CONFIGURED** (Encrypted / sensitive) |
| Value printed in docs/chat | **NO** |
| Present in git | **NO** |
| Frontend / `NEXT_PUBLIC_*` | **NO** |
| Live on currently running Production deployment | **PENDING REDEPLOY** — GO #2 forbids Next.js Production redeploy; env binds on next deploy |

Feature flags remain **UNSET** (only worker secret added).

---

## 6. Authentication smoke (Production)

| Test | Result |
|------|--------|
| Claim without Authorization | **403** |
| Fake-complete without Authorization | **403** |
| Claim with wrong Bearer | **403** |
| Real Production job claimed | **NO** |
| Real render / artifact | **NO** |

Positive auth with valid secret against live deployment was **not** asserted (secret not yet in running build without redeploy; also avoids any job-path exercise).

---

## 7. Observability / security notes

| Topic | Note |
|-------|------|
| Pipeline logging | No `console.log` of secrets found in `render-worker-pipeline.ts` grep |
| Fake-complete | Remains secret-gated |
| Public worker API | None — worker is outbound claim client |
| Bucket | Unchanged private `audio-artifacts` |

---

## 8. Acceptance criteria rollup

| ID | Result |
|----|--------|
| AC-W2-01 Approved host identified | **FAIL** — Owner decision required |
| AC-W2-02 Node/runtime ready | **PARTIAL** — verified on candidate machine only |
| AC-W2-03 FFmpeg installed | **PARTIAL** — candidate machine PASS · Production host N/A |
| AC-W2-04 Encoders verified | **PARTIAL** — candidate machine PASS |
| AC-W2-05 Secret configured | **PASS** (project env) |
| AC-W2-06 Secret absent git/log/frontend | **PASS** |
| AC-W2-07 Claim connectivity | **PASS** (HTTPS reachability + 403 responses) |
| AC-W2-08 401/403 without auth | **PASS** (403) |
| AC-W2-09 Startup/shutdown | **PASS F-W2-02** — CLI stub (`--import ./scripts/register-server-only-stub.mjs`); Production host/env still **NOT VERIFIED** |
| AC-W2-10 Logging safe | **PASS** (no evidence of secret logging in pipeline) |
| AC-W2-11 No Production job claimed | **PASS** |
| AC-W2-12 No Production render | **PASS** |
| AC-W2-13 No Production artifact | **PASS** |
| AC-W2-14 Jobs flag UNSET | **PASS** |

---

## 9. Owner actions required before GO #2 can become READY

1. **Name approved EXTERNAL worker host** (vendor / machine / account).  
2. ~~Authorize minimal code fix~~ **DONE (Owner GO F-W2-02)** — CLI bootstrap stub. Remaining: EXTERNAL host provision + Production prerequisites.  
3. After host+bootstrap ready: run FFmpeg checks **on that host**.  
4. **Redeploy Production** (or accept next natural deploy) so `E3_RENDER_WORKER_SECRET` is live — still **without** enabling Mix/Jobs flags until GO #3.

---

```text
WORKER INFRASTRUCTURE = BLOCKED
NEXT SESSION ENTRY    = WORKER INFRASTRUCTURE BLOCKER REVIEW
```
