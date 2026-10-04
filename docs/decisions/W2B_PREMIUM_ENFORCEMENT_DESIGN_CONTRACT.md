# W2-B Premium Enforcement — Design Contract

**Status:** DESIGN CONTRACT READY · Implementation COMPLETE · Owner Review PASS WITH FINDINGS
**Implementation:** COMPLETE · NOT PRODUCTION VERIFIED · commit/deploy/fixtures NOT DONE
**Date:** 2026-10-04
**Owner:** Prezes Dawid
**Gate:** W2-B DOCUMENTATION RECONCILE (post Owner Implementation Review)
**Evidence:** [CREATOR_PROGRESS_W2B_IMPLEMENTATION.md](../audits/CREATOR_PROGRESS_W2B_IMPLEMENTATION.md)

**Baseline:**

| Plane | Value |
|-------|--------|
| W2-A code | `6ee3255` — CLOSED / PRODUCTION VERIFIED WITH FINDINGS |
| W2-A docs closeout | `3cd4fcf` |
| W2-B audit | [CREATOR_PROGRESS_W2B_AUDIT.md](../audits/CREATOR_PROGRESS_W2B_AUDIT.md) — PASS · READY FOR OWNER REVIEW |
| Production app | `6ee3255` |
| Production DB | `20261003221811` / `w2a_premium_tier_foundation` |
| Mutation under this gate | **NONE** |

**Related SSOT (do not supersede without Owner GO):**

- [CREATOR_PROGRESS_PREMIUM_DESIGN_FREEZE_V1.md](./CREATOR_PROGRESS_PREMIUM_DESIGN_FREEZE_V1.md)
- [W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md](./W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md) — historical W2-A foundation; gate names W2-B/W2-D remain historical
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md)

---

## 1. Status

| Plane | State |
|-------|--------|
| W2-A | CLOSED / PRODUCTION VERIFIED WITH FINDINGS |
| W2-B Audit | PASS |
| This Design Contract | **READY** (scope frozen) |
| W2-B Implementation | **COMPLETE** · Owner Review **PASS WITH FINDINGS** · [implementation audit](../audits/CREATOR_PROGRESS_W2B_IMPLEMENTATION.md) |
| P2-1 | **VERIFIED RESOLVED** |
| P2-2 / P2-3 / P2-4 | **OPEN** |
| Commit / push / deploy | **NOT DONE** (separate GOs) |
| Production fixture mutation | **NOT AUTHORIZED** (separate Fixture GO) |
| Production DB / Storage | **UNCHANGED** |

### Gate naming (Owner unification)

```text
W2-B = PREMIUM ENFORCEMENT
```

Downloads tier cutover is **in** W2-B scope under this Owner decision.

Historical Design Contract §16 still lists “W2-D Downloads tier enforcement”. That text is **historical** and is **not rewritten** here. Current Owner scope is unified as **W2-B PREMIUM ENFORCEMENT**.

Axes remain orthogonal:

```text
ROLE ≠ ACCOUNT_LEVEL ≠ CREATOR_RANK ≠ PREMIUM_TIER
```

---

## 2. Owner decisions

| # | Decision | Owner value |
|---|----------|-------------|
| 1 | Download tier cutover | **YES — W2-B** · ANON=2 · FREE=4 · BRONZE=10 · SILVER=25 · GOLD=50 · via product entitlement resolver |
| 2 | P2-1 stale render constants | **YES — W2-B** (design cleanup scope; resolve at Implementation) |
| 3 | Mix/Render regression lock | **YES — W2-B** |
| 4 | Artifact janitor / Gold 90d | **SEPARATE WAVE** · Gold 90d remains **DESIGN ONLY** |
| 5 | Storage quota expansion | **DEFER** |
| 6 | Priority scheduling | **DEFER** |
| 7 | Recording Premium overlay | **OPEN / DEFERRED** · account_level untouched |
| 8 | Billing | **DEFER** · OD-04 OPEN · OD-07 OPEN |
| 9 | Premium UI / Ranks UI | **DEFER** |
| 10 | Admin entitlement fixtures | **YES — CONTROLLED LIVE VERIFICATION design** · mutation requires separate Fixture GO |
| 11 | P2-2 live RLS | **LEAVE OPEN** · not expanded into W2-B solely to close P2-2 |

---

## 3. Scope (W2-B MUST)

### A. Download tier runtime enforcement

Wire beat-download daily limits to the central product entitlement / capability matrix:

| Actor / tier | Daily downloads |
|--------------|-----------------|
| ANON | 2 |
| FREE | 4 |
| BRONZE | 10 |
| SILVER | 25 |
| GOLD | 50 |

Server-authoritative only. No feature-level `if (tier === …)` / `if (premium === true)` for limits.

### B. P2-1 stale render constant cleanup

Eliminate dual-source ambiguity around legacy binary OAD constants (`AUDIO_RENDER_PREMIUM_* = 30` and sibling Premium binary constants) so **one authoritative source** remains for render limits: `PREMIUM_TIER_MATRIX` / `limitsForPremiumTier`.

### C. Regression lock

Server-authoritative tests covering Free/Bronze/Silver/Gold, Free fallbacks, spoof/cross-user rejection, Mix mapping, Render daily/concurrent, Download limits, retry/idempotency semantics, and no Rank / account_level → Premium coupling.

### D. Controlled production fixture **design**

Documented Bronze/Silver/Gold verification fixture strategy. **Creation/cleanup not authorized** by this contract.

---

## 4. Non-scope

W2-B does **not** implement:

- Gold 90d PRODUCTION enablement
- audio-artifacts janitor
- storage quota expansion beyond existing render-artifact quota
- priority scheduling
- recording Premium overlay / account_level changes
- billing / checkout / subscriptions / webhooks
- fake checkout
- public Premium assignment product
- `/premium` / `/ranks` / Premium UI
- STEMS · messaging · comments · voting
- P2-2 live RLS closure as a scope driver
- P2-3 / P2-4 closure via docs alone

---

## 5. Download architecture

### 5.1 Current runtime (CODE evidence — pre-implementation)

| Piece | Location | Behavior today |
|-------|----------|----------------|
| Flat config | `src/config/downloads.ts` | ANON=2 · USER=4 (env-overridable) |
| Reserve | `src/lib/downloads/slots.ts` → `reserveDownloadSlot` | Passes flat limit as `p_daily_limit` |
| AuthZ + flow | `src/lib/beats/audio-access.ts` | AuthZ → reserve → signed URL → finalize |
| Finalize | `finalizeDownload` / RPC `finalize_beat_download` | DOWNLOAD_EVENT only after URL success (OD-17) |
| Release | `releaseDownloadReservation` | Failed/abandon → no DOWNLOAD_EVENT |
| Matrix (unused for slots) | `PREMIUM_TIER_MATRIX.downloadsDaily` | Catalog / resolver only |
| Anon matrix constant | `PREMIUM_ANON_DOWNLOADS_DAILY = 2` | Not wired into slots |

### 5.2 Target architecture

```text
AuthZ (beat access)
  → resolve dailyLimit:
       ANON  → PREMIUM_ANON_DOWNLOADS_DAILY (2)  [or ANONYMOUS_DAILY_DOWNLOAD_LIMIT if kept as alias]
       USER  → resolveProductEntitlement(...).limits.downloadsDaily
               (matrix: FREE 4 / BRONZE 10 / SILVER 25 / GOLD 50)
  → reserve_beat_download_slot(p_daily_limit = dailyLimit)   // atomic usage + concurrency
  → signed URL
  → SUCCESS → finalize_beat_download (DOWNLOAD_EVENT)
  → FAIL    → release reservation (no event)
```

### 5.3 Authorities

| Concern | Authority |
|---------|-----------|
| Quota / daily limit value | Product entitlement → `limits.downloadsDaily` from `PREMIUM_TIER_MATRIX` |
| Authorization to download beat | Existing beat AuthZ (`canRequestBeatAudioAccess` / actor rules) — unchanged |
| Usage counting | Existing RPC: final DOWNLOAD_EVENTs + unexpired reservations in UTC day |
| Concurrency / race | Keep atomic `reserve_beat_download_slot` — do not move limit-only checks into non-atomic app code |
| Retry after failed URL | Release reservation; retry may reserve again; no DOWNLOAD_EVENT until success |
| Duplicate request | Same-day usage includes reservations + finals; slot contract preserved |
| Double consumption | Finalize only after signed URL success; reservation ≠ event |
| IDOR | Server-derived identity only (session userId / anon cookie hash); client must not supply actor identity or limit |
| ADMIN | Remains limit-exempt (existing intentional behavior) |
| Artifact downloads | Separate path — ownership + capability + SUCCEEDED job; **out of beat-slot cutover** unless Owner expands later |

### 5.4 Feature-code rules

**Forbidden in feature / download path:**

```text
if (tier === "GOLD") …
if (tier === "SILVER") …
if (premium === true) …
if (premiumActive) { limit = … }
```

**Required:**

```text
dailyLimit = entitlement.limits.downloadsDaily   // from resolveProductEntitlement / ForAuthContext
// ANON branch uses anon constant only
```

Prefer reusing `resolveProductEntitlementForAuthContext` (currently unused) or a thin server helper that calls the same SSOT — **do not** invent a second entitlement loader.

### 5.5 Env override policy (design)

`DOWNLOAD_LIMIT_USER_DAILY` currently overrides flat USER=4. After cutover:

- **Preferred:** USER limit comes only from matrix; env override either removed or restricted to emergency ops with explicit docs
- ANON may keep `DOWNLOAD_LIMIT_ANON_DAILY` **only if** it cannot raise anon above product policy without Owner — default remains 2
- Implementation GO must pick one env policy and lock it in tests

### 5.6 Download Slots contract preservation

Preserve OD-17 / Phase 1.8A semantics:

1. Reservation is not a DOWNLOAD_EVENT
2. Count = finals + unexpired holds
3. Finalize after URL success only
4. Release on failure
5. UTC day window
6. Server-only RPC grants

W2-B changes **which limit number** is passed into the existing RPC — not the slot lifecycle model.

---

## 6. Render cleanup architecture (P2-1)

### 6.1 Inventory (CODE)

| Symbol | File | Consumers | Runtime create path? |
|--------|------|-----------|----------------------|
| `AUDIO_RENDER_PREMIUM_RENDERS_PER_UTC_DAY = 30` | `src/config/audio-render.ts` | `e3-1-foundation.test.ts` | **NO** — create uses `limitsForPremiumTier` / `premiumTier` |
| `AUDIO_RENDER_CONCURRENT_PREMIUM = 2` | same | e3-1 test | **NO** |
| `AUDIO_ARTIFACT_RETENTION_PREMIUM_SECONDS` | same | e3-1 test | **NO** (snapshot uses matrix) |
| `AUDIO_ARTIFACT_QUOTA_PREMIUM_BYTES` | same | e3-1 test | **NO** (create uses `quotaBytesForTier`) |
| Compat `dailyRenderLimit(premiumActive)` | `render-job-core.ts` | tests / legacy helpers | Create passes `premiumTier` |

### 6.2 Target: ONE AUTHORITATIVE SOURCE

```text
PREMIUM_TIER_MATRIX / limitsForPremiumTier(tier)
  → rendersDaily / rendersConcurrent / artifactRetentionSeconds / artifactQuotaBytes
```

Create path already uses this. W2-B cleanup must:

1. Stop asserting Premium binary = 30 in e3-1 (or retarget tests to matrix SILVER/GOLD values)
2. Remove or deprecate exports of stale `AUDIO_RENDER_PREMIUM_*` / binary Premium retention/quota constants **if** no remaining runtime import
3. Keep FREE OAD constants only if still used as aliases of FREE matrix values — or migrate those imports to matrix too (Implementation chooses minimal-diff safe path)
4. Retain legacy snapshot normalize (`premiumActive` → SILVER) for old jobs
5. **Must not** change live create-path numeric behavior for FREE/BRONZE/SILVER/GOLD matrix values

### 6.3 Behavior-change risk

| Risk | Mitigation |
|------|------------|
| Accidental create-path change | Diff-guard: create still calls `assertUnderDailyCap({ premiumTier })` + matrix |
| Test-only breakage | Update e3-1 expectations to matrix |
| Docs/ops still citing 30 | Living SSOT already records P2-1; close via implementation evidence |

P2-1 is **in W2-B implementation scope**; documentation alone does not close it.

---

## 7. Regression lock

Server-authoritative coverage required for W2-B (unit/contract; live fixture tests under Fixture GO):

| # | Case | Expect |
|---|------|--------|
| 1 | Free / missing entitlement | FREE limits + basic caps |
| 2 | Bronze | downloads 10 · HQ · matrix renders |
| 3 | Silver | downloads 25 · Mix/Master Pro · matrix renders |
| 4 | Gold | downloads 50 · WAV · matrix renders · retention prod 30d (not 90d) |
| 5 | Missing entitlement → Free | YES |
| 6 | Expired entitlement → Free | YES |
| 7 | Client tier/limit/capability spoof | REJECT |
| 8 | Cross-user entitlement row | Ignored / Free for caller |
| 9 | Mix mapping | Basic free; Pro SILVER+ |
| 10 | Render daily limits | Matrix 5/10/20/40 |
| 11 | Render concurrency | Matrix 1/1/2/3 |
| 12 | Download limits | ANON 2 + tier matrix for USER |
| 13 | Retry / idempotency | Download: release+retry no double event; Render: same idempotencyKey no double create charge |
| 14 | No account_level → Premium | Recording still account_level; Premium resolver ignores level for tier |
| 15 | No Rank → Premium | Rank derivation unchanged; no premium from rank |

Existing W2-A / E3 / downloads tests are the baseline; W2-B extends them and flips “cutover deferred” assertions.

---

## 8. Production fixture strategy (DESIGN ONLY)

**This section does not authorize mutation.**

### 8.1 Purpose

Enable controlled live verification of Bronze / Silver / Gold download + capability enforcement when `premium_entitlements` is empty (currently 0 rows).

### 8.2 Shape

| Element | Design |
|---------|--------|
| Users | One controlled test account (or one account with sequential tier swaps) — **not** a real customer |
| Rows | Explicit fixture entitlements: BRONZE, SILVER, GOLD (active + future `expires_at` or null per ops choice) |
| Marking | Distinct `source` / note / email / display name convention e.g. `W2B_FIXTURE` (exact string locked at Fixture GO) |
| Grant path | service_role / admin only — existing security contract |
| Public assignment | Forbidden |
| Billing / checkout | Forbidden |
| Business policy | No change to production pricing or public Premium offer |

### 8.3 Safety

1. Prefer dedicated test user never used by customers
2. Avoid colliding with Dawid production identity unless Owner explicitly chooses and accepts risk
3. Document user UUID + entitlement row IDs in verification evidence
4. Single active entitlement uniqueness preserved (existing unique active index)
5. No Fake checkout UI

### 8.4 Test / cleanup

```text
CREATE (Fixture GO only)
  → verify SELECT/own + capability/download behaviors
  → cleanup DELETE entitlement row(s) [and optional test user if created]
  → verify premium_entitlements fixture rows gone
  → verify no orphan Storage / jobs side effects from verification actions
```

### 8.5 Gates

| Gate | Permission |
|------|------------|
| This Design Contract | Design only |
| W2-B Implementation GO | Code/tests — **still no fixture mutation** unless explicitly included |
| **W2-B PRODUCTION VERIFICATION / FIXTURE GO** | Required before any INSERT/UPDATE/DELETE of fixture entitlements |

---

## 9. Security model

| Rule | Contract |
|------|----------|
| Axes | RANK ≠ PREMIUM ≠ ACCOUNT_LEVEL ≠ ROLE |
| Client | Cannot set tier, quota, capabilities, entitlement, or download limit |
| `premium_entitlements` | USER SELECT own only · no authenticated DML · service_role / trusted server mutation |
| Download identity | Server-derived only |
| Spoof rejection | Extend/keep `rejectClientChosenPremiumClaims` / Mix sanitize patterns |

P2-2 live RLS exercise remains **OPEN** and is **not** a W2-B exit criterion.

---

## 10. Account delete compatibility

ACCOUNT/PROFILE-01 unchanged.

| Item | Design check |
|------|--------------|
| FK | `premium_entitlements.user_id` ON DELETE RESTRICT |
| Orchestrator | Must delete entitlement row(s) before Auth/profile delete (existing step `premium`) |
| W2-B | Must not break that order; no redesign of delete flow |
| Delete E2E | Not required for this Design Contract |

---

## 11. P2 treatment

| ID | Status under W2-B contract |
|----|----------------------------|
| **P2-1** | **VERIFIED RESOLVED** — Owner Implementation Review (binary Premium=30 render SSOT removed; matrix authoritative) |
| **P2-2** | **OPEN** — live RLS/IDOR exercise not performed |
| **P2-3** | **OPEN** — manual migration idempotency not verified |
| **P2-4** | **OPEN** — known MCP apply-time version drift (`20261003221811` ≠ local `20261003230000`); not schema failure |

---

## 12. Deferred waves

| Wave / item | Status |
|-------------|--------|
| Artifact janitor + Gold 90d PRODUCTION | SEPARATE (historical label W2-F) |
| Recording Premium overlay | OPEN / DEFERRED (historical W2-E) |
| Billing / checkout | DEFER · OD-04/07 OPEN (historical W2-G) |
| Premium / Ranks UI | DEFER (historical W2-H) |
| Priority scheduling | DEFER |
| Storage quota expansion | DEFER |
| P2-2 live RLS campaign | OPEN / separate hardening |

---

## 13. Dependencies

| Dependency | Notes |
|------------|--------|
| W2-A resolver + matrix | Must remain SSOT |
| Download RPCs accept `p_daily_limit` | Cutover passes tier-derived limit |
| Admin grant path | Needed for Fixture GO |
| Worker / Contabo | Unchanged; priority still unused |
| No billing | Fixtures are ops grants only |

---

## 14. Risks

| Level | Risk |
|-------|------|
| P1 | Dual entitlement SSOT if download path invents a parallel loader |
| P1 | Client-supplied `p_daily_limit` / tier |
| P1 | Fixture mistaken for real Premium customer grant |
| P2 | Env `DOWNLOAD_LIMIT_USER_DAILY` fighting matrix |
| P2 | P2-1 cleanup accidentally changing create-path numbers |
| P2 | Scope creep into janitor / Gold 90d / UI / billing |
| INFO | Historical W2-D naming in foundation contract |

---

## 15. Implementation sequence (proposal — not authorization)

```text
W2-B.1  Download enforcement foundation
        → limit selection from resolveProductEntitlement
        → preserve slots/OD-17
        → unit/contract tests for ANON + FREE/BRONZE/SILVER/GOLD

W2-B.2  P2-1 render constant cleanup
        → one authoritative matrix source
        → update/remove stale binary Premium constants + e3-1 assertions
        → no intentional create-path behavior change

W2-B.3  Regression lock expansion
        → cases §7 (server-authoritative)

W2-B.4  Production verification with controlled fixtures
        → requires separate FIXTURE / PRODUCTION VERIFICATION GO
        → create → exercise → cleanup → evidence
```

Each mutative stage requires its own explicit Owner Implementation / Fixture GO.

---

## 16. Required Owner GO gates

```text
1. OWNER REVIEW OF THIS DESIGN CONTRACT          ← current next gate
2. OWNER GO — W2-B IMPLEMENTATION                ← code/tests (B.1–B.3)
3. OWNER GO — W2-B COMMIT/PUSH (code)            ← if implementation lands
4. OWNER GO — PRODUCTION DEPLOY (if needed)      ← app change for download cutover
5. OWNER GO — W2-B PRODUCTION VERIFICATION /
              FIXTURE GO                         ← fixture mutation + live verify
6. OWNER GO — W2-B CLOSEOUT DOCS                 ← after verification
```

```text
This Design Contract DOES NOT authorize:
- application code changes
- database migrations
- SQL mutations
- fixture creation/deletion
- production deploy
- Storage / Auth mutation
- commit/push of application code

W2-B implementation may proceed ONLY after a separate, explicit:
  OWNER GO — W2-B IMPLEMENTATION
```

---

STATUS: **DESIGN CONTRACT READY** (scope frozen)
IMPLEMENTATION: **COMPLETE** · OWNER REVIEW **PASS WITH FINDINGS**
P2-1: **VERIFIED RESOLVED**
FIXTURES: **NOT CREATED**
GOLD 90D: **DESIGN ONLY**
P2-2 / P2-3 / P2-4: **OPEN**
NEXT GATE: **W2-B DOCUMENTATION COMMIT/PUSH**
