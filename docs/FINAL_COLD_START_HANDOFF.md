# BitRymDym — FINAL COLD START HANDOFF

**Purpose:** Jedyny wymagany entry point dla nowego ChatGPT Architect + Cursor Agent.
**Owner / Product Owner:** Prezes Dawid
**Updated:** 2026-10-05
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

## 0. READ THIS FIRST — CURRENT STATUS

BitRymDym to platforma muzyczna: **rap · hip-hop · bity · odsłuch · pobieranie · Quick Take · społeczność · współpraca**.

**Owner** decyduje. Agent **nie** decyduje samodzielnie.
**Obecny chat NIE jest wymagany** — ciągłość = docs + evidence w repo.

```text
REPOSITORY HEAD / origin/main = 1c630809f15e5814b75d133ed04b0ebc3cda4001
  short                       = 1c63080
  message                     = fix(ui): polish residual home/beat/admin copy

PRODUCTION APP SHA            = 1c63080
PRODUCTION DEPLOYMENT         = dpl_2YVDSYPXsmrmx9hxQiF9X6AgVRQP
GitHub Production             = 6866686435
PRODUCTION URL                = https://www.bitrymdym.pl · https://bitrymdym.pl
DEPLOYMENT STATE              = READY / SUCCESS

LAST PRODUCTION VERIFY        = POLISH-01 residual hotfix · GREEN WITH NOTES
KNOWN WAIVER                  = e3-7-f-download-authz / EXPORT_WAV
                              = PRE-EXISTING / OUT OF SCOPE / WAIVED BY OWNER
                              (NIE traktować jako nowy regres)

BRANCH                        = main
SUPABASE PROJECT              = rzzxrgcdogkybkiidqgw
WORKER                        = Contabo · STOPPED / DISABLED · bootstrap 92496d4

NEXT GATE                     = P3 production deploy + verify (implementation READY)
P3 STATUS                     = IMPLEMENTED / READY FOR REVIEW
P3 NEXT ACTION                = Owner review → commit/push → production app deploy → verify
```

### CURRENT STATUS (closed / verified)

| Track | Status |
|-------|--------|
| **POLISH-01** (+ residual hotfix) | **CLOSED / PRODUCTION VERIFIED** @ `579acb3` → residual `1c63080` |
| **P0** PLATFORM master download deny | **CLOSED / PRODUCTION VERIFIED** @ `fdfff71` |
| **P1** Sample Policy Matrix | **CLOSED / PRODUCTION VERIFIED** @ `5927e35` |
| **P2** Explicit Sample Replace | **CLOSED / PRODUCTION VERIFIED** @ `943d81e` |
| **BPM** (+ real beats / corrections) | **CLOSED / PRODUCTION VERIFIED** |
| **ARCH-05** orphan GC | **CLOSED / VERIFIED** · live Storage **11 / 8 / 3 / 0 / 0** |
| **USER-ID-01** | **CLOSED / PRODUCTION VERIFIED** |
| **ADMIN W0–W4** | **CLOSED / PRODUCTION VERIFIED** |
| **Recording Waves 1–5 / D02** | **CLOSED / PRODUCTION VERIFIED** |
| **E3 Full Audio** | **PRODUCTION VERIFIED — GREEN** (Premium HQ/WAV E2E: see waiver) |
| **FAR-01** | **SOAK COMPLETE / CONTAMINATED** · retirement **NOT EXECUTED** · **NOT CLOSED** (ops — nie NEXT product gate) |

**Historyczne tipy** (`e03f3be`, `ddcee65`, `ffe723b`, `4e33e8d`, …) = **HISTORYCZNE RELEASE** — nie current baseline.

**Planes (never merge):**

| Plane | Current tip / state |
|-------|---------------------|
| Repository | `1c63080` |
| Production app | `1c63080` |
| Production DB | tip includes admin W4 + P1 sample_policy_settings · verify remote before DB work |
| Production Storage | live **11** (USER 8 · PLATFORM 3 · ORPHAN 0) · historical backup **43/43 RETAINED** |
| Session / operator | dirty local WIP may exist — **nie czyścić bez Owner GO** |

**Primary continuity:** [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [PROJECT_STATE.md](./PROJECT_STATE.md)

---

## 1. Mandatory reading order (new agent)

1. **This file**
2. [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)
3. [PROJECT_STATE.md](./PROJECT_STATE.md)
4. [ssot/MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md)
5. [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md)
6. [architecture/AUTHORIZATION.md](./architecture/AUTHORIZATION.md) · [architecture/RECORDING.md](./architecture/RECORDING.md)
7. [audits/POLISH-01_DESIGN_FREEZE.md](./audits/POLISH-01_DESIGN_FREEZE.md)
8. [audits/P0_PLATFORM_MASTER_DOWNLOAD_DENY.md](./audits/P0_PLATFORM_MASTER_DOWNLOAD_DENY.md) · [P1_SAMPLE_POLICY_MATRIX.md](./audits/P1_SAMPLE_POLICY_MATRIX.md) · [P2_REPLACE_SAMPLE_IMPLEMENTATION.md](./audits/P2_REPLACE_SAMPLE_IMPLEMENTATION.md)
9. [decisions/OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md)
10. [CHANGELOG.md](./CHANGELOG.md)
11. Relevant audit/closeout **only** when Owner selects that surface

**Before any implementation:** AUDIT → REPORT → wait for **Owner GO**.

Repo root: [AGENTS.md](../AGENTS.md) — Next.js w tym repo może różnić się od training data.

---

## 2. Czym jest BitRymDym

| Item | Value |
|------|--------|
| Produkt | Platforma muzyczna (odsłuch, pobieranie, nagrania Quick Take, community upload) |
| Brand | Własna tożsamość muzyczna — **nie** generyczny AI SaaS UI (SSOT §2) |
| Stack | Next.js (App Router) · TypeScript · Tailwind · shadcn base · Supabase · Vercel · Contabo EXTERNAL compute |
| Auth roles (enum) | `USER` · `MODERATOR` · `ADMIN` (UI: Administrator) |
| Account levels | `BEGINNER_RAPPER` · `PRO_RAPPER` · `LEGEND_RAPPER` (**≠** Premium) |
| Premium tiers | Free · Bronze · Silver · Gold (**KEEP EN** · **≠** Role / Account Level / Rank) |

---

## 3. Architecture map (Hybrid C)

```text
BROWSER
  → Vercel / Next.js
       Auth · AuthZ · API · Access Gate · Mix orchestration · signed URL issuance
  → Supabase PostgreSQL
       metadata SSOT · RLS · entitlements · jobs · artifacts rows
  → Supabase Storage = DURABLE MEDIA SSOT (ONLY durable media V1)
       beat-audio · take-audio · audio-artifacts  (PRIVATE)
  → Contabo VPS = EXTERNAL COMPUTE
       FFmpeg / ephemeral processing
       NOT library · NOT durable media · NOT backup · NOT audio SSOT
       worker unit STOPPED / DISABLED (bootstrap 92496d4)
```

STORAGE-ARCH-01 = **LOCKED**. External Object Storage = **NOT IMPLEMENTED / DEFERRED**.

---

## 4. Capability matrix (living)

| Capability | Status |
|------------|--------|
| Public catalog / beat detail / playback / signed playback | PRODUCTION VERIFIED |
| Account / takes / beats / upload / moderation / admin | PRODUCTION VERIFIED |
| Recording Waves 1–5 / Quick Take / anonymous QT | PRODUCTION VERIFIED |
| Shared grants → RECORD only | PRODUCTION VERIFIED |
| E3 Mix / Master / Render / Export / Basic MP3 / PUBLIC_AUDIO | PRODUCTION VERIFIED — GREEN |
| P0 PLATFORM master download deny | **CLOSED / PRODUCTION VERIFIED** |
| P1 Sample Policy | **CLOSED / PRODUCTION VERIFIED** |
| P2 Explicit Sample Replace | **CLOSED / PRODUCTION VERIFIED** |
| POLISH-01 (+ residual) | **CLOSED / PRODUCTION VERIFIED** |
| BPM / real beats import + corrections | **CLOSED / PRODUCTION VERIFIED** |
| USER-ID-01 / ACCOUNT-PROFILE-01 | PRODUCTION VERIFIED |
| ADMIN W0–W4 | PRODUCTION VERIFIED |
| Premium HQ/WAV export capability assert | **KNOWN WAIVER** (`EXPORT_WAV`) — PRE-EXISTING / WAIVED |
| FAR-01 campaign | SOAK COMPLETE / CONTAMINATED · **NOT CLOSED** |
| Messaging / comments / voting / payments / STEMS / Premium catalog | DEFERRED |
| External Object Storage | NOT IMPLEMENTED / DEFERRED |
| **P3 Anonymous → Account Claim** | **IMPLEMENTED / READY FOR REVIEW** · deploy pending |

---

## 5. Backup / DR (krótko)

```text
Local Layer-2 path     = C:\BitRymDym-Backup\
Full backup            = local-layer2-full-20261005T040146Z-42d6212b
Inventory              = 43/43 (USER 8 · PLATFORM 3 · ORPHAN 32 historical)
Restore drill          = local-restore-20261005T040831Z-76ca3678
Restore                = 43/43 · SHA/size/WAV/ffprobe/manifests PASS
VPS Layer-1            = 43/43 BACKED UP (staging · Contabo ≠ durable SSOT)
Live production Storage after ARCH-05 = 11 / 8 / 3 / 0 / 0
Backup ≠ Storage SSOT ≠ VPS
```

Szczegóły: [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [PROJECT_STATE.md](./PROJECT_STATE.md) · STORAGE_ARCH_07 audits.

---

## 6. Security / known waiver

| Item | Status |
|------|--------|
| DEF-01 | CLOSED / PRODUCTION VERIFIED |
| ACTIVE product P0/P1 (security) | NONE VERIFIED as open blockers |
| HIBP | DEFERRED / ACCEPTED RISK |
| `e3-7-f` / `EXPORT_WAV` | **PRE-EXISTING / OUT OF SCOPE / WAIVED BY OWNER** |

Secrets: **NIGDY** commit / print / stage.

---

## 7. Cursor / Agent operating rules

**SSOT FIRST · REUSE FIRST · ZERO DUPLICATE LOGIC · SERVER AUTHORIZATION · PRIVATE AUDIO · DOCUMENTATION CONTINUITY**

```text
AUDIT → RCA → PLAN → DESIGN FREEZE → ARCH REVIEW → OWNER GO
→ IMPLEMENT → BUILD → TEST → OWNER VERIFY → COMMIT → PUSH
→ PRODUCTION DEPLOY → PRODUCTION VERIFY → POST RELEASE → CLOSE
```

Git:

- **Nigdy** `git add .` / `git add -A` / `git add -u`
- Exact allowlist only
- **Nie stage'uj:** `.agents/` · `.cursor/` · `skills-lock.json` · `infra/oracle/` · `.env*` · secrets · backup artifacts · niezamierzone WIP

Dirty worktree: **nie czyść** bez Owner GO.

---

## 8. NEXT GATE — P3 (prompt dla Cursor)

**P3 — Anonymous → Account Claim**
**Status:** NOT STARTED
**Następna akcja:** **READ-ONLY AUDIT** (zero implementacji)

```text
Zbadaj możliwość bezpiecznego:
Anonymous recording → signup/login → claim własnego nagrania → przypisanie take do authenticated user.

Audyt MUSI sprawdzić:
1. anonymous_token_hash
2. cookie/session
3. ownership
4. claim RPC
5. RLS
6. AuthZ
7. IDOR
8. replay
9. token possession
10. stale token
11. expiry
12. deleted take
13. pending take
14. concurrent claim
15. cross-user claim
16. cross-device behavior
17. signup/login behavior
18. storage
19. quotas
20. TTL
21. replace interaction
22. UX
23. migration impact
24. security threat model

Workflow:
AUDIT → RCA → PLAN → DESIGN FREEZE → ARCH REVIEW → OWNER GO

BEZ IMPLEMENTACJI. BEZ MIGRACJI. BEZ DEPLOY.
```

Baza evidence: D02 closeout (anon→account claim = OUT) · sample download audit.

---

## 9. Absolute prohibitions without Owner GO

- Runtime / AuthZ / DB / Storage / migration mutate
- P3 implementacja
- EXPORT_WAV „fix”
- Reopen zamkniętych epików bez nowego evidence
- Traktowanie Contabo jako durable media / backup SSOT
- Stage agent/infra/secrets residue
- `git add .` / `-A` / `-u`

---

## 10. Cold-start checklist

```text
[ ] git fetch && git rev-parse HEAD           → expect 1c63080 (lub nowszy docs tip po tym pliku)
[ ] git rev-parse origin/main                → match HEAD
[ ] Confirm Production app SHA = 1c63080 (Deployments / aliases www + apex)
[ ] Read MASTER_HANDOFF + PROJECT_STATE
[ ] NEXT GATE = P3 READ-ONLY AUDIT — nie implementuj
[ ] Nie reopen P0/P1/P2/POLISH-01/ARCH-05/BPM bez nowego evidence
[ ] Nie czyść dirty WIP
[ ] AUDIT FIRST → report → wait for Owner GO
```

---

## 11. Handoff stamp

```text
FINAL COLD START HANDOFF     = READY (continuity reconciled 2026-10-05)
REPOSITORY HEAD              = 1c63080
PRODUCTION APP SHA           = 1c63080
PRODUCTION DEPLOYMENT        = dpl_2YVDSYPXsmrmx9hxQiF9X6AgVRQP
LAST VERIFY                  = POLISH-01 residual · GREEN WITH NOTES
KNOWN WAIVER                 = e3-7-f EXPORT_WAV · WAIVED
NEXT GATE                    = P3 — Anonymous → Account Claim · READ-ONLY AUDIT FIRST
PRIOR CHAT REQUIRED          = NO
NIE BUDUJ OD NOWA            = TAK
SEARCH BEFORE CREATE         = TAK
```

*End of FINAL COLD START HANDOFF.*
