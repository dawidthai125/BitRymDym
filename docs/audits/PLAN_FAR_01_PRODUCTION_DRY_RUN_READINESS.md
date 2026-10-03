# PLAN — FAR-01 Production Dry-Run Readiness

**Type:** RCA + remediation plan only (no implementation)
**Date:** 2026-10-03
**Baseline commit:** `f9500b3` `feat(storage): harden FAR-01 backfill execution`
**Source audit:** [AUDIT_FAR_01_PRODUCTION_DRY_RUN_READINESS.md](./AUDIT_FAR_01_PRODUCTION_DRY_RUN_READINESS.md)
**Classification (current):** **NOT READY FOR PRODUCTION DRY-RUN**

```text
THIS PLAN AUTHORIZES       = NOTHING
IMPLEMENTATION             = NONE (this document)
PRODUCTION DRY-RUN         = NOT EXECUTED
BACKFILL GO                = NO
OD-BF-08                   = SEPARATE GATE / NO
CANARY / FLEET / RETIREMENT= NOT IN SCOPE
PRODUCTION DB / STORAGE    = NOT TOUCHED by this plan step
```

**Scope lock:** SAFE PRODUCTION **READ-ONLY** DRY-RUN readiness only.
Not: COPY · DB UPDATE · canary · fleet · retirement · Backfill GO.

---

## 1. Scope

| In | Out |
|----|-----|
| RCA B-PDR-01…06 | Implementing adapters |
| Credential **model** (design) | Creating secrets / ENV / Supabase permission changes |
| Report / inventory refresh **models** | Executing refresh or dry-run |
| Owner vs Cursor action split | Canary / LIVE / retirement design |
| Definition of Ready | Granting OD-BF-08 |

**Canonical docs consulted (all present):** Production Dry-Run Readiness audit · STORAGE-ARCH-02-KEY FAR-01 chain · DESIGN/ARCH/OD FAR-01 backfill · GO readiness · RCA/PLAN blockers · Blockers implementation audit.

---

## 2. Current state

| Layer | State |
|-------|--------|
| Library loader | `loadFar01BackfillCandidates` — injects `Far01DbReader` + `Far01StorageInspector` |
| Production DB reader | **ABSENT** |
| Production Storage HEAD | **ABSENT** (interface only; mocks in tests) |
| CLI | `scripts/far01-backfill-dry-run.ts` — **fixtures only** · LIVE refused |
| Archive/report path for prod inventory | **ABSENT** |
| Credentials for least-privilege dry-run | **NOT DEFINED** for FAR-01 |
| Inventory 68/2/3/30 | **Historical** (Phase 0 / closeout) |
| Existing `createSupabaseAdminClient` | Service-role — **write-capable** · must not be dry-run default |
| HTTP backfill API | **NONE** in `app/` |

---

## 3. B-PDR-01 RCA — Production DB reader

| Field | Content |
|-------|---------|
| **Root Cause** | Loader was designed as an **injection point** (C-IMPL-04). Implementation @ `f9500b3` shipped the contract (`Far01DbReader.listUserMasterAssets` / `findAssetIdByObjectKey`) and mock tests; **no Supabase/Postgres concrete reader** was wired — deferred until OD-DRYRUN-01 ops readiness. |
| **Evidence** | `loader.ts` types only; grep shows no production `Far01DbReader` impl; CLI does not call loader with DB; admin client exists elsewhere but unused by FAR-01 dry-run. |
| **Security impact** | Without a dedicated SELECT-only adapter, operators may be tempted to reuse service-role (over-privilege) or skip dry-run. |
| **Operational impact** | Cannot load live USER MASTER inventory into preflight. |
| **Remediation** | Implement read-only adapter: SELECT `beat_audio_assets` ⋈ `beats` where ownership USER · purpose MASTER · bucket beat-audio; map to `Far01AssetSnapshot` / `Far01BeatSnapshot`; `findAssetIdByObjectKey` SELECT-only. **No** INSERT/UPDATE/DELETE methods on the object. |
| **Verification** | Unit with fake client; optional integration against non-prod; static review that adapter surface has no mutate APIs; dry-run composition never receives admin write helpers. |
| **Owner Action** | Approve credential model (B-PDR-05) before pointing adapter at Production. |
| **Cursor Implementation Action** | After Owner Implementation GO: add `Far01DbReader` production module + tests (separate PR). |
| **Risk if unresolved** | Production dry-run remains impossible; Backfill GO review stays blocked on B-01 evidence. |
| **Owner decision required?** | **YES** — Implementation GO for adapter + credential choice. |

**Can architecture limit to SELECT?** Yes — adapter API is already read-shaped; enforce by (a) not exposing mutate methods, (b) prefer DB role without write grants (Owner/Supabase).

**Accidental mutation capability today?** No FAR-01 prod DB adapter exists; risk is future misuse of `admin.ts` service role if naively imported.

---

## 4. B-PDR-02 RCA — Production Storage HEAD

| Field | Content |
|-------|---------|
| **Root Cause** | Same injection design: `Far01StorageInspector.headObject` → `{ exists, size, contentType }`. No production HEAD implementation; tests supply mocks. Product Storage helpers (`createSignedUrl`, `download`, upload/remove in live tests) are **broader** than HEAD and must not be the dry-run surface. |
| **Evidence** | `mutators.ts` inspector interface; loader calls `headObject` only; no FAR-01 Storage adapter file; `audio-access` / transport use signed URL / download — different AuthZ paths. |
| **Security impact** | Using service-role Storage client without API narrowing enables upload/remove/copy — violates OD-DRYRUN-01. |
| **Operational impact** | Cannot classify source/dest existence/size from live Storage. |
| **Remediation** | Implement inspector that only lists/HEADs metadata (e.g. `storage.from('beat-audio').list` / info APIs as available) and maps to `Far01StorageObjectMeta`. **Do not** attach `.upload` / `.remove` / `.copy` / `.move` on the exported dry-run object. |
| **Verification** | Type/API surface review; negative tests that dry-run path never imports mutator; optional stub of Storage SDK. |
| **Owner Action** | Confirm Storage read permissions for chosen credential (B-PDR-05). |
| **Cursor Implementation Action** | After GO: HEAD-only adapter + tests. |
| **Risk if unresolved** | Integrity classification limited to DB fields; OD-DRYRUN-01 incomplete. |
| **Owner decision required?** | **YES** (with B-PDR-05). |

**HEAD without COPY/DELETE/UPLOAD capability?** Yes, if adapter is a thin wrapper exposing only head/list and credentials lack write — or write is present on key but **never called** (weaker; prefer key without write).

---

## 5. B-PDR-03 RCA — CLI fixture/local-only

| Field | Content |
|-------|---------|
| **Root Cause** | CLI was scoped as **wiring proof** under Implementation GO: in-memory fixtures, refuse LIVE, no Supabase import. Explicit comment: production inventory execution not enabled. |
| **Evidence** | `scripts/far01-backfill-dry-run.ts` — `fixtureCandidates()`, `LIVE_REFUSED`, `mode: "DRY_RUN"` only. |
| **Security impact** | Low for accidental LIVE (refused). Gap is inability to run approved prod dry-run safely. |
| **Operational impact** | Operators cannot produce production inventory evidence via current CLI. |
| **Remediation** | New **separate** script (preferred) or gated subcommand that: requires explicit `--production-inventory` + operator id; loads via B-PDR-01/02 adapters; forced DRY_RUN; deny mutators; refuses LIVE; never default. Keep fixture CLI unchanged as safe sandbox. |
| **Verification** | Fixture CLI still LIVE_REFUSED; prod script refuses without flags; no mutator wiring; unit/integration of flag matrix. |
| **Owner Action** | Approve script name/flags/ops procedure (OD-DRYRUN-01 #15). |
| **Cursor Implementation Action** | After GO: implement prod dry-run entrypoint (not mutate fixture semantics). |
| **Risk if unresolved** | Stuck on fixtures; false confidence if someone mistakes fixture output for prod. |
| **Owner decision required?** | **YES** for ops entrypoint shape. |

**DRY_RUN state today:** **PASS** for fixtures. **Accidental mutation risk:** **LOW** on current CLI (no adapters/mutators).

---

## 6. B-PDR-04 RCA — loader → DRY_RUN archive/report

| Field | Content |
|-------|---------|
| **Root Cause** | Batch already emits OD-BF-03 telemetry in-memory / stdout; no production composition that (1) loads real inventory, (2) runs DRY_RUN, (3) **archives** durable evidence with SHA/operator. |
| **Evidence** | `buildAssetTelemetry` / `summarizeBatch`; CLI prints JSON to stdout only; no `reports/` writer; OD-DRYRUN-01 requires archive batch_id / SHA / operator id. |
| **Security impact** | Missing archive → no auditable proof; risk of informal ad-hoc runs without evidence. |
| **Operational impact** | Cannot close B-01 dry-run evidence for Backfill GO review. |
| **Remediation** | Compose: adapters → `loadFar01BackfillCandidates` → `runFar01BackfillBatch({ mode: "DRY_RUN" })` → write **JSON** report (primary) under e.g. `docs/audits/evidence/` or operator-local path **outside** secrets; optional Markdown summary. Fields below. |
| **Verification** | Schema check AC-BF-14 fields; `live_mutations_attempted === 0`; no secrets in file; deterministic sort order of assets. |
| **Owner Action** | Approve report location / retention / whether committed to git or kept local. |
| **Cursor Implementation Action** | After GO: report writer + composition script. |
| **Risk if unresolved** | Dry-run may run once without durable evidence. |
| **Owner decision required?** | **YES** (artifact location / git policy). |

### Report model (design)

| Format | Role |
|--------|------|
| **JSON** (canonical) | Machine audit — required |
| Markdown (optional) | Human summary — optional |

**Required fields (batch):** `batch_id`, `mode=DRY_RUN`, `git_sha`, `operator_id`, `started_at`, `finished_at`, `live_mutations_attempted`, inventory snapshot counts, migrate/skip/quarantine/fail/owner_review totals.

**Required fields (per asset):** OD-BF-03 — `asset_id`, `source_key`, `destination_key`, `started_at`, `finished_at`, `status`, `failure_reason`, `source_size`, `destination_size`, `checksum_status`, `DB_update_status` (expect SKIPPED/BLOCKED/NOT_ATTEMPTED), `retry_count`, plus `action`, `content_identity`, identity mismatch flag.

**Determinism:** same loader sort (`created_at`, `id`); stable JSON key order where practical.

**No secrets:** never dump connection strings, service keys, signed GO private material.

---

## 7. B-PDR-05 RCA — Read-scoped credentials (SECURITY GATE)

| Field | Content |
|-------|---------|
| **Root Cause** | OD-DRYRUN-01 condition #6 requires read-scoped credentials. Repo has `SUPABASE_SERVICE_ROLE_KEY` via `admin.ts` — bypasses RLS and can mutate Storage/DB. No FAR-01-specific read-only role/key documented or provisioned. |
| **Evidence** | `src/lib/supabase/admin.ts` + `env.ts`; dry-run readiness audit C-PDR-01; no FAR-01 read-only credential artifact. |
| **Security impact** | **HIGH** if service-role used for dry-run without constraints — violates least privilege. |
| **Operational impact** | Blocks safe production dry-run authorization even if adapters exist. |
| **Remediation (design only)** | Prefer: (1) Postgres role / Supabase user with SELECT on needed tables (+ Storage read), (2) or tightly scoped key used only through adapters that expose zero write methods + Owner-accepted residual. **Do not** create keys in Cursor session. |
| **Verification** | Owner documents allowed ops; adapter code review; optional attempt to call forbidden write fails. |
| **Owner Action** | **REQUIRED** — provision/approve credentials in Supabase; never commit secrets. |
| **Cursor Implementation Action** | After credentials exist: wire env **names** (not values) into read-only client factory; refuse to run if write-only/missing. |
| **Risk if unresolved** | Either no dry-run or unsafe over-privileged dry-run. |
| **Owner decision required?** | **YES — blocking security gate.** |

### Minimal allow / deny (design)

| Must allow | Must NOT allow |
|------------|----------------|
| SELECT on `beat_audio_assets`, `beats` (and joins needed) | INSERT/UPDATE/DELETE on those tables |
| Storage metadata read / list / HEAD for `beat-audio` | Storage upload, remove, copy, move |
| — | Issuing Backfill GO / LIVE mutators |

**Is service-role least privilege?** **NO.** Using it for dry-run is **non-compliant** with OD-DRYRUN-01 unless Owner explicitly accepts residual with compensating controls (not recommended).

---

## 8. B-PDR-06 RCA — Inventory reconfirmation

| Field | Content |
|-------|---------|
| **Root Cause** | Counts 68/2/3/30 come from Phase 0 / production closeout **historical** SQL. No refresh since; dry-run readiness audit correctly marked them historical. |
| **Evidence** | AUDIT_FAR_01_PHASE0 · FAR_01_BACKFILL_PRODUCTION_CLOSEOUT · Dry-Run Readiness §17. |
| **Security impact** | Stale inventory → wrong migrate/quarantine expectations; anomaly row drift missed. |
| **Operational impact** | Cannot claim current production baseline before dry-run. |
| **Remediation** | Design **READ-ONLY inventory refresh** (below) executed only after B-PDR-01/02/05; output feeds dry-run report header. |
| **Verification** | Refresh report fields complete; no mutation; compare to historical with explicit delta section. |
| **Owner Action** | Approve refresh execution window (ops step). |
| **Cursor Implementation Action** | After adapters: inventory query module reused by dry-run (SELECT/HEAD only). |
| **Risk if unresolved** | Planning against obsolete fleet. |
| **Owner decision required?** | **YES** for when to run refresh (not for designing it). |

### READ-ONLY inventory refresh model (design — do not execute)

Per asset (USER MASTER candidates):

| Field | Source |
|-------|--------|
| asset_id, owner_id, beat_id | DB |
| current object_key | DB |
| expected canonical key | `buildUserBeatAudioObjectKey` |
| asset status / beat status / ownership_type | DB |
| storage existence / source size | Storage HEAD |
| destination existence / size | Storage HEAD |
| checksum_status | NULL → UNKNOWN |
| identity anomaly | twin mismatch (OD-BF-01) |
| classification / planned action | `runFar01Preflight` |

Aggregates: legacy / canonical / platform / orphan counts (platform & orphans via explicit queries, not hard-code).

---

## 9. Dependency graph

```text
B-PDR-05 credentials (Owner) ──────────────────────────────┐
        ↓                                                    │
B-PDR-01 DB read adapter ←──────────────────────────────────┤
B-PDR-02 Storage HEAD adapter ←─────────────────────────────┤
        ↓                                                    │
B-PDR-06 inventory refresh (uses 01+02+05)                  │
        ↓                                                    │
B-PDR-03 prod CLI/entrypoint + B-PDR-04 archive/report      │
        ↓                                                    │
SAFE PRODUCTION DRY-RUN (ops step · OD-DRYRUN-01)           │
        ↓                                                    │
Backfill GO Review packet (still OD-BF-08 = NO)             │
                                                             │
Independent of dry-run path: C-ATT-01 (LIVE only)            │
Canary N=5 / mutator LIVE path: AFTER dry-run evidence       │
```

| Blocker | Independent? | Blocks |
|---------|--------------|--------|
| B-PDR-05 | Mostly yes (Owner-first) | 01, 02, 06, ops run |
| B-PDR-01 | After 05 | 06, 03/04 composition |
| B-PDR-02 | After 05 | 06, 03/04 composition |
| B-PDR-06 | After 01+02 | honest dry-run baseline |
| B-PDR-03 | After 01+02 (+05) | operator execution |
| B-PDR-04 | Parallel with 03 once load works | durable evidence |

---

## 10. Minimal remediation sequence

1. **Owner:** B-PDR-05 credential decision + provision (no Cursor secret creation).
2. **Owner:** Implementation GO for dry-run adapters + entrypoint (still no Backfill GO).
3. **Cursor:** B-PDR-01 + B-PDR-02 adapters (read-only surfaces).
4. **Cursor:** B-PDR-06 inventory refresh module (read-only).
5. **Cursor:** B-PDR-03 entrypoint + B-PDR-04 JSON archive.
6. **Re-audit:** Production Dry-Run Readiness → aim READY.
7. **Owner ops:** Execute dry-run once (separate step) · archive evidence.
8. **Still NO:** OD-BF-08 / canary / fleet.

---

## 11. Security boundary

```text
ALLOW (dry-run path):
  SELECT DB · Storage HEAD/list meta · local report write · stdout

DENY:
  Storage COPY/MOVE/DELETE/UPLOAD
  DB INSERT/UPDATE/DELETE
  LIVE batch · mutators · signed GO issuance
  HTTP public trigger
  Committing secrets
  Treating service-role as default

SEPARATE GATES (later):
  OD-BF-08 Backfill GO · Canary N=5 · Fleet · Retirement
```

---

## 12. Credential model

| Option | Least privilege | Owner work | Cursor work |
|--------|-----------------|------------|-------------|
| **R1 — Dedicated read-only DB role + Storage read** | Best | Create role/grants/key | Wire env name to read client |
| **R2 — Restricted key + adapter with zero write methods** | Medium | Issue key; accept residual | Same |
| **R3 — Service role “just this once”** | **Non-compliant** default | Explicit residual acceptance only | Strongly discourage |

**Plan recommendation:** **R1**. R3 is not Definition-of-Ready compliant without exceptional Owner residual lock.

---

## 13. Inventory refresh model

See §8. Execute only under OD-DRYRUN-01 ops authorization after adapters exist. Output feeds dry-run report `inventory` section + delta vs historical 68/2/3/30.

---

## 14. Dry-run report model

See §6. Canonical **JSON**; optional MD. Deterministic asset order. Include `git_sha` of runner code and `operator_id`. Assert `live_mutations_attempted === 0` or fail the ops step.

---

## 15. Production evidence required (when executed later)

| Evidence | Purpose |
|----------|---------|
| JSON dry-run archive | OD-BF-03 + OD-DRYRUN-01 |
| Inventory counts + deltas | B-PDR-06 closure |
| Proof mutators not wired | Security |
| Operator + timestamp + SHA | Traceability |
| Explicit Backfill GO = NO statement | Gate hygiene |

---

## 16. Owner actions

| ID | Action |
|----|--------|
| OA-1 | Choose credential model R1/R2/(R3 residual) — **B-PDR-05** |
| OA-2 | Provision read credentials in Supabase (no commit) |
| OA-3 | Implementation GO for adapters + prod dry-run entrypoint |
| OA-4 | Approve report location / git vs local retention |
| OA-5 | Authorize ops window for inventory refresh + dry-run execution |
| OA-6 | Keep OD-BF-08 = NO until post-dry-run review |

---

## 17. Implementation actions (Cursor — **after** Owner GO only)

| ID | Action | Blockers closed |
|----|--------|-----------------|
| IA-1 | `Far01DbReader` production SELECT adapter | B-PDR-01 |
| IA-2 | `Far01StorageInspector` HEAD-only adapter | B-PDR-02 |
| IA-3 | Inventory refresh query module | B-PDR-06 |
| IA-4 | Prod dry-run entrypoint (forced DRY_RUN, LIVE refuse) | B-PDR-03 |
| IA-5 | JSON archive writer (OD-BF-03 + SHA + operator) | B-PDR-04 |
| IA-6 | Tests: no mutate APIs; LIVE refused; mutations attempted = 0 | all |

**Not in IA-***: COPY mutator wiring for prod LIVE · canary execution · Backfill GO.

---

## 18. Verification gates

| Gate | Pass criteria |
|------|----------------|
| V1 Adapter surface | No write methods on dry-run clients |
| V2 Credential | Matches Owner R1/R2 decision |
| V3 Composition | loader → DRY_RUN → archive without mutators |
| V4 CLI safety | LIVE refused; fixtures CLI unchanged behavior |
| V5 Report | Required fields present; `live_mutations_attempted=0` |
| V6 Re-audit | Dry-run readiness → READY |
| V7 Ops | Single executed dry-run under OA-5 (later) |

---

## 19. Rollback / abort boundary

| Event | Action |
|-------|--------|
| Any write attempt detected | Abort · revoke run · incident note |
| Credential too privileged discovered | Stop · switch to R1 |
| Unexpected inventory anomaly surge | Abort dry-run completion claim · Owner review |
| Accidental LIVE request | Must exit deny (already CLI pattern) |

Dry-run rollback is trivial: **no mutation to undo**. Delete local report if secret leakage suspected.

---

## 20. Definition of Ready

### PRODUCTION DRY-RUN READY

All must hold:

1. Read-only DB capability exists and is wired (B-PDR-01 closed).
2. Read-only Storage HEAD capability exists and is wired (B-PDR-02 closed).
3. Credentials are least-privilege per Owner model (B-PDR-05 closed; **not** unconstrained service-role).
4. Production inventory can be loaded via loader (not fixtures).
5. Operator entrypoint has explicit DRY_RUN boundary + LIVE deny (B-PDR-03 closed).
6. Deterministic JSON archive/report path exists (B-PDR-04 closed).
7. Mutation capability absent from dry-run path (security gate PASS).
8. Inventory refresh mechanism ready (B-PDR-06 capability; execution may be same ops window).
9. Audit evidence can be written without secrets.
10. Owner has approved operational parameters (OA-1…OA-5).
11. Re-audit classifies **READY FOR PRODUCTION DRY-RUN**.

**Explicitly does NOT mean:**

- Backfill GO
- Canary GO
- Fleet
- Retirement
- Production mutation authorized

---

## Cross-reference — blocker summary table

| Blocker | Root Cause (short) | Remediation | Verification | Owner Action | Cursor Action | Risk |
|---------|-------------------|-------------|--------------|--------------|---------------|------|
| B-PDR-01 | Contract only; no SELECT adapter | Read-only DbReader | Surface + tests | Creds + Impl GO | IA-1 | No inventory load |
| B-PDR-02 | Contract only; no HEAD adapter | HEAD-only inspector | Surface + tests | Storage read grant | IA-2 | No size/exists evidence |
| B-PDR-03 | Fixture CLI by design | Separate prod entrypoint | Flag matrix | Ops flags approve | IA-4 | No prod operator path |
| B-PDR-04 | Stdout only; no archive | JSON report writer | Schema + zero mut | Artifact policy | IA-5 | No durable evidence |
| B-PDR-05 | No least-privilege key | R1/R2 provision | Owner doc + review | **Provision** | Wire env names | Over-privilege / blocked |
| B-PDR-06 | Historical counts | Read-only refresh | Delta report | Ops window | IA-3 | Stale baseline |

---

## Repository safety (this plan step)

| Check | Result |
|-------|--------|
| Only new file | `docs/audits/PLAN_FAR_01_PRODUCTION_DRY_RUN_READINESS.md` |
| Code / ENV / Supabase / secrets | **UNTOUCHED** |
| Commit / Push / Deploy | **NONE** |
| Production DB/Storage | **NOT TOUCHED** |
| Dry-run / canary / backfill | **NOT EXECUTED** |
| Backfill GO | **NO** |

---

**PLAN COMPLETE**
**NEXT = Owner Actions OA-1…OA-3 (credentials + Implementation GO)**
**THEN = Cursor IA-1…IA-5 under that GO**
**NOT NOW = production dry-run execution · Backfill GO**
