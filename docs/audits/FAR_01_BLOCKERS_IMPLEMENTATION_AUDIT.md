# FAR-01 BLOCKERS IMPLEMENTATION AUDIT (B-02…B-05)

**Type:** Independent implementation audit (read-only · documentation only)
**Date:** 2026-10-03
**Auditor method:** Static review of allowlisted source + cited unit contracts
**Classification:** **IMPLEMENTATION READY WITH CONDITIONS**

```text
OD-ATT-01                  = A2 (LOCKED)
OD-DRYRUN-01               = YES WITH CONDITIONS (LOCKED)
OD-CANARY-N                = 5 (LOCKED)
OD-BF-08                   = SEPARATE GATE
BACKFILL GO                = NO
PRODUCTION DRY-RUN         = NOT EXECUTED
CANARY                     = NOT EXECUTED
RETIREMENT                 = NOT EXECUTED
PRODUCTION DB MUTATION     = NONE (this audit)
PRODUCTION STORAGE MUTATION= NONE (this audit)
THIS AUDIT AUTHORIZES      = NOTHING
CODE CHANGES THIS AUDIT    = NONE
```

**Unit PASS ≠ production PASS.**
**Far01VerifiedLiveGrant type existence ≠ security proof** — runtime path audited below.

---

## 1. Executive Summary

Local implementation closes the four blocker *capabilities* from the remediation plan:

| Blocker | Capability verdict | Production execution |
|---------|-------------------|----------------------|
| **B-02** A2 attestation | **PASS WITH CONDITIONS** (library + unit forge suite) | Runner wiring / key ops **NOT VERIFIED** |
| **B-03** mutator + re-HEAD | **PASS WITH CONDITIONS** (call graph + mocks) | No prod Storage/DB adapter |
| **B-04** loader | **PASS WITH CONDITIONS** (injected readers) | No prod Supabase wiring · dry-run not executed |
| **B-05** canary N=5 | **PASS** (mandatory limit + fleet gates in library) | Canary not executed |

**Classification:** **IMPLEMENTATION READY WITH CONDITIONS** — suitable for Owner Commit GO of the allowlist after accepting conditions; **not** Backfill GO; **not** production verified.

---

## 2. Scope

### Allowlist (audited)

```text
scripts/far01-backfill-dry-run.ts
src/lib/beats/far01-backfill/attestation.ts
src/lib/beats/far01-backfill/batch.ts
src/lib/beats/far01-backfill/canary.ts
src/lib/beats/far01-backfill/errors.ts
src/lib/beats/far01-backfill/far01-backfill-blockers.test.ts
src/lib/beats/far01-backfill/far01-backfill.test.ts
src/lib/beats/far01-backfill/gates.ts
src/lib/beats/far01-backfill/index.ts
src/lib/beats/far01-backfill/loader.ts
src/lib/beats/far01-backfill/mutators.ts
src/lib/beats/far01-backfill/types.ts
```

### Cited dependencies (not expanded as change scope)

`mapping.ts` · `preflight.ts` · `integrity.ts` · `telemetry.ts` — used by batch/loader; prior FAR-01 contracts assumed stable.

### Out of scope

Production dry-run execution · canary LIVE · fleet · retirement · deploy · ENV/secrets changes · non-allowlist refactors.

---

## 3. Canonical Baseline

| Item | Value |
|------|--------|
| Docs HEAD (prior closeout) | `1751f5c` |
| Feature baseline (prod) | `f6a5b1c` (pre-blocker-impl) |
| Working tree | Allowlist modified/untracked locally · **not committed** |
| Owner locks | OD-ATT-01=A2 · OD-DRYRUN-01=YES WITH CONDITIONS · OD-CANARY-N=5 |
| Declared local tests | 64/64 · typecheck/lint/build PASS (session claim; **not re-executed** this audit) |

---

## 4. B-02 Audit — Signed GO attestation (OD-ATT-01 A2)

### 4.1 Runtime path (not type-only)

```text
verifyFar01SignedGoArtifact(artifact, { publicKey, expectedBatchScope, allowedIssuers, now? })
  → checks: missing · go · scope · issuer · canary_n · expiry · signature (Ed25519 node:crypto verify)
  → brandGrant(...) → Far01VerifiedLiveGrant

runFar01BackfillBatch({ mode: "LIVE", verifiedGrant, authorization.operatorApproval, ... })
  → resolveExecutionMode → assertLiveGrantAuthorized
       · legacy backfillGo:true without grant → DENY
       · !isFar01VerifiedLiveGrant(grant) → DENY
       · !operatorApproval → DENY
  → LIVE mutations only after that
```

Plain `{ backfillGo: true }` reaches `assertLiveGrantAuthorized` and is **denied** before mutators (batch tests).

### 4.2 Checklist

| # | Check | Result | Evidence class |
|---|-------|--------|----------------|
| 1 | Canonical serialization | **PASS** | Fixed JSON key order in `serializeFar01GoArtifactPayload` |
| 2 | Ed25519 verify | **PASS** (code) | `nodeVerify(null, …, publicKey, sig)` |
| 3 | Issuer allowlist | **PASS** | `allowedIssuers.includes` |
| 4 | Expiry | **PASS** | `expires_at <= now` → DENY |
| 5 | Batch scope | **PASS** | exact match `expectedBatchScope` |
| 6 | canary_n binding | **PASS** | grant.canaryN must equal LIVE `canaryLimit` in batch |
| 7 | Default deny | **PASS** | missing grant / default auth |
| 8–12 | missing / bad sig / expired / wrong scope / wrong issuer | **PASS** (unit) | blockers tests |
| 13–14 | forged boolean | **PASS** (unit) | LIVE batch with boolean + mutators DENY · copies=0 |
| 15 | Private key absent from repo | **PASS** | No committed PEM; `signFar01GoArtifact` takes injected key; tests use ephemeral `generateKeyPairSync` |
| 16 | Public key handling | **PASS** (API) | Injected at verify time — **no** prod key config in repo |
| 17 | Trust boundary at runner | **PARTIAL** | Library *expects* runner to call verify; **no production LIVE runner script** in allowlist that loads public key + artifact |
| 18 | Forge tests | **PASS** (unit) | signature/scope/issuer/expiry/boolean |

### 4.3 Conditions (B-02)

| ID | Finding |
|----|---------|
| **C-ATT-01** | Grant brand uses `Symbol.for("bitrymdym.far01.VerifiedLiveGrant")` — a privileged in-process caller can synthesize an object with the same well-known symbol **without** signature verification. Mitigated in honest runners that only pass verify() output; residual vs hostile same-process code. |
| **C-ATT-02** | `signFar01GoArtifact` is exported (Owner/test tooling). Safe if private keys stay offline; misuse risk if a private key is ever loaded into app process. |
| **C-ATT-03** | Production public-key provisioning + LIVE runner entrypoint **not implemented** — ops prerequisite remains. |

**B-02 capability:** PASS WITH CONDITIONS · **Production attestation evidence:** NOT VERIFIED

---

## 5. B-03 Audit — Mutator / re-HEAD (C-IMPL-03)

### 5.1 Call graph (LIVE MIGRATE)

```text
preflight (pure map)
  → preMutationHeadCheck (HEAD source + dest)
  → storage.copyObject({ upsert: false })   [unless size-match skip]
  → postCopyReHeadVerify (HEAD source + dest)
  → evaluatePostCopyIntegrity(**re-HEAD sizes**)
  → evaluateDbUpdateGate
  → db.updateObjectKeyOptimistic  (only if gate allow)
```

On re-HEAD / pre-HEAD failure: catch → FAIL · `DB_update_status=FAIL` · **no** successful DB update in failure tests.

### 5.2 Checklist

| # | Check | Result | Evidence class |
|---|-------|--------|----------------|
| 1 | Preflight/mutation separation | **PASS** | DRY_RUN never calls copy (unit) |
| 2 | DB-authoritative mapping | **PASS** | `mapFar01BackfillAsset` from beat/asset ids |
| 3–4 | Source/dest validation | **PASS** (helpers) | preMutationHeadCheck |
| 5 | upsert:false | **PASS** (contract) · **PARTIAL** (runtime) | Type + arg passed; **adapter must honor** — library cannot force hostile mutator |
| 6 | Mutation requires attestation | **PASS** (unit) | no grant → DENY before copy |
| 7 | Post-copy re-HEAD | **PASS** (code + unit spy) | heads ≥ 4 on success path |
| 8–9 | re-HEAD fail → no DB update | **PASS** (unit) | dbCalls=0 |
| 10 | Concurrent size drift | **PASS** (helper unit) | source size ≠ snapshot |
| 11–12 | Source retention / no destructive cleanup | **PASS** (design/code) | no delete API on mutator surface |
| 13–14 | Idempotency / resume | **PASS** (design) | size-match skip copy; sort deterministic; optimistic lock |
| 15 | Telemetry | **PASS** | OD-BF-03 fields via batch |
| 16 | Failure semantics | **PASS** | FAIL closed · source retained messaging |

### 5.3 Capability boundary

| Layer | Status |
|-------|--------|
| Mutator **interfaces** + LIVE orchestration | Implemented |
| Production Supabase Storage COPY adapter | **ABSENT** |
| Production DB optimistic UPDATE adapter | **ABSENT** |
| Production HEAD inspector | **ABSENT** |

**B-03 capability:** PASS WITH CONDITIONS · **Production mutation path:** NOT VERIFIED / NOT WIRED

---

## 6. B-04 Audit — Loader (C-IMPL-04 / OD-DRYRUN-01)

### 6.1 Checklist

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | DB authoritative | **PASS** | `Far01DbReader.listUserMasterAssets` |
| 2–4 | owner/beat/asset · object_key · destination | **PASS** | via `mapFar01BackfillAsset` |
| 5–6 | source meta · integrity inputs | **PASS** | HEAD + checksum on asset snapshot |
| 7–8 | Storage HEAD source/dest | **PASS** | inspector injection |
| 9 | Conflict detection | **PASS** | `findAssetIdByObjectKey` → quarantine input |
| 10 | Deterministic inventory | **PASS** | `sortAssetsForBatch` |
| 11–15 | MIGRATE/SKIP/QUARANTINE/FAIL/OWNER_REVIEW | **PASS** | dispositions via preflight on loaded candidates (unit) |
| 16–17 | Orphan / platform exclusion | **PARTIAL** | Orphans never loaded from DB; platform/orphan **counts** are caller-supplied (`platformAssetCount` / `orphanStorageKeys`) — adapter discipline required |
| 18 | No mutation in loader | **PASS** | HEAD/list only |
| 19 | Adapter boundary | **PASS** | no Supabase client in module |
| 20 | Suitability for prod-safe DRY_RUN | **PASS** (capability) | Needs real adapters + OD-DRYRUN-01 ops step |

**Injected mocks ≠ production integration.**

**B-04 capability:** PASS WITH CONDITIONS · **Production dry-run evidence:** NOT EXECUTED / NOT VERIFIED

---

## 7. B-05 Audit — Canary (OD-CANARY-N=5 / C-IMPL-02 / OD-BF-07)

| # | Check | Result |
|---|-------|--------|
| 1 | canaryLimit required on LIVE | **PASS** |
| 2 | Owner default constant = 5 | **PASS** (`FAR01_OWNER_CANARY_N`) |
| 3–9 | null/undefined/0/neg/NaN/non-int/>inventory DENY | **PASS** (unit) |
| 10 | Ordering created_at ASC, id ASC | **PASS** (`sortAssetsForBatch`) |
| 11–12 | MIGRATE-only · quarantine excluded | **PASS** |
| 13 | Exact count / first N | **PASS** (select + batch truncation) |
| 14–16 | VERIFY / APPROVAL / FLEET gates | **PASS** (library asserts) |
| 17 | FLEET without verified canary DENY | **PASS** |
| 18 | No implicit unlimited | **PASS** (`assertNoImplicitUnlimited`) |

**Note:** Pipeline phases are **in-process asserts**, not a durable external workflow store. Ops must persist VERIFY/APPROVAL artifacts between runs — **CONDITION C-CAN-01**.

**Canary auto-execution:** NONE in library/CLI.

**B-05 capability:** PASS · **Canary executed:** NO

---

## 8. Dry-Run Audit

| Check | Result |
|-------|--------|
| CLI forced DRY_RUN | **PASS** — only `mode: "DRY_RUN"` |
| `--live` / `FAR01_BACKFILL_MODE=LIVE` refused | **PASS** — exit 2 `LIVE_REFUSED` |
| Production mutators unavailable in CLI | **PASS** — none wired; fixtures only |
| Loader can be read-only | **PASS** (capability) — CLI **does not yet** call loader against prod |
| Evidence fields / `live_mutations_attempted=0` | **PASS** (fixture path design + unit) |
| CLI cannot grant Backfill GO | **PASS** |
| Production credentials hardcoded | **PASS** — none in CLI/allowlist |

**Production dry-run:** NOT EXECUTED (by design this audit).

---

## 9. Security Audit

| Control | Verdict |
|---------|---------|
| AUTHZ FIRST (product Access Gate) | Unchanged · out of allowlist · retained prior |
| DB AUTHORITATIVE mapping | **PASS** |
| DEFAULT DENY LIVE | **PASS** |
| NO CLIENT PATH AUTHORITY | **PASS** (loader + mapping asserts) |
| NO FORGEABLE BOOLEAN | **PASS** vs `backfillGo` alone |
| SIGNED ATTESTATION | **PASS** (verify path) |
| EXPIRY / SCOPE / ISSUER | **PASS** |
| CANARY BINDING to grant | **PASS** |
| SOURCE RETENTION | **PASS** (no delete surface) |
| NO DESTRUCTIVE CLEANUP | **PASS** |
| Well-known Symbol grant brand | **CONDITION C-ATT-01** |
| Hostile mutator ignoring upsert:false | **CONDITION C-MUT-01** |

---

## 10. Traceability

| Blocker | C-IMPL | OD | AC-BF (primary) | Audit status |
|---------|--------|-----|-----------------|--------------|
| B-02 | C-IMPL-01 | OD-ATT-01 A2 · OD-BF-08 separate | AC-BF-11 · 17 | Capability PASS WITH CONDITIONS |
| B-03 | C-IMPL-03 | OD-BF-02/04 | AC-BF-04…07 · 10 · 15 | Capability PASS WITH CONDITIONS |
| B-04 | C-IMPL-04 | OD-DRYRUN-01 | AC-BF-01 · 02 · 11 · 12 · 16 | Capability PASS WITH CONDITIONS |
| B-05 | C-IMPL-02 | OD-CANARY-N=5 · OD-BF-07 | AC-BF-07 · 08 · 14 | Capability PASS |

| Design conditions | Status |
|-------------------|--------|
| C-01 UNKNOWN checksum visibility | **RETAINED** (telemetry) |
| C-02 unsupported status | **RETAINED** (preflight) |
| C-03 size ≠ crypto | **RETAINED** |
| C-04 GO separation | **REAFFIRMED** — Backfill GO=NO |
| C-05 evidence limitations | **REAFFIRMED** |
| OD-BF-01…07 policy | Unchanged · quarantine etc. still in preflight |
| OD-BF-08 | **SEPARATE GATE · NO** |

Where LIVE production evidence is required → marked **NOT VERIFIED**, not PASS.

---

## 11. Local Test Evidence

| Claim | Class |
|-------|--------|
| 64/64 FAR-01 + blockers + DR-A | **LOCAL TEST** (declared prior session; **not re-run** this audit) |
| Typecheck / lint / build PASS | **LOCAL BUILD** (declared prior; **not re-run** this audit) |
| Forge / re-HEAD / loader / canary unit cases | **CODE + LOCAL TEST** (present in `far01-backfill-blockers.test.ts`) |

---

## 12. Production Evidence

| Claim | Class |
|-------|--------|
| Production SHA includes this implementation | **NOT VERIFIED** (uncommitted locally) |
| Production dry-run report | **NOT EXECUTED** |
| Canary LIVE | **NOT EXECUTED** |
| Storage/DB mutation under GO | **NONE / NOT EXECUTED** |
| Attestation with Owner production keys | **NOT VERIFIED** |

---

## 13. Evidence Limitations

1. This audit did **not** re-execute vitest/typecheck/lint/build.
2. No production inventory dry-run.
3. No production Storage/DB adapters exist to verify upsert:false / optimistic lock at runtime.
4. No LIVE runner entrypoint wiring Owner public key.
5. `Symbol.for` brand residual (C-ATT-01).
6. Platform/orphan exclusion counts depend on honest adapter inputs.
7. Canary VERIFY/APPROVAL persistence across processes not implemented as durable store.

---

## 14. Findings

| ID | Severity | Finding |
|----|----------|---------|
| F-01 | CONDITION | C-ATT-01 — well-known Symbol brand forgeable in-process without signature |
| F-02 | CONDITION | C-ATT-03 — no production LIVE runner + public key wiring |
| F-03 | CONDITION | C-MUT-01 — upsert:false is contract; hostile/incomplete adapter not library-enforced |
| F-04 | CONDITION | No production DB/Storage adapters (expected capability boundary) |
| F-05 | CONDITION | C-CAN-01 — VERIFY/APPROVAL not durable cross-run workflow |
| F-06 | INFO | CLI still fixture-only; loader ready for future OD-DRYRUN-01 ops step |
| F-07 | INFO | Private signing keys not found in repository |

**No BLOCKER** found that makes the allowlisted capability unfit to commit **as tooling**, given conditions accepted.

---

## 15. Blockers

**NONE** for classification **IMPLEMENTATION READY WITH CONDITIONS** (commit of capability).

**Blocking Backfill GO / LIVE production:** still many (adapters, prod dry-run, OD-BF-08, runner, canary execution) — listed under Required Owner Actions / Next Gate — **not** closed by this audit.

---

## 16. Conditions

1. **C-ATT-01** — Prefer module-private unique symbol (or never accept grant except from verify return in same sealed runner) before LIVE.
2. **C-ATT-02/03** — Offline key custody · LIVE runner verifies artifact · never commit private keys.
3. **C-MUT-01** — Production mutator must fail-if-exists / upsert:false with tests against real SDK.
4. **C-LOAD-01** — Production `Far01DbReader` / inspector must enforce USER-only query and real orphan/platform accounting.
5. **C-CAN-01** — Persist VERIFY/APPROVAL artifacts for FLEET.
6. Carry **C-01…C-05** · **Backfill GO = NO**.
7. OD-DRYRUN-01 conditions remain binding before any prod dry-run execution.

---

## 17. Required Owner Actions

1. Decide **Commit GO** for allowlist (separate from Backfill GO).
2. Authorize implementation of production read adapters + optional LIVE runner (still GO=NO).
3. When ready: OD-DRYRUN-01 operational execution step (read-only).
4. Keep OD-BF-08 = NO until dry-run + canary packet complete.
5. Accept or remediate C-ATT-01 before LIVE.

---

## 18. Commit Readiness

| Question | Answer |
|----------|--------|
| Allowlist implement capability complete? | **YES WITH CONDITIONS** |
| Safe to commit without granting Backfill GO? | **YES** (if Owner Commit GO) |
| Includes production secrets? | **NO** (audited) |
| This audit commits code? | **NO** |

---

## 19. Backfill GO Status

```text
BACKFILL GO        = NO
OD-BF-08           = SEPARATE GATE
CANARY             = NOT EXECUTED
PRODUCTION DRY-RUN = NOT EXECUTED
RETIREMENT         = NOT EXECUTED
```

Attestation capability **does not** grant Backfill GO.

---

## 20. Next Gate

```text
NEXT = Owner Commit GO for allowlisted blocker implementation
   OR Owner directs remediation of C-ATT-01 before commit
THEN = Wire read-only production adapters (still Backfill GO = NO)
THEN = OD-DRYRUN-01 operational production dry-run execution
THEN = Backfill GO review packet (OD-BF-08 still NO until Owner act)
THEN = CANARY (N=5) → VERIFY → APPROVAL → FLEET only after OD-BF-08
```

---

## Evidence boundary summary

| Layer | Status |
|-------|--------|
| **A. Implemented capability** | B-02…B-05 present in allowlist |
| **B. Local test evidence** | Unit suite present (declared 64/64) |
| **C. Production verified evidence** | **NONE** for this implementation |
| **D. Not verified** | Prod adapters · prod dry-run · canary · runner keys · deploy SHA |

---

## Repository safety (this audit)

| Check | Result |
|-------|--------|
| Only new artifact | `docs/audits/FAR_01_BLOCKERS_IMPLEMENTATION_AUDIT.md` |
| Allowlist code modified | **NO** |
| Commit / Push / Deploy | **NONE** |
| Backfill / canary / dry-run / retirement | **NOT EXECUTED** |
| Mutations | **NONE** |

---

**IMPLEMENTATION AUDIT COMPLETE**
**CLASSIFICATION: IMPLEMENTATION READY WITH CONDITIONS**
**BACKFILL GO: NO**
