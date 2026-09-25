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
| DOWNLOAD from UI | HARD OUT |

No new permission keys. AccountLevel unused for playback.
