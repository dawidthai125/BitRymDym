# DESIGN — FAR-01 BACKFILL / IMPLEMENTATION PLAN

**Type:** Design / Implementation Plan only
**Date:** 2026-10-02
**Surface:** STORAGE-ARCH-02-KEY / FAR-01 · Strategy B backfill
**Status:** **DESIGN COMPLETE** · **OD-BF-01…08 OWNER LOCKED** · **IMPLEMENTATION GO = NO** · **BACKFILL GO = NO** · **RETIREMENT GO = NO**

```text
PHASE 1 DR-A               = SHIPPED @ f514a51
PHASE 0 AUDIT              = READY WITH CONDITIONS
THIS DOCUMENT              = BACKFILL DESIGN / PLAN ONLY
OD-BF-01 … OD-BF-07        = CLOSED — OWNER LOCKED
OD-BF-08                   = CLOSED AS SEPARATE GATE (GO not granted)
BACKFILL IS NOT AUTHORIZED = YES (explicit)
IMPLEMENTATION GO          = NO
BACKFILL GO                = NO
RETIREMENT GO              = NO
BACKFILL EXECUTION         = NOT STARTED · NOT AUTHORIZED
DUAL-WRITE                 = NO (OD-KEY-04)
DR-B                       = DEFERRED (OD-KEY-09)
RETIREMENT                 = NOT STARTED (OD-KEY-07 · separate future gate)
ORPHANS                    = ARCH-04/05 · out of scope
```

**BACKFILL IS NOT AUTHORIZED.**
**IMPLEMENTATION GO = NO.**
**BACKFILL GO = NO.**
**RETIREMENT GO = NO.**

This document locks **policy decisions** for a future backfill. It does **not** authorize implementation, Storage copy, DB mutation, deploy, or retirement.

### Authorization layers (must remain separated)

| Layer | Status |
|-------|--------|
| Design Freeze (STORAGE-ARCH-02-KEY / FAR-01) | COMPLETE (prior) |
| Arch Review | COMPLETE (prior) |
| OD-KEY-* strategy lock | LOCKED (prior) |
| Phase 1 DR-A Implementation GO | GRANTED / SHIPPED @ `f514a51` (prior) |
| **OD-BF-01…07 policy lock** | **CLOSED — OWNER LOCKED** (this update) |
| **Implementation Authorization** (build tooling) | **NO** |
| **Backfill Authorization** (OD-BF-08 LIVE execution) | **NO** · separate gate |
| **Retirement Authorization** | **NO** · separate future gate |
---

## 0. Sources (evidence hierarchy)

**CODE + REMOTE SCHEMA + PRODUCTION EVIDENCE > documentation prose.**

| Source | Role |
|--------|------|
| [AUDIT_FAR_01_PHASE0_SOAK_BACKFILL_READINESS.md](./AUDIT_FAR_01_PHASE0_SOAK_BACKFILL_READINESS.md) | Phase 0 inventory + blockers |
| [DESIGN_FREEZE_STORAGE_ARCH_02_KEY_FAR_01.md](./DESIGN_FREEZE_STORAGE_ARCH_02_KEY_FAR_01.md) | Strategy B logical backfill |
| [ARCH_REVIEW_STORAGE_ARCH_02_KEY_FAR_01.md](./ARCH_REVIEW_STORAGE_ARCH_02_KEY_FAR_01.md) | Conditions (checksum-null, DR-B optional) |
| [OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md](./OWNER_DECISIONS_STORAGE_ARCH_02_KEY_FAR_01.md) | OD-KEY-01…09 LOCKED |
| [FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md](./FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md) | Production verify limitations |
| Code @ `f514a51`: `buildUserBeatAudioObjectKey`, `buildLegacyUserBeatMasterObjectKey`, `isAuthorizedUserBeatObjectKeyRepresentation` | Mapping + security SSOT |

### Baseline inventory (Phase 0 live evidence — refresh before any future run)

| Set | Count |
|-----|------:|
| Legacy USER DB rows (migrate candidate set) | **68** |
| Canonical USER DB rows (already done) | **2** |
| Platform | **3** |
| Orphans | **30** (ARCH-04/05) |
| Destination Storage conflicts | **0** |
| Destination DB collisions | **0** |
| `missing_storage` | **0** |
| Identity-mismatched legacy rows | **1** |
| Legacy `checksum_sha256` NULL | **68/68** |

---

## 1. Goals / Non-goals

### Goals (design)

1. Define a deterministic, AuthZ-safe procedure to copy each in-scope legacy object to its canonical twin and, only after verification, update `beat_audio_assets.object_key`.
2. Quarantine anomalies (especially identity mismatch) from automatic migration (**OD-BF-01 LOCKED**).
3. Preserve legacy Storage objects through backfill and post-backfill soak (**OD-BF-04 LOCKED**).
4. Keep retirement, DR-B, dual-write, and orphan GC out of this phase.

### Non-goals

- Implementing or running any copy/update.
- Granting Implementation GO, Backfill GO, or Retirement GO.
- Deleting/moving/renaming legacy objects.
- Migrating orphans, platform keys, or non-`beat-audio` buckets.
- Enabling DR-B or dual-write.
- Closing Phase 1 evidence limitations by declaration.

---

## 2. Backfill model

### 2.1 Key shapes

```text
LEGACY (source shape):
  user/{ownerId}/{beatId}/master/{pathAssetId}.bin

CANONICAL (destination shape):
  user/{ownerId}/{beatId}/{assetId}/master.bin
```

Product builders (SSOT @ `f514a51`):

- Destination: `buildUserBeatAudioObjectKey({ ownerId, beatId, assetId, purpose: "MASTER" })`
- Expected DR-A twin (validation only): `buildLegacyUserBeatMasterObjectKey({ ownerId, beatId, assetId })`

### 2.2 Authoritative identities

| Identity | Authoritative source | Must NOT be authoritative |
|----------|----------------------|---------------------------|
| `asset_id` | `beat_audio_assets.id` | Path UUID alone |
| `beat_id` | `beat_audio_assets.beat_id` = `beats.id` | Path beat alone |
| `owner_id` | `beats.owner_id` (ownership_type = USER) | Path owner alone / client claim |
| Source Storage key | **Stored** `beat_audio_assets.object_key` | Rebuilt twin if it differs from stored key |
| Destination key | Builder from **DB** owner/beat/`asset.id` | Client-supplied path |

**PATH ≠ AUTHORIZATION.** Path segments are **cross-checks**, not ownership grants.

### 2.3 Per-asset pipeline (logical — do not execute)

```text
1. SOURCE SELECTION
   Load beat_audio_assets row + joined beats row.
   Candidate iff:
     storage_bucket = 'beat-audio'
     purpose = MASTER
     object_key matches legacy USER regex
     ownership_type = USER
     NOT already canonical

2. DESTINATION DERIVATION
   ownerId  = beats.owner_id
   beatId   = beats.id / asset.beat_id (must equal)
   assetId  = beat_audio_assets.id
   destKey  = buildUserBeatAudioObjectKey(...)

3. MAPPING VALIDATION
   sourceKey = asset.object_key  (as stored)
   expectedTwin = buildLegacyUserBeatMasterObjectKey(ownerId, beatId, assetId)
   IF sourceKey ≠ expectedTwin → ANOMALY → QUARANTINE (no auto migrate)
   ELSE continue

4. PREFLIGHT (read-only)
   See §5. Emit MIGRATE | SKIP | QUARANTINE | FAIL | OWNER_REVIEW.

5. COPY (only if preflight = MIGRATE and live mode + Owner GO)
   Copy Storage object: sourceKey → destKey within beat-audio.
   NO overwrite if dest exists with different content.
   NO delete of source.

6. VERIFICATION
   source still exists
   dest exists
   size match (required)
   checksum compare if available; if NULL → UNKNOWN (not PASS)
   optional content-type metadata compare if available

7. DB object_key UPDATE (only if verification allows UPDATE per §7)
   UPDATE ... SET object_key = destKey
   WHERE id = assetId AND object_key = sourceKey  -- optimistic lock

8. POST-COPY VALIDATION
   Re-read row: object_key == destKey
   Storage: source retained + dest present
   Sample Access Gate / signed URL against DB key (ops evidence)
   Emit per-asset audit record
```

### 2.4 Out of migrate set

| Item | Action |
|------|--------|
| Already-canonical USER (2) | SKIP |
| Platform (3) | SKIP |
| Orphans (30) | SKIP · ARCH-04/05 |
| K-04 `users/…` orphans | SKIP · ARCH-04/05 |
| Non-MASTER purpose | FAIL / SKIP |
| Non-USER ownership | FAIL / QUARANTINE |

---

## 3. Identity mismatch — anomaly workflow

### 3.1 Definition

**IDENTITY_MISMATCH** when any of:

1. Path owner UUID ≠ `beats.owner_id`
2. Path beat UUID ≠ `asset.beat_id`
3. Path asset UUID (filename stem in legacy key) ≠ `asset.id`
4. Stored `object_key` ≠ `buildLegacyUserBeatMasterObjectKey(DB ids)`

Phase 0 evidence: **1** row with (3)/(4); owner/beat matched.

Known instance (for Owner review — not auto-fixed):

| Field | Value |
|-------|--------|
| `asset.id` | `000d406d-265e-4e49-bd3f-a542d5dd0b41` |
| Path asset UUID | `ef9e21dc-d941-4608-b26e-ee4ea417ad63` |
| Beat | `520b9eb8-1ae8-49e6-8a4a-e5f7a8533d85` |

### 3.2 Detection

Preflight must compute:

```text
expectedTwin = buildLegacyUserBeatMasterObjectKey(dbOwner, dbBeat, dbAssetId)
IF asset.object_key ≠ expectedTwin → IDENTITY_MISMATCH
```

Do **not** assume which UUID is “correct.”

### 3.3 Isolation / logging

| Step | Requirement |
|------|-------------|
| Batch inclusion | **Exclude** from automatic MIGRATE set |
| Classification | **ANOMALY** |
| Action | **QUARANTINE** + **OWNER_REVIEW** |
| Log fields | `asset_id`, `beat_id`, `owner_id`, `source_key`, `expected_twin`, `parsed_path_asset_id`, `replaced_by_asset_id`, sizes, exists flags |
| Evidence pack | DB row dump · Storage HEAD on stored key · Storage HEAD on expected twin (expect miss) · whether path UUID exists as another asset |

### 3.4 Owner lock (OD-BF-01)

```text
ANOMALOUS ROW = QUARANTINE / NO AUTOMATIC MIGRATION
Status: CLOSED — OWNER LOCKED
```

If `asset.id` ≠ UUID embedded in the stored legacy `object_key`:

| Required | Forbidden |
|----------|-----------|
| quarantine | automatic migration |
| audit record | DB mutation for that row |
| OWNER_REVIEW | Storage overwrite |
| | source deletion |

Any future exception for a quarantined row requires a **new** explicit Owner act — not implied by this lock.

---

## 4. Integrity model

### 4.1 Result vocabulary

| State | Meaning |
|-------|---------|
| **PASS** | Check executed and satisfied |
| **FAIL** | Check executed and failed |
| **UNKNOWN** | Check not possible with available evidence (e.g. checksum NULL) |
| **ANOMALY** | Invariant broken / unexpected identity or metadata |

### 4.2 Checks

| Check | PASS when | FAIL when | UNKNOWN when |
|-------|-----------|-----------|--------------|
| Source exists | Storage object at `sourceKey` | Missing | — |
| Dest absent (pre-copy) | No object at `destKey` | Exists (conflict path) | — |
| Dest exists (post-copy) | Object at `destKey` | Missing after copy | — |
| Size match | `source.byte_size` / Storage size == dest size (and aligns with DB `byte_size` if set) | Mismatch | DB/Storage size metadata unavailable |
| MIME/content-type | Equal if both present | Conflict if both present and differ | Either side missing |
| Checksum | Both sides hash and equal (or DB hash matches dest) | Hash mismatch | **`checksum_sha256` NULL** or hash unavailable |
| Source retention | Source still present after copy + after DB update | Source deleted | — |
| Copy result | Provider success + dest present | Provider error / partial | — |

### 4.3 Minimal evidence set per asset

Required for an auditable migrate attempt:

1. `asset_id`, `beat_id`, `owner_id`
2. `source_key`, `dest_key`
3. Preflight disposition
4. Source exists + source size
5. Dest exists + dest size (post-copy)
6. Checksum status: PASS | FAIL | **UNKNOWN**
7. DB update status: NOT_ATTEMPTED | SUCCESS | FAIL | SKIPPED
8. Final classification: PASS | FAIL | UNKNOWN | ANOMALY

### 4.4 Checksum NULL policy (**OD-BF-02 LOCKED**)

All **68** legacy rows currently have `checksum_sha256 = NULL` (Phase 0).

Per **OD-KEY-08** and **OD-BF-02**:

```text
checksum NULL = UNKNOWN
UNKNOWN ≠ checksum PASS
Status: CLOSED — OWNER LOCKED
```

**Owner-approved integrity path for checksum UNKNOWN** (size-only), only when **all** hold:

- source exists
- destination exists
- source size == destination size
- correct identity binding
- no conflict
- `checksum_status` remains explicitly **UNKNOWN** in audit telemetry (never labeled checksum PASS)

Migration outcome vocabulary remains: **PASS** | **FAIL** | **UNKNOWN** | **ANOMALY**.

---

## 5. Preflight (mandatory, read-only)

Preflight runs before first copy of a row. Prefer dry-run over entire candidate set.

| Condition | Status | Reason | Action |
|-----------|--------|--------|--------|
| Already canonical `object_key` | PASS/SKIP | Nothing to migrate | **SKIP** |
| Missing DB row / bad join | FAIL | No authoritative identity | **FAIL** |
| `ownership_type ≠ USER` | ANOMALY | Wrong ownership | **QUARANTINE** |
| `storage_bucket ≠ beat-audio` | FAIL | Wrong bucket | **FAIL** |
| `purpose ≠ MASTER` | FAIL | Wrong purpose | **FAIL** |
| Malformed legacy key / traversal | FAIL | Shape invalid | **FAIL** |
| Identity mismatch (twin ≠ stored) | ANOMALY | Path ≠ DB asset.id (or owner/beat) | **QUARANTINE** + **OWNER_REVIEW** |
| Source missing in Storage | FAIL | `missing_storage` | **FAIL** |
| Destination already exists (different content unknown/mismatch) | FAIL/ANOMALY | Conflict | **FAIL** / **OWNER_REVIEW** |
| Destination already exists + byte-identical to source | PASS (copy-done) | Idempotent resume candidate | **SKIP** copy; may proceed to DB gate if still legacy |
| Duplicate dest claimed by another asset | ANOMALY | Collision | **QUARANTINE** |
| Unsupported asset/beat status for policy | — | If Owner restricts set | **SKIP** or **OWNER_REVIEW** |
| Checksum present + mismatch vs recomputed source | FAIL | Integrity | **FAIL** |
| Checksum NULL | UNKNOWN | OD-KEY-08 / OD-BF-02 | Size-only path allowed under OD-BF-02 with checksum_status=UNKNOWN | **MIGRATE** (if other gates PASS) or **OWNER_REVIEW** if inconsistent |
| Inconsistent metadata (DB size vs Storage size) | ANOMALY/FAIL | Metadata drift | **OWNER_REVIEW** or **FAIL** |
| All hard checks PASS + twin match + dest absent + source exists | PASS | Eligible | **MIGRATE** (only after live GO) |

**Mutating preflight is forbidden.** Preflight must not copy, update, or delete.

---

## 6. Batch model

### 6.1 Modes

| Mode | Behavior |
|------|----------|
| **DRY-RUN** | Preflight + planned actions only · zero Storage/DB mutation |
| **LIVE** | Allowed only after **OD-BF-08** Backfill GO + operator approval |

### 6.2 Ordering

Deterministic order recommendation (design):

```text
ORDER BY beat_audio_assets.created_at ASC, beat_audio_assets.id ASC
```

Refresh inventory at run start; do not hard-code the Phase 0 count of 68 as immutable.

### 6.3 Idempotency / resume

| Observed state | Behavior |
|----------------|----------|
| DB legacy + dest absent | Fresh MIGRATE path |
| DB legacy + dest present + size match | Skip copy; evaluate DB UPDATE gate |
| DB legacy + dest present + size mismatch | FAIL · no overwrite |
| DB already canonical + dest present + verifies | SKIP (done) |
| DB canonical + dest missing | ANOMALY · OWNER_REVIEW (should not happen post-success) |
| Interrupted mid-batch | Resume from last incomplete `asset_id`; re-run preflight per row |

### 6.4 Safety invariants (every batch)

- No destination overwrite of differing content
- No source delete
- No retirement
- No dual-write of new legacy keys
- No DR-B
- Per-asset result record required
- Batch summary: MIGRATE success/fail/skip/quarantine counts

### 6.5 Canary (**OD-BF-07 LOCKED**)

```text
DRY-RUN → CANARY → CANARY VERIFY → OWNER/OPERATOR APPROVAL → FLEET BACKFILL
Status: CLOSED — OWNER LOCKED
Canary count / selection size = OWNER-DEFINED OPERATIONAL PARAMETER (not set by Agent)
```

Canary is **REQUIRED** and must:

- be deterministic
- not overwrite destination
- not delete source
- be auditable
- be stoppable
- use **identical logic** to fleet migration

Design constraint: canary assets must be **non-anomalous** (twin match) and pass dry-run MIGRATE disposition.

---

## 7. DB update safety gate

`UPDATE beat_audio_assets.object_key` from legacy → canonical is allowed **only if all** hold:

1. Preflight disposition was MIGRATE (or idempotent copy-done with twin match).
2. Authoritative identities consistent (owner/beat/`asset.id`).
3. **No IDENTITY_MISMATCH** — OD-BF-01: quarantine / no automatic migration (no silent exception).
4. Source still exists at pre-update `object_key`.
5. Destination exists at computed `destKey`.
6. Integrity verification: size match **PASS**; checksum **PASS** **or** (checksum **UNKNOWN** under **OD-BF-02** size-only path with `checksum_status=UNKNOWN` explicit).
7. No conflict with another asset’s `object_key`.
8. Optimistic lock:

```sql
UPDATE beat_audio_assets
SET object_key = :destKey,
    updated_at = now()
WHERE id = :assetId
  AND object_key = :sourceKey
  AND storage_bucket = 'beat-audio';
-- expect exactly 1 row updated
```

9. Re-read confirms `object_key = destKey`.

### If verification = UNKNOWN (checksum)

Under **OD-BF-02**, size-only may authorize UPDATE **only** when the OD-BF-02 checklist in §4.4 is fully satisfied and telemetry records `checksum_status=UNKNOWN`.
If size/existence/binding/conflict checks fail → **NO DB mutation** · status **FAIL** or **ANOMALY**.

---

## 8. Rollback without feature flag (**OD-BF-04 LOCKED**)

Phase 0: DR-A is always-on at `f514a51`; **no feature flag** exists. Owner locks rollback **without requiring a feature flag**.

```text
Status: CLOSED — OWNER LOCKED
```

| Phase | Policy |
|-------|--------|
| **PRE-BACKFILL** | Legacy source remains intact · **no DB mutation** |
| **MID-BACKFILL** | Legacy source remains intact · partial batch must be detectable · already migrated rows **may** be reverted to legacy `object_key` if rollback required · **no source deletion** |
| **POST-BACKFILL** | Legacy sources **retained during soak** · DB `object_key` **may** be reverted to legacy if rollback required · **no retirement** |

**Retirement** remains a completely separate future gate (OD-KEY-07 / RETIREMENT GO = NO).

**Invariant:** Legacy source objects remain until a future retirement GO. Backfill must never couple delete to copy/UPDATE.

---

## 9. Observability contract (**OD-BF-03 LOCKED**)

```text
Minimal telemetry = REQUIRED before live backfill
Status: CLOSED — OWNER LOCKED
```

### 9.1 REQUIRED FOR SAFE BACKFILL (Owner minimum)

| Field / signal | Purpose |
|----------------|---------|
| `batch_id` | Correlate run |
| `asset_id` | Row identity |
| `source_key` | Mapping audit |
| `destination_key` | Mapping audit |
| `started_at` | Timing |
| `finished_at` | Timing |
| `status` | PASS/FAIL/UNKNOWN/ANOMALY |
| `failure_reason` | Machine-readable code |
| `source_size` | Integrity |
| `destination_size` | Integrity |
| `checksum_status` | PASS/FAIL/UNKNOWN (never mislabel NULL as PASS) |
| `DB_update_status` | NOT_ATTEMPTED/SUCCESS/FAIL/SKIPPED |
| `retry_count` | Resume safety |

Telemetry **must** enable: per-asset audit · batch summary · retry identification · failure classification · remaining legacy inventory.

### 9.2 NICE TO HAVE

| Signal | Purpose |
|--------|---------|
| `mode` (DRY-RUN / LIVE) | Operator clarity |
| Content-type compare | Extra integrity |
| Signed-URL smoke result | Playback evidence |
| Operator identity | Audit who ran |
| `legacy_read_count` / `canonical_read_count` in app | Product soak (Design Freeze §16) |
| Alert webhooks | Ops |

---

## 10. Security

Backfill tooling (when eventually implemented) must:

| Rule | Design |
|------|--------|
| AuthZ / ownership source | DB `beats.owner_id` + `ownership_type=USER` |
| DB-authoritative identity | `asset.id` / `beat_id` |
| Exact relation | asset.beat_id = beat.id; path cross-check |
| No client object_key authority | Operator inputs are allowlists of `asset_id`s at most — never free-form Storage paths as authority |
| No arbitrary path migration | Only stored legacy keys that pass shape + twin match; identity mismatch → OD-BF-01 quarantine |
| No cross-owner migration | Dest owner segment = DB owner only |
| No wrong-bucket | `beat-audio` only |
| No purpose mismatch | MASTER only |
| No traversal | Reject `..` / `//` |
| No DR-B expansion | Do not fetch alternate twins for Access Gate in this plan |
| No dual-write | Do not write new legacy keys |

Unit contracts at `f514a51` remain the security regression baseline; live IDOR gaps stay **NOT VERIFIED** until Owner separately authorizes fixtures.

---

## 11. Operator model (**OD-BF-06 LOCKED**)

```text
Status: CLOSED — OWNER LOCKED
Named person / concrete role assignment = OWNER-DEFINED OPERATIONAL PARAMETER (not invented by Agent)
```

Backfill **must** have:

1. an authorized operator
2. preflight
3. dry-run
4. explicit approval gate
5. canary
6. stop conditions
7. abort conditions
8. post-run verification
9. results audit

Backfill **must not** be started by ordinary end-user requests or public UI.

**Abstract roles (unassigned):**

| Role | Responsibility |
|------|----------------|
| Approver | Issues OD-BF-08 Backfill GO (when granted) |
| Operator | Runs dry-run / canary / fleet under GO |
| Reviewer | Reviews quarantine / FAIL / UNKNOWN packs |

### Preconditions (before LIVE)

1. Phase 1 DR-A still deployed / dual-accept live.
2. OD-BF-01…07 policy locks recorded.
3. Dry-run on full candidate set completed with report.
4. Canary sequence (OD-BF-07) completed and verified.
5. Telemetry minimum (OD-BF-03) available.
6. Rollback procedure (OD-BF-04) acknowledged.
7. Separate **OD-BF-08 Backfill GO** granted (currently **NO**).
8. Implementation exists and is approved separately (**IMPLEMENTATION GO** currently **NO**).

### Stop / abort conditions

- Rising FAIL rate beyond Owner/operator threshold (threshold = Owner-defined operational parameter)
- Any unexpected destination conflict
- New IDENTITY_MISMATCH beyond known quarantine set
- Source deletion detected
- Optimistic lock update count ≠ 1
- Operator abort signal

### Reporting

Per-batch artifact + remaining legacy count SQL.
Post-run: sample playback on migrated canonical keys.

---

## 12. Soak model (**OD-BF-05 LOCKED**)

```text
Status: CLOSED — OWNER LOCKED
Concrete soak clock duration = 24 HOURS (Owner Decision — formal)
  Evidence: docs/audits/AUDIT_FAR_01_SOAK_START.md
This lock does NOT authorize retirement.
```

Owner soak policy:

- pre-backfill baseline required
- dry-run required
- canary required
- post-canary verification required
- fleet migration only after canary verification
- post-backfill soak required **before retirement readiness**
- **OD-BF-05 duration = 24h** (Owner-set; not Agent-invented)

| Window | What to measure | Problem signals |
|--------|-----------------|-----------------|
| **Pre-backfill** | Legacy count stable · missing_storage=0 · no new K-02 writers · Phase 1 playback OK | Legacy count growth · new writers |
| **During** | Per-asset results · remaining legacy · FAIL/UNKNOWN/ANOMALY rates | Conflicts · size mismatch · lock failures |
| **Post-backfill** | Remaining legacy DB refs · playback on canonical · source retention · no orphan growth from job | Playback FAIL · missing dest · accidental source delete |
| **Retirement readiness** | Legacy DB refs = 0 · **24h soak elapsed** · OD-KEY-07 conditions · backup policy | Any residual refs · integrity incidents |

**RETIREMENT GO = NO** — soak completion ≠ retirement authorization.

---

## 13. Failure matrix

| Condition | Classification | Action | DB mutation | Owner review |
|-----------|----------------|--------|-------------|--------------|
| Source missing | FAIL | FAIL | NO | Optional |
| Destination exists (content differs / unknown) | FAIL / ANOMALY | FAIL · no overwrite | NO | YES if ambiguous identical? |
| Destination exists + identical size (copy-done) | PASS | SKIP copy · DB gate if needed | Conditional | No |
| Identity mismatch | ANOMALY | QUARANTINE (OD-BF-01) | NO | **YES** |
| Checksum mismatch | FAIL | FAIL | NO | Optional |
| Checksum NULL | UNKNOWN | Size-only under OD-BF-02 · never label checksum PASS | Conditional (OD-BF-02 checklist) | Audit must show UNKNOWN |
| Size mismatch | FAIL | FAIL | NO | Optional |
| Wrong owner (path vs DB) | ANOMALY | QUARANTINE | NO | YES |
| Wrong beat | ANOMALY | QUARANTINE | NO | YES |
| Wrong asset (path vs id) | ANOMALY | QUARANTINE | NO | YES |
| Malformed key / traversal | FAIL | FAIL | NO | No |
| Wrong bucket | FAIL | FAIL | NO | No |
| Wrong purpose | FAIL | FAIL | NO | No |
| Copy failure | FAIL | FAIL · retain source · leave partial dest policy | NO | If persistent |
| DB update failure / 0-row lock | FAIL | FAIL · dest may exist | NO (or rolled back) | YES if stuck state |
| Verification UNKNOWN (checksum) with size/binding OK | UNKNOWN | DB UPDATE allowed only via OD-BF-02 path | Conditional | Telemetry must record UNKNOWN |
| Retry after transient FAIL | — | Finite retry · re-preflight | Only after full PASS gate | If exhausted |
---

## 14. Acceptance criteria (future implementation)

Each AC is testable; none are implemented by this document.

| ID | Criterion | Test idea |
|----|-----------|-----------|
| **AC-BF-01** | Deterministic dest from DB identities via WRITE SSOT builder | Unit: dest == `buildUserBeatAudioObjectKey` |
| **AC-BF-02** | Source always = stored `object_key` | Unit/integration fixture |
| **AC-BF-03** | Identity mismatch never auto-migrates | Fixture with mismatched path → QUARANTINE |
| **AC-BF-04** | No overwrite of differing dest | Dest exists different size → FAIL |
| **AC-BF-05** | No delete of source in migrate path | Assert source exists post-success |
| **AC-BF-06** | Source retention after DB update | Storage list after UPDATE |
| **AC-BF-07** | Idempotent re-run | Second run → SKIP/done without error |
| **AC-BF-08** | Resumable after interrupt | Partial batch resume |
| **AC-BF-09** | Integrity: size PASS required; checksum NULL ≠ PASS | Assert UNKNOWN path |
| **AC-BF-10** | DB update only with optimistic lock on legacy key | Concurrent change → 0 update |
| **AC-BF-11** | Security binding: wrong owner/beat/asset refused | Negative tests |
| **AC-BF-12** | Anomaly quarantine auditable | Log contains required fields |
| **AC-BF-13** | Rollback path restores legacy key while source retained | Mid/post drill in non-prod |
| **AC-BF-14** | Observability artifact contains REQUIRED fields | Schema check on run output |
| **AC-BF-15** | Dry-run mutates nothing | DB/Storage checksum before=after |
| **AC-BF-16** | Orphans/platform untouched | Counts stable |
| **AC-BF-17** | No dual-write / no DR-B / no retirement in tool | Code review + negative tests |

---

## 15. OWNER DECISION LOCK

**Recorded:** 2026-10-02 · Owner-approved OD-BF-01…08 as stated in this section.
**Does not** reopen OD-KEY-* / Strategy B / DR-A / dual-write NO / DR-B deferred / orphan ARCH-04/05.

| ID | Decision | Status | Consequence |
|----|----------|--------|-------------|
| **OD-BF-01** | Identity anomaly → **QUARANTINE / NO AUTOMATIC MIGRATION** (audit + OWNER_REVIEW; no DB mutation / overwrite / source delete) | **CLOSED — OWNER LOCKED** | Mismatched rows excluded from auto migrate |
| **OD-BF-02** | `checksum NULL = UNKNOWN` ≠ PASS; size-only path allowed only with explicit UNKNOWN labeling + full OD-BF-02 checklist | **CLOSED — OWNER LOCKED** | Outcomes: PASS/FAIL/UNKNOWN/ANOMALY |
| **OD-BF-03** | Minimal telemetry **REQUIRED** before live (batch_id, asset_id, keys, times, status, failure_reason, sizes, checksum_status, DB_update_status, retry_count) | **CLOSED — OWNER LOCKED** | No LIVE without auditability |
| **OD-BF-04** | Rollback **without feature flag**: retain sources; mid/post may revert `object_key` to legacy; no retirement in backfill | **CLOSED — OWNER LOCKED** | Sources survive soak |
| **OD-BF-05** | Soak policy: baseline → dry-run → canary → verify → fleet → post-backfill soak before retirement readiness; **duration = 24h** (Owner Decision); **not** retirement GO | **CLOSED — OWNER LOCKED** | Retirement remains separate |
| **OD-BF-06** | Operator model: authorized operator + preflight + dry-run + approval + canary + stop/abort + post-verify + audit; no public UI / user-request trigger; named operator = Owner-defined operational parameter | **CLOSED — OWNER LOCKED** | Controlled ops only |
| **OD-BF-07** | Canary **REQUIRED**: DRY-RUN → CANARY → VERIFY → APPROVAL → FLEET; identical logic; no overwrite/delete; count = Owner-defined operational parameter | **CLOSED — OWNER LOCKED** | No fleet before canary verify |
| **OD-BF-08** | Production backfill requires separate **OWNER BACKFILL GO** even after design/impl/tests/build | **CLOSED AS SEPARATE GATE** | **BACKFILL GO = NO** until that act |

```text
BACKFILL IS NOT AUTHORIZED.
IMPLEMENTATION GO = NO
BACKFILL GO       = NO
RETIREMENT GO     = NO
```

Related prior locks (unchanged): OD-KEY-04 NO dual-write · OD-KEY-07 retirement later · OD-KEY-08 NULL ≠ auto PASS · OD-KEY-09 DR-B deferred · Strategy B · DR-A shipped · canonical WRITE SSOT · shared dual-accept helper · orphans ARCH-04/05.

---

## 16. Recommended sequence (still blocked on GO gates)

```text
0. OD-BF-01…07 policy = LOCKED (this document)
1. IMPLEMENTATION GO = NO  →  await separate Owner act to build tooling
2. Implement tooling + tests against AC-BF-*  (only after Implementation Authorization)
3. DRY-RUN full inventory
4. CANARY → CANARY VERIFY (OD-BF-07)
5. OWNER/OPERATOR APPROVAL
6. OD-BF-08 OWNER BACKFILL GO  (currently NO)
7. FLEET LIVE in batches
8. Post-backfill soak (OD-BF-05; **duration = 24h**; see `AUDIT_FAR_01_SOAK_START.md`)
9. Retirement readiness audit — SEPARATE GATE · RETIREMENT GO = NO
```

---

## 17. Explicit prohibitions (current)

While **IMPLEMENTATION GO = NO** and **BACKFILL GO = NO**:

- No backfill script / worker / cron / API / UI
- No Storage copy/move/delete
- No `object_key` UPDATE
- No checksum backfill assuming PASS
- No automatic migration of anomalous rows (OD-BF-01)
- No orphan GC
- No retirement
- No DR-B
- No dual-write

---

## Repository safety (this lock session)

| Check | Result |
|-------|--------|
| Product code | **UNCHANGED** |
| DB / Storage / ENV | **UNCHANGED** |
| Artifact | **Only** `docs/audits/DESIGN_FAR_01_BACKFILL.md` |
| Commit / Push / Deploy | **NONE** |

---

**OWNER DECISION LOCK COMPLETE**
**BACKFILL IS NOT AUTHORIZED**
**IMPLEMENTATION GO = NO**
**BACKFILL GO = NO**
**RETIREMENT GO = NO**
