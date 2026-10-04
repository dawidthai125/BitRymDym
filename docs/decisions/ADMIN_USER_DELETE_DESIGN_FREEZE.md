# Admin User Delete — Design Freeze (W4)

**Epic:** ADMIN USER MANAGEMENT  
**Wave:** W4 — ADMIN USER DELETE + DELETION REASON + EMAIL NOTIFICATION  
**Status:** **CLOSED / PRODUCTION VERIFIED**  
**Date:** 2026-10-04  
**Owner:** Prezes Dawid  
**Canonical ODs:** OD-ADMIN-DELETE-01 … OD-ADMIN-DELETE-10 (**OWNER APPROVED** · delivery PRODUCTION VERIFIED)  
**Audit source:** W4 ADMIN DELETE — production apply + deploy + disposable-fixture delete E2E + real Resend email E2E  
**Parent epic freeze:** [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](./ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md) (OD-ADMIN-01…07 remain CLOSED)  
**Registry:** [DECISION_LOG.md](./DECISION_LOG.md) · [OPEN_DECISIONS.md](./OPEN_DECISIONS.md)

This document is the **SSOT** for W4. Approved W4 scope is production verified. Remaining P2 findings stay listed and are **not** silently closed.

---

## 1. Status

```text
W4                         = CLOSED / PRODUCTION VERIFIED
Implementation             = IN PRODUCTION APP @ ddcee65
Migration                  = APPLIED · remote version 20261004174202 / admin_user_management_w4_delete
                             (local file 20261004190900 — timestamp drift, same as W2 pattern)
Production app             = ddcee65 · dpl_C1y6toEPYacQmsxv5Jsa8Dj5KM38 · READY / PROMOTED
                             (redeploy of ddcee65 after Resend env provision; prior dpl_4qr3…)
Owner Decisions            = APPROVED
EMAIL E2E                  = PASS (real disposable inbox · Resend · bitrymdym.pl)
LIVE CONCURRENCY           = NOT VERIFIED
P0 / P1                    = 0
```

**PROPOSED vs OWNER APPROVED**

| Layer | Meaning |
|-------|---------|
| **PROPOSED** | Text in this freeze + Owner-requested values below. Binding for *planning* only. |
| **OWNER APPROVED** | Requires explicit Owner GO after this freeze. |
| **CLOSED / PRODUCTION VERIFIED** | Approved W4 scope verified in production, including real email E2E. P2 findings may remain. |

---

## 2. Baseline

| Plane | Value |
|-------|--------|
| Repository | https://github.com/dawidthai125/BitRymDym · `main` |
| **W4 implementation commit** | `ddcee65ef6090667577add5ecb2a649c2fe1969b` (`ddcee65`) — `feat(admin): add account deletion workflow` |
| **Production application SHA** | `ddcee65` — must equal implementation commit (docs closeout may advance repo later) |
| **Production deployment** | `dpl_C1y6toEPYacQmsxv5Jsa8Dj5KM38` — READY / PROMOTED · `www.bitrymdym.pl` · `bitrymdym.pl` (commit `ddcee65`) |
| **Previous production app** | `237a86f` · then W4 first ship `dpl_4qr3Bt5Z7oVitimvxWyAhjFo9kbK` |
| **Production DB tip** | `20261004174202` / `admin_user_management_w4_delete` (prior `20261004144223` / W2 mutations still in chain) |
| **W3 DB migration** | NONE |
| **W3** | CLOSED / PRODUCTION VERIFIED |
| **W4 (this wave)** | **CLOSED / PRODUCTION VERIFIED** |

Do not merge planes: repo docs tip ≠ production app SHA.

---

## 3. Owner Request

On `/admin/users`, ADMIN must be able to delete a given user:

1. Select user.
2. Confirmation required.
3. ADMIN must enter **deletion reason**.
4. Reason stored in administrative history.
5. Account deleted via **canonical ACCOUNT/PROFILE-01** lifecycle.
6. After successful deletion, user receives email: account deleted + admin reason.
7. Server-side, correctly authorized.
8. **No second independent account-deletion mechanism.**

---

## 4. Existing SSOT

| Area | Canonical |
|------|-----------|
| Self-delete orchestrator | `src/lib/auth/delete-account.ts` (`deleteOwnAccount`) |
| Self-delete action | `src/lib/auth/actions.ts` (`deleteAccountAction`) |
| Policy | `src/lib/auth/delete-account-policy.ts` |
| ACCOUNT/PROFILE-01 freeze | `docs/audits/ACCOUNT_PROFILE_01_AUDIT_PLAN_DESIGN_FREEZE.md` |
| Admin route | `/admin/users` |
| Admin mutations | `src/app/admin/users/actions.ts` → RPC `admin_apply_user_management` |
| AuthZ helpers | `src/lib/admin/users-authz.ts` (`canMutateAdminUsers` = ADMIN ∧ `users.edit`) |
| Audit table | `public.admin_audit_events` |
| Last-admin lock (W2) | `pg_advisory_xact_lock(4242026, 2002)` inside RPC |
| Product transactional mailer | **NONE** (ARCHITECTURE GAP) |
| Auth emails | Supabase Auth Dashboard templates only (confirm / reset) |
| Email on `/admin/users` | OD-ADMIN-05 CLOSED — ADMIN may see email **only** there |

**Hard reuse:** extract shared core from `deleteOwnAccount`. Do not duplicate classify / Storage / Auth steps.

**W2 RPC is not the delete orchestrator.** Auth + Storage cannot join a PostgreSQL transaction with `admin_apply_user_management`. Admin delete is a **new server action** that **reuses ACCOUNT/PROFILE-01 core** and **shares the same advisory lock key** as last-admin demotion.

**Scope note vs parent freeze:** [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](./ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md) previously listed W4 as “epic wrap / production verification”. **This freeze redefines W4** as Admin Delete + reason + email. Parent wave table must point here. Recording “W4” (Quick Take) is a **different** historical wave — do not conflate.

---

## 5. Design Goals

- ADMIN deletes **other** accounts with required reason + audit + notification.
- Zero duplicate deletion lifecycle.
- Same data contract as ACCOUNT/PROFILE-01.
- Server authorization only; session actor only.
- Last-admin and self-delete protection equivalent in strength to W2 (and **same lock** as demotion).
- Reason in `admin_audit_events.metadata.reason`; W3 presenter extended.
- Resend as **proposed** transactional provider (not installed in this phase).
- Polish UX; no raw Supabase/Postgres errors.

---

## 6. Non-Goals

- Implementing code, migrations, SDK, env, or sending mail in this freeze.
- Changing ACCOUNT/PROFILE-01 retain/anonymize/Storage rules.
- New audit table; new permission key; `users.suspend`.
- Relaxing RLS; grants to `anon` / `authenticated` on audit.
- Premium / Rank / `account_level` schema changes.
- Background worker / queue infrastructure (none exists; W4-E = sync send + observable failure unless Owner later GO).
- Deleting Owner account, real production users, or running production E2E delete without a **separate** verification GO.
- Email change, MFA, CSV export, undo, retention purge.
- Client-side Auth/Storage delete.

If implementation would change ACCOUNT/PROFILE-01 data rules: **STOP + Owner Decision**.

---

## 7. Owner Decisions

**Status of all ten: OWNER APPROVED for W4 implementation. Delivery is not PRODUCTION VERIFIED.**

```text
OD-ADMIN-DELETE-01 = YES          (PROPOSED)
OD-ADMIN-DELETE-02 = NO           (PROPOSED)
OD-ADMIN-DELETE-03 = NO           (PROPOSED)
OD-ADMIN-DELETE-04 = YES          (PROPOSED)
OD-ADMIN-DELETE-05 = YES          (PROPOSED)
OD-ADMIN-DELETE-06 = NO           (PROPOSED)
OD-ADMIN-DELETE-07 = YES          (PROPOSED)
OD-ADMIN-DELETE-08 = ADMIN + users.edit   (PROPOSED)
OD-ADMIN-DELETE-09 = RESEND       (PROPOSED)
OD-ADMIN-DELETE-10 = USER_ACCOUNT_DELETE  (PROPOSED)
```

| ID | Question | Existing SSOT | Proposed lock | Owner |
|----|----------|---------------|---------------|--------|
| OD-ADMIN-DELETE-01 | ADMIN may delete **other** accounts | No admin delete product | **YES** | **PENDING OWNER GO** |
| OD-ADMIN-DELETE-02 | ADMIN may delete **own** account via panel | Self-demotion NO (OD-ADMIN-02) | **NO** | **PENDING OWNER GO** |
| OD-ADMIN-DELETE-03 | May delete last ADMIN | Last-admin demotion NO (OD-ADMIN-03) | **NO** | **PENDING OWNER GO** |
| OD-ADMIN-DELETE-04 | Deletion reason required | — | **YES** | **PENDING OWNER GO** |
| OD-ADMIN-DELETE-05 | Reason included in email to target | No product mailer | **YES** (requires Resend GO) | **PENDING OWNER GO** |
| OD-ADMIN-DELETE-06 | Email failure rolls back delete | Auth/Storage/DB not 2PC | **NO** | **PENDING OWNER GO** |
| OD-ADMIN-DELETE-07 | Same lifecycle as ACCOUNT/PROFILE-01 | Freeze ACCOUNT-01 | **YES** | **PENDING OWNER GO** |
| OD-ADMIN-DELETE-08 | Permission | W2 mutate = `users.edit`; `users.suspend` unused + seeded for MODERATOR | **ADMIN + `users.edit`**. Do not use `users.suspend`. Do not invent a new key in W4. | **PENDING OWNER GO** |
| OD-ADMIN-DELETE-09 | Transactional email provider | Auth templates only; custom SMTP OUT | **RESEND** | **PENDING OWNER GO** |
| OD-ADMIN-DELETE-10 | Audit `action` | W2 CHECK list | **`USER_ACCOUNT_DELETE`** | **PENDING OWNER GO** |

OD-ADMIN-01…07 remain **CLOSED / ACCEPTED** (parent epic). They do **not** by themselves authorize W4 implementation.

---

## 8. Authorization

**Chain (proposed):**

```text
Server Action
  → requireUser()                    // actor ALWAYS from session
  → requireRole(["ADMIN"])
  → requirePermission("users.edit")  // or canMutateAdminUsers()
  → parse target UUID from request (identity only)
  → load target role / user_number / premium from DB (service_role after AuthZ)
  → load target email from Auth Admin API (not from body)
  → SELF_DELETE_FORBIDDEN if actor.id === target.id
  → LAST_ADMIN_PROTECTED under shared advisory lock
  → executeAccountProfile01Deletion(targetId)
```

Reuse `canMutateAdminUsers()` (already ADMIN ∧ `users.edit`). Optional dedicated `canDeleteAdminUsers` alias may wrap the same predicate — **no new permission**.

**Never trust from body:** actor id, target role, email, premium, user_number (except target UUID as locator, then re-read).

| Actor | Result |
|-------|--------|
| Unauthenticated | DENY |
| USER | DENY |
| MODERATOR | DENY (`users.suspend` in catalog is **irrelevant**; role gate fails) |
| ADMIN + `users.edit` | ALLOW (other users, after guards) |
| ADMIN self | DENY |
| Last ADMIN as target | DENY |

Frontend is **not** AuthZ.

---

## 9. Account/Profile lifecycle

### Shared core (proposed name)

`executeAccountProfile01Deletion(targetUserId)` — `server-only`, service_role after caller AuthZ.

**Does:**

1. Classify USER-owned beats (existing policy).
2. Delete downloads (`beat_download_events` as downloader).
3. Delete grants (`beat_download_grants` as grantee).
4. Delete mix sessions / render jobs / artifacts (existing orchestrator order).
5. Delete takes + take Storage.
6. Delete premium entitlements.
7. Delete private / non-published USER beats.
8. Nullify `created_by`.
9. RETAIN + anonymize PUBLISHED USER beats (`ANONYMIZED_PUBLIC_AUTHOR`, `owner_id` NULL).
10. Selective Storage: only `user/{uuid}/` keys not required by retained public assets. Never `platform/*`, `anon/*`, other users.
11. **Auth `admin.deleteUser` LAST.**

**Does not:**

- Require target password.
- Use target session.
- `signOut` the Admin actor.
- Change retain/delete classification.

`creator_progress` / experience ledger: existing `ON DELETE CASCADE` from `profiles` — core need not duplicate.

`user_number`: not reused; sequence continues (ACCOUNT/PROFILE-01). Snapshot into audit.

### Callers

```text
deleteOwnAccount()
  → reauthenticateWithPassword
  → executeAccountProfile01Deletion(auth.uid())
  → signOut

adminDeleteUser()
  → Admin AuthZ
  → validate reason
  → capture email + snapshots
  → self-delete guard
  → last-admin lock/guard
  → executeAccountProfile01Deletion(targetId)
  → insert USER_ACCOUNT_DELETE
  → sendAdminAccountDeletionEmail({ to, reason })
```

**Lifecycle map (must match ACCOUNT/PROFILE-01):**

| Resource | Operation |
|----------|-----------|
| Auth | DELETE (last) |
| Profile | DELETE (CASCADE from Auth) |
| Role | DELETE with profile (snapshot in audit) |
| Premium | DELETE |
| Experience / ledger | DELETE (CASCADE) |
| Public PUBLISHED USER beats | RETAIN + ANONYMIZE |
| Private / non-published USER beats | DELETE |
| PLATFORM `created_by` | SET NULL |
| Retained public beat audio | RETAIN |
| Deleted-beat audio | DELETE |
| Takes / mix / render / artifacts | DELETE |
| Downloads / grants | DELETE |
| Storage `user/{uuid}/` | DELETE selective |
| Historical `admin_audit_events` | RETAIN (FK SET NULL) |
| Email address | Read before Auth delete; not stored in audit JSON |

---

## 10. Last-admin concurrency

**Critical:** deleting an ADMIN and demoting an ADMIN **must share** `pg_advisory_xact_lock(4242026, 2002)`.

Do **not** introduce a second lock family for delete vs demote.

Race to prevent: concurrent demote of B and delete of C leaving **zero** ADMIN.

**Guard shape (design; no SQL in this phase):**

```text
BEGIN
  PERFORM pg_advisory_xact_lock(4242026, 2002);
  -- target exists in profiles
  -- actor.id <> target.id
  -- if target.role = ADMIN AND count(ADMIN) <= 1 → LAST_ADMIN_PROTECTED
  -- (optional) hold lock only for the count+decision; Auth/Storage remain outside PG
COMMIT
```

Implementation options (both valid if they **use the same lock key**):

- Short SECURITY DEFINER helper that only serializes last-admin check (preferred over stuffing Auth into RPC).
- Or session `SET` / dedicated RPC `admin_assert_user_deletable` that takes the lock, checks, returns snapshots.

W2 last-admin **live concurrency** remains an open finding — W4 must not weaken it. Tests must cover serialized demote + delete.

---

## 11. Audit contract

**Table:** existing `public.admin_audit_events`. **No new table. No `reason` column.**

**Migration (W4-B, after GO):** extend CHECK `action` with `USER_ACCOUNT_DELETE`. No RLS relaxation. No `anon`/`authenticated` INSERT. service_role only (same as W3 SELECT / W2 RPC write).

**Record (proposed):**

```text
action              = USER_ACCOUNT_DELETE
actor_user_id       = session actor (still exists)
target_user_id      = NULL after target Auth/profile gone
actor_user_number   = snapshot
target_user_number  = snapshot (required)
old_value           = { "role": "<from DB>", "premiumActive": <bool> }
new_value           = { "deleted": true }
metadata            = { "panel": "admin_users", "reason": "<validated plain text>" }
```

**Forbidden in JSON:** target email, target UUID in metadata, secrets, stack traces.

**Why reason in `metadata`:** operator-authored text, not an entity before/after field. Matches W2 `panel` in metadata. `old_value` / `new_value` stay comparable to role/premium rows.

**W3 presenter:** extend `labelAdminAuditAction` + row UI so `USER_ACCOUNT_DELETE` shows Polish action label and **escaped** `metadata.reason`. Unknown actions must not leak raw JSON unsafely. Do not put reason in URL query.

**Insert order:** **after** successful canonical deletion including Auth delete. Do not write success audit before delete completes.

If audit INSERT fails after successful delete: deletion **stands**; **no fake rollback**; **observable error** (server log / structured failure code). Exact alerting hook chosen in implementation (no new infra in freeze unless already present).

---

## 12. Email contract

**Provider (PROPOSED):** Resend (OD-ADMIN-DELETE-09). **Not installed. No env committed. No send.**

**Gap today:** no `sendEmail` helper, no product templates, no retry worker.

**Proposed server-only API (name may follow repo conventions at implement time):**

```text
sendAdminAccountDeletionEmail({ to, reason })
```

- `to`: Auth email captured **before** `deleteUser`.
- `reason`: already validated plain text.
- Server-only; never import from client components.

**Subject:** `Twoje konto w BitRymDym zostało usunięte`

**Body (structure):**

- Konto zostało usunięte przez administratora.
- Powód usunięcia: `{reason}` (plain text; if HTML template, **escape**).
- Krótko: brak logowania; dane prywatne usunięte zgodnie z zasadami konta; opublikowane utwory mogą pozostać zanonimizowane (ACCOUNT/PROFILE-01).

**Must not include:** UUID, `user_number`, `service_role`, other users, stack, internal IDs, raw provider errors in user-visible copy.

**Send timing:** only after successful Auth delete (step 8 of failure model).

**Failure:** does **not** roll back delete (OD-ADMIN-DELETE-06 PROPOSED). Log error. Sync send + observable failure. **No new queue** unless one already exists (it does not).

**Env (implementation after GO; names only):** typical `RESEND_API_KEY`; From address Owner-approved (e.g. branded vs onboarding domain). **Never print values.** Custom SMTP remains a separate historical deferral; W4 uses Resend **if** OD-09 is approved — not Supabase Auth templates (those cannot carry admin reason as product mail).

**W4-E is blocked** until Owner GO on OD-ADMIN-DELETE-09 **and** secrets provisioning (operator, not Agent inventing keys).

---

## 13. Reason validation

**Field:** „Powód usunięcia konta”

| Rule | Value |
|------|--------|
| Trim | YES |
| Minimum | **10** characters after trim |
| Maximum | **500** |
| Empty | REJECT |
| NUL / control chars | REJECT |
| `<` / HTML tags | REJECT |
| Encoding | plain text |

Do **not** log reason to console. Do **not** put reason in URL. Client may re-display the submitted reason in the dialog until success; server re-validates. Audit stores validated text in `metadata.reason`.

---

## 14. UX

**Route:** `/admin/users`

**Row action:** „Usuń konto” (danger).

**Own Admin row:** **disabled** with copy: `Nie możesz usunąć własnego konta.` (not hidden — discoverability + honest AuthZ).

**Dialog**

| Element | Copy |
|---------|------|
| Title | Usuń konto |
| Identity | Ksywka · `#user_number` · email (W0 / OD-ADMIN-05) |
| Warning | Ta operacja jest nieodwracalna. |
| Info | Konto zostanie usunięte. Dane prywatne zostaną usunięte zgodnie z zasadami konta. Opublikowane utwory pozostaną zgodnie z ACCOUNT/PROFILE-01 i zostaną zanonimizowane. |
| Textarea label | Powód usunięcia konta |
| Placeholder | Wpisz powód usunięcia konta… |
| Confirm | Usuń konto |
| Cancel | Anuluj |

**Forbidden buttons:** „OK”, „Potwierdź”.

**Success:** close dialog; revalidate list; `Konto zostało usunięte.`

**Email failure after successful delete:** still success for deletion; optional **non-blocking** warning that notification could not be sent (wording in implementation if Resend returns sync error). **Not** presented as rollback.

**Errors:** Polish mapped codes (`SELF_DELETE_FORBIDDEN`, `LAST_ADMIN_PROTECTED`, `NOT_FOUND`, `INVALID_REASON`, `DELETE_FAILED`, …). No raw DB/Auth strings.

---

## 15. Threat model

| Risk | Existing protection | Gap | Freeze rule |
|------|---------------------|-----|-------------|
| ADMIN deletes self | Self-demotion only | Delete bypasses RPC | SELF_DELETE_FORBIDDEN + disabled UI |
| Last ADMIN deleted | RPC last-admin | Delete outside RPC | Same advisory lock + count |
| USER / MODERATOR invoke | Role on `/admin/users` | New action must repeat | requireRole ADMIN + users.edit |
| IDOR target UUID | W2 loads target in RPC | New action | Re-read profile; ignore client role/email |
| Demote+delete race | Lock in RPC only | Two paths | Shared lock `4242026, 2002` |
| Partial delete | Auth last in orchestrator | Multi-system | Keep Auth last; fail-closed; no success audit/email |
| Auth gone, data left | Avoided by Auth last | Would regress if reordered | Do not reorder |
| Data gone, Auth remains | Possible on `deleteUser` fail | Retry Auth; no email | Surface DELETE_FAILED |
| Public beats deleted | Policy | Duplicate core | Shared core only |
| Private audio / Storage orphan | Selective cleanup | Partial Storage fail | Fail before Auth; orphan-31 out of scope |
| Email on failed delete | No mailer | — | Send only after Auth success |
| Email fail after delete | — | — | No rollback; log |
| XSS in reason | — | New field | Reject `<`; escape in HTML mail and W3 UI |
| Secrets in reason | — | Operator | Max 500; no console log |
| Double submit | — | — | Disable submit; missing target → Polish NOT_FOUND |
| Timeout retry | — | Partial | Idempotency notes in §17 |
| Audit missing after delete | RPC atomic with mutate | Split systems | Observable error; no fake undo |
| Wrong email recipient | — | — | Capture via Admin API before delete |
| service_role on client | Keys server-only | New files | `server-only`; no client Auth delete |

---

## 16. Failure model

| Step | Fail | Effect |
|------|------|--------|
| AuthZ / reason / target missing | Before mutation | No delete, no audit, no email |
| Last-admin / self | Before core | No delete |
| Core DB/Storage mid-flight | Existing fail-closed | No Auth delete, no audit, no email |
| Auth delete fails | After DB/Storage | **Dangerous partial**; return error; **no** success audit; **no** email; do not claim success |
| Audit INSERT fails | After Auth success | Delete **stands**; log/alert; Admin may still see success on list (user gone) |
| Email fails | After audit attempt | Delete **stands**; non-blocking warning if sync result available |

Email failure **never** reconstitutes Auth user or rolls back Storage/DB.

---

## 17. Atomicity

Auth + Storage + PostgreSQL are **not** one transaction. Do not pretend otherwise.

```text
1. AuthZ
2. Validate reason
3. Capture email + snapshots (role, premiumActive, user_numbers)
4. Advisory lock + existence + self + last-admin
5. executeAccountProfile01Deletion (DB/Storage then Auth LAST)
6. Insert USER_ACCOUNT_DELETE (target_user_id NULL + number snapshot)
7. sendAdminAccountDeletionEmail
```

**Idempotency (design):** if a retry finds Auth user already gone after a timeout: do **not** re-run destructive core against a recycled UUID (UUIDs are not reused). Treat as “already deleted”; attempt audit/email only if not already recorded for that `target_user_number` + action in a short window. Exact helper in implementation.

**Do not** insert `USER_ACCOUNT_DELETE` before Auth success (false audit while account lives).

---

## 18. Test contract

Minimum (unit / static / AuthZ; live Auth delete only on disposable fixtures under later GO):

**AuthZ**

- ADMIN allow (other user, valid reason, not last admin)
- USER deny · MODERATOR deny · unauthenticated deny

**Self / last-admin**

- ADMIN cannot delete self
- Cannot delete last ADMIN
- Can delete ADMIN when another ADMIN remains
- Serialized with role demotion under the **same** lock (no zero-ADMIN outcome)

**Reason**

- empty / `<10` / `>500` / control chars / `<` deny
- valid reason allow

**Target**

- nonexistent target
- IDOR / forged role, actor, email, premium ignored
- snapshots from server

**Lifecycle (policy + orchestrator contract; reuse existing ACCOUNT/PROFILE-01 tests)**

- public beat retained + anonymized
- private beat + private audio + takes + artifacts deleted
- premium deleted; grants/downloads deleted
- platform content preserved; Storage selective
- **Regression:** self-delete still requires reauth; still signs out owner; policy unchanged

**Audit**

- `USER_ACCOUNT_DELETE` inserted after success
- `target_user_number` retained; `target_user_id` null
- reason visible in presenter; **email absent** from audit JSON

**Email (after W4-E; mock Resend)**

- captured before Auth delete
- correct recipient + reason
- not sent when delete fails
- failure does not rollback delete

---

## 19. Migration contract

**Expected file (after GO, not now):**  
`supabase/migrations/YYYYMMDDHHMMSS_admin_user_management_w4_delete.sql`

**In:**

- Extend `admin_audit_events.action` CHECK with `USER_ACCOUNT_DELETE`

**Out:**

- New audit table, new permission, RLS relaxation, public/authenticated grants
- Premium / Rank / `account_level` schema
- ACCOUNT/PROFILE-01 table contract changes

Optional later (only if implementation needs it and freeze still holds): SECURITY DEFINER last-admin assert RPC using **the same lock key**. Not required to invent in this freeze if the app can take the lock via a tiny helper; prefer not expanding surface without need.

---

## 20. W4 implementation phases

| Phase | Scope | Status now |
|-------|--------|------------|
| **W4-A** | This Design Freeze + Owner GO | **READY — PENDING OWNER GO** |
| **W4-B** | Audit CHECK migration | NOT STARTED |
| **W4-C** | Shared deletion core + admin server action + guards + audit insert | NOT STARTED |
| **W4-D** | Admin UI + reason + Polish UX + W3 presenter | NOT STARTED |
| **W4-E** | Resend mailer + `sendAdminAccountDeletionEmail` | NOT STARTED · blocked on OD-09 + secrets |
| **W4-F** | Tests + security regression | NOT STARTED |
| **W4-G** | Production verification | NOT STARTED · separate GO · disposable fixture only |

No phase starts without Owner GO on W4-A. W4-E additionally requires Resend credentials provisioned by Owner/operator.

---

## 21. Production verification plan

After implementation GO (not now):

1. Apply W4-B to production DB only with explicit GO.
2. Deploy app only with explicit GO.
3. Create **dedicated disposable fixture** user (not Owner, not real customers).
4. E2E: dialog → reason → delete → list refresh → audit row + reason → (if Resend live) inbox of fixture.
5. Negative: USER/MODERATOR, self-delete, last-admin (if fixture ADMIN used, ensure another ADMIN remains — **never** delete Owner).
6. Confirm public-beat retain on fixture **only if** fixture has a published USER beat created for the test.

**Forbidden without separate explicit Owner GO:** delete real production users; delete Owner account; mass cleanup.

---

## 22. Open blockers

| Blocker | Blocks |
|---------|--------|
| Owner GO on OD-ADMIN-DELETE-01…10 | All implementation |
| Resend account + API key + From domain (operator) | W4-E |
| No product mailer today | W4-E until GO |
| W2 last-admin live concurrency finding | Must not regress; W4 lock reuse |
| Last-admin advisory lock is transaction-scoped (TOCTOU vs Auth/Storage delete) | Live last-admin concurrency |
| No durable idempotency store | Retry semantics |
| LIVE CONCURRENCY NOT VERIFIED (sole production ADMIN = user_number 1, protected) | Last-admin live race |
| Published USER beat retain | Not live-data exercised (empty USER fixture) |
| Migration timestamp/version drift (`20261004190900` file vs `20261004174202` applied) | History only |

---

## 23. Owner GO gate

W4 implementation **must not** start until Owner explicitly approves this freeze.

**GO must confirm (or amend):**

```text
OD-ADMIN-DELETE-01 = YES
OD-ADMIN-DELETE-02 = NO
OD-ADMIN-DELETE-03 = NO
OD-ADMIN-DELETE-04 = YES
OD-ADMIN-DELETE-05 = YES
OD-ADMIN-DELETE-06 = NO
OD-ADMIN-DELETE-07 = YES
OD-ADMIN-DELETE-08 = ADMIN + users.edit
OD-ADMIN-DELETE-09 = RESEND
OD-ADMIN-DELETE-10 = USER_ACCOUNT_DELETE
```

Until that message exists in-session / in registry as **OWNER APPROVED**:

```text
W4 = DESIGN FREEZE READY — PENDING OWNER GO
Implementation = NOT STARTED
Migration = NOT CREATED
Production = UNCHANGED
```

**STOP.** Wait for Owner GO.
