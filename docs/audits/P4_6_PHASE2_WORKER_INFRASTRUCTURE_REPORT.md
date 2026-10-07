# P4.6 PHASE 2 — WORKER INFRASTRUCTURE ENABLEMENT

**Date:** 2026-10-07
**Owner GO:** P4.6 PHASE 2 — WORKER INFRASTRUCTURE ENABLEMENT
**Mode:** Contabo / systemd / env enablement only — **NO** live export · **NO** claim · **NO** Storage/DB mutate · **NO** deploy · **NO** commit
**Final status:** **P4.6 PHASE 2 — GREEN / READY FOR LIVE VERIFICATION**

---

## 1. Scope

Prepare the **existing** Contabo E3 EXTERNAL worker so that **after** Phase 1 code is deployed (separate Owner GO) it can run:

```text
render_jobs
  → claimRenderJobAsWorker (Bearer E3_RENDER_WORKER_SECRET)
  → TAKE_EXPORT | MIX
  → take-audio (source) / bake (MIX)
  → host FFmpeg + libmp3lame
  → audio-artifacts
```

**In scope:** VM recon, FFmpeg/lame, env presence, secret presence (no disclosure), systemd oneshot harden, start/stop/logs/failsafe docs, I01–I18, production safety read-only.

**Out of scope (hard stop):** Phase 1 Vercel/Contabo code deploy, production TAKE_EXPORT enqueue/claim/encode/upload, DB/Storage mutations, migrations, Redis/second worker/second queue, P4.7 / P5 / P6.8, WIP `context?`.

---

## 2. Baseline

| Field | Value |
|-------|--------|
| Production URL | https://www.bitrymdym.pl |
| CURRENT_PRODUCTION_SHA | `836679adc146de13c4833763fe2dec4769b64265` (`836679a`) |
| CURRENT_PRODUCTION_DEPLOYMENT | `dpl_5J2cRHA2XRg7SKCZuyFvVZhBpJpT` · **Ready** · aliases include www.bitrymdym.pl |
| CURRENT_LOCAL_SHA (git HEAD) | `836679a` (same tip) |
| Phase 1 code | **LOCAL WIP** (dirty working tree; **not** committed · **not** on production · **not** on Contabo) |
| Contabo DEPLOYED_COMMIT | `92496d4cdb8a93497594dc5e9128f7fabcf2b852` (pre–Phase 1 TAKE_EXPORT path) |
| Phase 1 report | `docs/audits/P4_6_PHASE1_CODE_IMPLEMENTATION_REPORT.md` · GREEN |
| Prior live verify | `docs/audits/P4_6_LIVE_WORKER_VERIFICATION.md` · INFRASTRUCTURE BLOCK |
| Architecture audit | `docs/audits/P4_6_E3_WORKER_ARCHITECTURE_AUDIT.md` · Decision D |

### SHA delta (explicit)

| Surface | SHA | Phase 1 TAKE_EXPORT worker path |
|---------|-----|----------------------------------|
| Production (Vercel) | `836679a` | **ABSENT** (pre–Phase 1 deploy) |
| Contabo `/opt/bitrymdym-e3-worker` | `92496d4` | **ABSENT** (`TAKE_EXPORT` grep count = 0 in pipeline + source resolution) |
| Local dirty tree @ HEAD `836679a` + WIP | local only | **PRESENT** (Phase 1 files modified/untracked) |

**No Phase 1 deploy performed in this GO.**

---

## 3. Contabo VM status

| Field | Evidence |
|-------|----------|
| Host | `ubuntu@161.97.72.197` · hostname `vmi3622761` |
| SSH | Key `~/.ssh/bitrymdym-e3-contabo` · BatchMode OK |
| Kernel | `Linux vmi3622761 6.8.0-139-generic … x86_64` |
| Uptime (probe) | ~7 days |
| Power / reachability | **UP** |
| Docker | **ABSENT** (`docker: command not found`) — correct for Architecture C host FFmpeg |
| Worker process | **STOPPED** — `NO_WORKER_PROCESS` |
| systemd unit | **PRESENT** · `bitrymdym-e3-worker.service` · **disabled** · **inactive** |
| App tree | `/opt/bitrymdym-e3-worker` · user/group `bitrymdym-e3` |
| Runtime dirs | `/var/lib/bitrymdym-e3-worker` · `/var/log/bitrymdym-e3-worker` |
| Env dir | `/etc/bitrymdym-e3-worker/worker.env` (mode root-only) |

---

## 4. FFmpeg status

| Check | Result |
|-------|--------|
| Binary | `/usr/bin/ffmpeg` · `/usr/bin/ffprobe` |
| Version | **FFmpeg 6.1.1-3ubuntu5** |
| Capability probe | `ffmpeg -version` only (no production encode) |

---

## 5. libmp3lame status

| Check | Result |
|-------|--------|
| `ffmpeg -encoders \| grep libmp3lame` | **PRESENT** — `A....D libmp3lame` |
| Alternate encoder installed | **NO** (existing host FFmpeg reused) |

---

## 6. Worker runtime

| Field | Value |
|-------|--------|
| Canonical entry | `scripts/e3-render-worker-once.ts` → `runRealRenderWorkerJob` |
| npm script | `e3:worker:once` = `tsx --import ./scripts/register-server-only-stub.mjs scripts/e3-render-worker-once.ts` |
| Node | `v22.23.3` |
| tsx | **PRESENT** under `/opt/bitrymdym-e3-worker/node_modules/.bin/tsx` |
| node_modules | **PRESENT** |
| Contabo code capability | **MIX-era** @ `92496d4` — TAKE_EXPORT branch **not** on host yet |
| Second worker / take-export-worker service | **NOT CREATED** |

Phase 1 local comment on `e3-render-worker-once.ts` documents TAKE_EXPORT support; Contabo copy still documents MIX tiers only until code sync (Phase 3 prerequisite).

---

## 7. Supervisor / systemd

**Existing unit reused and hardened** (not a new worker framework).

| Property | Value |
|----------|--------|
| Unit | `/etc/systemd/system/bitrymdym-e3-worker.service` |
| Type | `oneshot` |
| User | `bitrymdym-e3` |
| WorkingDirectory | `/opt/bitrymdym-e3-worker` |
| EnvironmentFile | `- /etc/bitrymdym-e3-worker/worker.env` |
| ExecStart | Fail-closed: requires `E3_RENDER_JOB_ID`; then `npm run e3:worker:once -- "$E3_RENDER_JOB_ID"` |
| Auto-start | **disabled** (not enabled; no linger poll loop) |
| `systemd-analyze verify` | **PASS** (rc 0) |
| Restart-on-failure loop | **REMOVED** (oneshot + explicit job id = no unsupervised claim storm) |

**I14 fail-closed validation:** `systemctl start` without `E3_RENDER_JOB_ID` → journal: `E3_RENDER_JOB_ID required (oneshot; no auto-claim)` · exit 2 · **no claim** · process gone · unit left **disabled**. `systemctl reset-failed` applied after probe → **inactive** / **disabled**.

---

## 8. Environment variables presence

Source: `/etc/bitrymdym-e3-worker/worker.env` (keys only; **values never printed**).

| VAR_NAME | Presence |
|----------|----------|
| `E3_RENDER_WORKER_SECRET` | **PRESENT** |
| `E3_RENDER_JOBS_ENABLED` | **PRESENT** |
| `E3_MIX_ENABLED` | **PRESENT** |
| `NEXT_PUBLIC_SUPABASE_URL` | **PRESENT** |
| `SUPABASE_SERVICE_ROLE_KEY` | **PRESENT** |
| `SUPABASE_URL` | **MISSING** (OK if app uses `NEXT_PUBLIC_SUPABASE_URL`) |
| `E3_FFMPEG_PATH` | **MISSING** (OK — host PATH `/usr/bin/ffmpeg`) |
| `E3_FFPROBE_PATH` | **MISSING** (OK — host PATH `/usr/bin/ffprobe`) |
| `NODE_ENV` | **MISSING** in env file; set by systemd unit to `production` |
| `SUPABASE_ANON_KEY` | **MISSING** (worker uses service role) |

---

## 9. Secret handling

| Field | Value |
|-------|--------|
| SECRET_PRESENT | **YES** |
| SECRET_SOURCE | **ENV** (`EnvironmentFile=/etc/bitrymdym-e3-worker/worker.env`) |
| SECRET_VALUE | **REDACTED** |
| In git / worker tree `.env` | **NO** (`NO_DOTENV_IN_TREE`; docs mention name only) |
| Logged during Phase 2 | **NO** (presence checks + wrong-secret probe only) |

---

## 10. DB connectivity

| Check | Result |
|-------|--------|
| Worker → Supabase URL reachable | **YES** (`SUPABASE_HEALTH_HTTP=401` on `/auth/v1/health` = endpoint reachable; no mutation) |
| `render_jobs` columns | `id`, `kind`, `status`, `take_id`, `mix_session_id` confirmed (read-only) |
| Claim path in code | `claimRenderJobAsWorker` (canonical; not bypassed) |
| Lifecycle | QUEUED → RUNNING → SUCCEEDED / FAILED (existing enum; **no** test job created) |
| QUEUED TAKE_EXPORT count | **1** (read-only; **NOT claimed**) |
| Queued id (observe only) | `7ceeb1a0-0c62-4b3e-be5a-f6379ac956e9` · created `2026-10-05` · **DO NOT CLAIM in Phase 2** |
| RUNNING TAKE_EXPORT | **0** |
| Phase 2 DB mutations | **NONE** |

---

## 11. Storage connectivity / config

| Check | Result |
|-------|--------|
| Buckets exist | `take-audio` · `audio-artifacts` (both `public=false`) |
| Worker service-role Storage list | `STORAGE_BUCKETS_LIST_HTTP=200` (config/credentials work) |
| Upload / delete / policy change | **NOT PERFORMED** |
| New bucket | **NOT CREATED** |

---

## 12. Security checks

| Check | Result |
|-------|--------|
| Unauthenticated claim `POST /api/mix/worker/claim` | **HTTP 401** · `Worker authorization required.` |
| Wrong Bearer secret | **HTTP 403** · `Invalid worker secret.` |
| Authenticated claim of production job | **NOT EXECUTED** (no Phase 3 GO; existing QUEUED left untouched) |
| Client-supplied object_key bypass | Not introduced; existing claim/CAS model unchanged |

---

## 13. Start procedure

Worker stays **disabled** until an Owner-designated job id is supplied (Phase 3).

```bash
# SSH
ssh -i ~/.ssh/bitrymdym-e3-contabo ubuntu@161.97.72.197

# One-shot with explicit job (NO auto-poll)
sudo systemctl set-environment E3_RENDER_JOB_ID="<uuid>"
sudo systemctl start bitrymdym-e3-worker.service
sudo systemctl unset-environment E3_RENDER_JOB_ID

# Or direct (same canonical script; still requires env/secrets via worker.env):
sudo -u bitrymdym-e3 bash -lc '
  set -a; . /etc/bitrymdym-e3-worker/worker.env; set +a
  cd /opt/bitrymdym-e3-worker
  npm run e3:worker:once -- "<uuid>"
'
```

**Do not** `systemctl enable` for unsupervised multi-user boot until a separate Owner gate.

---

## 14. Stop procedure

```bash
# Oneshot should already be idle after job; if a process hangs:
sudo systemctl stop bitrymdym-e3-worker.service
sudo pkill -u bitrymdym-e3 -f 'e3-render-worker-once|tsx' || true
sudo systemctl reset-failed bitrymdym-e3-worker.service
# Confirm still disabled:
systemctl is-enabled bitrymdym-e3-worker.service   # expect: disabled
```

---

## 15. Logs procedure

```bash
sudo journalctl -u bitrymdym-e3-worker.service -n 100 --no-pager
sudo journalctl -u bitrymdym-e3-worker.service -f
# SyslogIdentifier = bitrymdym-e3-worker
```

---

### Failsafe

| Situation | Action |
|-----------|--------|
| Accidental `systemctl start` without job id | Fail closed (exit 2); no claim |
| Worker looping / claiming unexpected jobs | `systemctl stop` · `pkill` · confirm `disabled` · revoke/rotate `E3_RENDER_WORKER_SECRET` if compromise suspected |
| Existing QUEUED TAKE_EXPORT | **Leave untouched** until Phase 3 Owner designates a safe target |
| Contabo still on `92496d4` | Do **not** run TAKE_EXPORT live until Phase 1 code is on host + API |

---

## 16. Tests I01–I18

| ID | Check | Result |
|----|-------|--------|
| I01 | VM reachable | **PASS** |
| I02 | SSH works | **PASS** |
| I03 | FFmpeg available | **PASS** (6.1.1) |
| I04 | libmp3lame available | **PASS** |
| I05 | worker script available | **PASS** (`scripts/e3-render-worker-once.ts`) |
| I06 | worker dependencies available | **PASS** (node_modules + tsx) |
| I07 | required env presence | **PASS** (core vars PRESENT; optional PATH/anon MISSING OK) |
| I08 | secret presence without disclosure | **PASS** (YES / ENV / REDACTED) |
| I09 | Storage credentials/config presence | **PASS** (service role + buckets + HTTP 200 list) |
| I10 | DB connectivity | **PASS** (URL reachable; read-only SQL OK) |
| I11 | worker claim endpoint reachable | **PASS** (www.bitrymdym.pl `/api/mix/worker/claim`) |
| I12 | unauthenticated claim rejected | **PASS** (401; wrong secret 403) |
| I13 | supervisor/systemd configuration valid | **PASS** (`systemd-analyze verify` rc 0) |
| I14 | worker start/stop mechanism validated | **PASS** (fail-closed start; inactive+disabled after) |
| I15 | NO production job claimed | **PASS** |
| I16 | NO production artifact created | **PASS** |
| I17 | NO production DB mutation | **PASS** |
| I18 | NO Storage mutation | **PASS** |

---

## 17. Production safety verification

| Check | Result |
|-------|--------|
| production SHA unchanged | **PASS** — still `836679a` |
| production deployment unchanged | **PASS** — still `dpl_5J2cRHA2XRg7SKCZuyFvVZhBpJpT` · Ready |
| DB schema / migrations | **UNCHANGED** (read-only probes only) |
| Storage buckets / objects | **UNCHANGED** (no upload/delete) |
| render_jobs | **UNCHANGED** by this GO (existing QUEUED count observed = 1; not claimed) |
| Contabo worker process | **STOPPED** / unit **disabled** |
| Vercel deploy / git commit / push | **NONE** |
| TAKE_EXPORT live encode | **NONE** |

---

## 18. Files changed

| Path | Change |
|------|--------|
| Contabo `/etc/systemd/system/bitrymdym-e3-worker.service` | Hardened oneshot: require `E3_RENDER_JOB_ID`; remove unsupervised restart loop |
| `docs/audits/P4_6_PHASE2_WORKER_INFRASTRUCTURE_REPORT.md` | **THIS REPORT** (local only) |

No application source, migrations, or production Storage/DB files mutated for Phase 2.

---

## 19. Git status

| Item | Value |
|------|--------|
| Commit / push | **NOT DONE** (Owner ban) |
| Local HEAD | `836679a` |
| Phase 1 WIP | Still dirty local (pipeline / take-export / tests / etc.) — **unchanged intent** |
| This report | Untracked until Owner decides to commit |

---

## 20. Known limitations

1. **Contabo code ≠ Phase 1** — host still `92496d4`; TAKE_EXPORT worker path not present on VM. Phase 3 live verify requires Contabo tree sync to Phase 1 SHA **after** Owner deploy GO.
2. **Production API ≠ Phase 1** — Vercel still `836679a` without Phase 1 TAKE_EXPORT worker wiring; enqueue posture may still stamp infra notes from pre–Phase 1 / Phase 1-local semantics until deploy.
3. **Existing QUEUED TAKE_EXPORT = 1** — historical job `7ceeb1a0-…` must not be auto-claimed; Phase 3 needs Owner-designated target.
4. **Worker remains STOPPED** — intentional; Phase 2 enables controlled start, does not leave a permanent poller running.
5. **`SUPABASE_URL` / explicit `E3_FFMPEG_PATH` unset** — acceptable given `NEXT_PUBLIC_SUPABASE_URL` + PATH FFmpeg; document if Phase 3 wants belt-and-suspenders.

---

## 21. Final status

**P4.6 PHASE 2 — GREEN / READY FOR LIVE VERIFICATION**

Infrastructure on Contabo is prepared for the existing E3 worker path (FFmpeg 6.1.1 + libmp3lame, env/secret present, Storage/DB reachability, claim auth boundary, systemd oneshot with explicit job id, start/stop/logs/failsafe documented). No production job was claimed; no artifact created; production SHA/deployment unchanged.

**STOP.** Awaiting **OWNER GO** for **P4.6 Phase 3 — Live Verification** (and any separate GO for Phase 1 deploy + Contabo code sync before live TAKE_EXPORT).
