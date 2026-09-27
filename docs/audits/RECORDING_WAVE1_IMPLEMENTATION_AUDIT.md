# RECORDING WAVE 1 IMPLEMENTATION AUDIT

**Type:** Implementation audit / plan only  
**Date:** 2026-09-27  
**Owner:** Prezes Dawid · Architect: ChatGPT · Engineer: Cursor Agent  

```text
IMPLEMENTATION = NONE
MIGRATION      = NONE (plan only)
COMMIT/PUSH/DEPLOY = NONE
```

**Canonical freeze:** [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md)  
**Prior audits:** cold-start · design freeze proposal · owner decision review  

---

## 1. Baseline

| Item | Value |
|------|--------|
| Branch | `main` |
| HEAD (code) | `c5e1f17` — Community EPIC CLOSED |
| Design Freeze | **LOCKED** (docs present; may be uncommitted locally) |
| D01–D08 | **CLOSED** |
| Production | GREEN (beats / Access Gate / downloads / community) |
| Supabase | `rzzxrgcdogkybkiidqgw` |
| Existing buckets | **only** `beat-audio` (`public=false`) |
| Take / grant tables | **NONE** |
| Edge Functions / cron janitor | **NONE** |

**Wave 1 IN:** Take domain · DB foundation · RLS · private take Storage foundation · types/config stubs · DB/RLS/Storage tests  

**Wave 1 OUT:** MediaRecorder · player Record · QT UI · anon recording UI · product upload transport routes · shared grant UI/table · Premium · MIX/EXPORT · Access Gate RECORD capability wiring (W3–W5)

---

## 2. Current DB architecture

### 2.1 Public tables (live)

| Table | Role |
|-------|------|
| `profiles` | `role`, `account_level` (BEGINNER/PRO/LEGEND) |
| `permissions` / `role_permissions` | Catalog (no `takes.*` / `recording.*` keys) |
| `beats` | PLATFORM/USER · status lifecycle · `owner_id` · `duration_seconds` |
| `beat_audio_assets` | Beat MASTER/PLAYBACK/DOWNLOAD assets in `beat-audio` |
| `beat_download_events` | OD-17 download audit |
| `beat_download_reservations` | Ephemeral slot hold + **`expires_at`** |

### 2.2 Reuse analysis (questions A–D)

| Question | Verdict |
|----------|---------|
| **A. Extend existing entity?** | **No.** `beat_audio_assets` is beat-master domain; bucket CHECK forces `beat-audio`; purposes MASTER/PLAYBACK/DOWNLOAD only. Extending it for MIC TAKE would violate Phase 1.5 domain isolation and Community audio conventions. |
| **B. New TAKE table?** | **Yes.** New `public.takes` (name architecture-final; freeze uses TAKE). |
| **C. Shared column patterns?** | Reuse: `id uuid`, `owner_id → profiles`, `created_at`/`updated_at` + `set_updated_at`, `expires_at` (from reservations), optional soft-delete via status/`deleted_at`, anon via `anonymous_token_hash` (from download events). |
| **D. Reuse status enum type?** | **Reuse naming pattern**, **not** the same Postgres enum. `beat_audio_asset_status` includes ARCHIVED/REPLACED (beat-specific). Propose dedicated `take_status`. |

### 2.3 No access-grant table

Shared grants (D03) = **Wave 5**. Wave 1 does **not** create `beat_access_grants`.

---

## 3. Existing audio / storage patterns

| Pattern | How it works today | Wave 1 take reuse |
|---------|-------------------|-------------------|
| Private bucket | `beat-audio`, `public=false`, size limit, MIME allow-list | Mirror for `take-audio` |
| Client Storage policies | **None** for anon/auth — default DENY; service_role bypass | Same |
| Object key | Server-built; opaque `.bin`; PLATFORM `platform/…` · USER `user/{ownerId}/{beatId}/{assetId}/…` | `user/…/takes/…` · `anon/…/takes/…` |
| Upload | Service inserts PENDING_UPLOAD row → `createSignedUploadUrl` → client PUT | Foundation only in W1 (bucket + key builder + test via admin); **product session API = W2** |
| Finalize / READY | Server validates bytes/MIME/duration → READY | W2 |
| Signed read | `createSignedUrl` after Access Gate | W2/W4 for takes |
| Bucket CHECK on assets | `storage_bucket = 'beat-audio'` | Take table CHECK `take-audio` |

---

## 4. Existing auth / RLS patterns

| Pattern | Source | Lesson for takes |
|---------|--------|------------------|
| Owner SELECT own | `beats_select_own` | Owner SELECT own non-deleted takes |
| Public SELECT published | beats / assets | **Takes never public** |
| Staff SELECT | `is_staff()` for moderation beats | Takes are private user content — **no default MOD/ADMIN full read** |
| Client INSERT restricted | beats insert own draft; assets via trigger/service | Prefer **client INSERT DENY**; service_role after AuthZ (mirror assets) |
| Privilege escalation triggers | role/account_level; beat ownership; audio assets | Trigger: forbid owner_id / object_key / bucket spoof on client path |
| Anon identity | hash in download tables | `anonymous_token_hash` on takes for W2+ anon |
| Account level unused in Access Gate | Intentional today | Entitlement config stub in W1; enforcement W3–W4 |

---

## 5. Proposed TAKE domain

### 5.1 Entity: `public.takes`

**Do not** overload `beat_audio_assets`.

### 5.2 Field matrix

| FIELD | TYPE | NULLABLE | WHY | SOURCE / REUSE | SECURITY IMPACT |
|-------|------|----------|-----|----------------|-----------------|
| `id` | `uuid` PK default `gen_random_uuid()` | NO | Stable take identity; path segment | Same as assets/beats | Client must never invent binding without server session |
| `owner_id` | `uuid` FK `profiles(id)` | YES | Logged-in owner; NULL = anon take | `beats.owner_id` pattern | Spoof = IDOR; set only from `auth.uid()` / service |
| `anonymous_token_hash` | `text` | YES | Anon ownership proof (W2+) | `beat_download_*` | Never store raw token; XOR with owner_id (one set) |
| `beat_id` | `uuid` FK `beats(id)` RESTRICT | NO | Take always against a beat | assets.beat_id | Beat spoof → wrong entitlement/access; bind at create |
| `status` | `take_status` enum | NO | Lifecycle | Naming from asset status | Transition forge risk → trigger/service |
| `recording_mode` | `take_recording_mode` enum (`QUICK`\|`FULL`) | NO | Snapshot of entitlement class at create | Freeze tiers | Audit / policy snapshot |
| `duration_ms` | `integer` | YES | Filled at READY; probe result | New (prefer ms precision) | Client duration not authority |
| `byte_size` | `bigint` | YES | At READY | assets.byte_size | Oversized abuse check |
| `content_type` | `text` | YES | Declared/validated MIME | assets.content_type | MIME spoof |
| `storage_bucket` | `text` | NO default `'take-audio'` | Domain isolation | assets.storage_bucket | CHECK = take-audio only |
| `object_key` | `text` | NO | Server path | assets.object_key | Path spoof; unique with bucket |
| `beat_duration_seconds_snapshot` | `integer` | NO | MIN() inputs at session | beats.duration_seconds | Drift protection |
| `recording_max_seconds_snapshot` | `integer` | NO | Effective max at session | entitlement resolver (W3+) | Client can't raise cap mid-flight |
| `beat_bpm_snapshot` | `integer` | YES | Future mix | beats.bpm | Low |
| `audio_offset_ms` | `integer` | NO default 0 | Sync metadata | Freeze §17 | Low |
| `expires_at` | `timestamptz` | NO | Retention / anon TTL | reservations.expires_at | Expired access DENY |
| `deleted_at` | `timestamptz` | YES | Soft delete (D06) | New (beats use ARCHIVED status) | Hide from owner lists |
| `failure_reason` | `text` | YES | Safe code only | rejection_reason spirit | No PII dumps |
| `created_at` / `updated_at` | `timestamptz` | NO | Audit | universal | — |

**Deferred to later waves (not required Wave 1 columns):** product `session_id` table, checksum, original_filename, beat_audio_asset_id FK (optional mix aid in W5+).

**CHECK (recommended):**  
`(owner_id IS NOT NULL AND anonymous_token_hash IS NULL) OR (owner_id IS NULL AND anonymous_token_hash IS NOT NULL)`  
`object_key LIKE '%.bin'`  
`storage_bucket = 'take-audio'`  
`expires_at > created_at`  
READY ⇒ `duration_ms IS NOT NULL AND byte_size > 0 AND content_type IS NOT NULL` (mirror assets)

---

## 6. Proposed lifecycle

**Enum `take_status` (minimal):**

```text
PENDING_UPLOAD  — row + key issued; object may be absent
READY           — object validated; owner can preview/download (later waves)
FAILED          — validation/upload failure
EXPIRED         — past expires_at (logical)
DELETED         — user soft-delete
```

**Do not use DB status `RECORDING`** — browser MediaRecorder is client-ephemeral (freeze).

| Event | Transition |
|-------|------------|
| Session create (W2) | INSERT `PENDING_UPLOAD` + `expires_at` (retention or pending TTL) |
| Finalize OK (W2) | → `READY`; set duration/mime/size; may refresh `expires_at` from tier |
| Finalize/upload fail | → `FAILED` |
| Abandoned pending | stays `PENDING_UPLOAD` until janitor (W2+) → `EXPIRED`/`DELETED` + storage remove |
| User delete (W4) | → `DELETED` + `deleted_at` |
| Retention elapsed | → `EXPIRED` |

**Wave 1:** create enum + table + allow service to INSERT/UPDATE statuses in tests; no product transition service required beyond trigger guards.

---

## 7. RLS plan

**Principle:** Takes are **private user content**. Staff do **not** automatically get full access (unlike beat moderation).

| Actor | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| **OWNER** (auth.uid() = owner_id) | Own rows where `deleted_at IS NULL` (and optionally hide EXPIRED) | **DENY** (service path) | Soft-delete / limited fields only **or DENY** all client writes | **DENY** hard delete (service) |
| **OTHER USER** | DENY | DENY | DENY | DENY |
| **ANONYMOUS** (JWT anon) | DENY direct | DENY | DENY | DENY |
| **ADMIN / MODERATOR** | **DENY by default** (no beat-style staff SELECT) | DENY | DENY | DENY |
| **service_role** | ALL (server AuthZ) | ALL | ALL | ALL |

**Rationale:** Moderation of takes is not in Recording V1. Support/debug via service tools later if Owner GO.

**Anon takes:** readable only via Server Action after token proof (service query by hash) — same family as download reservations.

**Policies (planned names):**  
`takes_select_own` · no insert/update/delete for authenticated · enable RLS  

**Trigger (planned):** `prevent_take_privilege_escalation` — non-service cannot change `owner_id`, `anonymous_token_hash`, `beat_id`, `object_key`, `storage_bucket`, spoof status to READY, or clear `expires_at` illegally.

---

## 8. Storage plan

| Item | Plan |
|------|------|
| Bucket id/name | **`take-audio`** (aligns with freeze; Phase 1.5 “quick-take” synonym rejected to match `beat-audio` kebab style) |
| `public` | `false` |
| `file_size_limit` | Architecture: derive from max duration × bitrate budget (e.g. ≤ 20–50 MiB interim — finalize in W1 migration constant, document) |
| `allowed_mime_types` | Interim: `audio/webm`, `audio/mp4`, `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/aac` (MediaRecorder reality; OD-12 still OPEN) |
| Storage policies for anon/auth | **None** (default DENY) |
| Mutations | service_role only (signed upload URL issuance) |

**Do not** put take objects in `beat-audio` (bucket CHECK + domain freeze).

---

## 9. Object key plan

**Final proposed pattern (server-only):**

```text
user/{ownerId}/takes/{takeId}/mic.bin
anon/{tokenHashPrefix}/takes/{takeId}/mic.bin
```

| Rule | Requirement |
|------|-------------|
| Segments | UUIDs / hash prefix validated like `buildUserBeatAudioObjectKey` |
| Extension | Always `.bin` |
| Client | Never supplies ownerId, takeId, bucket, or full key |
| Validation | Rebuild expected key from row; deny mismatch (mirror `user-audio-authz`) |

**Why not include `beatId` in path:** takeId already unique; beat_id is DB FK. Including beatId is optional; omitting reduces path length and spoof surface. **Recommendation:** omit beatId from key (DB binds beat).

---

## 10. Retention plan

| Tier | `expires_at` at create (policy) |
|------|----------------------------------|
| Anon | `now() + short_ttl` (propose **2 hours** interim — architecture-resolvable; document in config) |
| BEGINNER | `now() + 24h` |
| PRO | `now() + 10 days` |
| LEGEND | `now() + 30 days` |
| PENDING abandoned | Separate shorter pending TTL optional (`now()+1h`) until READY then tier retention |

**Wave 1:** column + CHECKs + config constants in `src/config/recording.ts` (numbers only).  

**Janitor:** **OUT of Wave 1** (no existing cron to reuse). Skeleton deferred W2; production TTL claims blocked until job exists (freeze risk).

---

## 11. Delete plan

| Choice | Verdict |
|--------|---------|
| Soft delete | **Preferred V1** — `status=DELETED` + `deleted_at`; matches “user may delete” + audit/janitor |
| Hard delete | Service/janitor removes storage object + optional row purge after grace |

Beats use `ARCHIVED` status rather than `deleted_at`; takes add `deleted_at` because freeze explicitly models soft expiry/delete and anon cleanup. **Not** inventing beat soft-delete.

Wave 1: columns + RLS hide deleted; delete API = W4.

---

## 12. Index plan (minimal)

| Index | Why |
|-------|-----|
| `takes_owner_id_idx` (`owner_id`) WHERE owner_id NOT NULL | Owner “Moje próbki” |
| `takes_anon_hash_idx` (`anonymous_token_hash`) WHERE NOT NULL | Anon lookup |
| `takes_beat_id_idx` (`beat_id`) | Per-beat listing / caps later |
| `takes_expires_at_idx` (`expires_at`) | Janitor scan |
| `takes_owner_status_idx` (`owner_id`, `status`) WHERE deleted_at IS NULL | Active-count anti-abuse (W4) |
| UNIQUE `(storage_bucket, object_key)` | Collision / spoof |

Avoid indexing every column. No index on `recording_mode` unless proven.

---

## 13. Constraint plan

| Constraint | DB vs business rule |
|------------|---------------------|
| FK beat_id, owner_id | **DB** |
| owner XOR anon hash | **DB CHECK** |
| bucket = take-audio; key ends `.bin` | **DB CHECK** |
| expires_at > created_at | **DB CHECK** |
| READY payload completeness | **DB CHECK** (like assets) |
| `duration_ms <= 180_000` | **Optional weak DB CHECK** — **prefer business rule**: true max is `MIN(beat, entitlement, 180)`; hardcoding 180 alone is incomplete; entitlement 30s for BEGINNER must be app-enforced |
| Status transitions | **Trigger/service** not free-form client UPDATE |

---

## 14. Migration plan (PLAN ONLY — do not apply yet)

**File (proposed):**  
`supabase/migrations/20260927180000_recording_wave1_take_foundation.sql`  
(Adjust timestamp at apply time to be after latest migration `20260927170000_…`.)

**Contents outline:**

1. **Enums:** `take_status`, `take_recording_mode`  
2. **Table:** `public.takes` + CHECKs + FKs  
3. **Indexes:** §12  
4. **Trigger:** `set_updated_at`; `prevent_take_privilege_escalation`  
5. **RLS:** ENABLE; `takes_select_own`; no client write policies  
6. **GRANTs:** SELECT to authenticated (RLS filters); no INSERT/UPDATE/DELETE to authenticated (or grant + deny via no policy)  
7. **Storage:** INSERT bucket `take-audio` private + MIME/size; drop any accidental public policies  
8. **Storage policies:** none for anon/auth  
9. **Rollback:** DROP policies → DROP table/enums → DELETE bucket objects caution → DELETE bucket (manual if objects exist)

**Not in this migration:** `beat_access_grants`, janitor cron, permission catalog keys (optional later), Access Gate code.

---

## 15. Test plan (future — do not write tests now)

### DB / RLS (vitest live or SQL)

- Owner SELECT own READY → PASS  
- Foreign SELECT → DENY / empty  
- Anon JWT SELECT → DENY  
- Client INSERT take → DENY  
- Service INSERT PENDING_UPLOAD → PASS  
- Owner cannot UPDATE owner_id / object_key (trigger) → DENY  
- Soft-delete visibility → hidden from select policy  
- XOR owner/anon CHECK → reject both/neither  
- Invalid bucket/key → reject  

### Storage

- Auth client INSERT object to `take-audio` → DENY  
- Service `createSignedUploadUrl` for server key → PASS  
- Signed upload PUT → PASS  
- Foreign path spoof key → reject at service validation (unit)  
- Direct read without signed URL → DENY  

### Regression

- Existing beat-audio signed upload/playback still PASS  
- Community / download suites unchanged  

---

## 16. Regression analysis

| Area | Risk | Mitigation |
|------|------|------------|
| `beat-audio` bucket / policies | MEDIUM if migration touches storage globally | Scope policies/bucket ops to `take-audio` id only |
| `beat_audio_assets` triggers | LOW | Do not modify Phase 1.5/Wave2 triggers |
| Access Gate PLAYBACK/DOWNLOAD | LOW | No Gate code in W1 |
| Downloads OD-05/06/17 | LOW | No take download endpoint in W1 |
| Community RLS / publish | LOW | No beats policy changes |
| `account_level` enum | LOW | Read-only reuse |
| PlaybackShell | NONE | No UI |
| Accidental GRANTs on takes | MEDIUM | Explicit RLS tests |
| Migration order / name collision | LOW | Timestamp after `20260927170000` |

**Overall REGRESSION_RISK = LOW** if migration is additive-only and storage changes are bucket-scoped.

---

## 17. File map (planned — do not create yet)

### NEW

| Path | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDDHHMMSS_recording_wave1_take_foundation.sql` | Schema + RLS + bucket |
| `src/types/takes.ts` or extend `domain.ts` | Enums/types |
| `src/lib/takes/object-key.ts` | Server key builders + validators |
| `src/lib/takes/constants.ts` | `TAKE_AUDIO_BUCKET = 'take-audio'` |
| `src/config/recording.ts` | Retention seconds, caps (D05/D07), anon TTL — **data only** |
| `src/lib/takes/wave1-foundation.test.ts` | Unit key/CHECK helpers |
| `src/lib/takes/wave1-live.test.ts` | Live RLS/storage (gated on env) |
| `docs/architecture/TAKES.md` | Thin HOW pointer (optional; or expand RECORDING.md) |

### MODIFIED (minimal)

| Path | Change |
|------|--------|
| `src/types/domain.ts` | Export take enums if centralized |
| `docs/PROJECT_STATE.md` | Wave 1 in progress / complete after impl |
| `docs/CHANGELOG.md` | Wave 1 entry after impl |
| `docs/architecture/RECORDING.md` | Link schema once shipped |
| `docs/phases/PHASE_RECORDING_DESIGN_FREEZE.md` | Wave 1 status checkbox after impl |

### NOT MODIFIED in Wave 1

`audio-access.ts`, `audio-transport.ts`, `playback-shell.tsx`, community actions, download slots, beats migrations.

---

## 18. Implementation order

1. **Config + types** — `recording.ts` constants; `take_status` / mode TypeScript mirrors (no DB yet) + unit tests for key builder  
2. **Migration apply (local/remote)** — enums, table, indexes, triggers, RLS, bucket  
3. **Live RLS tests** — owner/foreign/anon/service matrix  
4. **Live Storage tests** — DENY client insert; service signed upload/read smoke for `take-audio`  
5. **Docs closeout** — PROJECT_STATE / CHANGELOG / RECORDING.md / freeze wave status  

Each step independently testable; stop if regression on beat-audio.

---

## 19. Acceptance criteria (for future Wave 1 COMPLETE)

- [ ] `takes` schema exists with enums/CHECKs/indexes  
- [ ] RLS: owner isolation PASS; foreign DENY; anon direct DENY; staff no blanket SELECT  
- [ ] `take-audio` private; client INSERT DENY  
- [ ] Service can issue signed upload + signed read for server keys (foundation smoke)  
- [ ] Object ownership / key validation helpers PASS  
- [ ] `expires_at` + retention constants present  
- [ ] Soft-delete columns present  
- [ ] No regression: beats, beat-audio, PlaybackShell, Access Gate, downloads, community  
- [ ] tests / lint / typecheck / build PASS  
- [ ] docs updated  
- [ ] production verification of migration + smoke PASS  

*(Product MediaRecorder / Record button / Gate RECORD still NOT required for Wave 1 COMPLETE.)*

---

## 20. Risks

| Risk | Level | Note |
|------|-------|------|
| Shipping bucket without janitor | MED | OK for empty foundation; don't claim anon TTL in prod UX until W2+ janitor |
| Anon column unused until W2 | LOW | Allowed; keep XOR CHECK |
| Over-building transport in W1 | MED | Stay OUT of session API |
| MIME allow-list vs Safari | LOW | Interim list; OD-12 open |
| Naming `takes` vs `mic_takes` | LOW | Prefer `takes` (freeze language) |

---

## 21. Open technical questions

| # | Question | Blocks Wave 1? | Proposed default |
|---|----------|----------------|------------------|
| 1 | Exact anon short TTL seconds | No | 2h interim in config |
| 2 | Pending-upload TTL vs tier retention at INSERT | No | pending 1h then on READY set tier expiry |
| 3 | `duration_ms` vs `duration_seconds` | No | Prefer `duration_ms` |
| 4 | Include `beatId` in object key? | No | **Omit** (DB FK only) |
| 5 | Authenticated GRANT UPDATE for soft-delete vs service-only | No | Service-only writes in W1; soft-delete API W4 |
| 6 | file_size_limit bytes exact | No | Start `20 * 1024 * 1024` or match 50MiB beat interim — document choice in migration |
| 7 | Permission keys `takes.view` in catalog? | No | Skip until staff need; V1 no staff take access |

None are Owner product blockers (D01–D08 already CLOSED).

---

## 22. Final verdict

```text
RECORDING_WAVE1_AUDIT           = COMPLETE

TAKE_DOMAIN                     = READY
RLS_PLAN                        = READY
STORAGE_PLAN                    = READY
MIGRATION_PLAN                  = READY
TEST_PLAN                       = READY
REGRESSION_RISK                 = LOW

IMPLEMENTATION                  = NONE
COMMIT                          = NONE
PUSH                            = NONE
DEPLOY                          = NONE

READY_FOR_WAVE1_IMPLEMENTATION  = YES
```

**Summary:** New `takes` table + private `take-audio` bucket + owner RLS + service-mediated storage is the correct Wave 1 foundation. Do **not** extend `beat_audio_assets` or `beat-audio`. Do **not** implement MediaRecorder, Access Gate RECORD, shared grants, or janitor in Wave 1.

**STOP.** Await separate Owner **Wave 1 Implementation GO** before any migration or code.
