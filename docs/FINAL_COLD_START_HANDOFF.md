# BitRymDym — FINAL COLD START HANDOFF

**Purpose:** Jedyny wymagany entry point po zamknięciu poprzedniej sesji ChatGPT + Cursor.  
**Audience:** nowy ChatGPT + nowy Cursor Agent  
**Owner / Product Owner:** Prezes Dawid  
**Updated:** 2026-10-01  
**Type:** Documentation continuity · **DOCS ONLY** (ten plik nie jest Evidence of shipped code)

**Evidence rule (bezwzględna):**

```text
CODE + REMOTE SCHEMA + PRODUCTION EVIDENCE  >  documentation prose
Documentation alone ≠ proof a feature is shipped
Decision CLOSED ≠ delivery SHIPPED
Production verification = separate stage
```

---

## 0. READ THIS FIRST

BitRymDym to platforma muzyczna (rap / hip-hop / bity): odkrywanie bitów → odsłuch → pobieranie → Quick Take / Recording → (przyszłość) społeczność i współpraca.

**Owner** podejmuje decyzje produktowe, zakresowe i architektoniczne. Agent **nie** podejmuje ich samodzielnie.

**Obecny chat NIE jest wymagany.** Cała ciągłość ma być w repozytorium docs.

```text
CURRENT REPOSITORY TIP     = 82e0194
  (docs: reconcile storage architecture v1)
CURRENT PRODUCTION APP     = 6dfd201
PRODUCTION URL             = https://www.bitrymdym.pl
PRODUCTION DEPLOYMENT      = dpl_3H57UgU2TfqkYawzamsVJ13qnMsG
WORKER BOOTSTRAP           = 92496d4
WORKER                     = Contabo · STOPPED / DISABLED
SUPABASE PROJECT           = rzzxrgcdogkybkiidqgw
BRANCH                     = main
```

**SHA map (nie mylić · nie auto-align):**

| SHA | Meaning |
|-----|---------|
| `82e0194` | **Current repository / docs tip** (`origin/main`) |
| `6dfd201` | **Current Production application** (AC-PE-12 · PE tip) |
| `92496d4` | **Worker bootstrap** on Contabo (EXTERNAL encode) |
| `a8e9356` | **Historical** docs tip (post-release E3 docs) — superseded by `82e0194` |
| `9026fa9` | Historical W6.2/W6.3 UX ship |
| `17c4d530` | Historical E3.7 DARK Production baseline |
| `183b2a4` | Historical E3.6 Basic MP3 DARK closeout |

**Primary continuity (full detail):** [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)  
**Living “where now”:** [PROJECT_STATE.md](./PROJECT_STATE.md)  
**Product constitution:** [ssot/MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md)  
**Technical HOW:** [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md)

---

## 1. Mandatory reading order (new agent)

1. **This file** — `FINAL_COLD_START_HANDOFF.md`
2. [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)
3. [PROJECT_STATE.md](./PROJECT_STATE.md)
4. [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · [STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md)
5. [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md)
6. [architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md)
7. [ssot/MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md)
8. [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md)
9. [architecture/AUTHORIZATION.md](./architecture/AUTHORIZATION.md) · [architecture/RECORDING.md](./architecture/RECORDING.md)
10. [decisions/OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md)
11. [CHANGELOG.md](./CHANGELOG.md) (recent living entries)
12. Relevant closeout/audit only when Owner selects that surface

**Before any implementation:** AUDIT → REPORT → wait for **Owner GO**.

Repo root note: [AGENTS.md](../AGENTS.md) — Next.js in this repo may differ from training data; read local `node_modules/next/dist/docs/` before coding Next APIs.

---

## 2. What BitRymDym is

| Item | Value |
|------|--------|
| Product | Music platform for beat culture (listen, download, record takes, community upload) |
| Brand rule | Own musical identity — **not** generic AI SaaS UI (SSOT §2) |
| Stack | Next.js (App Router) · TypeScript · Tailwind · shadcn base · Supabase · Vercel · Contabo worker |
| Auth | Supabase Auth · roles USER / MODERATOR / ADMINISTRATOR · permissions tables |
| Account levels | BEGINNER_RAPPER · PRO_RAPPER · LEGEND_RAPPER (recording caps/retention; ≠ Premium) |

---

## 3. Current Production snapshot

```text
URL                      = https://www.bitrymdym.pl
APP SHA                  = 6dfd201
DEPLOYMENT               = dpl_3H57UgU2TfqkYawzamsVJ13qnMsG
STATUS                   = GREEN / PRODUCTION VERIFIED
E3                       = PRODUCTION VERIFIED — GREEN (PASS WITH FINDINGS)
E3_MIX_ENABLED           = ON
E3_RENDER_JOBS_ENABLED   = ON
E3_PUBLIC_AUDIO          = ON
AC-PE-12                 = PASS
GO #5                    = PASS
WORKER                   = STOPPED / DISABLED (Contabo · 92496d4)
W6                       = CLOSED / PASS (Owner-accepted emulated cert)
STORAGE-ARCH-01          = LOCKED
STORAGE-ARCH-02          = NOT STARTED
```

**Canonical Free rollback (Owner GO only):** unset/off `E3_PUBLIC_AUDIO` → Free public Mix/job/download DENY (AC-PE-12 fail-closed). Premium does **not** depend on `E3_PUBLIC_AUDIO`.

---

## 4. Architecture map (Hybrid C)

```text
BROWSER
  → Vercel / Next.js
       Auth · AuthZ · API · Access Gate · Mix orchestration · signed URL issuance
  → Supabase PostgreSQL
       metadata SSOT · RLS · entitlements · jobs · artifacts rows
  → Supabase Storage (ONLY durable media V1)
       beat-audio · take-audio · audio-artifacts  (all PRIVATE)
  → Contabo VPS EXTERNAL worker
       claim → download sources → bake/encode (FFmpeg) → upload artifact → DB finalize
       ephemeral tmp only (os.tmpdir()/e3-mp3-*)
       NOT library · NOT audio SSOT · NOT backup
```

| Layer | Role | Durable audio? |
|-------|------|----------------|
| Vercel | App / AuthZ / orchestration | NO |
| Supabase DB | Metadata SSOT | metadata only |
| Supabase Storage | Durable media | YES |
| Contabo | Compute / FFmpeg | NO |

Full Storage V1 lock: [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md)

---

## 5. Capability matrix (living)

| Capability | Status | Evidence anchor |
|------------|--------|-----------------|
| Beats catalog PLATFORM + USER community | SHIPPED / PROD VERIFIED | Community epic @ `c5e1f17` |
| Private `beat-audio` + Access Gate + signed play/download | SHIPPED / PROD VERIFIED | Phase 1.5+ |
| Downloads anon/auth limits + events | SHIPPED / PROD VERIFIED | Phase 1.8A |
| Community upload + moderation | SHIPPED / PROD VERIFIED | @ `c5e1f17` |
| Recording Waves 1–4 | SHIPPED / PROD VERIFIED | takes + `take-audio` + janitor |
| Recording Wave 5 Shared Grants → RECORD | SHIPPED / PROD VERIFIED | @ `37892a6` |
| D02 Anonymous Quick Take | SHIPPED / PROD VERIFIED | @ `e98ba52` |
| E3.1–E3.7 code (Mix/Master/Render/Premium encode) | ON Production | historically DARK at wave closeouts; living PE GREEN |
| E3 Production Enablement + Free Basic public path | COMPLETE / GREEN | @ `6dfd201` · GO #5 |
| E3 Premium Production E2E | **NOT TESTED** | no Premium fixture |
| STORAGE-ARCH-01 architecture | **LOCKED** | docs @ `82e0194` · no code change |
| STORAGE-ARCH-02 dual-read | **NOT STARTED** | FAR-01 · no Implementation GO |
| STEMS / payments / Premium catalog product | OUT / NOT STARTED | OD-04/07/08 OPEN |
| Track publish from take | NOT IMPLEMENTED | — |
| Artwork Storage bucket | DEFERRED | OD-SA-04 |
| Artifacts janitor | DEFERRED | F-PE-04 · STORAGE-ARCH-03 |
| P1-A HIBP | **BLOCKED** | Owner Dashboard action |

---

## 6. Audio / Storage domains (do not conflate)

| Domain | Bucket | DB SSOT | Notes |
|--------|--------|---------|-------|
| Beat library | `beat-audio` | `beat_audio_assets` | V1 physical **MASTER** + Access Gate fallback PLAYBACK/DOWNLOAD |
| Mic takes | `take-audio` | `takes` | TTL + takes janitor cron |
| Mix/export | `audio-artifacts` | `audio_artifacts` | E3 tiers BASIC_MP3 / HQ_MP3 / WAV |
| Artwork | — | `beats.cover_ref` (text) | **no** artwork bucket V1 |

**E3 quality tiers are export artifacts only** — not mandatory physical catalog derivatives (OD-SA-03).

**Legacy USER beat keys (FAR-01):** LIVE majority `user/{owner}/{beatId}/master/{assetId}.bin` vs canonical `user/{owner}/{beatId}/{assetId}/master.bin`. Policy: dual-read → staged migration (OD-SA-02). **Do not implement without STORAGE-ARCH-02 Owner GO.**

---

## 7. E3 short map

| Item | Value |
|------|--------|
| Architecture | C — HYBRID LOCKED |
| Worker | EXTERNAL Contabo · FFmpeg + libmp3lame (OD-E36-04 C) · not npm app dep |
| Flags | Mix ON · Jobs ON · PUBLIC_AUDIO ON |
| Free | EXPORT_BASIC_MP3 (+ Mix/Master Basic) · public path gated by AC-PE-12 |
| Premium | overlay `premium_entitlements` · HQ_MP3 + WAV · ≠ Role ≠ Account Level |
| Retention artifacts | Free 48h · Premium 30d (AuthZ honors expiry; GC janitor deferred) |
| Fake-complete | CI/domain only — **not** Production Final Truth |

Locks: [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) · PE: [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md)

**Do not rewrite** historical E3.6/E3.7/W6 closeouts or OD-E3-PE-* freeze locks.

---

## 8. Recording / Quick Take short map

| Item | Value |
|------|--------|
| Freeze | [PHASE_RECORDING_DESIGN_FREEZE.md](./phases/PHASE_RECORDING_DESIGN_FREEZE.md) **LOCKED** |
| Waves 1–5 | CLOSED / PRODUCTION VERIFIED |
| D02 anon QT | SHIPPED @ `e98ba52` |
| D03 grants | RECORD only @ `37892a6` · no PLAYBACK/DOWNLOAD via grant |
| Retention | BEGINNER 24h · PRO 10d · LEGEND 30d |
| Cron | `0 0 * * *` → `/api/cron/takes-janitor` · `CRON_SECRET` |

Index: [architecture/RECORDING.md](./architecture/RECORDING.md)

---

## 9. Security / AuthZ principles

```text
REQUEST → AUTH → SERVER AUTHZ → PERMISSION / ENTITLEMENT → BUSINESS RULE → RLS → DB/STORAGE
```

- Fail-closed defaults  
- Private Storage · no permanent public master URLs  
- Signed URLs only after server AuthZ  
- Client never chooses bucket / object_key / spoof paths  
- Worker: Bearer `E3_RENDER_WORKER_SECRET` (server-only · never commit)  
- `E3_PUBLIC_AUDIO` ≠ public bucket  

Security overall: **GREEN WITH WARNINGS** (HIBP disabled = MEDIUM residual).

---

## 10. Owner Decisions you must not reopen casually

| Family | Status |
|--------|--------|
| OD-01…03 stack | CLOSED |
| OD-E3-PE-01…05 | LOCKED (PE freeze) |
| OD-SA-01…10 | LOCKED (Storage V1) |
| OD-E36-04 / OD-E37-* / OD-W6-03 | LOCKED in E3/W6 docs |
| OD-REC-* / OD-COMMUNITY-* | CLOSED in Recording/Community freezes |
| OD-04/07/08 payments & Premium product | OPEN |
| OD-12 codec (outside E3 OAD-06) | OPEN |
| OD-15/16 brand | OPEN |

Full registry: [OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md) · [DECISION_LOG.md](./decisions/DECISION_LOG.md)

---

## 11. Open findings / deferred (not Implementation GO)

| ID / topic | Meaning | Next |
|------------|---------|------|
| **FAR-01** | Legacy beat keys vs canonical validators | STORAGE-ARCH-02 (dual-read) after Owner GO |
| **FAR-03** | “REQUIRED BEFORE SCALE” has no numeric threshold | Define at Wave 07 |
| **FAR-04** | Observability underspecified | Future wave design |
| F-PE-04 | audio-artifacts janitor deferred | STORAGE-ARCH-03 |
| Orphan beat-audio (~86 objects vs ~56 rows at audit) | inventory → dry-run → Owner GO | STORAGE-ARCH-04/05 |
| Premium Production E2E | NOT TESTED | needs fixture + Owner GO |
| P1-A HIBP | BLOCKED | Owner Dashboard only |
| Untracked host/Oracle audits · `infra/` · `.agents/` | local noise | **do not stage** without Owner |

---

## 12. Future work order (no auto-start)

```text
NEXT DEFAULT (unless Owner picks otherwise)
  = STORAGE-ARCH-02 AUDIT  (only after separate Owner GO)
  → dual-read design/implement waves later
  → STORAGE-ARCH-03 artifacts janitor
  → STORAGE-ARCH-04/05 orphan inventory/dry-run/cleanup
  → STORAGE-ARCH-06 staged key migration
  → STORAGE-ARCH-07 backup source MASTER (REQUIRED BEFORE SCALE)
  → optional worker hardening / artwork / beat derivatives only after new OD
```

Deferred product backlog (orthogonal): Premium E2E · ops dashboard · live rollback drill · STEMS · payments · public Free HQ/WAV · track publish · comments/voting/messaging UIs.

---

## 13. Absolute prohibitions without Owner GO

Nowy agent **NIE WOLNO** bez jawnego Owner GO:

- deploy Production / change Vercel Production env  
- start Contabo worker / change systemd / mutate VPS  
- change Supabase schema / RLS / Storage buckets / objects  
- implement STORAGE-ARCH-02+ (dual-read, janitor, orphan delete, key migrate, backup)  
- enable/disable E3 flags or mutate `E3_PUBLIC_AUDIO`  
- rewrite historical closeouts / OD locks  
- stage `.agents/` · `.cursor/` · `skills-lock.json` · untracked Oracle/host audits · `infra/` as product  
- invent OPEN decisions  
- treat Contabo as durable media library  

Workflow:

```text
AUDIT → RCA → PLAN → DESIGN FREEZE → ARCH REVIEW → OWNER GO
→ IMPLEMENT → BUILD → TEST → OWNER VERIFY → COMMIT → PUSH
→ PRODUCTION VERIFY → POST RELEASE → CLOSE
```

---

## 14. Documentation inventory (where truth lives)

| Area | Canonical paths |
|------|-----------------|
| Entry / continuity | `FINAL_COLD_START_HANDOFF.md` · `MASTER_HANDOFF.md` · `PROJECT_STATE.md` · `README.md` |
| Product SSOT | `ssot/MASTER_SSOT_v0.1.md` |
| Architecture | `architecture/*` · especially `SYSTEM_ARCHITECTURE.md` · `AUTHORIZATION.md` · `BEATS.md` · `RECORDING.md` · `AUDIO_TRANSPORT.md` · E3 locks |
| Phases / freezes | `phases/*` |
| Audits / closeouts | `audits/*` (E3 · Recording · Storage · worker host) |
| Decisions | `decisions/OPEN_DECISIONS.md` · `DECISION_LOG.md` |
| Ops runbook | `runbooks/PRODUCTION_BOOTSTRAP.md` (historical bootstrap) |
| Continuity rule | `DOCUMENTATION_CONTINUITY.md` |
| Changelog | `CHANGELOG.md` |

**Note:** folder `docs/operations/` — **does not exist**; use `runbooks/` + audits worker/host docs.  
Several `docs/audits/E3_*HOST* / ORACLE*` files may be **untracked** — treat as local research until Owner stages.

---

## 15. Documentation / Implementation drift (known at pack authorship)

| Drift | Detail | Action for new agent |
|-------|--------|----------------------|
| Docs tip vs older living prose | Before this pack, some living lines still cited `a8e9356` as tip while `origin/main` = `82e0194` | Prefer `git rev-parse HEAD` · treat `a8e9356` as historical |
| Feature matrix historical DARK cells | MASTER_HANDOFF §7 has wave-era DARK notes alongside living PE GREEN | Prefer §1 living Production + PROJECT_STATE |
| `audio-artifacts` “empty” historical verify rows | Older verify tables; PE GO #5 created artifacts | Prefer living PE evidence |
| Code validators vs LIVE keys | FAR-01 — known · not silently “fixed” | STORAGE-ARCH-02 only after GO |

If you find new contradiction: **STOP** · report DOCUMENTATION / IMPLEMENTATION DRIFT · do not auto-rewrite history.

---

## 16. Secrets / hygiene

Never print or commit:

- `CRON_SECRET`
- `E3_RENDER_WORKER_SECRET`
- Supabase service role / DB passwords
- Vercel tokens
- Contabo SSH keys

Use env stores only. Docs may say CONFIGURED — never paste values.

---

## 17. Cold-start checklist (new Cursor)

```text
[ ] git fetch && git rev-parse HEAD   → expect 82e0194 (or newer docs tip after later docs commits)
[ ] Confirm Production app tip still 6dfd201 unless Owner says otherwise
[ ] Read this file + MASTER_HANDOFF + PROJECT_STATE
[ ] Do NOT start STORAGE-ARCH-02 without Owner GO
[ ] Do NOT stage untracked agent/infra/host audits
[ ] AUDIT FIRST on any task → report → wait for Owner GO
[ ] Polish communication to Owner; keep technical identifiers English
```

---

## 18. Handoff closeout stamp

```text
FINAL COLD START HANDOFF     = READY
CURRENT REPOSITORY TIP       = 82e0194
CURRENT PRODUCTION APP       = 6dfd201
PRODUCTION DEPLOYMENT        = dpl_3H57UgU2TfqkYawzamsVJ13qnMsG
WORKER                       = STOPPED / DISABLED (92496d4)
E3                           = GREEN (PE COMPLETE)
STORAGE-ARCH-01              = LOCKED
STORAGE-ARCH-02              = NOT STARTED
IMPLEMENTATION FROM THIS DOC = NONE
PRIOR CHAT REQUIRED          = NO
```

**Next default Owner decision surface:** STORAGE-ARCH-02 — AUDIT (separate Owner GO) · or other backlog item Owner selects.

---

*End of FINAL COLD START HANDOFF.*
