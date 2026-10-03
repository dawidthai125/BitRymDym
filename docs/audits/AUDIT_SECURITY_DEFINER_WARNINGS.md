# SECURITY DEFINER / ADVISOR WARNINGS AUDIT

**Type:** READ-ONLY audit + evidence (no fix)
**Owner:** Prezes Dawid
**Date:** 2026-10-03
**Project:** `rzzxrgcdogkybkiidqgw`
**Classification:** **DEFINER WARN AUDIT = ACTION REQUIRED** (LOW — grant hygiene)

```text
HIBP / P1-A                           = OUT OF SCOPE (Owner: DEFERRED / ACCEPTED RISK)
FAR-01                                = OUT OF SCOPE (soak ACTIVE · no changes)
DB / Grants / Function mutations      = 0
service-role mutation                 = NO
Commit / Push / Deploy                = NO
```

Companion RCA (confirmed repair-needed finding):
`docs/audits/RCA_SECURITY_DEFINER_WARNINGS.md`

---

## 1. Scope

Investigate residual Security Advisor WARNs for PostgreSQL **SECURITY DEFINER** functions (EXECUTE exposure to `anon` / `authenticated`), including `search_path` and grant posture.

**In scope:** live Advisor DEFINER lints · live `pg_proc` / ACL · migrations · app usage.
**Out of scope:** HIBP · FAR-01 · implementing fixes · RLS-no-policy INFO tables (noted only).

---

## 2. Evidence Sources

| Priority | Source | Used |
|----------|--------|------|
| 1 | Live Security Advisor (`get_advisors` security) 2026-10-03 | YES |
| 1 | Live SQL: `pg_proc` / `proacl` / `has_function_privilege` / triggers / `pg_get_functiondef` | YES (SELECT only) |
| 2 | Migrations: `20260928120000_security_p1_*`, `20260928200000_e3_1_audio_foundation.sql`, identity/beats | YES |
| 3 | App `src/**` RPC usage | YES (no `.rpc('is_*')` / prevent_* calls) |
| 4 | `AUTHORIZATION.md` · `MASTER_HANDOFF` P1-B posture | YES |
| 5 | Historical P1-B CLOSED claims | YES (context) |

---

## 3. Current Function Inventory

Flagged by live Advisor (DEFINER EXECUTE lints) plus P1-B comparison set:

| Function | Schema | Owner | SECURITY DEFINER | search_path | PUBLIC EXECUTE | anon | authenticated | Usage | Risk |
|----------|--------|-------|:----------------:|-------------|:--------------:|:---:|:-------------:|-------|------|
| `prevent_audio_artifact_privilege_escalation` | public | postgres | YES | `public` (fixed) | NO (not in ACL) | **YES** | **YES** | Trigger on `audio_artifacts` | **LOW** grant surface |
| `prevent_mix_session_privilege_escalation` | public | postgres | YES | `public` | NO | **YES** | **YES** | Trigger on `mix_sessions` | **LOW** |
| `prevent_premium_entitlement_privilege_escalation` | public | postgres | YES | `public` | NO | **YES** | **YES** | Trigger on `premium_entitlements` | **LOW** |
| `prevent_render_job_privilege_escalation` | public | postgres | YES | `public` | NO | **YES** | **YES** | Trigger on `render_jobs` | **LOW** |
| `is_admin` | public | postgres | YES | `public` | NO | NO | **YES** (intentional) | RLS helpers | **SAFE / intentional** |
| `is_moderator` | public | postgres | YES | `public` | NO | NO | **YES** (intentional) | RLS helpers | **SAFE / intentional** |
| `is_staff` | public | postgres | YES | `public` | NO | NO | **YES** (intentional) | RLS helpers | **SAFE / intentional** |

**Control comparison (P1-B hardened — not in Advisor DEFINER anon lint):**

| Function | anon | authenticated | Notes |
|----------|:----:|:-------------:|-------|
| `prevent_privilege_escalation` | NO | NO | Trigger-only · hardened |
| `prevent_beat_privilege_escalation` | NO | NO | Trigger-only · hardened |
| `prevent_beat_audio_privilege_escalation` | NO | NO | Trigger-only · hardened |
| `prevent_take_privilege_escalation` | NO | NO | Trigger-only · hardened |
| `prevent_beat_access_grant_privilege_escalation` | NO | NO | Wave5 · hardened |
| `set_updated_at` | NO | NO | P1-C · hardened |
| `handle_new_user` | NO | NO | P1-B · hardened |

Live ACL example (E3 function):
`{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`

Live ACL example (P1-B function):
`{postgres=X/postgres,service_role=X/postgres}`

---

## 4. Current Security Advisor Findings

### DEFINER-related (this audit)

| Lint | Level | Count | Functions |
|------|-------|------:|-----------|
| `anon_security_definer_function_executable` | WARN | **4** | four `prevent_*` E3 trigger functions |
| `authenticated_security_definer_function_executable` | WARN | **7** | same four `prevent_*` + `is_admin` + `is_moderator` + `is_staff` |

### Explicitly out of scope here

| Lint | Note |
|------|------|
| `auth_leaked_password_protection` | P1-A · Owner DEFERRED / ACCEPTED RISK |
| `rls_enabled_no_policy` INFO | Not DEFINER · separate topic |

**No Advisor finding** in this pull for mutable `search_path` on these functions — all have `SET search_path TO 'public'`.

---

## 5. Function-by-Function Analysis

### 5.1 E3 `prevent_*` (4 functions) — Advisor anon + authenticated

| Question | Answer |
|----------|--------|
| WARN type | SECURITY DEFINER + **client EXECUTE** (`anon`/`authenticated`) |
| search_path | Fixed `public` — object-shadowing via mutable path **not** indicated |
| PUBLIC EXECUTE | Not present in live ACL |
| Trigger usage | YES — BEFORE mutation guards; service_role-only mutations |
| Body | Rejects non-`service_role` mutations; validates artifact bucket/key where applicable |
| Arguments | None (trigger signature) |
| App RPC usage | **NONE** found in `src/` |

### 5.2 `is_admin` / `is_moderator` / `is_staff`

| Question | Answer |
|----------|--------|
| WARN type | SECURITY DEFINER + **authenticated EXECUTE** |
| anon EXECUTE | **Revoked** (live) |
| search_path | Fixed `public` |
| Purpose | RLS staff helpers — **intentional** authenticated EXECUTE (P1-B / AUTHORIZATION.md) |
| Body | Boolean EXISTS on `profiles` for `auth.uid()` |
| App RPC usage | **NONE** in TS; used from **SQL RLS policies** |

---

## 6. Exploitability

### A–F for E3 `prevent_*`

| # | Question | Finding |
|---|----------|---------|
| A | Call without auth? | **YES** — `anon` has EXECUTE · PostgREST `/rpc/<name>` surface exists |
| B | Controlled arguments? | **NO** — zero-arg trigger function |
| C | Elevated privileges? | Runs as DEFINER owner (`postgres`) **if** invoked in a valid trigger context |
| D | Read/modify foreign data / bypass RLS / escalate? | **Not via RPC:** body only raises or returns trigger row; direct RPC call is not a table DML path. Mutation still requires table WRITE + trigger fire; trigger then **blocks** non-service_role |
| E | search_path shadowing? | **Mitigated** — `search_path=public` set |
| F | Real security impact? | **LOW** — defense-in-depth / Advisor surface; **no verified privilege-escalation / IDOR / tenant bypass** from RPC invoke |

Direct RPC call likely errors (`TG_OP` / `NEW`/`OLD` not in normal call context) or no-ops harmful paths — **not proven as data-exfil exploit**.

### A–F for `is_*`

| # | Finding |
|---|---------|
| A | anon: **NO**. authenticated: **YES** (intentional) |
| B | No args |
| C | DEFINER read of `profiles` for **current** `auth.uid()` only |
| D | Does **not** return other users’ roles; does **not** write |
| E | search_path fixed |
| F | **SAFE / intentional** for RLS; Advisor WARN expected until accepted or linter exception |

**No CRITICAL/HIGH** claim — evidence supports **LOW** (grant hygiene) only for E3 `prevent_*`.

---

## 7. RLS / AuthZ Impact

| Item | Impact |
|------|--------|
| Revoking authenticated EXECUTE on `is_*` | Would **break RLS** that calls these helpers — **forbidden without redesign** |
| Revoking anon/authenticated on E3 `prevent_*` | Aligns with P1-B trigger-only posture; triggers still fire (owner/`postgres`) — **expected non-breaking** for app |
| RLS bypass via these WARNs | **Not evidenced** |

---

## 8. Application Impact

| Path | Uses flagged functions? |
|------|-------------------------|
| Auth / profile trigger | `handle_new_user` (hardened · not in Advisor DEFINER anon list) |
| RLS | `is_admin` / `is_moderator` / `is_staff` |
| API / server actions / route handlers | No direct RPC to flagged prevent_* / is_* found |
| Recording / storage / payments / worker | Table mutations go through server/`service_role`; E3 triggers enforce service_role-only |

**Regression risk if hardening E3 grants (REVOKE anon/authenticated):** **LOW** — matches already-shipped P1-B pattern for older `prevent_*`.
**Regression risk if revoking authenticated on `is_*`:** **HIGH** — do not.

---

## 9. Production Impact

| Item | Status |
|------|--------|
| Live production DB | Confirms Advisor WARNs are **real** (not docs-only) |
| User-facing outage from current state | **Not evidenced** |
| Residual attack surface | Extra PostgREST RPC endpoints for 4 trigger functions callable by anon |

---

## 10. Historical vs Current Findings

| Claim | Current verification |
|-------|----------------------|
| P1-B CLOSED @ `b4199ef` | **TRUE** for functions it listed — live ACL matches |
| P1-B covered all future DEFINER triggers | **FALSE** — E3.1 (`20260928200000`) added 4 new `prevent_*` **after** P1-B |
| E3 migration “REVOKE FROM PUBLIC” | **Insufficient** — live ACL still has **explicit** `anon` + `authenticated` EXECUTE |
| Advisor WARNs “pre-existing E3/triggers” (Fala E audit) | **CONFIRMED current** |

---

## 11. Classification

| ID | Subject | Classification |
|----|---------|----------------|
| **DEF-01** | 4× E3 `prevent_*` with anon+authenticated EXECUTE | **ACTIVE SECURITY FINDING** (LOW · grant hygiene / Advisor surface) |
| **DEF-02** | `is_admin` / `is_moderator` / `is_staff` authenticated EXECUTE | **PLATFORM / ADVISOR WARNING ONLY** · **SAFE / intentional** for RLS |
| P1-B older `prevent_*` | Hardened ACL | **RESOLVED** |
| Mutable search_path on flagged set | — | **RESOLVED / not present** (fixed search_path) |
| HIBP | — | **OUT OF SCOPE** |

---

## 12. Owner Decisions Required

**OWNER DECISION REQUIRED:**

1. Authorize a **future security hardening wave** to `REVOKE EXECUTE` on the four E3 trigger functions from `PUBLIC`, `anon`, and `authenticated` (mirror P1-B), **or**
2. **Accept residual Advisor WARN** for those four as LOW risk (document acceptance).
3. Confirm **`is_*` authenticated EXECUTE remains intentional** (no revoke) — recommended default: **KEEP**.

Do not implement until Owner GO.

---

## 13. Recommended Next Gate

```text
NEXT GATE = RCA/PLAN
  → Owner Decision (harden vs accept)
  → (if harden) Design/Plan + Owner GO
  → Migration REVOKE-only (no logic change)
  → Advisor re-verify
```

RCA written: `docs/audits/RCA_SECURITY_DEFINER_WARNINGS.md`

---

## 14. Explicit Non-Actions

This audit performed **zero** of:

- DB mutations
- Storage mutations
- Auth mutations
- RLS mutations
- Grants mutations
- Function mutations
- service-role mutation
- Production changes
- Commit / Push / Deploy
- FAR-01 changes

---

## Final Classification

**DEFINER WARN AUDIT = ACTION REQUIRED**

| Field | Value |
|-------|-------|
| Finding ID | **DEF-01** |
| Root Cause | E3.1 created 4 SECURITY DEFINER trigger functions after P1-B; migration only `REVOKE FROM PUBLIC`, leaving explicit `anon`/`authenticated` EXECUTE |
| Security Impact | **LOW** — Advisor/PostgREST surface; no verified privilege escalation / IDOR / tenant bypass |
| Affected Function(s) | `prevent_audio_artifact_privilege_escalation`, `prevent_mix_session_privilege_escalation`, `prevent_premium_entitlement_privilege_escalation`, `prevent_render_job_privilege_escalation` |
| Required Owner Decision | Harden (REVOKE) vs Accept residual WARN; keep `is_*` authenticated EXECUTE |
| Next Gate | **RCA/PLAN** (RCA present) |

**DEF-02** (`is_*`): no repair required for RLS design — Advisor WARN expected.

---

## Safety footer

- DB mutations = 0
- Storage mutations = 0
- Auth mutations = 0
- RLS mutations = 0
- Grants mutations = 0
- Function mutations = 0
- service-role mutation = NO
- Production changes = 0
- Commit = NO
- Push = NO
- Deploy = NO

STOP. Awaiting Owner Review.
