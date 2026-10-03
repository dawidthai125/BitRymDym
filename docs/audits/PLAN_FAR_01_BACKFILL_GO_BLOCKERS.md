# PLAN — FAR-01 BACKFILL GO BLOCKERS REMEDIATION

**Type:** Implementation / ops plan only (no code, no mutation)
**Date:** 2026-10-02
**Canonical RCA:** [RCA_FAR_01_BACKFILL_GO_BLOCKERS.md](./RCA_FAR_01_BACKFILL_GO_BLOCKERS.md)
**Status:** **PLAN ONLY** · **NOT AUTHORIZED TO IMPLEMENT**

```text
THIS PLAN AUTHORIZES     = NOTHING
IMPLEMENTATION           = NONE (this document)
BACKFILL GO              = NO
RETIREMENT GO            = NO
PRODUCTION DRY-RUN       = NOT AUTHORIZED by this plan alone
STORAGE / DB MUTATION    = FORBIDDEN in plan phase
```

---

## 1. Executive Summary

Close B-02…B-05 (C-IMPL-01…04) and unlock B-01 evidence via a phased, fail-closed sequence. Fixture dry-run and default deny stay. No LIVE, canary, or production dry-run is authorized here.

**Recommended phase order (dependency-safe):**

```text
PHASE A  Security attestation (B-02 / C-IMPL-01)
PHASE C  DB/Storage read-only loader (B-04 / C-IMPL-04)     ← can parallelize with A after OD
PHASE D  Deterministic canary gate (B-05 / C-IMPL-02)
PHASE B  Mutator + re-HEAD (B-03 / C-IMPL-03)               ← after A; never wire without GO seal
PHASE E  Production inventory dry-run (B-01)                ← needs C + Owner dry-run ops auth
PHASE F  Backfill GO review (OD-BF-08)                      ← only after A–E evidence
```

Note: letter labels follow the Owner brief (A attestation, B mutator, C loader…). **Execution order is A → C → D → B → E → F** so the read-only loader lands before mutators and before production dry-run.

---

## 2. Current Blockers

| ID | RCA verdict | Condition | Category |
|----|-------------|-----------|----------|
| **B-01** | REAL · MIXED | Prod inventory dry-run missing | EVIDENCE + OPS + needs loader |
| **B-02** | REAL · SECURITY+CODE | C-IMPL-01 PARTIAL — forgeable boolean | SECURITY + CODE |
| **B-03** | REAL · CODE | C-IMPL-03 FAIL — no mutator / LIVE skips re-HEAD | CODE |
| **B-04** | REAL · CODE | C-IMPL-04 FAIL — no DB/Storage loader | CODE |
| **B-05** | REAL · CODE+OPS | C-IMPL-02 FAIL — `canaryLimit` optional | CODE + OPS |

---

## 3. Scope / Non-Scope

### In scope (plan design only)

- Attestation architecture options for LIVE GO
- Mutator + re-HEAD contracts
- Read-only DB/Storage loader contracts
- Deterministic canary state machine
- Production dry-run ops contract and B-01 dependency chain
- Traceability, tests, evidence, Owner decisions, sequence

### Out of scope / forbidden by this plan

- Any implementation or code edit
- Production dry-run execution
- Storage COPY / MOVE / DELETE
- DB UPDATE / INSERT / DELETE
- Canary LIVE / fleet LIVE / retirement
- ENV / secrets / Supabase / Storage mutation
- Commit / push / deploy
- Inventing canary N or soak duration (remain **OPEN** Owner parameters)
- Granting Backfill GO

---

## 4. B-02 Security Plan (PHASE A) — C-IMPL-01

### 4.1 What is forgeable today

| Surface | Forgeable? | Notes |
|---------|------------|-------|
| `Far01BackfillAuthorization.backfillGo` | **YES** | Any in-process caller may pass `true` |
| `operatorApproval` | **YES** | Same caller-controlled struct |
| Library `runFar01BackfillBatch({ mode: "LIVE", … })` | **YES** if GO flags + mutators injected | Trust is caller honesty |
| CLI `scripts/far01-backfill-dry-run.ts` | **NO** for LIVE | Hard `LIVE_REFUSED`; never sets GO |
| Default `FAR01_DEFAULT_AUTHORIZATION` | Deny | `backfillGo: false` |

### 4.2 Trust boundary

```text
[Owner decision record / sealed ops control]
          ↓  (only place that may assert GO = YES)
[Production LIVE runner entrypoint]   ← TRUST BOUNDARY
          ↓  verified attestation object (not free boolean from app modules)
[far01-backfill library LIVE path]
          ↓
[injected mutators]
```

**Today the trust boundary is inside the library caller** — too low. It must move to an **ops entrypoint** that cannot be satisfied by ordinary application code paths.

### 4.3 Attestation options (do not pick arbitrarily)

| Option | Mechanism | Pros | Cons | Recommendation |
|--------|-----------|------|------|----------------|
| **A1 — Dual sealed env + explicit CLI flag** | LIVE runner requires `FAR01_BACKFILL_GO_TOKEN` matching Owner-issued secret **and** `--i-accept-backfill-go` **and** separate `operatorApproval` | Simple; default deny if env unset; auditable in run logs (token hash only) | Secret in env is forgeable by anyone with prod shell; needs secret rotation / least privilege | **Viable short-term** if shell access is Owner-only |
| **A2 — Signed GO artifact** | Owner signs JSON `{ go: true, batch_scope, expires_at, canary_n, issuer }` with offline key; runner verifies signature + expiry + scope | Strongest non-interactive attestation; boolean alone insufficient | Needs key ceremony + verifier; more engineering | **Preferred for production LIVE** |
| **A3 — Out-of-band break-glass file** | Owner places signed/checksummed file in restricted path; runner reads once | Simple ceremony | File theft = GO; path must be non-app-writable | Acceptable if A2 deferred |
| **A4 — Owner OD “accept boolean risk”** | Keep boolean; document residual | Fast | Leaves C-IMPL-01 open in spirit | **Not recommended** for LIVE |

**Plan requirement:** Owner Decision **OD-ATT-01** selects A1 / A2 / A3 (or explicit residual acceptance of A4). Agent must not invent the choice.

### 4.4 Source of GO truth

| Must be | Must not be |
|---------|-------------|
| Owner-controlled sealed input outside normal app request path | Request body / query / client cookie |
| Evaluated only in LIVE runner entrypoint | Arbitrary library unit test helpers as prod truth |
| Default absent → deny | In-process `backfillGo: true` without sealed input |

Library may still accept a **verified** authorization object produced by the runner after attestation checks. Application modules must **not** construct LIVE auth with a free boolean.

### 4.5 Eliminating free boolean as proof

1. Introduce opaque attestation result type (e.g. `Far01VerifiedLiveGrant`) creatable **only** by runner verifier module.
2. LIVE path requires that type (or branded token), not raw `{ backfillGo: true }`.
3. Keep `FAR01_DEFAULT_AUTHORIZATION` deny for dry-run / library defaults.
4. Unit tests may use a **test-only** factory behind `NODE_ENV=test` / vitest guard — never exported to prod runner.
5. CLI fixture script remains LIVE-refused forever (or only accepts verified grant via separate LIVE CLI — later).

### 4.6 Default deny preservation

- No sealed input → LIVE throws (same as today).
- Expired / wrong scope / bad signature → deny.
- Dry-run never requires grant.
- Missing mutators → deny (existing).

### 4.7 Forge tests (required)

| Test | Expect |
|------|--------|
| Library LIVE with raw `{ backfillGo: true }` without verified grant | **DENY** (after change) |
| Runner without sealed input | **DENY** |
| Runner with wrong token / bad signature | **DENY** |
| Runner with expired grant | **DENY** |
| Dry-run with default auth | **ALLOW** · mutations 0 |
| Test-only factory in production build | **ABSENT** / tree-shaken |

### 4.8 Owner Decision

**REQUIRED:** **OD-ATT-01** — select attestation architecture (A1/A2/A3/A4).
**Still separate:** OD-BF-08 Backfill GO act (grant content), after evidence.

### 4.9 Traceability (B-02)

| Link | ID |
|------|-----|
| Blocker | B-02 |
| C-IMPL | C-IMPL-01 |
| OD-BF | OD-BF-08 (quality of GO signal) · OD-BF-06 (operator approval remains) |
| AC-BF | AC-BF-11 (security binding spirit) · AC-BF-17 (no accidental dual path) |
| Security | No caller-controlled LIVE grant |
| Tests | Forge suite §4.7 |
| Prod evidence | Runner deny without grant; grant path unused until OD-BF-08 |

---

## 5. B-03 Mutator / Re-HEAD Plan (PHASE B) — C-IMPL-03

### 5.1 Mutator contract (design)

```text
StorageMutator.copyObject({ bucket, sourceKey, destinationKey })
  PRE:  destination MUST NOT exist (or policy: identical size resume handled before call)
  IMPL: copy with upsert:false / fail-if-exists
  POST: returns void on success; throws on exists/error

StorageInspector.headObject({ bucket, key }) → { exists, size, contentType | null }
  READ-ONLY

DbMutator.updateObjectKeyOptimistic({ assetId, sourceKey, destinationKey })
  → { rowsAffected }  // expect 1
  SQL: WHERE id AND object_key = sourceKey AND storage_bucket = 'beat-audio'
```

**No DELETE API** on mutator surface.
**No MOVE** that destroys source. COPY only.

### 5.2 Preflight → mutation separation

```text
1) LOAD (B-04) → candidates
2) PREFLIGHT (pure) → MIGRATE | SKIP | QUARANTINE | FAIL | OWNER_REVIEW
3) If DRY_RUN → stop (telemetry only)
4) If LIVE + verified grant:
     a) re-HEAD source (must exist, size stable vs candidate snapshot within policy)
     b) re-HEAD dest (must not exist OR size-identical resume path)
     c) COPY (upsert:false)
     d) re-HEAD dest (must exist; size == source size)
     e) evaluatePostCopyIntegrity using **re-HEAD sizes**, never assumed source size alone
     f) DB optimistic UPDATE
     g) optional re-read DB object_key confirm
```

**LIVE must not** hardcode `destinationExists: true` / `destinationSize = sourceSize` without HEAD (current gap).

### 5.3 Concurrency / inventory drift

| Drift | Behavior |
|-------|----------|
| Source missing at re-HEAD | FAIL · no COPY · no DB update |
| Source size ≠ preflight snapshot | FAIL / OWNER_REVIEW (Owner policy: abort vs refresh snapshot) — default **FAIL closed** |
| Dest appears between preflight and COPY | COPY fail-if-exists → FAIL · no overwrite |
| Dest size-identical already | SKIP copy · may proceed DB gate if still legacy |
| Concurrent DB `object_key` change | Optimistic lock `rowsAffected ≠ 1` → FAIL |

### 5.4 Retry / abort

| Case | Semantics |
|------|-----------|
| Transient Storage 5xx | retry_count++ up to Owner max (**OPEN** param); then FAIL |
| Conflict / exists / identity | **No retry** · FAIL / QUARANTINE |
| Operator `shouldAbort` | Stop between assets · partial progress retained (source kept) |
| Copy succeeded · DB lock fail | **Do not delete dest**; mark FAIL; resume may SKIP copy via size-match |

### 5.5 Failure / rollback semantics

- Align OD-BF-04: retain source always; never retirement.
- Rollback = DB `object_key` revert to legacy **only if** legacy source still exists (existing `planFar01Rollback`).
- Orphan canonical object after failed DB update = acceptable residual; resume via dest size-match; no auto-delete.

### 5.6 LIVE tests (non-prod / mocked)

| Test | Proves |
|------|--------|
| Mutator mock rejects upsert/exists | No overwrite |
| LIVE path calls `headObject` after copy before integrity | **re-HEAD not skipped** |
| Integrity uses headed sizes | Assumed sizes insufficient |
| Optimistic lock 0 rows | FAIL · no second write |
| Missing post-copy dest | FAIL · no DB update |

**Proof that LIVE does not skip re-HEAD:** instrumentation / spy asserts `headObject(dest)` invoked after `copyObject` and before `updateObjectKeyOptimistic` on every MIGRATE success path.

### 5.7 Traceability (B-03)

| Link | ID |
|------|-----|
| Blocker | B-03 |
| C-IMPL | C-IMPL-03 |
| OD-BF | OD-BF-02 · OD-BF-04 · DB gate design |
| AC-BF | AC-BF-04 · 05 · 06 · 07 · 10 · 15 (dry-run still zero mut) |
| Security | No overwrite · AuthZ already done before mutator |
| Tests | §5.6 |
| Prod evidence | Only after OD-BF-08 + canary; not in this plan |

**Mutation required to implement:** NO. **Mutation when LIVE used:** YES (under future GO only).

---

## 6. B-04 Loader Plan (PHASE C) — C-IMPL-04

### 6.1 Boundary

```text
[Loader — READ ONLY]
  DB: beat_audio_assets ⋈ beats (authoritative identities + object_key)
  Storage: HEAD/list meta for sourceKey + destinationKey
        ↓ Far01BackfillCandidate[]
[Engine — pure preflight / dry-run / gated LIVE]
        ↓
[Mutators — WRITE]  ← separate module; not imported by loader
```

Loader **must not** import or call Storage COPY / DB UPDATE.

### 6.2 Contracts

| Concern | Contract |
|---------|----------|
| DB authoritative mapping | `owner_id`, `beat.id`, `asset.id`, stored `object_key`, bucket, purpose, status, checksum, byte_size |
| Storage source read | HEAD `object_key` → exists/size/contentType |
| Destination write contract | **Not in loader** — only HEAD dest for preflight conflict detection |
| Verification | Loader validates row shape; mapping/preflight verify identity |
| DB object_key update gate | Engine/gates only — loader never updates |
| Source retention | Loader never deletes |
| No delete | Hard rule |
| Idempotency | Re-load yields same sort order; already-canonical → SKIP later |
| Resume | Deterministic `sortAssetsForBatch` on `created_at`, `id` |
| Failure handling | Missing Storage → candidate with `sourceMeta.exists=false` → preflight FAIL |
| Concurrency | Snapshot-at-load; LIVE re-HEAD (B-03) catches drift |
| Operator visibility | Emit load summary: legacy count, quarantine count, platform/orphan excluded |
| Telemetry | Load batch_id + inventory stats; per-asset after engine run |

### 6.3 Query / filter rules (design)

- Include: USER ownership · MASTER · READY (C-02 default) · legacy shape **or** already-canonical for SKIP accounting.
- Exclude: platform rows · orphans (no DB) · non-beat-audio buckets.
- Identity mismatch rows: **include** so OD-BF-01 quarantine appears in report (not silent drop).
- Free-form operator paths: **rejected** — loader refuses CLI path overrides.

### 6.4 Destination write / verification

Deferred to mutator phase. Loader only supplies `destinationMeta` via HEAD of computed canonical key from DB identities (WRITE SSOT builder) — read-only.

### 6.5 Traceability (B-04)

| Link | ID |
|------|-----|
| Blocker | B-04 |
| C-IMPL | C-IMPL-04 |
| OD-BF | OD-BF-01 · OD-BF-03 · OD-BF-06 |
| AC-BF | AC-BF-01 · 02 · 11 · 12 · 16 |
| Security | DB-authoritative · no client keys · no free-form paths |
| Tests | Loader unit with fixture DB/Storage fakes; refuses path override |
| Prod evidence | Enables B-01 dry-run artifact |

**Storage COPY in this phase:** FORBIDDEN. **DB UPDATE:** FORBIDDEN.

---

## 7. B-05 Canary Plan (PHASE D) — C-IMPL-02

### 7.1 Problem

`canaryLimit` optional → `null` allows full fleet LIVE in one call.

### 7.2 Deterministic canary gate (design)

Introduce explicit run phases (state machine or required enum):

```text
DRY_RUN → CANARY → CANARY_VERIFY → APPROVAL → FLEET
```

| Gate | Rule |
|------|------|
| **Obligatory limit** | LIVE `CANARY` requires `canaryLimit: number` with `1 ≤ N ≤ eligible_migrate_count` |
| **Validation** | Non-integer / NaN → DENY |
| **0** | DENY (canary must migrate at least 1) **or** Owner OD-CANARY-ZERO **OPEN** — default DENY |
| **Negative** | DENY |
| **N > inventory eligible** | DENY (do not silently clamp without telemetry) **or** clamp with explicit reason — prefer **DENY** for honesty |
| **Ordering** | Same `sortAssetsForBatch`; first N MIGRATE-eligible after sort; quarantine never in canary set |
| **Canary result contract** | OD-BF-03 telemetry + summary: migrated ids, FAIL/SKIP, checksum_status UNKNOWN explicit |
| **VERIFY gate** | Operator checklist: playback sample, DB object_key canonical for canary ids, source retained, no orphan platform touch — recorded artifact |
| **APPROVAL gate** | Explicit operator/Owner approval token for FLEET (distinct from OD-BF-08 initial GO if Owner splits) |
| **FLEET gate** | Requires prior CANARY batch_id verified + approval; `canaryLimit` null **forbidden** unless OD-CANARY-UNLIMITED **OPEN** |
| **Abort** | `shouldAbort` / FAIL rate threshold (**OPEN** Owner param) → stop; no auto fleet |

**Canary N value:** **OPEN** — Owner Decision **OD-CANARY-N** (do not invent).

### 7.3 Traceability (B-05)

| Link | ID |
|------|-----|
| Blocker | B-05 |
| C-IMPL | C-IMPL-02 |
| OD-BF | OD-BF-07 |
| AC-BF | AC-BF-07 · 08 · 14 · 15 |
| Security | No silent full-fleet |
| Tests | null/0/negative/oversize DENY; N=1 selects first deterministic id |
| Prod evidence | Canary artifact only after Backfill GO — not this plan |

---

## 8. B-01 Production Dry-Run Plan (PHASE E)

### 8.1 Dependency

```text
B-04 loader capability
        ↓
production-safe dry-run (mode=DRY_RUN, no mutators wired)
        ↓
production inventory evidence (OD-BF-03 report)
        ↓
Backfill GO review (PHASE F)   ← still Backfill GO = NO until Owner act
```

Also requires: Phase A attestation **not** required for dry-run (default deny LIVE). Phase D canary enforcement recommended before LIVE, not blocking dry-run.

### 8.2 Data dry-run must collect

- Full candidate set from loader (legacy + quarantine + already-canonical SKIP)
- Per-asset: planned action, reason, source/dest keys, sizes, checksum_status, DB_update_status=SKIPPED/BLOCKED, identity mismatch flag
- Batch counts: migrate / skip / quarantine / fail / owner_review
- `live_mutations_attempted = 0`
- Inventory cross-check: platform/orphan counts unchanged expectation
- Explicit note: checksum UNKNOWN × N

### 8.3 Absolute READ ONLY

| Allowed | Forbidden |
|---------|-----------|
| DB SELECT | DB UPDATE/INSERT/DELETE |
| Storage HEAD / list meta | COPY / MOVE / DELETE / upload |
| Writing local report file | Mutator injection in DRY_RUN |

### 8.4 Guards

- Mode forced `DRY_RUN`
- Mutators absent or deny adapters
- Attestation grant **ignored** / unused
- Refuses `--live`
- Loader refuses free-form paths
- Service role use (if any) scoped read-only where platform allows — **Owner ops constraint** |

### 8.5 Telemetry / output

Archived JSON/markdown report: batch_id, SHA of runner, inventory snapshot counts, full OD-BF-03 asset rows, operator id, started/finished.

### 8.6 Operator preconditions

1. Phase C loader merged and tested against fixtures.
2. Owner **Production Dry-Run Ops Authorization** granted (**OD-DRYRUN-01**) — **not** Backfill GO.
3. Read credentials available to operator.
4. Rollback/comms plan acknowledged (no mutation expected).

### 8.7 Separate Owner GO for production dry-run?

| Question | Answer |
|----------|--------|
| Backfill GO (OD-BF-08)? | **NO** — not required / not granted by dry-run |
| Separate ops authorization? | **YES — OD-DRYRUN-01** (Arch Review + closeout already imply this) |

### 8.8 Traceability (B-01)

| Link | ID |
|------|-----|
| Blocker | B-01 |
| C-IMPL | Enables closure of evidence; depends C-IMPL-04 |
| OD-BF | OD-BF-03 · 05 · 06 · 07 (predecessor) |
| AC-BF | AC-BF-14 · 15 · 16 |
| Security | Read-only · no LIVE |
| Tests | Loader + dry-run zero mutation |
| Prod evidence | Archived dry-run report |

**This plan does not execute the dry-run.**

---

## 9. Dependency Graph

```text
OD-ATT-01 (Owner) ──► PHASE A (attestation)
OD-DRYRUN-01 (Owner) ──► PHASE E (prod dry-run)
OD-CANARY-N (Owner) ──► PHASE D value binding / LIVE canary
OD-BF-08 (Owner) ──► PHASE F only after A–E

PHASE A ─────────────────────────────┐
PHASE C (loader) ──► PHASE E (dry-run) ──► PHASE F (GO review)
PHASE D (canary gate) ───────────────┤
PHASE B (mutator+reHEAD) ────────────┘──► (LIVE canary/fleet only after F)

Parallel OK: A ∥ C ∥ D (after respective ODs where needed)
Serial: C → E → F
Serial: A + B + D → LIVE (post F)
```

---

## 10. Traceability Matrix

| Action (future) | Blocker | C-IMPL | OD-BF | AC-BF | Security | Tests | Prod evidence |
|-----------------|---------|--------|-------|-------|----------|-------|---------------|
| Attestation runner | B-02 | 01 | 08, 06 | 11, 17 | Sealed GO | Forge suite | Deny without grant |
| Read-only loader | B-04 | 04 | 01, 03, 06 | 01, 02, 11, 16 | DB-auth | Loader fakes | Enables dry-run |
| Canary state machine | B-05 | 02 | 07 | 07, 08, 14 | No silent fleet | Limit validation | Post-GO canary report |
| Mutator + re-HEAD | B-03 | 03 | 02, 04 | 04–07, 10 | No overwrite | HEAD spy | Post-GO canary |
| Prod dry-run | B-01 | 04 (dep) | 03, 05, 06 | 14–16 | Read-only | Zero mut | Dry-run archive |
| Backfill GO review | — | all | 08 | — | Packet complete | — | Closeout + dry-run |

---

## 11. Test Plan

| Phase | Tests (design) |
|-------|----------------|
| A | Forge deny · grant verify · dry-run unaffected |
| C | Loader maps 68-shaped fixtures · excludes platform · includes anomaly · refuses path override |
| D | canaryLimit validation matrix · deterministic first-N |
| B | Mock mutator upsert:false · re-HEAD order spies · lock fail |
| E | Integration dry-run against **non-prod** or recorded fixtures with loader — **not** Production in CI |
| Regression | Existing 21 far01-backfill + 14 DR-A remain green |

---

## 12. Security Test Plan

1. Client/free-form object_key rejected end-to-end through loader.
2. LIVE without attestation DENY.
3. LIVE with attestation but without mutators DENY.
4. DRY_RUN never invokes COPY/UPDATE (spies).
5. Mutator exists-fail (no overwrite).
6. Canary null/0/negative DENY for LIVE fleet path.
7. Quarantine rows never DB-updated.
8. No public HTTP route for backfill runner.

---

## 13. Production Evidence Plan

| Evidence | When | Mutation |
|----------|------|----------|
| Unit/CI green for A–D | After each phase merge | NONE |
| Production dry-run report | Phase E under OD-DRYRUN-01 | NONE |
| Attestation deny smoke (ops) | After A deploy of runner | NONE |
| Canary LIVE report | Only after OD-BF-08 | YES (limited) |
| Fleet | After canary VERIFY+APPROVAL | YES |

---

## 14. Rollback Plan

| Phase | Rollback |
|-------|----------|
| A–D code | Revert PR · default deny remains |
| E dry-run | N/A (read-only) |
| Future LIVE | OD-BF-04: retain source · revert `object_key` · no retirement |
| Attestation mis-issue | Rotate token / revoke signed artifact expiry |

---

## 15. Operator Model

| Role | Phase duties |
|------|----------------|
| Approver | OD-ATT-01 · OD-DRYRUN-01 · OD-CANARY-N · OD-BF-08 |
| Operator | Run fixture tests · prod dry-run under OD-DRYRUN-01 · later canary under GO |
| Reviewer | Quarantine / UNKNOWN packs · dry-run report · canary VERIFY |

No public UI. No end-user trigger.

---

## 16. Owner Decisions Required

| ID | Decision | Blocks |
|----|----------|--------|
| **OD-ATT-01** | Attestation architecture A1/A2/A3/(A4 residual) | Phase A completion |
| **OD-DRYRUN-01** | Authorize Production inventory dry-run (read-only) | Phase E execution |
| **OD-CANARY-N** | Concrete canary count N | LIVE canary |
| **OD-CANARY-UNLIMITED** | Optional — allow fleet without N (**OPEN**, not recommended) | B-05 alternate |
| **OD-BF-08** | Backfill GO YES/NO | Phase F / LIVE |
| Soak / FAIL threshold | Owner-defined (**OPEN**) | Ops abort policy |
| Anomaly asset disposition | Confirm quarantine default | Fleet narrative |

**Not decided by this plan:** numeric canary N, soak days, token values.

---

## 17. Implementation Sequence

| Step | Phase | Deliverable | Auth needed |
|------|-------|-------------|-------------|
| 1 | A | Attestation design locked by OD-ATT-01 + code plan slice | OD-ATT-01 |
| 2 | C | Read-only loader + tests | Impl GO slice (Owner) |
| 3 | D | Canary state machine + validation | Impl GO slice |
| 4 | B | Mutators + re-HEAD wiring behind attestation | Impl GO slice · **no LIVE** |
| 5 | E | Prod dry-run CLI path using loader · execute under OD-DRYRUN-01 | OD-DRYRUN-01 |
| 6 | F | Backfill GO readiness re-audit packet | OD-BF-08 decision |

Each step = separate change set. Not one mega-PR.

---

## 18. Acceptance Criteria

| Phase | Done when |
|-------|-----------|
| A | Free boolean alone cannot LIVE; forge tests PASS; default deny PASS |
| B | LIVE success path spies prove post-copy HEAD; upsert:false contract tested; no prod LIVE |
| C | Loader builds candidates from DB/Storage fakes; refuses free-form paths; zero writes |
| D | LIVE CANARY requires valid N; null/0/negative DENY; deterministic selection tested |
| E | Archived prod dry-run report · `live_mutations_attempted=0` · inventory counts recorded |
| F | Owner can open OD-BF-08 review with A–E evidence; GO still separate act |

---

## 19. Risks

| Risk | Mitigation |
|------|------------|
| R1 Attestation secret shared too widely | Prefer A2 signed artifact; rotate |
| R2 Loader uses service role broadly | Least-privilege read; audit queries |
| R3 Implementing mutators tempts early LIVE | Keep attestation + canary gates; Backfill GO = NO |
| R4 Dry-run credentials mistaken for write | Separate read credentials if possible; deny adapters |
| R5 Canary N invented by agent | Forbidden — OD-CANARY-N OPEN |
| R6 Partial canonical orphans after failed DB update | Resume via size-match; no delete; OD-BF-04 |

---

## 20. Next Gate

```text
NEXT GATE = Owner OD-ATT-01 (attestation architecture)
         AND/OR Owner Implementation Authorization for PHASE C loader slice
THEN      = PHASE A + C (+ D) implementation PRs (still no prod dry-run until OD-DRYRUN-01)
THEN      = OD-DRYRUN-01 → PHASE E production dry-run (READ ONLY)
THEN      = PHASE F Backfill GO review packet
THEN      = OD-BF-08 (currently NO)
THEN      = CANARY → VERIFY → APPROVAL → FLEET
RETIREMENT GO = NO
```

**This document does not authorize the next implementation PR.** Owner must explicitly request implementation of a named phase.

---

## Repository safety (this plan)

| Check | Result |
|-------|--------|
| Only new file | `docs/audits/PLAN_FAR_01_BACKFILL_GO_BLOCKERS.md` |
| Code / migrations / Supabase / Storage | **UNTOUCHED** |
| Commit / Push / Deploy | **NONE** |
| Backfill / canary / retirement / prod dry-run | **NOT EXECUTED** |
| Mutations | **NONE** |

---

**PLAN COMPLETE**
**Backfill GO: NO**
**Implementation: NONE**
