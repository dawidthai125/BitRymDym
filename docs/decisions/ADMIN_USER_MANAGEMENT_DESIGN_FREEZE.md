# Admin User Management — Design Freeze (W0 Owner Decision Lock)

**Epic:** ADMIN USER MANAGEMENT  
**Wave:** **W0 = CLOSED** (Owner Decision Lock)  
**Status:** OWNER DECISIONS LOCKED · **W1 READ-ONLY IMPLEMENTED** · **W2 MUTATIONS IMPLEMENTED** · **W3 HISTORY UI IMPLEMENTED (repo)** · **W3 PRODUCTION NOT VERIFIED**  
**Date:** 2026-10-04  
**Owner:** Prezes Dawid  
**Canonical ODs:** OD-ADMIN-01 … OD-ADMIN-07  
**Registry:** [DECISION_LOG.md](./DECISION_LOG.md) · [OPEN_DECISIONS.md](./OPEN_DECISIONS.md)

This document is the **SSOT** for locked Admin User Management product/security decisions.  
It does **not** ship the feature. Implementation requires a separate Wave GO (W1+).

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
| OD-ADMIN-06 | Audit każdej mutacji roli/Premium | **YES** — target table `admin_audit_events` (not created in W0) |
| OD-ADMIN-07 | Historia zmian w UI | **YES / NOT MVP** — W3 |

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
Admin UI
  → server action
  → requireRole(["ADMIN"])
  → requirePermission("users.edit")
  → validate target
  → self-protection
  → service_role mutation
  → audit event
  → revalidate
```

| Actor | MVP |
|-------|-----|
| USER | no `/admin/users` access; cannot change own role/Premium |
| MODERATOR | **no** Premium/Role mutations |
| ADMIN | full scope per OD-ADMIN-01…07 |

Self-protection (locked with ODs):

- No self-role change (OD-ADMIN-02)
- Cannot drop below 1 `ADMIN` (OD-ADMIN-03) — **server-side**
- Grant/revoke ADMIN to **another** user allowed (OD-ADMIN-01) with confirmation + audit
- Client must never `UPDATE` `profiles.role` or `premium_entitlements`

### Audit model (OD-ADMIN-06) — design only, not migrated

Required events include: role change; premium tier; premium expiration; grant/revoke ADMIN; grant/revoke MODERATOR.

Proposed table (W3; **do not create in W0/W1**):

```text
admin_audit_events
  actor_user_id
  target_user_id
  action
  old_value
  new_value
  created_at
  metadata
```

W2 mutations **must** write audit events once the table exists; W1 is read-only so audit writes start with W2 (table GO with W2 or W3 — Owner Wave GO decides sequencing; **OD-ADMIN-06 requires audit on every mutation**, so the table must exist **before or with W2**, not after W2 ships live mutations).

**Sequencing lock:** W2 must not ship live role/Premium mutations without `admin_audit_events` write path. History UI remains W3 (OD-ADMIN-07).

---

## Wave lock

| Wave | Scope | Status |
|------|--------|--------|
| **W0** | Owner Decision Lock | **CLOSED** |
| **W1** | Read-only user list + filters (`/admin/users`) | **IMPLEMENTED** |
| **W2** | Role + Premium mutations + security guards + audit **write** | **IMPLEMENTED** (repo + prior production DB/app gates) · last-admin live path remains a W2 finding |
| **W3** | Audit log + history UI | **IMPLEMENTED (repo)** · **PRODUCTION NOT VERIFIED** (history UI not deployed / not UI-verified) |
| **W4** | Full production verification | NOT STARTED |

W1 is **read-only**. W2 adds mutations + audit **write**. W3 is history UI. Email on list/detail remains ADMIN-only `/admin/users` (OD-ADMIN-05).

---

## Current evidence

- W1 route: `/admin/users` (ADMIN + `users.view`/`users.edit`)
- W2: `admin_apply_user_management` + `admin_audit_events` (repo + production table present; 49 historical rows, all `target_user_id` NULL with `target_user_number` snapshot)
- W3 history UI: **IMPLEMENTED (repo)** — `/admin/users` Historia zmian · SELECT via `createSupabaseAdminClient()` after `ADMIN` ∧ `audit_log.view` · **PRODUCTION NOT VERIFIED** (production app still serves pre-W3 UI)

---

## Explicit non-changes (W3)

No production deploy until a separate Owner GO · no DB migration · no read RPC · no authenticated SELECT policy · no W2 write-path change · no grouping of audit rows · no W4.
