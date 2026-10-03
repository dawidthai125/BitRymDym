# AUDIT — FAR-01 Production Dry-Run Evidence Review

**Type:** Evidence review only (no mutation · no remediations · no GO)
**Date:** 2026-10-03
**Owner ask:** Evidence Review after Production Dry-Run PASS
**Source archive (unmodified):** `docs/audits/evidence/far01-prod-dry-run-2026-10-03.json`
**Prior execution audit:** `docs/audits/AUDIT_FAR_01_PRODUCTION_DRY_RUN_EXECUTION.md`

```text
SCOPE                      = READ-ONLY evidence analysis
PRODUCTION MUTATION        = 0
CANARY / FLEET / RETIREMENT= NOT EXECUTED
BACKFILL GO (OD-BF-08)     = NO
ARCHIVE MODIFIED           = NO
CODE MODIFIED              = NO
COMMIT / PUSH / DEPLOY     = NO
```

---

## 1. Scope

Analyze classification of all **70** USER MASTER candidates from the authorized Production Dry-Run archive:

- explain **67 UNKNOWN**
- identify **1 ANOMALY** / **1 QUARANTINE** (same asset)
- confirm **2 PASS**
- confirm orphans / mutations / security evidence
- answer decision-readiness questions without creating Backfill GO

---

## 2. Source evidence

| Source | Role |
|--------|------|
| JSON archive `far01-prod-dry-run-2026-10-03.json` | SSOT per-asset telemetry + inventory_assets |
| `preflight.ts` / `mapping.ts` / `integrity.ts` / `batch.ts` | Exact FAR-01 rules producing classifications |
| Live inventory fields in archive | Current counts (not historical 68/2/3/30 alone) |

**batch_id:** `far01-bf-2026-10-02T23-37-58-039Z`
**mode:** `DRY_RUN`
**live_mutations_attempted:** `0`
**authorization.backfillGo:** `false`

---

## 3. Current inventory (from archive)

| Class | Count | Evidence class |
|-------|------:|----------------|
| legacy_shape | **68** | LIVE (archive inventory) |
| canonical_shape | **2** | LIVE |
| platform_excluded | **3** | LIVE |
| orphan_storage_excluded | **28** | LIVE |
| user_master_rows / candidate_count | **70** | LIVE |
| destination_conflicts | **0** | LIVE |
| Historical orphan baseline | 30 | HISTORICAL only (Δ −2) |

---

## 4. Classification summary

Two related dimensions in archive:

| Dimension | Field | Distribution |
|-----------|-------|--------------|
| Preflight / inventory **classification** | `inventory_assets[].classification` / `assets[].status` | PASS=2 · UNKNOWN=67 · ANOMALY=1 · FAIL=0 |
| Disposition **action** | `action` | SKIP=2 · MIGRATE=67 · QUARANTINE=1 · FAIL=0 |

| classification | count | % of 70 | primary reason (exact) |
|----------------|------:|--------:|------------------------|
| UNKNOWN | 67 | 95.71% | `eligible_migrate_checksum_unknown` (OD-BF-02 / C-01: checksum NULL → UNKNOWN; still MIGRATE-eligible) |
| PASS | 2 | 2.86% | `already_canonical` → action SKIP |
| ANOMALY | 1 | 1.43% | `identity_mismatch` (OD-BF-01) → action QUARANTINE |
| FAIL | 0 | 0% | — |

| reason / failure_reason | count | affected |
|-------------------------|------:|----------|
| `eligible_migrate_checksum_unknown` (implied; checksum_status=UNKNOWN + action=MIGRATE; failure_reason null) | 67 | all UNKNOWN asset_ids below |
| `already_canonical` (implied; classification=PASS + action=SKIP) | 2 | PASS asset_ids |
| `identity_mismatch` | 1 | `000d406d-265e-4e49-bd3f-a542d5dd0b41` |

---

## 5. UNKNOWN breakdown (67/67 uniform)

### Exact rule (CODE)

From `runFar01Preflight` / `checksumStatusFromAsset`:

1. `checksum_sha256` null/empty → `checksumStatus = UNKNOWN` (**never PASS**) — OD-BF-02 / C-01.
2. Asset is legacy shape, identity OK, source exists, destination absent, no claim conflict.
3. Return:

```text
classification = UNKNOWN
action         = MIGRATE
reason         = eligible_migrate_checksum_unknown
```

Dry-run batch then keeps telemetry `status=UNKNOWN`, `content_identity=UNKNOWN`, `DB_update_status=SKIPPED` (no mutation).

### Uniform live evidence (all 67)

| Predicate | Result |
|-----------|--------|
| source_existence | **true** (none missing source) |
| source_size | non-null (observed 2646044 on sampled rows) |
| destination_existence | **false** (canonical dest not present — expected for legacy) |
| identity_anomaly | **false** |
| checksum_status | **UNKNOWN** |
| content_identity | **UNKNOWN** |
| action | **MIGRATE** |
| current_key ≠ expected_canonical_key | **true** (legacy → canonical pending) |
| DB_update_status | **SKIPPED** |
| retry_count | **0** |

### Distinctions requested

| Candidate cause | Applies to 67 UNKNOWN? |
|-----------------|------------------------:|
| checksum_sha256 = NULL → UNKNOWN | **YES — primary / sole classifying cause** |
| brak source | **NO** (0) |
| brak destination | Present as expected legacy state; **not** the classifying FAIL reason |
| brak możliwości potwierdzenia integralności kryptograficznej | **YES** (consequence of NULL checksum) |
| niepełne metadata size | **NO** (source_size present) |
| identity mismatch | **NO** (0 among UNKNOWN) |

**UNKNOWN must not be treated as PASS.**

### Asset IDs (67)

- `02c18fb2-80ce-4b1d-b73b-8995d2612bb5`
- `05d4a7d7-167e-4b79-b7c9-a556aaa1018b`
- `06f0226f-86e4-48fd-98ce-05bf333959d2`
- `07edeb88-7107-432a-b1b0-a7debc464e37`
- `10b7d85a-4aef-4d03-9626-e4c546f81215`
- `11c3d80b-2456-48fb-9d32-64947a59bc49`
- `16c1e5f1-e148-4265-8472-1cdc6ff9f81e`
- `16dfeb4e-6825-480a-afd5-a0517489aa6f`
- `1e23f13b-2a13-4a73-a4c8-2cfb82e4cf5a`
- `1fe47333-caea-4f0c-99bf-a6c180115e2e`
- `25279490-0b8b-45ed-97e4-547adc669a0b`
- `26abead3-b7a1-4b21-915a-a3d29966da6a`
- `27d3b445-72a9-45c7-8976-1d6bbfd35b65`
- `2a24d6f5-f330-4d7b-93d3-05dc5a304bfa`
- `2f7c11a6-23fc-466e-be8d-40809110f6e7`
- `3451af41-5b89-48c8-a665-cd2294e58d80`
- `3b9f9a27-f199-4cd5-a464-32b1e96a8600`
- `3fbceb89-e39d-406b-b7ee-aeefd8264eee`
- `420848a7-cae0-4f16-8bbe-54f10952173f`
- `443b7a29-722c-40cf-b7bc-ecc8fe095294`
- `4b19dc11-86b5-435f-a8ad-69b5bfcbe2d0`
- `4c3319ae-d276-447b-882e-e133caf5741b`
- `4c57ab86-f061-40cc-b9bb-75bbd7a5a1cd`
- `5810a1a7-d494-461e-b994-a060c27f68d4`
- `5ba0b425-d313-47e9-bc52-7b5c1494f271`
- `5f4be05b-5070-462b-9c12-85959cfc19ed`
- `6170c8ee-cbe3-4b62-9ecc-459224869673`
- `63cd9990-af40-4c09-a0b7-896aa1399f2a`
- `6a003586-ff7c-4a5e-9436-26f89f3c12eb`
- `6e867206-0336-4ae5-9ffc-cb8ba79d983d`
- `6f9562cf-2d13-4f86-9d5a-a92f32cb82e8`
- `71fd3e3b-ab86-4092-b3d6-e1bce4ba86ac`
- `7bdbd9ca-7dda-45b1-b8ab-e7851d4b9d2a`
- `891d3201-1be0-4859-940f-276f547c63eb`
- `8a6bd17f-22dd-4f4f-8a6a-7220ee4e2ce9`
- `8ab965c7-057f-4d20-89c8-443c1c2d7c48`
- `91b9c62b-bb6d-498e-8f95-67a064ef8740`
- `97be7772-24b3-45b2-a484-5f5861c797a0`
- `9b6fa035-3fb9-470f-bdeb-069611a0b0a6`
- `9c33c207-a911-463e-a1ad-cb0d68e34d3b`
- `a01a313c-5a03-49a5-a053-c5478b229d95`
- `a03b099a-1cdd-40fe-8e85-5b30602fbc94`
- `a63c1167-f7ca-4605-8ac2-a1fd209b2cb3`
- `a7fd76ab-2809-45ee-b024-1a877adbe6d9`
- `aadf9b3a-54b2-4dc5-80c1-72e5e5f433e0`
- `b19688b2-26c5-491b-a6bf-0d241f80e013`
- `b4ad3da8-d87d-4d1b-a5cc-c7322dd0e3c9`
- `b67b8769-7e81-4d14-8b1d-5de6ecc1f6c1`
- `b6aa0bd5-b8b5-41c0-9ef7-a66e047e21c8`
- `b7fd6e8b-2e01-4d55-88ac-de5c1e293b57`
- `be025937-f031-4072-9a44-6284b5c6dee7`
- `c803007d-0ecd-4445-b135-1b098bb2307f`
- `cb944166-7389-4d3f-98b3-872cc326fd34`
- `d1b0b45a-82f0-435d-be64-2a58eeeb1d09`
- `de62e763-8165-4e8d-a2fa-af805aeccb36`
- `e2cf8652-cee3-474b-99b6-9197b1d9f982`
- `e3fd5fb4-ba3b-4fef-a975-468ea0fc5c88`
- `edd2ca81-13fd-4705-baf0-47ec8e41ee93`
- `f03473d7-497d-4997-abc8-f9ce4e548074`
- `f5537bec-3c24-4a09-b482-77ff4d16bc45`
- `f55e7697-5d50-4cfc-ac67-cbb056371066`
- `f5d558ce-b72a-4446-aec8-2fa509220b5d`
- `f6b1b3e8-b328-401c-919c-c38560aa8ce4`
- `f7f8c87c-23aa-4fed-84e3-41e582776308`
- `fd682d80-2e0f-4b3c-85ba-2bef62d17cde`
- `fe278d0f-c100-46a4-8a15-95bfbad684b0`
- `ff1d5b32-7874-4672-af81-f1e1fca63afe`

---

## 6. ANOMALY detail (1)

**Same physical asset as QUARANTINE** (`classification=ANOMALY` + `action=QUARANTINE`).

| Field | Value |
|-------|-------|
| asset_id | `000d406d-265e-4e49-bd3f-a542d5dd0b41` |
| owner_id | `e5f13715-46df-4021-b7b6-d0e3bd1a11ef` |
| beat_id | `520b9eb8-1ae8-49e6-8a4a-e5f7a8533d85` |
| current_object_key | `user/e5f13715-46df-4021-b7b6-d0e3bd1a11ef/520b9eb8-1ae8-49e6-8a4a-e5f7a8533d85/master/ef9e21dc-d941-4608-b26e-ee4ea417ad63.bin` |
| expected_canonical_key | `user/e5f13715-46df-4021-b7b6-d0e3bd1a11ef/520b9eb8-1ae8-49e6-8a4a-e5f7a8533d85/000d406d-265e-4e49-bd3f-a542d5dd0b41/master.bin` |
| source_existence / size | true / 2646044 |
| destination_existence | false |
| checksum_status | UNKNOWN |
| identity_anomaly | **true** |
| failure_reason | `identity_mismatch` |
| DB_update_status | NOT_ATTEMPTED |
| retry_count | 0 |

### Exact anomaly condition

Legacy path embeds **pathAssetId** = `ef9e21dc-d941-4608-b26e-ee4ea417ad63` (filename UUID),
while DB `asset.id` = `000d406d-265e-4e49-bd3f-a542d5dd0b41`.

Also `sourceKey !== expectedLegacyTwin` (expected twin would use DB asset id in `master/<assetId>.bin`).

Owner/beat path segments **match** DB owner/beat; mismatch is **asset identity in path vs DB**.

### Rule

`mapFar01BackfillAsset` → `identityMismatch=true`
`runFar01Preflight` OD-BF-01:

```text
classification = ANOMALY
action         = QUARANTINE
reason         = identity_mismatch
```

### Why not auto-migrated

OD-BF-01 forbids automatic migration when path identity ≠ DB identity. Destination is derived from DB ids; copying/relinking without Owner review would risk binding the wrong bytes to the wrong asset row.

**No automatic remediations proposed.**

---

## 7. QUARANTINE detail (1)

Identical asset as §6.

| Field | Value |
|-------|-------|
| asset_id | `000d406d-265e-4e49-bd3f-a542d5dd0b41` |
| Exact identity mismatch | pathAssetId `ef9e21dc-…` ≠ DB asset_id `000d406d-…` |
| Identity evidence source | DB `beat_audio_assets.id` + `object_key` vs `parseLegacyUserMasterPath` |
| OD-BF-01 applied | **YES** → QUARANTINE |

**Confirmation:** **QUARANTINE = brak automatycznej migracji.**

---

## 8. PASS detail (2)

| asset_id | owner_id | beat_id | reason |
|----------|----------|---------|--------|
| `4e68c869-892d-4b79-a4b1-1e80db22b47f` | `2f915c63-778d-4279-b9a0-a0afa858c085` | `d627300a-7f72-406f-94f4-a1bcc6765ade` | already_canonical |
| `e31ae14a-925d-40dc-9515-eb80249d460f` | `5dab5dbf-bf4b-43c3-80e0-dcdcb32a0278` | `d578faef-953b-4eb4-a1e5-5016ea3e272c` | already_canonical |

Evidence for both:

- `current_object_key === expected_canonical_key` (canonical shape)
- source_existence=true, destination_existence=true (same key)
- source_size=destination_size=2646044
- identity_anomaly=false
- action=`SKIP`, classification=`PASS`
- checksum_status still `UNKNOWN` (NULL checksum) — **PASS here means shape/disposition readiness (already canonical / skip migrate), not cryptographic content PASS**
- DB_update_status=`NOT_ATTEMPTED` — **no migration executed**

**PASS ≠ executed migration.** Dry-run only classified readiness and skipped migrate.

---

## 9. Orphan evidence

| Item | Value |
|------|-------|
| orphan_storage_excluded | **28** |
| In FAR-01 backfill candidate set | **NO** |
| Cleanup / delete / relink | **NOT EXECUTED** |
| Historical 30 → 28 | Inventory delta only; cause not asserted |

---

## 10. Mutation evidence

| Metric | Value |
|--------|------:|
| live_mutations_attempted | **0** |
| Production DB mutation | **0** |
| Production Storage mutation | **0** |
| COPY/UPLOAD/MOVE/DELETE | **NOT EXECUTED** |

---

## 11. Security evidence

| Check | Result |
|-------|--------|
| mode DRY_RUN | YES |
| backfillGo | false |
| Service-role fallback | NO (execution audit + R1 path) |
| Secrets in archive | none detected in prior secret scan |
| Archive unmodified this review | YES |

---

## 12. Decision readiness

| # | Question | Answer |
|---|----------|--------|
| A | Czy dry-run mechanicznie działa? | **YES** |
| B | Czy production inventory jest verified? | **YES** |
| C | Czy istnieją FAIL? | **NO** |
| D | Czy istnieje ANOMALY? | **YES** (1) |
| E | Czy istnieje QUARANTINE? | **YES** (1) |
| F | Czy checksum coverage pozwala traktować UNKNOWN jako PASS? | **NO** |
| G | Czy Backfill GO jest obecnie uzasadniony przez evidence? | **NIE** — nie podejmuj GO samodzielnie |
| H | Czy wymagany jest dalszy Owner Review? | **YES** |

---

## 13. Explicit statements

```text
Backfill GO: NO
Canary: NOT EXECUTED
Fleet: NOT EXECUTED
Retirement: NOT EXECUTED
```

---

## 14. Appendix — full 70-asset evidence table

Joined from `inventory_assets` + `assets` telemetry (archive SSOT).

| asset_id | owner_id | beat_id | current_object_key | expected_canonical_key | classification | action | checksum_status | source_existence | source_size | destination_existence | destination_size | identity_anomaly | failure_reason | DB_update_status | retry_count | tel_status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 000d406d-265e-4e49-bd3f-a542d5dd0b41 | e5f13715-46df-4021-b7b6-d0e3bd1a11ef | 520b9eb8-1ae8-49e6-8a4a-e5f7a8533d85 | user/e5f13715-46df-4021-b7b6-d0e3bd1a11ef/520b9eb8-1ae8-49e6-8a4a-e5f7a8533d85/master/ef9e21dc-d941-4608-b26e-ee4ea417ad63.bin | user/e5f13715-46df-4021-b7b6-d0e3bd1a11ef/520b9eb8-1ae8-49e6-8a4a-e5f7a8533d85/000d406d-265e-4e49-bd3f-a542d5dd0b41/master.bin | ANOMALY | QUARANTINE | UNKNOWN | true | 2646044 | false | null | true | identity_mismatch | NOT_ATTEMPTED | 0 | ANOMALY |
| 02c18fb2-80ce-4b1d-b73b-8995d2612bb5 | ddd26eb4-c889-4abe-bdfb-ff0390b6fd48 | 5332b7b6-bcf6-4813-b279-27963fc2b875 | user/ddd26eb4-c889-4abe-bdfb-ff0390b6fd48/5332b7b6-bcf6-4813-b279-27963fc2b875/master/02c18fb2-80ce-4b1d-b73b-8995d2612bb5.bin | user/ddd26eb4-c889-4abe-bdfb-ff0390b6fd48/5332b7b6-bcf6-4813-b279-27963fc2b875/02c18fb2-80ce-4b1d-b73b-8995d2612bb5/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 05d4a7d7-167e-4b79-b7c9-a556aaa1018b | 87712e71-faa0-4dca-9e46-54ab22981f5d | 7305f48c-a836-4df5-9684-f43207b19b40 | user/87712e71-faa0-4dca-9e46-54ab22981f5d/7305f48c-a836-4df5-9684-f43207b19b40/master/05d4a7d7-167e-4b79-b7c9-a556aaa1018b.bin | user/87712e71-faa0-4dca-9e46-54ab22981f5d/7305f48c-a836-4df5-9684-f43207b19b40/05d4a7d7-167e-4b79-b7c9-a556aaa1018b/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 06f0226f-86e4-48fd-98ce-05bf333959d2 | 15e52402-6b39-4bd5-a9e8-4943fe5e7fa8 | 6b1cfa21-4a46-49ee-8f4a-2cfe27f5ed7b | user/15e52402-6b39-4bd5-a9e8-4943fe5e7fa8/6b1cfa21-4a46-49ee-8f4a-2cfe27f5ed7b/master/06f0226f-86e4-48fd-98ce-05bf333959d2.bin | user/15e52402-6b39-4bd5-a9e8-4943fe5e7fa8/6b1cfa21-4a46-49ee-8f4a-2cfe27f5ed7b/06f0226f-86e4-48fd-98ce-05bf333959d2/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 07edeb88-7107-432a-b1b0-a7debc464e37 | afee875a-9a0c-427c-a37e-c4fb4201311f | e6292453-5ae4-4f54-bc7e-531f22b51b1a | user/afee875a-9a0c-427c-a37e-c4fb4201311f/e6292453-5ae4-4f54-bc7e-531f22b51b1a/master/07edeb88-7107-432a-b1b0-a7debc464e37.bin | user/afee875a-9a0c-427c-a37e-c4fb4201311f/e6292453-5ae4-4f54-bc7e-531f22b51b1a/07edeb88-7107-432a-b1b0-a7debc464e37/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 10b7d85a-4aef-4d03-9626-e4c546f81215 | c0e2e60e-faa1-42dc-ab6d-37b321112fda | b7a136de-787b-406b-b6bb-98057d2fb7ac | user/c0e2e60e-faa1-42dc-ab6d-37b321112fda/b7a136de-787b-406b-b6bb-98057d2fb7ac/master/10b7d85a-4aef-4d03-9626-e4c546f81215.bin | user/c0e2e60e-faa1-42dc-ab6d-37b321112fda/b7a136de-787b-406b-b6bb-98057d2fb7ac/10b7d85a-4aef-4d03-9626-e4c546f81215/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 11c3d80b-2456-48fb-9d32-64947a59bc49 | 10cd1e2b-c580-4d1e-acfd-522a8ed2481d | 3ecc02d8-57ed-480d-a28e-86a5559d6775 | user/10cd1e2b-c580-4d1e-acfd-522a8ed2481d/3ecc02d8-57ed-480d-a28e-86a5559d6775/master/11c3d80b-2456-48fb-9d32-64947a59bc49.bin | user/10cd1e2b-c580-4d1e-acfd-522a8ed2481d/3ecc02d8-57ed-480d-a28e-86a5559d6775/11c3d80b-2456-48fb-9d32-64947a59bc49/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 16c1e5f1-e148-4265-8472-1cdc6ff9f81e | 10cd1e2b-c580-4d1e-acfd-522a8ed2481d | d74260a3-5b2e-43a6-b28f-66c21672587e | user/10cd1e2b-c580-4d1e-acfd-522a8ed2481d/d74260a3-5b2e-43a6-b28f-66c21672587e/master/16c1e5f1-e148-4265-8472-1cdc6ff9f81e.bin | user/10cd1e2b-c580-4d1e-acfd-522a8ed2481d/d74260a3-5b2e-43a6-b28f-66c21672587e/16c1e5f1-e148-4265-8472-1cdc6ff9f81e/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 16dfeb4e-6825-480a-afd5-a0517489aa6f | 3b5e5563-31a7-4bbe-864d-7824af5e5c68 | 8d826478-5cea-4864-8fd4-db2bfc4b14a8 | user/3b5e5563-31a7-4bbe-864d-7824af5e5c68/8d826478-5cea-4864-8fd4-db2bfc4b14a8/master/16dfeb4e-6825-480a-afd5-a0517489aa6f.bin | user/3b5e5563-31a7-4bbe-864d-7824af5e5c68/8d826478-5cea-4864-8fd4-db2bfc4b14a8/16dfeb4e-6825-480a-afd5-a0517489aa6f/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 1e23f13b-2a13-4a73-a4c8-2cfb82e4cf5a | 4c9b4e80-0051-4230-a8a6-4c643bd563d9 | 173d421f-8c59-419f-90fc-315d67abbb6a | user/4c9b4e80-0051-4230-a8a6-4c643bd563d9/173d421f-8c59-419f-90fc-315d67abbb6a/master/1e23f13b-2a13-4a73-a4c8-2cfb82e4cf5a.bin | user/4c9b4e80-0051-4230-a8a6-4c643bd563d9/173d421f-8c59-419f-90fc-315d67abbb6a/1e23f13b-2a13-4a73-a4c8-2cfb82e4cf5a/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 1fe47333-caea-4f0c-99bf-a6c180115e2e | 67cab41d-0da7-4a3f-9759-8b5170ad52bd | dde8c29f-18d4-4cc9-af53-4351b17a9b7f | user/67cab41d-0da7-4a3f-9759-8b5170ad52bd/dde8c29f-18d4-4cc9-af53-4351b17a9b7f/master/1fe47333-caea-4f0c-99bf-a6c180115e2e.bin | user/67cab41d-0da7-4a3f-9759-8b5170ad52bd/dde8c29f-18d4-4cc9-af53-4351b17a9b7f/1fe47333-caea-4f0c-99bf-a6c180115e2e/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 25279490-0b8b-45ed-97e4-547adc669a0b | 45680fda-27bb-4076-93d6-42f16061cbe7 | 50cc135a-b808-4e0f-990f-88210e9f9a72 | user/45680fda-27bb-4076-93d6-42f16061cbe7/50cc135a-b808-4e0f-990f-88210e9f9a72/master/25279490-0b8b-45ed-97e4-547adc669a0b.bin | user/45680fda-27bb-4076-93d6-42f16061cbe7/50cc135a-b808-4e0f-990f-88210e9f9a72/25279490-0b8b-45ed-97e4-547adc669a0b/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 26abead3-b7a1-4b21-915a-a3d29966da6a | 57a35191-de8f-4251-b124-e394955209d0 | a885e418-92e8-4606-b316-8a2eff168df6 | user/57a35191-de8f-4251-b124-e394955209d0/a885e418-92e8-4606-b316-8a2eff168df6/master/26abead3-b7a1-4b21-915a-a3d29966da6a.bin | user/57a35191-de8f-4251-b124-e394955209d0/a885e418-92e8-4606-b316-8a2eff168df6/26abead3-b7a1-4b21-915a-a3d29966da6a/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 27d3b445-72a9-45c7-8976-1d6bbfd35b65 | e8679fa8-b9bc-4f6c-afd5-c7dd30f7e807 | 36b834aa-b450-4bbc-a02d-d28cf826806e | user/e8679fa8-b9bc-4f6c-afd5-c7dd30f7e807/36b834aa-b450-4bbc-a02d-d28cf826806e/master/27d3b445-72a9-45c7-8976-1d6bbfd35b65.bin | user/e8679fa8-b9bc-4f6c-afd5-c7dd30f7e807/36b834aa-b450-4bbc-a02d-d28cf826806e/27d3b445-72a9-45c7-8976-1d6bbfd35b65/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 2a24d6f5-f330-4d7b-93d3-05dc5a304bfa | a3594334-d502-4e29-9875-3b7d1dd63540 | 2329671f-6059-43cf-8df6-da58a7c75bbb | user/a3594334-d502-4e29-9875-3b7d1dd63540/2329671f-6059-43cf-8df6-da58a7c75bbb/master/2a24d6f5-f330-4d7b-93d3-05dc5a304bfa.bin | user/a3594334-d502-4e29-9875-3b7d1dd63540/2329671f-6059-43cf-8df6-da58a7c75bbb/2a24d6f5-f330-4d7b-93d3-05dc5a304bfa/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 2f7c11a6-23fc-466e-be8d-40809110f6e7 | 61c25d91-f723-4e92-97a5-1d1451eb4ec3 | c1c0ba8b-99f8-49bc-9a0b-d8bf92517712 | user/61c25d91-f723-4e92-97a5-1d1451eb4ec3/c1c0ba8b-99f8-49bc-9a0b-d8bf92517712/master/2f7c11a6-23fc-466e-be8d-40809110f6e7.bin | user/61c25d91-f723-4e92-97a5-1d1451eb4ec3/c1c0ba8b-99f8-49bc-9a0b-d8bf92517712/2f7c11a6-23fc-466e-be8d-40809110f6e7/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 3451af41-5b89-48c8-a665-cd2294e58d80 | 346dbf79-4363-4079-a82e-63d72866cf49 | e3a4455a-3ae2-483c-9458-8d5e434cd616 | user/346dbf79-4363-4079-a82e-63d72866cf49/e3a4455a-3ae2-483c-9458-8d5e434cd616/master/3451af41-5b89-48c8-a665-cd2294e58d80.bin | user/346dbf79-4363-4079-a82e-63d72866cf49/e3a4455a-3ae2-483c-9458-8d5e434cd616/3451af41-5b89-48c8-a665-cd2294e58d80/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 3b9f9a27-f199-4cd5-a464-32b1e96a8600 | 50bbe051-6eb2-4d3f-98f2-3f34221f984a | a6f515bc-07eb-4070-b70e-a53694c28f6b | user/50bbe051-6eb2-4d3f-98f2-3f34221f984a/a6f515bc-07eb-4070-b70e-a53694c28f6b/master/3b9f9a27-f199-4cd5-a464-32b1e96a8600.bin | user/50bbe051-6eb2-4d3f-98f2-3f34221f984a/a6f515bc-07eb-4070-b70e-a53694c28f6b/3b9f9a27-f199-4cd5-a464-32b1e96a8600/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 3fbceb89-e39d-406b-b7ee-aeefd8264eee | 946e3879-a054-4097-bcfa-e56f9852b3ad | ee2c027a-bad3-4cbf-8763-26e417eebe04 | user/946e3879-a054-4097-bcfa-e56f9852b3ad/ee2c027a-bad3-4cbf-8763-26e417eebe04/master/3fbceb89-e39d-406b-b7ee-aeefd8264eee.bin | user/946e3879-a054-4097-bcfa-e56f9852b3ad/ee2c027a-bad3-4cbf-8763-26e417eebe04/3fbceb89-e39d-406b-b7ee-aeefd8264eee/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 420848a7-cae0-4f16-8bbe-54f10952173f | 0b2e79e2-21d7-4403-b719-13dc30ceae2e | 30fc7587-77d5-42a8-9812-5832544886b3 | user/0b2e79e2-21d7-4403-b719-13dc30ceae2e/30fc7587-77d5-42a8-9812-5832544886b3/master/420848a7-cae0-4f16-8bbe-54f10952173f.bin | user/0b2e79e2-21d7-4403-b719-13dc30ceae2e/30fc7587-77d5-42a8-9812-5832544886b3/420848a7-cae0-4f16-8bbe-54f10952173f/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 443b7a29-722c-40cf-b7bc-ecc8fe095294 | 4755b716-12fb-48ba-ac4d-f636349c4c0d | 130153c0-ae66-4365-84cf-74fdfd902973 | user/4755b716-12fb-48ba-ac4d-f636349c4c0d/130153c0-ae66-4365-84cf-74fdfd902973/master/443b7a29-722c-40cf-b7bc-ecc8fe095294.bin | user/4755b716-12fb-48ba-ac4d-f636349c4c0d/130153c0-ae66-4365-84cf-74fdfd902973/443b7a29-722c-40cf-b7bc-ecc8fe095294/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 4b19dc11-86b5-435f-a8ad-69b5bfcbe2d0 | a8f60580-58ae-4300-a316-5ea6dd9cfd7c | ff0456a0-9119-414b-a940-96aefc9ffabe | user/a8f60580-58ae-4300-a316-5ea6dd9cfd7c/ff0456a0-9119-414b-a940-96aefc9ffabe/master/4b19dc11-86b5-435f-a8ad-69b5bfcbe2d0.bin | user/a8f60580-58ae-4300-a316-5ea6dd9cfd7c/ff0456a0-9119-414b-a940-96aefc9ffabe/4b19dc11-86b5-435f-a8ad-69b5bfcbe2d0/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 4c3319ae-d276-447b-882e-e133caf5741b | 45b9e79b-1110-4db9-b0ab-ee507d95ffd9 | fd364789-0d3c-4af6-beb8-75964108a608 | user/45b9e79b-1110-4db9-b0ab-ee507d95ffd9/fd364789-0d3c-4af6-beb8-75964108a608/master/4c3319ae-d276-447b-882e-e133caf5741b.bin | user/45b9e79b-1110-4db9-b0ab-ee507d95ffd9/fd364789-0d3c-4af6-beb8-75964108a608/4c3319ae-d276-447b-882e-e133caf5741b/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 4c57ab86-f061-40cc-b9bb-75bbd7a5a1cd | b5eb4ad9-3624-465c-9606-4ec2a7d9b67b | c1f7a6de-64c0-4d3e-94d8-282c8221656f | user/b5eb4ad9-3624-465c-9606-4ec2a7d9b67b/c1f7a6de-64c0-4d3e-94d8-282c8221656f/master/4c57ab86-f061-40cc-b9bb-75bbd7a5a1cd.bin | user/b5eb4ad9-3624-465c-9606-4ec2a7d9b67b/c1f7a6de-64c0-4d3e-94d8-282c8221656f/4c57ab86-f061-40cc-b9bb-75bbd7a5a1cd/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 4e68c869-892d-4b79-a4b1-1e80db22b47f | 2f915c63-778d-4279-b9a0-a0afa858c085 | d627300a-7f72-406f-94f4-a1bcc6765ade | user/2f915c63-778d-4279-b9a0-a0afa858c085/d627300a-7f72-406f-94f4-a1bcc6765ade/4e68c869-892d-4b79-a4b1-1e80db22b47f/master.bin | user/2f915c63-778d-4279-b9a0-a0afa858c085/d627300a-7f72-406f-94f4-a1bcc6765ade/4e68c869-892d-4b79-a4b1-1e80db22b47f/master.bin | PASS | SKIP | UNKNOWN | true | 2646044 | true | 2646044 | false |  | NOT_ATTEMPTED | 0 | PASS |
| 5810a1a7-d494-461e-b994-a060c27f68d4 | 213b9dd8-6ce7-4d58-9179-421c6c68ac3e | 13f2bc6d-7d4e-487e-92f3-40d080dadb5a | user/213b9dd8-6ce7-4d58-9179-421c6c68ac3e/13f2bc6d-7d4e-487e-92f3-40d080dadb5a/master/5810a1a7-d494-461e-b994-a060c27f68d4.bin | user/213b9dd8-6ce7-4d58-9179-421c6c68ac3e/13f2bc6d-7d4e-487e-92f3-40d080dadb5a/5810a1a7-d494-461e-b994-a060c27f68d4/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 5ba0b425-d313-47e9-bc52-7b5c1494f271 | e111778c-516b-469c-b902-4b989b24d92e | a9408146-b99a-4c00-bce1-fffe9d4a5f27 | user/e111778c-516b-469c-b902-4b989b24d92e/a9408146-b99a-4c00-bce1-fffe9d4a5f27/master/5ba0b425-d313-47e9-bc52-7b5c1494f271.bin | user/e111778c-516b-469c-b902-4b989b24d92e/a9408146-b99a-4c00-bce1-fffe9d4a5f27/5ba0b425-d313-47e9-bc52-7b5c1494f271/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 5f4be05b-5070-462b-9c12-85959cfc19ed | 6dbb12ca-ee84-4f2b-91d7-27332f08efcc | ccd750a4-b637-4e32-8f68-134cfe89a772 | user/6dbb12ca-ee84-4f2b-91d7-27332f08efcc/ccd750a4-b637-4e32-8f68-134cfe89a772/master/5f4be05b-5070-462b-9c12-85959cfc19ed.bin | user/6dbb12ca-ee84-4f2b-91d7-27332f08efcc/ccd750a4-b637-4e32-8f68-134cfe89a772/5f4be05b-5070-462b-9c12-85959cfc19ed/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 6170c8ee-cbe3-4b62-9ecc-459224869673 | 33d14137-708e-483a-b3a7-26433aebc73f | b9f2b442-3cbe-4bb8-93a9-649329d76947 | user/33d14137-708e-483a-b3a7-26433aebc73f/b9f2b442-3cbe-4bb8-93a9-649329d76947/master/6170c8ee-cbe3-4b62-9ecc-459224869673.bin | user/33d14137-708e-483a-b3a7-26433aebc73f/b9f2b442-3cbe-4bb8-93a9-649329d76947/6170c8ee-cbe3-4b62-9ecc-459224869673/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 63cd9990-af40-4c09-a0b7-896aa1399f2a | 5f409782-12c0-4402-982f-e32134037dc4 | 791b6e49-5f72-46d0-be4f-04074db9c9cf | user/5f409782-12c0-4402-982f-e32134037dc4/791b6e49-5f72-46d0-be4f-04074db9c9cf/master/63cd9990-af40-4c09-a0b7-896aa1399f2a.bin | user/5f409782-12c0-4402-982f-e32134037dc4/791b6e49-5f72-46d0-be4f-04074db9c9cf/63cd9990-af40-4c09-a0b7-896aa1399f2a/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 6a003586-ff7c-4a5e-9436-26f89f3c12eb | 57a35191-de8f-4251-b124-e394955209d0 | 8864edfa-ca0b-45f2-8a04-6ee284063039 | user/57a35191-de8f-4251-b124-e394955209d0/8864edfa-ca0b-45f2-8a04-6ee284063039/master/6a003586-ff7c-4a5e-9436-26f89f3c12eb.bin | user/57a35191-de8f-4251-b124-e394955209d0/8864edfa-ca0b-45f2-8a04-6ee284063039/6a003586-ff7c-4a5e-9436-26f89f3c12eb/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 6e867206-0336-4ae5-9ffc-cb8ba79d983d | c94dc3d8-edff-4543-90d1-ff8272418bab | 3aaf1caa-10ad-4de5-b860-1af89a03196d | user/c94dc3d8-edff-4543-90d1-ff8272418bab/3aaf1caa-10ad-4de5-b860-1af89a03196d/master/6e867206-0336-4ae5-9ffc-cb8ba79d983d.bin | user/c94dc3d8-edff-4543-90d1-ff8272418bab/3aaf1caa-10ad-4de5-b860-1af89a03196d/6e867206-0336-4ae5-9ffc-cb8ba79d983d/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 6f9562cf-2d13-4f86-9d5a-a92f32cb82e8 | 578f1edc-3458-4dc3-9db1-60d9b89abb60 | 0d5a98c3-0c45-4030-a452-129f6f33ae7d | user/578f1edc-3458-4dc3-9db1-60d9b89abb60/0d5a98c3-0c45-4030-a452-129f6f33ae7d/master/6f9562cf-2d13-4f86-9d5a-a92f32cb82e8.bin | user/578f1edc-3458-4dc3-9db1-60d9b89abb60/0d5a98c3-0c45-4030-a452-129f6f33ae7d/6f9562cf-2d13-4f86-9d5a-a92f32cb82e8/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 71fd3e3b-ab86-4092-b3d6-e1bce4ba86ac | ff6b8110-5287-461c-bba5-78afe59c12f4 | d8e7c107-73c6-4cec-9224-d3dff7b703c6 | user/ff6b8110-5287-461c-bba5-78afe59c12f4/d8e7c107-73c6-4cec-9224-d3dff7b703c6/master/71fd3e3b-ab86-4092-b3d6-e1bce4ba86ac.bin | user/ff6b8110-5287-461c-bba5-78afe59c12f4/d8e7c107-73c6-4cec-9224-d3dff7b703c6/71fd3e3b-ab86-4092-b3d6-e1bce4ba86ac/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 7bdbd9ca-7dda-45b1-b8ab-e7851d4b9d2a | f0f22dc2-bbb3-45b3-b6ed-3f0ae3281386 | b8cff85e-cc50-4e40-8d19-a9df1b9f548d | user/f0f22dc2-bbb3-45b3-b6ed-3f0ae3281386/b8cff85e-cc50-4e40-8d19-a9df1b9f548d/master/7bdbd9ca-7dda-45b1-b8ab-e7851d4b9d2a.bin | user/f0f22dc2-bbb3-45b3-b6ed-3f0ae3281386/b8cff85e-cc50-4e40-8d19-a9df1b9f548d/7bdbd9ca-7dda-45b1-b8ab-e7851d4b9d2a/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 891d3201-1be0-4859-940f-276f547c63eb | 5745e053-cee7-4b5b-8e61-f1eee00c6f79 | e825f171-301a-4ff0-8ae1-a3fbe8ecc2d9 | user/5745e053-cee7-4b5b-8e61-f1eee00c6f79/e825f171-301a-4ff0-8ae1-a3fbe8ecc2d9/master/891d3201-1be0-4859-940f-276f547c63eb.bin | user/5745e053-cee7-4b5b-8e61-f1eee00c6f79/e825f171-301a-4ff0-8ae1-a3fbe8ecc2d9/891d3201-1be0-4859-940f-276f547c63eb/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 8a6bd17f-22dd-4f4f-8a6a-7220ee4e2ce9 | 687329e1-57fd-4681-b4d5-eb2ae7a3d3ac | 1f682fba-2616-48f1-9c53-c698d0740350 | user/687329e1-57fd-4681-b4d5-eb2ae7a3d3ac/1f682fba-2616-48f1-9c53-c698d0740350/master/8a6bd17f-22dd-4f4f-8a6a-7220ee4e2ce9.bin | user/687329e1-57fd-4681-b4d5-eb2ae7a3d3ac/1f682fba-2616-48f1-9c53-c698d0740350/8a6bd17f-22dd-4f4f-8a6a-7220ee4e2ce9/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 8ab965c7-057f-4d20-89c8-443c1c2d7c48 | 71bfe22f-30b9-4800-b112-6264cf4c3859 | 69cc0328-e4f9-460a-a1ca-6f9e23d35c72 | user/71bfe22f-30b9-4800-b112-6264cf4c3859/69cc0328-e4f9-460a-a1ca-6f9e23d35c72/master/8ab965c7-057f-4d20-89c8-443c1c2d7c48.bin | user/71bfe22f-30b9-4800-b112-6264cf4c3859/69cc0328-e4f9-460a-a1ca-6f9e23d35c72/8ab965c7-057f-4d20-89c8-443c1c2d7c48/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 91b9c62b-bb6d-498e-8f95-67a064ef8740 | 09855bdd-f301-4383-84ee-f8a9a3bfad67 | e8d067aa-dfa1-43f8-b692-d777d2591784 | user/09855bdd-f301-4383-84ee-f8a9a3bfad67/e8d067aa-dfa1-43f8-b692-d777d2591784/master/91b9c62b-bb6d-498e-8f95-67a064ef8740.bin | user/09855bdd-f301-4383-84ee-f8a9a3bfad67/e8d067aa-dfa1-43f8-b692-d777d2591784/91b9c62b-bb6d-498e-8f95-67a064ef8740/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 97be7772-24b3-45b2-a484-5f5861c797a0 | d3f6a4b4-f9f4-4297-96cf-925eaa8fd7f0 | e51ae640-dc94-41ee-a391-d0d62d343ed6 | user/d3f6a4b4-f9f4-4297-96cf-925eaa8fd7f0/e51ae640-dc94-41ee-a391-d0d62d343ed6/master/97be7772-24b3-45b2-a484-5f5861c797a0.bin | user/d3f6a4b4-f9f4-4297-96cf-925eaa8fd7f0/e51ae640-dc94-41ee-a391-d0d62d343ed6/97be7772-24b3-45b2-a484-5f5861c797a0/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 9b6fa035-3fb9-470f-bdeb-069611a0b0a6 | 67cab41d-0da7-4a3f-9759-8b5170ad52bd | c2d28b86-6644-4766-b46b-db896f39ae48 | user/67cab41d-0da7-4a3f-9759-8b5170ad52bd/c2d28b86-6644-4766-b46b-db896f39ae48/master/9b6fa035-3fb9-470f-bdeb-069611a0b0a6.bin | user/67cab41d-0da7-4a3f-9759-8b5170ad52bd/c2d28b86-6644-4766-b46b-db896f39ae48/9b6fa035-3fb9-470f-bdeb-069611a0b0a6/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| 9c33c207-a911-463e-a1ad-cb0d68e34d3b | 9503a514-9380-415c-be2d-097c2a6b5e62 | ee619802-d8e5-44ad-ab46-dceb39587d95 | user/9503a514-9380-415c-be2d-097c2a6b5e62/ee619802-d8e5-44ad-ab46-dceb39587d95/master/9c33c207-a911-463e-a1ad-cb0d68e34d3b.bin | user/9503a514-9380-415c-be2d-097c2a6b5e62/ee619802-d8e5-44ad-ab46-dceb39587d95/9c33c207-a911-463e-a1ad-cb0d68e34d3b/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| a01a313c-5a03-49a5-a053-c5478b229d95 | 09855bdd-f301-4383-84ee-f8a9a3bfad67 | 2d1ec2f3-a30e-4d51-9a7c-374d731f7576 | user/09855bdd-f301-4383-84ee-f8a9a3bfad67/2d1ec2f3-a30e-4d51-9a7c-374d731f7576/master/a01a313c-5a03-49a5-a053-c5478b229d95.bin | user/09855bdd-f301-4383-84ee-f8a9a3bfad67/2d1ec2f3-a30e-4d51-9a7c-374d731f7576/a01a313c-5a03-49a5-a053-c5478b229d95/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| a03b099a-1cdd-40fe-8e85-5b30602fbc94 | 5e23ec8d-82d2-47f7-9bc1-05dc25ec5b98 | a9a2bfac-e33a-4a54-ad18-28fc41190412 | user/5e23ec8d-82d2-47f7-9bc1-05dc25ec5b98/a9a2bfac-e33a-4a54-ad18-28fc41190412/master/a03b099a-1cdd-40fe-8e85-5b30602fbc94.bin | user/5e23ec8d-82d2-47f7-9bc1-05dc25ec5b98/a9a2bfac-e33a-4a54-ad18-28fc41190412/a03b099a-1cdd-40fe-8e85-5b30602fbc94/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| a63c1167-f7ca-4605-8ac2-a1fd209b2cb3 | 638c286d-34e7-4362-b5fa-2171bd14b49c | b69b40e2-5355-40b2-a57c-b33e632be9c6 | user/638c286d-34e7-4362-b5fa-2171bd14b49c/b69b40e2-5355-40b2-a57c-b33e632be9c6/master/a63c1167-f7ca-4605-8ac2-a1fd209b2cb3.bin | user/638c286d-34e7-4362-b5fa-2171bd14b49c/b69b40e2-5355-40b2-a57c-b33e632be9c6/a63c1167-f7ca-4605-8ac2-a1fd209b2cb3/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| a7fd76ab-2809-45ee-b024-1a877adbe6d9 | 203f0b81-2524-4b23-8f5e-421b3994f887 | 55ee669e-9b08-414b-a4eb-89e8ab8fc2f0 | user/203f0b81-2524-4b23-8f5e-421b3994f887/55ee669e-9b08-414b-a4eb-89e8ab8fc2f0/master/a7fd76ab-2809-45ee-b024-1a877adbe6d9.bin | user/203f0b81-2524-4b23-8f5e-421b3994f887/55ee669e-9b08-414b-a4eb-89e8ab8fc2f0/a7fd76ab-2809-45ee-b024-1a877adbe6d9/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| aadf9b3a-54b2-4dc5-80c1-72e5e5f433e0 | fe420e04-6210-4f5e-8a0f-b0d63ab42f2e | de4ed431-a692-4010-878e-3354d60e3ce7 | user/fe420e04-6210-4f5e-8a0f-b0d63ab42f2e/de4ed431-a692-4010-878e-3354d60e3ce7/master/aadf9b3a-54b2-4dc5-80c1-72e5e5f433e0.bin | user/fe420e04-6210-4f5e-8a0f-b0d63ab42f2e/de4ed431-a692-4010-878e-3354d60e3ce7/aadf9b3a-54b2-4dc5-80c1-72e5e5f433e0/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| b19688b2-26c5-491b-a6bf-0d241f80e013 | 92fa6b65-0e50-4856-ae99-767f01824fba | 1f15c76a-5a95-4b2f-b1f8-4c20e4190cc7 | user/92fa6b65-0e50-4856-ae99-767f01824fba/1f15c76a-5a95-4b2f-b1f8-4c20e4190cc7/master/b19688b2-26c5-491b-a6bf-0d241f80e013.bin | user/92fa6b65-0e50-4856-ae99-767f01824fba/1f15c76a-5a95-4b2f-b1f8-4c20e4190cc7/b19688b2-26c5-491b-a6bf-0d241f80e013/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| b4ad3da8-d87d-4d1b-a5cc-c7322dd0e3c9 | 5ee30f75-a284-4a68-b8d5-a838c515c892 | 4a0c5c7a-707a-45b5-aa5b-9ec219f36288 | user/5ee30f75-a284-4a68-b8d5-a838c515c892/4a0c5c7a-707a-45b5-aa5b-9ec219f36288/master/b4ad3da8-d87d-4d1b-a5cc-c7322dd0e3c9.bin | user/5ee30f75-a284-4a68-b8d5-a838c515c892/4a0c5c7a-707a-45b5-aa5b-9ec219f36288/b4ad3da8-d87d-4d1b-a5cc-c7322dd0e3c9/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| b67b8769-7e81-4d14-8b1d-5de6ecc1f6c1 | ad46cc3f-5ffd-4482-b3a6-b15264d7858a | a6cb64e7-c2da-4719-bb63-043c915773d3 | user/ad46cc3f-5ffd-4482-b3a6-b15264d7858a/a6cb64e7-c2da-4719-bb63-043c915773d3/master/b67b8769-7e81-4d14-8b1d-5de6ecc1f6c1.bin | user/ad46cc3f-5ffd-4482-b3a6-b15264d7858a/a6cb64e7-c2da-4719-bb63-043c915773d3/b67b8769-7e81-4d14-8b1d-5de6ecc1f6c1/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| b6aa0bd5-b8b5-41c0-9ef7-a66e047e21c8 | 9fe91987-1891-4607-8477-3d1b17c2dfae | e1242e96-101c-4a14-9686-b864cdc66774 | user/9fe91987-1891-4607-8477-3d1b17c2dfae/e1242e96-101c-4a14-9686-b864cdc66774/master/b6aa0bd5-b8b5-41c0-9ef7-a66e047e21c8.bin | user/9fe91987-1891-4607-8477-3d1b17c2dfae/e1242e96-101c-4a14-9686-b864cdc66774/b6aa0bd5-b8b5-41c0-9ef7-a66e047e21c8/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| b7fd6e8b-2e01-4d55-88ac-de5c1e293b57 | b5eb4ad9-3624-465c-9606-4ec2a7d9b67b | 98bdb10c-5464-43a8-9b5f-a8dc649ef7ff | user/b5eb4ad9-3624-465c-9606-4ec2a7d9b67b/98bdb10c-5464-43a8-9b5f-a8dc649ef7ff/master/b7fd6e8b-2e01-4d55-88ac-de5c1e293b57.bin | user/b5eb4ad9-3624-465c-9606-4ec2a7d9b67b/98bdb10c-5464-43a8-9b5f-a8dc649ef7ff/b7fd6e8b-2e01-4d55-88ac-de5c1e293b57/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| be025937-f031-4072-9a44-6284b5c6dee7 | cc873668-58fd-4c68-b95b-d1f2d2219bac | 695831fe-a4f7-49fb-a177-0061aac17ede | user/cc873668-58fd-4c68-b95b-d1f2d2219bac/695831fe-a4f7-49fb-a177-0061aac17ede/master/be025937-f031-4072-9a44-6284b5c6dee7.bin | user/cc873668-58fd-4c68-b95b-d1f2d2219bac/695831fe-a4f7-49fb-a177-0061aac17ede/be025937-f031-4072-9a44-6284b5c6dee7/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| c803007d-0ecd-4445-b135-1b098bb2307f | 1576b2e5-52bd-44e0-b0ed-0c586adde247 | 2bdf20d5-b758-4925-8990-47dce3fd1743 | user/1576b2e5-52bd-44e0-b0ed-0c586adde247/2bdf20d5-b758-4925-8990-47dce3fd1743/master/c803007d-0ecd-4445-b135-1b098bb2307f.bin | user/1576b2e5-52bd-44e0-b0ed-0c586adde247/2bdf20d5-b758-4925-8990-47dce3fd1743/c803007d-0ecd-4445-b135-1b098bb2307f/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| cb944166-7389-4d3f-98b3-872cc326fd34 | 4c9b4e80-0051-4230-a8a6-4c643bd563d9 | f0cf2f06-7cdc-43cf-8184-45912ecb875b | user/4c9b4e80-0051-4230-a8a6-4c643bd563d9/f0cf2f06-7cdc-43cf-8184-45912ecb875b/master/cb944166-7389-4d3f-98b3-872cc326fd34.bin | user/4c9b4e80-0051-4230-a8a6-4c643bd563d9/f0cf2f06-7cdc-43cf-8184-45912ecb875b/cb944166-7389-4d3f-98b3-872cc326fd34/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| d1b0b45a-82f0-435d-be64-2a58eeeb1d09 | b6aa1a74-294c-4e21-8d8b-bd09d44f3058 | 1a7b24ef-077b-4d86-84f2-60e1f7ce1e35 | user/b6aa1a74-294c-4e21-8d8b-bd09d44f3058/1a7b24ef-077b-4d86-84f2-60e1f7ce1e35/master/d1b0b45a-82f0-435d-be64-2a58eeeb1d09.bin | user/b6aa1a74-294c-4e21-8d8b-bd09d44f3058/1a7b24ef-077b-4d86-84f2-60e1f7ce1e35/d1b0b45a-82f0-435d-be64-2a58eeeb1d09/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| de62e763-8165-4e8d-a2fa-af805aeccb36 | 37a2d44c-f61d-4bb2-9405-b7acdf888bea | 0c87ae34-5b53-4149-8056-2b7d27c8ea7d | user/37a2d44c-f61d-4bb2-9405-b7acdf888bea/0c87ae34-5b53-4149-8056-2b7d27c8ea7d/master/de62e763-8165-4e8d-a2fa-af805aeccb36.bin | user/37a2d44c-f61d-4bb2-9405-b7acdf888bea/0c87ae34-5b53-4149-8056-2b7d27c8ea7d/de62e763-8165-4e8d-a2fa-af805aeccb36/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| e2cf8652-cee3-474b-99b6-9197b1d9f982 | b25aca79-dc36-4cda-a8ea-1a88001e3fb2 | 264f3286-486a-42ac-a378-4f50b11e4ae0 | user/b25aca79-dc36-4cda-a8ea-1a88001e3fb2/264f3286-486a-42ac-a378-4f50b11e4ae0/master/e2cf8652-cee3-474b-99b6-9197b1d9f982.bin | user/b25aca79-dc36-4cda-a8ea-1a88001e3fb2/264f3286-486a-42ac-a378-4f50b11e4ae0/e2cf8652-cee3-474b-99b6-9197b1d9f982/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| e31ae14a-925d-40dc-9515-eb80249d460f | 5dab5dbf-bf4b-43c3-80e0-dcdcb32a0278 | d578faef-953b-4eb4-a1e5-5016ea3e272c | user/5dab5dbf-bf4b-43c3-80e0-dcdcb32a0278/d578faef-953b-4eb4-a1e5-5016ea3e272c/e31ae14a-925d-40dc-9515-eb80249d460f/master.bin | user/5dab5dbf-bf4b-43c3-80e0-dcdcb32a0278/d578faef-953b-4eb4-a1e5-5016ea3e272c/e31ae14a-925d-40dc-9515-eb80249d460f/master.bin | PASS | SKIP | UNKNOWN | true | 2646044 | true | 2646044 | false |  | NOT_ATTEMPTED | 0 | PASS |
| e3fd5fb4-ba3b-4fef-a975-468ea0fc5c88 | b14f0aa1-738c-40dc-ad78-e7783d2678d9 | 0625cf71-b70c-403b-9af6-6ecc0bd9c71b | user/b14f0aa1-738c-40dc-ad78-e7783d2678d9/0625cf71-b70c-403b-9af6-6ecc0bd9c71b/master/e3fd5fb4-ba3b-4fef-a975-468ea0fc5c88.bin | user/b14f0aa1-738c-40dc-ad78-e7783d2678d9/0625cf71-b70c-403b-9af6-6ecc0bd9c71b/e3fd5fb4-ba3b-4fef-a975-468ea0fc5c88/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| edd2ca81-13fd-4705-baf0-47ec8e41ee93 | c21d9762-1900-4ccd-957c-92485bc2b74f | 0182fa9f-437c-42cc-99bc-d80a71ff6882 | user/c21d9762-1900-4ccd-957c-92485bc2b74f/0182fa9f-437c-42cc-99bc-d80a71ff6882/master/edd2ca81-13fd-4705-baf0-47ec8e41ee93.bin | user/c21d9762-1900-4ccd-957c-92485bc2b74f/0182fa9f-437c-42cc-99bc-d80a71ff6882/edd2ca81-13fd-4705-baf0-47ec8e41ee93/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| f03473d7-497d-4997-abc8-f9ce4e548074 | 71bfe22f-30b9-4800-b112-6264cf4c3859 | 02995ec1-cab3-4190-bca8-cfa045b01acd | user/71bfe22f-30b9-4800-b112-6264cf4c3859/02995ec1-cab3-4190-bca8-cfa045b01acd/master/f03473d7-497d-4997-abc8-f9ce4e548074.bin | user/71bfe22f-30b9-4800-b112-6264cf4c3859/02995ec1-cab3-4190-bca8-cfa045b01acd/f03473d7-497d-4997-abc8-f9ce4e548074/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| f5537bec-3c24-4a09-b482-77ff4d16bc45 | 7bab7499-a6fa-4a6b-9bcf-68c4298c17cd | c21ec9a5-2863-422d-ae10-e65499bff6d8 | user/7bab7499-a6fa-4a6b-9bcf-68c4298c17cd/c21ec9a5-2863-422d-ae10-e65499bff6d8/master/f5537bec-3c24-4a09-b482-77ff4d16bc45.bin | user/7bab7499-a6fa-4a6b-9bcf-68c4298c17cd/c21ec9a5-2863-422d-ae10-e65499bff6d8/f5537bec-3c24-4a09-b482-77ff4d16bc45/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| f55e7697-5d50-4cfc-ac67-cbb056371066 | 8dd6b1e1-2b4c-4aff-a860-34a52a8b7a47 | b46ae6df-1a82-488e-9175-8663a672d015 | user/8dd6b1e1-2b4c-4aff-a860-34a52a8b7a47/b46ae6df-1a82-488e-9175-8663a672d015/master/f55e7697-5d50-4cfc-ac67-cbb056371066.bin | user/8dd6b1e1-2b4c-4aff-a860-34a52a8b7a47/b46ae6df-1a82-488e-9175-8663a672d015/f55e7697-5d50-4cfc-ac67-cbb056371066/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| f5d558ce-b72a-4446-aec8-2fa509220b5d | d1290422-c036-4db0-bd68-a33157cc1f8b | 9f4d2cf3-352b-417b-9bf2-99d8bd6b0cd0 | user/d1290422-c036-4db0-bd68-a33157cc1f8b/9f4d2cf3-352b-417b-9bf2-99d8bd6b0cd0/master/f5d558ce-b72a-4446-aec8-2fa509220b5d.bin | user/d1290422-c036-4db0-bd68-a33157cc1f8b/9f4d2cf3-352b-417b-9bf2-99d8bd6b0cd0/f5d558ce-b72a-4446-aec8-2fa509220b5d/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| f6b1b3e8-b328-401c-919c-c38560aa8ce4 | 0c198438-3daf-4e45-b056-8633e3bc1eda | e39985f8-06f2-4713-8ccf-ba339eda17d7 | user/0c198438-3daf-4e45-b056-8633e3bc1eda/e39985f8-06f2-4713-8ccf-ba339eda17d7/master/f6b1b3e8-b328-401c-919c-c38560aa8ce4.bin | user/0c198438-3daf-4e45-b056-8633e3bc1eda/e39985f8-06f2-4713-8ccf-ba339eda17d7/f6b1b3e8-b328-401c-919c-c38560aa8ce4/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| f7f8c87c-23aa-4fed-84e3-41e582776308 | afee875a-9a0c-427c-a37e-c4fb4201311f | f41b150e-3699-4a0e-b1ac-5a2047bb183a | user/afee875a-9a0c-427c-a37e-c4fb4201311f/f41b150e-3699-4a0e-b1ac-5a2047bb183a/master/f7f8c87c-23aa-4fed-84e3-41e582776308.bin | user/afee875a-9a0c-427c-a37e-c4fb4201311f/f41b150e-3699-4a0e-b1ac-5a2047bb183a/f7f8c87c-23aa-4fed-84e3-41e582776308/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| fd682d80-2e0f-4b3c-85ba-2bef62d17cde | dd358c56-e6cf-414d-8ecf-a90aa87723c9 | 0de351ea-1ae0-47bf-b6fe-c3686cf60f5f | user/dd358c56-e6cf-414d-8ecf-a90aa87723c9/0de351ea-1ae0-47bf-b6fe-c3686cf60f5f/master/fd682d80-2e0f-4b3c-85ba-2bef62d17cde.bin | user/dd358c56-e6cf-414d-8ecf-a90aa87723c9/0de351ea-1ae0-47bf-b6fe-c3686cf60f5f/fd682d80-2e0f-4b3c-85ba-2bef62d17cde/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| fe278d0f-c100-46a4-8a15-95bfbad684b0 | 4e72b4c0-d9d0-44a2-9b65-fe8d3e3781da | 40c3a085-80b1-45f1-8f01-1dd7cf9965b9 | user/4e72b4c0-d9d0-44a2-9b65-fe8d3e3781da/40c3a085-80b1-45f1-8f01-1dd7cf9965b9/master/fe278d0f-c100-46a4-8a15-95bfbad684b0.bin | user/4e72b4c0-d9d0-44a2-9b65-fe8d3e3781da/40c3a085-80b1-45f1-8f01-1dd7cf9965b9/fe278d0f-c100-46a4-8a15-95bfbad684b0/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |
| ff1d5b32-7874-4672-af81-f1e1fca63afe | 1f3bc6b4-32ca-4d49-b87d-e5d684c74f05 | a80427a1-5b44-4008-9c72-c8507a893c60 | user/1f3bc6b4-32ca-4d49-b87d-e5d684c74f05/a80427a1-5b44-4008-9c72-c8507a893c60/master/ff1d5b32-7874-4672-af81-f1e1fca63afe.bin | user/1f3bc6b4-32ca-4d49-b87d-e5d684c74f05/a80427a1-5b44-4008-9c72-c8507a893c60/ff1d5b32-7874-4672-af81-f1e1fca63afe/master.bin | UNKNOWN | MIGRATE | UNKNOWN | true | 2646044 | false | null | false |  | SKIPPED | 0 | UNKNOWN |

---

**EVIDENCE REVIEW COMPLETE**
**CLASSIFICATION READINESS: DRY-RUN MECHANICS PASS · INVENTORY VERIFIED · CHECKSUM COVERAGE INCOMPLETE (67 UNKNOWN) · 1 QUARANTINE/ANOMALY OPEN · BACKFILL GO NO**

**STOP**
