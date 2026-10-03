# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point dla nowego agenta:** najpierw [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md), potem [MASTER_HANDOFF.md](./MASTER_HANDOFF.md), potem ten plik.
**Updated:** 2026-10-03 (CREATOR PROGRESS W1 — PRODUCTION VERIFIED WITH OPEN ITEMS · tip `76a4757`)

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
| **REPOSITORY HEAD / origin/main** | `76a4757` — Creator Progress W1 (`feat(creator): implement experience and rank foundation`) |
| **PRODUCTION APP SHA** | `76a4757` · deploy `dpl_5WFmJckV5zjDopXHbjqy8rrF2kiD` · Ready |
| **PRODUCTION URL** | https://www.bitrymdym.pl |
| **PRODUCTION DB tip** | Creator Progress W1 applied (`20261003210121` → `20261003210322`) · ACCOUNT/PROFILE-01 + USER-ID-01 still active |
| **CREATOR PROGRESS W1** | **LIVE / PRODUCTION VERIFIED WITH OPEN ITEMS** @ `76a4757` — [closeout](./audits/CREATOR_PROGRESS_W1_CLOSEOUT.md) · [implementation](./audits/CREATOR_PROGRESS_W1_IMPLEMENTATION.md) |
| **USER-CLEANUP-01** | **EXECUTED** — fixtures removed earlier · orphan-31 untouched · [evidence](./audits/USER_CLEANUP_01_POSTDELETE_EVIDENCE.md) |
| **USER-ID-01** | **PRODUCTION VERIFIED — GREEN** — Dawid=`1` · next=`2` · Tajski test account **deleted** (no renumber/reuse) · [AUTHORIZATION](./architecture/AUTHORIZATION.md#user-id-01--stable-user-number) |
| **ACCOUNT / PROFILE-01** | **FUNCTIONALLY VERIFIED / PRODUCTION VERIFIED — GREEN** · Fresh Recovery E2E **PASS** · Delete Account E2E **PASS** · W1 ledger CASCADE **COMPATIBLE · LIVE DELETE+LEDGER E2E OPEN** · [freeze](./audits/ACCOUNT_PROFILE_01_AUDIT_PLAN_DESIGN_FREEZE.md) · [AUTHORIZATION](./architecture/AUTHORIZATION.md#account--profile-01--account-lifecycle--public-ksywka) |
| **PRODUCTION DB FAR-01 roles** | `20261002231150` / `far01_r1_dryrun_readonly_role` · `20261003012453` / `far01_live_mutator_role` |
| Prior tip (Account wave) | `89a8d51` — ACCOUNT/PROFILE-01 |
| Prior design freeze tip | `1e66cae` — Creator Progress + Premium Design Freeze V1 |
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
REPOSITORY / PRODUCTION APP  = 76a4757 (Creator Progress W1 tip · Ready)
PRODUCTION DB                = W1 migrations 210121 → 210130 → 210309 → 210322 · ACCOUNT/PROFILE-01 ACTIVE
PRODUCTION STORAGE           = unchanged by W1 (platform3 · anon12 · Dawid1)
CREATOR PROGRESS W1          = LIVE / PRODUCTION VERIFIED WITH OPEN ITEMS
  Rank                       = derived CreatorRank from experience_total (≠ account_level · ≠ Premium · ≠ role)
  Ledger                     = creator_experience_events SSOT
  experience_total           = derived cache (server-write)
  Awards                     = trusted server hooks only · no XP for listens/downloads
  Anti-abuse                 = idempotency · daily caps · anon take = 0
  OPEN-01                    = DML REVOKE hardening (NON-BLOCKING)
  OPEN-02                    = Account Delete + ledger CASCADE live E2E (NOT LIVE VERIFIED)
  OPEN-03                    = limited live product award coverage
ACCOUNT/PROFILE-01           = FUNCTIONALLY VERIFIED / PRODUCTION VERIFIED — GREEN
  Recovery E2E               = PASS (fresh OTP → reset → login)
  Delete Account E2E         = PASS (pre-W1 · Tajski Auth+profile deleted · Dawid isolated)
  W1 ledger on delete        = SCHEMA CASCADE COMPATIBLE · LIVE DELETE+LEDGER E2E OPEN
USER-ID-01                   = PRODUCTION VERIFIED — GREEN · Dawid=1 · no renumber after Tajski delete
FAR-01 DR-A                  = SHIPPED / PRODUCTION VERIFIED (historical @ f514a51)
FAR-01 CAMPAIGN              = IN PROGRESS / SOAK ACTIVE
DEF-01                       = CLOSED / PRODUCTION VERIFIED @ fbc696f
E3                           = PRODUCTION VERIFIED — GREEN
WORKER                       = STOPPED / DISABLED (EXTERNAL COMPUTE · Contabo · 92496d4)
PREMIUM PRODUCT (W2)         = DEFERRED / NOT IMPLEMENTED IN W1 · NOT AUTHORIZED
ACTIVE P0 / P1               = NONE (W1 closeout)
NEXT GATE                    = Owner GO commit/push W1 docs continuity · FAR-01 soak end
                             · W2 Premium Foundation requires separate AUDIT→RCA→PLAN→REVIEW→GO
```

### 3.1 Architecture living lock

```text
Durable media                = Supabase Storage (beat-audio · take-audio · audio-artifacts)
Metadata SSOT                = Supabase PostgreSQL
Application                  = Vercel / Next.js
EXTERNAL COMPUTE             = Contabo VPS (FFmpeg ephemeral · NOT durable · NOT library · NOT backup · NOT audio SSOT)
Worker runtime               = STOPPED / DISABLED
Creator experience SSOT      = creator_experience_events (+ profiles.experience_total cache)
Creator Rank                 = derived in app code · not stored as account_level
```

---

## 4. Next Session Entry

```text
NEXT SESSION ENTRY = Read FINAL_COLD_START_HANDOFF.md
                 → MASTER_HANDOFF.md / this PROJECT_STATE
                 → CREATOR_PROGRESS_W1_CLOSEOUT.md (W1 closed with OPEN items)
                 → FAR_01_CURRENT_STATE.md
                 → WAIT FOR SOAK END (2026-10-04T04:40:56.645Z)
                 → FINAL SOAK AUDIT (read-only)
                 → Owner Review → FAR-01 closeout only if evidence supports
                 → do NOT start W2 Premium without separate Owner GO sequence
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
| Creator Progress Design Freeze V1 | Docs freeze @ `1e66cae` | W1 Experience+Rank **PRODUCTION VERIFIED WITH OPEN ITEMS** @ `76a4757` · Premium wave **NOT STARTED** |

---

## 6. Out of scope / deferred

STEMS · payments / Premium catalog product · Creator Progress W2 Premium Foundation (**NOT AUTHORIZED**) · audio-artifacts janitor · orphan GC · staged key retirement · source MASTER backup · external Object Storage · Premium Production E2E · comments/voting/messaging · Fala 3.5.1 deploy · `/ranks` / `/premium` UI · billing / subscriptions.

**E3 flags:** Mix ON · Jobs ON · PUBLIC_AUDIO ON · worker STOPPED/DISABLED · `E3_RENDER_WORKER_SECRET` CONFIGURED (never commit).

**Premium:** DEFERRED / NOT IMPLEMENTED IN W1. E3 binary `premium_entitlements` overlay for render remains as before; Creator Progress Premium capability product is a separate next wave.

---

## 7. Local worktree note

After docs reconciliation commits, residual untracked may remain (`.agents/` · `.cursor/` · `skills-lock.json` · `infra/oracle/` · unrelated audit stubs).
These are **local tooling / research residue**, not production app code changes. **Do not** `git add .`.
