# BitRymDym — Master Handoff

**Purpose:** Pełna ciągłość cold-start dla nowego GPT + Cursor Agent.
**Updated:** 2026-10-07 — **P6.7 PRODUCTION VERIFIED — GREEN** @ **`06c60b5`** · dpl `dpl_CpGUtwjDbvXdJ8oEuDyDFjQ1UgNp` · Vitest **1519 PASS · 1 SKIP** · P6.6 GREEN unchanged · P6.5 Scenario B **BLOCKED / INCONCLUSIVE** · **do not start P6.8**
**Owner:** Prezes Dawid

**Ultra entry (czytaj najpierw):** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md)
**Living state:** [PROJECT_STATE.md](./PROJECT_STATE.md)
**FAR-01 living ops (historyczny / nie NEXT):** [FAR_01_CURRENT_STATE.md](./audits/FAR_01_CURRENT_STATE.md)

**Ten dokument = continuity** (szczegółowy cold-start).
Product WHAT: [MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md). Technical HOW: [SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md).

**Evidence rule:** code + remote schema + production evidence > documentation prose.
Decision CLOSED ≠ SHIPPED. SHIPPED ≠ PRODUCTION VERIFIED.

**Planes:** REPOSITORY · PRODUCTION APP · PRODUCTION DB · PRODUCTION STORAGE · SESSION/OPERATOR — never merge.

---

## 1. Current Production

| Field | Value |
|-------|--------|
| URL | https://www.bitrymdym.pl · https://bitrymdym.pl |
| **Repository HEAD / origin/main** | Advances with Gate SSOT docs tip (app tip `06c60b5` P6.7) |
| **Production application SHA** | `06c60b54234db5d27682a607f6a80dececc7257e` (`06c60b5`) — **P6.7 Clip Fades** |
| **Production deployment** | `dpl_CpGUtwjDbvXdJ8oEuDyDFjQ1UgNp` · served Studio chunk `0g5xoq_48-8xn.js` |
| **Studio baseline** | **P6.7 PRODUCTION VERIFIED — GREEN** · prior **P6.6 GREEN** · **P6.5** Master metering shipped · Scenario A **PROVEN** · Scenario B **BLOCKED / INCONCLUSIVE** |
| **Last Studio Production Verify** | P6.7.4 gate **GREEN** @ `06c60b5` · Vitest **1519 PASS · 1 SKIP** · fades/CAS/trim/split/runtime · mobile ~390 · security · P6.5 Scenario B **unchanged BLOCKED / INCONCLUSIVE** |
| **NEXT UNIT** | **STOP after P6.7** — do **not** start P6.8 · do **not** reopen P6.6.1–P6.6.3 / P6.5 Scenario B / P6.4.4 · Owner decides next |
| **Known waiver** | `e3-7-f-download-authz` / `EXPORT_WAV` · **PRE-EXISTING / OUT OF SCOPE / WAIVED BY OWNER** |
| **Production DB tip** | includes Studio P5.1 schema + P3 `claim_anon_take_to_account` + admin W4 + P1 `sample_policy_settings` · verify remote before DB work |
| **Studio P5.1–P5.6** | **PRODUCTION VERIFIED — GREEN** (foundation → Take Workflow · `finalize ≠ place`) |
| **P5.8 Studio Devices / Input** | **PRODUCTION VERIFIED — GREEN** @ `95e04ff` · [freeze](./decisions/P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md) |
| **P5.10 Studio Audio Engine** | **PRODUCTION VERIFIED — GREEN** @ `9c2a958` · [freeze](./decisions/P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md) |
| **Fala 3.5.1 Recording Experience** | **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** @ `c690831` · [RECORDING.md](./architecture/RECORDING.md) |
| **P3 Anonymous → Account Claim** | **COMPLETE / PRODUCTION VERIFIED — GREEN** @ `dabbc936` · **UNCHANGED** · [RECORDING.md](./architecture/RECORDING.md) |
| **POLISH-01** | **CLOSED / PRODUCTION VERIFIED** @ `579acb3` · residual `1c63080` · [DF](./audits/POLISH-01_DESIGN_FREEZE.md) |
| **P0 / P1 / P2 (recording security)** | **CLOSED / PRODUCTION VERIFIED** @ `fdfff71` / `5927e35` / `943d81e` |
| **USER-FACING POLISH (historical)** | CLOSED @ `ffe723b` — **superseded living tip by POLISH-01** · [closeout](./audits/USER_FACING_POLISH_LOCALIZATION_IMPLEMENTATION.md) |
| **ADMIN USER MANAGEMENT** | **W3 CLOSED / PRODUCTION VERIFIED** @ `237a86f` · **W4 CLOSED / PRODUCTION VERIFIED** @ `ddcee65` · EMAIL E2E **PASS** · [W4 freeze](./decisions/ADMIN_USER_DELETE_DESIGN_FREEZE.md) |
| **CREATOR PROGRESS W1** | **IMPLEMENTED / PRODUCTION VERIFIED WITH OPEN ITEMS** @ `76a4757` — Experience + Rank foundation · [closeout](./audits/CREATOR_PROGRESS_W1_CLOSEOUT.md) |
| **CREATOR PROGRESS W2-A** | **CLOSED / PRODUCTION VERIFIED WITH FINDINGS** @ `6ee3255` · OD-08 CLOSED · [closeout](./audits/CREATOR_PROGRESS_W2A_CLOSEOUT.md) · [implementation](./audits/CREATOR_PROGRESS_W2A_IMPLEMENTATION.md) · [W2 Design Contract](./decisions/W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md) |
| **CREATOR PROGRESS W2-B** | **PRODUCTION VERIFIED WITH NON-BLOCKING FINDING** @ `d86b4df` (still in tree; tip advanced) · ANON/FREE/BRONZE/SILVER/GOLD download E2E **PASS** · OD-17 **PASS** · P2-1 **VERIFIED RESOLVED** · P2-2/3/4 **OPEN** · Mix/Render **DEFERRED** · [implementation](./audits/CREATOR_PROGRESS_W2B_IMPLEMENTATION.md) · [Design Contract](./decisions/W2B_PREMIUM_ENFORCEMENT_DESIGN_CONTRACT.md) · [audit](./audits/CREATOR_PROGRESS_W2B_AUDIT.md) |
| **USER-CLEANUP-01** | **EXECUTED** (fixtures) · removed FAR-01 retain-set **outside** FAR-01 retirement · orphans **32** at cleanup time · later **ARCH-05** deleted those 32 from production (living orphans **0**) |
| **USER-ID-01** | **PRODUCTION VERIFIED — GREEN** · Dawid=1 · next=2 · Tajski test account **deleted** (no renumber) |
| **ACCOUNT / PROFILE-01** | **FUNCTIONALLY VERIFIED / PRODUCTION VERIFIED — GREEN** · Fresh Recovery E2E **PASS** · Delete Account E2E **PASS** · published-USER retain branch **CODE/CONTRACT VERIFIED · NOT LIVE-DATA VERIFIED** · W1 ledger CASCADE **COMPATIBLE · LIVE DELETE+LEDGER E2E OPEN** |
| **FAR-01 DB roles** | `20261002231150` / `far01_r1_dryrun_readonly_role` · `20261003012453` / `far01_live_mutator_role` |
| Status | **GREEN** · FAR-01 **SOAK COMPLETE / CONTAMINATED** · retirement **NOT EXECUTED** |
| **FAR-01 DR-A (Phase 1)** | **SHIPPED** / **PRODUCTION VERIFIED** @ `f514a51` (historical) — [FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md](./audits/FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md) |
| **FAR-01 campaign** | **SOAK COMPLETE / CONTAMINATED** — canary N=5 PASS · fleet N=62 PASS · soak clock elapsed · integrity **FAILED** — [FAR_01_CURRENT_STATE.md](./audits/FAR_01_CURRENT_STATE.md) |
| **FAR-01 CLOSED** | **NO** |
| **FAR-01 RETIREMENT** | **NOT EXECUTED** · original retain-set **0** (gone via USER-CLEANUP-01 collateral — **not** FAR-01 retirement) |
| **ARCH-04/05 orphan GC** | **CLOSED / VERIFIED** · live **11 / 8 / 3 / 0 / 0** · DELETE **32/32** historical — [reconciliation](./audits/ARCH_05_POST_DELETE_RECONCILIATION.md) · [execution](./audits/ARCH_05_DELETE_EXECUTION.md) |
| **DEF-01** | **CLOSED / PRODUCTION VERIFIED** @ `fbc696f` |
| **ACTIVE P0 / P1** | **NONE VERIFIED** |
| **HIBP** | **DEFERRED / ACCEPTED RISK** (not solved) |
| **Polish UX (historical Wave)** | **CLOSED** / **PRODUCTION VERIFIED** @ `0afa29b` (superseded by USER-FACING POLISH LOCALIZATION @ `ffe723b`) |
| **Wave A / B / Fala 1A/1B** | CLOSED / PRODUCTION VERIFIED (historical SHAs unchanged) |
| **E3 status** | **PRODUCTION VERIFIED — GREEN** · flags ON |
| **E3.7** | Code present · Premium Production E2E **NOT TESTED** |
| **STORAGE-ARCH-01** | **LOCKED** · Hybrid C |
| **STORAGE-ARCH-02** | FUTURE DOCS · external Object Storage **NOT IMPLEMENTED** |
| **STORAGE-ARCH-07** | **DESIGN FREEZE COMPLETE** · VPS COPY **43/43** · Local Layer-2 freeze **COMPLETE** · AWS **DEFERRED** — [freeze](./audits/STORAGE_ARCH_07_DESIGN_FREEZE.md) · [local freeze](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_DESIGN_FREEZE.md) |
| **VPS BACKUP PLANE** | OD-VPS-01…20 **CLOSED** · Phase 1–6 **PASS** · **43/43 BACKED UP** · restore **3/43** — [freeze](./audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md) |
| **LOCAL WINDOWS Layer-2** | OD-VPS-LOCAL-01…12 **CLOSED** · **43/43 RESTORE VERIFIED** — [restore](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md) · [impl](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION.md) |
| **Historical local DB backup** | **FOUND** · PostgreSQL CUSTOM dump · **≠ Storage object backup** — [audit](./audits/HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md) |
| **Supabase Storage object backup** | VPS **43/43** · Local Windows **43/43 RESTORE VERIFIED** · AWS **DEFERRED** |
| **Worker** | Contabo **EXTERNAL COMPUTE** · bootstrap `92496d4` · **STOPPED / DISABLED** · Contabo ≠ durable library (unchanged) |
| Recording Wave 4–5 / D02 (product) | CLOSED / PRODUCTION VERIFIED |
| D02 live harness debt | **CLOSED** @ `44dc22c` (**TEST ONLY**) |
| Cron | `0 0 * * *` → `/api/cron/takes-janitor` |
| `CRON_SECRET` | CONFIGURED (**never print / never commit**) |
| Supabase project | `rzzxrgcdogkybkiidqgw` |

**Studio living rules (P5.10 reconcile):**

```text
StudioTransport != PlayerProvider
StudioAudioEngine != PlayerProvider
StudioAudioEngine != E3 Mix product graph
finalize ≠ place (P5.6 frozen)
P5.10 playback  = StudioTransport → StudioAudioEngine
                · one engine / editor · AudioContext · Track/Master graph
                · planVoicesAtPlayhead · overlap = MIX
                · first-wins removed from Studio transport path
                · persist/UI = integer ms · runtime = AudioContext.currentTime + epoch
                · STOP = playhead 0
                · mix SSOT = Web Audio graph (not HTMLAudioElement.volume)
                · isTrackAudible · gainDbToLinearVolume · normalizePan
P5.8 devices    = enumerateDevices · permission UNKNOWN|REQUESTING|GRANTED|DENIED|BLOCKED|UNAVAILABLE
                · selectedDeviceId (null/default · stale → fallback)
                · localStorage bitrymdym.studio.selectedAudioInputDeviceId (not Profile/Project/DB)
                · devicechange recording-safe · useMicAnalyser → BrdInputMonitor
                · UNCHANGED in P5.10
Recording       = P5.5/P5.6/P5.8 SSOT · engine may consume READY Take · does not own
                session / eligibility / finalize / upload / claim / getUserMedia / devices / meter
P6 product FX   = P6.1–P6.4.3 PRODUCTION VERIFIED — GREEN
                · P6.5 Master metering SHIPPED @ 2258bdb
                · P6.5 Scenario A PROVEN · Scenario B BLOCKED / INCONCLUSIVE (do not reopen)
                · P6.6 On-demand Track Peak PRODUCTION VERIFIED — GREEN @ c825e42
                · P6.7 Clip Fades PRODUCTION VERIFIED — GREEN @ 06c60b5
                · topology: Track Pan → 0|1 Track Analyser → Σ → … → Master Analyser
                · engine foundation SHIPPED (P5.10 GREEN)
                · Automation / Autotune = NOT READY
                · P6.7 = Clip GainNode fades · set_fades CAS · Trim/Split fade inherit
                · next = STOP (do not start P6.8)
Track Type + Capabilities = future (document condition before P7 expansion)
document_version          = exists · NOT frozen autosave contract (condition before autosave)
ARTIFACT playback         = adapter stub / unavailable (non-blocking)
P6 = product FX / Mix / Master + on-demand Track metering (P6.5/P6.6) · routing / buses / automation later
P7 = samples / scratch / instruments / pitch / stretch / reverse / loop / drag-drop
     · track enum reserved READY WITH REFACTOR · instrument engines NOT READY
```

**P5.10 served-JS / cache (release note):** GitHub `9c2a958` · `dpl_L7pB5A8iuY8CKipxbLsGEVLESZTC` · **Skipping build cache** · HTML `no-store`/`MISS` · chunk `0p8mql3sjqfx_.js` contains `StudioAudioEngine` (no `pickTakeClipAtPlayhead` / `takeAudioRef`). Production Gate must verify **served artifact** (P5.8 stale-cache lesson).

**P5.8 deployment incident (historical):** initial deploy claimed `95e04ff` but served pre-P5.8 Studio device JS due to **stale Vercel build cache**; recovered with no-cache redeploy → `dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S`.

**E3 Production flags:**

```text
E3_MIX_ENABLED           = ON
E3_RENDER_JOBS_ENABLED   = ON
E3_PUBLIC_AUDIO          = ON
E3_RENDER_WORKER_SECRET  = CONFIGURED (server-only · never commit)
WORKER                   = STOPPED / DISABLED  (EXTERNAL COMPUTE · Contabo)
```

**FAR-01 living inventory (post ARCH-05 DELETE):** living USER masters **8** · platform **3** · orphan/historical/delete-residue **0** · beat-audio total **11** · retained FAR-01 sources **0** · quarantine **0** · MIGRATE **0** · DB keys missing Storage **0**.
Pre-ARCH-05 snapshot (do not reuse as living): USER 8 / PLATFORM 3 / ORPHAN 32 / TOTAL 43. Superseded soak baseline: 77 / 97 / 67 / 1.

**Do not confuse SHAs / planes:**

| SHA / ID | Meaning |
|----------|---------|
| `9c2a958` | **PRODUCTION APP** · P5.10 Studio Audio Engine · **current production baseline** |
| `dpl_L7pB5A8iuY8CKipxbLsGEVLESZTC` | **PRODUCTION DEPLOYMENT** (GitHub 9c2a958 · no-cache) |
| `e191f5c` | Historical — P5.10 Design Freeze (docs) |
| `5cbed12` | Historical — P5.9 Architecture Audit (docs) |
| `c4c7569` | Historical — P5.8 SSOT reconcile (docs) |
| `95e04ff` | Historical — P5.8 Studio Devices / Input (prior production app) |
| `dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S` | Historical — P5.8 no-cache recovery deploy |
| `7f80143` | Historical — P5.6 Studio Take Workflow (pre-P5.8 production tip) |
| `44dc22c` | **TEST ONLY** · D02 live harness fix · not a production deploy |
| `75bd80f` | Historical — Fala 3.5.1 production verification baseline |
| `dabbc936` | Historical — P3 Anonymous → Account Claim production tip · `dpl_Hd4QAwDkkw99FMiFhh8nJ1N6nvsR` |
| `c690831` | Fala 3.5.1 feature · `feat(audio): close recording experience 3.5.1` |
| `1c63080` | Historical — POLISH-01 residual hotfix · prior tip |
| `579acb3` | Historical — POLISH-01 localization feature |
| `943d81e` / `fa7bfe3` | Historical — P2 Explicit Sample Replace (+ docs verify) |
| `5927e35` / `c38e8d2` | Historical — P1 Sample Policy (+ docs verify) |
| `fdfff71` / `23577a3` | Historical — P0 PLATFORM master download deny (+ docs verify) |
| `ddcee65` | Historical — ADMIN W4 · prior production tip |
| `237a86f` | Historical — ADMIN USER MANAGEMENT W3 |
| `ffe723b` | Historical — USER-FACING POLISH LOCALIZATION (pre POLISH-01) |
| `d86b4df` | Historical — W2-B Premium Enforcement |
| `6ee3255` | Historical — W2-A Premium tier foundation |
| `76a4757` | Historical — Creator Progress W1 |
| `e03f3be` | Historical — FAR-01 operator tooling tip |
| `fbc696f` | DEF-01 security harden |
| `92496d4` | Worker bootstrap (Contabo EXTERNAL encode) |
| older UX/E3 tips | Historical closeouts — see CHANGELOG |

---

## 2. Current Git Baseline

| Field | Value |
|-------|--------|
| Branch | `main` |
| Remote | `origin` → `https://github.com/dawidthai125/BitRymDym` |
| **HEAD / origin/main** | Advances with this SSOT reconcile (app tip `9c2a958`) |
| **Production application** | `9c2a958` — P5.10 · **UNCHANGED** this docs wave |
| **Production deployment** | `dpl_L7pB5A8iuY8CKipxbLsGEVLESZTC` |
| **P5.1–P5.6** | **PRODUCTION VERIFIED — GREEN** |
| **P5.8** | **PRODUCTION VERIFIED — GREEN** @ `95e04ff` |
| **P5.9** | **Architecture Audit · GO WITH CONDITIONS** |
| **P5.10** | **PRODUCTION VERIFIED — GREEN** @ `9c2a958` |
| **D02 harness** | **CLOSED** @ `44dc22c` (**TEST ONLY**) |
| **P5.7** | **Architecture Audit · GO WITH CONDITIONS** |
| **E3** | **PRODUCTION VERIFIED — GREEN** |
| **STORAGE-ARCH-01** | **LOCKED** |
| **POLISH-01** | **CLOSED / PRODUCTION VERIFIED** |
| **P0 / P1 / P2** | **CLOSED / PRODUCTION VERIFIED** · **UNCHANGED** |
| **P3** | **COMPLETE / PRODUCTION VERIFIED — GREEN** · **UNCHANGED** |
| **Fala 3.5.1** | **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** @ `c690831` |
| **FAR-01** | **SOAK COMPLETE / CONTAMINATED** · **RETIREMENT NOT EXECUTED** · **NOT CLOSED** |
| **NEXT GATE** | **P6.7 Owner GO → implementation** (freeze GO) · P3 `p_take_id` = **NON-BLOCKING** |
| Typical local residue (do not stage) | `.agents/` · `.cursor/` · `skills-lock.json` · `infra/oracle/` · `.env*` · secrets · backup artifacts · unrelated WIP |

Git rules: **never** `git add .` / `-A` / `-u` — exact allowlist only. **Nie czyść** dirty WIP bez Owner GO.

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

Storage V1: [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · [STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md) · Future scale: [STORAGE_ARCH_02_FUTURE_SCALABILITY.md](./architecture/STORAGE_ARCH_02_FUTURE_SCALABILITY.md)

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
STORAGE-ARCH-02              = FUTURE SCALABILITY DOCS PREPARED · NOT IMPLEMENTED · NO CURRENT INVESTMENT
STORAGE-ARCH-02-KEY          = PHASE 1 DR-A SHIPPED @ f514a51 · FAR-01 SOAK COMPLETE/CONTAMINATED · RETIREMENT NOT EXECUTED · see FAR_01_CURRENT_STATE.md
STORAGE-ARCH-07              = DESIGN FREEZE COMPLETE · OD-SA-07-01…16 CLOSED
                             · VPS COPY 43/43 · Local Layer-2 freeze COMPLETE · AWS DEFERRED
VPS BACKUP PLANE             = OD-VPS-01…20 CLOSED · Phase 1–6 PASS · VPS 43/43 BACKED UP · restore 3/43
                             · bitrymdym-backup + /srv/bitrymdym-backup · docs/audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md
LOCAL WINDOWS Layer-2        = OD-VPS-LOCAL-01…12 CLOSED · 43/43 RESTORE VERIFIED
                             · docs/audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md
AWS                          = DEFERRED
DB RECOVERY ARTIFACT         = FOUND (local historical pg_dump CUSTOM) · restore NOT VERIFIED
                             · docs/audits/HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md
STORAGE OBJECT BYTES BACKUP  = VPS 43/43 · LOCAL 43/43 RESTORE VERIFIED · AWS 0
Production mutations         = NONE for FAR-01 retirement (retain-set removed outside FAR-01 retirement flow)
```

| Topic | Locked value |
|-------|----------------|
| Buckets | Reuse 3 existing only (OD-SA-01) |
| Legacy keys | Phase 1 DR-A dual-accept **SHIPPED** @ `f514a51` · FAR-01 backfill executed · **FAR-01 RETIREMENT NOT EXECUTED** |
| Future external Object Storage | OPTIONAL · FUTURE · provider NOT chosen · [STORAGE_ARCH_02_FUTURE_SCALABILITY.md](./architecture/STORAGE_ARCH_02_FUTURE_SCALABILITY.md) |
| Beat library | MASTER + fallback (OD-SA-03) |
| Artwork | DEFERRED (OD-SA-04) |
| Artifacts janitor | REQUIRED · future wave (OD-SA-05 / STORAGE-ARCH-03) |
| Backup source MASTER | REQUIRED BEFORE SCALE (OD-SA-06) · VPS **43/43** · Local Layer-2 **43/43 RESTORE VERIFIED** · AWS **DEFERRED** — [restore](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md) |
| Historical DB recovery | Local PostgreSQL CUSTOM dump **FOUND** · LIKELY PRODUCTION / MEDIUM · **≠ Storage object bytes** — [audit](./audits/HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md) |
| Mix artifact backup | regenerable · no default backup (**OD-SA-07**) — unchanged; ≠ OD-SA-07-01…16 |
| Orphans | ARCH-05 **CLOSED / VERIFIED** · DELETE **32/32** historical · live orphans **0** · backup **43/43 RETAINED** — [reconciliation](./audits/ARCH_05_POST_DELETE_RECONCILIATION.md) |

**Wording:** BitRymDym has VPS Layer-1 and Local Layer-2 Storage bytes retained (43/43 evidence); production Storage after ARCH-05 is **11**. AWS immutable DR deferred. Historical ladder still holds for future GC: BACKED UP + RESTORE VERIFIED ≠ SAFE ≠ OWNER APPROVED ≠ DELETED.

**Do not** start further orphan/prefix cleanup or AWS Object Lock without a new Owner GO. ARCH-05 allowlist DELETE is **CLOSED**.

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
| **P1-A** HIBP / leaked-password protection | **DEFERRED / ACCEPTED RISK** (Owner · Free plan) — Advisor WARN may remain · **not solved** |
| **DEF-01** E3 DEFINER EXECUTE | **CLOSED / PRODUCTION VERIFIED** @ `fbc696f` |
| Security overall | **GREEN WITH WARNINGS** · ACTIVE P0/P1 **NONE** · residual = HIBP ACCEPTED RISK + intentional DEF-02 WARN |
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

**Premium (E3 / W2-A overlay):** `premium_entitlements` — **≠** Account Level · **≠** Creator Rank · **≠** Role · no `PremiumAudioRole`.
Repo + production @ `d86b4df` / DB `20261003221811`: `tier` (FREE/BRONZE/SILVER/GOLD) + `resolveProductEntitlement` SSOT. Inventory `premium_entitlements` = 0 after W2-B fixture cleanup (paid-tier rows were temporary fixtures only).

**W2-B (PRODUCTION VERIFIED WITH NON-BLOCKING FINDING):** beat-download daily limits from product entitlement matrix live (ANON = `PREMIUM_ANON_DOWNLOADS_DAILY` = 2 · USER = `limits.downloadsDaily` FREE4/BRONZE10/SILVER25/GOLD50). Functional E2E PASS via production RPC/signed-URL/finalize path. Legacy flat `USER_DAILY_DOWNLOAD_LIMIT` / env `DOWNLOAD_LIMIT_*` are **not** reserve-path authority. MODERATOR follows authenticated USER download entitlement limits (intentional). P2-1 binary Premium=30 render constants **VERIFIED RESOLVED**. Browser/UI Server Action journey = **NON-BLOCKING FINDING**. Mix/Render live jobs **DEFERRED**.

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
| **STORAGE-ARCH-02** future scale | **DOCS PREPARED** · **NOT IMPLEMENTED** | N/A · no external storage | OK | [STORAGE_ARCH_02_FUTURE_SCALABILITY.md](./architecture/STORAGE_ARCH_02_FUTURE_SCALABILITY.md) |
| **STORAGE-ARCH-02-KEY** Phase 1 DR-A | **SHIPPED** / **PRODUCTION VERIFIED** | GREEN WITH EVIDENCE LIMITATIONS @ `f514a51` | OK | Historical Phase 1 |
| **FAR-01 campaign (canary+fleet+soak)** | **SOAK COMPLETE / CONTAMINATED** | canary N=5 · fleet N=62 · soak clock elapsed · integrity **FAILED** | OK | **NOT CLOSED** · **FAR-01 RETIREMENT NOT EXECUTED** · retain-set **0** (USER-CLEANUP-01 collateral) · [FAR_01_CURRENT_STATE.md](./audits/FAR_01_CURRENT_STATE.md) |
| **DEF-01** | **CLOSED / PRODUCTION VERIFIED** | @ `fbc696f` · remote `20261003051539` | OK | HIBP remains **ACCEPTED RISK** |
| **CREATOR PROGRESS W1** (Experience + Rank) | **IMPLEMENTED / PRODUCTION VERIFIED WITH OPEN ITEMS** | GREEN WITH OPEN ITEMS @ `76a4757` | OK | Ledger + `experience_total` + CreatorRank · migrations `210121`→`210322` · [closeout](./audits/CREATOR_PROGRESS_W1_CLOSEOUT.md) · Premium **not** in W1 |
| STORAGE-ARCH-07 backup design | **DESIGN FREEZE COMPLETE** · AWS **DEFERRED** | OD-SA-07-01…16 CLOSED · VPS 43/43 · Local 43/43 RESTORE VERIFIED | [freeze](./audits/STORAGE_ARCH_07_DESIGN_FREEZE.md) · [restore](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md) | ARCH-05 CLOSED · prod Storage 11 |
| VPS BACKUP PLANE | **APPROVED** · Phase 1–6 **PASS** | Contabo Layer-1 · VPS 43/43 · restore 3/43 | [VPS freeze](./audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md) | AWS deferred |
| LOCAL WINDOWS Layer-2 | **RESTORE VERIFIED 43/43** | Pull-only · SHA+WAV/ffprobe PASS | [restore](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md) | ARCH-05 readiness complete |
| ARCH-05 orphan GC | **CLOSED / VERIFIED** | live **11 / 8 / 3 / 0 / 0** · backup **43/43 RETAINED** | [reconciliation](./audits/ARCH_05_POST_DELETE_RECONCILIATION.md) | do not re-open without new Owner GO |
| Later Storage waves (03–06, 08–11) | **NOT STARTED** | — | — | janitor · orphan delete · migration · optional |
| Later E3 product expansions (STEMS etc.) | **NOT SELECTED** | — | — | **Do not auto-start** |
| Track publishing from recording | NOT IMPLEMENTED | — | Future | |
| Payments / Premium catalog product | OUT OF SCOPE / NOT IMPLEMENTED | — | OD-04/07 OPEN · **OD-08 CLOSED** | Billing deferred · no checkout/UI |
| **CREATOR PROGRESS W2-A** Premium foundation | **CLOSED / PRODUCTION VERIFIED WITH FINDINGS** @ `6ee3255` | Prod DB `20261003221811` · deploy Ready | OK | [closeout](./audits/CREATOR_PROGRESS_W2A_CLOSEOUT.md) · tiers FREE/BRONZE/SILVER/GOLD · live tiers NOT VERIFIED (0 rows) · Gold 90d DESIGN ONLY · P2 OPEN |
| **CREATOR PROGRESS W2-B** Premium Enforcement | **PRODUCTION VERIFIED WITH NON-BLOCKING FINDING** @ `d86b4df` | Ready · `dpl_2wk8MJjcP5vwPR9w5hUqLmei6oGG` | OK | [implementation](./audits/CREATOR_PROGRESS_W2B_IMPLEMENTATION.md) · ANON/FREE/BRONZE/SILVER/GOLD E2E PASS · OD-17 PASS · P2-1 **VERIFIED RESOLVED** · P2-2/3/4 OPEN · Mix/Render DEFERRED · Gold 90d / janitor / billing / UI / overlay out |
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
| Creator Progress W1 (Experience + Rank) | **PRODUCTION VERIFIED WITH OPEN ITEMS** | `76a4757` · [CREATOR_PROGRESS_W1_CLOSEOUT.md](./audits/CREATOR_PROGRESS_W1_CLOSEOUT.md) |
| Creator Progress W2-A (Premium tier foundation) | **CLOSED / PRODUCTION VERIFIED WITH FINDINGS** | `6ee3255` · [CREATOR_PROGRESS_W2A_CLOSEOUT.md](./audits/CREATOR_PROGRESS_W2A_CLOSEOUT.md) |
| Creator Progress W2-B (Premium Enforcement) | **PRODUCTION VERIFIED WITH NON-BLOCKING FINDING** | `d86b4df` · [CREATOR_PROGRESS_W2B_IMPLEMENTATION.md](./audits/CREATOR_PROGRESS_W2B_IMPLEMENTATION.md) · [Design Contract](./decisions/W2B_PREMIUM_ENFORCEMENT_DESIGN_CONTRACT.md) |
| P0 PLATFORM master download deny | **CLOSED / PRODUCTION VERIFIED** | `fdfff71` · [P0_PLATFORM_MASTER_DOWNLOAD_DENY.md](./audits/P0_PLATFORM_MASTER_DOWNLOAD_DENY.md) |
| P1 Sample Policy Matrix | **CLOSED / PRODUCTION VERIFIED** | `5927e35` · [P1_SAMPLE_POLICY_MATRIX.md](./audits/P1_SAMPLE_POLICY_MATRIX.md) |
| P2 Explicit Sample Replace | **CLOSED / PRODUCTION VERIFIED** | `943d81e` · [P2_REPLACE_SAMPLE_IMPLEMENTATION.md](./audits/P2_REPLACE_SAMPLE_IMPLEMENTATION.md) |
| POLISH-01 (+ residual hotfix) | **CLOSED / PRODUCTION VERIFIED** | `579acb3` → `1c63080` · [POLISH-01_DESIGN_FREEZE.md](./audits/POLISH-01_DESIGN_FREEZE.md) |
| ARCH-05 orphan GC | **CLOSED / VERIFIED** | live **11 / 8 / 3 / 0 / 0** |
| ADMIN W0–W4 | **CLOSED / PRODUCTION VERIFIED** | tip historical `ddcee65` (W4) |

---

## 8b. Recording security + Sample Policy + Replace + POLISH-01 (living)

### P0 — PLATFORM master download deny

- User-facing DOWNLOAD of `ownership_type = PLATFORM` = **DENY**
- PLAYBACK / recording source = **ALLOW** (unchanged)
- ADMIN/OPS privileged export = **ALLOW** (zamrożony zakres — nie `DownloadButton`)
- Helper: `canDownloadOriginalBeatMaster` — **nie** generic `canDownload`
- Evidence: [P0_PLATFORM_MASTER_DOWNLOAD_DENY.md](./audits/P0_PLATFORM_MASTER_DOWNLOAD_DENY.md)

### P1 — Sample Policy

- SSOT: `getSamplePolicy` · `SAMPLE_POLICY_DEFAULTS` · `sample_policy_settings` · audit `SAMPLE_POLICY_UPDATE`
- Premium Tier = źródło limitu (Anonymous ≠ Free)
- BEGINNER bez entitlement → runtime mapuje do FREE policy
- Defaults: Bronze 60 · Silver 120 · Gold 180 · global technical max **180 s**
- Admin-only mutation · UI: **Polityka nagrań**
- Representative limits: ANON 15s/2h · FREE 30s/12h · Bronze/Silver/Gold configurable duration + day/active caps
- Evidence: [P1_SAMPLE_POLICY_MATRIX.md](./audits/P1_SAMPLE_POLICY_MATRIX.md)

### P2 — Explicit Sample Replace (Variant C)

- Claim rezerwuje `replaces_take_id` · finalize: NEW→READY · OLD→DELETED
- RPC: `claim_take_recording_session` / `claim_anon_take_recording_session` / `finalize_take_ready_swap`
- Advisory lock · one pending · unique replace target · idempotent swap
- Cross-beat replace **YES** · anonymous own replace **YES** · no `REPLACED` enum
- Abandoned PENDING preserves old READY · IDOR denied
- Storage: DB-first commit → cleanup → janitor safety net
- Evidence: [P2_REPLACE_SAMPLE_IMPLEMENTATION.md](./audits/P2_REPLACE_SAMPLE_IMPLEMENTATION.md)

### POLISH-01

| OD | Decision |
|----|----------|
| OD-PL-01 | **C** — „nagranie” = obiekt użytkownika · „próbka” = funkcja/polityka |
| OD-PL-02 | **Polityka nagrań** |
| OD-PL-03 | Free / Bronze / Silver / Gold **KEEP EN** |
| OD-PL-04 | **W moderacji** |
| OD-PL-05 | Studio **KEEP EN** |
| OD-PL-06 | Master **KEEP EN** Title Case |

KEEP EN (m.in.): Studio · Mix · Master · Premium · REC · BPM · MP3 · WAV · HQ · Free/Bronze/Silver/Gold
PL (m.in.): Gość · Administrator · Panel Administracyjny · Wersja robocza · Zatwierdzone · Gotowe · Nagrywanie

Impl `579acb3` · residual `1c63080` · verify **GREEN WITH NOTES**.

### BPM (living)

- 17 realnych MP3 · import **17/17**
- Korekty: 138→92 · 125→88 · 120→89 · 161→92 · 116→95
- **CLOSED / PRODUCTION VERIFIED** — nie reopen bez nowego evidence

### Backup / DR (living IDs)

```text
Path                 = C:\BitRymDym-Backup\
Full backup          = local-layer2-full-20261005T040146Z-42d6212b · 43/43
Restore drill        = local-restore-20261005T040831Z-76ca3678 · 43/43
SHA / size / WAV / ffprobe / manifests = PASS
VPS Layer-1          = 43/43 BACKED UP · Contabo ≠ Storage SSOT ≠ backup product
AWS                  = DEFERRED
```

### Email / test fixtures (continuity)

- Prod transactional: Resend (W4 delete email E2E **PASS**)
- Test signup / OTP / confirmation: mail.tm + SMTP/OTP fixtures (lokalne / operator)
- Real email fixture konta testowe — **rozróżniać od Ownera**; nie publikować pełnych adresów w docs
- Fixture users ≠ production Owner identity
- Auth inbox E2E (user-facing templates): historycznie **BLOCKED — NO INBOX ACCESS** gdzie dotyczy

### P3 — COMPLETE / PRODUCTION VERIFIED — GREEN

**Anonymous Take → Account Claim** @ `dabbc936` · deploy `dpl_Hd4QAwDkkw99FMiFhh8nJ1N6nvsR`.

- Auto claim after successful auth · latest READY · Premium Tier TTL/cap · Storage COPY→DB→DELETE · ownership XOR · fail-open · cap DENY
- Cookie clear **CODE-VERIFIED** · full disposable production E2E **NOT EXECUTED**
- Follow-up: `p_take_id` hardening — **NON-BLOCKING**
- Detail: [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) §8 · [architecture/RECORDING.md](./architecture/RECORDING.md)

### Known waiver

`src/lib/audio/e3-7-f-download-authz.test.ts` · Premium HQ/WAV · `AudioEntitlementError: Missing audio capability: EXPORT_WAV`
= **PRE-EXISTING / OUT OF SCOPE / WAIVED BY OWNER** (nie nowy regres POLISH-01).

---

## 9. Recording Final State

```text
RECORDING WAVE 1 = CLOSED
RECORDING WAVE 2 = CLOSED
RECORDING WAVE 3 = CLOSED
RECORDING WAVE 4 = CLOSED
RECORDING WAVE 5 = CLOSED / PRODUCTION VERIFIED
D02 ANONYMOUS QT = CLOSED / IN V1 · SHIPPED / PRODUCTION VERIFIED @ e98ba52
P3 ACCOUNT CLAIM = COMPLETE / PRODUCTION VERIFIED — GREEN @ dabbc936
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
Closeout Fala 3.5.1: [FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md](./audits/FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md) · **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** @ `c690831` · verify `75bd80f` · plan [D_FALA_351_PRODUCTION_VERIFY_PLAN.md](./audits/D_FALA_351_PRODUCTION_VERIFY_PLAN.md) (historical plan SHA `42369c0` superseded for execute)
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
| Payments / Premium catalog product | DEFERRED · OPEN OD-04/07 · OD-08 CLOSED (tiers only; no billing) |
| W2-A Premium tier foundation | **CLOSED / PRODUCTION VERIFIED WITH FINDINGS** @ `6ee3255` · DB `20261003221811` · deploy `dpl_AdF29uH9eJ9xUNhuqD6rYKTZZg9a` · live tiers NOT VERIFIED (0 rows) · P2 OPEN |
| W2-B Premium Enforcement | **PRODUCTION VERIFIED WITH NON-BLOCKING FINDING** @ `d86b4df` · deploy `dpl_2wk8MJjcP5vwPR9w5hUqLmei6oGG` · download E2E PASS · P2-1 **VERIFIED RESOLVED** · Mix/Render DEFERRED · Gold 90d / janitor / billing / UI / overlay out · browser/UI Server Action = NON-BLOCKING FINDING |
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
CURRENT PRODUCTION APP = c825e42 (P6.6 · UNCHANGED this docs-only reconcile)
PRODUCTION DEPLOYMENT  = dpl_3s3fAnvrpNVSwJcdhV8J1SZtc9g9
REPO TIP               = advances with SSOT reconcile (app tip c825e42)
LAST STUDIO VERIFY     = P6.6.3 · PRODUCTION VERIFIED — GREEN
                       · Vitest 1410 PASS · 1 SKIP · 0 FAIL
D02 HARNESS            = CLOSED @ 44dc22c · TEST ONLY
P5.7                   = Architecture Audit · GO WITH CONDITIONS
P5.8                   = PRODUCTION VERIFIED — GREEN
P5.9                   = Architecture Audit · GO WITH CONDITIONS
P5.10                  = PRODUCTION VERIFIED — GREEN
P6.5 Scenario B        = BLOCKED / INCONCLUSIVE · DO NOT REOPEN
P6.6                   = PRODUCTION VERIFIED — GREEN
KNOWN WAIVER           = e3-7-f EXPORT_WAV · WAIVED
FALA 3.5.1             = CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN @ c690831
P3                     = COMPLETE / PRODUCTION VERIFIED — GREEN · UNCHANGED
POLISH-01              = CLOSED / PRODUCTION VERIFIED
P0 / P1 / P2           = CLOSED / PRODUCTION VERIFIED · UNCHANGED
ARCH-05                = CLOSED / VERIFIED
WORKER                 = STOPPED / DISABLED
STORAGE-ARCH-01        = LOCKED
NEXT GATE              = P6.7 Owner GO → implementation (freeze GO · no auto-start)
P3 FOLLOW-UP           = p_take_id hardening · NON-BLOCKING
NEXT SESSION ENTRY     = Read FINAL_COLD_START_HANDOFF.md
                       → MASTER_HANDOFF / PROJECT_STATE
```

**Do not** reopen closed P0/P1/P2/P3/P5.6/P5.8/P5.10/P6.6/Fala 3.5.1/POLISH-01/ARCH-05/BPM without new evidence.
**Do not** reopen P6.5 Scenario B / P6.4.4 / P6.6.1–P6.6.3.
**Do not** call punch “P5.7” / “P5.9” / “P5.10” — those are audit/engine units.
**Do not** auto-start P7 / FX expansion / samples without a fresh Architecture Audit + Design Freeze + Owner GO.
**Do not** implement `p_take_id` / fix EXPORT_WAV / mutate Storage without Owner GO.
**Do not** stage dirty WIP (`.agents/` · `.cursor/` · `infra/` · `.env*` · secrets).

Cold start: [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md)
P0/P1/P2/POLISH: §8b powyżej.
Storage freeze: [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md)

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
| Dual SHA (app vs worker) | Production app `9c2a958` · Contabo worker bootstrap `92496d4` — intentional; do not auto-align without Owner GO |
| Docs tip vs app tip | Docs reconcile may advance HEAD after `9c2a958` — production **application** remains `9c2a958` until next app deploy |
| P5.10 TAKE fixture | **KNOWN VERIFICATION LIMITATION** — one production TAKE preview failed (`Nie udało się odtworzyć nagrania`); Beat continued; live A+B overlap not heard on that fixture. Mix covered by unit tests. **Not a P5.10 blocker.** Live IDOR was not rerun in P5.10 gate. |
| FAR-01 campaign | SOAK COMPLETE / CONTAMINATED · RETIREMENT NOT EXECUTED · living orphans **0** (post ARCH-05) · **NOT CLOSED** |
| HIBP / leaked-password protection | **DEFERRED / ACCEPTED RISK** — not solved |
| Hobby daily janitor | Takes janitor only · Storage cleanup lag ≤ ~24h; AuthZ expiry is still immediate |
| Artifacts janitor missing | F-PE-04 / OD-SA-05 · **STORAGE-ARCH-03** future wave |
| React hydration warning on `/beat/[id]` | **INFO** · **BLOCKER = NO** · observed in `next dev`; do not hotfix without Owner GO |
| `e3-7-f` / `EXPORT_WAV` | **KNOWN WAIVER** · PRE-EXISTING / WAIVED BY OWNER |

### DEFERRED / TECHNICAL DEBT

| Item | Notes |
|------|--------|
| **P2 OPS / MIGRATION DRIFT** | Local vs remote migration version names — ops reconciliation later (W1 versions reconciled to prod `210121`→`210322`) |
| **W1 OPEN-01 DML REVOKE** | Defense-in-depth: REVOKE INSERT/UPDATE/DELETE on `creator_experience_events` for anon/authenticated — NON-BLOCKING |
| **W1 OPEN-02 Account Delete + ledger CASCADE** | Live E2E with W1 ledger — NOT LIVE VERIFIED · schema CASCADE compatible |
| **W1 OPEN-03 Live product awards** | LIMITED coverage (compensated ADMIN_CORRECTION smoke only) |
| Delete Storage-before-DB order | Documented MEDIUM residual from W4 audit — not hotfix without GO |
| Janitor leftover `object_key` re-scan | Ops efficiency debt |
| `computeInterimRecordingMaxSeconds` deprecated helper | Cleanup debt |
| Beat-audio orphan janitor | ARCH-05 **CLOSED** · live orphans **0** · do not re-open without new Owner GO |
| Source MASTER backup before scale | OD-SA-06 · VPS **43/43 RETAINED** · Local **43/43 RETAINED** · AWS **DEFERRED** · ARCH-05 **CLOSED** (prod Storage 11) |
| OD-12 interim MIME allow-list | Codec SSOT still OPEN outside E3 OAD-06 |
| Root/docs historical SHAs in older audits | Historical snapshots — do not “fix” by rewriting history |

### OUT OF SCOPE / NOT ENABLED (current delivery)

STEMS · artifact_kind · public Free HQ/WAV · payments/Premium catalog product · recording Premium overlay · Gold 90d PRODUCTION · artifacts janitor / ops dashboard · `/premium` / `/ranks` UI · grant PLAYBACK/DOWNLOAD · track publish · comments/voting/messaging product UIs · FFmpeg as npm app dependency · MasterProParams / True Peak / BS.1770 product expansion · artwork bucket (OD-SA-04) · STORAGE-ARCH-02 external Object Storage provisioning · STORAGE-ARCH-02-KEY+ without Implementation GO · W2-B Mix/Render live jobs · W2-B browser/UI Server Action journey (NON-BLOCKING FINDING).

---

## 20. Current Verification State

| Area | State |
|------|--------|
| Production app | **GREEN** @ `2c4200b` · deploy `6810556404` / `dpl_9FdJrwvxGdwafGUTbzpKDzeds9PE` · Wave A **PRODUCTION VERIFIED — GREEN** · Mix/Jobs/PUBLIC_AUDIO **ON** |
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
| P1-A HIBP | **DEFERRED / ACCEPTED RISK** |

---

## 21. Handoff Closeout

```text
MASTER HANDOFF READY
CURRENT PRODUCTION APP     = c825e42 · P6.6 · UNCHANGED (docs-only this reconcile)
PRODUCTION DEPLOYMENT      = dpl_3s3fAnvrpNVSwJcdhV8J1SZtc9g9
D02 HARNESS                = CLOSED @ 44dc22c · TEST ONLY
P5.7                       = Architecture Audit · GO WITH CONDITIONS
P5.8                       = PRODUCTION VERIFIED — GREEN
P5.9                       = Architecture Audit · GO WITH CONDITIONS
P5.10                      = PRODUCTION VERIFIED — GREEN
P6.5 Scenario B            = BLOCKED / INCONCLUSIVE · DO NOT REOPEN
P6.6                       = PRODUCTION VERIFIED — GREEN
LAST STUDIO VERIFY         = P6.6.3 · PRODUCTION VERIFIED — GREEN @ c825e42
                           · Vitest 1410 PASS · 1 SKIP · 0 FAIL
KNOWN WAIVER               = e3-7-f EXPORT_WAV · WAIVED
FALA 3.5.1                 = CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN @ c690831
P3                         = COMPLETE / PRODUCTION VERIFIED — GREEN · UNCHANGED
POLISH-01                  = CLOSED / PRODUCTION VERIFIED
P0 / P1 / P2               = CLOSED / PRODUCTION VERIFIED · UNCHANGED
ARCH-05                    = CLOSED / VERIFIED
ADMIN W0–W4                = CLOSED / PRODUCTION VERIFIED
E3                         = PRODUCTION VERIFIED — GREEN
WORKER                     = STOPPED / DISABLED
STORAGE-ARCH-01            = LOCKED
NEXT GATE                  = P6.7 Owner GO → implementation (freeze GO · no auto-start)
P3 FOLLOW-UP               = p_take_id · NON-BLOCKING
NEXT SESSION ENTRY         = FINAL_COLD_START_HANDOFF.md → this file → PROJECT_STATE.md
```

**Do not** rewrite historical closeouts or freeze OD locks from this document alone.
**NIE BUDUJ OD NOWA.** SEARCH BEFORE CREATE · REUSE BEFORE DUPLICATE · SSOT FIRST.

---

*End of Master Handoff.*
