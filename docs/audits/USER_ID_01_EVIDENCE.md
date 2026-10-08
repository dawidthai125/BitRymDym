# USER-ID-01 — Stable User Number (evidence)

**Status:** PRODUCTION VERIFIED — GREEN · reconciled after PHASE 3 production user cleanup (2026-10-08)

**Migration (remote tip):** `20261003110802` / `user_id_01_stable_user_number`

**Hardening:** `20261003123000` / `user_id_01_user_number_null_hardening` (applied in production tree)

**Repo file:** `supabase/migrations/20261003110802_user_id_01_stable_user_number.sql`

**SSOT:** [AUTHORIZATION.md — USER-ID-01](../architecture/AUTHORIZATION.md#user-id-01--stable-user-number)

**Current-state source:** PHASE 3 — PRODUCTION CLEANUP (GREEN) · documentation reconciliation = Phase 4

---

## Current production identity (post–PHASE 3)

| Check | Result |
|-------|--------|
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| KEEP UUID | `fdf04726-e971-42a7-9d46-8b9bdd099c23` |
| KEEP `user_number` | **1** |
| KEEP role | **ADMIN** |
| KEEP `display_name` | **Dawid** |
| Production `auth.users` | **1** |
| Production `profiles` | **1** |
| `user_number_seq.last_value` | **1** |
| `user_number_seq.is_called` | **true** |
| Next generated `user_number` | **2** (inference from `last_value=1` + `is_called=true` — **do not** call `nextval()` for evidence) |
| Premium non-Dawid | **0** |
| Platform beats (`owner_id` NULL) | **17** |
| Dawid takes / audio_artifacts / render_jobs / studio_projects / mix_sessions | **10 / 2 / 4 / 1 / 1** |

### PHASE 3 cleanup summary (HISTORY → CURRENT)

| Field | Value |
|-------|--------|
| PRE-CLEANUP users / profiles | **422** / **422** (HISTORY) |
| Deleted test accounts | **421** |
| Retained owner | Dawid only |
| PRE-CLEANUP sequence | `last_value=2038` / `is_called=true` (HISTORY) |
| One-time reset | `setval('public.user_number_seq', 1, true)` — OWNER-APPROVED · **not** normal reuse |
| Standing rule | Ordinary DELETE still **does not** release/reuse `user_number` |

---

## Seed / sequence (original USER-ID-01 evidence — HISTORY)

Captured at first USER-ID-01 apply / early verify (pre–PHASE 3 environmental growth). Kept for audit trail.

| Check | Result (HISTORY) |
|-------|------------------|
| Dawid `user_number` | **1** |
| Tajski `user_number` | **NULL** (later deleted in ACCOUNT Delete Account E2E — no renumber) |
| `nextval` after early `setval(..., 1, true)` | **2** |
| Partial UNIQUE | PASS (duplicate 1 rejected) |
| Concurrent DEFAULT alloc | Distinct numbers ≥ 2 |
| Delete → no reuse | PASS (monotonic) |
| Immutability (authenticated, non-null → change) | PASS (`user_number is immutable`) |
| NULL → value hardening | `20261003123000` |
| App `PROTECTED_PROFILE_FIELDS` | includes `user_number` |
| service_role recovery path | Documented; not used in normal flow |

## RLS (SET ROLE authenticated / anon) — HISTORY snapshot

| Actor | Result |
|-------|--------|
| ADMIN (Dawid) | Sees both profiles; own number = 1 |
| USER (Tajski) | Own row only; no foreign Dawid row |
| MODERATOR (temp flip Tajski) | Own row only; no foreign number |
| ANON | No profiles (or insufficient privilege) |

## App surface

- Session whitelist: `PROFILE_SELECT_OWN` includes `user_number`
- Account UI: `Dawid (ID: 1)` via `formatProfileWithUserNumber`
- Admin moderation: foreign ID **only if viewer is ADMIN**
- Public catalog/detail: no `user_number` / no `ownerId` in DTO
- Messages: not implemented; UUID FKs remain the relational model
- Allocation: DB sequence only — never COUNT/MAX/frontend
