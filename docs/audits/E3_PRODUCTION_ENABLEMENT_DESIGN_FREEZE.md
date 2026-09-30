# E3 PRODUCTION ENABLEMENT — DESIGN FREEZE

**Type:** Design Freeze (canonical)  
**Date:** 2026-09-30  
**Epic:** `E3 — PRODUCTION ENABLEMENT`  
**Prior audit:** E3 PRODUCTION ENABLEMENT — AUDIT · **READY WITH FINDINGS**  
**Application / Production baseline:** `17c4d530`  
**Documentation tip (at freeze authorship):** `fb661db` (+ this freeze in working tree · **NO COMMIT yet**)  
**Production URL:** https://www.bitrymdym.pl  
**W6 prerequisite:** **CLOSED / PASS** · **OD-W6-03 = OWNER-ACCEPTED EMULATED CERTIFICATION**

```text
DESIGN FREEZE                    = COMPLETE (this document)
OWNER DECISIONS OD-E3-PE-01…05   = LOCKED (below)
ARCHITECTURE REVIEW              = PASS WITH FINDINGS (see §19)
IMPLEMENTATION                   = NONE
COMMIT / PUSH / DEPLOY           = NONE
ENV CHANGE                       = NONE
WORKER RUN / REAL RENDER         = NONE
E3 PRODUCTION                    = STILL DARK
E3_PUBLIC_AUDIO                  = REMAINS OFF for first enablement release
```

**This document does not:** implement code · change env · provision worker · run render · ship W6 UX · enable public Free Audio · grant Implementation GO without Owner gates.

**SSOT precedents (read-only):**

| Document | Role |
|----------|------|
| [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](../architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) | OAD-01…07 · Hybrid C · EXTERNAL worker · OAD-05 |
| [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](../architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md) | IP-06 kill switches · wave plan |
| [E3_7_IMPLEMENTATION_CLOSEOUT.md](../audits/E3_7_IMPLEMENTATION_CLOSEOUT.md) | E3.7 PRODUCTION VERIFIED · DARK |
| [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](../audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md) | W6 CLOSED / PASS · Owner-accepted emulated |
| Prior PE Audit (session) | READY WITH FINDINGS · F-PE-01…08 |

---

## 1. Owner Decisions — LOCKED

| ID | Decision | Locked value |
|----|----------|--------------|
| **OD-E3-PE-01** | First enablement scope | **B** — Mix + Render Jobs + External Worker + Worker Secret + controlled real render verification · **not** automatic `E3_PUBLIC_AUDIO=ON` |
| **OD-E3-PE-02** | Worker infrastructure | **PROVISION NOW** — External worker · worker secret · FFmpeg · Production worker infrastructure **APPROVED** |
| **OD-E3-PE-03** | `E3_PUBLIC_AUDIO` | **REQUIRE IMPLEMENTATION GATE** — runtime AuthZ gate (server · fail-closed) · **design now · implement later** · not docs-only |
| **OD-E3-PE-04** | W6.2/W6.3 presentation | **SHIP BEFORE ENABLEMENT** — separate commit/push/deploy/verify · **not** same change set as enablement |
| **OD-E3-PE-05** | Controlled real Production render | **YES** — Basic required · Premium if fixture ready · real worker/FFmpeg/artifact/download · **not now** |

```text
OD-E3-PE-01 = B
OD-E3-PE-02 = PROVISION NOW
OD-E3-PE-03 = REQUIRE IMPLEMENTATION GATE
OD-E3-PE-04 = SHIP BEFORE ENABLEMENT
OD-E3-PE-05 = YES (controlled verify · later Owner GO)
```

---

## 2. Scope (IN)

```text
E3 PRODUCTION ENABLEMENT (first release) =
  Stage 1 separate W6.2/W6.3 UX ship
  + External worker host with FFmpeg (OD-E36-04 = C)
  + E3_RENDER_WORKER_SECRET (Production)
  + E3_MIX_ENABLED = true (Production)
  + E3_RENDER_JOBS_ENABLED = true (Production)
  + Controlled real Production render verification (Basic · Premium if fixture)
  + Design + later implementation of PUBLIC_AUDIO runtime gate (before GO #5)
  + Observability minimum · rollback · acceptance criteria
```

| Area | In scope |
|------|----------|
| Mix enablement | Technical Mix/Master (existing AuthZ + capability matrix) |
| Render Jobs | Job create · claim · lifecycle · download |
| External worker | Claim API · FFmpeg encode · QC · private upload · DB Final Truth |
| Worker secret | Production secret configuration (ops · never commit) |
| Controlled verify | Real BASIC_MP3 · optional HQ/WAV with Premium fixture |
| PUBLIC_AUDIO gate | **Architecture freeze + later implement** before public Free Audio |
| Docs continuity | This freeze · PROJECT_STATE · HANDOFF · CHANGELOG |

---

## 3. Non-Scope (OUT)

```text
OUT:
  E3_PUBLIC_AUDIO = ON in this enablement release
  Automatic public Free Audio product release
  STEMS / artifact_kind
  Payments / Premium catalog product
  MasterProParams / True Peak / full BS.1770
  New DB migration (unless evidence requires — not expected)
  New Storage bucket
  AuthZ/DSP/API business-logic redesign
  Bundling W6.2/W6.3 into enablement commit
  Unattended high-volume Production traffic
  Dedicated ops dashboard (accepted deferred — finding)
  Audio-artifacts janitor implementation (F-PE-04 · decision only)
  Physical-device re-cert (OD-W6-03 closed)
  E3 epic COMPLETE claim
```

---

## 4. Production Flag Strategy (ORDERED STAGES)

| Stage | Action | Flags / infra | Exit criteria |
|-------|--------|---------------|---------------|
| **0** | Production DARK | All E3_* UNSET · secret UNSET | Baseline `17c4d530` |
| **1** | W6.2/W6.3 UX release | App ship only · **no** E3 flag ON | Production Verify PASS · separate GO #1 |
| **2** | Worker infrastructure ready | Host + FFmpeg + secret **stored** (may remain unused until Stage 5) | Claim with secret works against DARK or Preview · GO #2 |
| **3** | Mix enablement | `E3_MIX_ENABLED=true` · jobs still OFF | Mix AuthZ smoke · no artifacts |
| **4** | Render Jobs enablement | `E3_RENDER_JOBS_ENABLED=true` | Job create allowed · worker may claim |
| **5** | Worker secret active use | `E3_RENDER_WORKER_SECRET` set · worker running | Claim succeeds · fake-complete **not** used as Final Truth |
| **6** | Controlled real render | Worker encodes | READY artifact · GO #4 |
| **7** | Production verification | Evidence pack | AC-PE-07…10 |
| **8** | Public Free Audio decision | Requires gate **implemented** + Owner GO #5 | `E3_PUBLIC_AUDIO` may turn ON **only then** |

**Hard rule:** Stages 3–7 keep **`E3_PUBLIC_AUDIO` OFF / UNSET**.  
**Hard rule:** Do not collapse stages or skip Owner gates.  
**Hard rule:** Stage 1 must complete before Stage 3+ on Production (OD-E3-PE-04).

**Recommended Production env application order for GO #3 (single maintenance window allowed only if Owner explicitly collapses 3–5):**

```text
prefer: Stage 3 → verify Mix → Stage 4 → Stage 5 → Stage 6
never: E3_PUBLIC_AUDIO in GO #3
```

---

## 5. Worker Architecture (REUSE · no contract change without evidence)

### 5.1 Class

```text
EXTERNAL WORKER (OAD-02 · OD-E36-04 = C)
  — not sync Vercel Route Handler encode
  — native/system FFmpeg + libmp3lame on worker host
  — FFmpeg is NOT an npm dependency of the Next.js app
```

### 5.2 Existing contract (frozen reuse)

| Piece | Location / contract |
|-------|---------------------|
| Claim | `POST /api/mix/worker/claim` · Bearer `E3_RENDER_WORKER_SECRET` · body `{ jobId }` · no client source keys |
| Fake-complete | Secret-gated · **CI/domain only** · **forbidden as Production Final Truth** |
| Pipeline | `runRealRenderWorkerJob` / `scripts/e3-render-worker-once.ts` |
| Domain | `render-job-service.ts` · entitlement snapshot · caps · timeout 180s from CLAIM · max attempts 3 |
| Adapter | Vendor-neutral enqueue adapter remains; progression = EXTERNAL claim/complete |

### 5.3 Worker must (acceptance)

1. Authenticate with worker secret (timing-safe).  
2. Claim job → RUNNING + `timeout_at`.  
3. Re-validate sources server-side (FINDING-01 class).  
4. Bake: Basic → `server-basic-v1` · Premium HQ/WAV → `server-pro-v1` (+ Master Plan A).  
5. Encode: BASIC_MP3 128 · HQ_MP3 320 · WAV 44.1/16/stereo.  
6. QC PASS required.  
7. Upload private `audio-artifacts`.  
8. Insert artifact READY + finalize job **SUCCEEDED** only after encode + QC + upload + DB (Final Truth).  
9. On failure → FAILED with error code/message; respect timeout → TIMEOUT; respect max attempts.

### 5.4 Provisioning (OD-E3-PE-02) — design only

| Requirement | Notes |
|-------------|--------|
| Host | Always-on or on-demand EXTERNAL host with network to Production APIs + Supabase Storage |
| FFmpeg | System install with libmp3lame |
| Secret | Production env only · never commit · rotate-capable |
| Runner | Existing once-script or equivalent loop claiming QUEUED jobs — **no new API contract** unless Arch Review finding forces it |

---

## 6. Mix Enablement

| Item | Rule |
|------|------|
| Flag | `E3_MIX_ENABLED=true` |
| AuthZ | Existing `assertMixRuntimeEnabled` + capability (`MIX_BASIC` / `MIX_PRO`) |
| Anon | Remains login-gated / zero audio capabilities |
| UI | After Stage 1, Production has W6 presentation + RSC `mixEnabled` prop pattern |
| Does not | Authorize public Free Audio release · does not create artifacts alone |

---

## 7. Render Jobs Enablement

| Item | Rule |
|------|------|
| Flag | `E3_RENDER_JOBS_ENABLED=true` |
| AuthZ | Existing render domain + capability per tier |
| Snapshot | Entitlement snapshot at job create = processing SSOT |
| Download | Live entitlement + ownership + READY + SUCCEEDED + signed TTL |
| Depends on | Worker + secret for Final Truth SUCCESS |

---

## 8. Basic / Premium Render Paths

### 8.1 Basic (mandatory for OD-E3-PE-05)

```text
Auth Free user
  → Mix Basic + Master Basic
  → Job BASIC_MP3
  → EXTERNAL worker claim
  → server-basic-v1 bake
  → FFmpeg 128 stereo
  → QC
  → private upload
  → artifact READY
  → job SUCCEEDED
  → signed download
  → verify file
```

### 8.2 Premium (conditional)

```text
Requires: premium_entitlements active fixture (service_role seed) — PREREQUISITE
  → Mix Pro + Master Plan A
  → Job HQ_MP3 and/or WAV
  → server-pro-v1 bake
  → encode + QC + upload + READY + download
  → Free user MUST DENY HQ/WAV create and download
```

If Premium fixture absent at GO #4: **Premium AC marked BLOCKED/SKIP** · Basic AC still required · do not invent payments product.

---

## 9. Artifact + Download Lifecycle

```text
CREATE (snapshot) → QUEUED → CLAIM/RUNNING → encode/QC/upload
  → audio_artifacts READY (expires_at Free 48h / Premium 30d)
  → job SUCCEEDED
  → signed GET (short TTL · no client object_key)
  → EXPIRED/DELETED (status; janitor = F-PE-04 deferred)
```

Bucket: **`audio-artifacts`** private only (OAD-07). No new bucket.

---

## 10. AuthZ / Entitlement (unchanged SSOT)

| Actor | Mix Basic | Pro | Basic MP3 | HQ/WAV |
|-------|-----------|-----|-----------|--------|
| Anon | DENY | DENY | DENY | DENY |
| Free | ALLOW if Mix ON† | DENY | ALLOW if Jobs ON† | DENY |
| Premium | ALLOW | ALLOW | ALLOW | ALLOW |

† During Stages 3–7 with `E3_PUBLIC_AUDIO` OFF: this is **controlled technical enablement**, **not** “public Free Audio released” (see §11).

Server SSOT: `effective-entitlement.ts` · premium overlay · Account Level ≠ Premium.

---

## 11. PUBLIC_AUDIO Runtime Gate (OD-E3-PE-03) — DESIGN FREEZE · IMPLEMENT LATER

### 11.1 Problem frozen from audit

`E3_PUBLIC_AUDIO` / `isE3PublicAudioAuthorized()` exist in config but are **not** enforced on Mix/render AuthZ paths (F-PE-02). Docs-only kill switch is **rejected** by Owner.

### 11.2 Definitions (LOCKED)

| Term | Meaning |
|------|---------|
| **Technical enablement** | `E3_MIX_ENABLED` / `E3_RENDER_JOBS_ENABLED` ON · capability matrix applies · may include authenticated Free Basic for controlled verify |
| **Public Free Audio release** | Product state where Free Basic Mix/Master/Export is **authorized as public Free Audio** under OAD-05 |
| **PUBLIC_AUDIO gate** | Server-side fail-closed assert required for **Public Free Audio release** |

```text
Public Free Audio release requires ALL of:
  E3_PUBLIC_AUDIO = true (runtime)
  + W6 PASS (satisfied)
  + Owner GO #5
  + implemented server gate (this section) enforcing the above
```

`E3_MIX_ENABLED` alone **never** authorizes public Free Audio release (IP-06 preserved).

### 11.3 Where the gate lives (design)

| Layer | Design |
|-------|--------|
| Config SSOT | Keep `E3_PUBLIC_AUDIO` + `isE3PublicAudioAuthorized()` in `src/config/audio-render.ts` |
| AuthZ helper | New server-only `assertPublicFreeAudioReleased()` (name illustrative) — **fail-closed** if flag ≠ true |
| Call sites (must cover) | Free (non-premium) paths that constitute **public Free Audio product use**: Mix session create when only Free Basic capabilities apply · BASIC_MP3 job create · Basic artifact download for Free users — **exact wiring in Implement GO** |
| Independent of | Client UI flags · documentation prose · `NEXT_PUBLIC_*` |
| Premium | **Never** requires `E3_PUBLIC_AUDIO` |

### 11.4 Controlled enablement vs public release (LOCKED)

| Phase | PUBLIC_AUDIO | Free Basic Mix/Jobs |
|-------|--------------|---------------------|
| Stages 3–7 first enablement | **OFF** | Allowed under Mix+Jobs for **controlled Production enablement / AC-PE-07** · must **not** be marketed as public Free Audio released |
| After gate implemented + GO #5 | **ON** | Public Free Audio release authorized |

**Implementation constraint (when coded):** Gate must be testable (unit: OFF → DENY public-release paths; ON → ALLOW Free Basic public-release paths). During Stages 3–7, Implement GO for the gate may land **before** GO #5 while flag stays OFF (AC-PE-12: gate **exists** before public release).

**Ordering freeze:**

```text
Implement PUBLIC_AUDIO runtime gate (code)
  → tests prove fail-closed
  → still PUBLIC_AUDIO=OFF on Production
  → later Owner GO #5 may set PUBLIC_AUDIO=true
```

Do **not** expand public scope beyond OAD-05 (no anon Free render · no desktop-only carve-out · no STEMS).

### 11.5 Explicit non-claims

- Turning Mix+Jobs ON ≠ public Free Audio release.  
- W6 PASS ≠ PUBLIC_AUDIO ON.  
- This freeze does **not** implement the gate.

---

## 12. Security

| Control | Requirement |
|---------|-------------|
| Worker secret | Server-only · Bearer · timing-safe compare · unset = deny |
| Private bucket | `audio-artifacts` · service writes · no anon/auth storage policies |
| Signed URLs | Short TTL · server-minted · no client object keys |
| Ownership | Job/artifact/session owner checks |
| Entitlement | Snapshot process · live download |
| Job enumeration | Own-only |
| Fake-complete | Secret-gated · not Production Final Truth |
| PUBLIC_AUDIO | Fail-closed runtime gate before GO #5 release |
| Fail closed | Missing flags/secret → DENY |

---

## 13. Observability (minimum for first controlled render)

| Signal | Required |
|--------|----------|
| Job status transitions | YES (DB + GET job API) |
| Worker claim success/fail | YES (API response + worker logs) |
| FFmpeg / QC failure | YES (job error_code/message + worker logs) |
| Artifact upload / DB finalize | YES |
| Download success/fail | YES |
| Dedicated dashboard | **NOT required** for first controlled render — **accepted deferred** (AR finding) |

---

## 14. Retention — F-PE-04

| Item | Decision in this freeze |
|------|-------------------------|
| Dedicated audio-artifacts janitor | **NOT implemented now** |
| Blocks first controlled render? | **NO** (low volume · manual cleanup acceptable) |
| Required before high traffic? | **YES — Owner decision later** |
| Who decides | Owner (future GO) · do not invent auto-solution here |

---

## 15. Rollback

### 15.1 ENV ROLLBACK (fastest)

1. Unset `E3_MIX_ENABLED`  
2. Unset `E3_RENDER_JOBS_ENABLED`  
3. Unset / rotate `E3_RENDER_WORKER_SECRET`  
4. Keep `E3_PUBLIC_AUDIO` UNSET  

### 15.2 WORKER ROLLBACK

5. Stop EXTERNAL worker process(es)  

### 15.3 DATA / ARTIFACT CLEANUP

6. Cancel or mark QUEUED/RUNNING jobs FAILED/CANCELLED (admin)  
7. Optional: delete/expire artifacts in `audio-artifacts` + DB rows  

### 15.4 APPLICATION ROLLBACK

8. Optional redeploy prior app SHA (`17c4d530` or earlier) — **independent** of env rollback  

Flags-off does **not** auto-delete artifacts.

---

## 16. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| **AC-PE-01** | W6 prerequisite remains PASS (Owner-accepted emulated) |
| **AC-PE-02** | W6.2/W6.3 shipped separately · Production Verify PASS |
| **AC-PE-03** | External worker ready (host + FFmpeg) |
| **AC-PE-04** | Worker secret configured securely (not in git) |
| **AC-PE-05** | Mix enabled without breaking AuthZ (anon DENY · Free/Premium matrix) |
| **AC-PE-06** | Render Jobs enabled |
| **AC-PE-07** | Basic real Production render reaches READY |
| **AC-PE-08** | Basic artifact signed download succeeds · file verifiable |
| **AC-PE-09** | Premium real render READY **if** Premium fixture available; else documented SKIP |
| **AC-PE-10** | Unauthorized users cannot access Premium output |
| **AC-PE-11** | `E3_PUBLIC_AUDIO` remains OFF during first enablement |
| **AC-PE-12** | PUBLIC_AUDIO **runtime gate exists** (implemented + tested) before any public Free Audio release |
| **AC-PE-13** | Rollback procedure documented and executable |
| **AC-PE-14** | Production remains controlled and observable (min signals §13) |

---

## 17. Owner Gates (DO NOT MERGE)

| Gate | What | Next after PASS |
|------|------|-----------------|
| **OWNER GO #1** | W6.2/W6.3 UX release (commit/push/deploy/verify) | Stage 2 |
| **OWNER GO #2** | Worker infrastructure provisioning | Stage 3+ |
| **OWNER GO #3** | Production env enablement (Mix / Jobs / secret per §4) | Stage 6 |
| **OWNER GO #4** | Controlled real Production render | Stage 7 evidence |
| **OWNER GO #5** | Public Free Audio (`E3_PUBLIC_AUDIO`) — requires AC-PE-12 | Optional later |

**Also required before any Implement GO for PUBLIC_AUDIO gate code:** Owner Implementation GO for that code slice alone (may precede GO #5; flag stays OFF).

---

## 18. Wave / work order (strict)

```text
0. This Design Freeze + Arch Review
1. OWNER GO #1 → W6 UX ship + Production Verify
2. OWNER GO #2 → provision worker + secret (ops)
3. (Optional parallel) Implement PUBLIC_AUDIO runtime gate + tests · flag OFF
4. OWNER GO #3 → Production flags Mix → Jobs → secret use
5. OWNER GO #4 → controlled real render verify
6. OWNER GO #5 → only if public Free Audio desired
```

---

## 19. Architecture Review (of this freeze)

**Verdict: PASS WITH FINDINGS**

| Check | Result |
|-------|--------|
| SSOT reuse (OAD/IP/E3.7) | PASS — no second render system |
| Server source of truth | PASS — flags + AuthZ + entitlement server-side |
| No duplicate AuthZ | PASS — extends existing helpers; PUBLIC_AUDIO gate designed as single assert |
| Worker boundaries | PASS — EXTERNAL · existing claim contract |
| Failure / timeout / attempts | PASS — reuse domain |
| Rollback | PASS — env/worker/data/app separated |
| Security fail-closed | PASS |
| Mobile prerequisite | PASS — W6 closed; not reopened |
| Scope creep | PASS — PUBLIC_AUDIO ON out; janitor deferred; no STEMS |
| PUBLIC_AUDIO design vs AC-PE-07/11 | PASS WITH FINDING — see AR-PE-01 |
| Observability | PASS WITH FINDING — AR-PE-02 |
| Retention | PASS WITH FINDING — F-PE-04 carried |

### Architecture findings

| ID | Severity | Evidence | Impact | Required action |
|----|----------|----------|--------|-----------------|
| **AR-PE-01** | **MEDIUM** | Free Basic verify (AC-PE-07) with PUBLIC_AUDIO OFF (AC-PE-11) vs gate on Free paths | Implementer must not block controlled Free Basic during Stages 3–7; gate enforces **public release** (GO #5), not technical Mix+Jobs | Implement GO must follow §11.4 split; tests for both modes |
| **AR-PE-02** | **LOW** | No dedicated dashboard | Acceptable for first controlled render | Document in ops runbook; future Owner GO if needed |
| **AR-PE-03** | **LOW** | F-PE-04 no artifacts janitor | OK for controlled volume | Owner decision before scale |
| **AR-PE-04** | **INFO** | Production deployment id drift in older docs | Continuity hygiene | Reconcile on next docs commit |
| **AR-PE-05** | **INFO** | Premium fixture may be absent | AC-PE-09 SKIP | Owner seed entitlement before Premium verify |

**BLOCKED items for implementation:** none in this freeze document itself.  
**BLOCKED for live Final Truth without GO #2:** worker/secret/FFmpeg (F-PE-01) — ops dependency, acknowledged.

---

## 20. Related documents

| Doc | Role |
|-----|------|
| This file | Enablement Design Freeze |
| [PROJECT_STATE.md](../PROJECT_STATE.md) | Living state |
| [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) | Cold-start |
| [CHANGELOG.md](../CHANGELOG.md) | History |
| [architecture/README.md](../architecture/README.md) | Architecture index |

---

```text
E3 PRODUCTION ENABLEMENT DESIGN FREEZE = COMPLETE
ARCHITECTURE REVIEW                    = PASS WITH FINDINGS
IMPLEMENTATION                         = NONE
NEXT                                   = ARCHITECTURE REVIEW / OWNER GO
        (Owner verifies freeze → GO #1 W6 UX ship first)
```
