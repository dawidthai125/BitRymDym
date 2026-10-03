# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point dla nowego agenta:** najpierw [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md), potem [MASTER_HANDOFF.md](./MASTER_HANDOFF.md), potem ten plik.
**Updated:** 2026-10-03 (ACCOUNT/PROFILE-01 — FUNCTIONALLY VERIFIED / PRODUCTION VERIFIED · tip `89a8d51`)

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
| **REPOSITORY HEAD / origin/main** | `89a8d51` — ACCOUNT/PROFILE-01 Phase 1 tip (`fix(auth): harden failed recovery session handling`) |
| **PRODUCTION APP SHA** | `89a8d51` · deploy `dpl_7FPLmX87USMN5myC4mRvKbmUgsdU` · Ready |
| **PRODUCTION URL** | https://www.bitrymdym.pl |
| **PRODUCTION DB tip** | ACCOUNT/PROFILE-01 applied as history `20261003173213` · USER-ID-01 hardening tip still active |
| **USER-CLEANUP-01** | **EXECUTED** — fixtures removed earlier · orphan-31 untouched · [evidence](./audits/USER_CLEANUP_01_POSTDELETE_EVIDENCE.md) |
| **USER-ID-01** | **PRODUCTION VERIFIED — GREEN** — Dawid=`1` · next=`2` · Tajski test account **deleted** (no renumber/reuse) · [AUTHORIZATION](./architecture/AUTHORIZATION.md#user-id-01--stable-user-number) |
| **ACCOUNT / PROFILE-01** | **FUNCTIONALLY VERIFIED / PRODUCTION VERIFIED — GREEN** · Fresh Recovery E2E **PASS** · Delete Account E2E **PASS** · [freeze](./audits/ACCOUNT_PROFILE_01_AUDIT_PLAN_DESIGN_FREEZE.md) · [AUTHORIZATION](./architecture/AUTHORIZATION.md#account--profile-01--account-lifecycle--public-ksywka) |
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
REPOSITORY / PRODUCTION APP  = 89a8d51 (ACCOUNT/PROFILE-01 tip · Ready)
PRODUCTION DB                = ACCOUNT/PROFILE-01 applied (20261003173213) · USER-ID-01 ACTIVE
PRODUCTION STORAGE           = unchanged by ACCOUNT wave (platform3 · anon12 · Dawid1)
ACCOUNT/PROFILE-01           = FUNCTIONALLY VERIFIED / PRODUCTION VERIFIED — GREEN
  Recovery E2E               = PASS (fresh OTP → reset → login)
  Delete Account E2E         = PASS (Tajski Auth+profile deleted · Dawid isolated)
  Limitation                 = PUBLISHED USER retain/anonymize = CODE/CONTRACT VERIFIED · NOT LIVE-DATA VERIFIED
  (Tajski had 0 owned content at delete)
USER-ID-01                   = PRODUCTION VERIFIED — GREEN · Dawid=1 · no renumber after Tajski delete
FAR-01 DR-A                  = SHIPPED / PRODUCTION VERIFIED (historical @ f514a51)
FAR-01 CAMPAIGN              = IN PROGRESS / SOAK ACTIVE
DEF-01                       = CLOSED / PRODUCTION VERIFIED @ fbc696f
E3                           = PRODUCTION VERIFIED — GREEN
WORKER                       = STOPPED / DISABLED (EXTERNAL COMPUTE · Contabo · 92496d4)
ACTIVE P0 / P1 / P2          = NONE (ACCOUNT wave)
NEXT GATE                    = OWNER GO COMMIT/PUSH documentation closeout (if docs staged) · FAR-01 soak end
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
