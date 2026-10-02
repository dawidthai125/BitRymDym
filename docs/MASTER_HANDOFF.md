# BitRymDym — Master Handoff

**Purpose:** Full cold-start continuity for a new GPT + Cursor Agent after session close.
**Updated:** 2026-10-02
**Owner:** Prezes Dawid

**Ultra entry (read first):** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md)

**This document is continuity** (detailed cold-start).
Product truth remains [MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md). Technical HOW remains [SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md). Live “where we are now” remains [PROJECT_STATE.md](./PROJECT_STATE.md).

**Evidence rule:** code + remote schema prove implementation state. Documentation alone is **not** proof that a feature is shipped. Production verification is a separate stage from “docs say CLOSED”.

---

## 1. Current Production

| Field | Value |
|-------|--------|
| URL | https://www.bitrymdym.pl |
| **Application SHA** | `42369c0d4569e2df1a9e900ee8d68b3fec8c2b41` (`42369c0`) |
| Deployment | `6802739724` · Vercel `dpl_7hbfYd1wD6QGAbV6vLqLCXusjx7X` |
| Status | **GREEN** / **PRODUCTION VERIFIED** |
| **Fala 1B** | **CLOSED** / **PRODUCTION VERIFIED — GREEN** — Account + Panel Administracyjny (Pulpit) — [FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md](./audits/FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md) |
| **Fala 1A** | **CLOSED** / **PRODUCTION VERIFIED** @ `fdf74f9` — Public Visual Foundation |
| **E3 status** | **PRODUCTION VERIFIED — GREEN** (PASS WITH FINDINGS) · flags remain ON |
| **AC-PE-12** | **PASS** (historical PE tip `6dfd201`) |
| **GO #5** | **PASS** (`E3_PUBLIC_AUDIO=ON` · controlled Free Basic verify) |
| Previous Production | `fdf74f9` (Fala 1A) · `6dfd201` (E3 PE tip) · `9026fa9` (W6 UX) · `17c4d530` (E3.7 DARK) — rollback lineage |
| **W6.2/W6.3 UX ship** | **CLOSED / PRODUCTION VERIFIED** @ `9026fa9` (ship SHA · not current tip) |
| **E3.7** | Code present · Premium Production E2E **NOT TESTED** |
| **E3 Production Enablement** | **COMPLETE** · Design Freeze LOCKED · GO #2–#5 executed |
| **STORAGE-ARCH-01** | **LOCKED** · Hybrid C · Final Arch Review **PASS WITH FINDINGS** · Owner **PASS** · Implementation **NOT STARTED** · STORAGE-ARCH-02 **NOT STARTED** — [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · [STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md) |
| **OWNER GO #2 Worker Infra** | **CLOSED / SUPERSEDED** (Contabo) — [E3_WORKER_INFRASTRUCTURE_GO2.md](./audits/E3_WORKER_INFRASTRUCTURE_GO2.md) |
| **Worker** | Contabo · bootstrap `92496d4` · **STOPPED / DISABLED** |
| Recording Wave 4 | **CLOSED / PRODUCTION VERIFIED** |
| Recording Wave 5 | **CLOSED / PRODUCTION VERIFIED** · Shared Grants → RECORD @ `37892a6` |
| D02 Anonymous QT | **CLOSED / IN V1** · **SHIPPED** @ `e98ba52` |
| Cron | `0 0 * * *` (Vercel Hobby daily 00:00 UTC) → `/api/cron/takes-janitor` |
| `CRON_SECRET` | Configured in Vercel Production (**never print / never commit**) |
| Supabase project | `rzzxrgcdogkybkiidqgw` |

**E3 Production flags (current living state):**

```text
E3_MIX_ENABLED           = ON
E3_RENDER_JOBS_ENABLED   = ON
E3_PUBLIC_AUDIO          = ON
E3_RENDER_WORKER_SECRET  = CONFIGURED (server-only · never commit)
WORKER                   = STOPPED / DISABLED
```

**Canonical rollback (Owner GO only):** unset/off `E3_PUBLIC_AUDIO` → Free public Mix/job/download DENY (AC-PE-12).

**Do not confuse SHAs — do not auto-align them:**

| SHA | Meaning |
|-----|---------|
| `42369c0` | **Current Production application** — Fala 1B Account + Admin visual foundation |
| `fdf74f9` | **Fala 1A** Public Visual Foundation (parent of 1B) |
| `6dfd201` | Historical E3 PE / AC-PE-12 tip (superseded as Prod tip by visual foundation) |
| docs tip | Advances on docs-only commits without redeploy |
| `92496d4` | **Worker bootstrap** (Contabo EXTERNAL encode host) |
| `9026fa9` | **W6.2/W6.3 UX ship** (historical) |
| `17c4d530` | Prior Production (E3.7 Premium Render · DARK at closeout) |
| `183b2a4` | Prior Production (E3.6 Basic MP3 · DARK at closeout) |

---

## 2. Current Git Baseline

| Field | Value |
|-------|--------|
| Branch | `main` |
| Remote | `origin` → `https://github.com/dawidthai125/bitrymdym` |
| **Production application** | `42369c0` |
| **HEAD / origin/main** | May advance on docs-only closeout commits (≠ Prod app SHA — intentional) |
| **E3** | **PRODUCTION VERIFIED — GREEN** · Mix/Jobs/PUBLIC_AUDIO **ON** · AC-PE-12 **PASS** · GO #5 **PASS** |
| **STORAGE-ARCH-01** | **LOCKED** · see §4.1 · Implementation **NOT STARTED** |
| Typical untracked (ignore until Owner stages) | `.agents/` · `.cursor/` · `skills-lock.json` · host/Oracle audits · `infra/` · local Mix/`account/beats` dirt |

Do **not** stage agent tooling folders as product scope.

---

## 3. Project Purpose

BitRymDym is a music platform focused on rap / hip-hop / beat culture:

discover beats → listen → download → test vocals (takes) → (future) finish tracks → community / collaboration.

**Brand:** own musical identity — not generic AI SaaS UI.
**Product constitution:** [MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md) (status DRAFT FOUNDATION — still binding for closed decisions).

---

## 4. Architecture

| Layer | Decision |
|-------|----------|
| Frontend | Next.js · TypeScript · Tailwind · shadcn/ui base · App Router (**OD-01**) |
| App server | Next.js Server Actions / Route Handlers (**OD-02**) — no separate Express/Nest |
| Infra | Supabase: PostgreSQL · Auth · RLS · Storage (**OD-03**) |
| Hosting | Vercel Production |
| Audio | Private buckets · short-lived signed URLs · no permanent public master URLs |
| Player | Custom `PlaybackShell` (not stock HTML-only player as product UX) |
| E3 Full Audio | Architecture **C — HYBRID** LOCKED · client preview · server Final Truth · EXTERNAL worker |
| Storage Architecture V1 | **STORAGE-ARCH-01 = LOCKED** · Hybrid C · durable = Supabase Storage only · Contabo ephemeral |

Principles: **SSOT FIRST · REUSE FIRST · ZERO DUPLICATE LOGIC · SERVER AUTHORIZATION · PRIVATE AUDIO · DOCUMENTATION CONTINUITY**.

E3 index: [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) · [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](./architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md)

Storage V1: [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · [STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md)

### 4.1 STORAGE-ARCH-01 — LOCKED (living)

```text
STORAGE-ARCH-01              = LOCKED
Architecture                 = Hybrid C
Durable media                = Supabase Storage
Metadata SSOT                = Supabase PostgreSQL
Application / AuthZ / API    = Vercel / Next.js
Render / compute             = Contabo (ephemeral · NOT durable media · NOT audio library SSOT)
Buckets V1                   = beat-audio · take-audio · audio-artifacts (PRIVATE)
Final Architecture Review    = PASS WITH FINDINGS
Owner Review                 = PASS
OD-SA-01…10                  = LOCKED
Implementation               = NOT STARTED
STORAGE-ARCH-02              = NOT STARTED
Production mutations         = NONE
```

| Topic | Locked value |
|-------|----------------|
| Buckets | Reuse 3 existing only (OD-SA-01) |
| Legacy keys | dual-read → staged migration (OD-SA-02) · FAR-01 → Wave 02 · **no Implementation GO** |
| Beat library | MASTER + fallback (OD-SA-03) |
| Artwork | DEFERRED (OD-SA-04) |
| Artifacts janitor | REQUIRED · future wave (OD-SA-05 / STORAGE-ARCH-03) |
| Backup source MASTER | REQUIRED BEFORE SCALE (OD-SA-06) · threshold at Wave 07 |
| Mix artifact backup | regenerable · no default backup (OD-SA-07) |
| Orphans | inventory → dry-run → Owner GO (OD-SA-08) |

**Do not** start STORAGE-ARCH-02 dual-read / janitor / orphan delete / key migration / backup without a separate Owner Implementation GO.

---

## 5. Security Model

### Canonical chain (platform)

```text
REQUEST
  → AUTH
  → SERVER AUTHZ
  → PERMISSION
  → BUSINESS RULE
  → RLS
  → DB / STORAGE
```

### Recording chain

```text
REQUEST
  → AUTH
  → SERVER AUTHZ
  → RECORDING ENTITLEMENT
  → BEAT ACCESS (PUBLISHED + READY master)
  → BUSINESS RULE (caps / retention)
  → RLS / STORAGE
  → TAKE
```

### E3 render chain (living Production — GREEN after PE)

```text
AUTH → AUTHZ → EFFECTIVE ENTITLEMENT → ANTI-ABUSE
  → render_jobs → EXTERNAL WORKER → private audio-artifacts → signed download
```

> Historical note: chain was DARK at E3.6/E3.7 wave closeouts; living enablement is GREEN (`E3_PUBLIC_AUDIO=ON` · AC-PE-12). Do not rewrite those closeouts.
| Rule | Notes |
|------|--------|
| IDOR | Owner boundary on takes / mix / jobs / artifacts |
| Private Storage | `beat-audio`, `take-audio`, `audio-artifacts` — no public permanent object URLs |
| Signed URLs | Short TTL; issued only after server AuthZ |
| Entitlement / retention / anti-abuse | Server SSOT only — never trust client timers/levels |
| Claim RPC | `claim_take_recording_session` — `service_role` only |
| Cron | Bearer `CRON_SECRET`; missing/invalid → 401 |
| E3 worker | Bearer `E3_RENDER_WORKER_SECRET` · no-auth **401** · wrong secret **403** · Contabo EXTERNAL one-shot · unit **STOPPED / DISABLED** after verify |
| P1 DEFINER grants | Selective REVOKE — see §5.1 |
| P1 `set_updated_at` | `search_path=public` + `pg_catalog.now()` — see §5.1 |

### 5.1 P1 Security hardening (2026-09-28)

| Item | Status |
|------|--------|
| **P1-B** selective DEFINER EXECUTE REVOKE | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-C** `set_updated_at` search_path hardening | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-A** HIBP / leaked-password protection | **BLOCKED** — Owner Dashboard action required (**not** implemented) |
| Security overall | **GREEN WITH WARNINGS** · CRITICAL=0 · HIGH=0 · MEDIUM residual = HIBP disabled |
| Remote DB | Contains P1-B + P1-C hardening (applied before git commit) |
| Migration drift | **P2 OPS** — local filename vs remote version drift (not a P1 blocker) |
| Wave 5 security outcome | Shared Grant AuthZ = PASS · HTTP IDOR = PASS · RLS = PASS · Take ACL = UNCHANGED · private audio = UNCHANGED |
| Wave 5 | **CLOSED / PRODUCTION VERIFIED** @ `37892a6` · Shared Grants → RECORD |

**P1-B grant posture (do not “fix” by revoking authenticated on RLS helpers):**

- `is_admin` / `is_moderator` / `is_staff` → EXECUTE for **authenticated** (+ postgres/service_role); **not** PUBLIC/anon
- trigger-only DEFINER + `current_user_role` + `set_updated_at` → **no** client EXECUTE
- claim / download RPCs → still **service_role/postgres only** (unchanged)
| Staff | No blanket override of owner take boundary without an explicit future rule |

---

## 6. Roles and Account Levels

**Roles:** `USER` · `MODERATOR` · `ADMINISTRATOR` (permissions via `permissions` / `role_permissions`).

**Account levels (recording / retention / caps):**

| Level | Max record | Retention | Active READY | Sessions / UTC day |
|-------|------------|-----------|--------------|--------------------|
| BEGINNER_RAPPER | `MIN(beat, 30)` | 24h | 3 | 10 |
| PRO_RAPPER | `MIN(beat, 180)` | 10d | 10 | 30 |
| LEGEND_RAPPER | `MIN(beat, 180)` | 30d | 20 | 60 |

Concurrent recording sessions: **max 1** `PENDING_UPLOAD` per owner.
Signup default account level: closed decision (BEGINNER path) — see Decision Log OD-19.

**Premium (E3 overlay):** `premium_entitlements` — **≠** Account Level · **≠** Role · no `PremiumAudioRole`.

---

## 7. Feature Status Matrix

| Feature | Status | Production | Documentation | Notes |
|---------|--------|------------|---------------|-------|
| Next.js / TS / Tailwind / shadcn / App Router | CLOSED | GREEN | OK | OD-01 |
| Supabase Auth + profiles + roles + permissions + RLS | CLOSED | GREEN | OK | Phase 1.3 |
| Platform beats CRUD / lifecycle | CLOSED | GREEN | OK | Phase 1.4+ |
| Private `beat-audio` + Access Gate + signed play/download | CLOSED | GREEN | OK | Phase 1.5+ |
| Custom PlaybackShell | CLOSED | GREEN | OK | Phase 1.6/1.7 area |
| BPM V1 detector + safety rules + BPM SSOT | CLOSED | GREEN | OK | Phase 1.9 / BPM freeze |
| Signed audio upload transport (beats) | CLOSED | GREEN | OK | Audio Transport V1 |
| Downloads: anon/auth limits + DOWNLOAD_EVENT + My Downloads | CLOSED | GREEN | OK | Phase 1.8A |
| Community user upload + moderation + publish | CLOSED | GREEN @ `c5e1f17` epic | OK | Waves 1–5 community |
| Recording Wave 1 takes foundation | CLOSED | GREEN | OK | `takes` + `take-audio` |
| Recording Wave 2 session/upload/finalize/MediaRecorder | CLOSED | GREEN | OK | |
| Recording Wave 3 UI + take preview + Chromium WebM fallback | CLOSED | GREEN @ `9f6f006` | OK | |
| Recording Wave 4 entitlement/retention/janitor/abuse/download/Moje próbki/delete | CLOSED | GREEN @ `99c4815` | OK | Hobby daily cron |
| Anonymous Quick Take | **Delivery:** SHIPPED / PRODUCTION VERIFIED @ `e98ba52` | GREEN | Decision D02 CLOSED = IN V1 | |
| Shared grants / RECORD on grants | **Delivery:** SHIPPED / PRODUCTION VERIFIED @ `37892a6` | GREEN | Decision D03 CLOSED = IN Recording EPIC | Wave 5 CLOSED · RECORD only · no PLAYBACK/DOWNLOAD via grant |
| **E3.1 Foundation** | SHIPPED / PRODUCTION VERIFIED | GREEN @ chain → `183b2a4` | OK | schema · `audio-artifacts` private |
| **E3.2 Premium overlay** | SHIPPED / PRODUCTION VERIFIED | GREEN | OK | effective entitlement |
| **E3.3 Mix Session + Basic client** | SHIPPED / PRODUCTION VERIFIED | GREEN · **DARK** | OK | flags UNSET |
| **E3.4 Master Basic** | SHIPPED / PRODUCTION VERIFIED | GREEN · **DARK** | OK | |
| **E3.5 Render Jobs + Worker Adapter** | SHIPPED / PRODUCTION VERIFIED | GREEN · **DARK** @ `fbece37` | OK | fake-complete = CI/domain |
| **E3.6 Basic MP3 export** | SHIPPED / PRODUCTION VERIFIED | GREEN · **DARK** @ `183b2a4` | OK | real 128 kbps · OD-E36-04 C · EXTERNAL worker |
| **E3.7 Premium Render** | **SHIPPED / PRODUCTION VERIFIED** | GREEN · historically **DARK** at `17c4d530` closeout · living PE **ON** | OK | `server-pro-v1` · HQ 320 · WAV · Premium E2E **NOT TESTED** |
| E3 public Free Audio / Production render enablement | **ENABLED** (PE COMPLETE) | GREEN @ `6dfd201` · GO #5 **PASS** | OK | Free Basic only · private bucket · AC-PE-12 |
| **STORAGE-ARCH-01** | **LOCKED** (architecture) | N/A · Production mutations **NONE** | OK | Hybrid C Storage V1 · [freeze](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) |
| **STORAGE-ARCH-02** dual-read | **NOT STARTED** | — | — | FAR-01 · **no Implementation GO** |
| Later Storage waves (03–11) | **NOT STARTED** | — | — | janitor · orphans · migration · backup · optional |
| Later E3 product expansions (STEMS etc.) | **NOT SELECTED** | — | — | **Do not auto-start** |
| Track publishing from recording | NOT IMPLEMENTED | — | Future | |
| Payments / Premium catalog product | OUT OF SCOPE / NOT IMPLEMENTED | — | OD-04/07/08 OPEN | Overlay table exists for E3 |
| Messaging / voting / comments product | NOT IMPLEMENTED | — | SSOT future; OD-10/11 OPEN | Permission rows may exist |
| Dual-play mix preview | NOT IMPLEMENTED | — | W3 OUT | |

---

## 8. Closed Epics

| Epic | Status | Anchor |
|------|--------|--------|
| Phase 1 foundation (1.3–1.9) | CLOSED / LOCKED | Multiple SHAs; tip evolved |
| Audio Transport V1 | CLOSED | Verified historically |
| BPM Production V1 | CLOSED | |
| Community Upload + Moderation | **CLOSED / LOCKED** | `c5e1f17` |
| Recording Design Freeze | **LOCKED** | [PHASE_RECORDING_DESIGN_FREEZE.md](./phases/PHASE_RECORDING_DESIGN_FREEZE.md) |
| Recording Waves 1–4 | **CLOSED** | Prior prod `99c4815` |
| Recording Wave 5 (Shared Grants → RECORD) | **CLOSED / PRODUCTION VERIFIED** | `37892a6` |
| D02 Anonymous QT | **CLOSED / IN V1 · SHIPPED** | `e98ba52` |
| E3.1 → E3.6 Full Audio (through Basic MP3) | **CLOSED / PRODUCTION VERIFIED · DARK** | `183b2a4` |
| E3.7 Premium Render | **CLOSED / PRODUCTION VERIFIED · DARK** @ `17c4d530` | [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md) |
| E3 Production Enablement | **COMPLETE / GREEN** @ `6dfd201` | [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md) |
| STORAGE-ARCH-01 | **LOCKED** (architecture · no implementation) | [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) |

---

## 9. Recording Final State

```text
RECORDING WAVE 1 = CLOSED
RECORDING WAVE 2 = CLOSED
RECORDING WAVE 3 = CLOSED
RECORDING WAVE 4 = CLOSED
RECORDING WAVE 5 = CLOSED / PRODUCTION VERIFIED
D02 ANONYMOUS QT = CLOSED / IN V1 · SHIPPED / PRODUCTION VERIFIED @ e98ba52
```

| Item | Value |
|------|--------|
| W4 verification | GREEN (prior) |
| W5 verification | GREEN · Shared Grants → RECORD @ `37892a6` |
| D02 | GREEN @ `e98ba52` |
| Cron | `0 0 * * *` |
| `CRON_SECRET` | configured (secret) |
| Retention | BEGINNER 24h · PRO 10d · LEGEND 30d |
| Max seconds | BEGINNER 30 · PRO/LEGEND `MIN(beat,180)` |
| Anti-abuse | as §6 table · concurrent = 1 |
| Take statuses | PENDING_UPLOAD · READY · FAILED · EXPIRED · DELETED |
| Surfaces | Beat recording UI · `/account/takes` · preview/download/delete APIs · Moje bity grants · `/account/shared` |
| Chromium WebM/Opus | music-metadata → audio-decode fallback preserved (`9f6f006`) |
| Shared grants | **Delivery** SHIPPED / PRODUCTION VERIFIED @ `37892a6` (D03 · RECORD only) |

**Expiry AuthZ is immediate** (preview/download DENY when `expires_at` past). Janitor cleans Storage/lifecycle on daily schedule (Hobby).

Closeout D02: [RECORDING_D02_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)
Closeout Fala 3.5.1: [FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md](./audits/FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md) · **CLOSED** · Owner **PRELIMINARY PASS** · **NOT DEPLOYED**
Closeout W5: [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)
Closeout W4: [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md)

---

## 9b. E3 Full Audio Final State (through E3.7 local)

> **Historical snapshot** at E3.7 wave closeout (DARK). Living Production after PE + GO #5 is in §1 / §2 / §18 (`6dfd201` · flags ON · GREEN).

```text
E3.1 = CLOSED / PRODUCTION VERIFIED
E3.2 = CLOSED / PRODUCTION VERIFIED
E3.3 = CLOSED / PRODUCTION VERIFIED
E3.4 = CLOSED / PRODUCTION VERIFIED
E3.5 = CLOSED / PRODUCTION VERIFIED @ fbece37
E3.6 = CLOSED / PRODUCTION VERIFIED @ 183b2a4
E3.7 = CLOSED / PRODUCTION VERIFIED @ 17c4d530 · DARK (not render-enabled)
E3 FLAGS = DARK
PRODUCTION RENDER = NOT ENABLED
```

| Item | Value |
|------|--------|
| Architecture | C — HYBRID LOCKED |
| OD-E36-04 | **OPTION C** — native/system FFmpeg + libmp3lame on EXTERNAL worker · **not** npm app dependency |
| Codec (Basic) | MP3 128 kbps stereo · `server-basic-v1` |
| Codec (Premium) | HQ MP3 **320** · WAV **44.1/16/stereo** · `server-pro-v1` Final Truth |
| Master Pro | **Plan A** (`MasterParameters`) after Pro Mix · OD-E37-01 · no `MasterProParams` |
| Preview vs Final | `webaudio-pro-v1` ≈ preview · `server-pro-v1` = Final Truth |
| Download AuthZ | `quality_tier` → `EXPORT_*` |
| Worker | EXTERNAL · script-driven · requires secret when enabled |
| Fake-complete | Domain/CI only · **not** Final Truth |
| Artifacts | Private `audio-artifacts` · signed download |
| Repository / Production | `17c4d530` · `dpl_BsdUUMvwsgg3xGJthfSYXE52rQCe` · feature dark |
| Closeout E3.6 | [E3_6_PRODUCTION_CLOSEOUT.md](./audits/E3_6_PRODUCTION_CLOSEOUT.md) |
| Closeout E3.7 | [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md) |
| Design Freeze E3 PE | [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md) |

**INFO (non-blockers):** G5 soft RMS (not BS.1770) · Live Full E2E / real Production render **NOT EXECUTED** (DARK).

---

## 10. Community Upload Final State

**Status:** EPIC COMPLETE / LOCKED @ `c5e1f17`

Lifecycle (server AuthZ + RLS):

```text
DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED
REJECTED → DRAFT (return)
```

Also: rejection_reason · submit cooldown · ownership · moderation UI · READY master audio gate · private Storage · IDOR protections.

Freeze: [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)

---

## 11. Decision vs Delivery (D02 / D03 / E3)

**Do not reinterpret Owner decisions.** Decision status ≠ delivery status.

| ID | Decision status (unchanged) | Delivery status (shipped product) | Implementation GO |
|----|----------------------------|-----------------------------------|-------------------|
| **D02 / OD-REC-02** Anonymous QT | **CLOSED** = **IN V1** | **SHIPPED / PRODUCTION VERIFIED** @ `e98ba52` | COMPLETE |
| **D03 / OD-REC-03** Shared grants + RECORD | **CLOSED** = **IN Recording EPIC** | **SHIPPED / PRODUCTION VERIFIED** @ `37892a6` (RECORD only) | Wave 5 COMPLETE |
| **E3.1–E3.6** | Hybrid C + OAD LOCKED · OD-E36-04 = C | **SHIPPED / PRODUCTION VERIFIED** @ `183b2a4` · **DARK** | E3.1–E3.6 COMPLETE · enablement = separate GO |
| **E3.7** | OD-E37-01/02/03 LOCKED | **SHIPPED / PRODUCTION VERIFIED** @ `17c4d530` · **DARK** | Waves A–H COMPLETE · enablement = separate Owner GO |
| **E3.8 W6** | OD-W6-03 CLOSED / OWNER ACCEPTED emulated | **CERT CLOSED / PASS** · W6.2/W6.3 UX **PRODUCTION VERIFIED** @ `9026fa9` | [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md) |
| **E3 Production Enablement** | **OD-E3-PE-01=B · PE-02=PROVISION NOW · PE-03=RUNTIME GATE · PE-04=W6 UX FIRST · PE-05=CONTROLLED RENDER** | **COMPLETE** · AC-PE-12 **PASS** @ `6dfd201` · GO #5 **PASS** · Prod `dpl_3H57UgU2TfqkYawzamsVJ13qnMsG` | [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md) · [E3_WORKER_INFRASTRUCTURE_GO2.md](./audits/E3_WORKER_INFRASTRUCTURE_GO2.md) |

Further freeze/SSOT/OPEN_DECISIONS deep wording sync remains optional Owner clarification — not silently rewritten beyond delivery status.

---

## 12. Known Deferred Features

| Item | Classification |
|------|----------------|
| Premium Production E2E / Premium fixture | DEFERRED · no fixture seeded for closeout |
| Artifacts janitor / ops dashboard / live rollback drill | DEFERRED (accepted for first enablement) |
| Later E3 product expansions (STEMS, public Free HQ/WAV, etc.) | **NOT SELECTED** — Owner only · do not invent scope |
| Grant PLAYBACK / DOWNLOAD | OUT of Wave 5 · separate Owner GO if ever needed |
| Track publish from recording | DEFERRED |
| Watermark / global codec registry (OD-12/13) | OPEN (E3 Basic 128 locked via OAD-06) |
| Payments / Premium catalog product | DEFERRED · OPEN OD-04/07/08 |
| Comments / voting / messaging | DEFERRED · product future |
| Visual brand / copy final (OD-15/16) | OPEN |
| STEMS | DEFERRED (OAD-04) |

---

## 13. Open Product Areas

Do **not** start these without explicit Owner GO (product epic selection is Owner-only):

- Premium Production E2E / payments / Premium catalog product
- Public Free HQ/WAV (OUT of Free public release)
- STEMS / artifact_kind expansions
- Grant PLAYBACK / DOWNLOAD (beyond Wave 5 RECORD)
- Track publish
- Social: comments, voting, messaging
- Artifacts janitor / ops dashboard (deferred ops)

---

## 14. Documentation SSOT

| Doc | Role |
|-----|------|
| [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) | **Cold-start continuity (this file)** |
| [PROJECT_STATE.md](./PROJECT_STATE.md) | WHERE ARE WE NOW |
| [ssot/MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md) | WHAT / product truth |
| [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md) | HOW |
| [architecture/RECORDING.md](./architecture/RECORDING.md) | Recording index |
| [architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) | E3 architecture lock |
| [architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](./architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md) | E3 waves |
| [audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md) | E3 Production Enablement Design Freeze |
| [audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md) | E3.8 W6 closeout · CLOSED / PASS |
| [audits/E3_8_W6_MOBILE_CERT_PLAN.md](./audits/E3_8_W6_MOBILE_CERT_PLAN.md) | E3.8 W6 Design Freeze |
| [audits/E3_8_W6_CERT_CHECKLIST.md](./audits/E3_8_W6_CERT_CHECKLIST.md) | E3.8 W6 certification checklist |
| [decisions/DECISION_LOG.md](./decisions/DECISION_LOG.md) | WHY closed |
| [decisions/OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md) | Still OPEN |
| [CHANGELOG.md](./CHANGELOG.md) | What changed |
| [DOCUMENTATION_CONTINUITY.md](./DOCUMENTATION_CONTINUITY.md) | Continuity rule |
| `docs/phases/*` | Scope freezes |
| `docs/audits/*` | Audits / closeouts |

**For agents establishing implementation / shipped state:** code + remote schema are evidence first; then PROJECT_STATE → this handoff → SSOT / architecture / feature docs / CHANGELOG.
Documentation describes product/design/continuity intent; it is **not** standalone proof of shipped implementation.

---

## 15. Development Workflow

```text
AUDIT FIRST
→ CURRENT STATE / OPTIONS
→ DESIGN FREEZE (if needed)
→ OWNER GO
→ IMPLEMENT
→ TEST
→ DOCUMENTATION
→ AUDIT
→ OWNER REVIEW
→ COMMIT
→ PUSH
→ DEPLOY
→ PRODUCTION VERIFY
→ CLOSE
```

No commit/push/deploy without explicit Owner GO for that step.

---

## 16. Rules for Cursor Agent

- No product decisions; no scope expansion; no reopening closed decisions.
- No implementation without Owner GO.
- Audit → report → wait.
- Secrets: never commit, never print, never expose.
- Do not stage `.agents/` / `.cursor/` / `skills-lock.json` as product.
- After implementation: full workflow through production verify + docs.
- Prefer Polish Owner prompts; keep technical identifiers in English.
- Decision CLOSED ≠ feature SHIPPED (see §11).
- Do **not** enable E3 Production flags/secrets without separate Owner GO.

---

## 17. Rules for New GPT

- Act as Architecture / Product / RCA Lead.
- Read this handoff + PROJECT_STATE + SSOT before proposing epics.
- Do not guess repo state — require Cursor audit.
- Give Cursor ready Polish prompts with hard scope boundaries.
- Gate Owner GO at freeze / implement / commit / push / deploy / enablement.
- Treat documentation as continuity layer; fix drift in docs, not by rewriting closed product truth silently.
- Do **not** auto-pick the next product EPIC.

---

## 18. Next Session Entry Point

```text
CURRENT PRODUCTION = 42369c0
DEPLOYMENT = 6802739724 / dpl_7hbfYd1wD6QGAbV6vLqLCXusjx7X
FALA 1B = CLOSED / PRODUCTION VERIFIED — GREEN
FALA 1A = CLOSED / PRODUCTION VERIFIED @ fdf74f9
W6.2/W6.3 UX SHIP = CLOSED / PRODUCTION VERIFIED @ 9026fa9
E3.8 W6 CERT = CLOSED / PASS (Owner-accepted emulated)
E3 = PRODUCTION VERIFIED — GREEN (PASS WITH FINDINGS)
AC-PE-12 = PASS (historical @ 6dfd201)
GO #5 = PASS
OWNER GO #2 = CLOSED / SUPERSEDED (Contabo)
WORKER = STOPPED / DISABLED (bootstrap 92496d4)
E3_MIX_ENABLED = ON
E3_RENDER_JOBS_ENABLED = ON
E3_PUBLIC_AUDIO = ON
STORAGE-ARCH-01 = LOCKED
STORAGE-ARCH-02 = NOT STARTED
NEXT SESSION ENTRY = Read FINAL_COLD_START_HANDOFF.md
                   → next wave only after separate Owner GO
```

**Do not** reopen closed E3.6/E3.7/W6/Fala 1A/1B closeouts or rewrite historical Design Freeze OD locks / OD-SA locks.
**Do not** implement dual-read / janitor / orphan delete / key migration / backup without wave Implementation GO.
**Do not** auto-start Fala 1C.

Cold start: [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md)
Fala 1B closeout: [FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md](./audits/FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md)
Storage freeze: [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · audit: [STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md)
GO #2 record: [E3_WORKER_INFRASTRUCTURE_GO2.md](./audits/E3_WORKER_INFRASTRUCTURE_GO2.md)
Enablement freeze: [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md)

New GPT:

```text
AUDIT → CURRENT STATE → OPEN SURFACE → OPTIONS → DESIGN FREEZE → OWNER GO
```

New Cursor:

```text
AUDIT FIRST → REPORT → WAIT FOR OWNER GO
```

Start reading order:

1. [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md)
2. This file (`MASTER_HANDOFF.md`)
3. [PROJECT_STATE.md](./PROJECT_STATE.md)
4. [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · [STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md)
5. [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md)
6. [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md)
7. [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)
8. [MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md)
9. [SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md)
10. [OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md)

---

## 19. Known Risks / Technical Debt

### ACTIVE

| Item | Notes |
|------|--------|
| Dual SHA (app vs worker) | Production app `42369c0` · Contabo worker bootstrap `92496d4` — intentional; do not auto-align without Owner GO |
| Docs tip ≠ production app SHA (after docs closeout) | Docs-only commits may advance `origin/main` without redeploy — intentional |
| FAR-01 legacy USER beat keys | LIVE majority legacy shape · code validators canonical-only today · **STORAGE-ARCH-02** dual-read · **no Implementation GO** |
| HIBP / leaked-password protection | **P1-A BLOCKED** — Owner Dashboard; Advisor WARN until enabled |
| Hobby daily janitor | Takes janitor only · Storage cleanup lag ≤ ~24h; AuthZ expiry is still immediate |
| Artifacts janitor missing | F-PE-04 / OD-SA-05 · **STORAGE-ARCH-03** future wave |
| React hydration warning on `/beat/[id]` | **INFO** · **BLOCKER = NO** · observed in `next dev`; do not hotfix without Owner GO |

### DEFERRED / TECHNICAL DEBT

| Item | Notes |
|------|--------|
| **P2 OPS / MIGRATION DRIFT** | Local vs remote migration version names — ops reconciliation later |
| Delete Storage-before-DB order | Documented MEDIUM residual from W4 audit — not hotfix without GO |
| Janitor leftover `object_key` re-scan | Ops efficiency debt |
| `computeInterimRecordingMaxSeconds` deprecated helper | Cleanup debt |
| Beat-audio orphan janitor | Historical known gap · OD-SA-08 · STORAGE-ARCH-04/05 (inventory → dry-run → Owner GO) |
| Source MASTER backup before scale | OD-SA-06 · STORAGE-ARCH-07 · threshold defined at Wave 07 |
| OD-12 interim MIME allow-list | Codec SSOT still OPEN outside E3 OAD-06 |
| Root/docs historical SHAs in older audits | Historical snapshots — do not “fix” by rewriting history |

### OUT OF SCOPE / NOT ENABLED (current delivery)

STEMS · artifact_kind · public Free HQ/WAV · payments/Premium catalog · Premium Production E2E · artifacts janitor / ops dashboard · grant PLAYBACK/DOWNLOAD · track publish · comments/voting/messaging product UIs · FFmpeg as npm app dependency · MasterProParams / True Peak / BS.1770 product expansion · artwork bucket (OD-SA-04) · STORAGE-ARCH-02+ without Implementation GO.

---

## 20. Current Verification State

| Area | State |
|------|--------|
| Production app | **GREEN** @ `42369c0` · deploy `6802739724` / `dpl_7hbfYd1wD6QGAbV6vLqLCXusjx7X` · Fala 1B **PRODUCTION VERIFIED — GREEN** · Mix/Jobs/PUBLIC_AUDIO **ON** |
| AC-PE-12 / GO #5 | **PASS** |
| STORAGE-ARCH-01 | **LOCKED** · Final Arch Review **PASS WITH FINDINGS** · Implementation **NOT STARTED** · Production mutations **NONE** |
| Production deploy E3.7 (historical) | SUCCESS · READY @ `17c4d530` · `dpl_BsdUUMvwsgg3xGJthfSYXE52rQCe` |
| E3.7 Production Verify (historical closeout) | **PASS** · DARK at that time · real render **NOT EXECUTED** then |
| E3.7 Owner Verification (historical) | **PASS WITH FINDINGS** · G5 soft RMS INFO · COMMIT+PUSH+DEPLOY DONE @ `17c4d530` |
| Production deploy E3.6 (prior) | SUCCESS @ `183b2a4` · `dpl_D5EfHdSSahouFftf5HK35wKSHmts` |
| Public smoke `/` · `/beats` | PASS (prior E3.6) |
| E3 anon job API | 401 (prior) |
| E3 worker API (no/wrong secret) | 401/403 class (verified in PE) |
| `audio-artifacts` | private · PE artifacts exist (not a public bucket) · janitor still deferred |
| D02 / W1–W5 | Remain PASS |
| Recording W5 Shared Grants | PASS (prior) |
| Recording W4 live E2E | PASS (prior) |
| Community epic | CLOSED (prior production verify) |
| P1-B DEFINER grants | CLOSED / VERIFIED @ `b4199ef` |
| P1-C `set_updated_at` | CLOSED / VERIFIED @ `b4199ef` |
| P1-A HIBP | **BLOCKED** (Owner Dashboard) |

---

## 21. Handoff Closeout

```text
MASTER HANDOFF READY
CURRENT PRODUCTION = 42369c0
DEPLOYMENT = 6802739724 / dpl_7hbfYd1wD6QGAbV6vLqLCXusjx7X
FALA 1B = CLOSED / PRODUCTION VERIFIED — GREEN
FALA 1A = CLOSED / PRODUCTION VERIFIED @ fdf74f9
W6.2/W6.3 UX SHIP = CLOSED / PRODUCTION VERIFIED @ 9026fa9
E3.8 W6 = CLOSED / PASS
E3 = PRODUCTION VERIFIED — GREEN (PASS WITH FINDINGS)
AC-PE-12 = PASS · GO #5 = PASS
OWNER GO #2 = CLOSED / SUPERSEDED (Contabo)
E3 FLAGS = Mix ON · Jobs ON · PUBLIC_AUDIO ON
WORKER = STOPPED / DISABLED (bootstrap 92496d4)
STORAGE-ARCH-01 = LOCKED
STORAGE-ARCH-02 = NOT STARTED
NEXT SESSION ENTRY = FINAL_COLD_START_HANDOFF.md
                   → next wave only after Owner GO
```

**Do not** rewrite historical closeouts or freeze OD locks from this document alone.

---

*End of Master Handoff.*
