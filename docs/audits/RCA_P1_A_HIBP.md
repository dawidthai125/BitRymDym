# RCA — P1-A HIBP

**Type:** READ-ONLY RCA / resolution-path audit
**Date:** 2026-10-03
**Finding:** P1-A — HIBP / Leaked Password Protection
**Project:** `rzzxrgcdogkybkiidqgw` (`https://rzzxrgcdogkybkiidqgw.supabase.co`)
**Related:** `docs/audits/G_P1A_HIBP_OWNER_ACTION_PLAN.md` · `docs/audits/AUDIT_P0_P1_CURRENT_STATE.md`

```text
P1-A HIBP RCA              = NEEDS OWNER DECISION
Auth mutations             = 0
DB mutations               = 0
Storage mutations          = 0
Production changes         = 0
service-role mutation      = NO
Commit / Push / Deploy     = NO
```

---

## 1. Finding

**P1-A** — Supabase Auth **HaveIBeenPwned (HIBP) / Leaked Password Protection** is disabled on the production project, producing a Security Advisor WARN and remaining the only verified living **ACTIVE P1**.

---

## 2. Current Status

**BLOCKED**

| Claim | Source | Verified this RCA |
|-------|--------|-------------------|
| P1-A = BLOCKED · Owner Dashboard action required | `PROJECT_STATE.md` · `MASTER_HANDOFF.md` · Wave G plan | **YES** (docs) |
| Security = GREEN WITH WARNINGS · MEDIUM residual includes HIBP | Living SSOT | **YES** (docs) |
| Live Advisor: `auth_leaked_password_protection` WARN — “Leaked Password Protection Disabled” | Supabase MCP `get_advisors` security · 2026-10-03 | **YES** (live) |
| Feature is Auth platform setting, not application code | Wave G plan · Supabase password-security docs | **YES** |
| Cursor/agent must not mutate Auth/ENV/Supabase config for Wave G | Wave G · NEXT_WAVE Owner Decisions | **YES** (policy) |
| Leaked password protection available on **Pro Plan and above** | Official Supabase docs + pricing | **YES** (platform docs) |
| Current Supabase org/project billing plan (Free vs Pro/Team) | Repo / MCP | **NOT VERIFIED** |

---

## 3. Evidence

### 3.1 Living / audit evidence (repo)

| Source | Statement |
|--------|-----------|
| `docs/PROJECT_STATE.md` | P1-A HIBP **BLOCKED** — Owner Dashboard action required |
| `docs/MASTER_HANDOFF.md` §5.1 / ACTIVE | P1-A BLOCKED · Advisor WARN until enabled · **not implemented** |
| `docs/audits/G_P1A_HIBP_OWNER_ACTION_PLAN.md` | Enable via Dashboard only · Cursor mutations **FORBIDDEN** · G-AC-01/02 |
| `docs/audits/NEXT_WAVE_OWNER_DECISIONS_2026-10-02.md` | P1-A = **OWNER ACTION** · Dashboard only |
| `docs/audits/AUDIT_P0_P1_CURRENT_STATE.md` | Sole ACTIVE P1; live Advisor confirmed WARN |
| `docs/CHANGELOG.md` (P1 closeout continuity) | P1-B/C CLOSED · P1-A remains BLOCKED |

### 3.2 Live Security Advisor (this RCA)

- Lint name: `auth_leaked_password_protection`
- Level: **WARN**
- Title: **Leaked Password Protection Disabled**
- Detail: Supabase Auth can check HaveIBeenPwned.org; feature currently disabled
- Remediation (Advisor): https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

### 3.3 Official platform docs (external)

| Claim | Source |
|-------|--------|
| HIBP integration rejects known-leaked passwords | https://supabase.com/docs/guides/auth/password-security |
| **“Leaked password protection is available on the Pro Plan and above.”** | Same page (Note) |
| Pricing matrix: Leaked password protection = **Not included** on Free · **Included** on Pro/Team/Enterprise | https://supabase.com/pricing |
| Dashboard toggle gated by entitlement (`password_hibp` / paid entitlement) | Supabase platform PRs documenting Free toggle disabled |

### 3.4 What is absent from repo evidence

| Gap | Status |
|-----|--------|
| Screenshot / export of Auth → Passwords UI showing toggle state | **NOT VERIFIED** |
| Documented Supabase billing plan for `rzzxrgcdogkybkiidqgw` | **NOT VERIFIED** |
| API/MCP path to enable HIBP from this agent | **NONE used** (and forbidden by Owner locks) |
| Application code that can enable HIBP | **NONE** (Auth GoTrue setting) |

---

## 4. Root Cause

P1-A remains open because **production Auth has leaked-password protection disabled**, and closing it is **outside the application repository**.

Contributing causes (layered):

1. **Configuration gap (confirmed):** Security Advisor still reports the Auth feature disabled (live WARN).
2. **Owner action required (confirmed by policy + living SSOT):** Wave G and Owner Decisions require Owner Dashboard enablement; Cursor must not change Auth config.
3. **Platform entitlement (documented by Supabase; project plan NOT VERIFIED):** Official docs state HIBP is available on **Pro Plan and above**. If the org/project is Free, the Dashboard toggle is unavailable / non-functional until entitlement exists — living Wave G plan did **not** record a plan-tier check.
4. **No code path (confirmed):** There is no BitRymDym app/migration/ENV switch that enables HIBP.

**Advisor WARN classification:** combination of:

- **Real active security finding** (Auth feature off → known residual MEDIUM),
- **Configuration gap** (not enabled),
- **Owner action required** (ops policy),
- and **possibly** a **platform plan limitation** if project is Free (**NOT VERIFIED** for this project).

---

## 5. Why Current Implementation Cannot Close It

| Approach | Why it cannot close P1-A |
|----------|--------------------------|
| Application code change | HIBP is a Supabase Auth server setting, not app logic |
| SQL / RLS / migrations | Does not enable Auth password-security features |
| ENV / Vercel vars | No documented env flag for HIBP in this project |
| Cursor / MCP mutation of Auth | Explicitly **forbidden** by Wave G / Owner locks; this RCA does not mutate |
| Closing docs without Advisor clear | Would falsify CLOSED; Advisor still WARNs |
| “Accept residual” without Owner | Does not clear Advisor WARN; would be a **severity/acceptance** decision, not technical enablement |

Existing `G_P1A_HIBP_OWNER_ACTION_PLAN.md` correctly forbids code implementation, but assumes Dashboard enable is sufficient. That assumption is **complete only if** the project already has Pro+ / `password_hibp` entitlement — **project plan = NOT VERIFIED**.

---

## 6. Resolution Options

Do **not** select an option for the Owner.

| Option | Requires Code | Requires Dashboard | Requires Plan Change | Risk | Status |
|--------|:-------------:|:------------------:|:--------------------:|------|--------|
| **A.** Owner enables “Prevent use of leaked passwords” in Supabase Dashboard (Auth / Passwords / Email provider) **if entitlement already present** | NO | YES | NO (if already Pro+) | LOW–MED signup friction for breached passwords (intended) | **READY IF plan/entitlement allows** · plan **NOT VERIFIED** |
| **B.** Owner upgrades org/project to **Pro (or higher)** / obtains `password_hibp` entitlement, **then** enables Dashboard toggle | NO | YES | **YES** (if currently Free) | Billing cost · same Auth friction as A | **CONTINGENT** on plan verification |
| **C.** Owner accepts MEDIUM residual, keeps feature disabled, downgrades/closes P1-A as **ACCEPTED RISK** (docs only after decision) | NO | NO (for Auth) | NO | Advisor WARN remains; residual password stuffing risk unchanged | **POLICY ONLY** — does not clear Advisor |
| **D.** Attempt enable via code / ENV / SQL / agent Auth API | N/A | N/A | N/A | Violates Owner locks · unsupported for this wave | **FORBIDDEN** |
| **E.** Build custom app-side HIBP check | YES | NO | NO | Incomplete vs Auth-native check · dual paths · still leaves Advisor WARN unless Auth enabled | **NOT a close path for P1-A Advisor finding** |

---

## 7. Recommended Technical Path

Evidence-based sequence (no Owner Decision made here):

1. **Owner verifies Supabase billing / entitlement** for project `rzzxrgcdogkybkiidqgw` (Free vs Pro+ / `password_hibp`).
2. If entitlement **missing** → plan/entitlement change is a **prerequisite** before toggle (Option B).
3. If entitlement **present** → Owner enables leaked password protection in Dashboard (Option A) per Wave G checklist.
4. Re-run Security Advisor (read-only) and confirm `auth_leaked_password_protection` is **absent**.
5. Only then update living SSOT: P1-A = CLOSED / VERIFIED (docs GO).

Do **not** attempt code, ENV, RLS, or agent Auth mutations.

---

## 8. Owner Decision Required

**OWNER DECISION REQUIRED:**

1. **Verify** whether production project `rzzxrgcdogkybkiidqgw` currently has Supabase **Pro (or higher) / leaked-password entitlement**.
2. **Choose resolution path:**
   - **ENABLE** HIBP (Option A, or B then A if upgrade needed), **or**
   - **ACCEPT RISK** and keep disabled (Option C — Advisor WARN remains).
3. If ENABLE: perform Dashboard enable yourself (Cursor must not mutate Auth).
4. Authorize optional living-docs closeout after Advisor clears.

Agent must **not** make this decision.

---

## 9. Exit Criteria

P1-A may be marked **CLOSED / VERIFIED** only when **all** are true:

| ID | Criterion |
|----|-----------|
| X-01 | Leaked password protection is **enabled** on production Auth for `rzzxrgcdogkybkiidqgw` **OR** Owner has explicitly recorded **ACCEPTED RISK** (Option C) with living-doc update |
| X-02 | If ENABLE path: Security Advisor no longer emits `auth_leaked_password_protection` WARN |
| X-03 | No unauthorized Auth / ENV / RLS / app changes introduced to “force” close |
| X-04 | Living SSOT (`PROJECT_STATE` / `MASTER_HANDOFF`) updated under docs GO to match evidence |

Advisor WARN remaining **and** status CLOSED without Accepted-Risk Owner Decision = **invalid close**.

---

## 10. Verification Plan

| Step | Actor | Action | Pass |
|------|-------|--------|------|
| 1 | Owner | Confirm plan/entitlement in Dashboard billing | Plan recorded |
| 2 | Owner | Enable HIBP (if chosen) · screenshot optional | Toggle ON |
| 3 | Owner or agent (read-only) | `get_advisors` security / Dashboard Advisor | HIBP lint gone |
| 4 | Optional | Smoke: signup/password-change with known-breached password rejected | Behavioral confirm (**optional**) |
| 5 | Docs GO | Update P1-A → CLOSED / VERIFIED | Living SSOT matches |

---

## 11. Explicit Non-Actions

This RCA executed and requires going forward until Owner acts:

- no production mutation
- no auth config change
- no DB change
- no Storage change
- no ENV change
- no deploy
- no commit
- no push

---

## Final Status

**P1-A HIBP RCA = NEEDS OWNER DECISION**

| Item | Value |
|------|-------|
| Why BLOCKED | Auth feature disabled + Owner/ops lock + (possible) plan entitlement |
| Can close without plan change? | **Only if** project already has Pro+ entitlement (**NOT VERIFIED**) · then Dashboard enable suffices |
| If Free plan | Dashboard alone **cannot** close · upgrade/entitlement required first |
| Code close path | **NONE** |

- DB mutations = 0
- Storage mutations = 0
- Auth mutations = 0
- Production changes = 0
- service-role mutation = NO
- Commit = NO
- Push = NO
- Deploy = NO

STOP.
