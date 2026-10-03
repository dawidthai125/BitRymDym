# DEF-01 PRODUCTION VERIFICATION

**Owner GO:** YES
**Date:** 2026-10-03
**Classification:** **DEF-01 PRODUCTION APPLY = PASS** · **DEF-01 PRODUCTION VERIFICATION = PASS**

```text
Commit / Push / Deploy                   = NO
Unexpected DB mutations                   = 0
Storage / Auth / RLS mutations           = 0
```

---

## Migration

| Field | Value |
|-------|-------|
| file | `supabase/migrations/20261003030000_def01_e3_definer_execute_revoke.sql` |
| commit | `fbc696f4f27e18b97b7dc65da3c048b4ee7cffae` |
| HEAD / origin/main | `fbc696f4f27e18b97b7dc65da3c048b4ee7cffae` (matched) |
| applied (remote schema_migrations) | version **`20261003051539`** · name **`def01_e3_definer_execute_revoke`** |
| applied timestamp (UTC, from version) | **2026-10-03T05:15:39Z** |

Pre-flight: migration absent before apply · present after · only this migration applied.

---

## Functions

| # | Signature |
|---|-----------|
| 1 | `public.prevent_audio_artifact_privilege_escalation()` |
| 2 | `public.prevent_mix_session_privilege_escalation()` |
| 3 | `public.prevent_premium_entitlement_privilege_escalation()` |
| 4 | `public.prevent_render_job_privilege_escalation()` |

---

## ACL Before

| Function | anon | authenticated | proacl |
|----------|:----:|:-------------:|--------|
| all four DEF-01 | **YES** | **YES** | `{postgres=X, anon=X, authenticated=X, service_role=X}` |

---

## ACL After

| Function | PUBLIC EXECUTE | anon | authenticated | proacl |
|----------|:--------------:|:----:|:-------------:|--------|
| `prevent_audio_artifact_privilege_escalation()` | **NO** | **NO** | **NO** | `{postgres=X, service_role=X}` |
| `prevent_mix_session_privilege_escalation()` | **NO** | **NO** | **NO** | `{postgres=X, service_role=X}` |
| `prevent_premium_entitlement_privilege_escalation()` | **NO** | **NO** | **NO** | `{postgres=X, service_role=X}` |
| `prevent_render_job_privilege_escalation()` | **NO** | **NO** | **NO** | `{postgres=X, service_role=X}` |

---

## SECURITY DEFINER

| Status | Evidence |
|--------|----------|
| **unchanged** | All four remain `prosecdef = true` |

---

## search_path

| Status | Evidence |
|--------|----------|
| **unchanged** | All four remain `search_path=public` |

---

## Trigger Integrity

| Status | Evidence |
|--------|----------|
| **PASS** | All four triggers still present/enabled |

| Trigger | Table | Function |
|---------|-------|----------|
| `audio_artifacts_prevent_privilege_escalation` | `audio_artifacts` | `prevent_audio_artifact_privilege_escalation` |
| `mix_sessions_prevent_privilege_escalation` | `mix_sessions` | `prevent_mix_session_privilege_escalation` |
| `premium_entitlements_prevent_privilege_escalation` | `premium_entitlements` | `prevent_premium_entitlement_privilege_escalation` |
| `render_jobs_prevent_privilege_escalation` | `render_jobs` | `prevent_render_job_privilege_escalation` |

---

## DEF-02 Regression

| Function | anon | authenticated | proacl | Status |
|----------|:----:|:-------------:|--------|--------|
| `is_admin()` | NO | YES | `{postgres=X, authenticated=X, service_role=X}` | **UNCHANGED** |
| `is_moderator()` | NO | YES | same | **UNCHANGED** |
| `is_staff()` | NO | YES | same | **UNCHANGED** |

---

## Security Advisor

| Lint | Status |
|------|--------|
| `anon_security_definer_function_executable` (DEF-01 four) | **WARN CLEARED** — lint absent post-apply |
| `authenticated_security_definer_function_executable` for DEF-01 four | **WARN CLEARED** — only DEF-02 `is_*` remain (count **3**, intentional) |
| `auth_leaked_password_protection` | Still WARN — **out of scope** (P1-A accepted risk) |
| `rls_enabled_no_policy` INFO | Unrelated · unchanged |

**DEF-01 Advisor result: WARN CLEARED** (for the four E3 prevent_* functions).

---

## Tests

| Check | Result |
|-------|--------|
| Vitest FAR-01 suite | **PASS** 141/141 |
| Typecheck | **PASS** |
| Live ACL / triggers / DEF-02 | **PASS** |

---

## Safety

- unexpected DB mutations = **0** (only approved REVOKE migration)
- Storage mutations = **0**
- Auth mutations = **0**
- RLS mutations = **0**
- service-role = used only via documented Supabase MCP `apply_migration` mechanism for this Owner GO
- Commit = **NO**
- Push = **NO**
- Deploy = **NO**

---

## Final Classification

**DEF-01 PRODUCTION APPLY = PASS**

**DEF-01 PRODUCTION VERIFICATION = PASS**
