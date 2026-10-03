# USER-ID-01 — Stable User Number (evidence)

**Status:** DB APPLIED · app code pending Owner commit/deploy  
**Migration (remote tip):** `20261003110802` / `user_id_01_stable_user_number`  
**Repo file:** `supabase/migrations/20261003110802_user_id_01_stable_user_number.sql`  
**SSOT:** [AUTHORIZATION.md — USER-ID-01](../architecture/AUTHORIZATION.md#user-id-01--stable-user-number)

---

## Seed / sequence

| Check | Result |
|-------|--------|
| Dawid `user_number` | **1** |
| Tajski `user_number` | **NULL** |
| `nextval` after `setval(..., 1, true)` | **2** |
| Partial UNIQUE | PASS (duplicate 1 rejected) |
| Concurrent DEFAULT alloc | Distinct numbers ≥ 2 |
| Delete → no reuse | PASS (monotonic) |
| Immutability (authenticated, non-null → change) | PASS (`user_number is immutable`) |
| NULL → value hardening (repo) | `20261003123000` — **not yet applied** to production (Owner forbid pre-commit DB mutate) |
| App `PROTECTED_PROFILE_FIELDS` | includes `user_number` |
| service_role recovery path | Documented; not used in normal flow |

## RLS (SET ROLE authenticated / anon)

| Actor | Result |
|-------|--------|
| ADMIN (Dawid) | Sees both profiles; own number = 1 |
| USER (Tajski) | Own row only; no foreign Dawid row |
| MODERATOR (temp flip Tajski) | Own row only; no foreign number |
| ANON | No profiles (or insufficient privilege) |

## App surface (this implementation)

- Session whitelist: `PROFILE_SELECT_OWN` includes `user_number`
- Account UI: `Dawid (ID: 1)` via `formatProfileWithUserNumber`
- Admin moderation: foreign ID **only if viewer is ADMIN**
- Public catalog/detail: no `user_number` / no `ownerId` in DTO
- Messages: not implemented; UUID FKs remain the relational model
