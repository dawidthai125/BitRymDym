# Beats Domain

**Domain status (current):**

| Layer | Status |
|-------|--------|
| Beats metadata (Phase 1.4) | **COMPLETE / LOCKED** @ `6cb1e9a` |
| Private audio storage (`beat-audio`) | **COMPLETE / LOCKED** @ `0ec0be0` |
| `beat_audio_assets` | **COMPLETE / LOCKED** @ `0ec0be0` |
| Access Gate | **COMPLETE / LOCKED** @ `0ec0be0` |
| Signed URLs (PLAYBACK 120s / DOWNLOAD 300s) | **COMPLETE / LOCKED** @ `0ec0be0` |
| Player / playback UI | **COMPLETE / CLOSED / LOCKED** @ `39be430` — Phase 1.6 Playback Shell |

**Supabase project:** `rzzxrgcdogkybkiidqgw`
**SSOT:** §6–§9, §12–§13, §29–§30, §36
**Related:** [AUTHORIZATION.md](./AUTHORIZATION.md) · [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) · [PHASE_1_5_DESIGN_FREEZE.md](../phases/PHASE_1_5_DESIGN_FREEZE.md)

---

## Phase 1.4 — metadata foundation (historical)

**Status:** COMPLETE / LOCKED @ `6cb1e9a`

Phase 1.4 delivered **beats metadata foundation only**. At that stage: Audio Storage, player, downloads, Quick Take, community upload = **OUT OF SCOPE** (Storage + Access Gate later delivered in Phase 1.5).

---

## 1. Domain

Table: `public.beats`

| Field | Notes |
|-------|--------|
| `id` | uuid PK |
| `owner_id` | nullable FK → `profiles.id` |
| `ownership_type` | `PLATFORM` \| `USER` |
| `title` | trimmed, 1–200 chars |
| `producer` / `description` / `genre` / `style` / `key` / `scale` | optional text |
| `bpm` | integer 1–300 (numeric only — never `"142 BPM"`) |
| `duration_seconds` | integer 1–180 (all statuses) |
| `tags` | `text[]`, capped (≤30 items, ≤40 chars each in app validator) |
| `cover_ref` | optional text reference (not an upload) |
| `status` | `beat_status` enum |
| `created_at` / `updated_at` | `updated_at` via existing `set_updated_at` |

**No audio columns. No Storage buckets.**

---

## 2. Ownership

| Type | Rule |
|------|------|
| `PLATFORM` | `owner_id` **MUST** be `NULL` |
| `USER` | `owner_id` **MUST** be a `profiles.id` |

DB constraint: `beats_ownership_integrity_chk`.
Trigger: `prevent_beat_privilege_escalation` blocks non-admin ownership changes.

No system user / fake platform profile.

Phase 1.4 active create path: **ADMIN → PLATFORM beats only**. USER community create remains schema-ready, inactive.

---

## 3. Statuses

Enum `beat_status` (exact SSOT / `BEAT_STATUSES`):

```text
DRAFT
PENDING_REVIEW
APPROVED
PUBLISHED
REJECTED
ARCHIVED
```

### Phase 1.4 active ADMIN workflow

```text
DRAFT → PUBLISHED
PUBLISHED → ARCHIVED
ARCHIVED → DRAFT
```

- ADMIN may publish a platform DRAFT without `PENDING_REVIEW`.
- `PUBLISHED → DRAFT` is **forbidden** (validator + DB trigger).

### Schema-ready (not active product workflow)

`PENDING_REVIEW` / `APPROVED` / `REJECTED` remain for future user-upload moderation.
MODERATOR may transition `PENDING_REVIEW → APPROVED|REJECTED` only (no full metadata edit).

---

## 4. Validation

**Server-side = authoritative** (`src/lib/beats/validation.ts`).

| Rule | Bound |
|------|-------|
| title | trim; 1–200 |
| bpm | integer 1–300 |
| duration_seconds | integer 1–180 |
| tags | max count / length |
| ownership | PLATFORM⇒null owner; USER⇒required owner |
| status transitions | central `canTransitionStatus` |

No controlled vocabulary for genre / style / key / scale in Phase 1.4.

---

## 5. Authorization

Reuses existing permissions (no `beats.publish` / `beats.view`):

| Permission | ADMIN | MODERATOR | USER |
|------------|-------|-----------|------|
| `beats.create` | ALLOW | DENY | DENY |
| `beats.edit` | ALLOW | DENY | DENY |
| `beats.delete` | ALLOW | DENY | DENY |
| `beats.approve` | ALLOW | ALLOW | DENY |
| `beats.reject` | ALLOW | ALLOW | DENY |

- **AccountLevel does not grant beat permissions.** Role ≠ AccountLevel.
- Server helpers: `requireUser` / `requirePermission` → `src/lib/beats/service.ts` → Server Actions.
- Prefer archive over hard delete; hard delete remains ADMIN-only.

Staff SQL helpers added: `is_moderator()`, `is_staff()` (alongside Phase 1.3 `is_admin()` / `current_user_role()`).

---

## 6. RLS

RLS **enabled** on `public.beats`.

| Actor | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| anon | `PUBLISHED` only | DENY | DENY | DENY |
| authenticated | `PUBLISHED` + own rows + staff visibility | ADMIN only | ADMIN full; MODERATOR review path only | ADMIN only |

Policies: `beats_select_published`, `beats_select_own`, `beats_select_staff`, `beats_insert_admin`, `beats_update_admin`, `beats_update_moderator_review`, `beats_delete_admin`.

---

## 7. Application surface

| Layer | Path |
|-------|------|
| Domain types | `src/types/domain.ts` — `Beat`, `BeatStatus`, `BeatOwnershipType`, `BEAT_STATUSES` |
| Validation | `src/lib/beats/validation.ts` |
| Row mapping | `src/lib/beats/types.ts` |
| Service | `src/lib/beats/service.ts` (`server-only`) |
| Server Actions | `src/lib/beats/actions.ts` |
| Migration | `supabase/migrations/20260925130000_phase_1_4_beats.sql` |

API-first: no admin UI / player / upload surface in Phase 1.4.

---

## 8. Phase 1.5 audio boundary (COMPLETE / LOCKED)

Phase 1.5 delivered private Storage + Access Gate. Canonical freeze: [PHASE_1_5_DESIGN_FREEZE.md](../phases/PHASE_1_5_DESIGN_FREEZE.md).

### Phase 1.5 audio assets (COMPLETE / LOCKED @ `0ec0be0`)

- Table: `public.beat_audio_assets` (no audio columns on `beats`)
- Private bucket: `beat-audio`
- Object keys: `platform/{beatId}/{assetId}/{purpose}.bin` only
- Access Gate: anonymous / authenticated / admin upload paths
- Signed URL TTL: PLAYBACK 120s · DOWNLOAD 300s
- ADMIN PLATFORM upload only; USER community audio DENY
- Migration: `20260925220000_phase_1_5_audio_storage.sql` (live: `phase_1_5_audio_storage`)

**Still deferred to 1.7+:**

- Download limit counters (OD-05/06/17)
- Codec finalization (**OD-12 remains OPEN**)
- Quick Take, community upload, watermark

### Phase 1.6 public surface (COMPLETE / CLOSED / LOCKED @ `39be430`)

- Routes: `/beats`, `/beat/[id]`
- PUBLISHED-only catalog + detail
- `PlaybackShell` — custom UI; `HTMLAudioElement` engine; no `<audio controls>` product UI
- Playback via existing `requestBeatAudioAccess` (`PLAYBACK` only)
- Hard OUT: DOWNLOAD CTA / limits / counters / audit; Quick Take; waveform engine
- Downloads remain **PARTIAL**; Quick Take **NOT STARTED**
- Freeze: [PHASE_1_6_DESIGN_FREEZE.md](../phases/PHASE_1_6_DESIGN_FREEZE.md)
- Production: **GREEN / VERIFIED**

## 9. Verification

| Layer | Status |
|-------|--------|
| Phase 1.4 metadata | **LOCKED** @ `6cb1e9a` |
| Phase 1.5 Design Freeze | **LOCKED** @ `0e5c491` |
| Phase 1.5 Storage / Access Gate | **LOCKED** @ `0ec0be0` — live **PASS** |
| Phase 1.6 surface + Playback Shell | **CLOSED / LOCKED** @ `39be430` — production **GREEN** |
