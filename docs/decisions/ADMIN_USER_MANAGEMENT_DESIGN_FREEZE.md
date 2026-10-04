# Admin User Management — Design Freeze (W0 Owner Decision Lock)

**Epic:** ADMIN USER MANAGEMENT  
**Wave:** **W0 = CLOSED** (Owner Decision Lock)  
**Status:** OWNER DECISIONS LOCKED · **W1 READ-ONLY COMPLETE** · **W2 MUTATIONS PRODUCTION VERIFIED WITH FINDINGS** · **W3 HISTORY UI CLOSED / PRODUCTION VERIFIED** @ `237a86f`  
**Date:** 2026-10-04  
**Owner:** Prezes Dawid  
**Canonical ODs:** OD-ADMIN-01 … OD-ADMIN-07  
**Registry:** [DECISION_LOG.md](./DECISION_LOG.md) · [OPEN_DECISIONS.md](./OPEN_DECISIONS.md)  
**W3 closeout:** [ADMIN_USER_MANAGEMENT_W3_CLOSEOUT.md](../audits/ADMIN_USER_MANAGEMENT_W3_CLOSEOUT.md)  
**W4 (Admin Delete):** [ADMIN_USER_DELETE_DESIGN_FREEZE.md](./ADMIN_USER_DELETE_DESIGN_FREEZE.md) — **OWNER APPROVED · IMPLEMENTATION READY — NOT PRODUCTION VERIFIED**

This document is the **SSOT** for locked Admin User Management product/security decisions.  
Wave delivery status is tracked below; decisions remain CLOSED regardless of wave progress.

---

## OWNER DECISIONS LOCKED

```text
ADMIN USER MANAGEMENT
OWNER DECISIONS LOCKED

OD-ADMIN-01 = YES
OD-ADMIN-02 = NO
OD-ADMIN-03 = NO
OD-ADMIN-04 = OPTIONAL EXPIRATION
OD-ADMIN-05 = YES
OD-ADMIN-06 = YES
OD-ADMIN-07 = YES / W3
```

| ID | Decision | Lock |
|----|----------|------|
| OD-ADMIN-01 | ADMIN może nadać/odebrać ADMIN innemu użytkownikowi | **YES** — server-side only; requires `ADMIN` + `users.edit`; confirmation; must be audited |
| OD-ADMIN-02 | ADMIN może zmienić własną rolę | **NO** — no self-demotion via panel |
| OD-ADMIN-03 | Można zdegradować ostatniego ADMIN | **NO** — must keep ≥ 1 active `ADMIN`; **server-side guard** (UI-only is insufficient) |
| OD-ADMIN-04 | Premium duration | **BEZTERMINOWE + OPCJONALNE `expires_at`** |
| OD-ADMIN-05 | ADMIN widzi email | **YES** — `/admin/users` only; not public profile |
| OD-ADMIN-06 | Audit każdej mutacji roli/Premium | **YES** — table `admin_audit_events` (created with W2) |
| OD-ADMIN-07 | Historia zmian w UI | **YES / W3** — decision CLOSED; delivery **PRODUCTION VERIFIED** |

---

## Architectural lock

```text
RANK != PREMIUM != ROLE != ACCOUNT_LEVEL
```

| Axis | SSOT | Notes |
|------|------|--------|
| Role | `profiles.role` (`system_role`: `ADMIN` / `MODERATOR` / `USER`) | UI may say „Administrator”; enum stays `ADMIN` |
| Premium | `premium_entitlements` (`tier`, `active`, `source`, `expires_at`) | `resolveProductEntitlement` + `PREMIUM_TIER_MATRIX` unchanged |
| Rank | derived from `profiles.experience_total` | Admin UI may display; Admin panel must not mutate rank/experience |
| Account level | `profiles.account_level` | Out of this epic unless later Owner GO |

Do **not** create alternate SSOT, `premium_active` flag, new role system, or feature-code `if (tier === 'gold')`.

### Premium expiration (OD-ADMIN-04)

```text
expires_at = NULL     → bezterminowe
expires_at = future   → ważne do wskazanej daty
```

REMOVE PREMIUM = set `tier` to `FREE` (still the SSOT). Reuse existing expiry evaluation in the product resolver.

---

## Security lock

Frontend is **not** an authorization source.

```text
Mutations (W2):
Admin UI → server action → requireRole(["ADMIN"]) → requirePermission("users.edit")
  → validate target → self-protection → service_role RPC → audit write → revalidate

History (W3):
Admin UI → server list → requireRole(["ADMIN"]) → requirePermission("audit_log.view")
  → createSupabaseAdminClient() SELECT admin_audit_events → present labels → UI
```

| Actor | MVP |
|-------|-----|
| USER | no `/admin/users` access; cannot change own role/Premium; no audit history |
| MODERATOR | **no** Premium/Role mutations; **no** audit history |
| ADMIN | full scope per OD-ADMIN-01…07 |

Self-protection (locked with ODs):

- No self-role change (OD-ADMIN-02)
- Cannot drop below 1 `ADMIN` (OD-ADMIN-03) — **server-side**
- Grant/revoke ADMIN to **another** user allowed (OD-ADMIN-01) with confirmation + audit
- Client must never `UPDATE` `profiles.role` or `premium_entitlements`

### Audit model (OD-ADMIN-06) — delivered with W2

Required events include: role change; premium tier; premium expiration; grant/revoke ADMIN; grant/revoke MODERATOR.

```text
admin_audit_events
  actor_user_id
  target_user_id
  actor_user_number
  target_user_number
  action
  old_value
  new_value
  created_at
  metadata
```

**Sequencing lock (historical):** W2 shipped live mutations with audit **write**. History UI is W3 (OD-ADMIN-07).

---

## Wave lock

| Wave | Scope | Status |
|------|--------|--------|
| **W0** | Owner Decision Lock | **CLOSED** |
| **W1** | Read-only user list + filters (`/admin/users`) | **COMPLETE** (in production tree) |
| **W2** | Role + Premium mutations + security guards + audit **write** | **PRODUCTION VERIFIED WITH FINDINGS** @ `8c40824` · DB `20261004144223` |
| **W3** | Audit log + history UI | **CLOSED / PRODUCTION VERIFIED** @ `237a86f` · deploy `dpl_DjmSXuv7UbB2jYpfidAuXKLWWaQR` · DB **unchanged** |
| **W4** | Admin user delete + reason + email | **OWNER APPROVED · IMPLEMENTATION READY — NOT PRODUCTION VERIFIED** — [ADMIN_USER_DELETE_DESIGN_FREEZE.md](./ADMIN_USER_DELETE_DESIGN_FREEZE.md) |

W1 is **read-only**. W2 adds mutations + audit **write**. W3 is history UI. Email on list/detail remains ADMIN-only `/admin/users` (OD-ADMIN-05). History AuthZ is `ADMIN` ∧ `audit_log.view` (not `users.view` alone).

---

## Current evidence

- W1 route: `/admin/users` (ADMIN + `users.view`/`users.edit`)
- W2: `admin_apply_user_management` + `admin_audit_events` · remote migration `20261004144223` · **PRODUCTION VERIFIED WITH FINDINGS** (last-admin concurrency not live-verified; migration timestamp drift; `user_number` holes; retained audit rows after SET NULL)
- W3 history UI: **PRODUCTION VERIFIED** @ `237a86f` / `dpl_DjmSXuv7UbB2jYpfidAuXKLWWaQR` — 49 audit rows · snapshots for deleted targets · filters/pagination PASS · closeout [ADMIN_USER_MANAGEMENT_W3_CLOSEOUT.md](../audits/ADMIN_USER_MANAGEMENT_W3_CLOSEOUT.md)

---

## Explicit non-changes (post-W3)

No W4 **implementation** without Owner GO on [ADMIN_USER_DELETE_DESIGN_FREEZE.md](./ADMIN_USER_DELETE_DESIGN_FREEZE.md) · no DB migration for W3 · no read RPC · no authenticated SELECT policy · no W2 write-path rewrite · no grouping of audit rows · no retention/purge/CSV/undo.
