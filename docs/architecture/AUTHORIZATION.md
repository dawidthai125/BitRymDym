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
- Custom SMTP / branded sender: deferred (default Supabase sender OK until Owner GO).

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

---

## Implemented

- Auth sign-up / sign-in / sign-out (minimal UI)
- `profiles` + trigger on Auth user create
- Permission catalog from SSOT §36 examples
- Role → permission mapping (ADMIN all examples; MODERATOR moderation subset)
- Server helpers: `requireUser` / `requireRole` / `requirePermission`
- RLS + privilege-escalation trigger (role / account_level)

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
