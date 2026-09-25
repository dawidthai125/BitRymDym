# Phase 1.5 Design Freeze

**Title:** Private Audio Storage + Controlled Access Gate
**Baseline:** `origin/main` @ `ec32b97` (docs lock over Phase 1.4 `6cb1e9a`)
**Supabase project:** `rzzxrgcdogkybkiidqgw`
**SSOT:** §9, §12–§13, §38–§39
**Depends on:** Phase 1.3 AuthZ LOCKED · Phase 1.4 Beats Domain LOCKED
**Document status:** DESIGN FREEZE — **READY FOR FINAL OWNER APPROVAL**
**Implementation:** NOT STARTED (this document is design-only)

Legend used throughout:

| Label | Meaning |
|-------|---------|
| **FROZEN** | Approved design decision for Phase 1.5 implementation (pending Owner accept of this freeze) |
| **OPEN** | Existing OD still OPEN — not closed by this freeze |
| **DEFERRED** | Intentionally out of Phase 1.5; later phase / later OD |

---

## Status

| Item | State |
|------|--------|
| Phase 1.4 | COMPLETE / LOCKED |
| Phase 1.5 Design Freeze | **READY FOR FINAL OWNER APPROVAL** |
| Phase 1.5 Implementation | **NOT STARTED** |
| Storage buckets (live) | none yet |
| OD-12 (encoding) | remains **OPEN** (interim upload policy only — see § OD-12) |

---

## Objective

Build a **private audio foundation** on top of the locked Beats metadata domain so that:

```text
REQUEST
  → AUTHENTICATION
  → SERVER AUTHORIZATION
  → BUSINESS RULE
  → AUDIO ASSET
  → PRIVATE STORAGE
  → SHORT-LIVED SIGNED ACCESS
```

**FROZEN goals:**

1. No permanent public audio URL for master (or derived) beat audio.
2. Audio bytes live in private Supabase Storage; metadata and keys live in Postgres.
3. Access is issued only by a **server-only** access service after AuthZ + business rules.
4. Logical separation of MASTER / PLAYBACK / DOWNLOAD versions without forcing three physical files in 1.5.
5. Domain isolation from future community-upload audio and Quick Take temporary audio.

**Not a goal of 1.5:** custom player UI, download limit counters, watermark, community upload, Quick Take.

---

## Scope IN

**FROZEN — Phase 1.5 implements:**

- Private Storage bucket for **permanent PLATFORM beat audio** only
- `beat_audio_assets` (or equivalent) relational model: Beat → Asset → Storage object
- ADMIN upload / replace / archive for **PLATFORM** beats only
- Object-key convention + content validation (size/MIME interim)
- Server-only Access Gate for **PLAYBACK** and **DOWNLOAD** signed URLs
- Storage policies + Postgres RLS aligned with existing AuthZ patterns
- Additive migration(s); live RLS/Storage verification; unit + AuthZ tests
- Documentation updates (`BEATS`, `SYSTEM_ARCHITECTURE`, `PROJECT_STATE`, etc.) after implementation PASS

---

## Scope OUT

**FROZEN — explicitly NOT in Phase 1.5:**

| Out | Reason |
|-----|--------|
| Custom player UI / waveform / `<audio controls>` product UI | Phase 1.6 |
| Download daily limits / repeat counting | Phase 1.7; OD-05/06/17 **OPEN** |
| Watermark | OD-13 **OPEN** / DEFERRED |
| Quick Take / recording / mix-export | Phase 1.8+; OD-14 **OPEN** |
| USER community beat upload / sharing / messaging | Phase 2–3 |
| Payments / Premium / feature-flag productization | Phase 4; OD-04/07/08 **OPEN** |
| Public permanent audio URLs | Forbidden by SSOT §9 |
| Closing OD-12 as final product codec | Remains **OPEN** |
| New parallel permission framework | Forbidden — reuse Phase 1.3 catalog |
| Changing Role / AccountLevel model | Locked; Role ≠ AccountLevel |

---

## Architecture

**FROZEN:** Access Gate has **three distinct paths**. Do not collapse them into a single `requireUser`-first flow.

### A. Anonymous access (PLAYBACK / DOWNLOAD when policy ALLOW)

```text
ANONYMOUS REQUEST (no session required)
        ↓
PUBLIC BUSINESS RULE
        ↓
PUBLISHED BEAT CHECK  (non-PUBLISHED → DENY)
        ↓
PLAYBACK / DOWNLOAD POLICY (per purpose table)
        ↓
AUDIO ASSET (active READY + resolution / MASTER fallback)
        ↓
SHORT-LIVED SIGNED URL (server-generated)
```

**FROZEN for this path:**

- Do **not** call `requireUser`
- Do **not** require `requirePermission`
- Anon access is allowed **only** when the frozen business rule allows it
- `PUBLISHED` is required for public access
- non-`PUBLISHED` → **DENY**

### B. Authenticated access (session present)

```text
AUTHENTICATED REQUEST
        ↓
requireUser
        ↓
AUTHORIZATION / PERMISSION (when action requires it)
        ↓
BUSINESS RULE (beat status, staff visibility, purpose policy)
        ↓
AUDIO ASSET (active READY + resolution / MASTER fallback)
        ↓
SHORT-LIVED SIGNED URL (server-generated)
```

**FROZEN:** `requireUser` / `requirePermission` apply on this path (and Admin upload), **not** on Anonymous Access Gate issuance when policy ALLOW.

### C. Admin upload (PLATFORM audio)

```text
ADMIN
        ↓
AUTH
        ↓
requirePermission / existing AuthZ (`beats.edit`, etc.)
        ↓
BUSINESS VALIDATION (PLATFORM beat, size/MIME interim)
        ↓
PRIVATE STORAGE (`beat-audio`) + asset row
```

**FROZEN principles:**

- Frontend never holds `SUPABASE_SERVICE_ROLE_KEY`.
- Clients never invent Storage paths as a security boundary (path secrecy ≠ AuthZ).
- Postgres owns **which** object is active; Storage owns **bytes**.
- Reuse `requireUser` / `requirePermission` / `is_admin` / `is_staff` — **no new permission system**.
- **Role ≠ AccountLevel** — AccountLevel does **not** grant audio access in Phase 1.5.

**DEFERRED:** Edge Functions — only if Owner later proves Server Actions insufficient for signed URL issuance.

---

## Audio Asset Model

**FROZEN relation:**

```text
Beat (public.beats — Phase 1.4 LOCKED)
  └── BeatAudioAsset (1..N rows)
        └── Storage Object (bucket + object_key)
```

### Conceptual fields (logical)

| Field | Notes |
|-------|--------|
| `id` | uuid PK — asset ID |
| `beat_id` | FK → `beats.id` |
| `purpose` | enum: `MASTER` \| `PLAYBACK` \| `DOWNLOAD` |
| `status` | enum: lifecycle (see Asset Lifecycle) |
| `storage_bucket` | text — must match allowed bucket name |
| `object_key` | text — full key inside bucket |
| `content_type` | interim MIME (OD-12 OPEN) |
| `byte_size` | bigint |
| `checksum` | optional text (e.g. sha256 hex) — recommended |
| `original_filename` | optional text (non-authoritative) |
| `is_active` | boolean — at most one active row per (`beat_id`, `purpose`) |
| `replaced_by_asset_id` | nullable FK self — for replace chain |
| `created_by` | uuid FK → `profiles.id` (ADMIN actor) |
| `created_at` / `updated_at` | timestamptz |

**FROZEN:** Do **not** add audio URL columns or Storage paths onto `public.beats`. Keep Phase 1.4 metadata table clean.

**FROZEN ownership/context for Phase 1.5:**

- Upload/replace allowed only when `beats.ownership_type = 'PLATFORM'` and actor is ADMIN with `beats.edit` (create path may also require `beats.create` for first attach — see Admin flow).
- USER-owned beats: schema may accept FK, but **ACTIVE product upload path DENY** in 1.5 (community DEFERRED).

---

## Storage Model

**FROZEN:**

| Decision | Value |
|----------|--------|
| Bucket for Phase 1.5 permanent beat audio | `beat-audio` |
| Public access | **false** (private bucket) |
| Master in public bucket | **FORBIDDEN** |
| Separate live buckets in 1.5 for community / Quick Take | **NO** — do not create them yet |

**FROZEN domain partition (namespaces for the future):**

| Domain | Phase 1.5 | Future |
|--------|-----------|--------|
| A. Permanent PLATFORM beat audio | bucket `beat-audio` | stays |
| B. Community-upload audio | **not created** | dedicated bucket e.g. `community-audio` (DEFERRED) |
| C. Quick Take temporary audio | **not created** | dedicated bucket e.g. `quick-take` + TTL cleanup (DEFERRED) |

**FROZEN:** Mixing A/B/C object keys inside `beat-audio` is forbidden by convention; future domains get their own buckets.

---

## Object Key Convention

**FROZEN — object key extension = `.bin` only.**

Object keys are **opaque** and must **not** communicate audio codec/type.
There is **no** alternate allow-listed extension scheme (no `.mp3` / `.wav` / `.flac` / `.m4a` in keys).

**FROZEN pattern:**

```text
platform/{beat_id}/{asset_id}/{purpose}.bin
```

Logical equivalent (illustrative):

```text
beat-audio / platform / <beat-id> / <asset-id> / <purpose>.bin
```

Examples:

```text
platform/a1b2…/c3d4…/master.bin
platform/a1b2…/e5f6…/playback.bin
platform/a1b2…/g7h8…/download.bin
```

**FROZEN rules:**

- Extension is **always** `.bin` — single rule, no “implementation picks”.
- `beat_id` and `asset_id` are UUIDs from Postgres (no user-controlled path segments).
- **`content_type` / MIME is authoritative metadata**; validated server-side against the interim OD-12 MIME allow-list.
- Security must **not** depend on path secrecy; Storage policies + Access Gate remain the boundary.
- Clients never construct keys for privileged write; server-mediated upload after AuthZ.

**DEFERRED:** CDN path rewriting, multi-region replication.

---

## Asset Lifecycle

**FROZEN statuses (`beat_audio_asset_status`):**

```text
PENDING_UPLOAD   — row reserved; object may be missing
READY            — object present; eligible for signed access
FAILED           — upload/validation failed; not eligible
ARCHIVED         — retired; not eligible for new signed access
REPLACED         — superseded by newer asset; retain for audit/cleanup policy
```

**FROZEN transitions (ADMIN / system):**

```text
(create) → PENDING_UPLOAD
PENDING_UPLOAD → READY | FAILED
READY → ARCHIVED | REPLACED
FAILED → PENDING_UPLOAD (retry) | ARCHIVED
```

**FROZEN lifecycle operations:**

| Op | Behavior |
|----|----------|
| Create | ADMIN creates asset row `PENDING_UPLOAD` for PLATFORM beat + purpose |
| Upload | Server-authorized write of bytes to `object_key`; validate size/MIME; mark `READY` |
| Validation | Reject oversize / disallowed MIME; duration metadata must remain consistent with beat `duration_seconds` business rule (beat metadata already ≤180) |
| Replace | New asset row; old active → `REPLACED`; new becomes `is_active` for that purpose |
| Archive | `READY` → `ARCHIVED`; revoke eligibility for signed URLs |
| Delete | Prefer soft archive; hard delete ADMIN-only + object removal (optional cleanup job DEFERRED) |

**FROZEN invariant:** At most **one** `is_active = true` per (`beat_id`, `purpose`).

**DEFERRED:** automatic orphan GC, virus scan, transcoding pipeline.

---

## Authorization Flow

**FROZEN — reuse existing permissions (no new keys required for 1.5):**

| Action | Permission / rule |
|--------|-------------------|
| Attach/replace/archive PLATFORM audio | `beats.edit` (+ ADMIN role via existing mapping) |
| Issue PLAYBACK signed URL | Business rule (below) — **no** new `beats.view` |
| Issue DOWNLOAD signed URL | Business rule (below) — **no** new permission; **no** OD-05/06 counters yet |

**FROZEN PLAYBACK access (purpose = PLAYBACK or fallback — see Signed URL Policy):**

| Actor | Beat status | Asset | Result |
|-------|-------------|-------|--------|
| anon | `PUBLISHED` | active READY | ALLOW |
| authenticated USER | `PUBLISHED` | active READY | ALLOW |
| MODERATOR / ADMIN (staff) | any non-deleted | active READY | ALLOW |
| anyone | non-`PUBLISHED` | — | DENY (unless staff) |
| anyone | — | missing / not READY | DENY |

**FROZEN DOWNLOAD access (purpose = DOWNLOAD or fallback):**

| Actor | Beat status | Asset | Result |
|-------|-------------|-------|--------|
| anon | `PUBLISHED` | active READY | ALLOW *(limits NOT enforced in 1.5 — DEFERRED to 1.7 / OD-05)* |
| authenticated USER | `PUBLISHED` | active READY | ALLOW *(limits DEFERRED)* |
| ADMIN | any | active READY | ALLOW |
| MODERATOR | non-public | active READY | DENY download unless Owner later expands *(FROZEN default: staff playback yes, download no for moderation)* |
| USER | non-`PUBLISHED` / foreign private | — | DENY |

**FROZEN:** AccountLevel never grants playback/download in 1.5.
**FROZEN:** Role ≠ AccountLevel remains absolute.

**DEFERRED:** Premium download rights, per-beat purchase, download audit persistence beyond optional minimal log.

---

## Signed URL Policy

**FROZEN:**

| Concern | Decision |
|---------|----------|
| Generator | **Server-only** access service (Next.js Server Action / Route Handler using elevated server client as required) |
| Client generation | **FORBIDDEN** |
| Permanent public URL | **FORBIDDEN** |
| Shared service | **One** `requestBeatAudioAccess({ beatId, purpose: 'PLAYBACK' \| 'DOWNLOAD' })` |
| Anonymous callers | Supported when policy ALLOW — **no** `requireUser` / **no** `requirePermission` on that branch |
| Authenticated callers | `requireUser` (+ staff/permission checks when required by business rule) |
| PLAYBACK vs DOWNLOAD | Same service; different purpose → different asset resolution + TTL + AuthZ branch |
| Response | `{ url, expiresAt, purpose, beatId, assetId }` — never raw service credentials |

**FROZEN TTL (configurable constants; not OD):**

| Purpose | TTL |
|---------|-----|
| PLAYBACK | **120 seconds** |
| DOWNLOAD | **300 seconds** |

**FROZEN asset resolution order for a purpose:**

1. Active asset with matching `purpose` and `status = READY`
2. Else if purpose is PLAYBACK or DOWNLOAD: fall back to active `MASTER` READY *(minimal physical model)*
3. Else DENY

**FROZEN expired / invalid behavior:**

- Expired URL → Storage denies; client must re-request through Access Gate
- Wrong beat/asset pairing → DENY before signing
- Non-READY / ARCHIVED / REPLACED → DENY
- Guessed object key without signed URL → Storage policy DENY

**DEFERRED:** refresh tokens, cookie-bound streaming, watermarked download variants (OD-13).

---

## Storage RLS

**FROZEN intent (Supabase Storage policies):**

| Operation | anon | authenticated USER | ADMIN (via server) |
|-----------|------|--------------------|--------------------|
| SELECT object (direct) | DENY | DENY | via signed URL / service path only |
| INSERT/UPDATE/DELETE object | DENY | DENY | server-only after `beats.edit` |
| Public bucket listing | DENY | DENY | DENY |

**FROZEN:** End users do **not** get broad Storage SELECT on `beat-audio`. Playback/download happen only through **signed URLs** issued after Access Gate.

**FROZEN:** Privileged upload uses server path (service role or carefully scoped signed upload URL with short TTL + AuthZ). Prefer **server-mediated upload** in 1.5 to avoid client policy complexity.

**Postgres RLS on `beat_audio_assets`:**

| Op | Rule |
|----|------|
| SELECT | Mirror beats visibility: PUBLISHED metadata join OK for catalog; non-public rows staff-only; never expose `object_key` to anon clients in API responses if avoidable — return access via Access Gate only |
| INSERT/UPDATE/DELETE | ADMIN only (`is_admin()` / permission-backed server) |

**FROZEN API hygiene:** Public/list APIs may expose `has_audio: boolean` / duration — **not** raw `object_key` to browsers.

---

## Database Schema

**FROZEN additive proposal (names may vary slightly at implementation if Owner accepts):**

### Enums

```text
beat_audio_purpose: MASTER | PLAYBACK | DOWNLOAD
beat_audio_asset_status: PENDING_UPLOAD | READY | FAILED | ARCHIVED | REPLACED
```

### Table `public.beat_audio_assets`

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid PK | default `gen_random_uuid()` |
| beat_id | uuid NOT NULL | FK → `beats(id)` ON DELETE RESTRICT |
| purpose | beat_audio_purpose NOT NULL | |
| status | beat_audio_asset_status NOT NULL | default `PENDING_UPLOAD` |
| storage_bucket | text NOT NULL | check = `'beat-audio'` in 1.5 |
| object_key | text NOT NULL | unique per bucket |
| content_type | text | |
| byte_size | bigint | check > 0 when READY |
| checksum_sha256 | text | |
| original_filename | text | |
| is_active | boolean NOT NULL | default false |
| replaced_by_asset_id | uuid | FK self, nullable |
| created_by | uuid | FK → `profiles(id)` |
| created_at | timestamptz NOT NULL | default now() |
| updated_at | timestamptz NOT NULL | default now() |

### Constraints / indexes

- UNIQUE `(storage_bucket, object_key)`
- UNIQUE partial index: one active per beat+purpose
  `UNIQUE (beat_id, purpose) WHERE is_active`
- INDEX `(beat_id)`, `(status)`, `(beat_id, purpose, is_active)`
- CHECK: `READY` implies `byte_size IS NOT NULL` and `content_type IS NOT NULL`
- Trigger: reuse `set_updated_at`
- Trigger: privilege / PLATFORM-only write guards consistent with Phase 1.4 patterns

### Optional DEFERRED table

`beat_audio_access_events` (audit) — **DEFERRED** to 1.7 unless Owner wants minimal insert-only log in 1.5 (default: **DEFERRED**).

### Migration rules

**FROZEN:** additive only · no `db reset` · no destructive changes to `profiles` / `beats` / permissions · no audio columns on `beats`.

---

## Validation

**FROZEN server-side validation (authoritative):**

| Rule | Bound |
|------|--------|
| Max upload size | **50 MiB** interim hard cap (configurable constant; not OD) |
| Allowed MIME (interim) | `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/flac`, `audio/mp4`, `audio/aac` |
| Beat must exist | PLATFORM ownership for active upload path |
| Duration | Beat metadata already 1–180; do not invent separate SSOT duration from file probe unless trivial — **DEFERRED** deep media probing |
| Purpose | enum only |
| Replace | only ADMIN; deactivate previous active |

**Client validation:** UX only.

---

## Admin PLATFORM Beat Flow

**FROZEN happy path:**

```text
ADMIN (beats.edit)
  → select PLATFORM beat
  → create asset PENDING_UPLOAD (purpose MASTER and/or PLAYBACK/DOWNLOAD)
  → server upload bytes to beat-audio / platform/{beatId}/{assetId}/…
  → validate → READY + is_active
  → (optional) publish beat via existing Phase 1.4 status transitions
  → consumers request PLAYBACK/DOWNLOAD via Access Gate
```

**FROZEN deny paths:**

- USER create/upload audio → DENY
- Attach audio to USER ownership beat via product path → DENY in 1.5
- Publish without READY master → **business soft rule:** WARN/allow metadata publish without audio remains possible (catalog may show beat with `has_audio=false`) — **FROZEN:** publishing does **not** require audio in 1.5 (enables staged ops); Access Gate still DENY if no READY asset

---

## OD-12 Interim Policy

**OD-12 status:** remains **OPEN** (final encoding / bitrate / processing **not** closed).

**FROZEN interim for Phase 1.5 only:**

| Topic | Interim decision |
|-------|------------------|
| Final codec SSOT | **NOT frozen** — OD-12 stays OPEN |
| Accepted upload MIME | allow-list above |
| Bitrate / sample rate enforcement | **none** in 1.5 |
| Transcoding pipeline | **DEFERRED** |
| Physical files required | Minimum: **one READY MASTER** (or single READY object used as MASTER) |
| PLAYBACK / DOWNLOAD physical files | Optional; Access Gate may fall back to MASTER |

**Why interim is safe:**

- Object keys and asset rows are **format-agnostic**.
- Later OD-12 closeout can add derived PLAYBACK/DOWNLOAD rows + transcoder without rewriting beat metadata.
- Replacing MASTER creates a new asset id (immutability of historical objects).

**FROZEN:** Implementation must not hardcode “final product = MP3 320kbps” into SSOT or DECISION_LOG as OD-12 CLOSED.

---

## Test Matrix

### Actors × beat visibility × asset

| Case | Anon | USER | MODERATOR | ADMIN |
|------|------|------|-----------|-------|
| PUBLISHED + READY — PLAYBACK | ALLOW | ALLOW | ALLOW | ALLOW |
| PUBLISHED + READY — DOWNLOAD | ALLOW* | ALLOW* | DENY† | ALLOW |
| DRAFT + READY — PLAYBACK | DENY | DENY | ALLOW | ALLOW |
| DRAFT + READY — DOWNLOAD | DENY | DENY | DENY† | ALLOW |
| PUBLISHED + no asset | DENY | DENY | DENY | DENY |
| READY asset wrong beat id | DENY | DENY | DENY | DENY |
| ARCHIVED/REPLACED asset | DENY | DENY | DENY | DENY |
| USER upload attempt | DENY | DENY | DENY | — |
| Direct Storage read without signed URL | DENY | DENY | DENY | DENY‡ |
| Expired signed URL | DENY | DENY | DENY | DENY |

\* Limits not enforced in 1.5 (DEFERRED).
† FROZEN default: moderator download DENY.
‡ ADMIN uses server path / fresh signed URL, not anonymous public read.

### Test layers

| Layer | Coverage |
|-------|----------|
| Unit | asset validation, purpose resolution, TTL constants, fallback MASTER |
| AuthZ | permission matrix; AccountLevel ignored |
| DB/RLS | asset SELECT/INSERT policies live |
| Storage live | private bucket; unsigned GET DENY; signed GET ALLOW until expiry |
| Signed URL expiry | re-fetch after TTL fails |
| Regression | Phase 1.3 Auth + Phase 1.4 beats metadata untouched |

---

## Migration Plan

**Design-only sequence (do not execute in this freeze):**

1. Additive SQL: enums + `beat_audio_assets` + indexes + triggers + RLS
2. Create private bucket `beat-audio`
3. Storage policies (deny public; no broad authenticated read)
4. Domain types + validation + asset service
5. Access Gate (signed PLAYBACK/DOWNLOAD)
6. ADMIN upload/replace path (server-mediated)
7. Unit + AuthZ tests
8. Live Supabase Storage/RLS verification + cleanup
9. Documentation continuity (`BEATS`, architecture, PROJECT_STATE, CHANGELOG)

**FROZEN:** no reset · no destructive edits to Phase 1.3/1.4 tables.

---

## Security Model

**FROZEN checklist:**

| Control | Requirement |
|---------|-------------|
| Service role | server-only (`admin.ts` / env); never client bundle |
| Auto-admin / bootstrap endpoint | still forbidden (OD-20) |
| Public permanent audio URL | forbidden |
| Path guessing | insufficient for access; policies DENY |
| Client-only AuthZ | forbidden |
| Duplicate permission systems | forbidden |
| Orphan objects | replace leaves history; cleanup job DEFERRED but keys tied to asset rows |
| Race on replace | transactional deactivate old + activate new |

---

## Architecture Impact

| Document | Impact after Owner accepts + implementation |
|----------|-----------------------------------------------|
| `SYSTEM_ARCHITECTURE.md` | Mark audio storage + access gate as implemented for 1.5 |
| `AUTHORIZATION.md` | Document Access Gate rules (no new permission keys) |
| `BEATS.md` | Add “Audio assets / Storage boundary” section |
| `MASTER_SSOT` | No product truth change; §9 realized technically |
| `PROJECT_STATE.md` | Advance phase marker post-implementation |
| `OPEN_DECISIONS.md` | OD-12 remains OPEN; note interim MIME policy |
| `DECISION_LOG.md` | Log Phase 1.5 Design Freeze acceptance + interim OD-12 policy (without closing OD-12) |
| `PHASE_1_FOUNDATION.md` | 1.5 status updates post-implementation |

**This freeze file** is the SSOT-adjacent design authority for 1.5 until implementation lock.

---

## Risks

| Risk | Mitigation (FROZEN intent) |
|------|----------------------------|
| Public URL leakage | Private bucket + no public policies + signed TTL |
| Storage policy bypass | Deny direct SELECT; server-mediated write |
| Server/client boundary leak | `server-only` access + env hygiene |
| Duplicate AuthZ | Single Access Gate + existing helpers |
| Asset orphaning | Asset row is source of truth; cleanup later |
| Replacement race | DB transaction + partial unique active index |
| Codec migration chaos | Format-agnostic keys; new derived assets later |
| Community contamination | Separate future bucket; no USER upload in 1.5 |
| Quick Take contamination | Separate future temp bucket; not `beat-audio` |
| MASTER/PLAYBACK/DOWNLOAD confusion | Explicit `purpose` enum + fallback rules documented |

---

## Open Decisions

| ID | Needed for 1.5? | Disposition |
|----|-----------------|-------------|
| OD-04 Payments operator | No | remains OPEN |
| OD-05 Anon download limit | No (limits DEFERRED to 1.7) | remains OPEN |
| OD-06 User download limit | No | remains OPEN |
| OD-07 Premium prices | No | remains OPEN |
| OD-08 Premium levels | No | remains OPEN |
| OD-09 Account level labels | No | remains OPEN |
| OD-10 Voting names | No | remains OPEN |
| OD-11 Comment moderation | No | remains OPEN |
| **OD-12 Encoding** | **Partial** | remains **OPEN**; interim MIME allow-list **FROZEN** herein |
| OD-13 Watermark | No | remains OPEN / DEFERRED |
| OD-14 Mix/export | No | remains OPEN |
| OD-15 Visual identity | No (player is 1.6) | remains OPEN |
| OD-16 Brand copy | No | remains OPEN |
| OD-17 Repeat download counting | No | remains OPEN |
| OD-18 Share counting | No | remains OPEN |

**New OD required?** **No** — interim storage/access decisions are Phase Design Freeze items, not a new OD ID, provided Owner accepts this document.

---

## Acceptance Criteria

Phase 1.5 implementation is ACCEPTABLE only if:

1. Private `beat-audio` bucket exists; no public permanent audio URLs.
2. `beat_audio_assets` (or accepted equivalent) separates assets from `beats` metadata.
3. ADMIN can upload/replace PLATFORM beat MASTER (and optional variants).
4. USER cannot upload beat audio.
5. Access Gate issues short-lived PLAYBACK/DOWNLOAD URLs only after AuthZ + business rules.
6. Unsigned Storage GET DENY; expired signed URL DENY.
7. Non-published beats: public PLAYBACK DENY; staff visibility per freeze.
8. No player UI, no download limit counters, no Quick Take, no community upload.
9. OD-12 still OPEN in OPEN_DECISIONS; interim MIME documented.
10. Additive migration; Phase 1.3/1.4 regression PASS; live Storage/RLS PASS; lint/typecheck/test/build PASS.
11. Docs updated to COMPLETE/LOCKED for 1.5 after Owner-approved implementation.

---

## Implementation Sequence

**Design-only order (Owner GO required before any step):**

1. Owner accepts this Design Freeze
2. Optional: docs note in PROJECT_STATE “1.5 Design Freeze APPROVED” (docs-only)
3. DB asset model migration
4. Bucket + Storage policies
5. Domain/validation/services
6. Access Gate signed URL
7. ADMIN upload path
8. Tests (unit/AuthZ/live)
9. Security audit
10. Documentation lock + commit/push (separate Owner prompts)

---

## Executive Summary — Frozen Decisions (for Owner)

1. **Private bucket `beat-audio` only** for permanent PLATFORM beat audio; no public audio URLs.
2. **Separate `beat_audio_assets` table** — never put audio URLs on `beats`.
3. **Logical MASTER / PLAYBACK / DOWNLOAD** with physical minimum = one READY MASTER; fallback allowed.
4. **Single server-only Access Gate** — PLAYBACK 120s / DOWNLOAD 300s; **explicit Anonymous** (no `requireUser`) vs **Authenticated** (`requireUser`) vs **Admin upload** paths.
5. **Object keys always end in `.bin`**; MIME/`content_type` is authoritative (interim OD-12 allow-list).
6. **ADMIN PLATFORM upload only**; USER community audio DENY; Role ≠ AccountLevel.
7. **OD-12 stays OPEN**; interim MIME allow-list + 50 MiB cap only.
8. **Limits / player / Quick Take / watermark / payments** all DEFERRED.
9. **Future community & Quick Take** get separate buckets — not mixed into `beat-audio`.

---

## FINAL STATUS

**PHASE 1.5 DESIGN FREEZE = READY FOR FINAL OWNER APPROVAL**

Required review corrections applied (Access Gate anonymous branch; object key `.bin` only).
No implementation. No migration. No buckets created. No commit. No push.
