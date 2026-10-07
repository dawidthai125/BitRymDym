# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point:** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) → [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) → ten plik.
**Updated:** 2026-10-07 — **P6.5 IMPLEMENTATION COMPLETE · PRODUCTION DEPLOYED · SCENARIO A PROVEN · SCENARIO B BLOCKED · RUNTIME GATE INCONCLUSIVE** · app **`2258bdb`** · dpl `dpl_54uwtNdFbSG4apwikSioTyevdYcr` · RPC hotfix **`57ef69e`** (unchanged)

---

## 1. Project Identity

| Pole | Wartość |
|------|---------|
| Nazwa | BitRymDym |
| Cel | Platforma muzyczna (rap / hip-hop / bity): odsłuch, pobieranie, Quick Take → społeczność i współpraca |
| Owner / Product Owner | Prezes Dawid |

---

## 2. Current Repository / Production Planes

| Pole | Wartość |
|------|---------|
| Canonical branch | `main` |
| **REPOSITORY HEAD / origin/main** | Advances with Gate SSOT docs tip (app tip = `2258bdb` P6.5 · RPC = `57ef69e`) |
| **PRODUCTION APP SHA** | `2258bdbbf5099189bf88e9ed65f41faf43afe226` (`2258bdb`) — **P6.5 Studio Audio Quality Metering** (impl `345e8e5` + meter-start fix) |
| **PRODUCTION DEPLOYMENT** | `dpl_54uwtNdFbSG4apwikSioTyevdYcr` (alias www · served Studio chunk `29qtmv8kgtz1f.js`) |
| **PRODUCTION URL** | https://www.bitrymdym.pl · https://bitrymdym.pl |
| **STUDIO BASELINE** | **P6.5 IMPLEMENTATION COMPLETE · PRODUCTION DEPLOYED · SCENARIO A PROVEN · SCENARIO B BLOCKED · RUNTIME GATE INCONCLUSIVE** (not GREEN · not FAILED · prior Mix UX **P6.4.3 GREEN** @ `f261ea8` remains) |
| **LAST STUDIO VERIFY** | P6.5 runtime gate **INCONCLUSIVE** — **Scenario A PASS** (Live Peak) · **Scenario B BLOCKED** (browser/CDP visibility) · automated **127/127 PASS** · P6.4.3 GREEN @ `f261ea8` |
| **D02 (anon claim live harness)** | **CLOSED** @ `44dc22c` — **TEST ONLY** (not a production app change) |
| **P5.7 Architecture Audit** | **COMPLETE — GO WITH CONDITIONS** — [audit](./architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md) |
| **P5.9 Architecture Audit** | **COMPLETE — GO WITH CONDITIONS** — [audit](./architecture/P5_9_STUDIO_ARCHITECTURE_AUDIT.md) |
| **P5.10 Studio Audio Engine** | **PRODUCTION VERIFIED — GREEN** @ `9c2a958` — [freeze](./decisions/P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md) |
| **P6.1 FX persist / validation** | **COMPLETE** · RPC hotfix **`57ef69e`** — qualify `studio_projects.document_version` |
| **P6.2 Track FX graph** | **PRODUCTION VERIFIED — GREEN** @ `23d3be8` |
| **P6.3 Master FX graph** | **PRODUCTION VERIFIED — GREEN** @ `350303e` |
| **P6.4.1 Master Gain/Pan + Track documentVersion** | **PRODUCTION VERIFIED — GREEN** @ `9f93606` · [P6.4 freeze](./decisions/P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md) |
| **P6.4.2 Shared FX UI Foundation** | **PRODUCTION VERIFIED — GREEN** @ `320907a` · [P6.4 freeze](./decisions/P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md) |
| **P6.4.3 Mix UX polish & integration** | **PRODUCTION VERIFIED — GREEN** @ `f261ea8` · served `0kfptvapkfp-m.js` · [P6.4 freeze](./decisions/P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md) |
| **P6.5 Studio Audio Quality Metering** | **IMPLEMENTATION COMPLETE** · **PRODUCTION DEPLOYED** @ `2258bdb` · dpl `dpl_54uwtNd…` · served `29qtmv8kgtz1f.js` · **Scenario A PROVEN** · **Scenario B BLOCKED (browser/CDP)** · **PRODUCTION RUNTIME GATE — INCONCLUSIVE** (not GREEN · not FAILED) · [freeze](./decisions/P6_5_STUDIO_AUDIO_QUALITY_METERING_DESIGN_FREEZE.md) · [audit](./architecture/P6_5_STUDIO_AUDIO_QUALITY_METERING_ARCHITECTURE_AUDIT.md) |
| **NEXT UNIT** | **Not authorized:** **P6.6 NOT AUTHORIZED**. Remaining open = production visibility lifecycle evidence (Owner/Architect) — do **not** auto-start next Studio unit |
| **KNOWN WAIVER** | `e3-7-f-download-authz` / `EXPORT_WAV` · **PRE-EXISTING / OUT OF SCOPE / WAIVED BY OWNER** |
| **Fala 3.5.1 Recording Experience** | **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** @ `c690831` — [RECORDING.md](./architecture/RECORDING.md) |
| **P3 Anonymous → Account Claim** | **COMPLETE / PRODUCTION VERIFIED — GREEN** @ `dabbc936` — [RECORDING.md](./architecture/RECORDING.md) |
| **POLISH-01** | **CLOSED / PRODUCTION VERIFIED** @ `579acb3` · residual `1c63080` — [DF](./audits/POLISH-01_DESIGN_FREEZE.md) |
| **P0 PLATFORM master download deny** | **CLOSED / PRODUCTION VERIFIED** @ `fdfff71` — [closeout](./audits/P0_PLATFORM_MASTER_DOWNLOAD_DENY.md) |
| **P1 Sample Policy** | **CLOSED / PRODUCTION VERIFIED** @ `5927e35` — [matrix](./audits/P1_SAMPLE_POLICY_MATRIX.md) |
| **P2 Explicit Sample Replace** | **CLOSED / PRODUCTION VERIFIED** @ `943d81e` — [impl](./audits/P2_REPLACE_SAMPLE_IMPLEMENTATION.md) |
| **BPM / real beats** | **CLOSED / PRODUCTION VERIFIED** (17/17 import · 5 BPM corrections) |
| **USER-FACING POLISH (historical)** | CLOSED @ `ffe723b` — **superseded living tip by POLISH-01** |
| **ADMIN USER MANAGEMENT** | W3 @ `237a86f` · W4 @ `ddcee65` · **CLOSED / PRODUCTION VERIFIED** |
| **CREATOR PROGRESS W1 / W2-A / W2-B** | PRODUCTION VERIFIED (W2-B WITH NON-BLOCKING FINDING) — still in tree |
| **USER-ID-01** | **CLOSED / PRODUCTION VERIFIED — GREEN** · Dawid=`1` · next=`2` |
| **ACCOUNT / PROFILE-01** | **PRODUCTION VERIFIED — GREEN** |
| **ARCH-04/05 orphan GC** | **CLOSED / VERIFIED** · live **11 / 8 / 3 / 0 / 0** |
| **FAR-01** | SOAK COMPLETE / CONTAMINATED · retirement NOT EXECUTED · **NOT CLOSED** |
| **DEF-01** | CLOSED / PRODUCTION VERIFIED @ `fbc696f` |
| **HIBP** | DEFERRED / ACCEPTED RISK |
| **STORAGE-ARCH-01** | LOCKED · Hybrid C |
| **STORAGE-ARCH-07 / Local Layer-2** | DESIGN FREEZE COMPLETE · **43/43 RESTORE VERIFIED** · AWS DEFERRED |
| **E3** | PRODUCTION VERIFIED — GREEN |
| **Worker** | Contabo EXTERNAL COMPUTE · **STOPPED / DISABLED** · `92496d4` |
| Supabase project | `rzzxrgcdogkybkiidqgw` |

---

## 3. Current Phase

```text
PRODUCTION APP                = 2258bdb · P6.5 Studio Audio Quality Metering
                                · IMPLEMENTATION COMPLETE · PRODUCTION DEPLOYED
                                · SCENARIO A PROVEN · SCENARIO B BLOCKED (browser/CDP)
                                · PRODUCTION RUNTIME GATE — INCONCLUSIVE (NOT GREEN · NOT FAILED)
PRODUCTION DEPLOYMENT         = dpl_54uwtNdFbSG4apwikSioTyevdYcr
  served Studio chunk         = 29qtmv8kgtz1f.js
REPOSITORY HEAD / origin/main = advances with Gate SSOT docs tip
LAST STUDIO VERIFY            = P6.5 RUNTIME GATE INCONCLUSIVE
                              · Scenario A PASS (Live Peak) · Scenario B BLOCKED
                              · automated P6.1–P6.5 127/127 PASS ≠ production GREEN
P6.1 RPC HOTFIX               = 57ef69e · migration 20261006190900_p6_1_fx_cas_document_version_qualify
P6.2 APPLICATION              = 23d3be8 · PRODUCTION VERIFIED — GREEN
P6.3 APPLICATION              = 350303e · PRODUCTION VERIFIED — GREEN
P6.4.1 APPLICATION            = 9f93606 · PRODUCTION VERIFIED — GREEN
P6.4.2 APPLICATION            = 320907a · PRODUCTION VERIFIED — GREEN
P6.4.3 APPLICATION            = f261ea8 · PRODUCTION VERIFIED — GREEN
P6.5 APPLICATION              = 2258bdb (impl 345e8e5 + fix)
P6.5 PRODUCTION RUNTIME       = INCONCLUSIVE
  Scenario A                  = PASS (BEAT_REF → engine → Master Pan → Analyser → Live Peak)
  Scenario B                  = BLOCKED / INCONCLUSIVE (browser/CDP cannot force true hidden)
  remaining open              = visibility hidden→pause→visible→resume production proof
P6.6                          = NOT AUTHORIZED
KNOWN WAIVER                  = e3-7-f EXPORT_WAV · PRE-EXISTING / WAIVED
KNOWN LIMITATION              = limiter IMPLEMENTATION LIMITATION · reverb synthetic IR · delay no BPM sync
                              · P5.10 TAKE preview may fail · wave4-live PRE-EXISTING / OUT-OF-SCOPE

STUDIO P5 (canonical table):
  P5.1 Studio foundation                 = PRODUCTION VERIFIED — GREEN
  P5.2 Transport                         = PRODUCTION VERIFIED — GREEN
  P5.3 Clip Edit Operations              = PRODUCTION VERIFIED — GREEN
  P5.4 Timeline UX & Editing Foundation  = PRODUCTION VERIFIED — GREEN
  P5.5 Recording Foundation              = PRODUCTION VERIFIED — GREEN
  P5.6 Studio Take Workflow              = PRODUCTION VERIFIED — GREEN
       finalize ≠ place                  = FROZEN
  P5.7 Architecture Audit                = GO WITH CONDITIONS (audit · not impl)
       audit                             = docs/architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md
  P5.8 Studio Devices / Input Foundation = PRODUCTION VERIFIED — GREEN @ 95e04ff
       freeze                            = docs/decisions/P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md
  P5.9 Architecture Audit                = GO WITH CONDITIONS (post–P5.8)
       audit                             = docs/architecture/P5_9_STUDIO_ARCHITECTURE_AUDIT.md
  P5.10 Studio Audio Engine / Multi-Source Playback
                                         = PRODUCTION VERIFIED — GREEN @ 9c2a958
       freeze                            = docs/decisions/P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md
  P6.1 FX persist / validation / CAS     = COMPLETE · RPC hotfix 57ef69e
  P6.2 Track FX graph                    = PRODUCTION VERIFIED — GREEN @ 23d3be8
  P6.3 Master FX graph                    = PRODUCTION VERIFIED — GREEN @ 350303e
  P6.4.1 Master Gain/Pan + Track docVer   = PRODUCTION VERIFIED — GREEN @ 9f93606
  P6.4.2 Shared FX UI Foundation          = PRODUCTION VERIFIED — GREEN @ 320907a
  P6.4.3 Mix UX polish & integration      = PRODUCTION VERIFIED — GREEN @ f261ea8
  P6.5 Studio Audio Quality Metering
                                         = IMPLEMENTATION COMPLETE · PRODUCTION DEPLOYED @ 2258bdb
                                         · SCENARIO A PROVEN · SCENARIO B BLOCKED (browser/CDP)
                                         · PRODUCTION RUNTIME GATE — INCONCLUSIVE (NOT GREEN · NOT FAILED)
       freeze                            = docs/decisions/P6_5_STUDIO_AUDIO_QUALITY_METERING_DESIGN_FREEZE.md
       audit                             = docs/architecture/P6_5_STUDIO_AUDIO_QUALITY_METERING_ARCHITECTURE_AUDIT.md
  D02 live harness                       = CLOSED @ 44dc22c · TEST ONLY

FALA 3.5.1                    = CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN @ c690831
P3                            = COMPLETE / PRODUCTION VERIFIED — GREEN @ dabbc936 · UNCHANGED
  Follow-up                   = p_take_id hardening · NON-BLOCKING
POLISH-01                     = CLOSED / PRODUCTION VERIFIED
P0 / P1 / P2 (recording security track) = CLOSED / PRODUCTION VERIFIED · UNCHANGED
BPM                           = CLOSED / PRODUCTION VERIFIED
ARCH-05                       = CLOSED / VERIFIED · live 11/8/3/0/0
ADMIN W0–W4                   = CLOSED / PRODUCTION VERIFIED
USER-ID-01                    = CLOSED / PRODUCTION VERIFIED

LOCAL WINDOWS Layer-2         = C:\BitRymDym-Backup\
  full backup                 = local-layer2-full-20261005T040146Z-42d6212b · 43/43
  restore drill               = local-restore-20261005T040831Z-76ca3678 · 43/43 PASS
VPS Layer-1                   = 43/43 BACKED UP · Contabo ≠ durable SSOT
AWS Object Lock               = DEFERRED

NEXT GATE                     = production visibility lifecycle evidence (Scenario B)
                              · Play→Peak already PROVEN in production (Scenario A)
                              · P6.6 NOT AUTHORIZED · do NOT auto-start next Studio unit
                              · test suite PASS ≠ production runtime GREEN

CREATOR PROGRESS W2-B         = PRODUCTION VERIFIED WITH NON-BLOCKING FINDING @ d86b4df
  P2-2 / P2-3 / P2-4 (W2-B debt) = OPEN
  Mix / Render live           = DEFERRED
OD-04 / OD-07                 = OPEN (payments / Premium prices)
FAR-01                        = NOT CLOSED (ops contaminated soak — not product NEXT)
```

### 3.1 Architecture living lock

```text
Durable media                = Supabase Storage (beat-audio · take-audio · audio-artifacts)
Metadata SSOT                = Supabase PostgreSQL
Application                  = Vercel / Next.js
EXTERNAL COMPUTE             = Contabo VPS (FFmpeg ephemeral) · Worker STOPPED / DISABLED
Role ≠ Account Level ≠ Creator Rank ≠ Premium Tier
Premium SSOT                 = resolveProductEntitlement + PREMIUM_TIER_MATRIX
Sample Policy SSOT           = getSamplePolicy + SAMPLE_POLICY_DEFAULTS + sample_policy_settings
P3 claim TTL/cap             = Premium Tier via getSamplePolicy (NOT Account Level)
UI labels SSOT               = src/lib/ui/labels.ts (+ status-labels re-export)

Studio audio boundary        = StudioTransport != PlayerProvider
                             = StudioAudioEngine != PlayerProvider
                             = StudioAudioEngine != E3 Mix product graph
P5.10 Studio playback        = StudioTransport → StudioAudioEngine
                             · one engine per Studio editor
                             · AudioContext + Track Node + Master Node
                             · scheduler planVoicesAtPlayhead (all audible Clips)
                             · overlap = MIX (first-wins removed from transport path)
                             · persist/UI clock = integer ms
                             · runtime clock = AudioContext.currentTime + epoch
                             · STOP = playhead 0 (existing FSM)
                             · mix SSOT = Web Audio graph (not HTMLAudioElement.volume)
                             · gainDbToLinearVolume · isTrackAudible · normalizePan
P5.8 Device / Input          = enumerateDevices · permission states · selectedDeviceId
                             · localStorage bitrymdym.studio.selectedAudioInputDeviceId
                             · devicechange recording-safe · ideal deviceId + stale fallback
                             · useMicAnalyser → BrdInputMonitor (no second analyser)
                             · Device state ≠ recording state · UNCHANGED in P5.10
P6 product FX / Mix / Master = P6.1–P6.4.3 PRODUCTION VERIFIED — GREEN
                             · P6.5 Master metering IMPLEMENTED + DEPLOYED @ 2258bdb
                             · P6.5 Scenario A PROVEN (Live Peak on BEAT_REF Play)
                             · P6.5 Scenario B BLOCKED (browser/CDP visibility)
                             · P6.5 PRODUCTION RUNTIME GATE = INCONCLUSIVE (NOT GREEN · NOT FAILED)
                             · engine foundation EXISTS (P5.10 GREEN)
                             · Automation / Autotune = NOT READY
                             · P6.6 NOT AUTHORIZED
                             · follow-up = production visibility lifecycle evidence only
P7 creative tracks           = track enum reserved READY WITH REFACTOR
                             · capabilities + additive source kinds before expansion
                             · instrument engines = NOT READY
E3 Mix graph                 = beat Mix/Master product path — isolated from Studio engine
                             · two Web Audio product surfaces OK (not two Studio engines)
Studio ARTIFACT playback     = adapter stub / unavailable (non-blocking)
Studio document_version      = column exists · NOT a frozen autosave contract yet (P5.7 H2)
Track capabilities           = future Track Type + Capabilities (P5.7 H1) · not implemented
```

### 3.1d P5.10 production gate (final)

```text
StudioAudioEngine exists / one engine per editor / AudioContext     = PASS
Multi-source scheduler (Beat+Take / Take+Take / Beat+many Takes)    = PASS (unit)
Overlap = mix · pickTakeClipAtPlayhead not on transport path        = PASS
Shared clock PLAY/PAUSE/STOP/SEEK · STOP playhead 0                 = PASS
Track/Master graph · gain/mute/solo/pan in graph                    = PASS
PlayerProvider isolation · E3 Mix isolation · recording unchanged   = PASS
Served JS 0p8mql3sjqfx_.js contains StudioAudioEngine               = PASS
Cache: Skipping build cache · SHA = GitHub commit = served bundle   = PASS
typecheck PASS · P5.10 lint PASS · build PASS · 187 unit (P5.10=19) = PASS

KNOWN VERIFICATION LIMITATION:
  Production Beat PLAY/PAUSE/STOP worked (playhead advanced; STOP → 00:00.000)
  One parallel TAKE fixture returned "Nie udało się odtworzyć nagrania"
  Beat continued (fail-closed). Live overlap of two healthy Takes A+B
  was not executed on that fixture. Scheduling/mix covered by unit tests.
  Not a P5.10 blocker — Production Gate formally GREEN.

Security:
  Engine has no ownerId / objectKey
  Beat URLs = requestBeatAudioAccessAction
  Take URLs = POST /api/takes/preview
  Live IDOR was not rerun in this gate (inherited P3/P4/P5 boundaries)
```

### 3.1e P5.10 deployment / cache protection (release note)

```text
Production SHA        = 9c2a958
Canonical deploy      = dpl_L7pB5A8iuY8CKipxbLsGEVLESZTC
GitHub clone          = Commit 9c2a958
Build                 = Skipping build cache (16.4s compile)
HTML                  = no-store / MISS
Served chunk          = 0p8mql3sjqfx_.js
  YES = StudioAudioEngine · AUDIO_SYNC_FAILED · createMediaElementSource · createStereoPanner
  NO  = pickTakeClipAtPlayhead · takeAudioRef
Lesson (P5.8 regression protection) = verify served artifact, not only SHA/Ready
```

### 3.1b P5.8 production gate (final)

```text
Device discovery / Permissions / Default / Explicit selection = PASS
localStorage / Stale fallback / devicechange                  = PASS
Recording + device change / Input monitor                     = PASS
P5.5 recording regression / finalize ≠ place                  = PASS
Security / Privacy / Mobile 390×844 / PlayerProvider          = PASS
P3 / P4 / P5.1–P5.6 / D02 / automated regression              = PASS

Physical permission Deny/Blocked = NOT TESTABLE IN CURRENT ENVIRONMENT (not FAIL)
Physical hot-plug                = NOT TESTABLE IN CURRENT ENVIRONMENT (not FAIL)
```

### 3.1c P5.8 deployment / build-cache incident (release note)

```text
Initial deploy claimed SHA 95e04ff but served pre-P5.8 Studio device JS
Root cause = stale Vercel build cache (from docs-only 67f4b4e)
Recovery   = redeploy without build cache
Final dpl  = dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S
Lesson     = Production Gate must verify served artifact for critical UI changes
             (not only deployment SHA / Ready status)
Type       = deployment/build-cache incident · NOT an application source bug
```

### 3.2 Backup / recovery separation (living)

```text
DATABASE RECOVERY:
  Historical local PostgreSQL dump EXISTS
  Path: C:\BitRymDym-recovery\bitrymdym-production-pre-account-profile-01.dump
  Excludes: Storage object bytes
  Restore: NOT VERIFIED
  SSOT: docs/audits/HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md

STORAGE DISASTER RECOVERY:
  VPS Layer-1 = 43/43 BACKED UP
  Local Windows Layer-2 = 43/43 RESTORE VERIFIED
    backup id  = local-layer2-full-20261005T040146Z-42d6212b
    restore id = local-restore-20261005T040831Z-76ca3678
  AWS Object Lock = DEFERRED
  ARCH-05 = CLOSED / VERIFIED · live Storage 11 (USER 8 · PLATFORM 3 · ORPHAN 0)
  Local/VPS retained evidence = 43/43 (incl. 32 deleted orphans)
  Backup ≠ Storage SSOT ≠ VPS
```

---

## 4. CLOSED / OPEN / DEFERRED / WAIVED

### CLOSED / PRODUCTION VERIFIED (selected)

- **P5.10** Studio Audio Engine / Multi-Source Playback @ `9c2a958` — **PRODUCTION VERIFIED — GREEN** · dpl `dpl_L7pB5A8iuY8CKipxbLsGEVLESZTC`
- **P5.8** Studio Devices / Input Foundation @ `95e04ff` — **PRODUCTION VERIFIED — GREEN** · dpl `dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S`
- **P5.1–P5.6** Studio foundation → Take Workflow — **PRODUCTION VERIFIED — GREEN**
- **D02** live harness — **CLOSED** @ `44dc22c` (**TEST ONLY**)
- **P5.9** Architecture Audit — **COMPLETE · GO WITH CONDITIONS** (audit · not impl)
- **P5.7** Architecture Audit — **COMPLETE · GO WITH CONDITIONS** (audit · not impl)
- **P3** Anonymous → Account Claim @ `dabbc936`
- POLISH-01 (+ residual `1c63080`)
- P0 PLATFORM master download deny
- P1 Sample Policy
- P2 Explicit Sample Replace
- BPM / real beats
- Recording Waves 1–5 / D02 (product decision; harness debt closed separately @ `44dc22c`)
- ADMIN W0–W4
- USER-ID-01 · ACCOUNT/PROFILE-01
- ARCH-05
- E3 (GREEN; HQ/WAV assert waived separately)
- USER-FACING POLISH @ `ffe723b` (historical tip)

### OPEN

- **Next Studio Architecture Audit** / formal next unit definition (do **not** auto-start P6 / FX / Mix / Master)
- OD-04 / OD-07 (payments / Premium prices)
- W2-B debt P2-2 / P2-3 / P2-4
- FAR-01 closeout / retirement (ops)
- OD-09 / OD-15 / OD-16 and other long-horizon OPEN decisions
- **P3 follow-up:** `p_take_id` hardening — **NON-BLOCKING** (not a product gate)
- P5.7 conditions still tracked: H1 capabilities before P7 track expansion · H2 `document_version` before autosave · H4 product FX still needs freeze (engine foundation **SHIPPED** in P5.10)

### DEFERRED

- Messaging · comments · voting · payments · Premium catalog product · STEMS
- External Object Storage
- Artifact janitor · Gold 90d PRODUCTION · Mix/Render live E2E (W2-B deferred)
- AWS immutable DR

### KNOWN WAIVERS

| Item | Status |
|------|--------|
| `e3-7-f-download-authz` · `EXPORT_WAV` | PRE-EXISTING / OUT OF SCOPE / **WAIVED BY OWNER** |

---

## 5. Next Session Entry

```text
NEXT SESSION ENTRY = Read FINAL_COLD_START_HANDOFF.md
                 → MASTER_HANDOFF.md / this PROJECT_STATE
                 → Confirm PRODUCTION APP = 9c2a958 (P5.10 GREEN)
                 → Confirm PRODUCTION DEPLOYMENT = dpl_L7pB5A8iuY8CKipxbLsGEVLESZTC
                 → P5.1–P5.6 GREEN · P5.7 GO WITH CONDITIONS · P5.8 GREEN · P5.9 GO WITH CONDITIONS · P5.10 GREEN · D02 CLOSED
                 → NEXT GATE = NEXT ARCHITECTURE AUDIT / formal next Studio unit definition
                 → Do NOT auto-start P6 / FX / Mix / Master / punch / samples
                 → Do NOT call punch “P5.7” / “P5.9” / “P5.10”
                 → p_take_id = NON-BLOCKING follow-up only (do not auto-implement)
                 → Do NOT reopen ARCH-05 / BPM / replace / sample policy / P3 / P5.6 / P5.8 / P5.10 without new evidence
                 → Do NOT fix EXPORT_WAV in product scope without separate Owner GO
                 → Do NOT clean dirty WIP without Owner GO
```

---

## 6. Decision vs Delivery (selected recent)

| ID / Track | Decision | Delivery |
|------------|----------|----------|
| OD-PL-01…06 | **CLOSED / ACCEPTED** | POLISH-01 **CLOSED / PRODUCTION VERIFIED** @ `579acb3` + residual `1c63080` |
| P0 PLATFORM deny | Owner GO | **CLOSED / PRODUCTION VERIFIED** @ `fdfff71` |
| P1 Sample Policy | Owner GO | **CLOSED / PRODUCTION VERIFIED** @ `5927e35` |
| P2 Explicit Replace | OD-P2-01…07 CLOSED | **CLOSED / PRODUCTION VERIFIED** @ `943d81e` |
| ARCH-05 | Owner GO delete | **CLOSED / VERIFIED** |
| OD-08 Premium tiers | CLOSED | W2-A/B in tree |
| P3 | OD-P3-01…11 CLOSED / IMPLEMENTED | **COMPLETE / PRODUCTION VERIFIED — GREEN** @ `dabbc936` |
| P5.6 Take Workflow | Design Freeze GO | **PRODUCTION VERIFIED — GREEN** |
| P5.8 Devices / Input | Design Freeze GO | **PRODUCTION VERIFIED — GREEN** @ `95e04ff` · dpl `dpl_2RhUDg…` |
| P5.9 Architecture Audit | GO WITH CONDITIONS | Audit artifact only — [P5_9…](./architecture/P5_9_STUDIO_ARCHITECTURE_AUDIT.md) |
| P5.10 Studio Audio Engine | Design Freeze GO WITH CONDITIONS | **PRODUCTION VERIFIED — GREEN** @ `9c2a958` · dpl `dpl_L7pB5A8…` |
| P5.7 Architecture Audit | GO WITH CONDITIONS | Audit artifact only — [P5_7…](./architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md) |
| D02 harness | CLOSED | **TEST ONLY** @ `44dc22c` |

---

## 7. Out of scope / deferred (living)

STEMS · payments / Premium catalog · recording Premium overlay · Gold 90d PRODUCTION · audio-artifacts janitor · `/ranks` / `/premium` UI · billing · W2-B Mix/Render live · W4 remaining Admin P2 (last-admin TOCTOU · no durable idempotency · live last-admin concurrency · published USER beat retain · migration timestamp drift) · **P3 `p_take_id` hardening** until separate Owner GO (NON-BLOCKING) · **P6** product FX/routing/buses/automation/mix/master (engine foundation = P5.10 GREEN) · **P7** samples/scratch/instruments/pitch/stretch/reverse/loop · Studio punch/pre-roll/count-in/metronome/BPM/quantization · autosave until `document_version` contract frozen · capability system (document-only until freeze) · DB device preferences (P5.8 = localStorage only).

---

## 8. Local worktree note

Typical residue (**nie czyścić / nie stage'ować bez GO**): `.agents/` · `.cursor/` · `skills-lock.json` · `infra/oracle/` · `.env*` · secrets · backup artifacts · cleanup scripts · untracked audits WIP.

**Nigdy:** `git add .` / `-A` / `-u` — tylko exact allowlist.
