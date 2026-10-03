# RCA — FAR-01 BACKFILL GO BLOCKERS (B-01…B-05)

**Type:** Root-cause analysis (documentation only)
**Date:** 2026-10-02
**Scope:** Blockers named in `AUDIT_FAR_01_BACKFILL_GO_READINESS.md`
**Does not:** fix · implement · mutate · deploy · commit · re-run readiness audit

```text
HEAD                       = 1751f5c (docs) / feature f6a5b1c
BACKFILL GO                = NO
PRODUCTION MUTATION        = NONE (this RCA)
STORAGE / DB MUTATION      = NONE
BACKFILL / CANARY / RETIRE = NOT EXECUTED
CODE CHANGES               = NONE
EXISTING AUDIT EDITS       = NONE
```

---

## 1. Executive Summary

All five blockers are **real** (not false positives). None is a production bug causing data damage today — LIVE remains default-denied. They block **safe Owner Backfill GO review for LIVE**, for different reasons:

| Blocker | Nature | Bug? |
|---------|--------|------|
| **B-01** | Missing **production inventory** dry-run evidence + missing prod candidate loader | **No** — fixture dry-run works |
| **B-02** | GO is an in-process boolean (C-IMPL-01) | **Security design gap**, not a runtime incident |
| **B-03** | No prod mutator + LIVE path skips re-HEAD (C-IMPL-03) | **Code gap** for future LIVE |
| **B-04** | No DB/Storage candidate loader (C-IMPL-04) | **Code gap** |
| **B-05** | Canary optional, not mandatory (C-IMPL-02) | **Code/ops gap** |

**AUDIT FINDING REQUIRES RECONCILIATION (partial):** B-01 must not be read as “dry-run CLI absent” or “dry-run requires Backfill GO.” Both are false — see §4.

---

## 2. Canonical Baseline

| Item | Value |
|------|--------|
| Feature SHA | `f6a5b1c` |
| Docs HEAD | `1751f5c` |
| Engine path | `src/lib/beats/far01-backfill/` |
| CLI | `scripts/far01-backfill-dry-run.ts` |
| Design | `DESIGN_FAR_01_BACKFILL.md` (OD-BF / AC-BF) |
| Impl audit | `AUDIT_FAR_01_BACKFILL_IMPLEMENTATION.md` · C-IMPL-01…04 |
| Readiness audit | `AUDIT_FAR_01_BACKFILL_GO_READINESS.md` |
| Production closeout | `FAR_01_BACKFILL_PRODUCTION_CLOSEOUT.md` |

---

## 3. Blocker Matrix

| Blocker | Condition | Category | Expected | Actual | Evidence | Root Cause | Required Action | Mutation Required | Owner GO |
|---------|-----------|----------|----------|--------|----------|------------|-----------------|-------------------|----------|
| **B-01** | Prod dry-run missing (OD-BF-05/06/07 preconditions) | **MIXED** (EVIDENCE + OPERATIONAL + CODE via B-04) | Full-candidate dry-run report against prod inventory; zero mutation | Fixture-only dry-run; no prod run artifact | Design §11.3 · OD-BF-05 · closeout PV-06 · CLI fixtures | No prod loader + Owner ops plan not executed | Owner ops plan + read-only loader + execute dry-run | **NO** | Ops auth **YES** · Backfill GO **NO** |
| **B-02** | C-IMPL-01 | **SECURITY** + **CODE** | Owner-attested GO, not free boolean | `backfillGo: boolean` forgeable by caller | `types.ts` · `gates.ts` · impl audit §14 | Auth model is library boolean | Seal GO to Owner control before LIVE runner | **NO** | Mechanism OD **YES** · Backfill GO still separate |
| **B-03** | C-IMPL-03 | **CODE** | Mutator `upsert:false` + re-HEAD sizes after copy | No mutator; LIVE assumes dest exists/size = source | `batch.ts` LIVE branch · grep no upsert | Adapter + post-copy verify not implemented | Implement safe mutator + re-HEAD in LIVE path | **NO** (to build) · **YES** only when LIVE used under GO | Backfill GO **YES** before LIVE use |
| **B-04** | C-IMPL-04 | **CODE** | Candidates from DB/Storage | Caller-supplied snapshots; CLI fixtures | No supabase in package/CLI | Loader never built | Read-only loader from DB + Storage meta | **NO** (read-only) | Ops auth for prod read **YES** |
| **B-05** | C-IMPL-02 | **CODE** + **OPERATIONAL** | Canary mandatory before fleet LIVE | `canaryLimit` optional; `null` = full fleet | `batch.ts` · impl audit §13 | No state machine / required N | Enforce canary or Owner OD unlimited | **NO** | Optional OD if choosing unlimited |

---

## 4. B-01 RCA — Production dry-run missing

### 4.1 What it means

Not “CLI dry-run missing.”
It means: **no dry-run against the real Production candidate set (≈68 legacy USER rows + Storage HEAD meta)** producing an OD-BF-03 report, as required before LIVE.

### 4.2 Source

| Layer | Location |
|-------|----------|
| Design precondition | `DESIGN_FAR_01_BACKFILL.md` §11 — “Dry-run on full candidate set completed with report” before LIVE |
| Soak / sequence | OD-BF-05 · OD-BF-07: baseline → **dry-run** → canary → … |
| Readiness blocker | `AUDIT_FAR_01_BACKFILL_GO_READINESS.md` B-01 |
| Closeout | `FAR_01_BACKFILL_PRODUCTION_CLOSEOUT.md` PV-06 · Next Gate |

### 4.3 Related C-IMPL

**C-IMPL-04** (loader) is a **prerequisite capability** for honest production dry-run. B-01 is primarily the **missing execution/evidence**; capability gap is B-04.

### 4.4 EXPECTED vs ACTUAL

| Aspect | EXPECTED | ACTUAL |
|--------|----------|--------|
| Dry-run mode in engine | Exists · zero mutation | **PASS** — `mode === "DRY_RUN"` never calls mutators (`batch.ts` 174–199; forces `live_mutations_attempted=0`) |
| CLI dry-run without Backfill GO | Allowed | **PASS** — CLI uses `FAR01_DEFAULT_AUTHORIZATION`; refuses `--live` |
| Zero-mutation guarantee | No Storage/DB write | **PASS** for fixture path (unit asserts copy/update calls = 0) |
| Telemetry output | OD-BF-03 fields | **PASS** on fixtures |
| Production inventory input | DB + Storage meta for fleet | **FAIL** — CLI `fixtureCandidates()` only; no Supabase |
| Production dry-run executed | Report on full set | **FAIL** — never executed (by design/ops) |
| Requires Backfill GO? | **NO** | **NO** — correct |
| Requires Owner ops auth for prod read? | Arch/closeout imply yes | **YES** — Arch Review explicitly does not authorize prod dry-run; closeout asks for Owner dry-run ops plan |

### 4.5 Category answers

| Question | Answer |
|----------|--------|
| Category | **MIXED** (EVIDENCE + OPERATIONAL; depends on CODE loader) |
| Requires code change? | **YES** for prod candidate loader (shared with B-04); engine dry-run path itself OK |
| Evidence only? | **Execution** is evidence-only **after** loader exists |
| Owner Decision? | **YES** — authorize Production inventory DRY-RUN ops (read-only). **Not** Backfill GO |
| Production mutation? | **NO** |
| Minimal next step | Owner dry-run ops plan → implement read-only loader → run dry-run → archive report |

### 4.6 Reconciliation

**AUDIT FINDING REQUIRES RECONCILIATION** if B-01 is interpreted as:

- ❌ “No dry-run CLI” — **false** (`scripts/far01-backfill-dry-run.ts` exists)
- ❌ “Dry-run requires Backfill GO” — **false**
- ❌ “Zero-mutation broken” — **false** for `DRY_RUN`

Correct interpretation: **production inventory dry-run evidence + loader absent.**

---

## 5. B-02 RCA — C-IMPL-01 (GO forge / attestation)

### 5.1 Exact requirement (C-IMPL-01)

> Treat `backfillGo` as operator attestation; require future prod runner to bind GO to Owner-controlled secret/config, **not** a free boolean in app code.
> Source: `AUDIT_FAR_01_BACKFILL_IMPLEMENTATION.md` §26.

### 5.2 Source locations

| Item | Path |
|------|------|
| Type | `types.ts` — `backfillGo: boolean` · default `false` |
| Gate | `gates.ts` — `assertLiveExecutionAuthorized` |
| CLI seal (partial) | `scripts/far01-backfill-dry-run.ts` — hard `LIVE_REFUSED` (never sets GO true) |
| Library forge surface | Any caller of `runFar01BackfillBatch({ mode: "LIVE", authorization: { backfillGo: true, operatorApproval: true }, storageMutator, dbMutator })` |
| Prod evidence | Closeout: in-process forge on prod runtime **NOT VERIFIED** |

### 5.3 Evidence

| Layer | Result |
|-------|--------|
| Implementation | Default deny **PASS**; forgeable boolean **FAIL** vs C-IMPL-01 |
| Tests | Default deny tested; forge-with-true + mutators **allowed by design** (test “LIVE without mutators fails closed” sets `backfillGo: true`) |
| Production | **NOT VERIFIED** (no safe live probe) |

**Status:** **PARTIAL**

### 5.4 Root cause

Authorization model intentionally uses an in-process struct for library purity. That satisfies “default deny” but **does not** satisfy “Owner-controlled GO token.” C-IMPL-01 named this gap; readiness elevated it to B-02 for LIVE GO review.

### 5.5 Category answers

| Question | Answer |
|----------|--------|
| Category | **SECURITY** + **CODE** |
| Requires code change? | **YES** (prod runner attestation binding) — or Owner-accepted compensating control documented |
| Evidence only? | **NO** (also design/security). Prod forge probe remains evidence gap |
| Owner Decision? | **YES** — choose attestation mechanism / accept residual risk |
| Production mutation? | **NO** |
| Minimal next step | Owner pick GO binding (env sealed secret / signed config / out-of-band attestation) → implement in **future** prod LIVE runner only |

---

## 6. B-03 RCA — C-IMPL-03 (mutator upsert:false + re-HEAD)

### 6.1 Exact requirement (C-IMPL-03)

> Production mutator must `upsert: false` / fail if dest exists; **re-HEAD sizes after copy**.
> Source: impl audit §26.

### 6.2 Source locations

| Item | Path |
|------|------|
| Mutator interface | `batch.ts` — `Far01StorageMutator.copyObject` · `Far01DbMutator.updateObjectKeyOptimistic` |
| Default adapters | `denyMutatingAdapters()` — throw only |
| LIVE post-copy | `batch.ts` ~209–217 — **hardcodes** `destinationExists: true` and `destinationSize: candidate.sourceMeta.size` |
| upsert in package | **ABSENT** (grep) — contract deferred to future adapter |

### 6.3 EXPECTED vs ACTUAL

| EXPECTED | ACTUAL |
|----------|--------|
| Storage copy refuses overwrite (`upsert: false` / exists-check) | **No production mutator** |
| After copy, HEAD dest + compare sizes | LIVE path **skips HEAD**; trusts source size / assumes dest exists |
| Fail closed on dest conflict at mutator | Preflight handles pre-existing dest; post-copy conflict not re-checked via Storage |

**Status:** **FAIL**

### 6.4 Root cause

Implementation GO scope delivered library + fixture CLI. Production adapters and post-copy Storage verification were explicitly deferred conditions (F-03 / C-IMPL-03). Not an audit false positive.

### 6.5 Category answers

| Question | Answer |
|----------|--------|
| Category | **CODE** |
| Requires code change? | **YES** |
| Evidence only? | **NO** |
| Owner Decision? | **NO** to write code · **YES** Backfill GO before LIVE use |
| Production mutation? | **NO** to implement · LIVE use later = mutation under GO |
| Minimal next step | Design/implement Storage mutator (`upsert: false`) + post-copy HEAD wiring in LIVE branch (still behind GO) |

---

## 7. B-04 RCA — C-IMPL-04 (candidate loader)

### 7.1 Exact requirement (C-IMPL-04)

> Production candidate loader must read from DB/Storage — **never trust free-form operator paths**.
> Source: impl audit §26.

### 7.2 Source locations

| Item | Path |
|------|------|
| Candidate type | `batch.ts` — `Far01BackfillCandidate` (caller-supplied) |
| CLI | `scripts/far01-backfill-dry-run.ts` — `fixtureCandidates()` hard-coded UUIDs |
| Mapping | Uses snapshot fields as truth once supplied |
| Supabase / SQL loader | **None** under `far01-backfill/` or dry-run script |

### 7.3 EXPECTED vs ACTUAL

| EXPECTED | ACTUAL |
|----------|--------|
| Loader queries `beat_audio_assets` ⋈ `beats` + Storage meta | Operator/tests pass arrays |
| Paths derived from DB rows | Free-form path in snapshot possible if hostile caller |
| Orphans/platform excluded by query | Not enforced by loader (none exists) |

**Status:** **FAIL**

### 7.4 Root cause

By design of Implementation GO: inject snapshots for testability; prod loader deferred. Blocks both honest prod dry-run (B-01) and safe LIVE.

### 7.5 Category answers

| Question | Answer |
|----------|--------|
| Category | **CODE** |
| Requires code change? | **YES** |
| Evidence only? | **NO** |
| Owner Decision? | Ops auth to point loader at Production (read) **YES** · Backfill GO **NO** |
| Production mutation? | **NO** (read-only loader) |
| Minimal next step | Implement read-only loader (DB identity + Storage HEAD/list meta) feeding `Far01BackfillCandidate[]` |

---

## 8. B-05 RCA — C-IMPL-02 (canary mandatory)

### 8.1 Exact requirement (C-IMPL-02)

> Enforce canary as mandatory step before fleet LIVE (or Owner explicitly sets unlimited with recorded OD).
> Source: impl audit §26. Aligns OD-BF-07.

### 8.2 Source locations

| Item | Path |
|------|------|
| Option | `batch.ts` — `canaryLimit?: number \| null` |
| Behavior | Only when `canaryLimit != null`; else all MIGRATE-eligible proceed |
| Test | `canary limit gates fleet` — proves optional limit works |
| Design | OD-BF-07 sequence DRY-RUN → CANARY → VERIFY → APPROVAL → FLEET |

### 8.3 EXPECTED vs ACTUAL

| EXPECTED | ACTUAL |
|----------|--------|
| Cannot fleet LIVE without prior canary (or Owner OD unlimited) | Single LIVE call with `canaryLimit: null` migrates all eligible once GO + mutators present |
| Sequence enforced | **Not** a state machine — process-only |

**Status:** **FAIL** (vs mandatory) · **PARTIAL** (limit feature exists)

### 8.4 Root cause

Canary implemented as optional throttle, not gate. Matches impl audit “PARTIAL vs Design sequence.”

### 8.5 Category answers

| Question | Answer |
|----------|--------|
| Category | **CODE** + **OPERATIONAL** |
| Requires code change? | **YES** to enforce · **OR** Owner OD documenting unlimited |
| Evidence only? | **NO** |
| Owner Decision? | **YES** if choosing unlimited; else code enforce |
| Production mutation? | **NO** |
| Minimal next step | Owner: set canary N + require code enforcement **or** record OD “unlimited allowed” |

---

## 9. C-IMPL-01…04 Reconciliation

| ID | Exact requirement | Source | Impl evidence | Test evidence | Prod evidence | Status | Root cause | Required action | Mutation | Owner GO |
|----|-------------------|--------|---------------|---------------|---------------|--------|------------|-----------------|----------|----------|
| **C-IMPL-01** | GO ≠ free boolean; Owner-controlled attestation | Impl audit §26 | Default deny + boolean type | Deny PASS; forge allowed | Forge **NOT VERIFIED** | **PARTIAL** | Library auth model | Seal prod runner | NO | Mechanism OD YES |
| **C-IMPL-02** | Canary mandatory before fleet (or OD unlimited) | Impl audit §26 · OD-BF-07 | Optional `canaryLimit` | Limit works when set | Canary not executed | **FAIL** | No enforcement | Enforce or OD | NO | Optional |
| **C-IMPL-03** | Mutator upsert:false + re-HEAD | Impl audit §26 | No mutator; LIVE skips HEAD | N/A prod mutator | N/A | **FAIL** | Deferred adapters | Implement mutator + HEAD | NO to build | Backfill GO before LIVE |
| **C-IMPL-04** | Candidates from DB/Storage | Impl audit §26 | No loader | Fixtures only | No prod dry-run | **FAIL** | Deferred loader | Implement read-only loader | NO | Ops auth for prod read |

**No AUDIT FINDING REQUIRES RECONCILIATION that any C-IMPL is already PASS.** All four remain open as originally scoped.

---

## 10. OD-BF-01…08 Traceability

| OD | Relation to blockers |
|----|----------------------|
| OD-BF-01 | Not a B-0x root cause — quarantine implemented |
| OD-BF-02 | Not a B-0x — UNKNOWN path implemented; Owner acceptance separate |
| OD-BF-03 | Telemetry schema OK; **B-01** lacks prod artifact |
| OD-BF-04 | Rollback plan OK; not B-0x |
| OD-BF-05 | **B-01** — dry-run step missing in soak sequence |
| OD-BF-06 | Operator model partial; dry-run step unfinished (**B-01**) |
| OD-BF-07 | **B-05** — canary not mandatory; **B-01** — dry-run predecessor missing |
| OD-BF-08 | Gate exists; **B-02** concerns attestation quality of GO flag |

---

## 11. AC-BF-01…17 Traceability

| AC | Status vs blockers | Notes |
|----|--------------------|-------|
| AC-BF-01…04, 09, 11–12, 14, 17 | Largely covered by unit tests | Not B-0x drivers |
| AC-BF-05…06, 10, 13 | LIVE/remote | Blocked until mutators + GO |
| AC-BF-07…08 | Sort/idempotency unit | OK |
| **AC-BF-15** Dry-run mutates nothing | **PASS** fixtures · **NOT VERIFIED** on Production inventory | Ties to **B-01** |
| **AC-BF-16** Orphans/platform untouched | Needs prod dry-run/LIVE evidence | Ties to **B-01**/loader |

---

## 12. Implementation Assessment

| Capability | Verdict |
|------------|---------|
| Mapping / preflight / quarantine | Fit |
| Fixture dry-run + telemetry | Fit |
| Default deny LIVE | Fit |
| Prod loader | **Missing** (B-04) |
| Prod mutators + re-HEAD | **Missing** (B-03) |
| Canary mandatory | **Missing** (B-05) |
| GO attestation | **Weak** (B-02) |
| Prod dry-run report | **Missing** (B-01) |

Engine is fit for **gated tooling**. Not fit for **Backfill GO LIVE review** until B-01…B-05 addressed or Owner-accepted with recorded residuals.

---

## 13. Security Assessment

| Topic | Verdict |
|-------|---------|
| Client object_key authority | Rejected in mapping / AuthZ helpers |
| Public HTTP backfill | Absent |
| Default deny | Strong for accidental LIVE |
| Privileged caller forge GO + inject mutators | **Residual risk** = B-02 |
| Hostile mutator overwrite | **Residual risk** = B-03 |
| Hostile free-form candidate paths | **Residual risk** = B-04 |

---

## 14. Production Dry-Run Assessment

| Question | Answer |
|----------|--------|
| Does CLI have real dry-run? | **YES** — fixture dry-run |
| Zero-mutation guarantee? | **YES** in `DRY_RUN` mode (code + unit) |
| Works without Backfill GO? | **YES** |
| What data does it generate? | Batch summary JSON: counts, per-asset OD-BF-03 fields, `live_mutations_attempted=0` |
| Can run without Storage/DB mutation? | **YES** |
| Design requires production dry-run before LIVE? | **YES** (full candidate set report) |
| Requires Backfill GO? | **NO** |
| Requires separate Owner ops authorization? | **YES** (Arch/closeout) — read-only prod access plan |
| Runnable against Production today? | **NO** without loader (B-04) |

---

## 15. Evidence Gaps

1. No Production inventory dry-run artifact.
2. In-process GO forge on prod runtime **NOT VERIFIED**.
3. No runtime proof of optimistic lock / upsert:false / re-HEAD (mutators absent).
4. AC-BF-15/16 on Production inventory **NOT VERIFIED**.
5. Canary never executed (expected; not a bug).

These are **evidence / capability gaps**, not incidents of data mutation.

---

## 16. Required Changes

| Priority | Change | Addresses | Mutation? |
|----------|--------|-----------|-----------|
| P0 | Read-only Production candidate loader (DB + Storage meta) | B-04 · enables B-01 | NO |
| P0 | Owner-authorized Production inventory dry-run + archived report | B-01 | NO |
| P1 | GO attestation binding for future LIVE runner | B-02 | NO |
| P1 | Enforce `canaryLimit` required (or Owner OD unlimited) | B-05 | NO |
| P2 | Storage mutator `upsert: false` + LIVE re-HEAD after copy | B-03 | NO until LIVE under GO |

**Do not implement in this RCA session.**

---

## 17. Required Owner Decisions

1. Authorize **Production inventory DRY-RUN ops plan** (read-only) — **not** Backfill GO.
2. Choose **C-IMPL-01** attestation mechanism (or explicit residual acceptance).
3. Set **canary N** and whether C-IMPL-02 is code-enforced or OD-unlimited.
4. Accept size-only UNKNOWN fleet narrative (OD-BF-02 / C-01) — carries from design; not a B-0x but still required before LIVE.
5. Disposition of quarantine asset `000d406d-…` — not B-0x; remains OD-BF-01.
6. **Do not** grant OD-BF-08 Backfill GO until B-01…B-05 closed or formally accepted.

---

## 18. Recommended Next Gate

```text
NEXT GATE = Owner Production inventory DRY-RUN ops authorization
            + C-IMPL-04 read-only loader implementation (separate Implementation slice)
THEN      = Execute Production dry-run · archive OD-BF-03 report (still Backfill GO = NO)
THEN      = Address C-IMPL-01 / 02 / 03 before LIVE runner wiring
THEN      = Separate OD-BF-08 BACKFILL GO review
THEN      = OD-BF-07 CANARY → VERIFY → APPROVAL → FLEET
RETIREMENT GO = NO throughout
```

---

## Repository safety (this RCA)

| Check | Result |
|-------|--------|
| Only new file | `docs/audits/RCA_FAR_01_BACKFILL_GO_BLOCKERS.md` |
| Existing audits modified | **NONE** |
| Code modified | **NONE** |
| Commit / Push / Deploy | **NONE** |
| Backfill / canary / dry-run executed | **NONE** |
| Storage / DB mutation | **NONE** |

---

**RCA COMPLETE**
**Blockers verified against code: ALL FIVE REAL**
**Backfill GO: NO**
