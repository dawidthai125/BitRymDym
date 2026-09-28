# BitRymDym — Master Handoff

**Purpose:** Cold-start entry for a new GPT + Cursor Agent after session close.  
**Updated:** 2026-09-28  
**Owner:** Prezes Dawid  

**This document is continuity** (cold-start entry).  
Product truth remains [MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md). Technical HOW remains [SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md). Live “where we are now” remains [PROJECT_STATE.md](./PROJECT_STATE.md).

**Evidence rule:** code + remote schema prove implementation state. Documentation alone is **not** proof that a feature is shipped. Production verification is a separate stage from “docs say CLOSED”.

---

## 1. Current Production

| Field | Value |
|-------|--------|
| URL | https://www.bitrymdym.pl |
| **Application SHA** | `99c4815e26b224cb66e221831687b0688bf20476` (`99c4815`) |
| Status | **GREEN** / **PRODUCTION VERIFIED** |
| Recording Wave 4 | **CLOSED / PRODUCTION VERIFIED** |
| Cron | `0 0 * * *` (Vercel Hobby daily 00:00 UTC) → `/api/cron/takes-janitor` |
| `CRON_SECRET` | Configured in Vercel Production (**never print / never commit**) |
| Supabase project | `rzzxrgcdogkybkiidqgw` |

**Do not confuse SHAs — do not auto-align them:**

| SHA | Meaning |
|-----|---------|
| `99c4815` | **Production application** (Wave 4 code + Hobby cron) — unchanged by docs-only commits |
| `406ff5b` | **Prior git tip** — W4 docs closeout after prod verify |
| tip of `main` after continuity | **Docs-only continuity tip** (this reconciliation) — may differ from production |

Production app is **not** required to equal `origin/main` when tip is docs-only. Do **not** redeploy solely to equalize SHAs.

---

## 2. Current Git Baseline

| Field | Value |
|-------|--------|
| Branch | `main` |
| Remote | `origin` → `https://github.com/dawidthai125/bitrymdym` |
| Prior tip (pre-continuity) | `406ff5b` (`docs(recording): close wave 4 after production verify`) |
| **HEAD / origin/main** | docs continuity tip (`docs: reconcile cold-start continuity`) — ≠ production `99c4815` |
| Production app | `99c4815` |
| Typical untracked (ignore) | `.agents/` · `.cursor/` · `skills-lock.json` |

Do **not** stage agent tooling folders as product scope.

---

## 3. Project Purpose

BitRymDym is a music platform focused on rap / hip-hop / beat culture:

discover beats → listen → download → test vocals (takes) → (future) finish tracks → community / collaboration.

**Brand:** own musical identity — not generic AI SaaS UI.  
**Product constitution:** [MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md) (status DRAFT FOUNDATION — still binding for closed decisions).

---

## 4. Architecture

| Layer | Decision |
|-------|----------|
| Frontend | Next.js · TypeScript · Tailwind · shadcn/ui base · App Router (**OD-01**) |
| App server | Next.js Server Actions / Route Handlers (**OD-02**) — no separate Express/Nest |
| Infra | Supabase: PostgreSQL · Auth · RLS · Storage (**OD-03**) |
| Hosting | Vercel Production |
| Audio | Private buckets · short-lived signed URLs · no permanent public master URLs |
| Player | Custom `PlaybackShell` (not stock HTML-only player as product UX) |

Principles: **SSOT FIRST · REUSE FIRST · ZERO DUPLICATE LOGIC · SERVER AUTHORIZATION · PRIVATE AUDIO · DOCUMENTATION CONTINUITY**.

---

## 5. Security Model

### Canonical chain (platform)

```text
REQUEST
  → AUTH
  → SERVER AUTHZ
  → PERMISSION
  → BUSINESS RULE
  → RLS
  → DB / STORAGE
```

### Recording chain

```text
REQUEST
  → AUTH
  → SERVER AUTHZ
  → RECORDING ENTITLEMENT
  → BEAT ACCESS (PUBLISHED + READY master)
  → BUSINESS RULE (caps / retention)
  → RLS / STORAGE
  → TAKE
```

| Rule | Notes |
|------|--------|
| IDOR | Owner boundary on takes; foreign SELECT/preview/download DENY |
| Private Storage | `beat-audio`, `take-audio` — no public permanent object URLs |
| Signed URLs | Short TTL; issued only after server AuthZ |
| Entitlement / retention / anti-abuse | Server SSOT only — never trust client timers/levels |
| Claim RPC | `claim_take_recording_session` — `service_role` only |
| Cron | Bearer `CRON_SECRET`; missing/invalid → 401 |
| Staff | No blanket override of owner take boundary without an explicit future rule |

---

## 6. Roles and Account Levels

**Roles:** `USER` · `MODERATOR` · `ADMINISTRATOR` (permissions via `permissions` / `role_permissions`).

**Account levels (recording / retention / caps):**

| Level | Max record | Retention | Active READY | Sessions / UTC day |
|-------|------------|-----------|--------------|--------------------|
| BEGINNER_RAPPER | `MIN(beat, 30)` | 24h | 3 | 10 |
| PRO_RAPPER | `MIN(beat, 180)` | 10d | 10 | 30 |
| LEGEND_RAPPER | `MIN(beat, 180)` | 30d | 20 | 60 |

Concurrent recording sessions: **max 1** `PENDING_UPLOAD` per owner.  
Signup default account level: closed decision (BEGINNER path) — see Decision Log OD-19.

---

## 7. Feature Status Matrix

| Feature | Status | Production | Documentation | Notes |
|---------|--------|------------|---------------|-------|
| Next.js / TS / Tailwind / shadcn / App Router | CLOSED | GREEN | OK | OD-01 |
| Supabase Auth + profiles + roles + permissions + RLS | CLOSED | GREEN | OK | Phase 1.3 |
| Platform beats CRUD / lifecycle | CLOSED | GREEN | OK | Phase 1.4+ |
| Private `beat-audio` + Access Gate + signed play/download | CLOSED | GREEN | OK | Phase 1.5+ |
| Custom PlaybackShell | CLOSED | GREEN | OK | Phase 1.6/1.7 area |
| BPM V1 detector + safety rules + BPM SSOT | CLOSED | GREEN | OK | Phase 1.9 / BPM freeze |
| Signed audio upload transport (beats) | CLOSED | GREEN | OK | Audio Transport V1 |
| Downloads: anon/auth limits + DOWNLOAD_EVENT + My Downloads | CLOSED | GREEN | OK | Phase 1.8A |
| Community user upload + moderation + publish | CLOSED | GREEN @ `c5e1f17` epic | OK | Waves 1–5 community |
| Recording Wave 1 takes foundation | CLOSED | GREEN | OK | `takes` + `take-audio` |
| Recording Wave 2 session/upload/finalize/MediaRecorder | CLOSED | GREEN | OK | |
| Recording Wave 3 UI + take preview + Chromium WebM fallback | CLOSED | GREEN @ `9f6f006` | OK | |
| Recording Wave 4 entitlement/retention/janitor/abuse/download/Moje próbki/delete | CLOSED | GREEN @ `99c4815` | OK | Hobby daily cron |
| Anonymous Quick Take | **Delivery:** NOT SHIPPED / DEFERRED | — | Decision D02 CLOSED = IN V1 (unchanged) | **No Implementation GO** |
| Shared grants / RECORD on grants | **Delivery:** NOT SHIPPED | — | Decision D03 CLOSED = IN Recording EPIC · Wave 5 designed | **No Implementation GO** · not auto-next · no `beat_access_grants` table |
| MIX (mic+beat mix) | NOT IMPLEMENTED | — | OD-14 OPEN | |
| EXPORT finished track | NOT IMPLEMENTED | — | Designed only | |
| Track publishing from recording | NOT IMPLEMENTED | — | Future | |
| Payments / Premium catalog / Premium overlay | OUT OF SCOPE / NOT IMPLEMENTED | — | OD-04/07/08 OPEN | Permission keys exist; no product |
| Messaging / voting / comments product | NOT IMPLEMENTED | — | SSOT future; OD-10/11 OPEN | Permission rows may exist |
| Dual-play mix preview | NOT IMPLEMENTED | — | W3 OUT | |

---

## 8. Closed Epics

| Epic | Status | Anchor |
|------|--------|--------|
| Phase 1 foundation (1.3–1.9) | CLOSED / LOCKED | Multiple SHAs; tip evolved |
| Audio Transport V1 | CLOSED | Verified historically |
| BPM Production V1 | CLOSED | |
| Community Upload + Moderation | **CLOSED / LOCKED** | `c5e1f17` |
| Recording Design Freeze | **LOCKED** | [PHASE_RECORDING_DESIGN_FREEZE.md](./phases/PHASE_RECORDING_DESIGN_FREEZE.md) |
| Recording Waves 1–4 | **CLOSED** | Prod app `99c4815` |

---

## 9. Recording Final State

```text
RECORDING WAVE 1 = CLOSED
RECORDING WAVE 2 = CLOSED
RECORDING WAVE 3 = CLOSED
RECORDING WAVE 4 = CLOSED
```

| Item | Value |
|------|--------|
| Production app | `99c4815` |
| W4 verification | GREEN |
| Cron | `0 0 * * *` |
| `CRON_SECRET` | configured (secret) |
| Retention | BEGINNER 24h · PRO 10d · LEGEND 30d |
| Max seconds | BEGINNER 30 · PRO/LEGEND `MIN(beat,180)` |
| Anti-abuse | as §6 table · concurrent = 1 |
| Take statuses | PENDING_UPLOAD · READY · FAILED · EXPIRED · DELETED |
| Surfaces | Beat recording UI · `/account/takes` · preview/download/delete APIs |
| Chromium WebM/Opus | music-metadata → audio-decode fallback preserved (`9f6f006`) |
| Anonymous QT | **Delivery** NOT SHIPPED / DEFERRED (D02 decision remains CLOSED / IN V1 — **no Implementation GO**) |
| Shared grants | **Delivery** NOT SHIPPED (D03 decision remains CLOSED / IN EPIC · Wave 5 designed — **no Implementation GO** · not auto-next) |
| MIX / EXPORT / track publish / payments / Premium | NOT IMPLEMENTED / OUT |

**Expiry AuthZ is immediate** (preview/download DENY when `expires_at` past). Janitor cleans Storage/lifecycle on daily schedule (Hobby).

Closeout: [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md)

---

## 10. Community Upload Final State

**Status:** EPIC COMPLETE / LOCKED @ `c5e1f17`

Lifecycle (server AuthZ + RLS):

```text
DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED
REJECTED → DRAFT (return)
```

Also: rejection_reason · submit cooldown · ownership · moderation UI · READY master audio gate · private Storage · IDOR protections.

Freeze: [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)

---

## 11. Decision vs Delivery (D02 / D03)

**Do not reinterpret Owner decisions.** Decision status ≠ delivery status.

| ID | Decision status (unchanged) | Delivery status (shipped product) | Implementation GO |
|----|----------------------------|-----------------------------------|-------------------|
| **D02 / OD-REC-02** Anonymous QT | **CLOSED** = **IN V1** | **NOT SHIPPED** / **DEFERRED** | **NONE** |
| **D03 / OD-REC-03** Shared grants + RECORD | **CLOSED** = **IN Recording EPIC** (Wave 5 designed) | **NOT SHIPPED** | **NONE** · Wave 5 is **not** automatic NEXT |

Further freeze/SSOT/OPEN_DECISIONS wording cleanup awaits separate Owner clarification — not silently rewritten here.

---

## 12. Known Deferred Features

| Item | Classification |
|------|----------------|
| Recording Wave 5 shared grants | DEFERRED delivery · designed in freeze · **no auto GO** |
| Anonymous QT | DEFERRED delivery (decision D02 remains IN V1) · **no Implementation GO** |
| MIX / EXPORT / OD-14 | DEFERRED · OPEN decision |
| Watermark / final codec (OD-12/13) | OPEN |
| Payments / Premium | DEFERRED · OPEN OD-04/07/08 |
| Comments / voting / messaging | DEFERRED · product future |
| Visual brand / copy final (OD-15/16) | OPEN |

---

## 13. Open Product Areas

Do **not** start these without explicit Owner GO (product epic selection is Owner-only):

- Shared grants + Access Gate RECORD capability (Wave 5 designed — **not** automatic next)  
- Anonymous Quick Take  
- MIX / EXPORT / finished-track publish  
- Payments / Premium  
- Social: comments, voting, messaging  
- Orphan beat-audio janitor (documented gap historically)

---

## 14. Documentation SSOT

| Doc | Role |
|-----|------|
| [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) | **Cold-start continuity (this file)** |
| [PROJECT_STATE.md](./PROJECT_STATE.md) | WHERE ARE WE NOW |
| [ssot/MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md) | WHAT / product truth |
| [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md) | HOW |
| [architecture/RECORDING.md](./architecture/RECORDING.md) | Recording index |
| [decisions/DECISION_LOG.md](./decisions/DECISION_LOG.md) | WHY closed |
| [decisions/OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md) | Still OPEN |
| [CHANGELOG.md](./CHANGELOG.md) | What changed |
| [DOCUMENTATION_CONTINUITY.md](./DOCUMENTATION_CONTINUITY.md) | Continuity rule |
| `docs/phases/*` | Scope freezes |
| `docs/audits/*` | Audits / closeouts |

**For agents establishing implementation / shipped state:** code + remote schema are evidence first; then PROJECT_STATE → this handoff → SSOT / architecture / feature docs / CHANGELOG.  
Documentation describes product/design/continuity intent; it is **not** standalone proof of shipped implementation.

---

## 15. Development Workflow

```text
AUDIT FIRST
→ CURRENT STATE / OPTIONS
→ DESIGN FREEZE (if needed)
→ OWNER GO
→ IMPLEMENT
→ TEST
→ DOCUMENTATION
→ AUDIT
→ OWNER REVIEW
→ COMMIT
→ PUSH
→ DEPLOY
→ PRODUCTION VERIFY
→ CLOSE
```

No commit/push/deploy without explicit Owner GO for that step.

---

## 16. Rules for Cursor Agent

- No product decisions; no scope expansion; no reopening closed decisions.  
- No implementation without Owner GO.  
- Audit → report → wait.  
- Secrets: never commit, never print, never expose.  
- Do not stage `.agents/` / `.cursor/` / `skills-lock.json` as product.  
- After implementation: full workflow through production verify + docs.  
- Prefer Polish Owner prompts; keep technical identifiers in English.  
- Decision CLOSED ≠ feature SHIPPED (see §11).

---

## 17. Rules for New GPT

- Act as Architecture / Product / RCA Lead.  
- Read this handoff + PROJECT_STATE + SSOT before proposing epics.  
- Do not guess repo state — require Cursor audit.  
- Give Cursor ready Polish prompts with hard scope boundaries.  
- Gate Owner GO at freeze / implement / commit / push / deploy.  
- Treat documentation as continuity layer; fix drift in docs, not by rewriting closed product truth silently.  
- Do **not** auto-pick Wave 5 or any product EPIC.

---

## 18. Next Session Entry Point

```text
NEXT = OWNER DIRECTION / COLD START AUDIT
```

**Do not** auto-select the next product feature (including Wave 5).  
Wave 5 has **no** Implementation GO from this continuity work.

New GPT:

```text
AUDIT → CURRENT STATE → OPEN SURFACE → OPTIONS → DESIGN FREEZE → OWNER GO
```

New Cursor:

```text
AUDIT FIRST → REPORT → WAIT FOR OWNER GO
```

Start reading order:

1. This file (`MASTER_HANDOFF.md`) — cold-start continuity  
2. [PROJECT_STATE.md](./PROJECT_STATE.md)  
3. [MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md)  
4. [SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md)  
5. [OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md)  
6. Relevant audits / phase freeze **after** Owner picks an epic  

---

## 19. Known Risks / Technical Debt

### ACTIVE

| Item | Notes |
|------|--------|
| Git tip ≠ production app SHA | Docs tip (continuity) vs app `99c4815` — intentional; do not auto-align |
| Hobby daily janitor | Storage cleanup lag ≤ ~24h; AuthZ expiry is still immediate |
| Stuck PENDING without janitor (historical) | Mitigated by W4 app + daily cron; unique PENDING index remains |
| Stale freeze / SSOT / OPEN_DECISIONS wording on D02/D03 delivery | Decision unchanged; delivery clarified here; deeper doc sync awaits Owner |

### DEFERRED / TECHNICAL DEBT

| Item | Notes |
|------|--------|
| Delete Storage-before-DB order | Documented MEDIUM residual from W4 audit — not hotfix without GO |
| Janitor leftover `object_key` re-scan | Ops efficiency debt |
| `computeInterimRecordingMaxSeconds` deprecated helper | Cleanup debt |
| Local vs remote migration version name drift | W4 migrations applied under MCP timestamps |
| Beat-audio orphan janitor | Historical known gap |
| OD-12 interim MIME allow-list | Codec SSOT still OPEN |
| Root/docs historical SHAs in older audits | Historical snapshots — do not “fix” by rewriting history |

### OUT OF SCOPE / NOT SHIPPED (current delivery)

Anonymous QT (**delivery** deferred; D02 decision unchanged) · shared grants (**delivery** not shipped; D03 unchanged) · MIX/EXPORT · payments/Premium · comments/voting/messaging product UIs.

---

## 20. Current Verification State

| Area | State |
|------|--------|
| Production deploy Wave 4 | SUCCESS · READY |
| Public smoke | PASS |
| Recording W4 live E2E | PASS |
| Entitlement | PASS |
| Retention | PARTIAL (logic + AuthZ; natural full expiry not forced) |
| Janitor auth | PASS (401 unauth) |
| Janitor scheduled execution | PENDING_SCHEDULE (daily) |
| Anti-abuse / download / delete / IDOR | PASS |
| Claim RPC security | PASS |
| Chromium WebM regression | PASS |
| Community epic | CLOSED (prior production verify) |

---

## 21. Handoff Closeout

```text
MASTER HANDOFF READY
NEXT = OWNER DIRECTION / COLD START AUDIT
```

**Do not start the next product EPIC from this document.**  
Wave 5 = **no GO**. Wait for Owner direction.

---

*End of Master Handoff.*
