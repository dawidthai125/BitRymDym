# PLAN — DEF-01 DEFINER HARDENING

**Type:** Technical preparation plan only
**Owner:** Prezes Dawid
**Date:** 2026-10-03
**Finding:** DEF-01
**Parent:** `docs/audits/AUDIT_SECURITY_DEFINER_WARNINGS.md` · `docs/audits/RCA_SECURITY_DEFINER_WARNINGS.md`
**Status:** READY FOR OWNER GO / NO-GO

```text
IMPLEMENTATION                           = NOT AUTHORIZED
MIGRATION                                = NOT CREATED
REVOKE / GRANT                           = NOT EXECUTED
DB mutations                             = 0
DEF-02 (is_admin / is_moderator / is_staff) = DO NOT MODIFY
```

---

## 1. Finding

| Field | Value |
|-------|-------|
| ID | **DEF-01** |
| Status | ACTION REQUIRED |
| Root cause | E3.1 added 4 SECURITY DEFINER trigger functions after P1-B; hardening used `REVOKE … FROM PUBLIC` only; live ACL still grants EXECUTE to **anon** + **authenticated** |
| Security impact | **LOW** — Advisor / PostgREST exposure; no verified privilege escalation; no verified IDOR |
| DEF-02 | `is_admin` / `is_moderator` / `is_staff` = intentional RLS helpers — **out of scope / do not modify** |

**Affected functions (zero-arg trigger signatures):**

1. `public.prevent_audio_artifact_privilege_escalation()`
2. `public.prevent_mix_session_privilege_escalation()`
3. `public.prevent_premium_entitlement_privilege_escalation()`
4. `public.prevent_render_job_privilege_escalation()`

---

## 2. Current ACL Evidence

Live production DB (`rzzxrgcdogkybkiidqgw`) — SELECT verification 2026-10-03:

| Schema | Signature | Owner | SECURITY DEFINER | search_path | result | PUBLIC in ACL | anon EXECUTE | authenticated EXECUTE | service_role | postgres | Other roles in ACL |
|--------|-----------|-------|:----------------:|-------------|--------|:-------------:|:------------:|:---------------------:|:------------:|:--------:|--------------------|
| public | `prevent_audio_artifact_privilege_escalation()` | postgres | YES | `public` | trigger | NO | **YES** | **YES** | YES | YES | none beyond listed |
| public | `prevent_mix_session_privilege_escalation()` | postgres | YES | `public` | trigger | NO | **YES** | **YES** | YES | YES | none |
| public | `prevent_premium_entitlement_privilege_escalation()` | postgres | YES | `public` | trigger | NO | **YES** | **YES** | YES | YES | none |
| public | `prevent_render_job_privilege_escalation()` | postgres | YES | `public` | trigger | NO | **YES** | **YES** | YES | YES | none |

Live `proacl` (all four identical pattern):

```text
{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

| Question | Evidence |
|----------|----------|
| Trigger-only? | **YES** — `RETURNS trigger`; bound to BEFORE INSERT/UPDATE/DELETE triggers |
| PostgREST exposable? | **YES** — Advisor states callable via `/rest/v1/rpc/<name>`; zero-arg functions in `public` with EXECUTE for anon/authenticated are RPC-eligible |
| Need EXECUTE for anon/authenticated? | **NO evidence of need** — no app RPC; triggers execute as table owner/DEFINER context, not via client EXECUTE grant |

---

## 3. Function Usage

| Function | Trigger-only | Trigger(s) | App direct call | PostgREST callable | Need anon/auth EXECUTE |
|----------|:------------:|------------|-----------------|--------------------|------------------------|
| `prevent_audio_artifact_privilege_escalation()` | YES | `audio_artifacts_prevent_privilege_escalation` ON `public.audio_artifacts` BEFORE INSERT OR UPDATE OR DELETE | **NONE** in `src/` | YES (surface) | **NO** |
| `prevent_mix_session_privilege_escalation()` | YES | `mix_sessions_prevent_privilege_escalation` ON `public.mix_sessions` | **NONE** | YES | **NO** |
| `prevent_premium_entitlement_privilege_escalation()` | YES | `premium_entitlements_prevent_privilege_escalation` ON `public.premium_entitlements` | **NONE** | YES | **NO** |
| `prevent_render_job_privilege_escalation()` | YES | `render_jobs_prevent_privilege_escalation` ON `public.render_jobs` | **NONE** | YES | **NO** |

App RPC usage found elsewhere (admin/`service_role` only — **unrelated**): download slots, take claim, beat access grants — **not** these four functions.

**Will revoking anon/authenticated EXECUTE break existing flows?**
**Expected: NO** — same posture as already-hardened P1-B trigger functions (`prevent_beat_*`, `prevent_take_*`, etc.) which retain working triggers with ACL `{postgres, service_role}` only.
**Behavioral RPC deny after revoke:** **NOT VERIFIED** live (no revoke executed this plan); inferred from PostgreSQL + PostgREST grant model.

---

## 4. P1-B Comparison

**Source:** `supabase/migrations/20260928120000_security_p1_definer_grants_and_search_path.sql`

### Pattern applied to trigger-only DEFINER helpers

For each then-existing trigger helper:

```sql
REVOKE EXECUTE ON FUNCTION public.<fn>() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.<fn>() FROM anon;
REVOKE EXECUTE ON FUNCTION public.<fn>() FROM authenticated;
```

**Signatures hardened by P1-B (examples):**

- `public.handle_new_user()`
- `public.prevent_privilege_escalation()`
- `public.prevent_beat_privilege_escalation()`
- `public.prevent_beat_audio_privilege_escalation()`
- `public.prevent_take_privilege_escalation()`

**Explicit non-pattern for RLS helpers (DEF-02 — do not copy for DEF-01):**

```sql
REVOKE … FROM PUBLIC;
REVOKE … FROM anon;
GRANT EXECUTE … TO authenticated;  -- KEEP for RLS
```

### Live effect of P1-B (comparison ACL)

| Function | Live proacl |
|----------|-------------|
| `prevent_beat_privilege_escalation` | `{postgres=X, service_role=X}` |
| `prevent_take_privilege_escalation` | `{postgres=X, service_role=X}` |
| `is_admin` (DEF-02) | `{postgres=X, authenticated=X, service_role=X}` |

### E3.1 incomplete counterpart

`20260928200000_e3_1_audio_foundation.sql` only:

```sql
REVOKE ALL ON FUNCTION public.prevent_*_privilege_escalation() FROM PUBLIC;
```

→ **not** a full P1-B mirror (missing anon + authenticated).

### Conclusion

DEF-01 **should be the direct counterpart** of the P1-B **trigger-only** revoke pattern, applied to the four E3 signatures above — **not** the RLS-helper pattern.

---

## 5. Proposed Minimal Hardening

**Intent:** Grant hygiene only. No business logic, no RLS, no DEF-02, no Auth, no FAR-01.

**Proposed SQL shape (for future Implementation GO — not executed now):**

```sql
-- DEF-01: mirror P1-B trigger-only posture (signatures verified zero-arg)
REVOKE EXECUTE ON FUNCTION public.prevent_audio_artifact_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_audio_artifact_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_audio_artifact_privilege_escalation() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_mix_session_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_mix_session_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_mix_session_privilege_escalation() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_premium_entitlement_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_premium_entitlement_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_premium_entitlement_privilege_escalation() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_render_job_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_render_job_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_render_job_privilege_escalation() FROM authenticated;
```

| Keep | Why |
|------|-----|
| `postgres` EXECUTE | Owner / trigger machinery |
| `service_role` EXECUTE | Present today; harmless for trigger path; consistent with P1-B survivors |
| Trigger definitions | Unchanged |
| Function bodies | Unchanged |
| `SECURITY DEFINER` | Unchanged |
| `search_path = public` | Unchanged |

| Do not | Why |
|--------|-----|
| Touch `is_admin` / `is_moderator` / `is_staff` | DEF-02 intentional RLS |
| REVOKE from `service_role` | Not required for Advisor anon lint; avoid unrelated blast radius |
| DEFINER → INVOKER | Out of minimal scope |
| RLS / policy edits | Out of scope |

**Other grants required?** **NO** — no additional GRANT needed for triggers to continue firing.

---

## 6. Grant/Revoke Matrix

| Function | Role | Current EXECUTE | Proposed after harden |
|----------|------|:---------------:|:---------------------:|
| all four DEF-01 | PUBLIC | absent in ACL (still revoke for hygiene) | absent |
| all four DEF-01 | anon | YES | **NO** |
| all four DEF-01 | authenticated | YES | **NO** |
| all four DEF-01 | service_role | YES | YES (unchanged) |
| all four DEF-01 | postgres | YES | YES (unchanged) |
| `is_admin` / `is_moderator` / `is_staff` | * | unchanged | **UNCHANGED** |

**Target ACL pattern (match P1-B trigger helpers):**

```text
{postgres=X/postgres,service_role=X/postgres}
```

---

## 7. Security Impact

| Item | Assessment |
|------|------------|
| Before | LOW Advisor / PostgREST RPC surface for 4 DEFINER triggers |
| After (if GO) | Removes anon/authenticated EXECUTE → clears related Advisor WARNs for these four |
| Privilege escalation | Still none verified; harden is defense-in-depth |
| Residual Advisor | `authenticated_security_definer_function_executable` may still list **DEF-02** `is_*` (expected / intentional) |

---

## 8. Regression Risk

| Area | Risk | Rationale |
|------|------|-----------|
| Trigger execution | **LOW** | P1-B precedent; triggers do not rely on anon/auth EXECUTE |
| Profile / Auth flows | **NONE expected** | Functions not on auth/profile path |
| Recording / takes | **NONE expected** | Different `prevent_take_*` already hardened |
| Mix sessions | **LOW** | Mutations are service_role-gated by trigger body; client EXECUTE unused |
| Premium entitlements | **LOW** | Same |
| Render jobs | **LOW** | Same |
| Audio artifacts | **LOW** | Same |
| Admin UI | **NONE expected** | No RPC to these names |
| Worker | **LOW** | Uses service_role; EXECUTE retained |
| PostgREST | **LOW intentional** | RPC to these names should fail authorization after revoke |
| RLS | **NONE** | No RLS helper changes |

---

## 9. Required Tests

After future Implementation GO (not now):

| ID | Test |
|----|------|
| T-01 | Live ACL: four functions have **no** anon/authenticated EXECUTE |
| T-02 | Security Advisor: anon DEFINER lint no longer lists these four |
| T-03 | Triggers still present/enabled on the four tables |
| T-04 | Negative: anon/authenticated PostgREST RPC to each name → denied/error (not success) |
| T-05 | Positive smoke: service_role path that mutates (or fails closed as today) for mix/render/artifacts/entitlements still behaves |
| T-06 | Regression: `is_admin` / `is_moderator` / `is_staff` ACL unchanged; staff RLS still works |
| T-07 | Existing FAR-01 / recording suites not required for this grant-only change, but run FAR-01 unit suite if convenient (no prod mutate) |

---

## 10. Production Verification

| Step | Pass criteria |
|------|----------------|
| Apply migration (after Owner GO only) | Success |
| Re-query `proacl` | Match target pattern |
| `get_advisors` security | Four functions absent from anon DEFINER WARN |
| Spot-check worker/admin critical paths | No new failures attributable to revoke |
| Living docs (optional docs GO) | DEF-01 → CLOSED / VERIFIED |

---

## 11. Rollback Strategy

```sql
-- ONLY if Owner authorizes rollback (not part of this plan execution)
GRANT EXECUTE ON FUNCTION public.prevent_audio_artifact_privilege_escalation() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_mix_session_privilege_escalation() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_premium_entitlement_privilege_escalation() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_render_job_privilege_escalation() TO anon, authenticated;
```

Rollback restores Advisor surface; prefer fix-forward unless production incident proven.

---

## 12. Owner Decision

**OWNER GO REQUIRED: YES**

Proposed Owner Decision (choose one — agent does **not** choose):

| Option | Meaning |
|--------|---------|
| **GO** | Implement minimal DEF-01 hardening (REVOKE matrix in §5–§6) under a separate Implementation GO |
| **NO-GO** | Accept residual Advisor warning for the four functions as LOW residual |

---

## 13. Implementation Scope

**If GO (future wave only):**

- One additive migration: REVOKE-only on the four verified zero-arg signatures
- Advisor + ACL verification
- Optional living-doc closeout for DEF-01

**Not in that wave unless separately authorized:** DEF-02, RLS, Auth, FAR-01, business logic, DEFINER→INVOKER.

---

## 14. Explicit Non-Scope

- Creating/applying migration in this plan step
- Any REVOKE/GRANT now
- Changing `is_admin` / `is_moderator` / `is_staff`
- RLS / Auth / Storage / ENV / FAR-01
- Commit / push / deploy

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

**STOP. Awaiting Owner GO or NO-GO.**
