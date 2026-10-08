# Authorization — Phase 1.3

**Status:** COMPLETE / LOCKED / PROMOTED TO MAIN
**Canonical:** `main` @ `efe3f71`
**Runtime verification:** LIVE SUPABASE VERIFIED (2026-09-25) — project `rzzxrgcdogkybkiidqgw`
**SSOT:** §3–5, §36, §39
**Architecture:** [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)

## Model

```text
Supabase Auth → Profile → Role → Permissions → Account Level
```

**ROLE ≠ ACCOUNT LEVEL**

| Concept | Values |
|---------|--------|
| Role | `ADMIN` / `MODERATOR` / `USER` |
| Account level | `BEGINNER_RAPPER` / `PRO_RAPPER` / `LEGEND_RAPPER` (display names may still change via OD-09) |

---

## USER SIGNUP (normal flow)

```text
SIGNUP
 ↓
SUPABASE AUTH
 ↓
PROFILE
 ↓
role = USER
account_level = BEGINNER_RAPPER   ← OD-19 APPROVED DEFAULT
```

- No paid features implied by `BEGINNER_RAPPER`.
- No self-service role or account-level escalation.

### Production Auth URL (canonical)

```text
Site URL (Supabase Auth)     = https://bitrymdym.pl
App emailRedirectTo          = https://bitrymdym.pl/account  (via getAuthEmailRedirectTo)
Vercel NEXT_PUBLIC_SITE_URL  = https://bitrymdym.pl
```

- Production Auth must **not** use `*.vercel.app` deployment URLs as Site URL / canonical redirect.
- Preview/local may use Vercel preview URL or localhost (allow-listed separately).
- Helper: `src/lib/site-url.ts` — production never falls back to `VERCEL_URL`.
- Custom SMTP / branded sender: Auth templates remain for signup/reset. **W4 product mail = Resend** (admin deletion) — env `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (operator, server-only). Production provisioned; domain `bitrymdym.pl` verified; EMAIL E2E **PASS**. Delete still succeeds without rollback if send fails (OD-ADMIN-DELETE-06).

---

## ADMIN BOOTSTRAP (operator-controlled)

```text
EXISTING AUTH USER
 ↓
MANUAL / OPERATOR-CONTROLLED ADMIN BOOTSTRAP
(outside normal signup UI)
 ↓
profiles.role = ADMIN
```

**OD-20 CLOSED:** aplikacja **nie** zawiera:

- first-user auto-admin
- signup admin
- email-based hidden admin
- public `/admin/bootstrap` endpoint
- client-side admin escalation
- magic admin token

Operator may assign ADMIN via controlled Supabase Dashboard / service-role SQL only.
Do not document secrets.

**Admin User Management (OD-ADMIN-01…07 CLOSED):** W1 list + W2 mutations + **W3 history UI CLOSED / PRODUCTION VERIFIED** @ `237a86f`. Read path: `ADMIN` ∧ `audit_log.view` → `createSupabaseAdminClient()` SELECT `admin_audit_events` (no read RPC, no authenticated SELECT policy, no new permission keys). Self-demotion **NO**. Last-ADMIN demotion **NO** (live concurrency path still a W2 finding). See [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](../decisions/ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md) · [W3 closeout](../audits/ADMIN_USER_MANAGEMENT_W3_CLOSEOUT.md).

**W4 Admin Delete (OD-ADMIN-DELETE-01…10 APPROVED):** **CLOSED / PRODUCTION VERIFIED** @ `ddcee65` · DB `20261004174202` · deploy `dpl_C1y6toEPYacQmsxv5Jsa8Dj5KM38`. AuthZ = `requireUser` + `requireRole(["ADMIN"])` + `users.edit`. Self-delete via panel **DENY**. Last-admin **DENY** (lock `4242026, 2002`; TOCTOU vs Auth delete remains; live concurrency **NOT VERIFIED**). Mailer = Resend server-only · EMAIL E2E **PASS**. See [ADMIN_USER_DELETE_DESIGN_FREEZE.md](../decisions/ADMIN_USER_DELETE_DESIGN_FREEZE.md).

---

## Implemented

- Auth sign-up / sign-in / sign-out (minimal UI)
- `profiles` + trigger on Auth user create
- Permission catalog from SSOT §36 examples
- Role → permission mapping (ADMIN all examples; MODERATOR moderation subset)
- Server helpers: `requireUser` / `requireRole` / `requirePermission`
- RLS + privilege-escalation trigger (role / account_level)
- **USER-ID-01** — nullable stable `profiles.user_number` (see below)
- **W1 Admin users list** — `/admin/users` read
- **W2 Admin users mutations** — server action + RPC; no client DML; audit write
- **W3 Admin users audit history** — `/admin/users` Historia zmian; `ADMIN` ∧ `audit_log.view`; service_role SELECT only

---

## USER-ID-01 — Stable User Number

**Status:** PRODUCTION VERIFIED — GREEN · reconciled after PHASE 3 production user cleanup (2026-10-08)

**Cleanup prerequisite (HISTORY):** USER-CLEANUP-01 (93 fixtures removed; KEEP was Dawid + Tajski)

**Current production identity plane:** exactly **1** Auth user / **1** profile — Owner Dawid only (see one-time cleanup below)

**Migration:** `20261003110802_user_id_01_stable_user_number.sql`

**Hardening:** `20261003123000_user_id_01_user_number_null_hardening.sql`

| Rule | Value |
|------|--------|
| Relational FK | Auth UUID / `profiles.id` (unchanged) |
| Operational ID | `profiles.user_number` BIGINT NULL |
| Sequence | `public.user_number_seq` — SSOT allocation · DEFAULT `nextval` on insert |
| Unique | Partial UNIQUE where `user_number IS NOT NULL` |
| Dawid | `user_number = 1` · role `ADMIN` · UUID `fdf04726-e971-42a7-9d46-8b9bdd099c23` · display_name `Dawid` |
| Tajski (HISTORY) | Was `NULL` (never auto-filled) · Auth/profile **deleted** in ACCOUNT Delete Account E2E · **no** renumber/reuse |
| Next signup | **2** (after Owner-approved one-time `setval('public.user_number_seq', 1, true)` — inferred from `last_value=1` + `is_called=true`; **do not** call `nextval()` to “check”) |
| Immutability | Trigger `prevent_user_number_mutation` — authenticated DENY any UPDATE change including NULL→value; INSERT DEFAULT nextval OK; `service_role` only for documented operator recovery |
| App guard | `PROTECTED_PROFILE_FIELDS` includes `user_number` |
| Allocation | DB sequence only — never COUNT/MAX/frontend · never client-side |
| Normal delete | **Does not** release or reuse `user_number` · sequence continues monotonically |
| Messages | Future `messages.*_user_id` remain UUID FKs; `user_number` is display/lookup only |

### ONE-TIME OWNER-APPROVED CLEANUP / SEQUENCE RESET

**Not** a product feature. **Not** normal reuse. Owner-approved production operation only.

| Fact | Value |
|------|--------|
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Operation | PHASE 3 — PRODUCTION USER CLEANUP (2026-10-08) · GREEN |
| PRE-CLEANUP baseline | `auth.users` / `profiles` = **422** · `user_number_seq` `last_value=2038` / `is_called=true` |
| Deleted | **421** test Auth accounts (allowlist = all `auth.users.id <> KEEP`) |
| Retained | Dawid only — UUID `fdf04726-e971-42a7-9d46-8b9bdd099c23` · `user_number=1` · `ADMIN` |
| Premium | **50** non-Dawid `premium_entitlements` cleared (RESTRICT blocker) |
| Storage | Approved user-scoped + orphan objects removed · KEEP Storage + platform catalog **preserved** |
| Sequence reset | `SELECT setval('public.user_number_seq', 1, true)` → `last_value=1` / `is_called=true` → **next generated `user_number` = 2** |
| Dawid data preserved | takes 10 · audio_artifacts 2 · render_jobs 4 · studio_projects 1 · mix_sessions 1 |
| Platform catalog | `beats.owner_id IS NULL` = **17** |

**Standing rules after this reset (unchanged):**

- Numbers are allocated only by `public.user_number_seq`
- `user_number` remains immutable + unique
- Authenticated users cannot change their own number
- Ordinary Auth/account DELETE **does not** free a number for reuse
- **Do not** repeat this sequence reset without a new Owner GO

### Visibility / RLS (unchanged policy base)

`profiles_select_own_or_admin` remains the SELECT policy (**own OR `is_admin()`**).

| Actor | Own `user_number` | Foreign `user_number` |
|-------|-------------------|------------------------|
| USER | YES | NO |
| ADMIN | YES | YES |
| MODERATOR | YES (own) | NO — do not add `is_moderator()` to profiles SELECT |
| ANON / PUBLIC | NO | NO |

### DTO / UI

- Session/account: whitelist columns include `user_number` for the authenticated own profile → UI `Name (ID: N)`.
- Public catalog / detail / home: **never** expose `user_number` (producer stays string).
- Admin moderation: show foreign ID **only when viewer role is ADMIN**.
- Public beat `owner_id` UUID leak: **out of scope** (separate hardening follow-up).

---

## ACCOUNT / PROFILE-01 — Account lifecycle + public ksywka

**Status:** FUNCTIONALLY VERIFIED / PRODUCTION VERIFIED — GREEN @ `89a8d51`

**Design Freeze:** [ACCOUNT_PROFILE_01_AUDIT_PLAN_DESIGN_FREEZE.md](../audits/ACCOUNT_PROFILE_01_AUDIT_PLAN_DESIGN_FREEZE.md) — OWNER APPROVED

**Migration:** repo `20261003160000_account_profile_01.sql` · production history `20261003173213`

**E2E:** Fresh Recovery **PASS** · Delete Account (Tajski) **PASS** · published-USER retain branch **CODE/CONTRACT VERIFIED · NOT LIVE-DATA VERIFIED**

### Identity (public)

| Concept | Role |
|---------|------|
| `profiles.display_name` | Public ksywka (SSOT for USER author identity on read-path) |
| `profiles.user_number` | Own/admin operational ID only (USER-ID-01 unchanged) |
| email | Login only — never public author |
| `beats.producer` | Legacy/historical + PLATFORM label; USER read-path prefers `display_name` |

### Security boundaries

- Profile self-update: `display_name` only · `PROTECTED_PROFILE_FIELDS` blocks `id` / `role` / `account_level` / `user_number`
- Password change: session + reauth (`signInWithPassword`) + Auth `updateUser` — never via profiles UPDATE
- Forgot password:
  - `resetPasswordForEmail` → `getAuthPasswordResetRedirectTo()` (`/auth/callback?flow=recovery`)
  - OTP template contract: `RECOVERY_EMAIL_CALLBACK_PATH` (`token_hash` + `type=recovery`)
  - PKCE `?code=&flow=recovery` **and** OTP recovery keep session → `/auth/reset-password` (`signOut: false` on success)
  - Failed recovery (`!exchangeOk`) → `/forgot-password` with `signOut: false` (Phase 1 — do not wipe a prior recovery session on OTP replay)
  - `flow=recovery` alone is **not** proof → confirmed error (not reset-password)
  - Signup confirm still signs out → `/auth/confirmed`
  - Anti-enumeration success copy
  - UX note (non-blocking): after password update the action signs out; page may land on `/forgot-password` instead of an in-page success CTA
- Delete account: session `auth.uid()` only · password reauth · single orchestrator `deleteOwnAccount` · deny foreign UUID/`user_number`/email claims
- Public author RPC: `public_author_display_names(uuid[])` SECURITY DEFINER returns **only** `(id, display_name)`

### Delete orchestration (contract)

1. Authenticate + reauth  
2. Classify owned USER beats: PUBLISHED → retain+anonymize; else delete · collect retainedKeys  
3. DELETE download events/reservations for user (OTD-04 — CHECK blocks SET NULL)  
4. Delete grants / private takes / mix / render / artifacts / premium  
5. Delete non-published USER beats + assets  
6. **Nullify `beat_audio_assets.created_by` for user (service_role) while owner still set**  
7. Anonymize retained public beats (`producer` = `Usunięty użytkownik`, `owner_id` NULL)  
8. Selective Storage cleanup under `user/{uuid}/` excluding keys referenced by retained public assets  
9. Auth `deleteUser` (profiles CASCADE; `created_by` already NULL → no trigger conflict) · sign out  

**Audio trigger invariant:** ordinary USER cannot mutate assets; INSERT USER still requires living `owner_id`; service_role/admin may nullify `created_by` only; retained USER+NULL owner allows historical `user/` keys for service_role/admin UPDATE only.

**Never:** blind prefix delete · `platform/*` · `anon/*` · orphan-31 · other users · release `user_number`.

### OTD resolutions (implementation)

| OTD | Resolution |
|-----|------------|
| OTD-ACCOUNT-01 | **C** — SET NULL FKs + CHECK USER+NULL · orchestrator nullifies `created_by` before Auth delete · trigger allows that controlled transition |
| OTD-ACCOUNT-02 | **A** — read-path `display_name` via RPC; no bulk producer backfill |
| OTD-ACCOUNT-03 | **A** — reference-aware Storage delete |
| OTD-ACCOUNT-04 | DELETE download rows before Auth delete |

## Verification layers

| Layer | Status |
|-------|--------|
| STATIC SECURITY AUDIT | PASS |
| UNIT TESTS | PASS (authorization helpers) |
| LIVE POSTGRES / SUPABASE VERIFICATION | **PASS** (2026-09-25) |
| Role escalation | **DENY** (live) |
| Account-level escalation | **DENY** (live) |
| Permission INSERT / UPDATE / DELETE | **DENY** (live) |
| Canonical promotion | `main` @ `efe3f71` — **LOCKED** |

Static audit ≠ proof of live RLS on a production database. Live suite confirmed RLS on project `rzzxrgcdogkybkiidqgw`.

## Next.js note

`middleware` → `proxy` deprecation in Next.js 16: **NON-BLOCKING TECHNICAL NOTE** (no migration in Phase 1.3).

---

## Phase 1.4 — Beats AuthZ extension

Feature doc: [BEATS.md](./BEATS.md).

Permissions reused (no new `beats.publish` / `beats.view`):

| Role | Beats capability |
|------|------------------|
| ADMIN | create / edit / delete / approve / reject + status management |
| MODERATOR | approve / reject + non-public moderation visibility; **no** full metadata edit |
| USER | no `beats.create` in Phase 1.4; no publish / ownership / status escalation |

SQL helpers: `is_moderator()`, `is_staff()` (plus existing `is_admin()`).
**AccountLevel does not affect beat authorization.**

**P1 security grants (2026-09-28 @ `b4199ef`):** `is_admin` / `is_moderator` / `is_staff` retain `EXECUTE` for **authenticated** (required by RLS). PUBLIC/anon EXECUTE revoked. Trigger-only DEFINER helpers and `current_user_role` have no client EXECUTE. Claim/download RPCs remain service_role-only. See [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) §5.1.

Live beats RLS verification on `rzzxrgcdogkybkiidqgw`: **PASS** (2026-09-25).

---

## Phase 1.5 — Audio Access Gate AuthZ

Design Freeze: [PHASE_1_5_DESIGN_FREEZE.md](../phases/PHASE_1_5_DESIGN_FREEZE.md).

| Path | AuthZ |
|------|-------|
| Anonymous PLAYBACK/DOWNLOAD | No `requireUser`; PUBLISHED + READY asset only |
| Authenticated USER | `requireUser`; PUBLISHED for public purposes |
| MODERATOR | Staff PLAYBACK (incl. non-published); **DOWNLOAD DENY** |
| ADMIN upload/replace/archive | `beats.edit` + PLATFORM beat only |
| Signed URL | Server-only; PLAYBACK 120s; DOWNLOAD 300s |

No new permission keys. Role ≠ AccountLevel. OD-12 remains OPEN.

---

## Phase 1.6 — Public Playback Surface

Design Freeze: [PHASE_1_6_DESIGN_FREEZE.md](../phases/PHASE_1_6_DESIGN_FREEZE.md).

| Surface | Rule |
|---------|------|
| `/beats`, `/beat/[id]` | PUBLISHED only (explicit status filter + RLS) |
| Playback | Existing Access Gate `PLAYBACK` only |
| Anonymous | ALLOW for PUBLISHED |
| Authenticated USER | ALLOW for PUBLISHED |
| Non-published on public routes | DENY (`notFound`) |
| DOWNLOAD from UI | HARD OUT (lifted in Phase 1.8A Download CTA only) |

No new permission keys. AccountLevel unused for playback.

---

## Phase 1.7 — Admin PLATFORM Content Ops

Design Freeze: [PHASE_1_7_DESIGN_FREEZE.md](../phases/PHASE_1_7_DESIGN_FREEZE.md).

| Surface | Rule |
|---------|------|
| `/admin/beats*` | ADMIN role required (layout gate) |
| `/admin/users` | List: ADMIN + `users.view`/`users.edit`. Mutations: ADMIN + `users.edit` + RPC `admin_apply_user_management`. History: ADMIN + `audit_log.view` + service_role SELECT. MODERATOR DENY |
| Create / edit / upload / publish | `beats.create` / `beats.edit` + ADMIN |
| USER / MODERATOR / anonymous | DENY PLATFORM write ops |
| Ownership | `PLATFORM` + `owner_id = NULL` |
| Publish UI | Blocked without active READY MASTER |
| Server publish READY hard rule | **GAP-PUBLISH-READY** (not implemented) |

---

## Phase 1.8A — Download Productization

Design Freeze: [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md).

| Surface | Rule |
|---------|------|
| Download CTA `/beat/[id]` | Access Gate `DOWNLOAD` REUSE; TTL 300s |
| Anonymous limit | 2 / UTC day; httpOnly opaque token → server hash |
| Authenticated USER limit | 4 / UTC day; `user_id`; global |
| ADMIN | DOWNLOAD ALLOW; daily limit exempt; event still recorded |
| MODERATOR | DOWNLOAD DENY (unchanged) |
| DOWNLOAD_EVENT | After AuthZ + limit allow + successful signed URL |
| `beat_download_events` | RLS: authenticated SELECT own only; INSERT via service_role |
| Moje pobrane `/account/downloads` | Authenticated only |
| Client | Cannot set identity / limits / create events |

No new permission keys. AccountLevel unused for download AuthZ/limits.

Phase 1.7 note: AccountLevel unused for admin AuthZ. No admin bootstrap endpoint. OD-20 CLOSED (operator ADMIN).

---

## Recording Wave 5 — Shared Grants → RECORD

Design Freeze Addendum + Architecture Review (Owner Implementation GO).

| Path | AuthZ |
|------|-------|
| RECORD (unchanged W4) | Authenticated + PUBLISHED + entitlement; public catalog path |
| RECORD + grant | Same; optional ACTIVE `can_record` grant labels `GRANT_RECORD` (does not unlock non-PUBLISHED) |
| Create grant | Beat `owner_id` only · USER ownership · PUBLISHED · not self · max 20 ACTIVE · service_role RPC |
| List/revoke grant | Beat owner only |
| Grantee list | Own ACTIVE grants only (`/api/account/grants`, `/account/shared`) |
| Take preview/download/delete | **Unchanged** — take owner only; grant ≠ take ACL |
| PLAYBACK / DOWNLOAD via grant | **OUT** |

`AudioAccessPurpose` remains `PLAYBACK` \| `DOWNLOAD` only. RECORD stays in `assertTakeRecordAccess`.

Table `beat_access_grants`: RLS ON, no authenticated write policies; mutations via service_role + `create_beat_access_grant` (advisory lock class `87245103`).

**Status:** **CLOSED / PRODUCTION VERIFIED** @ `37892a6` · Shared Grants → RECORD only.
