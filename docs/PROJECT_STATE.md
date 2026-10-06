# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point:** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) → [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) → ten plik.
**Updated:** 2026-10-06 — P5.8 **PRODUCTION VERIFIED — GREEN** · SSOT reconcile · production app **`95e04ff`** · final deploy `dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S` · **docs-only** (no app redeploy this wave)

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
| **REPOSITORY HEAD / origin/main** | Advances with this SSOT reconcile (parent tip = `95e04ff` P5.8 feature) |
| **PRODUCTION APP SHA** | `95e04ff534d58de3476e3a2dc620a13fbcacb7ba` (`95e04ff`) — **P5.8 Studio Devices / Input Foundation** · **UNCHANGED** this docs wave |
| **PRODUCTION DEPLOYMENT** | `dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S` (no-cache redeploy after build-cache incident) |
| **PRODUCTION URL** | https://www.bitrymdym.pl · https://bitrymdym.pl |
| **STUDIO BASELINE** | **P5.8** · **PRODUCTION VERIFIED — GREEN** @ `95e04ff` |
| **LAST STUDIO VERIFY** | **P5.8 PRODUCTION VERIFIED — GREEN** @ `95e04ff` |
| **D02 (anon claim live harness)** | **CLOSED** @ `44dc22c` — **TEST ONLY** (not a production app change) |
| **P5.7 Architecture Audit** | **COMPLETE — GO WITH CONDITIONS** — [audit](./architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md) |
| **NEXT UNIT** | **NEXT ARCHITECTURE AUDIT / formal next Studio unit definition** (do **not** auto-start P6) |
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
PRODUCTION APP                = 95e04ff · P5.8 Studio Devices / Input Foundation · READY
PRODUCTION DEPLOYMENT         = dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S
REPOSITORY HEAD / origin/main = advances with this SSOT reconcile (app tip 95e04ff)
LAST STUDIO VERIFY            = P5.8 · PRODUCTION VERIFIED — GREEN
KNOWN WAIVER                  = e3-7-f EXPORT_WAV · PRE-EXISTING / WAIVED

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

NEXT GATE                     = NEXT ARCHITECTURE AUDIT / formal next Studio unit definition
                              · do NOT auto-start P6 / FX / punch / samples
                              · P3 follow-up p_take_id = NON-BLOCKING only

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
P5 Studio playback           = StudioTransport + HTMLAudioElement (beat + TAKE pick)
                             · NOT the target engine for full Studio DSP
P5.8 Device / Input          = enumerateDevices · permission states · selectedDeviceId
                             · localStorage bitrymdym.studio.selectedAudioInputDeviceId
                             · devicechange recording-safe · ideal deviceId + stale fallback
                             · useMicAnalyser → BrdInputMonitor (no second analyser)
                             · Device state ≠ recording state
P6 Studio DSP                = requires dedicated StudioAudioEngine / audio graph
                             · FX/mix/master = READY WITH REFACTOR (needs engine)
                             · Automation / Autotune = NOT READY
                             · do NOT bolt FX/routing/mix/master onto HTMLAudioElement
P7 creative tracks           = track enum reserved READY WITH REFACTOR
                             · capabilities + additive source kinds before expansion
                             · instrument engines = NOT READY
E3 Mix graph                 = beat Mix/Master product path — not Studio P5 engine
Studio overlap (P5)          = first-wins TAKE under playhead (known limit)
Studio document_version      = column exists · NOT a frozen autosave contract yet (P5.7 H2)
Track capabilities           = future Track Type + Capabilities (P5.7 H1) · not implemented
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

- **P5.8** Studio Devices / Input Foundation @ `95e04ff` — **PRODUCTION VERIFIED — GREEN** · dpl `dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S`
- **P5.1–P5.6** Studio foundation → Take Workflow — **PRODUCTION VERIFIED — GREEN**
- **D02** live harness — **CLOSED** @ `44dc22c` (**TEST ONLY**)
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

- **Next Studio Architecture Audit** / formal next unit definition (do **not** auto-start P6)
- OD-04 / OD-07 (payments / Premium prices)
- W2-B debt P2-2 / P2-3 / P2-4
- FAR-01 closeout / retirement (ops)
- OD-09 / OD-15 / OD-16 and other long-horizon OPEN decisions
- **P3 follow-up:** `p_take_id` hardening — **NON-BLOCKING** (not a product gate)
- P5.7 conditions (still tracked): H1 capabilities before P7 track expansion · H2 `document_version` before autosave · H4 StudioAudioEngine before P6 FX

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
                 → Confirm PRODUCTION APP = 95e04ff (P5.8 GREEN)
                 → Confirm PRODUCTION DEPLOYMENT = dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S
                 → P5.1–P5.6 GREEN · P5.7 GO WITH CONDITIONS · P5.8 GREEN · D02 CLOSED
                 → NEXT GATE = NEXT ARCHITECTURE AUDIT / formal next Studio unit definition
                 → Do NOT auto-start P6 / FX / punch / samples / StudioAudioEngine
                 → Do NOT call punch “P5.7” (P5.7 = Architecture Audit)
                 → p_take_id = NON-BLOCKING follow-up only (do not auto-implement)
                 → Do NOT reopen ARCH-05 / BPM / replace / sample policy / P3 / P5.6 / P5.8 without new evidence
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
| P5.7 Architecture Audit | GO WITH CONDITIONS | Audit artifact only — [P5_7…](./architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md) |
| D02 harness | CLOSED | **TEST ONLY** @ `44dc22c` |

---

## 7. Out of scope / deferred (living)

STEMS · payments / Premium catalog · recording Premium overlay · Gold 90d PRODUCTION · audio-artifacts janitor · `/ranks` / `/premium` UI · billing · W2-B Mix/Render live · W4 remaining Admin P2 (last-admin TOCTOU · no durable idempotency · live last-admin concurrency · published USER beat retain · migration timestamp drift) · **P3 `p_take_id` hardening** until separate Owner GO (NON-BLOCKING) · **P6** StudioAudioEngine/FX/routing/buses/automation/mix/master · **P7** samples/scratch/instruments/pitch/stretch/reverse/loop · Studio punch/pre-roll/count-in/metronome/BPM/quantization · autosave until `document_version` contract frozen · capability system (document-only until freeze) · DB device preferences (P5.8 = localStorage only).

---

## 8. Local worktree note

Typical residue (**nie czyścić / nie stage'ować bez GO**): `.agents/` · `.cursor/` · `skills-lock.json` · `infra/oracle/` · `.env*` · secrets · backup artifacts · cleanup scripts · untracked audits WIP.

**Nigdy:** `git add .` / `-A` / `-u` — tylko exact allowlist.
