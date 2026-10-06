# BitRymDym — FINAL COLD START HANDOFF

**Purpose:** Jedyny wymagany entry point dla nowego ChatGPT Architect + Cursor Agent.
**Owner / Product Owner:** Prezes Dawid
**Updated:** 2026-10-06 — P5.7 Architecture Audit **GO WITH CONDITIONS** · production app **`7f80143`** (P5.6 GREEN) · D02 **CLOSED** @ `44dc22c` (test-only) · **NEXT = P5.8** · docs-only · **no redeploy**
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
PRODUCTION APP SHA            = 7f801430d6680c32e7af5a4e6f5b6818541014d8
  short                       = 7f80143
  note                        = P5.6 Studio Take Workflow · PRODUCTION VERIFIED — GREEN · no redeploy this docs wave

REPOSITORY HEAD / origin/main = advances with SSOT reconcile
  includes                    = 44dc22c D02 test-only + docs tip
PRODUCTION URL                = https://www.bitrymdym.pl · https://bitrymdym.pl
DEPLOYMENT STATE              = READY / SUCCESS
  this wave                   = NO REDEPLOY (documentation-only reconciliation)

LAST STUDIO VERIFY            = P5.6 · PRODUCTION VERIFIED — GREEN
D02 HARNESS                   = CLOSED @ 44dc22c · TEST ONLY
P5.7                          = Architecture Audit · GO WITH CONDITIONS
P5.8                          = NEXT — Studio Devices / Input & Device Foundation (Design Freeze pending)
KNOWN WAIVER                  = e3-7-f-download-authz / EXPORT_WAV
                              = PRE-EXISTING / OUT OF SCOPE / WAIVED BY OWNER

BRANCH                        = main
SUPABASE PROJECT              = rzzxrgcdogkybkiidqgw
WORKER                        = Contabo · STOPPED / DISABLED · bootstrap 92496d4

STUDIO P5.1–P5.5              = COMPLETE
P5.6 STATUS                   = PRODUCTION VERIFIED — GREEN @ 7f80143 · finalize ≠ place
FALA 3.5.1 STATUS             = CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN @ c690831
P3 STATUS                     = COMPLETE / PRODUCTION VERIFIED — GREEN @ dabbc936 · UNCHANGED
P3 FOLLOW-UP                  = p_take_id hardening · NON-BLOCKING
NEXT GATE                     = P5.8 Design Freeze (Studio Devices / Input & Device Foundation)
```

### CURRENT STATUS (closed / verified)

| Track | Status |
|-------|--------|
| **P5.6** Studio Take Workflow | **PRODUCTION VERIFIED — GREEN** @ `7f80143` · finalize ≠ place |
| **P5.1–P5.5** Studio units | **COMPLETE** |
| **D02** live harness | **CLOSED** @ `44dc22c` (**TEST ONLY**) |
| **P5.7** Architecture Audit | **COMPLETE — GO WITH CONDITIONS** |
| **Fala 3.5.1** Recording Experience | **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** @ `c690831` |
| **P3** Anonymous → Account Claim | **COMPLETE / PRODUCTION VERIFIED — GREEN** @ `dabbc936` · **UNCHANGED** |
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

**Historyczne tipy** (`dabbc936` as feature tip, `1c63080`, `e03f3be`, `ddcee65`, `ffe723b`, `4e33e8d`, …) = **HISTORYCZNE / FEATURE RELEASE** — nie mylić z verify baseline `75bd80f`.

**Planes (never merge):**

| Plane | Current tip / state |
|-------|---------------------|
| Repository | advances with SSOT reconcile (includes `44dc22c` + docs) |
| Production app | `7f80143` · **UNCHANGED** this docs wave (no redeploy) |
| Production DB | includes P3 `claim_anon_take_to_account` + P1/P2 RPCs · verify remote before DB work |
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
| **P3 Anonymous → Account Claim** | **COMPLETE / PRODUCTION VERIFIED — GREEN** @ `dabbc936` · **UNCHANGED** |
| **Fala 3.5.1 Recording Experience** | **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** @ `c690831` · verify `75bd80f` |

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

## 8. P3 COMPLETE — PRODUCTION VERIFIED GREEN (canonical handoff)

**P3 — Anonymous Take → Account Claim**
**Status:** **COMPLETE / PRODUCTION VERIFIED — GREEN**
**SHA:** `dabbc93695c14609095db90b581e65ceaf221611`
**Deploy:** `dpl_Hd4QAwDkkw99FMiFhh8nJ1N6nvsR` · https://www.bitrymdym.pl

```text
Architecture:
  Anonymous READY → auth session → tryClaimAnonTakeAfterAuth
  → Premium Tier getSamplePolicy (TTL/cap)
  → Storage COPY anon/.../mic.bin → claim_anon_take_to_account
  → ownership XOR transfer → user/.../mic.bin
  → DELETE source → clear brd_tk_aid (CLAIM_OK / IDEMPOTENT_REPLAY only)
  → /account?claim=...

Security invariants:
  Ownership XOR · take-audio private · RPC service_role-only
  READY-only · latest · cookie-bound · cap DENY · fail-open auth
  token/hash not logged

Verification:
  Deployment/migration/RPC/Storage/ownership/idempotency/CAP/D02·P2/runtime = PASS
  Fixture cleanup PASS (allowlisted IDs only)

Cookie production:
  clear = CODE-VERIFIED
  full disposable E2E = NOT EXECUTED
  (no safe disposable production recording + guaranteed cleanup)

Follow-up (NON-BLOCKING):
  optional p_take_id RPC binding — do NOT implement without Owner GO
```

Architecture detail: [architecture/RECORDING.md](./architecture/RECORDING.md) · decisions: OD-P3-01…11 in [DECISION_LOG.md](./decisions/DECISION_LOG.md).

---

## 8b. Fala 3.5.1 — PRODUCTION VERIFIED GREEN (canonical)

**Fala 3.5.1 — Recording Experience + Dual Audio Timeline**
**Status:** **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN**
**Feature:** `c690831`
**Verify baseline:** `75bd80f` · https://www.bitrymdym.pl
**Production app:** `dabbc936` · **no redeploy** this wave (already in ancestry)

```text
DESIGN FREEZE           = GO
IMPLEMENTATION          = ALREADY SHIPPED
PRODUCTION VERIFICATION = PASS (D-V matrix)
PRODUCTION              = GREEN
STATUS                  = CLOSED

Historical Plan Baseline:
  42369c0

Actual Production Verification Baseline:
  75bd80f

Reason:
  production/repository tip advanced after subsequent docs-only reconciliation/deploy lineage.

Findings (non-blocking):
  F351-V-01 LOW — first automated REC generic error · retry succeeded · no micro-patch
  F351-V-02 FALSE POSITIVE / NOT REPRODUCED — sticky-nav intercept = tooling artifact

Regression:
  P1 UNCHANGED · P2 UNCHANGED · P3 UNCHANGED
  No security blocker · No Storage/Auth/RLS changes
```

Plan: [D_FALA_351_PRODUCTION_VERIFY_PLAN.md](./audits/D_FALA_351_PRODUCTION_VERIFY_PLAN.md) · Architecture: [architecture/RECORDING.md](./architecture/RECORDING.md)

---

## 9. Absolute prohibitions without Owner GO

- Runtime / AuthZ / DB / Storage / migration mutate
- P3 `p_take_id` hardening (non-blocking backlog — not auto-start)
- EXPORT_WAV „fix”
- Reopen zamkniętych epików bez nowego evidence (incl. Fala 3.5.1 / P3)
- Traktowanie Contabo jako durable media / backup SSOT
- Stage agent/infra/secrets residue
- `git add .` / `-A` / `-u`

---

## 10. Cold-start checklist

```text
[ ] git fetch && git rev-parse HEAD           → expect docs tip ≥ 44dc22c (D02) + P5.7 SSOT reconcile
[ ] git rev-parse origin/main                → match HEAD
[ ] Confirm Production app SHA = 7f80143 (P5.6) · docs/test tip may be ahead · no redeploy for docs
[ ] Read MASTER_HANDOFF + PROJECT_STATE + P5_7_STUDIO_ARCHITECTURE_AUDIT
[ ] P5.6 = PRODUCTION VERIFIED — GREEN · D02 CLOSED · P5.7 GO WITH CONDITIONS
[ ] NEXT GATE = P5.8 Design Freeze (Studio Devices / Input & Device Foundation)
[ ] Do not call punch “P5.7” · do not implement P5.8 without Design Freeze + Owner GO
[ ] Fala 3.5.1 / P3 = CLOSED / GREEN — do not re-open without new evidence
[ ] Nie reopen P0/P1/P2/POLISH-01/ARCH-05/BPM/P3/P5.6/Fala 3.5.1 bez nowego evidence
[ ] Nie czyść dirty WIP
[ ] AUDIT FIRST → report → wait for Owner GO
```

---

## 11. Handoff stamp

```text
FINAL COLD START HANDOFF     = READY (P5.7 SSOT reconciled 2026-10-06)
PRODUCTION APP SHA           = 7f80143 · P5.6 · UNCHANGED (docs-only · no redeploy)
D02 HARNESS                  = CLOSED @ 44dc22c · TEST ONLY
P5.7                         = Architecture Audit · GO WITH CONDITIONS
P5.8                         = NEXT — Studio Devices / Input & Device Foundation
LAST STUDIO VERIFY           = P5.6 · PRODUCTION VERIFIED — GREEN
KNOWN WAIVER                 = e3-7-f EXPORT_WAV · WAIVED
FALA 3.5.1                   = CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN @ c690831
P3 STATUS                    = COMPLETE / PRODUCTION VERIFIED — GREEN · UNCHANGED
P3 FOLLOW-UP                 = p_take_id · NON-BLOCKING
NEXT GATE                    = P5.8 Design Freeze
PRIOR CHAT REQUIRED          = NO
NIE BUDUJ OD NOWA            = TAK
SEARCH BEFORE CREATE         = TAK
```

*End of FINAL COLD START HANDOFF.*
