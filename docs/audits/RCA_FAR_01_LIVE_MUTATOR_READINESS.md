# RCA — FAR-01 LIVE Mutator Readiness (Gate C Track 1–2)

**Type:** Root-cause / gap analysis (documentation only)
**Date:** 2026-10-03
**Scope:** Production mutator adapters · LIVE credential boundary · ordering / rollback / retry
**Does not:** implement production adapters · provision credentials · execute Canary / Backfill · mutate Production

```text
BASELINE GIT SHA (committed) = f9500b3
EVIDENCE DRY-RUN ID          = far01-bf-2026-10-02T23-37-58-039Z
CHECKSUM CAMPAIGN ID         = far01-checksum-campaign-2026-10-03
CANARY / BACKFILL / FLEET    = NOT EXECUTED
DB / STORAGE MUTATION        = 0
SERVICE-ROLE                 = NO
LIVE CREDENTIALS             = NOT PROVISIONED
EXISTING EVIDENCE JSON       = UNMODIFIED
```

---

## 1. Executive summary

Library contracts and LIVE orchestration (`mutators.ts` · `batch.ts` · `gates.ts`) encode the correct mutation order, fail-closed defaults, and optimistic-lock **contract**. **Production mutator adapters do not exist.** LIVE write credentials are **not provisioned**; only a design-time env/class boundary (`live-credentials.ts`) separates them from R1.

**Primary blocker for any future Canary execution:** missing production Storage COPY + DB UPDATE adapters under a scoped LIVE credential.

This RCA does **not** patch those gaps (Architect: create blocker with evidence).

---

## 2. Track 1 — Mutator audit matrix

| Requirement | Library status | Production adapter status | Verdict |
|-------------|----------------|---------------------------|---------|
| Storage COPY source key DB-authoritative | `mapFar01BackfillAsset` / loader; client key denied | N/A (no adapter) | **Contract PASS · Adapter ABSENT** |
| Destination key deterministic | `buildUserBeatAudioObjectKey` | N/A | **Contract PASS · Adapter ABSENT** |
| No arbitrary client key | `assertNoClientObjectKeyAuthority` | N/A | **PASS** |
| `upsert: false` | Required on `Far01StorageMutator.copyObject` | N/A — must enforce in adapter | **Contract PASS · Adapter ABSENT** |
| Destination conflict = hard stop | `preMutationHeadCheck` conflict throw | N/A | **Helper PASS · Adapter ABSENT** |
| Source re-HEAD immediately before mutation | `preMutationHeadCheck` then `copyObject` | N/A | **Orchestration PASS · Adapter ABSENT** |
| DB UPDATE optimistic locking | `updateObjectKeyOptimistic` + `evaluateDbUpdateGate` keys | N/A — SQL must be `WHERE id = $assetId AND object_key = $sourceKey` | **Contract PASS · Adapter ABSENT** |
| Current `object_key` re-read before UPDATE | Optimistic predicate = re-read-as-condition | N/A | **Contract PASS · Adapter ABSENT** |
| Expected old legacy key must match | `optimisticLockSourceKey` = mapped source | N/A | **Contract PASS · Adapter ABSENT** |
| Update only intended asset | `assetId` in mutator params | N/A | **Contract PASS · Adapter ABSENT** |
| No bulk UPDATE | Single-asset call site in `batch.ts` | N/A | **Orchestration PASS · Adapter ABSENT** |
| No owner/beat mutation | Mutator surface is `object_key` only | N/A | **Contract PASS · Adapter ABSENT** |
| Failure closed | Deny mutators without LIVE grant; catch → FAIL | Default deny | **PASS** |
| Ordering: COPY → verify dest → DB UPDATE → verify DB | Implemented in `batch.ts` LIVE branch | N/A | **Orchestration PASS · Adapter ABSENT** |
| Rollback: source retained · no source delete | No delete API on mutator; `planFar01Rollback` DB revert | N/A | **Design PASS · Adapter ABSENT** |
| Destination may remain | No destructive cleanup path | N/A | **PASS (by absence of cleanup)** |
| Retry cannot duplicate/overwrite dest | conflict hard stop; same-size skip-copy | Adapter must honor `upsert:false` | **Helper PASS · Adapter ABSENT** |
| Retry cannot update changed asset | Optimistic lock `rowsAffected !== 1` → FAIL | Adapter must implement predicate | **Contract PASS · Adapter ABSENT** |

### Blocker IDs

| ID | Title | Evidence |
|----|-------|----------|
| **GC-MUT-01** | Production `Far01StorageMutator` adapter missing | `adapters/` has `prod-db-reader` + `prod-storage-inspector` only; grep shows no `copyObject` prod impl |
| **GC-MUT-02** | Production `Far01DbMutator` adapter missing | No `updateObjectKeyOptimistic` prod impl; only inject + deny stubs |
| **GC-MUT-03** | Adapter enforcement of Storage `upsert:false` / fail-if-exists not implementable until GC-MUT-01 | Contract documented in `mutators.ts` header |

**Do not treat library unit tests with injected fakes as proof of production mutator readiness.**

---

## 3. Track 2 — LIVE write credential boundary (design only)

### 3.1 Separation

| Path | Credential class | Role intent |
|------|------------------|-------------|
| Dry-run / R1 | `readonly` (`FAR01_DRYRUN_CREDENTIAL_CLASS`) | `far01_dryrun_readonly` — SELECT / Storage read |
| LIVE mutator | `live_mutator` (`FAR01_LIVE_CREDENTIAL_CLASS`) | Dedicated write-scoped role — **not provisioned** |

R1 JWT on LIVE path → **DENY**.
`live_mutator` class on dry-run path → **DENY**.
Service-role as default / apikey → **DENY** (both paths).

Code: `readonly-client.ts` · `live-credentials.ts` (env names + reject rules only).

### 3.2 Required LIVE credential class (design)

- **Class:** `live_mutator`
- **Transport:** `apikey` = project anon/publishable; `Authorization` = LIVE JWT (role claim ≠ R1)
- **Scope:** single project · `beat-audio` bucket · FAR-01 backfill asset rows only
- **Provisioning:** Owner-authorized future step — **not this Gate C prep**

### 3.3 Minimal DB privileges (design — not applied)

| Allow | Deny |
|-------|------|
| `UPDATE` on `public.beat_audio_assets` **only** `object_key` (and maybe `updated_at` if trigger-required) for rows matching optimistic lock | `INSERT` / `DELETE` / `TRUNCATE` on all FAR-01 tables |
| — | Any mutation of `owner_id`, `beat_id`, purpose, status unrelated to key move |
| — | `UPDATE` on `public.beats` |
| — | Bypass RLS / superuser / service-role |

Suggested predicate (adapter SQL):

```sql
UPDATE public.beat_audio_assets
SET object_key = $destination_key
WHERE id = $asset_id
  AND object_key = $expected_legacy_key
  AND storage_bucket = 'beat-audio';
-- expect rowsAffected = 1
```

### 3.4 Minimal Storage privileges (design — not applied)

| Allow | Deny |
|-------|------|
| COPY / upload-equivalent create of **destination** key when absent (`upsert:false`) | Overwrite existing destination |
| — | DELETE / MOVE / UPDATE of source legacy object |
| — | Writes outside `beat-audio` |
| HEAD / list as needed for pre/post verify (may reuse R1-class read or include read on LIVE role) | Arbitrary bucket admin |

### 3.5 What LIVE credential MUST NOT do

- Act as service-role
- Delete or rewrite source objects
- Bulk-update assets
- Mutate ownership / beat graph
- Authenticate dry-run / inventory refresh
- Imply OD-BF-08 Backfill GO

### 3.6 Dry-run rejection of LIVE credential

- `resolveFar01DryRunReadonlyCredentials` requires `credentialClass === "readonly"`
- `assertCredentialClassIsDryRunReadonly("live_mutator")` throws
- Prod dry-run factory uses R1 client only (`createFar01DryRunReadonlyClient`)

### 3.7 LIVE path distinction from R1

- Separate env names: `FAR01_LIVE_*` vs `FAR01_DRYRUN_*`
- Separate class constant: `live_mutator` vs `readonly`
- LIVE runner (future) must call `resolveFar01LiveMutatorCredentials` + inject mutators; dry-run must never import mutator adapters

**Blocker:** **GC-LIVE-CRED-01** — LIVE credentials not provisioned (expected at this stage; Owner decision required before Canary).

---

## 4. Safety confirmation (this RCA)

| Item | Status |
|------|--------|
| DB mutations | **0** |
| Storage mutations | **0** |
| Service-role used | **NO** |
| LIVE credentials provisioned | **NO** |
| Canary / Backfill / Fleet / Retirement | **NOT EXECUTED** |
| Production adapters shipped | **NO** |

---

## 5. Classification impact

Until **GC-MUT-01**, **GC-MUT-02**, and **GC-LIVE-CRED-01** are closed under separate Owner/Architect GO, Canary execution remains **BLOCKED** regardless of inventory/integrity readiness.
