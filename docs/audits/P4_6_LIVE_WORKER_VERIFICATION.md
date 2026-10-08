# P4.6 LIVE WORKER VERIFICATION

**Date:** 2026-10-07
**Owner GO:** P4.6 LIVE WORKER VERIFICATION ONLY
**Mode:** READ-ONLY recon → Contabo probe → STOP (no enqueue / no code / no start)
**Final:** **P4.6 LIVE WORKER — INFRASTRUCTURE BLOCK**

---

## Baseline

| Field | Value |
|-------|--------|
| Production URL | https://www.bitrymdym.pl |
| Production SHA | `836679a` (`836679adc146de13c4833763fe2dec4769b64265`) |
| Deployment | `dpl_5J2cRHA2XRg7SKCZuyFvVZhBpJpT` |
| Local HEAD | `836679a` |
| P4.6 code | shipped @ `bface6c` ⊂ `836679a` |
| Worker bootstrap (historical) | `92496d4` |
| Verification timestamp | 2026-10-07T21:24+02:00 |

P4.1 LIVE VERIFIED GREEN · P4.2–P4.5 SHIPPED GREEN · P4.6 CODE SHIPPED / live incomplete.

---

## Worker

| Field | Evidence |
|-------|----------|
| Provider | Contabo VPS |
| Host | `ubuntu@161.97.72.197` · hostname `vmi3622761` |
| Power state | **VM UP** (`uptime` ≈ 7 days) |
| SSH | Key `~/.ssh/bitrymdym-e3-contabo` · BatchMode OK |
| Worker process | **STOPPED** — `NO_WORKER_PROCESS` / `NO_RELATED_PIDS` |
| systemd unit | **ABSENT** — `inactive` / `NO_SYSTEMD_UNIT_FILES` matching bitrymdym/e3/render |
| Worker version | N/A (no running unit) |
| Health endpoint | None (worker = outbound claim client, no public inbound API) |
| FFmpeg | **PRESENT** — `ffmpeg 6.1.1-3ubuntu5` · `libmp3lame` enabled |
| Documented start procedure for P4.6 TAKE_EXPORT | **NOT FOUND** (SSOT: STOPPED/DISABLED after controlled E3 renders; living tip forbids Contabo without Owner) |

**Worker class:** **STOPPED / BLOCKED** (host powered; encode process disabled)

---

## Preflight

| Check | Result |
|-------|--------|
| production baseline = 836679a | **PASS** |
| existing P4.6 enqueue code present | **PASS** (`take-export-service`, `/api/takes/export`) |
| EXPORT_MP3_192 definition present | **PASS** (capability + `encodeMp3192FromBake`) |
| worker identity known | **PASS** (Contabo `161.97.72.197`) |
| worker process running | **FAIL** — STOPPED |
| documented safe start for P4.6 TAKE_EXPORT | **FAIL** — none |
| E3 worker pipeline accepts `kind=TAKE_EXPORT` | **FAIL** — hard reject |
| worker dispatcher accepts `MP3_192` | **FAIL** — unsupported tier |
| queue / claim API auth boundary | **PASS** — unauth claim → **401** |
| FFmpeg available on host | **PASS** |
| safe designated test Take | **NOT USED** — E2E aborted before target selection |
| no cleanup / migration / incident | **PASS** (none initiated) |

**Critical prerequisites:** **FAIL** → **STOP** (Owner GO §6 / §16).

---

## Contract reconstruction (P4.6 live path)

### Enqueue (shipped)

```text
POST /api/takes/export
  { takeId, quality: MP3_128|MP3_192|MP3_320|WAV, idempotencyKey }
  → createTakeExportJob → render_jobs kind=TAKE_EXPORT
  → response always stamps workerInfraStatus: "BLOCKED_INFRA"
```

Evidence: `src/lib/takes/take-export-service.ts` `mapTakeExportJob` hardcodes `BLOCKED_INFRA` (ops posture, not live health probe).

### Worker entry (E3)

```text
scripts/e3-render-worker-once.ts
  → runRealRenderWorkerJob(jobId)
  → claimRenderJobAsWorker
  → resolveAuthorizedRenderSourcesForJob
  → bake + FFmpeg encode + upload audio-artifacts
```

Supports tiers in dispatcher: **BASIC_MP3 · HQ_MP3 · WAV** only.

### TAKE_EXPORT / MP3_192 wiring — **GAP**

| Layer | Behavior |
|-------|----------|
| `render-source-resolution.ts` | `if (kind === "TAKE_EXPORT")` → throws `RenderJobDomainError` **INVALID** (“worker infra BLOCKED until Contabo GO”) |
| `render-worker-pipeline.ts` `runRealRenderWorkerJob` | No `MP3_192` branch → **TIER_UNSUPPORTED** |
| `mp3-encode.ts` `encodeMp3192FromBake` | **Exists** but **not called** by worker dispatcher |
| Claim API | MIX worker secret path; no TAKE_EXPORT-specific entry |

**Conclusion:** Live EXPORT_MP3_192 E2E **cannot** complete on current production code without **code changes**. Per Owner GO: **do not fix** → **STOP**.

---

## Test Target

```text
TEST TARGET UNAVAILABLE / NOT SELECTED
```

Reason: Preflight failed on worker capability + TAKE_EXPORT pipeline reject.
Per §8: do **not** create production users/beats/takes/fixtures.
No controlled enqueue executed (would create orphan QUEUED/FAILED jobs without completable path).

---

## Execution Timeline

| Step | Status | Class |
|------|--------|-------|
| Read SSOT / P4.6 / E3 worker docs | Done | — |
| Contabo SSH power/process probe | Done | Worker STOPPED |
| FFmpeg presence | Done | PASS |
| Unauth claim probe | Done | PASS (401) |
| Documented worker start | Missing | EXPECTED BLOCK |
| Enqueue TAKE_EXPORT | **NOT RUN** | STOP |
| Worker pickup | **NOT RUN** | INFRASTRUCTURE BLOCK |
| FFmpeg encode MP3_192 | **NOT RUN** | INFRASTRUCTURE BLOCK (+ code gap) |
| Artifact / Storage | **NOT RUN** | — |

---

## TAKE_EXPORT

| Item | Result |
|------|--------|
| Enqueue API code present | PASS (shipped) |
| Live enqueue this GO | **NOT EXECUTED** |
| Classification | **INFRASTRUCTURE BLOCK** (plus code wiring gap) |

---

## Worker Pickup

| Item | Result |
|------|--------|
| Process running | **FAIL** |
| systemd start procedure | **ABSENT** |
| Classification | **INFRASTRUCTURE BLOCK** |

Starting Contabo encode process was **not** performed: no documented P4.6 start procedure; living SSOT marks worker STOPPED/DISABLED; completing TAKE_EXPORT would still require code not in baseline.

---

## FFmpeg

| Item | Result |
|------|--------|
| Host binary | PASS (`6.1.1` + libmp3lame) |
| Live encode this GO | **NOT EXECUTED** |
| Classification | Host OK · job path **BLOCKED** |

---

## EXPORT_MP3_192

| Item | Result |
|------|--------|
| Capability / encode helper in repo | PASS |
| Worker dispatcher path | **FAIL** (unsupported) |
| Live artifact | **NOT CREATED** |
| Classification | **INFRASTRUCTURE BLOCK** / code gap (not live REGRESSION of P4.1–P4.5) |

---

## Storage

| Item | Result |
|------|--------|
| New objects this GO | **NONE** |
| Bucket/policy changes | **NONE** |

---

## Artifact Integrity

| Item | Result |
|------|--------|
| Output MP3 / bitrate / duration | **N/A** — no artifact |

---

## Security

| Check | Result |
|-------|--------|
| Unauth `POST /api/mix/worker/claim` | **401** `Worker authorization required.` |
| No secrets logged | PASS |
| No service_role to client | PASS |
| No privilege escalation this GO | PASS |
| Client tier spoof not exercised (no enqueue) | N/A |

Classification: **PASS** (boundary probe only)

---

## Mutations

| Plane | Result |
|-------|--------|
| DB | **NONE** |
| Storage | **NONE** |
| Code | **NONE** |
| Deploy | **NONE** |
| Contabo process start | **NONE** |
| WIP | **UNTOUCHED** |

---

## Failure / retry semantics (code/docs only)

- Enqueue stamps `BLOCKED_INFRA` and notes worker STOPPED (API contract).
- Source resolution fails TAKE_EXPORT with **INVALID** if a worker ever claims such a job.
- Dispatcher fails unknown tiers with **TIER_UNSUPPORTED**.
- No artificial failed job created this GO.

---

## Hard STOP rationale (Owner §16)

1. Worker process STOPPED; no documented P4.6 start procedure.
2. Live completion requires **code changes** (TAKE_EXPORT source path + MP3_192 dispatcher wiring).
3. No safe designated test target used; creating fixtures forbidden.
4. Did **not** self-repair.

**This is not a P4.1–P4.5 regression.** It is expected incomplete live ops + missing worker wiring for TAKE_EXPORT relative to freeze AC-09 live completion.

---

## Minimal Owner decisions required (options only — not executed)

A. Accept **INFRASTRUCTURE BLOCK** (current truth).
B. Separate **Implementation GO**: wire TAKE_EXPORT + MP3_192 into EXTERNAL worker pipeline (minimal change; reuse `encodeMp3192FromBake` + take-only source resolution).
C. Separate **Ops GO**: document + enable Contabo worker unit **after** B.
D. Controlled live verify GO with designated existing Take (no new users/beats).

Do **not** treat Contabo VM power-on as “worker RUNNING”.

---

## Result

```text
P4.6 LIVE WORKER — INFRASTRUCTURE BLOCK

Enqueue:        NOT RUN (preflight FAIL)
Worker pickup:  FAIL (process STOPPED)
FFmpeg live:    NOT RUN (host binary OK)
EXPORT_MP3_192: NOT RUN (dispatcher unwired)
Artifact:       NONE
Storage write:  NONE
Integrity:      N/A
Security:       PASS (claim 401)
DB mutation:    NONE
Storage mutation: NONE
Code changes:   NONE
Deployment:     NONE
```

**Evidence artifact:** this file only.
**STOP — waiting for OWNER DECISION.**
