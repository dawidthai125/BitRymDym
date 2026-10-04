# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point dla nowego agenta:** najpierw [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md), potem [MASTER_HANDOFF.md](./MASTER_HANDOFF.md), potem ten plik.
**Updated:** 2026-10-04 (FAR-01 final soak docs reconciliation · ADMIN W4 remains **CLOSED / PRODUCTION VERIFIED** @ `ddcee65`)

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
| **REPOSITORY HEAD / origin/main** | Docs tip advances independently · production app remains `ddcee65` until redeploy |
| **PRODUCTION APP SHA** | `ddcee65` — Ready · `dpl_6PjSxhA8SVW7ufnBDjSAguPb5ram` · **ADMIN W4 CLOSED / PRODUCTION VERIFIED** |
| **PRODUCTION URL** | https://www.bitrymdym.pl |
| **PRODUCTION DB tip** | `20261004174202` / `admin_user_management_w4_delete` · prior W2 `20261004144223` in chain · **W3 migration NONE** |
| **USER-FACING POLISH LOCALIZATION** | **CLOSED / PRODUCTION VERIFIED GREEN** @ `ffe723b` — [closeout](./audits/USER_FACING_POLISH_LOCALIZATION_IMPLEMENTATION.md) · email templates [doc](./audits/USER_FACING_POLISH_LOCALIZATION_EMAIL_TEMPLATES.md) · inbox E2E **BLOCKED — NO INBOX ACCESS** |
| **ADMIN USER MANAGEMENT** | **W3 CLOSED / PRODUCTION VERIFIED** @ `237a86f` · W2 **PRODUCTION VERIFIED WITH FINDINGS** · **W4 CLOSED / PRODUCTION VERIFIED** @ `ddcee65` — EMAIL E2E **PASS** — [W4 freeze](./decisions/ADMIN_USER_DELETE_DESIGN_FREEZE.md) |
| **CREATOR PROGRESS W1** | **LIVE / PRODUCTION VERIFIED WITH OPEN ITEMS** @ `76a4757` — [closeout](./audits/CREATOR_PROGRESS_W1_CLOSEOUT.md) |
| **CREATOR PROGRESS W2-A** | **CLOSED / PRODUCTION VERIFIED WITH FINDINGS** @ `6ee3255` — [closeout](./audits/CREATOR_PROGRESS_W2A_CLOSEOUT.md) |
| **CREATOR PROGRESS W2-B** | **PRODUCTION VERIFIED WITH NON-BLOCKING FINDING** @ `d86b4df` (still in tree; tip advanced) — [implementation](./audits/CREATOR_PROGRESS_W2B_IMPLEMENTATION.md) · [Design Contract](./decisions/W2B_PREMIUM_ENFORCEMENT_DESIGN_CONTRACT.md) · [audit](./audits/CREATOR_PROGRESS_W2B_AUDIT.md) |
| **USER-CLEANUP-01** | **EXECUTED** — fixtures removed · removed FAR-01 retain-set **outside** FAR-01 retirement flow · historical orphan class preserved (now **32** living orphans) |
| **USER-ID-01** | **PRODUCTION VERIFIED — GREEN** — Dawid=`1` · next=`2` |
| **ACCOUNT / PROFILE-01** | **FUNCTIONALLY VERIFIED / PRODUCTION VERIFIED — GREEN** |
| **PRODUCTION DB FAR-01 roles** | `20261002231150` / `far01_r1_dryrun_readonly_role` · `20261003012453` / `far01_live_mutator_role` |

| Pole | Wartość |
|------|---------|
| **FAR-01 campaign** | **SOAK COMPLETE / CONTAMINATED** — [FAR_01_CURRENT_STATE.md](./audits/FAR_01_CURRENT_STATE.md) |
| **FAR-01 RETIREMENT** | **NOT EXECUTED** · original retain-set **0** (gone outside FAR-01 retirement) |
| **FAR-01 CLOSED** | **NO** |
| **ARCH-04/05 orphan GC** | **SEPARATE FUTURE GATE** — **32** candidates · **not** approved for deletion |
| **DEF-01** | **CLOSED** / **PRODUCTION VERIFIED** @ `fbc696f` |
| **ACTIVE P0 / P1** | **NONE VERIFIED** |
| **HIBP** | **DEFERRED / ACCEPTED RISK** |
| **STORAGE-ARCH-01** | **LOCKED** · Hybrid C |
| **E3** | **PRODUCTION VERIFIED — GREEN** |
| **Worker** | Contabo **EXTERNAL COMPUTE** · **STOPPED / DISABLED** · `92496d4` |
| Supabase project | `rzzxrgcdogkybkiidqgw` |

Handoff: [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)

---

## 3. Current Phase

```text
REPOSITORY HEAD / origin/main = docs tip (may advance) · app SHA separate
PRODUCTION APP                = ddcee65 · dpl_6PjSxhA8SVW7ufnBDjSAguPb5ram
PRODUCTION DB                 = 20261004174202 / admin_user_management_w4_delete · W3 migration NONE
USER-FACING POLISH LOCALIZATION = CLOSED / PRODUCTION VERIFIED GREEN @ ffe723b
ADMIN USER MANAGEMENT         = W3 CLOSED / PRODUCTION VERIFIED @ 237a86f
                              · W4 CLOSED / PRODUCTION VERIFIED @ ddcee65
                              · EMAIL E2E PASS (Resend · bitrymdym.pl)
FAR-01                        = SOAK COMPLETE / CONTAMINATED · RETIREMENT NOT EXECUTED
                              · retain-set 0 (removed outside FAR-01 retirement)
NEXT GATE                     = ARCH-04/05 orphan-GC audit (separate) · optional Auth email inbox E2E
CREATOR PROGRESS W2-A         = CLOSED / PRODUCTION VERIFIED WITH FINDINGS @ 6ee3255
CREATOR PROGRESS W2-B         = PRODUCTION VERIFIED WITH NON-BLOCKING FINDING @ d86b4df (in tree)
  Gate name                   = PREMIUM ENFORCEMENT
  Download cutover (live)     = ANON 2 · FREE 4 · BRONZE 10 · SILVER 25 · GOLD 50
  Functional E2E              = ANON/FREE/BRONZE/SILVER/GOLD PASS (N success + N+1 blocked)
  OD-17                       = PASS (reserve → signed URL → finalize)
  ANON runtime SSOT           = PREMIUM_ANON_DOWNLOADS_DAILY
  USER runtime SSOT           = entitlement.limits.downloadsDaily
  Legacy DOWNLOAD_LIMIT_*     = unused / FREE mirror (not reserve authority)
  MODERATOR downloads         = USER entitlement limits (INTENTIONAL)
  Fixture cleanup             = PASS · remaining W2B_FIXTURE = 0
  Browser/UI Server Action    = NON-BLOCKING FINDING (RPC/signed-URL path verified)
  Mix / Render live           = DEFERRED — SEPARATE VERIFICATION
  P2-1                        = VERIFIED RESOLVED
  P2-2 / P2-3 / P2-4          = OPEN
  Gold 90d                    = DESIGN ONLY / DEFERRED
  Artifact janitor            = DEFERRED
OD-08                         = CLOSED
OD-04 / OD-07                 = OPEN
Recording overlay             = OPEN / DEFERRED
```

### 3.1 Architecture living lock

```text
Durable media                = Supabase Storage (beat-audio · take-audio · audio-artifacts)
Metadata SSOT                = Supabase PostgreSQL
Application                  = Vercel / Next.js
EXTERNAL COMPUTE             = Contabo VPS (FFmpeg ephemeral)
Worker runtime               = STOPPED / DISABLED
Creator Rank                 = derived · ≠ Premium · ≠ account_level
Premium SSOT                 = resolveProductEntitlement + PREMIUM_TIER_MATRIX
Beat download ANON SSOT      = PREMIUM_ANON_DOWNLOADS_DAILY (live)
Beat download USER SSOT      = entitlement.limits.downloadsDaily (live)
Admin users audit SSOT       = public.admin_audit_events (W2 write · W3 read-only UI)
```

---

## 4. Next Session Entry

```text
NEXT SESSION ENTRY = Read FINAL_COLD_START_HANDOFF.md
                 → MASTER_HANDOFF.md / this PROJECT_STATE
                 → USER-FACING POLISH LOCALIZATION = CLOSED @ ffe723b
                 → CREATOR_PROGRESS_W2B_IMPLEMENTATION.md (still relevant)
                 → ADMIN USER MANAGEMENT W3 = CLOSED / PRODUCTION VERIFIED @ 237a86f
                 → W4 Admin Delete = CLOSED / PRODUCTION VERIFIED @ ddcee65
                   EMAIL E2E PASS
                   (docs/decisions/ADMIN_USER_DELETE_DESIGN_FREEZE.md)
                 → FAR-01 = SOAK COMPLETE / CONTAMINATED · RETIREMENT NOT EXECUTED
                 → NEXT GATE = separate ARCH-04/05 orphan-GC audit (32 candidates · not approved)
                 → W2-B download enforcement = PRODUCTION VERIFIED (in tree)
                 → Mix/Render live = DEFERRED
                 → optional Auth email inbox E2E (BLOCKED — NO INBOX ACCESS)
```

---

## 5. Decision vs Delivery (selected)

| ID | Decision | Delivery |
|----|----------|----------|
| OD-08 Premium tiers | **CLOSED / ACCEPTED** | W2-A CLOSED / PRODUCTION VERIFIED WITH FINDINGS @ `6ee3255` |
| W2-A Premium foundation | Production verified with findings | App `6ee3255` · DB `20261003221811` |
| W2-B Premium Enforcement | Owner scope locked | **PRODUCTION VERIFIED WITH NON-BLOCKING FINDING** @ `d86b4df` · [implementation](./audits/CREATOR_PROGRESS_W2B_IMPLEMENTATION.md) |
| USER-FACING POLISH LOCALIZATION | Owner GO sequence | **CLOSED / PRODUCTION VERIFIED GREEN** @ `ffe723b` · [closeout](./audits/USER_FACING_POLISH_LOCALIZATION_IMPLEMENTATION.md) |
| ADMIN USER MANAGEMENT | Owner W0 lock · OD-ADMIN-01…07 **CLOSED** | **W3 CLOSED / PRODUCTION VERIFIED** @ `237a86f` · W2 **PRODUCTION VERIFIED WITH FINDINGS** · [freeze](./decisions/ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md) · [W3 closeout](./audits/ADMIN_USER_MANAGEMENT_W3_CLOSEOUT.md) |
| OD-ADMIN-DELETE-01…10 | **CLOSED / ACCEPTED** | **CLOSED / PRODUCTION VERIFIED** @ `ddcee65` · EMAIL E2E PASS · [W4 freeze](./decisions/ADMIN_USER_DELETE_DESIGN_FREEZE.md) |
| FAR-01 campaign | Owner GO sequence | **SOAK COMPLETE / CONTAMINATED** · **RETIREMENT NOT EXECUTED** · **NOT CLOSED** |
| DEF-01 | Owner GO | CLOSED / PRODUCTION VERIFIED @ `fbc696f` |

---

## 6. Out of scope / deferred

STEMS · payments / Premium catalog · recording Premium overlay · Gold 90d PRODUCTION · audio-artifacts janitor · storage quota expansion · priority · `/ranks` / `/premium` UI · billing · W2-B Mix/Render live jobs · W2-B browser/UI Server Action journey (NON-BLOCKING FINDING) · W4 remaining P2 (last-admin TOCTOU · no durable idempotency · live last-admin concurrency · published USER beat retain · migration timestamp drift).

**Premium:** W2-B **PRODUCTION VERIFIED WITH NON-BLOCKING FINDING** @ `d86b4df`. Download tier cutover live-verified. P2-1 **VERIFIED RESOLVED**. P2-2…P2-4 **OPEN**. OD-04/07 OPEN. Gold 90d DESIGN ONLY.

---

## 7. Local worktree note

Typical residue (do not stage): `.agents/` · `.cursor/` · `skills-lock.json` · `infra/oracle/` · unrelated host audits · cleanup scripts.
Never use `git add .` / `-A` / `-u`.
