# USER-CLEANUP-01 — Post-delete evidence

**Status:** EXECUTED (production DB) · pending Owner commit/app deploy  
**Owner:** Prezes Dawid  
**Date:** 2026-10-03  
**Plane:** Supabase project `rzzxrgcdogkybkiidqgw`  
**Repo HEAD at execution:** `4e33e8d` (= `origin/main`)

Companion pre-delete: [USER_CLEANUP_01_PREDELETE_SNAPSHOT.md](./USER_CLEANUP_01_PREDELETE_SNAPSHOT.md)

---

## Result

| Metric | Before | After |
|--------|--------|-------|
| `auth.users` | 95 | **2** |
| `profiles` | 95 | **2** |
| Fixture users deleted | — | **93** (allowlist only) |
| KEEP | Dawid + Tajski | Dawid + Tajski |
| Platform beats | 3 | **3** |
| Orphan Storage (prior baseline) | 31 | **31** (untouched) |
| Anon `take-audio` | 12 | **12** (untouched) |

### KEEP users

| Display | UUID | Remains |
|---------|------|---------|
| Dawid | `fdf04726-e971-42a7-9d46-8b9bdd099c23` | YES |
| Tajski | `3daabc23-3c98-4f30-a60a-c73c2ee3b26a` | YES |

### Dawid baseline intact

| Resource | Count |
|----------|------:|
| takes | 4 |
| beat_audio_assets (created_by) | 3 |
| mix_sessions | 1 |
| render_jobs | 1 |
| take-audio `user/<dawid>/…` | 1 |

### Execution model

- ALLOWLIST-DRIVEN + FAIL-CLOSED + PER-USER LEDGER
- Hard guard: DELETE only UUID ∈ approved 93-UUID allowlist
- Storage via Storage API (SQL DELETE blocked by `protect_delete`)
- Auth via Auth Admin `deleteUser` (CASCADE profiles)
- Staging table `public._user_cleanup_01_allowlist` dropped after run

### Out of scope (unchanged)

- Orphan-31 Storage cleanup
- Public beat `owner_id` UUID hardening
- Messages system

Follow-on: **USER-ID-01** (`user_number`) — see [AUTHORIZATION.md](../architecture/AUTHORIZATION.md#user-id-01--stable-user-number).
