# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point dla nowego agenta.**

---

## 1. Project Identity

| Pole | Wartość |
|------|---------|
| Nazwa | BitRymDym |
| Cel | Platforma muzyczna (rap / hip-hop / bity): odsłuch, pobieranie, test flow (Quick Take) → społeczność i współpraca |
| Owner / Product Owner | Prezes Dawid |
| Rola ChatGPT | Chief Product Architect, Technical Architect, UX/UI Architect, Reviewer, autor promptów |
| Rola Cursor Agent | Agent implementacyjny |

---

## 2. Current Repository State

| Pole | Wartość |
|------|---------|
| Repo | https://github.com/dawidthai125/BitRymDym |
| Local workspace | `C:\Users\dawid\Desktop\BitRymDym\bitrymdym` |
| Canonical branch | `main` |
| Canonical origin tip | `5d6b846` (`fix(auth): use otp confirmation flow for cross-browser signup`) |
| Phase 1.8A implementation | `fd87f23` |
| Remote | `origin/main` @ `5d6b846` |
| Local | **DIRTY** — Scope A audio-first upload + admin nav UX + Phase 1.9 docs; tooling untracked |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Production app | **GREEN** @ `5d6b846` (Scope A **not deployed**) |

Phase 1.8A: **COMPLETE / CLOSED / LOCKED** @ `fd87f23`.
Phase 1.9 Design Freeze: [PHASE_1_9_DESIGN_FREEZE.md](./phases/PHASE_1_9_DESIGN_FREEZE.md) — **APPROVED / LOCKED**.
Runbook: [PRODUCTION_BOOTSTRAP.md](./runbooks/PRODUCTION_BOOTSTRAP.md).

**Scope A (audio-first create):** implemented locally — duration via `music-metadata`, title suggestion, file metadata auto, **BPM manual**. **Scope B (BPM auto):** DEFERRED.

---

## 3. Current Phase

```text
FOUNDATION — PHASE 1.9 OPERATOR PRODUCTION ENABLEMENT
DESIGN FREEZE = APPROVED / LOCKED
IMPLEMENTATION = IN PROGRESS
PRODUCTION BOOTSTRAP = PARTIAL
PHASE CLOSED = NO
```

| Etap | Status |
|------|--------|
| 1.0–1.8A | **COMPLETE / CLOSED / LOCKED** |
| 1.9 Design Freeze | **APPROVED / LOCKED** |
| Auth signup UX + OTP confirm + Brevo | **PASS** (production) |
| 1.9 Operator ADMIN bootstrap (OD-20) | **PASS** (`dawid.thai@int.pl` → ADMIN; account_level unchanged) |
| Admin nav „Panel administratora” | **IMPLEMENTED locally** — **NOT COMMITTED / NOT DEPLOYED** |
| Scope A audio-first `/admin/beats/new` | **IMPLEMENTED locally** — duration auto + title suggestion + BPM manual; **NOT COMMITTED / NOT DEPLOYED** |
| Scope B BPM auto-detection | **DEFERRED** — Owner GO required |
| 1.9 First PLATFORM beat + E2E | **BLOCKED** — requires ADMIN browser session + MASTER via UI (prefer Scope A flow after deploy) |
| 1.9 Phase CLOSED | **NO** |

**Live counts (2026-09-26):** ADMIN **1** · PUBLISHED **0** · READY **0** · profiles **5** · beats **0** · download_events **0**. Bucket `beat-audio` **private**.

**Auth (production):** Confirm signup PL + `token_hash` OTP callback **PASS**; sender Brevo `noreply@bitrymdym.pl` **PASS**.

**OD-20 unchanged:** no auto-admin; no bootstrap endpoint; promotion only via service_role-capable SQL.

**Still OPEN:** OD-04, OD-07 through OD-16, OD-18.
**CLOSED interim downloads:** OD-05, OD-06, OD-17.

### HUMAN OPERATOR — next for first PLATFORM beat

1. Sign in as ADMIN (`dawid.thai@int.pl`) on https://www.bitrymdym.pl (after Scope A deploy, or local)
2. `/admin/beats` → `/admin/beats/new` → **select audio first** → wait for analysis (duration auto)
3. Confirm/edit title suggestion; enter **BPM manually**; fill optional metadata → CREATE DRAFT + MASTER
4. Publish via UI gate only when READY (no SQL status bypass)
5. Reply **BEAT PUBLISHED PASS** + beat id — then agent continues anon/auth E2E

---

## 4. Owner decisions (relevant)

| ID | Status | Summary |
|----|--------|---------|
| OD-05 / OD-06 / OD-17 | CLOSED interim (1.8A) | Limits 2/4; event after signed URL |
| OD-19 | CLOSED | Signup `BEGINNER_RAPPER` |
| OD-20 | CLOSED | Manual ADMIN bootstrap only |

---

## 5. Verification status

### Phase 1.9

| Layer | Status |
|-------|--------|
| Design Freeze | **APPROVED / LOCKED** |
| Implementation | **IN PROGRESS** (docs; no app/DB code) |
| Production Bootstrap | **PENDING** |
| Production Verify | **PENDING** |
| Phase CLOSED | **NO** |

### Phase 1.8A (locked)

| Layer | Status |
|-------|--------|
| Implementation | **COMPLETE** @ `fd87f23` |
| Live product E2E | **NOT VERIFIED** until 1.9 bootstrap |

---

## 6. Open Decisions

Still OPEN: **OD-04, OD-07 through OD-16, OD-18**.
See [OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md).

---

## 7. Current Blockers

1. **HUMAN OPERATOR — Supabase Auth URL Configuration**
   Dashboard → Authentication → URL Configuration:
   - Site URL = `https://bitrymdym.pl`
   - Redirect URLs include `https://bitrymdym.pl/**`, `https://www.bitrymdym.pl/**`, `http://localhost:3000/**`, and optional Vercel preview wildcard
   Do **not** set Site URL to `*.vercel.app`.
2. **HUMAN OPERATOR — Phase 1.9 bootstrap** — OD-20 signup + SQL ADMIN promotion + first beat (see runbook)
3. Deploy + retest email confirmation redirect to `https://bitrymdym.pl/...` (not `*.vercel.app`)
4. Do not mark Phase 1.9 CLOSED until production E2E PASS

**FOLLOW-UP (docs drift):** `PHASE_1_FOUNDATION.md` + root `README.md` stale vs 1.7/1.8A.

---

## 8. Implemented

| Obszar | Status |
|--------|--------|
| Auth / Beats / Access Gate / Playback / Admin PLATFORM / Downloads | **LOCKED** (1.3–1.8A) |
| Phase 1.9 operator enablement | **IN PROGRESS** (docs) |
| Quick Take / Payments | **NOT STARTED** |

---

## 9. Next Session Entry

```text
NEXT SESSION ENTRY:
PHASE 1.9 DESIGN FREEZE APPROVED
IMPLEMENTATION IN PROGRESS — docs ready
PRODUCTION BOOTSTRAP = PENDING
Execute docs/runbooks/PRODUCTION_BOOTSTRAP.md (human operator)
Do NOT auto-admin / bootstrap endpoint / SQL publish bypass
Do NOT commit secrets
Do NOT mark CLOSED until E2E PASS
FOLLOW-UP (docs drift): PHASE_1_FOUNDATION.md + root README.md stale vs 1.7/1.8A
```

---

## 10. Last Session Closeout

**Sesja:** Phase 1.9 Implementation GO — documentation + pre-flight (2026-09-26)

**Done:** Design Freeze file; Production Bootstrap runbook; PROJECT_STATE / CHANGELOG / DECISION_LOG set to IN PROGRESS / PENDING.
**Not done:** Human ADMIN promotion, first beat, live E2E, commit/push, phase CLOSED.
**Next:** Human operator executes runbook → agent resumes verification / closeout.
