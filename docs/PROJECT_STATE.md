# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point dla nowego agenta:** najpierw [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md), potem [MASTER_HANDOFF.md](./MASTER_HANDOFF.md), potem ten plik.
**Updated:** 2026-10-03 (USER-CLEANUP-01 + USER-ID-01 implemented; Owner verification pending commit/deploy)

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
| **REPOSITORY HEAD / origin/main** | `4e33e8d` — `fix(player): align waveform progress with playback state` |
| **PRODUCTION APP SHA** | `4e33e8d` |
| **PRODUCTION URL** | https://www.bitrymdym.pl |
| **PRODUCTION DB tip** | `20261003110802` / `user_id_01_stable_user_number` (NULL→value hardening migration **pending apply**: `20261003123000`) |
| **Prior DB tip** | `20261003051539` / `def01_e3_definer_execute_revoke` |
| **USER-CLEANUP-01** | **EXECUTED** — auth/profiles = 2 (Dawid + Tajski); 93 fixtures deleted; orphan-31 untouched · [evidence](./audits/USER_CLEANUP_01_POSTDELETE_EVIDENCE.md) |
| **USER-ID-01** | **DB APPLIED** — Dawid=`1`, Tajski=`NULL`, next=`2` · app/hardening uncommitted · [AUTHORIZATION](./architecture/AUTHORIZATION.md#user-id-01--stable-user-number) · [evidence](./audits/USER_ID_01_EVIDENCE.md) |
| **PRODUCTION DB FAR-01 roles** | `20261002231150` / `far01_r1_dryrun_readonly_role` · `20261003012453` / `far01_live_mutator_role` |
| Prior security tip | `fbc696f` — DEF-01 |
| Prior storage tip | `f9500b3` — FAR-01 execution harden |
| Historical Phase 1 DR-A tip | `f514a51` — dual-accept (still valid history) |

| Pole | Wartość |
|------|---------|
| **FAR-01 DR-A** | **SHIPPED** / **PRODUCTION VERIFIED** @ `f514a51` (historical) |
| **FAR-01 campaign** | **IN PROGRESS / SOAK ACTIVE** — living: [FAR_01_CURRENT_STATE.md](./audits/FAR_01_CURRENT_STATE.md) |
| **FAR-01 CLOSED** | **NO** |
| Canary / Fleet | N=5 **PASS** · N=62 **PASS** |
| Soak | start `2026-10-03T04:40:56.645Z` · end `2026-10-04T04:40:56.645Z` · interim **PASS** |
| Retirement / cleanup | **NOT EXECUTED** |
| **DEF-01** | **CLOSED** / **PRODUCTION VERIFIED** @ `fbc696f` |
| **ACTIVE P0 / P1** | **NONE VERIFIED** |
| **HIBP** | **DEFERRED / ACCEPTED RISK** (not solved) |
| **STORAGE-ARCH-01** | **LOCKED** · Hybrid C |
| **STORAGE-ARCH-02** | FUTURE DOCS · external Object Storage **NOT IMPLEMENTED** |
| **E3** | **PRODUCTION VERIFIED — GREEN** · Mix/Jobs/PUBLIC_AUDIO **ON** |
| **Worker** | Contabo **EXTERNAL COMPUTE** · **STOPPED / DISABLED** · bootstrap `92496d4` |
| **Fala 3.5.1** | CLOSED · PRELIMINARY PASS · **NOT DEPLOYED** |
| Supabase project | `rzzxrgcdogkybkiidqgw` |

Handoff: [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)

---

## 3. Current Phase

```text
REPOSITORY / PRODUCTION APP  = 4e33e8d (waveform progress/seek)
PRODUCTION DB tip            = 20261003110802 (USER-ID-01; null-hardening 20261003123000 pending apply)
FAR-01 DR-A                  = SHIPPED / PRODUCTION VERIFIED (historical @ f514a51)
FAR-01 CAMPAIGN              = IN PROGRESS / SOAK ACTIVE
  inventory                  = legacy1 · canonical77 · platform3 · retained67 · orphans30 · orphanStorage97 · quarantine1 · MIGRATE=0
  soak end                   = 2026-10-04T04:40:56.645Z
  retirement / cleanup       = NOT EXECUTED
DEF-01                       = CLOSED / PRODUCTION VERIFIED @ fbc696f
HIBP                         = DEFERRED / ACCEPTED RISK
E3                           = PRODUCTION VERIFIED — GREEN
WORKER                       = STOPPED / DISABLED (EXTERNAL COMPUTE · Contabo · 92496d4)
STORAGE-ARCH-01              = LOCKED
STORAGE-ARCH-02              = NOT IMPLEMENTED (docs only)
NEXT GATE                    = SOAK END → FINAL SOAK AUDIT → Owner Review
```

### 3.1 Architecture living lock

```text
Durable media                = Supabase Storage (beat-audio · take-audio · audio-artifacts)
Metadata SSOT                = Supabase PostgreSQL
Application                  = Vercel / Next.js
EXTERNAL COMPUTE             = Contabo VPS (FFmpeg ephemeral · NOT durable · NOT library · NOT backup · NOT audio SSOT)
Worker runtime               = STOPPED / DISABLED
```

---

## 4. Next Session Entry

```text
NEXT SESSION ENTRY = Read FINAL_COLD_START_HANDOFF.md
                 → FAR_01_CURRENT_STATE.md
                 → WAIT FOR SOAK END (2026-10-04T04:40:56.645Z)
                 → FINAL SOAK AUDIT (read-only)
                 → Owner Review → FAR-01 closeout only if evidence supports
                 → do NOT retirement / orphan delete / new backfill without Owner GO
                 → do NOT treat Contabo as durable media
                 → HIBP remains ACCEPTED RISK (not solved)
```

---

## 5. Decision vs Delivery (selected)

| ID | Decision | Delivery |
|----|----------|----------|
| D02 Anonymous QT | CLOSED / IN V1 | SHIPPED / PRODUCTION VERIFIED @ `e98ba52` |
| D03 Shared grants | CLOSED | SHIPPED / PRODUCTION VERIFIED @ `37892a6` (RECORD only) |
| E3 PE | LOCKED | PRODUCTION VERIFIED — GREEN |
| STORAGE-ARCH-01 | LOCKED | Architecture only · Implementation NOT STARTED as product wave |
| FAR-01 DR-A | CLOSED Phase 1 | SHIPPED @ `f514a51` |
| FAR-01 campaign | Owner GO sequence through fleet | **SOAK ACTIVE** · **NOT CLOSED** |
| DEF-01 | Owner GO | CLOSED / PRODUCTION VERIFIED @ `fbc696f` |

---

## 6. Out of scope / deferred

STEMS · payments / Premium catalog · audio-artifacts janitor · orphan GC · staged key retirement · source MASTER backup · external Object Storage · Premium Production E2E · comments/voting/messaging · Fala 3.5.1 deploy.

**E3 flags:** Mix ON · Jobs ON · PUBLIC_AUDIO ON · worker STOPPED/DISABLED · `E3_RENDER_WORKER_SECRET` CONFIGURED (never commit).

---

## 7. Local worktree note

After docs reconciliation commits, residual untracked may remain (`.agents/` · `.cursor/` · `skills-lock.json` · `infra/oracle/` · unrelated audit stubs).
These are **local tooling / research residue**, not production app code changes. **Do not** `git add .`.
