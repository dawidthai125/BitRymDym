# RCA — SECURITY DEFINER Advisor WARNs (DEF-01)

**Type:** READ-ONLY RCA (no fix)
**Date:** 2026-10-03
**Parent audit:** `docs/audits/AUDIT_SECURITY_DEFINER_WARNINGS.md`
**Finding ID:** **DEF-01**

```text
RCA STATUS                         = READY FOR OWNER DECISION
Implementation                     = NOT AUTHORIZED
DB / Grants / Function mutations   = 0
```

---

## 1. Finding

Four E3.1 **SECURITY DEFINER** trigger functions remain executable by **`anon` and `authenticated`** on production, causing live Security Advisor WARNs:

- `anon_security_definer_function_executable` (4)
- `authenticated_security_definer_function_executable` (subset of 7; four are these functions)

Functions:

1. `public.prevent_audio_artifact_privilege_escalation()`
2. `public.prevent_mix_session_privilege_escalation()`
3. `public.prevent_premium_entitlement_privilege_escalation()`
4. `public.prevent_render_job_privilege_escalation()`

---

## 2. Current Status

**ACTIVE SECURITY FINDING — LOW** (grant hygiene / defense-in-depth)

Not CRITICAL/HIGH — no verified privilege-escalation exploit via RPC.

---

## 3. Evidence

| Evidence | Result |
|----------|--------|
| Live Advisor 2026-10-03 | WARNs name the four functions |
| Live `proacl` | `{postgres=X, anon=X, authenticated=X, service_role=X}` |
| Live `search_path` | `search_path=public` on all four |
| Live triggers | Enabled on `audio_artifacts`, `mix_sessions`, `premium_entitlements`, `render_jobs` |
| Migration `20260928200000_e3_1_audio_foundation.sql` | Creates functions + `REVOKE ALL … FROM PUBLIC` only |
| Migration `20260928120000_security_p1_*` (P1-B) | Hardened **older** `prevent_*` with REVOKE from PUBLIC **and** anon **and** authenticated — **did not include** these four (they did not exist yet) |
| Comparison ACL (`prevent_beat_privilege_escalation`) | `{postgres=X, service_role=X}` only |
| App `src/` | No RPC calls to these functions |

---

## 4. Root Cause

**Temporal + incomplete revoke:**

1. P1-B (2026-09-28) correctly revoked client EXECUTE from then-existing trigger DEFINER helpers.
2. E3.1 (later same day) **created four new** DEFINER trigger functions.
3. E3.1 only ran `REVOKE … FROM PUBLIC`.
4. Production ACL still shows **explicit** `anon` and `authenticated` EXECUTE (typical when default privileges / role grants outlive PUBLIC revoke).
5. Security Advisor correctly flags DEFINER + client EXECUTE.

**Not** the root cause: missing `search_path` (already set).
**Not** the root cause: intentional RLS helpers (`is_*` are a separate, intentional authenticated surface — DEF-02).

---

## 5. Why Current Implementation Cannot Close It

| Approach | Why insufficient |
|----------|------------------|
| Docs-only “P1-B CLOSED” | True for P1-B set; does not cover post-P1-B E3 functions |
| REVOKE PUBLIC only (already applied) | Live ACL proves anon/authenticated EXECUTE remain |
| App code change | Grants are DB objects; app cannot revoke |
| Ignoring Advisor | Leaves PostgREST RPC surface |

Closing DEF-01 requires a **future DB grant hardening** (or Owner acceptance of residual WARN).

---

## 6. Security Impact

| Dimension | Assessment |
|-----------|------------|
| Severity | **LOW** |
| Privilege escalation | **Not verified** — functions are trigger guards; RPC invoke is not a useful DML escalate path |
| Data exfil / IDOR / tenant bypass | **Not verified** |
| Advisor / attack-surface hygiene | **YES** — unnecessary anon EXECUTE on DEFINER |
| Production user impact today | **None evidenced** |

---

## 7. Resolution Options

| Option | Requires Code | Requires Migration | Requires Owner GO | Risk | Notes |
|--------|:-------------:|:------------------:|:-----------------:|------|-------|
| **A.** REVOKE EXECUTE from PUBLIC, anon, authenticated on the four functions (mirror P1-B) | NO (SQL grants only) | YES | YES | LOW regression (triggers keep working) | Preferred technical harden |
| **B.** Accept residual Advisor WARN as LOW | NO | NO | YES (acceptance) | Residual surface remains | Valid if Owner prioritizes elsewhere |
| **C.** Change DEFINER → INVOKER | Maybe | YES | YES | Medium — must prove trigger auth context still correct | **Not recommended** without separate design |
| **D.** Revoke authenticated on `is_*` | NO | YES | — | **HIGH** — breaks RLS | **FORBIDDEN** for DEF-01 scope |

---

## 8. Recommended Technical Path

If Owner chooses harden (**A**):

1. Plan / allowlist migration: **REVOKE only** on the four function signatures.
2. No logic / trigger / RLS changes.
3. Apply → re-run Security Advisor → confirm anon DEFINER lint count drops by 4; authenticated lint drops by 4 (3 `is_*` WARNs remain expected).
4. Update living security continuity notes.

If Owner chooses **B**: document acceptance; no migration.

---

## 9. Owner Decision Required

**OWNER DECISION REQUIRED:**

Choose **A (harden REVOKE)** or **B (accept residual LOW WARN)** for DEF-01 E3 `prevent_*` client EXECUTE.

Confirm **DEF-02**: keep `is_admin` / `is_moderator` / `is_staff` authenticated EXECUTE for RLS (**recommended KEEP**).

---

## 10. Exit Criteria (harden path)

| ID | Criterion |
|----|-----------|
| R-01 | Live ACL for four functions has **no** anon/authenticated EXECUTE |
| R-02 | Advisor `anon_security_definer_function_executable` no longer lists these four |
| R-03 | Triggers still enabled; service_role mutation paths still work |
| R-04 | No change to `is_*` grants |

---

## 11. Explicit Non-Actions (this RCA)

- no production mutation
- no grants change
- no function change
- no RLS / Auth / Storage / ENV change
- no deploy / commit / push

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

STOP.
