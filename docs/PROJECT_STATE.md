# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point dla nowego agenta:** najpierw [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md), potem [MASTER_HANDOFF.md](./MASTER_HANDOFF.md), potem ten plik.
**Updated:** 2026-10-04 (W2-A CLOSED / PRODUCTION VERIFIED WITH FINDINGS · app `6ee3255` · DB `20261003221811` · docs tip `ff61ac3` pending closeout commit)

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
| **REPOSITORY HEAD / origin/main** | `ff61ac3` — W2-A docs continuity (pre-closeout tip) · code SHA `6ee3255` · closeout docs pending commit GO |
| **PRODUCTION APP SHA** | `6ee3255` — W2-A Premium tier foundation · deploy Ready · `dpl_AdF29uH9eJ9xUNhuqD6rYKTZZg9a` |
| **PRODUCTION URL** | https://www.bitrymdym.pl |
| **PRODUCTION DB tip** | W2-A applied — remote `20261003221811` / `w2a_premium_tier_foundation` · local file `20261003230000_…` · enum FREE/BRONZE/SILVER/GOLD · `tier` NOT NULL DEFAULT FREE · `premium_entitlements` = 0 · ACCOUNT/PROFILE-01 + USER-ID-01 still active |
| **CREATOR PROGRESS W1** | **LIVE / PRODUCTION VERIFIED WITH OPEN ITEMS** @ `76a4757` — [closeout](./audits/CREATOR_PROGRESS_W1_CLOSEOUT.md) · [implementation](./audits/CREATOR_PROGRESS_W1_IMPLEMENTATION.md) |
| **CREATOR PROGRESS W2-A** | **CLOSED / PRODUCTION VERIFIED WITH FINDINGS** @ `6ee3255` — [closeout](./audits/CREATOR_PROGRESS_W2A_CLOSEOUT.md) · [implementation](./audits/CREATOR_PROGRESS_W2A_IMPLEMENTATION.md) · [W2 Design Contract](./decisions/W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md) |
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
REPOSITORY HEAD / origin/main = ff61ac3 (W2-A docs continuity · closeout docs pending commit GO)
PRODUCTION APP                = 6ee3255 (Ready · dpl_AdF29uH9eJ9xUNhuqD6rYKTZZg9a)
PRODUCTION DB                 = W2-A remote 20261003221811 / w2a_premium_tier_foundation
                              · local file 20261003230000_w2a_premium_tier_foundation.sql
                              · P2-4 version drift = known MCP apply-time (not schema failure)
PRODUCTION STORAGE            = unchanged by W2-A
CREATOR PROGRESS W1           = LIVE / PRODUCTION VERIFIED WITH OPEN ITEMS @ 76a4757
  Rank                        = derived CreatorRank from experience_total (≠ account_level · ≠ Premium · ≠ role)
  Ledger                      = creator_experience_events SSOT
  OPEN-01…03                  = unchanged (see W1 closeout)
CREATOR PROGRESS W2-A         = CLOSED / PRODUCTION VERIFIED WITH FINDINGS @ 6ee3255
  premium_tier enum           = FREE / BRONZE / SILVER / GOLD (production)
  premium_entitlements.tier   = NOT NULL DEFAULT FREE (production)
  premium_entitlements rows   = 0
  Legacy mapping              = present/applied · LIVE DATA NOT VERIFIED (0 rows)
  Resolver SSOT               = resolveProductEntitlement · audio wrapper delegates
  Capability matrix           = Free Basic · Bronze HQ · Silver Pro · Gold WAV
  BRONZE/SILVER/GOLD live     = CODE/CONTRACT VERIFIED · LIVE DATA NOT VERIFIED
  Render snapshot             = PASS TEST VERIFIED · LIVE JOB NOT VERIFIED
  account_level / Rank        = unchanged · orthogonal
  Recording overlay           = NOT IMPLEMENTED / OPEN/DEFERRED
  Downloads tier cutover      = DEFERRED (ANON=2 / USER=4 runtime)
  Artifact janitor / Gold 90d = NOT IMPLEMENTED / DESIGN ONLY (runtime retention 30d)
  Billing / Premium UI        = NOT IMPLEMENTED
  P2 OPEN                     = P2-1 stale AUDIO_RENDER_PREMIUM_*=30
                              · P2-2 RLS live exercise
                              · P2-3 manual migration idempotency
                              · P2-4 ops migration version drift
ACCOUNT/PROFILE-01            = FUNCTIONALLY VERIFIED / PRODUCTION VERIFIED — GREEN
USER-ID-01                    = PRODUCTION VERIFIED — GREEN · Dawid=1
FAR-01 DR-A                   = SHIPPED / PRODUCTION VERIFIED (historical @ f514a51)
FAR-01 CAMPAIGN               = IN PROGRESS / SOAK ACTIVE
DEF-01                        = CLOSED / PRODUCTION VERIFIED @ fbc696f
E3                            = PRODUCTION VERIFIED — GREEN
WORKER                        = STOPPED / DISABLED (EXTERNAL COMPUTE · Contabo · 92496d4)
OD-08                         = CLOSED / ACCEPTED · FREE / BRONZE / SILVER / GOLD
OD-04 / OD-07                 = OPEN (billing / prices)
Recording overlay numbers     = OPEN / DEFERRED
ACTIVE P0 / P1                = NONE
NEXT GATE                     = W2-A DOCUMENTATION COMMIT/PUSH (closeout docs)
                              · then later product GOs (download cutover / overlay / janitor / billing / UI)
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
                 → CREATOR_PROGRESS_W2A_CLOSEOUT.md (CLOSED / PRODUCTION VERIFIED WITH FINDINGS)
                 → CREATOR_PROGRESS_W1_CLOSEOUT.md (W1 closed with OPEN items)
                 → FAR_01_CURRENT_STATE.md
                 → NEXT GATE = W2-A DOCUMENTATION COMMIT/PUSH (if closeout docs still uncommitted)
                 → do NOT claim Production Verified GREEN / no-findings
                 → do NOT claim live Bronze/Silver/Gold data verification (premium_entitlements=0)
                 → do NOT claim Gold 90d live / tiered downloads live / billing live / overlay live
                 → OD-08 CLOSED · OD-04/OD-07 OPEN · recording overlay OPEN/DEFERRED
                 → P2-1…P2-4 remain OPEN
                 → WAIT FOR SOAK END (2026-10-04T04:40:56.645Z) → FINAL SOAK AUDIT (read-only)
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
| Creator Progress Design Freeze V1 | Docs freeze @ `1e66cae` | W1 Experience+Rank **PRODUCTION VERIFIED WITH OPEN ITEMS** @ `76a4757` |
| OD-08 Premium tiers | **CLOSED / ACCEPTED** 2026-10-03 | FREE/BRONZE/SILVER/GOLD · W2-A **CLOSED / PRODUCTION VERIFIED WITH FINDINGS** @ `6ee3255` · [closeout](./audits/CREATOR_PROGRESS_W2A_CLOSEOUT.md) |
| W2-A Premium foundation | Production verified with findings | App `6ee3255` · DB `20261003221811` · live tiers NOT VERIFIED (0 rows) · P2 OPEN |

---

## 6. Out of scope / deferred

STEMS · payments / Premium catalog product · download tier cutover · recording Premium overlay · Gold 90d PRODUCTION · audio-artifacts janitor · orphan GC · staged key retirement · source MASTER backup · external Object Storage · Premium Production E2E · comments/voting/messaging · Fala 3.5.1 deploy · `/ranks` / `/premium` UI · billing / subscriptions.

**E3 flags:** Mix ON · Jobs ON · PUBLIC_AUDIO ON · worker STOPPED/DISABLED · `E3_RENDER_WORKER_SECRET` CONFIGURED (never commit).

**Premium:** W2-A **CLOSED / PRODUCTION VERIFIED WITH FINDINGS** @ `6ee3255` / DB `20261003221811`. Live Bronze/Silver/Gold **not** verified (`premium_entitlements`=0). OD-08 CLOSED. Billing (OD-04/07) OPEN. Gold 90d DESIGN ONLY. Download cutover deferred. Recording overlay OPEN/DEFERRED. P2-1…P2-4 OPEN.

---

## 7. Local worktree note

After docs reconciliation commits, residual untracked may remain (`.agents/` · `.cursor/` · `skills-lock.json` · `infra/oracle/` · unrelated audit stubs).
These are **local tooling / research residue**, not production app code changes. **Do not** `git add .`.
