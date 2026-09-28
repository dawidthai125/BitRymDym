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
| **Application SHA** | `37892a6adca1ac3b4bf68a06af248ca38bbcc177` (`37892a6`) |
| Status | **GREEN** / **PRODUCTION VERIFIED** |
| Recording Wave 4 | **CLOSED / PRODUCTION VERIFIED** |
| Recording Wave 5 | **CLOSED / PRODUCTION VERIFIED** · Shared Grants → RECORD |
| Cron | `0 0 * * *` (Vercel Hobby daily 00:00 UTC) → `/api/cron/takes-janitor` |
| `CRON_SECRET` | Configured in Vercel Production (**never print / never commit**) |
| Supabase project | `rzzxrgcdogkybkiidqgw` |

**Do not confuse SHAs — do not auto-align them:**

| SHA | Meaning |
|-----|---------|
| `37892a6` | **Production application** (Wave 5 Shared Grants → RECORD) — Owner Production GO verified |
| Docs tip (after closeout) | May advance on `origin/main` via docs-only commits — **do not** redeploy docs-only without Owner Production GO |
| `99c4815` | Prior production baseline (Wave 4) — historical |
| `b4199ef` | Prior tip — P1 security migration |

Production app is **not** required to equal `origin/main` when tip is docs-only. Do **not** redeploy solely to equalize SHAs.

---

## 2. Current Git Baseline

| Field | Value |
|-------|--------|
| Branch | `main` |
| Remote | `origin` → `https://github.com/dawidthai125/bitrymdym` |
| **Wave 5 product commit** | `37892a6` (`feat: add wave 5 shared recording grants`) = production app |
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
| P1 DEFINER grants | Selective REVOKE — see §5.1 |
| P1 `set_updated_at` | `search_path=public` + `pg_catalog.now()` — see §5.1 |

### 5.1 P1 Security hardening (2026-09-28)

| Item | Status |
|------|--------|
| **P1-B** selective DEFINER EXECUTE REVOKE | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-C** `set_updated_at` search_path hardening | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-A** HIBP / leaked-password protection | **BLOCKED** — Owner Dashboard action required (**not** implemented) |
| Security overall | **GREEN WITH WARNINGS** · CRITICAL=0 · HIGH=0 · MEDIUM residual = HIBP disabled |
| Remote DB | Contains P1-B + P1-C hardening (applied before git commit) |
| Migration drift | **P2 OPS** — local filename `20260928120000_*` vs remote version `20260928070727_*` (not a P1 blocker) |
| Wave 5 security outcome | Shared Grant AuthZ = PASS · HTTP IDOR = PASS · RLS = PASS · Take ACL = UNCHANGED · private audio = UNCHANGED |
| Wave 5 | **CLOSED / PRODUCTION VERIFIED** @ `37892a6` · Shared Grants → RECORD |

**P1-B grant posture (do not “fix” by revoking authenticated on RLS helpers):**

- `is_admin` / `is_moderator` / `is_staff` → EXECUTE for **authenticated** (+ postgres/service_role); **not** PUBLIC/anon
- trigger-only DEFINER + `current_user_role` + `set_updated_at` → **no** client EXECUTE
- claim / download RPCs → still **service_role/postgres only** (unchanged)
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
| Shared grants / RECORD on grants | **Delivery:** SHIPPED / PRODUCTION VERIFIED @ `37892a6` | GREEN | Decision D03 CLOSED = IN Recording EPIC | Wave 5 CLOSED · RECORD only · no PLAYBACK/DOWNLOAD via grant |
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
| Recording Waves 1–4 | **CLOSED** | Prior prod `99c4815` |
| Recording Wave 5 (Shared Grants → RECORD) | **CLOSED / PRODUCTION VERIFIED** | `37892a6` |

---

## 9. Recording Final State

```text
RECORDING WAVE 1 = CLOSED
RECORDING WAVE 2 = CLOSED
RECORDING WAVE 3 = CLOSED
RECORDING WAVE 4 = CLOSED
RECORDING WAVE 5 = CLOSED / PRODUCTION VERIFIED
```

| Item | Value |
|------|--------|
| Production app | `37892a6` |
| W4 verification | GREEN (prior) |
| W5 verification | GREEN · Shared Grants → RECORD |
| Cron | `0 0 * * *` |
| `CRON_SECRET` | configured (secret) |
| Retention | BEGINNER 24h · PRO 10d · LEGEND 30d |
| Max seconds | BEGINNER 30 · PRO/LEGEND `MIN(beat,180)` |
| Anti-abuse | as §6 table · concurrent = 1 |
| Take statuses | PENDING_UPLOAD · READY · FAILED · EXPIRED · DELETED |
| Surfaces | Beat recording UI · `/account/takes` · preview/download/delete APIs · Moje bity grants · `/account/shared` |
| Chromium WebM/Opus | music-metadata → audio-decode fallback preserved (`9f6f006`) |
| Anonymous QT | **Delivery** NOT SHIPPED / DEFERRED (D02 decision remains CLOSED / IN V1 — **no Implementation GO**) |
| Shared grants | **Delivery** SHIPPED / PRODUCTION VERIFIED @ `37892a6` (D03 decision remains CLOSED / IN EPIC · RECORD only) |
| MIX / EXPORT / track publish / payments / Premium | NOT IMPLEMENTED / OUT |

**Expiry AuthZ is immediate** (preview/download DENY when `expires_at` past). Janitor cleans Storage/lifecycle on daily schedule (Hobby).

Closeout W5: [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)
Closeout W4: [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md)

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
| **D03 / OD-REC-03** Shared grants + RECORD | **CLOSED** = **IN Recording EPIC** | **SHIPPED / PRODUCTION VERIFIED** @ `37892a6` (RECORD only) | Wave 5 COMPLETE |

Further freeze/SSOT/OPEN_DECISIONS deep wording sync remains optional Owner clarification — not silently rewritten beyond delivery status.

---

## 12. Known Deferred Features

| Item | Classification |
|------|----------------|
| Anonymous QT | DEFERRED delivery (decision D02 remains IN V1) · **no Implementation GO** |
| Grant PLAYBACK / DOWNLOAD | OUT of Wave 5 · separate Owner GO if ever needed |
| MIX / EXPORT / OD-14 | DEFERRED · OPEN decision |
| Watermark / final codec (OD-12/13) | OPEN |
| Payments / Premium | DEFERRED · OPEN OD-04/07/08 |
| Comments / voting / messaging | DEFERRED · product future |
| Visual brand / copy final (OD-15/16) | OPEN |

---

## 13. Open Product Areas

Do **not** start these without explicit Owner GO (product epic selection is Owner-only):

- Anonymous Quick Take
- Grant PLAYBACK / DOWNLOAD (beyond Wave 5 RECORD)
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
- Do **not** auto-pick the next product EPIC.

---

## 18. Next Session Entry Point

```text
NEXT = OWNER DIRECTION / READY FOR NEXT AUDIT
```

**Do not** auto-select the next product feature.
Recording Wave 5 = **CLOSED / PRODUCTION VERIFIED**.
P1-A HIBP remains **BLOCKED** until Owner enables it in the Dashboard.

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
| Docs tip ≠ production app SHA (after docs closeout) | Docs-only commits may advance `origin/main` while app stays on `37892a6` — intentional; do not auto-align / redeploy only to match |
| HIBP / leaked-password protection | **P1-A BLOCKED** — Owner Dashboard; Advisor WARN until enabled |
| Hobby daily janitor | Storage cleanup lag ≤ ~24h; AuthZ expiry is still immediate |
| Stuck PENDING without janitor (historical) | Mitigated by W4 app + daily cron; unique PENDING index remains |
| React hydration warning on `/beat/[id]` | **INFO** · **BLOCKER = NO** · observed in `next dev`; do not hotfix without Owner GO |

### DEFERRED / TECHNICAL DEBT

| Item | Notes |
|------|--------|
| **P2 OPS / MIGRATION DRIFT** | Local vs remote migration version names (incl. P1 `20260928120000` vs remote `20260928070727`; Wave 5 local `20260928140000` vs remote apply timestamp drift) — ops reconciliation later |
| Delete Storage-before-DB order | Documented MEDIUM residual from W4 audit — not hotfix without GO |
| Janitor leftover `object_key` re-scan | Ops efficiency debt |
| `computeInterimRecordingMaxSeconds` deprecated helper | Cleanup debt |
| Beat-audio orphan janitor | Historical known gap |
| OD-12 interim MIME allow-list | Codec SSOT still OPEN |
| Root/docs historical SHAs in older audits | Historical snapshots — do not “fix” by rewriting history |

### OUT OF SCOPE / NOT SHIPPED (current delivery)

Anonymous QT (**delivery** deferred; D02 decision unchanged) · grant PLAYBACK/DOWNLOAD · MIX/EXPORT · payments/Premium · comments/voting/messaging product UIs.

---

## 20. Current Verification State

| Area | State |
|------|--------|
| Production deploy Wave 5 | SUCCESS · READY @ `37892a6` |
| Production deploy Wave 4 | SUCCESS · READY (prior baseline `99c4815`) |
| Public smoke | PASS |
| Recording W5 Shared Grants owner/grantee | PASS |
| Recording W5 HTTP IDOR / AuthZ | PASS |
| Recording W5 PUBLISHED regression | PASS |
| Recording W4 live E2E | PASS (prior) |
| Entitlement | PASS |
| Retention | PARTIAL (logic + AuthZ; natural full expiry not forced) |
| Janitor auth | PASS (401 unauth) |
| Janitor scheduled execution | PENDING_SCHEDULE (daily) |
| Anti-abuse / download / delete / IDOR | PASS |
| Claim RPC security | PASS |
| Chromium WebM regression | PASS |
| Community epic | CLOSED (prior production verify) |
| P1-B DEFINER grants | CLOSED / VERIFIED @ `b4199ef` |
| P1-C `set_updated_at` | CLOSED / VERIFIED @ `b4199ef` |
| P1-A HIBP | **BLOCKED** (Owner Dashboard) |

---

## 21. Handoff Closeout

```text
MASTER HANDOFF READY
WAVE 5 = CLOSED / PRODUCTION VERIFIED @ 37892a6
SCOPE = Shared Grants → RECORD
P1-B / P1-C = CLOSED
P1-A HIBP = BLOCKED (Owner Dashboard)
NEXT = OWNER DIRECTION / READY FOR NEXT AUDIT
```

**Do not start the next product EPIC from this document.**
Wait for Owner direction.

---

*End of Master Handoff.*
