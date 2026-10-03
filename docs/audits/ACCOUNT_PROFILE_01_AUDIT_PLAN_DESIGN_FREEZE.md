# ACCOUNT / PROFILE-01 — AUDIT + RCA + PLAN + DESIGN FREEZE

**Status:** FUNCTIONALLY VERIFIED / PRODUCTION VERIFIED — GREEN

**Owner GO DESIGN FREEZE:** 2026-10-03 · Prezes Dawid

**Owner GO IMPLEMENT:** 2026-10-03 · Prezes Dawid

**Production tip:** repo/app `89a8d51` · deploy `dpl_7FPLmX87USMN5myC4mRvKbmUgsdU` · Ready

**Production DB:** ACCOUNT/PROFILE-01 applied as history `20261003173213`

**Evidence:** Fresh Recovery E2E **PASS** · Delete Account E2E **PASS** (Tajski) · P0/P1/P2 **NONE**

**Known limitation:** PUBLISHED USER beat retain → `owner_id` NULL → anonymized identity is **CODE/CONTRACT VERIFIED** · **NOT LIVE-DATA VERIFIED** (Tajski had 0 owned beats/assets at delete)

Prior OWNER APPROVED contracts below remain the freeze SSOT. Live identity snapshot at freeze approval is historical.

---

## OWNER DECISIONS (12/12 CLOSED)

| ID | Decision | Locked value |
|----|----------|--------------|
| **OD-ACCOUNT-01** | Ksywka unique? | **NO** — duplicates allowed · **no** UNIQUE on `display_name` |
| **OD-ACCOUNT-02** | Format | **3–30** chars · letters/digits/PL/spaces/`_`/`-` · no HTML/control · trim · empty after trim = INVALID |
| **OD-ACCOUNT-03** | Change ksywka | **YES** unlimited in V1 · same validation as signup |
| **OD-ACCOUNT-04** | Change email | **NO in V1** · separate future epic |
| **OD-ACCOUNT-05** | Public beats on delete | **Do not auto-delete** public content solely because account deleted · ownership-safe retain · anonymize author when needed |
| **OD-ACCOUNT-06** | Private takes/audio | **DELETE** with account + private Storage · never platform/anon/others |
| **OD-ACCOUNT-07** | Public content | **RETAIN + ANONYMIZE** if architecture allows · never email/UUID/`user_number` as public author |
| **OD-ACCOUNT-08** | Soft deactivate | **NO in V1** · real account deletion |
| **OD-ACCOUNT-09** | producer ↔ ksywka | Profile ksywka = **target SSOT** for public user identity · **no** naive sync `display_name→producer` on every UPDATE · investigate read-path from `profiles.display_name` · keep `beats.producer` for compat/history · **no data migration without Owner GO** |
| **OD-ACCOUNT-10** | Forgot password | **YES** full email reset V1 · distinct from Change Password |
| **OD-ACCOUNT-11** | Empty ksywka | **NO** · active normal users must have valid ksywka · no `""` / whitespace / NULL |
| **OD-ACCOUNT-12** | Tajski / NULL | **Do not** assign `user_number` · Tajski stays NULL · USER-ID-01 inviolable |

### Live identity snapshot

**At freeze approval (historical):** Dawid=`1` · Tajski=`NULL` (valid ksywka) · USER beats=`0`.

**After ACCOUNT/PROFILE-01 production verify + Delete Account E2E (2026-10-03):** Dawid only (`user_number=1`) · Tajski Auth/profile **deleted** · auth/profiles=`1` · platform beats=`3` retained · USER-ID-01 no renumber/reuse.

---

## FINAL CONTRACT

### Identity

| Concept | Role |
|---------|------|
| UUID | Technical relational identity |
| `user_number` | Permanent operational ID (immutable · unique · no reuse) |
| `display_name` | Public ksywka |
| email | Login only — **never** public author |

Examples:

- PUBLIC: `Tajski`
- ADMIN: `Tajski (ID: 123)` when number exists; bare name if NULL
- LOGIN: `dawid@example.com`

### Profile field classes

| Class | Fields |
|-------|--------|
| USER-MANAGED | `display_name` |
| SYSTEM-MANAGED | `user_number`, UUID, timestamps |
| ADMIN-MANAGED | `role`, `account_level` |
| AUTH (not profiles columns) | email, password |

### Account UI

```text
PROFILE     — Ksywka · User ID · Email (private)
SECURITY    — Change password · Forgot password (separate Auth flow)
DANGER ZONE — Delete account
```

Mobile-first · existing design system · no duplicate logic.

### Change password

Session-bound · current password reauth · new + confirm · Auth `updateUser` · never trust client UUID/`user_number`/email form field as identity.

### Forgot password

Email → reset link → callback → set new password · safe Auth session handling · **not** the same as Change Password.

### Delete account

```text
Danger Zone → consequences → current password → reauth → orchestrated deletion
→ auth.uid() only → dependents per contract → Storage user/{uuid}/… (private only)
→ Auth delete → sign out
```

No CASCADE assumptions. Handle RESTRICT explicitly. Fail-closed ledger.

### user_number on delete

Immutable · unique · **no reuse · no renumber · delete does not release number**. Sequence continues (e.g. after 2 deleted, next is 4).

### Public identity

| Actor | Sees |
|-------|------|
| PUBLIC | `display_name` / approved public author string only |
| USER | own ksywka + own `user_number` |
| ADMIN | foreign ksywka + `user_number` in admin contexts |
| MODERATOR | **no** foreign `user_number` |

Never public: email · `user_number` · UUID as name.

### Storage

Supabase Storage = durable SSOT. On delete: may remove `user/{uuid}/…` **private** objects per OD-06. **Never:** `platform/*` · `anon/*` · orphan-31 · other users. No Storage mutation during Design Freeze.

### Registration (V1)

Email · password · confirm password · **mandatory ksywka** (OD-02 validation). No empty/NULL ksywka for new active users.

---

## IMPLEMENTATION BOUNDARIES

### IN SCOPE

- Mandatory ksywka at registration + validation  
- Profile editing (`display_name`)  
- Password change + reauth  
- Forgot password (email reset)  
- Delete account + password confirm + orchestration  
- Public identity via ksywka (per OD-09 technical approach)  
- Private user Storage cleanup  
- Tests · RLS/security · Documentation Continuity  

### OUT OF SCOPE

- Email change  
- MFA · social login  
- Messaging · comments · payments  
- Public `owner_id` UUID hardening  
- Orphan-31 cleanup  
- Tajski numbering  
- New design system  
- Unrelated refactors  
- Production data mutations / producer backfill without Owner GO  

---

## OPEN TECHNICAL DECISIONS — RESOLVED AT OWNER GO IMPLEMENT

| OTD | Resolution | Artifact |
|-----|------------|----------|
| **OTD-ACCOUNT-01** | **C** — SET NULL FKs + CHECK allows USER+NULL; anonymize `producer` then null `owner_id` | `20261003160000_account_profile_01.sql` + `delete-account.ts` |
| **OTD-ACCOUNT-02** | **A** — read-path `display_name` via `public_author_display_names`; `producer` legacy/PLATFORM; **no** bulk backfill | `public-author.ts` / `public-author-resolve.ts` |
| **OTD-ACCOUNT-03** | **A** — selective Storage delete; retain keys referenced by retained PUBLISHED assets | `delete-account.ts` |
| **OTD-ACCOUNT-04** | DELETE download events/reservations for user before Auth delete | `delete-account.ts` |

---

## FINAL IMPLEMENTATION CONTRACT (post-IMPLEMENT)

### Registration
Email · password · confirm · mandatory ksywka (`validateDisplayName`) → Auth metadata `display_name` → `handle_new_user` profile.

### Profile
USER may update own `display_name` only (same validation). Identity = `auth.uid()`.

### Password
Change: current + reauth + new + confirm → Auth `updateUser`.  
Forgot:
- request → `resetPasswordForEmail` with `redirectTo=/auth/callback?flow=recovery`
- OTP template: `token_hash` + `type=recovery`
- PKCE `code` + `flow=recovery` **or** OTP recovery → keep session → `/auth/reset-password`
- signup confirm unchanged (sign out → `/auth/confirmed`)

### Delete
Danger Zone → password + type `USUŃ` → `deleteOwnAccount` orchestrator (single path).  
Sequence includes **created_by nullify (service_role) before anonymize/Auth delete** so audio trigger cannot fail mid-delete.

### Public identity
PUBLIC: ksywka · ADMIN: ksywka + `user_number` · MODERATOR: no foreign number · never email/UUID/`user_number` as public author.

### USER-ID-01
Unchanged: immutable · unique · no reuse · delete does not release number · Tajski stays NULL.

---

## 1. Executive Summary (audit facts — unchanged)

BitRymDym has Auth + Profile skeleton but lacks password change/reset UI, reauth, and delete-account. Public author is largely `beats.producer`. Delete is HIGH-RISK under RESTRICT FKs. USER-ID-01 must remain intact.

---

## 2–12. Current-state audit

(See prior sections in git history / earlier PROPOSED freeze; live facts still hold at `0ca0115`.)

Historical audit pointers (pre-IMPLEMENT) remain for RCA; product gaps above are closed in repo per FINAL IMPLEMENTATION CONTRACT.

---

## Implementation sequence (post-freeze)

1. ~~OWNER GO DESIGN FREEZE~~ **DONE**  
2. ~~Resolve OTD-ACCOUNT-01…04~~ **DONE** (C / A / A / DELETE)  
3. ~~OWNER GO IMPLEMENT~~ **DONE (repo)**  
4. **OWNER GO REVIEW** → Owner GO commit / DB apply / deploy · verify  

---

## DESIGN FREEZE — OWNER APPROVED → IMPLEMENTATION COMPLETE (REPO)

| Gate | State |
|------|--------|
| Product ODs | **12/12 CLOSED** |
| OTDs | **01–04 RESOLVED** (C / A / A / DELETE rows) |
| Final contracts | **LOCKED** + implementation contract above |
| Implementation | **BLOCKER FIX CYCLE COMPLETE** (awaiting OWNER RE-REVIEW) |
| Production DB mutation | **NOT RUN** |
| Commit / push / deploy | **NOT RUN** |
| Next | **OWNER RE-REVIEW** → then Owner GO commit/apply/deploy |

**No commit, push, deploy, or Production DB apply without separate Owner GO.**
