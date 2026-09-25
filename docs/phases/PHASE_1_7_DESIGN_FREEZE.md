# Phase 1.7 Design Freeze

**Title:** Admin PLATFORM Content Ops Surface
**Candidate:** Admin PLATFORM Content Ops Surface
**Baseline:** `origin/main` @ `d5b4e91518306ee82590e79ea7c5aa47c614ee20`
**Depends on:** Phase 1.6 Published Beats Surface + Playback Shell — COMPLETE / CLOSED / LOCKED @ `39be430`
**Supabase project:** `rzzxrgcdogkybkiidqgw`
**SSOT:** §3, §6–§9, §35–§37, §39–§40
**Document status:** DESIGN FREEZE — **APPROVED / LOCKED**
**Approved:** 2026-09-26 (Owner)

Legend:

| Label | Meaning |
|-------|---------|
| **FROZEN** | Approved design decision for Phase 1.7 implementation |
| **REUSE** | Existing locked capability — do not rebuild |
| **GAP** | Known architecture gap retained intentionally (not closed by this freeze) |
| **OPEN** | Existing OD still OPEN — not closed by this freeze |
| **DEFERRED** | Intentionally out of Phase 1.7 |

---

## Status

| Item | State |
|------|--------|
| Phase 1.6 | COMPLETE / CLOSED / LOCKED @ `39be430` |
| Documentation reconciliation | COMPLETE @ `d5b4e91` |
| Phase 1.7 Design Freeze | **APPROVED / LOCKED** (2026-09-26) |
| Phase 1.7 Implementation | **NOT STARTED** — READY FOR IMPLEMENTATION |
| Production | GREEN @ `39be430` (docs HEAD `d5b4e91`) |

---

## 1. Purpose

Unlock a real **PLATFORM content operations loop** for **ADMIN** so the system can create and publish the first real **PUBLISHED** beat with audio, then verify the already-locked public listening path.

```text
ADMIN
  → create PLATFORM beat (DRAFT)
  → metadata
  → upload MASTER audio (existing uploadPlatformBeatAudio)
  → asset READY
  → publish (existing lifecycle)
  → PUBLISHED
  → public /beats
  → /beat/[id]
  → PlaybackShell
  → existing Access Gate
  → PLAYBACK signed URL
```

This is an **operations surface**, not a full Admin CMS (SSOT §35: do not implement the whole panel at once).

---

## 2. Baseline

| Field | Value |
|-------|--------|
| Canonical HEAD (freeze authoring) | `d5b4e91518306ee82590e79ea7c5aa47c614ee20` |
| Phase 1.6 impl | `39be430` |
| Phase 1.5 audio / Access Gate | `0ec0be0` |
| Phase 1.4 beats metadata | `6cb1e9a` |
| AuthZ / permissions | Phase 1.3 LOCKED |
| Working tree expectation | docs-only freeze artifact; no `src/` / `supabase/` changes in this step |

**Historical note:** `PHASE_1_FOUNDATION.md` previously labeled stage **1.7** as “Download permissions + limity”. Owner-selected Phase 1.7 candidate is **Admin PLATFORM Content Ops**. Download limits remain **DEFERRED** (later stage; OD-05 / OD-06 / OD-17 still OPEN). Documentation renumbering is a closeout concern after APPROVED + implementation — not part of this freeze authoring.

---

## 3. Scope

### 3.1 Problem

Production catalog may be empty (`published_count = 0`). Backend already supports PLATFORM create / edit / upload / publish, but there is **no ADMIN UI** and no end-to-end ops loop wired for operators.

### 3.2 Goal

Minimal admin ops surface that reuses locked domain services so an operator-provisioned ADMIN can publish a PLATFORM beat with READY MASTER audio and verify public playback.

### 3.3 Non-goal

Full CMS, downloads productization, community upload, Quick Take, payments, branding finalization.

---

## 4. In Scope

**PROPOSED — Phase 1.7 implements:**

### A. ADMIN PLATFORM beat creation

- Minimal admin flow to create a **PLATFORM** beat.
- **REUSE** `createPlatformBeat` / `createPlatformBeatAction`.
- Ownership frozen: `ownership_type = PLATFORM`, `owner_id = NULL`.
- Create always starts as **DRAFT** (current action path). No create-as-PUBLISHED from UI.

### B. Metadata (existing Beat fields only)

Minimal form for existing model fields only:

- `title`, `producer`, `description`, `genre`, `style`
- `bpm`, `key`, `scale`, `duration_seconds`
- `tags`, `cover_ref`

**PROPOSED:** no new Beat columns for UI convenience.
**REUSE** `validateBeatInput` + `updateBeatMetadata`.
Expand `updateBeatMetadataAction` parameter surface to full editable metadata set (wrapper only — no parallel validator).

### C. Audio

- **REUSE** `uploadPlatformBeatAudio` / `uploadPlatformBeatAudioAction`
- **REUSE** `beat_audio_assets`, private bucket `beat-audio`, MASTER purpose
- **REUSE** existing Access Gate (`requestBeatAudioAccess`, purpose `PLAYBACK`)
- Replace prior active MASTER via existing READY / REPLACED flow
- Show asset status: `PENDING_UPLOAD` / `READY` / `FAILED` (and previous REPLACED as history if already returned)

### D. Lifecycle

Respect existing transitions (**REUSE** `canTransitionStatus` / `transitionBeatStatus` / `publishBeatAction`):

```text
ADMIN PLATFORM ops path (active):
DRAFT → PUBLISHED
PUBLISHED → ARCHIVED
ARCHIVED → DRAFT
```

- ADMIN may publish PLATFORM DRAFT **without** `PENDING_REVIEW` (Phase 1.4 locked behavior).
- Do **not** invent an alternate transition engine.
- Moderation path (`PENDING_REVIEW` → `APPROVED` / `REJECTED`) remains schema-ready; **not** the Phase 1.7 PLATFORM ops path.
- UI must not offer illegal transitions (e.g. `PUBLISHED → DRAFT`).

### E. Admin surface (minimal)

Routes (PROPOSED naming — App Router):

| Route | Purpose |
|-------|---------|
| `/admin/beats` | PLATFORM beats list + status + audio readiness |
| `/admin/beats/new` | Create DRAFT |
| `/admin/beats/[id]` | Edit DRAFT metadata, upload/replace audio, publish / archive |

Server-side gate on all `/admin/**`: authenticated + `requirePermission` / role ADMIN path. Client hide is UX only.

Capabilities:

- list PLATFORM beats (status + has READY MASTER)
- create
- edit DRAFT metadata
- upload / replace MASTER audio
- publish per lifecycle + publish safety (§11)
- clear success / error / loading states
- mobile-usable; desktop-first admin OK

### F. Public verification (no public redesign)

After publish, existing Phase 1.6 surfaces must work unchanged:

- `/beats` → PUBLISHED catalog
- `/beat/[id]` → metadata + PlaybackShell
- Access Gate → PLAYBACK signed URL

---

## 5. Out of Scope

**ABSOLUTE OUT — do not implement in Phase 1.7:**

| Out | Notes |
|-----|--------|
| USER community beat upload | Schema-ready only |
| Community moderation workflow as product | MODERATOR review UI OUT |
| Messaging | — |
| Downloads UI / limits / counters / anti-abuse | OD-05/06/17; signed DOWNLOAD remains backend-only |
| Watermarking | OD-13 |
| Quick Take / MediaRecorder / microphone | Phase later |
| Waveform engine | — |
| Tracks | — |
| Payments | OD-04/07/08 |
| Full Admin CMS / dashboard redesign | SSOT §35 partial |
| Final branding / copy freeze | OD-15 / OD-16 remain OPEN; interim Design System OK |
| New player architecture | Phase 1.6 LOCKED |
| New Access Gate / signed URL service | Phase 1.5 LOCKED |
| New Storage bucket / audio architecture | — |
| Automatic first-admin bootstrap | OD-20 CLOSED: operator-controlled only |
| New permission keys without Owner | Prefer REUSE |
| Public audio URLs / public bucket | Forbidden |
| Service-role in browser | Forbidden |

---

## 6. Architecture

**PROPOSED:** compose existing locked layers — no parallel domain.

```text
┌─────────────────────────────────────────────────────────┐
│  Admin UI (/admin/beats*)  — NEW thin App Router surface │
└───────────────────────────┬─────────────────────────────┘
                            │ Server Actions / server components
┌───────────────────────────▼─────────────────────────────┐
│  REUSE Phase 1.4 services                                 │
│  createPlatformBeat · updateBeatMetadata                  │
│  transitionBeatStatus · archiveBeat · deleteBeat (opt)    │
└───────────────────────────┬─────────────────────────────┘
┌───────────────────────────▼─────────────────────────────┐
│  REUSE Phase 1.5 audio                                    │
│  uploadPlatformBeatAudio · archivePlatformBeatAudio       │
│  getBeatAudioPublicInfo · requestBeatAudioAccess          │
└───────────────────────────┬─────────────────────────────┘
┌───────────────────────────▼─────────────────────────────┐
│  REUSE AuthZ + RLS                                        │
│  requirePermission · is_admin() · beats / assets policies │
│  private beat-audio · service-role server-only            │
└───────────────────────────┬─────────────────────────────┘
┌───────────────────────────▼─────────────────────────────┐
│  REUSE Phase 1.6 public                                   │
│  /beats · /beat/[id] · PlaybackShell                      │
└─────────────────────────────────────────────────────────┘
```

**Thin additions allowed (implementation after APPROVED):**

1. Admin route tree + forms + list UI.
2. `listPlatformBeatsForAdmin` (or equivalent) — server helper selecting beats via existing staff RLS; join / follow-up `getBeatAudioPublicInfo` for readiness display.
3. Optional publish prerequisite check in server publish path (§11 GAP resolution).
4. Expand metadata action payload to full existing fields.

**Forbidden additions:** second upload service, second Access Gate, new beat entity type, client-side authorization as security boundary.

---

## 7. Authorization

**PROPOSED frozen model:**

```text
REQUEST
  → AUTH (Supabase session)
  → SERVER AUTHORIZATION (requireUser / requirePermission)
  → PERMISSION (beats.*)
  → BUSINESS RULE (ownership PLATFORM, validation, lifecycle)
  → RLS (is_admin / is_staff)
  → DB / STORAGE (service-role only inside already-authorized server audio paths)
```

| Rule | Stance |
|------|--------|
| ADMIN only for PLATFORM content ops | **PROPOSED FROZEN** |
| Role ≠ Account Level | **FROZEN** (existing) — never authorize via `account_level` |
| Client-side route hide | UX only — **not** security boundary |
| Service-role in browser | **FORBIDDEN** |
| Public admin bootstrap endpoint | **FORBIDDEN** (OD-20 CLOSED) |
| First ADMIN | Operator-controlled provisioning only (Supabase Dashboard / controlled SQL) |

MODERATOR:

- **DENY** PLATFORM write / create / metadata edit / audio upload / publish in Phase 1.7 UI and server ops paths.
- Existing RLS already limits MODERATOR write to review transitions; do not expand.

USER / anonymous:

- **DENY** all `/admin/**` and PLATFORM write operations.

---

## 8. Permissions

**PROPOSED: REUSE existing keys — no new permissions.**

| Operation | Permission |
|-----------|------------|
| Create PLATFORM beat | `beats.create` |
| Edit metadata / status transition publish-archive | `beats.edit` |
| Upload / replace / archive audio | `beats.edit` |
| Delete beat (optional destructive; not required for happy path) | `beats.delete` |
| MODERATOR approve/reject | `beats.approve` / `beats.reject` — **not used** by PLATFORM ops UI |

Evidence existing mapping is sufficient:

- `createPlatformBeat` → `beats.create`
- `updateBeatMetadata` / `transitionBeatStatus` (ADMIN) / `uploadPlatformBeatAudio` → `beats.edit`
- ADMIN role receives full example permission set in Phase 1.3 seed
- No `beats.publish` key exists; publish stays under `beats.edit` + lifecycle rules (Phase 1.4 LOCKED)

**If implementation discovers a true permission gap:** stop; mark Owner OPEN DECISION — **do not invent keys in Phase 1.7**.

**NEW OD from this freeze:** NONE.

---

## 9. Data Flow

### CREATE

```text
ADMIN
  → /admin/beats/new form
  → createPlatformBeatAction (Server Action)
  → requirePermission("beats.create")
  → validateBeatInput (PLATFORM, ownerId=null, status=DRAFT)
  → RLS beats_insert_admin (is_admin)
  → beats row DRAFT
  → redirect /admin/beats/[id]
```

### METADATA EDIT (DRAFT)

```text
ADMIN
  → updateBeatMetadataAction (full field patch)
  → requirePermission("beats.edit")
  → validateBeatInput
  → RLS beats_update_admin
  → updated DRAFT
```

### AUDIO

```text
ADMIN
  → uploadPlatformBeatAudioAction (base64/bytes + contentType)
  → requirePermission("beats.edit")
  → PLATFORM ownership check
  → validateAudioUploadMeta (interim MIME + size; OD-12 OPEN)
  → service-role insert PENDING_UPLOAD + Storage upload
  → deactivate previous active → REPLACED
  → READY + is_active
```

### PUBLISH

```text
ADMIN
  → publishBeatAction / transitionBeatStatus(..., "PUBLISHED")
  → requireUser + ADMIN actor + beats.edit
  → canTransitionStatus(DRAFT → PUBLISHED)
  → publish safety check (§11)
  → RLS update status
  → PUBLISHED
  → revalidate /beats
```

### PUBLIC

```text
Anyone
  → /beats (PUBLISHED-only)
  → /beat/[id]
  → PlaybackShell
  → requestBeatAudioAccess(PLAYBACK)
  → short-lived signed URL
  → HTMLAudioElement engine
```

---

## 10. Audio Flow

**REUSE Phase 1.5 locked rules:**

| Item | Rule |
|------|------|
| Bucket | `beat-audio` **private** |
| Asset table | `beat_audio_assets` |
| Purpose for ops | `MASTER` (minimum physical model) |
| Status path | `PENDING_UPLOAD` → `READY` \| `FAILED` |
| Replace | prior active → `REPLACED`, new `READY` |
| Access | Access Gate only; no permanent public URL |
| MIME / size | Interim allow-list + 50 MiB; **OD-12 remains OPEN** |
| Ownership | PLATFORM beats only |

Admin UI must surface:

- upload progress / busy
- READY confirmation
- FAILED with safe error
- replace MASTER explicitly

Staff preview playback of DRAFT via Access Gate (staff PLAYBACK allow) is **optional** for ops QA; not required for freeze acceptance if public path after publish is verified.

---

## 11. Lifecycle & Publish Safety

### Lifecycle (locked)

```text
DRAFT → PUBLISHED          (ADMIN PLATFORM path)
PUBLISHED → ARCHIVED
ARCHIVED → DRAFT
PUBLISHED → DRAFT          FORBIDDEN
```

`PENDING_REVIEW` / `APPROVED` / `REJECTED` remain unused by Phase 1.7 PLATFORM ops UI.

### Publish safety — current fact vs GAP

**Current backend (Phase 1.5 FROZEN historical):** publishing does **not** require READY MASTER. Catalog may show PUBLISHED with `has_audio=false`; Access Gate DENY playback if no READY asset.

**Phase 1.7 purpose** requires a real listening loop. Accidental publish without audio defeats the candidate goal.

| Layer | APPROVED / LOCKED stance (2026-09-26) |
|-------|----------------------------------------|
| Admin UI | **MUST** block Publish when `activeMasterReady !== true`; explicit error state |
| Server lifecycle | **UNCHANGED** in Phase 1.7 — keep existing soft-allow (no READY MASTER hard rule) |

**GAP-PUBLISH-READY (PRESERVED):**

- Phase 1.7 does **not** change the current server-side lifecycle / publish rule.
- Backend hard enforcement of READY MASTER before `→ PUBLISHED` remains an explicit **GAP / future hardening**.
- No new OD for this gap.
- No migration for this gap.
- UI-only publish block is **FROZEN** for Phase 1.7 ops surface.

Do not invent unrelated publish prerequisites (e.g. cover required) without SSOT backing.

---

## 12. UI Surface

**PROPOSED: MINIMAL ADMIN OPS SURFACE**

### List `/admin/beats`

- Columns: title, status, BPM / duration summary, audio readiness (READY / missing / FAILED), updated_at
- CTA: New beat
- Row → detail

### Create `/admin/beats/new`

- Metadata fields (§4.B)
- Submit → DRAFT
- Validation errors inline

### Detail `/admin/beats/[id]`

- Status badge
- Metadata edit (enabled for DRAFT; PUBLISHED metadata edit = **optional** via existing `beats.edit` — PROPOSED default: allow edit with clear warning that public page will change; no new fields)
- Audio upload / replace
- Publish (DRAFT + READY)
- Archive (PUBLISHED)
- Restore ARCHIVED → DRAFT (existing transition)
- Link to public `/beat/[id]` when PUBLISHED

### UX requirements

- Loading / disabled submit while in-flight (duplicate submit guard)
- Success + error banners (safe messages)
- Unauthorized → sign-in redirect or forbidden page
- Forbidden (USER/MODERATOR) → safe DENY page
- Mobile usable; desktop-first OK
- **OD-15 OPEN** — use existing interim Design System / site chrome; no final branding freeze

### Explicit non-UI

- No download CTA
- No Quick Take
- No waveform
- No users/roles/payments admin modules

---

## 13. Error States

| Case | User-visible behavior |
|------|------------------------|
| Unauthorized (anon) | Sign-in / unauthorized — no stack |
| Forbidden (USER / MODERATOR) | Forbidden — no secrets |
| Validation failure | Field-level / summary from validator messages |
| Invalid metadata | Same as validation |
| Audio upload failure | Safe error; asset may show FAILED |
| Asset FAILED | Block publish; allow retry upload |
| Publish without READY MASTER | Explicit prerequisite error |
| Illegal lifecycle transition | Forbidden / not allowed |
| Network / server failure | Generic safe failure |
| Stale form | Revalidate / reload guidance; no silent overwrite claim |
| Duplicate submit | Disable button / idempotent handling |

Never expose: stack traces, service-role keys, Storage internal paths beyond necessary ops ids, raw Postgres errors with sensitive detail.

---

## 14. Security

**PROPOSED requirements:**

- [ ] No service-role in client bundle
- [ ] No public `beat-audio` bucket / no permanent public audio URL
- [ ] Server authorization on every mutating action
- [ ] Existing RLS retained (`is_admin` writes; staff/public selects as locked)
- [ ] No role spoofing via client fields
- [ ] No AccountLevel privilege escalation
- [ ] No admin bootstrap endpoint
- [ ] Safe errors only
- [ ] Upload size + interim MIME validation (existing)
- [ ] PLATFORM ownership integrity preserved (`owner_id = NULL`)
- [ ] Admin UI not a second AuthZ system

---

## 15. Testing

### UNIT

- Metadata validation (existing + any action mapping)
- Authorization: ADMIN allow; USER/MODERATOR deny for PLATFORM ops helpers
- Lifecycle transitions (existing matrix)
- Publish prerequisites (once GAP resolution chosen)

### INTEGRATION

- ADMIN create DRAFT
- DRAFT metadata edit
- Audio upload → READY
- Publish → PUBLISHED
- Optional archive / restore

### RLS / AuthZ

- ADMIN allowed writes
- USER denied PLATFORM write
- MODERATOR denied PLATFORM write / upload / publish
- Anonymous denied admin + writes

### END-TO-END / LIVE

1. Operator ensures ADMIN profile exists (OD-20)
2. Create PLATFORM beat
3. Attach real valid audio fixture (safe local/CI fixture; interim MIME)
4. Publish
5. Verify `/beats` visibility
6. Verify `/beat/[id]` + PlaybackShell / Access Gate PLAYBACK
7. **Cleanup fixture** — no production test leftovers

---

## 16. Database impact

**DEFAULT: NO NEW MIGRATION.**

Reuse:

- `beats`
- `beat_audio_assets`
- `permissions` / `role_permissions`
- `profiles`
- private Storage `beat-audio`

| Change | Required? |
|--------|-----------|
| New tables | **NO** |
| New columns | **NO** |
| New enums | **NO** |
| New RLS policies | **NO** (existing admin/staff policies suffice) |
| New permission rows | **NO** |

**DATABASE CHANGE REQUIRED:** none expected for this freeze.

If implementation unexpectedly needs schema: **STOP**, document why, Owner decision — do not silently migrate in Phase 1.7.

### AUDIT GAP (PRESERVED)

- No reusable `audit_log` table / full audit system exists today (SSOT §37 remains aspirational).
- Phase 1.7 does **not** implement audit infrastructure.
- No audit migration in Phase 1.7.
- Important ADMIN actions may be observable via existing rows (`created_by`, status history absence) only — full audit remains **GAP / DEFERRED**.

---

## 17. Documentation impact

After APPROVED freeze + successful implementation (not this authoring step), update:

- `docs/PROJECT_STATE.md`
- `docs/CHANGELOG.md`
- `docs/phases/PHASE_1_FOUNDATION.md` (stage 1.7 label / status; downloads deferred note)
- `docs/architecture/BEATS.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/architecture/AUTHORIZATION.md` (Phase 1.7 admin ops AuthZ note)
- `docs/decisions/DECISION_LOG.md` (closeout note; **do not close ODs**)
- `docs/README.md` / architecture README index pointers as needed
- This freeze → APPROVED / LOCKED + implementation SHA

Do **not** close OD-04 … OD-18.

---

## 18. Open Decisions

### Not required for Phase 1.7 baseline ops

OD-05, OD-06, OD-12, OD-13, OD-14, OD-15, OD-16, OD-17, OD-18 — remain **OPEN**; not blockers for PLATFORM content ops with interim MIME + interim Design System.

### Closed prerequisites

| ID | Status | Relevance |
|----|--------|-----------|
| OD-20 | CLOSED / ACCEPTED | First ADMIN = operator-controlled; **operational prerequisite** |
| OD-19 | CLOSED / ACCEPTED | Unrelated to admin ops AuthZ |

### Blockers

| Blocker | Type |
|---------|------|
| No provisioned ADMIN in target environment | **Operational** (OD-20) — not a code OD |

### GAP-PUBLISH-READY (locked stance)

- UI Publish block without READY MASTER: **FROZEN** (required in Phase 1.7)
- Server hard enforcement: **GAP / future hardening** — out of Phase 1.7 scope
- New OD: **NONE**

### NEW OD

**NONE.**

---

## 19. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-01 | ADMIN can create PLATFORM beat DRAFT |
| AC-02 | USER cannot create PLATFORM beat |
| AC-03 | MODERATOR cannot perform PLATFORM write operations (create / edit / upload / publish) |
| AC-04 | PLATFORM ownership remains `owner_id = NULL` |
| AC-05 | Metadata uses existing Beat model only |
| AC-06 | Audio uses existing private `beat-audio` bucket |
| AC-07 | Audio upload uses existing `uploadPlatformBeatAudio` |
| AC-08 | Asset lifecycle remains Phase 1.5-compatible |
| AC-09 | Publish uses existing lifecycle rules (`DRAFT → PUBLISHED`) |
| AC-10 | PUBLISHED beat appears on `/beats` |
| AC-11 | PUBLISHED beat opens `/beat/[id]` |
| AC-12 | Playback uses existing Access Gate `PLAYBACK` |
| AC-13 | No public audio URL |
| AC-14 | No service-role in client bundle |
| AC-15 | No download UI |
| AC-16 | No Quick Take |
| AC-17 | No community upload |
| AC-18 | RLS still rejects unauthorized writes |
| AC-19 | Error states are explicit and safe |
| AC-20 | Live fixture cleaned after tests |
| AC-21 | Documentation updated on closeout |

---

## 20. Non-goals

- Full Admin CMS (users, payments, feature flags, audit viewer product UI)
- Download productization
- Community / moderation product workflows
- Player redesign
- Storage / Access Gate redesign
- Encoding / watermark finalization
- Automatic admin bootstrap
- Closing any OPEN OD

---

## 21. Risks

| Risk | Mitigation |
|------|------------|
| Publish without audio (legacy soft-allow) | UI Publish block FROZEN; server hard rule remains GAP-PUBLISH-READY |
| Large base64 upload via Server Action | Keep existing size cap; consider streaming later (**DEFERRED**) |
| Empty production without ADMIN | OD-20 operator provisioning documented |
| Scope creep into CMS | Hard OUT list; freeze APPROVED / LOCKED |
| Accidental MODERATOR elevation | No UI; server permission + RLS |
| Test fixtures left in production | AC-20 mandatory cleanup |
| Confusing foundation stage labels (old “1.7 = downloads”) | Document in closeout; downloads deferred |

---

## 22. Rollback considerations

- Feature is additive UI + thin server helpers over locked services.
- Rollback = remove `/admin/beats*` routes / actions wiring; domain tables unchanged.
- Published beats created during ops remain data; archive rather than destructive delete unless Owner requests cleanup.
- No migration to revert if **NO NEW MIGRATION** holds.
- Phase 1.7 does not add server publish-READY hard rule; GAP-PUBLISH-READY stays for future hardening only.

---

## FINAL STATUS

```text
PHASE 1.7 DESIGN FREEZE = APPROVED / LOCKED
APPROVED = 2026-09-26
CANDIDATE = Admin PLATFORM Content Ops Surface
BASELINE = d5b4e91
IMPLEMENTATION = NOT STARTED — READY FOR IMPLEMENTATION
DATABASE = NO CHANGE EXPECTED
GAP-PUBLISH-READY = PRESERVED (UI block FROZEN; server hard rule DEFERRED)
AUDIT GAP = PRESERVED
NEW OD = NONE
```

**Owner APPROVED / LOCKED → Implementation GO (separate prompt).**
