# BitRymDym — FINAL COLD START HANDOFF

**Purpose:** Jedyny wymagany entry point po zamknięciu sesji ChatGPT + Cursor (2026-10-03).
**Audience:** nowy ChatGPT Architect + nowy Cursor Agent
**Owner / Product Owner:** Prezes Dawid
**Updated:** 2026-10-03
**Type:** Documentation continuity · **DOCS ONLY** (ten plik nie jest Evidence of shipped code)

**Evidence rule (bezwzględna):**

```text
CODE + REMOTE SCHEMA + PRODUCTION EVIDENCE  >  documentation prose
Documentation alone ≠ proof a feature is shipped
Decision CLOSED ≠ delivery SHIPPED
Production verification = separate stage
REPOSITORY STATE ≠ PRODUCTION APP STATE ≠ PRODUCTION DB STATE ≠ STORAGE STATE
```

---

## 0. READ THIS FIRST

BitRymDym to platforma muzyczna skoncentrowana na: **rapie · hip-hopie · bitach · odsłuchu · pobieraniu · nagrywaniu Quick Take · przyszłych utworach · społeczności · współpracy producentów i raperów**.

**Owner** podejmuje decyzje. Agent **nie** podejmuje ich samodzielnie.

**Obecny chat NIE jest wymagany.** Ciągłość ma być w repozytorium docs + evidence.

```text
REPOSITORY HEAD / origin/main = e03f3be
  message                     = feat(far01): add production backfill operator tooling
  meaning                     = FAR-01 OPERATOR TOOLING (not a user-facing UI release)

PRODUCTION APP SHA            = e03f3be
PRODUCTION DEPLOYMENT         = 6823806375 (Vercel bot · success)
PRODUCTION URL                = https://www.bitrymdym.pl

PRODUCTION DB (tip)           = 20261003051539 / def01_e3_definer_execute_revoke
  also applied                = 20261002231150 / far01_r1_dryrun_readonly_role
                              = 20261003012453 / far01_live_mutator_role

FAR-01 DR-A                   = SHIPPED / PRODUCTION VERIFIED (historical Phase 1)
FAR-01 CAMPAIGN               = IN PROGRESS / SOAK ACTIVE
  canary N=5                  = PASS
  fleet N=62                  = PASS
  soak start                  = 2026-10-03T04:40:56.645Z
  soak end                    = 2026-10-04T04:40:56.645Z
  interim soak                = PASS · no drift
  retirement / cleanup        = NOT EXECUTED
  FAR-01 CLOSED?              = NO

DEF-01                        = CLOSED / PRODUCTION VERIFIED @ fbc696f
ACTIVE P0 / P1                = NONE VERIFIED
HIBP                          = DEFERRED / ACCEPTED RISK (not solved)

WORKER                        = Contabo · STOPPED / DISABLED · bootstrap 92496d4
SUPABASE PROJECT              = rzzxrgcdogkybkiidqgw
BRANCH                        = main

NEXT GATE                     = WAIT FOR SOAK END → FINAL SOAK AUDIT → Owner Review → FAR-01 closeout (only if evidence supports)
```

**Planes (never merge):**

| Plane | Current tip / state |
|-------|---------------------|
| Repository | `e03f3be` |
| Production app | `e03f3be` (operator tooling deploy) |
| Production DB | DEF-01 + FAR-01 R1/LIVE roles applied |
| Production Storage | post-fleet inventory under soak (see §6) |
| Session / operator | soak ACTIVE · dirty local docs worktree may exist |

**Primary continuity:** [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [PROJECT_STATE.md](./PROJECT_STATE.md) · [FAR_01_CURRENT_STATE.md](./audits/FAR_01_CURRENT_STATE.md)

---

## 1. Mandatory reading order (new agent)

1. **This file**
2. [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)
3. [PROJECT_STATE.md](./PROJECT_STATE.md)
4. [audits/FAR_01_CURRENT_STATE.md](./audits/FAR_01_CURRENT_STATE.md)
5. [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md)
6. [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md)
7. [architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md)
8. [ssot/MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md)
9. [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md)
10. [architecture/AUTHORIZATION.md](./architecture/AUTHORIZATION.md) · [architecture/RECORDING.md](./architecture/RECORDING.md)
11. [decisions/OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md)
12. [CHANGELOG.md](./CHANGELOG.md)
13. Relevant audit/closeout **only** when Owner selects that surface

**Before any implementation:** AUDIT → REPORT → wait for **Owner GO**.

Repo root: [AGENTS.md](../AGENTS.md) — Next.js in this repo may differ from training data.

---

## 2. What BitRymDym is

| Item | Value |
|------|--------|
| Product | Music platform for beat culture (listen, download, record takes, community upload) |
| Brand rule | Own musical identity — **not** generic AI SaaS UI (SSOT §2) |
| Stack | Next.js (App Router) · TypeScript · Tailwind · shadcn base · Supabase · Vercel · Contabo EXTERNAL compute |
| Auth | Supabase Auth · roles USER / MODERATOR / ADMINISTRATOR |
| Account levels | BEGINNER_RAPPER · PRO_RAPPER · LEGEND_RAPPER (≠ Premium) |

---

## 3. Architecture map (Hybrid C)

```text
BROWSER
  → Vercel / Next.js
       Auth · AuthZ · API · Access Gate · Mix orchestration · signed URL issuance
  → Supabase PostgreSQL
       metadata SSOT · RLS · entitlements · jobs · artifacts rows
  → Supabase Storage = DURABLE MEDIA SSOT (ONLY durable media V1)
       beat-audio · take-audio · audio-artifacts  (all PRIVATE)
  → Contabo VPS = EXTERNAL COMPUTE
       FFmpeg / ephemeral processing
       NOT library · NOT durable media · NOT backup · NOT audio SSOT
       worker unit currently STOPPED / DISABLED (bootstrap 92496d4)
```

| Layer | Role | Durable audio? |
|-------|------|----------------|
| Vercel | App / AuthZ / orchestration | NO |
| Supabase DB | Metadata SSOT | metadata only |
| Supabase Storage | Durable media SSOT | YES |
| Contabo VPS | EXTERNAL COMPUTE | NO |

STORAGE-ARCH-01 = **LOCKED**. External Object Storage = **NOT IMPLEMENTED**.

---

## 4. Capability matrix (living)

| Capability | Status |
|------------|--------|
| Public beats / catalog / detail / playback / signed playback | PRODUCTION VERIFIED |
| Downloads / download limits | PRODUCTION VERIFIED |
| Account / takes / beats / upload / moderation / admin | PRODUCTION VERIFIED |
| Recording Waves 1–5 / Quick Take / anonymous QT | PRODUCTION VERIFIED |
| Shared grants → RECORD only | PRODUCTION VERIFIED |
| E3 Mix / Master / Render / Export / Free Basic / PUBLIC_AUDIO | PRODUCTION VERIFIED — GREEN |
| Premium HQ/WAV entitlement layer | SHIPPED on Prod · Premium E2E **NOT TESTED** |
| audio-artifacts | SHIPPED · janitor **DEFERRED** |
| FAR-01 DR-A dual-accept | SHIPPED / PRODUCTION VERIFIED |
| FAR-01 backfill campaign (canary+fleet) | **EXECUTED** · **SOAK ACTIVE** · **NOT CLOSED** |
| FAR-01 retirement / orphan cleanup | **NOT EXECUTED** |
| Fala 3.5.1 Recording UX | CLOSED · PRELIMINARY PASS · **NOT DEPLOYED** |
| Messaging / comments / voting / payments / STEMS / track publish | NOT STARTED / DEFERRED |
| External Object Storage | NOT IMPLEMENTED |

---

## 5. Session closeout (2026-10-03)

What this session completed (evidence in `docs/audits/` + `docs/audits/evidence/`):

1. FAR-01 audit / RCA / design freeze
2. R1 role `far01_dryrun_readonly` + LIVE role `far01_live_mutator` (prod applied + repo reconciled @ `e03f3be`)
3. Production dry-run · checksum · identity · quarantine gates
4. Canary **N=5 PASS** · Fleet **N=62 PASS**
5. Soak **STARTED** · interim **PASS** · clock **ACTIVE** until `2026-10-04T04:40:56.645Z`
6. DEF-01 E3 DEFINER EXECUTE revoke · **PRODUCTION VERIFIED** @ `fbc696f`
7. Post-DEF-01 P0/P1 audit · **CLEAN** · HIBP **ACCEPTED RISK**
8. Commit 1 `e03f3be` · push · Production deploy `6823806375` (operator tooling)

**Do not mark FAR-01 CLOSED. Do not delete legacy/orphans. Do not start retirement.**

---

## 6. FAR-01 current inventory (soak)

| Class | Count |
|-------|------:|
| legacy USER | 1 |
| canonical USER | 77 |
| platform | 3 |
| retained legacy sources | 67 |
| true/historical orphans | 30 |
| total orphan Storage | 97 |
| quarantine | 1 |
| MIGRATE candidates | 0 |

Living status: [FAR_01_CURRENT_STATE.md](./audits/FAR_01_CURRENT_STATE.md)
Historical Phase 1 closeout (DR-A only): [FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md](./audits/FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md)

---

## 7. Security

| Item | Status |
|------|--------|
| DEF-01 | CLOSED / PRODUCTION VERIFIED |
| DEF-02 `is_admin` / `is_moderator` / `is_staff` | Intentional RLS helpers · Advisor WARN only |
| ACTIVE P0 | NONE VERIFIED |
| ACTIVE P1 | NONE VERIFIED |
| HIBP | DEFERRED / ACCEPTED RISK — **not solved** |

Operator secrets (`.env.far01.local`, JWT secret, service role): **CONFIGURED locally / NOT in git / NEVER print**.

---

## 8. Cursor / Agent operating rules

Principles: **SSOT FIRST · REUSE FIRST · ZERO DUPLICATE LOGIC · SERVER AUTHORIZATION · PRIVATE AUDIO · DOCUMENTATION CONTINUITY**

Workflow:

```text
AUDIT → RCA → PLAN → DESIGN FREEZE → ARCH REVIEW → OWNER GO
→ IMPLEMENT → BUILD → TEST → OWNER VERIFY → COMMIT → PUSH
→ PRODUCTION VERIFY → POST RELEASE → CLOSE
```

Git hygiene:

- **Never** `git add .` / `git add -A` / `git add -u`
- Exact allowlist only
- **Do not commit:** `.agents/` · `.cursor/` · `skills-lock.json` · `infra/oracle/` · `.env` · `.env.local` · `.env.far01.local` · secrets

Local dirty worktree (may remain after docs commits):

```text
LOCAL WORKTREE DIRTY (non-product)
  staged = 0 (when clean after docs commit)
  modified tracked = 0 (typical)
  untracked leaves ≈ 130 before docs commit
  git status ≈ 80 ?? (collapsed)
  Cursor ≈ 78 (often hides .agents/.cursor)
  Mass = docs/evidence + agent tooling + infra residue — NOT 80 product code changes
```

---

## 9. Absolute prohibitions without Owner GO

- Production deploy / Vercel env changes
- Contabo worker start / systemd / VPS mutate
- Supabase schema / RLS / Storage object delete / retirement
- FAR-01 LIVE mutator / backfill / cleanup / orphan GC
- Treat Contabo as durable media
- Rewrite historical closeouts to fake current tip
- Stage agent/infra secrets residue

---

## 10. Cold-start checklist

```text
[ ] git fetch && git rev-parse HEAD           → expect e03f3be (or later docs tip)
[ ] Confirm Production app tip via Deployments (may equal repo tip)
[ ] Read FAR_01_CURRENT_STATE — soak ACTIVE until 2026-10-04T04:40:56.645Z
[ ] Do NOT mark FAR-01 CLOSED / retirement / cleanup complete
[ ] Do NOT start next epic without Owner GO
[ ] AUDIT FIRST → report → wait for Owner GO
```

---

## 11. Handoff stamp

```text
FINAL COLD START HANDOFF     = READY (after this docs reconciliation commit)
REPOSITORY HEAD              = e03f3be
PRODUCTION APP SHA           = e03f3be (operator tooling)
PRODUCTION DEPLOYMENT        = 6823806375
FAR-01                       = IN PROGRESS / SOAK ACTIVE
DEF-01                       = CLOSED / PRODUCTION VERIFIED
HIBP                         = DEFERRED / ACCEPTED RISK
WORKER                       = STOPPED / DISABLED (EXTERNAL COMPUTE)
NEXT GATE                    = SOAK END → FINAL SOAK AUDIT
PRIOR CHAT REQUIRED          = NO
```

*End of FINAL COLD START HANDOFF.*
