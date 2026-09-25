# Beats Domain — Phase 1.4

**Status:** COMPLETE / LOCKED
**Canonical commit:** `main` @ `6cb1e9a`
**Supabase project:** `rzzxrgcdogkybkiidqgw`
**SSOT:** §6–§8, §29–§30, §36
**Related:** [AUTHORIZATION.md](./AUTHORIZATION.md) · [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)

Phase 1.4 = **beats metadata foundation only**. Audio Storage, player, downloads, Quick Take, community upload = **OUT OF SCOPE**.

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

## 8. Future audio boundary (NOT Phase 1.4)

Deferred to Phase 1.5+:

- Private Storage buckets
- Audio asset columns / refs
- Playback / download signed URLs
- Codec / bitrate / processing (**OD-12 remains OPEN**)
- Player, waveform, Quick Take, community upload

---

## 9. Verification

| Layer | Status |
|-------|--------|
| Unit (validation + transitions + permission matrix) | **PASS** |
| Live PostgreSQL / RLS on `rzzxrgcdogkybkiidqgw` | **PASS** |
| Lint / typecheck / build | **PASS** |
| Commit / push | **PASS** — `6cb1e9a` on `main` / `origin/main` |
| Phase lock | **LOCKED** |
