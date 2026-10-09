# BitRymDym — FINAL COLD START HANDOFF

**Purpose:** Jedyny wymagany entry point dla nowego ChatGPT Architect + Cursor Agent.
**Owner / Product Owner:** Prezes Dawid
**Updated:** 2026-10-09 — **PHASE 4 DUAL-PLANE SSOT** · Repo tip **`d515f3b`** · App feature V2 **`44f7cbd`** GREEN/CLOSED · aliases → `dpl_56FGHZNNdfgZ9k2qsLGHDRD4QcX6` · Vercel SHA **NOT VERIFIED** · Reuse/SSOT map · **STOP — OWNER DECISION REQUIRED**
**Type:** Documentation continuity · dual-plane (repo tip `d515f3b` ≠ feature V2 `44f7cbd` ≠ production dpl observation) · next = STOP after V2 · Owner decides next unit

**Evidence rule (bezwzględna):**

```text
CODE + REMOTE SCHEMA + PRODUCTION EVIDENCE  >  documentation prose
Documentation alone ≠ proof a feature is shipped
Decision CLOSED ≠ delivery SHIPPED
Production verification = separate stage
REPOSITORY STATE ≠ PRODUCTION APP STATE ≠ PRODUCTION DB STATE ≠ STORAGE STATE
```

---

## 0. READ THIS FIRST — CURRENT STATUS

BitRymDym to platforma muzyczna: **rap · hip-hop · bity · odsłuch · pobieranie · Quick Take · społeczność · współpraca**.

**Owner** decyduje. Agent **nie** decyduje samodzielnie.
**Obecny chat NIE jest wymagany** — ciągłość = docs + evidence w repo.

```text
REPOSITORY HEAD / origin/main = d515f3b7d9faf6b0d82bfba7958fece63012be82
  short                       = d515f3b
  note                        = docs tip (Phase 2 SSOT) · verify `git rev-parse HEAD` / `origin/main`
                              · docs commits `d515f3b` / `3a086ad` ≠ feature V2
APP FEATURE COMMIT (V2)       = 44f7cbd2671dd5ece6ea298cc78bfae9a0f7a7f5
  short                       = 44f7cbd
  note                        = Studio Visual Parity V2 · GREEN / RELEASE VERIFIED / CLOSED
                              · ancestry includes docs `3a086ad` · 7.1.6 `4fa658d` · 7.1.5 `3fccbf7`
                              · 7.1.4 `9abc1b6` · 7.1.3 `8f6eeca` · P4.6 `a72fed9` · V1 `56b629e`
PRODUCTION DEPLOYMENT (obs.)  = dpl_56FGHZNNdfgZ9k2qsLGHDRD4QcX6 · READY
  aliases                     = www.bitrymdym.pl · bitrymdym.pl → this deployment (same ID)
  observed_at                 = 2026-10-09 06:08:59 +02:00 · Phase 4 `vercel inspect` (direct)
PRODUCTION GIT SHA (Vercel)   = NOT VERIFIED · Vercel inspect meta does not expose commit SHA
GH DEPLOY CORRELATION (aux.)  = id 6952679578 · sha d515f3b · NOT equivalent to Vercel meta SHA
V2 VERIFY DEPLOY (HISTORY)    = dpl_2ymzMb24QtrYxWBJWmdufeTaTqkR @ 44f7cbd
  note                        = original V2 release-gate deploy · superseded for live aliases
PRIOR ALIAS BINDING (HISTORY) = dpl_FVcxa4Ad4NiotwJNSZAigDvEpuwF @ docs tip 3a086ad (Phase 2 era)
PRODUCTION URL                = https://www.bitrymdym.pl · https://bitrymdym.pl
DEPLOYMENT STATE              = READY (observed)
PREVIOUS PRODUCTION TIP       = 3a086ad / dpl_FVcx… · 44f7cbd / dpl_2ymz… (V2) · 4fa658d (7.1.6)
  older prior tip             = 79bc69f · 3fccbf7 · 9abc1b6 · 8f6eeca · a72fed9 · P4.6 (HISTORY)

STUDIO BASELINE               = Visual Parity V2 CLOSED / GREEN @ 44f7cbd
                              · Phase 7.1.6 CLOSED / GREEN @ 4fa658d (ancestry)
                              · Phase 7.1.5 Shell Polish CLOSED / GREEN @ 3fccbf7 (ancestry)
                              · Phase 7.1.4 Mixer Dock CLOSED / GREEN @ 9abc1b6 (ancestry)
                              · Phase 7.1.3 Inspector IA CLOSED / GREEN @ 8f6eeca (ancestry)
                              · V1 CLOSED / GREEN · P6.7 CLOSED / GREEN
                              · Project List UX/Delete + Checkbox PRODUCTION VERIFIED
STUDIO VISUAL PARITY V2       = GREEN / RELEASE VERIFIED / CLOSED @ 44f7cbd
                              · freeze: decisions/STUDIO_VISUAL_PARITY_V2_DESIGN_FREEZE.md
                              · follow-ups 01–04 NON-BLOCKING (waveform / overlay / picker / pixel)
PHASE 7.1.6 AUTO SAVE + CAS   = CLOSED / LAND GREEN · PRODUCTION GREEN (ancestry @ 4fa658d)
                              · Persist Orchestrator · CLEAN/DIRTY/SAVING/SAVE_FAILED/CONFLICT
                              · retry 1s/3s/8s · 409 non-retryable · Zapisz teraz · beforeunload
                              · CAS completeness + wiring · migration 20261008192141 (not re-run)
                              · interactive mutations NOT SAFELY MUTATED (safety gate)
                              · 1 StudioAudioEngine / 1 AudioContext · PlayerProvider/E3 untouched
                              · closeout: audits/P7_1_6_AUTO_SAVE_CAS_PRODUCTION_CLOSEOUT.md
PHASE 7.1.5 SHELL POLISH      = CLOSED / PRODUCTION GREEN @ 3fccbf7 (ancestry · do not reopen)
                              · closeout: audits/P7_1_5_SHELL_POLISH_PRODUCTION_CLOSEOUT.md
PHASE 7.1.4 MIXER DOCK        = CLOSED / PRODUCTION GREEN @ 9abc1b6 (ancestry · do not reopen)
                              · freeze: decisions/P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md
                              · closeout: audits/P7_1_4_MIXER_DOCK_PRODUCTION_CLOSEOUT.md
PHASE 7.1.3 INSPECTOR IA      = CLOSED / PRODUCTION GREEN @ 8f6eeca (do not reopen)
POST-RECORDING V1             = PRODUCTION VERIFIED — GREEN · CLOSED @ 56b629e (ancestry)
P6.7                          = PRODUCTION VERIFIED — GREEN · CLOSED @ 06c60b5 (ancestry)
P6.6                          = PRODUCTION VERIFIED — GREEN @ c825e42 (ancestry)
P6.5 Scenario A               = PASS / PROVEN · Scenario B BLOCKED / INCONCLUSIVE · DO NOT REOPEN

CATALOG                       = GREEN · 17 PLATFORM PUBLISHED · public ↔ admin MATCH
STORAGE beat-audio            = GREEN · 17 platform · orphans 0
STORAGE take-audio            = KEEP Dawid objects retained · test-user Storage cleaned in PHASE 3
SECURITY                      = GREEN · GET /api/studio/projects → 401 unauth
                              · studio_cas_* anon/authenticated DENIED · service_role ALLOWED
MOBILE                        = TECHNICALLY READY — DEVICE CERTIFICATION PENDING
                              · automated/emulated PASS · no physical iPhone/Android
                              · VoiceOver/TalkBack NOT physically verified
                              · NOT “REAL DEVICE VERIFIED”
P0 / P1                       = 0 / 0
P2                            = 2 (waveform sticky/catalog · Studio toolbar ~28px)
P3                            = 5 (account inputs ~38px · Pełny katalog · landscape · playhead · metadata —)
P6.8                          = NOT STARTED · OWNER DECISION REQUIRED
PHASE 7.1.6                   = CLOSED / PRODUCTION VERIFIED — GREEN @ 4fa658d (ancestry)
PHASE 7.1.5                   = CLOSED / PRODUCTION VERIFIED — GREEN @ 3fccbf7 (ancestry)
CURRENT PHASE                 = Studio Visual Parity V2 CLOSED / GREEN @ 44f7cbd
                              · repo tip d515f3b · aliases dpl_56FGH… · Vercel SHA NOT VERIFIED
NEXT GATE                     = STOP — OWNER DECISION REQUIRED
                              · V2 CLOSED · follow-ups NON-BLOCKING
                              · do NOT auto-open EPIC / invent Phase 7.1.7
                              · do NOT start P6.8 / P4 live-verify seam / SA-07 AWS / payments
                              · do NOT permanently enable Contabo without Owner GO
                              · no Automation / Autotune / E3 Studio Render

CURRENT PRODUCTION USER STATE = PHASE 3 CLEANUP COMPLETE / GREEN
  auth.users / profiles       = 1 / 1
  Owner                       = Dawid · user_number 1 · ADMIN
                              · UUID fdf04726-e971-42a7-9d46-8b9bdd099c23
  next registration           = user_number 2
                              · seq last_value=1 · is_called=true
  HISTORY                     = 421 test accounts deleted (PRE-CLEANUP 422)
                              · PRE-CLEANUP seq last_value=2038 (HISTORY only)
  sequence reset              = ONE-TIME OWNER-APPROVED · DO NOT REPEAT
  standing contract           = normal DELETE ≠ reuse user_number
                              · DO NOT delete Dawid · DO NOT re-setval without new Owner GO

P4 CORE (eligibility foundation) = SHIPPED @ bface6c ⊂ 4fa658d (via 836679a / a72fed9 / 9abc1b6 / 3fccbf7 ancestry)
P4.6 TAKE_EXPORT              = CLOSED / PRODUCTION VERIFIED / LIVE E2E VERIFIED / GREEN @ a72fed9 (ancestry)
                              · Contabo STOPPED / DISABLED after LIVE E2E
                              · evidence: audits/P4_6_PRODUCTION_CLOSEOUT.md
P4 LOCAL WIP (context? + p4-live-verify) = LOCAL ONLY · NOT PRODUCTION · NOT BASELINE
SA-07 Architecture            = DESIGN FREEZE COMPLETE · AWS BLOCKED · FUTURE / DEFERRED
SA-07 local untracked code/migration = NOT PRODUCTION · NOT APPLIED

P6.7 DB MIGRATIONS (historical applied) = 20261007061035 · 20261007061049
V1 DB MIGRATIONS (historical applied)   = 20261007080752 · 20261007080758 · 20261007080800
KNOWN WAIVER                  = e3-7-f-download-authz / EXPORT_WAV · WAIVED BY OWNER
BRANCH                        = main
SUPABASE PROJECT              = rzzxrgcdogkybkiidqgw
WORKER                        = Contabo EXTERNAL · STOPPED / DISABLED after P4.6 LIVE E2E
                              · capability GREEN · not always-on
                              · host tree historically 836679a+phase1 (bootstrap 92496d4)

STUDIO P5.1–P5.6              = PRODUCTION VERIFIED — GREEN
P5.8 STATUS                   = PRODUCTION VERIFIED — GREEN @ 95e04ff · finalize ≠ place preserved
P5.10 STATUS                  = PRODUCTION VERIFIED — GREEN @ 9c2a958 · StudioAudioEngine shipped
P6.1 STATUS                   = COMPLETE · RPC hotfix 57ef69e
P6.2 STATUS                   = PRODUCTION VERIFIED — GREEN @ 23d3be8
P6.3 STATUS                   = PRODUCTION VERIFIED — GREEN @ 350303e
P6.4.1 STATUS                 = PRODUCTION VERIFIED — GREEN @ 9f93606
P6.4.2 STATUS                 = PRODUCTION VERIFIED — GREEN @ 320907a
P6.4.3 STATUS                 = PRODUCTION VERIFIED — GREEN @ f261ea8
P6.5 STATUS                   = IMPLEMENTATION COMPLETE · DEPLOYED
                              · SCENARIO A PROVEN · SCENARIO B BLOCKED / INCONCLUSIVE
                              · DO NOT REOPEN Scenario B · not reclassified as GREEN
P6.6 STATUS                   = PRODUCTION VERIFIED — GREEN @ c825e42
FALA 3.5.1 STATUS             = CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN @ c690831
P3 STATUS                     = COMPLETE / PRODUCTION VERIFIED — GREEN @ dabbc936 · UNCHANGED
P3 FOLLOW-UP                  = p_take_id hardening · NON-BLOCKING
```

### CURRENT STATUS (closed / verified)

| Track | Status |
|-------|--------|
| **Phase 7.1.6** Auto Save + CAS Completeness | **CLOSED / PRODUCTION VERIFIED — GREEN** @ `4fa658d` / `dpl_6saiDX4bSbwWp7U7S2QLRMcGLEcy` · feature `89ee919` · correction `4fa658d` · Persist Orchestrator · CAS wiring · interactive mutations NOT SAFELY MUTATED — [closeout](./audits/P7_1_6_AUTO_SAVE_CAS_PRODUCTION_CLOSEOUT.md) |
| **Phase 7.1.5** Shell Polish + Stacked Escape | **CLOSED / PRODUCTION VERIFIED — GREEN** @ `3fccbf7` (ancestry) / `dpl_2E7JrvusAzAG8bsXydpqNJ36k6JR` · feature `f891bce` · Escape fix `3fccbf7` · Escape#1 FxSheet / Escape#2 Mixer — [closeout](./audits/P7_1_5_SHELL_POLISH_PRODUCTION_CLOSEOUT.md) |
| **Phase 7.1.4** Mixer Dock | **CLOSED / PRODUCTION VERIFIED — GREEN** @ `9abc1b6` (ancestry) · OD-P7.1.4-01…04=A — [freeze](./decisions/P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md) · [closeout](./audits/P7_1_4_MIXER_DOCK_PRODUCTION_CLOSEOUT.md) |
| **Phase 7.1.3** Inspector IA | **CLOSED / PRODUCTION GREEN** @ `8f6eeca` (ancestry · do not reopen) |
| **P4.6** TAKE_EXPORT | **CLOSED / PRODUCTION VERIFIED / LIVE E2E VERIFIED / GREEN** @ `a72fed9` (ancestry) / `dpl_8PDy…` · Contabo STOPPED after E2E — [closeout](./audits/P4_6_PRODUCTION_CLOSEOUT.md) |
| **P6.7** Clip Fades | **PRODUCTION VERIFIED — GREEN · CLOSED** @ `06c60b5` · docs on `origin/main` · dpl `dpl_CpGUtwjDbvXdJ8oEuDyDFjQ1UgNp` · Vitest **1519 PASS · 1 SKIP** · P6.7.1–P6.7.4 + Trim/Split — [freeze](./decisions/P6_7_CLIP_FADES_DESIGN_FREEZE.md) · [audit](./architecture/P6_7_CLIP_FADES_ARCHITECTURE_AUDIT.md) |
| **P6.6** On-demand Track Peak Metering | **PRODUCTION VERIFIED — GREEN** @ `c825e42` · dpl `dpl_3s3fAnvrpNVSwJcdhV8J1SZtc9g9` · P6.6.1 `a8a3337` · P6.6.2/3 `c825e42` · Vitest **1410 PASS · 1 SKIP** |
| **P6.5** Studio Audio Quality Metering | **IMPLEMENTATION COMPLETE · PRODUCTION DEPLOYED** @ `2258bdb` · **Scenario A PROVEN** · **Scenario B BLOCKED / INCONCLUSIVE** (not GREEN · **do not reopen**) |
| **P6.4.3** Mix UX polish & integration | **PRODUCTION VERIFIED — GREEN** @ `f261ea8` · dpl `dpl_5ZBCGED…` |
| **P6.4.2** Shared FX UI Foundation | **PRODUCTION VERIFIED — GREEN** @ `320907a` · dpl `dpl_HrDh4nw…` |
| **P6.4.1** Master Gain/Pan + Track documentVersion | **PRODUCTION VERIFIED — GREEN** @ `9f93606` · dpl `dpl_EHkvay…` |
| **P6.3** Master FX graph | **PRODUCTION VERIFIED — GREEN** @ `350303e` |
| **P6.2** Track FX graph | **PRODUCTION VERIFIED — GREEN** @ `23d3be8` |
| **P6.1** FX persist / CAS | **COMPLETE** · RPC hotfix `57ef69e` |
| **P5.10** Studio Audio Engine / Multi-Source | **PRODUCTION VERIFIED — GREEN** @ `9c2a958` · dpl `dpl_L7pB5A8…` |
| **P5.8** Studio Devices / Input Foundation | **PRODUCTION VERIFIED — GREEN** @ `95e04ff` · dpl `dpl_2RhUDg…` |
| **P5.1–P5.6** Studio units | **PRODUCTION VERIFIED — GREEN** |
| **D02** live harness | **CLOSED** @ `44dc22c` (**TEST ONLY**) |
| **P5.9** Architecture Audit | **COMPLETE — GO WITH CONDITIONS** |
| **P5.7** Architecture Audit | **COMPLETE — GO WITH CONDITIONS** |
| **Fala 3.5.1** Recording Experience | **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** @ `c690831` |
| **P3** Anonymous → Account Claim | **COMPLETE / PRODUCTION VERIFIED — GREEN** @ `dabbc936` · **UNCHANGED** |
| **POLISH-01** (+ residual hotfix) | **CLOSED / PRODUCTION VERIFIED** @ `579acb3` → residual `1c63080` |
| **P0** PLATFORM master download deny | **CLOSED / PRODUCTION VERIFIED** @ `fdfff71` |
| **P1** Sample Policy Matrix | **CLOSED / PRODUCTION VERIFIED** @ `5927e35` |
| **P2** Explicit Sample Replace | **CLOSED / PRODUCTION VERIFIED** @ `943d81e` |
| **BPM** (+ real beats / corrections) | **CLOSED / PRODUCTION VERIFIED** |
| **ARCH-05** orphan GC | **CLOSED / VERIFIED** · live Storage **11 / 8 / 3 / 0 / 0** |
| **USER-ID-01** | **CLOSED / PRODUCTION VERIFIED** · post–PHASE 3 · users=`1` · Dawid=`1`/ADMIN · next=`2` · one-time seq reset documented · delete ≠ reuse |
| **ADMIN W0–W4** | **CLOSED / PRODUCTION VERIFIED** |
| **Recording Waves 1–5 / D02** | **CLOSED / PRODUCTION VERIFIED** |
| **E3 Full Audio** | **PRODUCTION VERIFIED — GREEN** (Premium HQ/WAV E2E: see waiver) |
| **FAR-01** | **SOAK COMPLETE / CONTAMINATED** · retirement **NOT EXECUTED** · **NOT CLOSED** (ops — nie NEXT product gate) |

**Historyczne tipy** (`dabbc936` as feature tip, `1c63080`, `e03f3be`, `ddcee65`, `ffe723b`, `4e33e8d`, …) = **HISTORYCZNE / FEATURE RELEASE** — nie mylić z verify baseline `75bd80f`.

**Planes (never merge):**

| Plane | Current tip / state |
|-------|---------------------|
| Repository HEAD / origin/main | **`d515f3b`** · verify `git rev-parse HEAD` / `origin/main` |
| App feature commit (V2) | **`44f7cbd`** · Studio Visual Parity V2 · **GREEN / RELEASE VERIFIED / CLOSED** |
| Production deployment (observed) | **`dpl_56FGHZNNdfgZ9k2qsLGHDRD4QcX6`** · READY · www + apex · observed 2026-10-09 06:08:59 +02:00 |
| Production Git SHA (Vercel meta) | **NOT VERIFIED** |
| GH deploy correlation (auxiliary) | `6952679578` → `d515f3b` · not equal to Vercel meta SHA |
| V2 verify deploy (HISTORY) | `dpl_2ymzMb24QtrYxWBJWmdufeTaTqkR` @ `44f7cbd` · superseded for live aliases |
| Prior alias binding (HISTORY) | `dpl_FVcx…` @ `3a086ad` · then `4fa658d` / `dpl_6sai…` (ancestry) |
| Production DB | includes P7.1.6 CAS completeness (`20261008192141`) + P6.7 + V1 CAS RPCs + P3 claim + P1/P2 · verify remote before DB work |
| Production Storage | beat-audio **17** platform · orphans **0** · take-audio KEEP Dawid retained · test-user Storage cleaned (PHASE 3) · historical VPS/Local backup evidence retained |
| Session / operator | dirty local WIP may exist (Sacred WIP · P4 seam · SA-07 untracked · docs audits) — **nie czyścić / nie commitować bez Owner GO** · verify Sacred WIP SHA before/after any session |

**Primary continuity:** [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [PROJECT_STATE.md](./PROJECT_STATE.md)
**Reuse / DO NOT DUPLICATE:** [architecture/REUSE_SSOT_MAP.md](./architecture/REUSE_SSOT_MAP.md)

---

## 0A. HOW TO START WORK ON BITRYMDYM (Cold Start Contract)

```text
1.  READ this FINAL_COLD_START_HANDOFF
2.  READ MASTER_HANDOFF.md
3.  READ PROJECT_STATE.md
4.  READ architecture/README.md + architecture/REUSE_SSOT_MAP.md
5.  READ decisions/DECISION_LOG.md + decisions/OPEN_DECISIONS.md
6.  READ CHANGELOG.md (recent tip) + relevant phase audit/closeout only if needed
7.  CHECK: git rev-parse HEAD  AND  git rev-parse origin/main
8.  CHECK: REPO HEAD = d515f3b · aliases dpl_56FGHZNNdfgZ9k2qsLGHDRD4QcX6 · Vercel SHA NOT VERIFIED
         APP FEATURE V2 = 44f7cbd · V2 verify history dpl_2ymz… (not current alias binding)
9.  CHECK: git status --short  → dirty tree may exist · DO NOT clean/stash/reset
10. CHECK Sacred WIP fingerprint:
         src/lib/takes/recording-eligibility-service.ts
         SHA256 = 5AE4C2311704DCDAE51CE36D8E69E1CA162F0C55AB14866EB30E73DC50EEECB9

BEFORE ANY IMPLEMENTATION:
  SEARCH EXISTING CODE FIRST
  → identify SSOT / service / route / RPC / component / state owner / persistence path / tests
  → REUSE
  → AUDIT → REPORT → wait for Owner GO
  → never invent second orchestrator / engine / player / CAS / selection store
```

---

## 0B. DO NOT DUPLICATE (summary)

Full map: [architecture/REUSE_SSOT_MAP.md](./architecture/REUSE_SSOT_MAP.md)

```text
Studio audio SSOT     = StudioAudioEngine (transport provider only) · 1 AudioContext
Catalog player        = PlayerProvider · NEVER inside Studio editor
E3                    = separate Mix/Master/Render plane · Contabo EXTERNAL compute
Studio selection      = studio-editor.tsx state (selectedTrackId / selectedClipId / docRef)
Persistence           = StudioPersistOrchestrator ONLY
CAS                   = document_version + studio_cas_* (service_role) + expectedDocumentVersion
FX / Track / Clip     = studio-service + existing /api/studio/** routes via orchestrator
Recording eligibility = recording-eligibility-service.ts (Sacred WIP — do not rewrite)
Durable media         = Supabase Storage
AuthZ                 = requireUser + server ownership · never client-trusted
```

---

## 0C. Sacred WIP

```text
FILE     = src/lib/takes/recording-eligibility-service.ts
SHA256   = 5AE4C2311704DCDAE51CE36D8E69E1CA162F0C55AB14866EB30E73DC50EEECB9
STATUS   = LOCAL DIRTY WIP · not production tip · not cleanup target
FORBIDDEN = git reset / restore / checkout -- / clean / stash of this WIP without Owner GO
```

---

## 1. Mandatory reading order (new agent)

1. **This file** (incl. §0A–0C)
2. [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)
3. [PROJECT_STATE.md](./PROJECT_STATE.md)
4. [architecture/REUSE_SSOT_MAP.md](./architecture/REUSE_SSOT_MAP.md) · [architecture/README.md](./architecture/README.md)
5. [ssot/MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md)
6. [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md)
7. [architecture/AUTHORIZATION.md](./architecture/AUTHORIZATION.md) · [architecture/RECORDING.md](./architecture/RECORDING.md)
8. [decisions/OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md) · [decisions/DECISION_LOG.md](./decisions/DECISION_LOG.md)
9. [CHANGELOG.md](./CHANGELOG.md)
10. Relevant audit/closeout **only** when Owner selects that surface

**Before any implementation:** SEARCH EXISTING → AUDIT → REPORT → wait for **Owner GO**.

Repo root: [AGENTS.md](../AGENTS.md) — Next.js w tym repo może różnić się od training data.

---

## 2. Czym jest BitRymDym

| Item | Value |
|------|--------|
| Produkt | Platforma muzyczna (odsłuch, pobieranie, nagrania Quick Take, community upload) |
| Brand | Własna tożsamość muzyczna — **nie** generyczny AI SaaS UI (SSOT §2) |
| Stack | Next.js (App Router) · TypeScript · Tailwind · shadcn base · Supabase · Vercel · Contabo EXTERNAL compute |
| Auth roles (enum) | `USER` · `MODERATOR` · `ADMIN` (UI: Administrator) |
| Account levels | `BEGINNER_RAPPER` · `PRO_RAPPER` · `LEGEND_RAPPER` (**≠** Premium) |
| Premium tiers | Free · Bronze · Silver · Gold (**KEEP EN** · **≠** Role / Account Level / Rank) |

---

## 3. Architecture map (Hybrid C)

```text
BROWSER
  → Vercel / Next.js
       Auth · AuthZ · API · Access Gate · Mix orchestration · signed URL issuance
  → Supabase PostgreSQL
       metadata SSOT · RLS · entitlements · jobs · artifacts rows
  → Supabase Storage = DURABLE MEDIA SSOT (ONLY durable media V1)
       beat-audio · take-audio · audio-artifacts  (PRIVATE)
  → Contabo VPS = EXTERNAL COMPUTE
       FFmpeg / ephemeral processing
       NOT library · NOT durable media · NOT backup · NOT audio SSOT
       worker unit STOPPED / DISABLED after P4.6 LIVE E2E (capability GREEN · not always-on · host historically 836679a+phase1)
```

STORAGE-ARCH-01 = **LOCKED**. External Object Storage = **NOT IMPLEMENTED / DEFERRED**.

---

## 4. Capability matrix (living)

| Capability | Status |
|------------|--------|
| Public catalog / beat detail / playback / signed playback | PRODUCTION VERIFIED |
| Account / takes / beats / upload / moderation / admin | PRODUCTION VERIFIED |
| Recording Waves 1–5 / Quick Take / anonymous QT | PRODUCTION VERIFIED |
| Shared grants → RECORD only | PRODUCTION VERIFIED |
| E3 Mix / Master / Render / Export / Basic MP3 / PUBLIC_AUDIO | PRODUCTION VERIFIED — GREEN |
| P0 PLATFORM master download deny | **CLOSED / PRODUCTION VERIFIED** |
| P1 Sample Policy | **CLOSED / PRODUCTION VERIFIED** |
| P2 Explicit Sample Replace | **CLOSED / PRODUCTION VERIFIED** |
| POLISH-01 (+ residual) | **CLOSED / PRODUCTION VERIFIED** |
| BPM / real beats import + corrections | **CLOSED / PRODUCTION VERIFIED** |
| USER-ID-01 / ACCOUNT-PROFILE-01 | PRODUCTION VERIFIED · users=1 · Dawid=1/ADMIN · next=2 · PHASE 3 cleanup GREEN · delete ≠ reuse |
| ADMIN W0–W4 | PRODUCTION VERIFIED |
| Premium HQ/WAV export capability assert | **KNOWN WAIVER** (`EXPORT_WAV`) — PRE-EXISTING / WAIVED |
| FAR-01 campaign | SOAK COMPLETE / CONTAMINATED · **NOT CLOSED** |
| Messaging / comments / voting / payments / STEMS / Premium catalog | DEFERRED |
| External Object Storage | NOT IMPLEMENTED / DEFERRED |
| **P3 Anonymous → Account Claim** | **COMPLETE / PRODUCTION VERIFIED — GREEN** @ `dabbc936` · **UNCHANGED** |
| **Fala 3.5.1 Recording Experience** | **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** @ `c690831` · verify `75bd80f` |
| **Studio P5.1–P5.6 / P5.8 / P5.10** | **PRODUCTION VERIFIED — GREEN** @ `9c2a958` · engine + devices + take workflow · **not a full DAW** |
| **P6.1–P6.4.3 / P6.6 / P6.7** | **PRODUCTION VERIFIED — GREEN** · P6.7 @ `06c60b5` · P6.6 @ `c825e42` · FX / Mix / Master / Track Peak / Clip Fades · P6.5 Scenario B **BLOCKED / INCONCLUSIVE** |
| **Phase 7.1.6 Auto Save + CAS** | **CLOSED / PRODUCTION VERIFIED — GREEN** @ `4fa658d` · Persist Orchestrator · CAS completeness |
| **P5.7 / P5.9** Architecture Audits | **GO WITH CONDITIONS** (audit · not impl) · H2 Auto Save **SHIPPED** via 7.1.6 |

---

## 5. Backup / DR (krótko)

```text
Local Layer-2 path     = C:\BitRymDym-Backup\
Full backup            = local-layer2-full-20261005T040146Z-42d6212b
Inventory              = 43/43 (USER 8 · PLATFORM 3 · ORPHAN 32 historical)
Restore drill          = local-restore-20261005T040831Z-76ca3678
Restore                = 43/43 · SHA/size/WAV/ffprobe/manifests PASS
VPS Layer-1            = 43/43 BACKED UP (staging · Contabo ≠ durable SSOT)
Live production Storage after ARCH-05 = 11 / 8 / 3 / 0 / 0
Backup ≠ Storage SSOT ≠ VPS
```

Szczegóły: [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [PROJECT_STATE.md](./PROJECT_STATE.md) · STORAGE_ARCH_07 audits.

---

## 6. Security / known waiver

| Item | Status |
|------|--------|
| DEF-01 | CLOSED / PRODUCTION VERIFIED |
| ACTIVE product P0/P1 (security) | NONE VERIFIED as open blockers |
| HIBP | DEFERRED / ACCEPTED RISK |
| `e3-7-f` / `EXPORT_WAV` | **PRE-EXISTING / OUT OF SCOPE / WAIVED BY OWNER** |

Secrets: **NIGDY** commit / print / stage.

---

## 7. Cursor / Agent operating rules

**SSOT FIRST · REUSE FIRST · ZERO DUPLICATE LOGIC · SERVER AUTHORIZATION · PRIVATE AUDIO · DOCUMENTATION CONTINUITY**

```text
AUDIT → RCA → PLAN → DESIGN FREEZE → ARCH REVIEW → OWNER GO
→ IMPLEMENT → BUILD → TEST → OWNER VERIFY → COMMIT → PUSH
→ PRODUCTION DEPLOY → PRODUCTION VERIFY → POST RELEASE → CLOSE
```

Git:

- **Nigdy** `git add .` / `git add -A` / `git add -u`
- Exact allowlist only
- **Nie stage'uj:** `.agents/` · `.cursor/` · `skills-lock.json` · `infra/oracle/` · `.env*` · secrets · backup artifacts · niezamierzone WIP

Dirty worktree: **nie czyść** bez Owner GO.

---

## 8. P3 COMPLETE — PRODUCTION VERIFIED GREEN (canonical handoff)

**P3 — Anonymous Take → Account Claim**
**Status:** **COMPLETE / PRODUCTION VERIFIED — GREEN**
**SHA:** `dabbc93695c14609095db90b581e65ceaf221611`
**Deploy:** `dpl_Hd4QAwDkkw99FMiFhh8nJ1N6nvsR` · https://www.bitrymdym.pl

```text
Architecture:
  Anonymous READY → auth session → tryClaimAnonTakeAfterAuth
  → Premium Tier getSamplePolicy (TTL/cap)
  → Storage COPY anon/.../mic.bin → claim_anon_take_to_account
  → ownership XOR transfer → user/.../mic.bin
  → DELETE source → clear brd_tk_aid (CLAIM_OK / IDEMPOTENT_REPLAY only)
  → /account?claim=...

Security invariants:
  Ownership XOR · take-audio private · RPC service_role-only
  READY-only · latest · cookie-bound · cap DENY · fail-open auth
  token/hash not logged

Verification:
  Deployment/migration/RPC/Storage/ownership/idempotency/CAP/D02·P2/runtime = PASS
  Fixture cleanup PASS (allowlisted IDs only)

Cookie production:
  clear = CODE-VERIFIED
  full disposable E2E = NOT EXECUTED
  (no safe disposable production recording + guaranteed cleanup)

Follow-up (NON-BLOCKING):
  optional p_take_id RPC binding — do NOT implement without Owner GO
```

Architecture detail: [architecture/RECORDING.md](./architecture/RECORDING.md) · decisions: OD-P3-01…11 in [DECISION_LOG.md](./decisions/DECISION_LOG.md).

---

## 8b. Fala 3.5.1 — PRODUCTION VERIFIED GREEN (canonical)

**Fala 3.5.1 — Recording Experience + Dual Audio Timeline**
**Status:** **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN**
**Feature:** `c690831`
**Verify baseline:** `75bd80f` · https://www.bitrymdym.pl
**Production app:** `dabbc936` · **no redeploy** this wave (already in ancestry)

```text
DESIGN FREEZE           = GO
IMPLEMENTATION          = ALREADY SHIPPED
PRODUCTION VERIFICATION = PASS (D-V matrix)
PRODUCTION              = GREEN
STATUS                  = CLOSED

Historical Plan Baseline:
  42369c0

Actual Production Verification Baseline:
  75bd80f

Reason:
  production/repository tip advanced after subsequent docs-only reconciliation/deploy lineage.

Findings (non-blocking):
  F351-V-01 LOW — first automated REC generic error · retry succeeded · no micro-patch
  F351-V-02 FALSE POSITIVE / NOT REPRODUCED — sticky-nav intercept = tooling artifact

Regression:
  P1 UNCHANGED · P2 UNCHANGED · P3 UNCHANGED
  No security blocker · No Storage/Auth/RLS changes
```

Plan: [D_FALA_351_PRODUCTION_VERIFY_PLAN.md](./audits/D_FALA_351_PRODUCTION_VERIFY_PLAN.md) · Architecture: [architecture/RECORDING.md](./architecture/RECORDING.md)

---

## 8c. P5.8 — PRODUCTION VERIFIED GREEN (canonical)

**P5.8 — Studio Devices / Input & Device Foundation**
**Status:** **PRODUCTION VERIFIED — GREEN**
**Application SHA:** `95e04ff534d58de3476e3a2dc620a13fbcacb7ba`
**Final deployment:** `dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S` · https://www.bitrymdym.pl
**Freeze:** [P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md](./decisions/P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md)

```text
DESIGN FREEZE           = GO
IMPLEMENTATION          = COMPLETE
PRODUCTION VERIFICATION = PASS
PRODUCTION              = GREEN
OPEN DECISIONS          = NONE

Studio capability (current):
  Project · beat · transport · timeline · MOVE/TRIM/SPLIT · delete clips
  Record Take · Preview · Keep · Discard · Record again · explicit place · multi-Takes
  Mic select · permission · input monitor · stale fallback · mobile
  = production-ready Studio foundation/editor/recording workflow
  ≠ full DAW

Contracts preserved:
  StudioTransport != PlayerProvider
  finalize ≠ place
  Device state ≠ recording state
  Persistence = localStorage bitrymdym.studio.selectedAudioInputDeviceId (not Profile/Project/DB)

Deployment incident (release note):
  Initial deploy claimed 95e04ff but served pre-P5.8 Studio JS
  Root cause = stale Vercel build cache
  Recovery = redeploy without build cache → dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S
  Lesson = verify served artifact for critical UI changes

P6 readiness (as of P5.8 closeout — superseded living by P5.10 §8d):
  FX / mix / master = READY WITH REFACTOR (needed StudioAudioEngine)
  Automation / Autotune = NOT READY
P7 readiness:
  track enum reserved = READY WITH REFACTOR
  instrument engines = NOT READY
```

---

## 8d. P5.10 — PRODUCTION VERIFIED GREEN (canonical)

**P5.10 — Studio Audio Engine / Multi-Source Playback Foundation**
**Status:** **PRODUCTION VERIFIED — GREEN**
**Application SHA:** `9c2a958cf94aca07679ed338cc23e21bb600fd4c`
**Final deployment:** `dpl_L7pB5A8iuY8CKipxbLsGEVLESZTC` · https://www.bitrymdym.pl
**Freeze:** [P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md](./decisions/P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md) @ `e191f5c`
**Implementation:** same SHA as production (`9c2a958`)

```text
DESIGN FREEZE           = GO WITH CONDITIONS
IMPLEMENTATION          = COMPLETE
PRODUCTION VERIFICATION = PASS
PRODUCTION              = GREEN
OPEN DECISIONS          = NONE (next unit = Architecture Audit)

StudioAudioEngine:
  one engine per Studio editor
  AudioContext · Track graph · Master graph · scheduling · source lifecycle

Multi-source:
  production scheduler = planVoicesAtPlayhead (all audible Clips)
  Beat + Take · Take + Take · Beat + many Takes

Overlap:
  MIX (not first-wins)
  pickTakeClipAtPlayhead is NOT the Studio transport path

Clock:
  persist/UI = integer ms
  runtime    = AudioContext.currentTime + epoch
  PLAY/SEEK  = shared clock
  STOP       = playhead 0 (existing FSM)

Track graph (canonical):
  Voice → Clip gain → Track gain/pan → Master gain/pan → destination
  gain / mute / solo / pan consumed by Web Audio graph
  solo = isTrackAudible · gain = gainDbToLinearVolume · pan = normalizePan
  HTMLAudioElement.volume ≠ Studio mix SSOT

PlayerProvider:
  separate system · Studio timeline audio does not use it
  Studio still applies PlayerProvider suppression
  production served JS does not contain PlayerProvider on Studio playback path

E3 Mix:
  untouched · StudioAudioEngine does not import MixPanel
  no E3 Mix migration
  two Web Audio product surfaces OK (not two Studio engines)

Recording:
  P5.10 did NOT take over session / eligibility / finalize / upload / claim /
  getUserMedia / device selection / input meter
  P5.5 / P5.6 / P5.8 remain recording SSOT
  engine may consume READY Take as playback source

Security:
  no ownerId / objectKey in engine
  beat access = requestBeatAudioAccessAction
  Take preview = POST /api/takes/preview
  existing ownership/security boundaries remain SSOT
  Live IDOR was not rerun in this gate (inherited limitation)

Served-JS / cache:
  chunk 0p8mql3sjqfx_.js
  YES = StudioAudioEngine · AUDIO_SYNC_FAILED · createMediaElementSource · createStereoPanner
  NO  = pickTakeClipAtPlayhead · takeAudioRef
  HTML = no-store / MISS
  Skipping build cache
  GitHub commit = deployment = served bundle
  (protection against repeating the P5.8 stale-build incident)

Tests:
  187 unit · P5.10 = 19 · typecheck PASS · P5.10 lint PASS · build PASS
  repo-wide lint has pre-existing errors outside P5.10 (mix-panel · beat-detail · scripts/WIP)
  those are NOT P5.10 regressions

KNOWN VERIFICATION LIMITATION:
  Production Beat PLAY/PAUSE/STOP worked · playhead moved · STOP → 00:00.000
  One parallel TAKE fixture returned "Nie udało się odtworzyć nagrania"
  Beat continued · live overlap of two healthy Takes A+B was not executed on that fixture
  Multi-source scheduling / overlap mixing / engine behavior covered by unit/integration tests
  Not a P5.10 blocker — Production Gate formally GREEN

DB / API / RPC / Storage / recording architecture = UNCHANGED
WIP preserved
```

---

## 9. Absolute prohibitions without Owner GO

- Runtime / AuthZ / DB / Storage / migration mutate
- P3 `p_take_id` hardening (non-blocking backlog — not auto-start)
- EXPORT_WAV „fix”
- Reopen zamkniętych epików bez nowego evidence (incl. Fala 3.5.1 / P3)
- Traktowanie Contabo jako durable media / backup SSOT
- Stage agent/infra/secrets residue
- `git add .` / `-A` / `-u`

---

## 10. Cold-start checklist

```text
[ ] git fetch && git rev-parse HEAD           → d515f3b · match origin/main
[ ] git rev-parse origin/main                → match HEAD = d515f3b
[ ] Confirm aliases www+apex → dpl_56FGHZNNdfgZ9k2qsLGHDRD4QcX6 · READY · Vercel SHA NOT VERIFIED
[ ] Confirm APP FEATURE V2 = 44f7cbd · GREEN / CLOSED · verify history dpl_2ymz… (not live alias)
[ ] Confirm Catalog 17 PLATFORM · Storage orphans 0 · Security 401 + CAS ACL
[ ] Confirm Mobile = TECHNICALLY READY — DEVICE CERTIFICATION PENDING (not Real Device Verified)
[ ] Confirm Contabo worker = STOPPED / DISABLED · P4.6 LIVE E2E VERIFIED
[ ] Confirm Closed = Studio Visual Parity V2 · GREEN / RELEASE VERIFIED / CLOSED @ 44f7cbd
[ ] Confirm Phase 7.1.6 / 7.1.5 / 7.1.4 / 7.1.3 remain CLOSED (ancestry · do not reopen)
[ ] Read MASTER_HANDOFF + PROJECT_STATE + architecture/REUSE_SSOT_MAP + V2 freeze
[ ] Confirm Sacred WIP SHA256 = 5AE4C2311704DCDAE51CE36D8E69E1CA162F0C55AB14866EB30E73DC50EEECB9
[ ] P5.1–P5.6 / P5.8 / P5.10 GREEN · P6.1–P6.4.3 / P6.6 / P6.7 GREEN · V1 GREEN · P6.5 Scenario B BLOCKED
[ ] NEXT GATE = STOP — OWNER DECISION REQUIRED (no auto EPIC / P6.8 / payments)
[ ] Do not reimplement Auto Save/CAS/engine/player · do not reopen V2 / 7.1.6 / 7.1.5 / 7.1.4 / 7.1.3 / P6.6 / P6.5 Scenario B
[ ] Do not invent Phase 7.1.7 scope without Owner GO
[ ] Do not commit P4 context? WIP / SA-07 untracked library / Sacred WIP without Owner GO
[ ] SEARCH EXISTING FIRST · REUSE · no second SSOT
[ ] Nie reopen closed epics bez nowego evidence
[ ] Nie czyść dirty WIP bez Owner GO
[ ] AUDIT FIRST → report → wait for Owner GO (no auto-start)
```

---

## 11. Handoff stamp

```text
FINAL COLD START HANDOFF     = READY (PHASE 4 DUAL-PLANE SSOT · V2 GREEN/CLOSED · 2026-10-09)
REUSE / DO NOT DUPLICATE     = architecture/REUSE_SSOT_MAP.md
REPOSITORY HEAD / origin/main = d515f3b (verify git rev-parse HEAD)
APP FEATURE COMMIT (V2)      = 44f7cbd · GREEN / RELEASE VERIFIED / CLOSED
PRODUCTION DEPLOYMENT (obs.) = dpl_56FGHZNNdfgZ9k2qsLGHDRD4QcX6 · READY · www + apex
PRODUCTION GIT SHA (Vercel)  = NOT VERIFIED
GH DEPLOY CORRELATION (aux.) = 6952679578 → d515f3b
V2 VERIFY DEPLOY (HISTORY)   = dpl_2ymzMb24QtrYxWBJWmdufeTaTqkR @ 44f7cbd
NOTE                         = Repo tip d515f3b ≠ feature V2 44f7cbd ≠ Vercel-meta SHA (unknown)
PREVIOUS PRODUCTION TIP      = 3a086ad / dpl_FVcx… · 44f7cbd / dpl_2ymz… · 4fa658d · HISTORY
CATALOG / STORAGE            = 17 PLATFORM · beat-audio orphans 0 · take-audio KEEP Dawid retained (PHASE 3 cleaned test-user Storage)
SECURITY                     = GREEN
MOBILE                       = TECHNICALLY READY — DEVICE CERTIFICATION PENDING
P0 / P1 / P2 / P3            = 0 / 0 / 2 / 5
STUDIO VISUAL PARITY V2      = GREEN / RELEASE VERIFIED / CLOSED @ 44f7cbd
PHASE 7.1.6 AUTO SAVE + CAS  = CLOSED / PRODUCTION VERIFIED — GREEN @ 4fa658d (ancestry)
PHASE 7.1.5 SHELL POLISH     = CLOSED / GREEN @ 3fccbf7 (ancestry · do not reopen)
PHASE 7.1.4 MIXER DOCK       = CLOSED / GREEN @ 9abc1b6 (ancestry · do not reopen)
PHASE 7.1.3 INSPECTOR IA     = CLOSED / GREEN @ 8f6eeca (do not reopen)
P4.6 TAKE_EXPORT             = CLOSED / GREEN @ a72fed9 (ancestry)
P6.7                         = CLOSED / GREEN (ancestry 06c60b5)
V1                           = CLOSED / GREEN (ancestry 56b629e)
P6.8                         = NOT STARTED · OWNER DECISION REQUIRED
CURRENT PHASE                = Studio Visual Parity V2 CLOSED / GREEN @ 44f7cbd · repo tip d515f3b
P4 CORE                      = SHIPPED @ bface6c ⊂ ancestry · local seam WIP NOT BASELINE
SA-07                        = DESIGN FREEZE COMPLETE · AWS BLOCKED · local WIP NOT PRODUCTION
WORKER                       = Contabo STOPPED / DISABLED after LIVE E2E
NEXT GATE                    = STOP — OWNER DECISION REQUIRED
KNOWN WAIVER                 = e3-7-f EXPORT_WAV · WAIVED
PRIOR CHAT REQUIRED          = NO
NIE BUDUJ OD NOWA            = TAK
SEARCH BEFORE CREATE         = TAK
```

*End of FINAL COLD START HANDOFF.*
