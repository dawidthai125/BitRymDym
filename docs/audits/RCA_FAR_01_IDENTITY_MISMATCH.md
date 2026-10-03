# RCA-B — FAR-01 Identity Mismatch / QUARANTINE (1 asset)

**Type:** Root Cause Analysis (read-only)
**Date:** 2026-10-03
**Companion evidence:**
- `docs/audits/evidence/far01-prod-dry-run-2026-10-03.json` (**unmodified**)
- `docs/audits/AUDIT_FAR_01_PRODUCTION_DRY_RUN_EVIDENCE_REVIEW.md`
- `docs/audits/DESIGN_FAR_01_BACKFILL.md` §3.1–3.4 (same asset already documented at Phase 0)
- Live SELECT (this RCA)

```text
CLASSIFICATION (LOCKED UNTIL OWNER) = QUARANTINE / ANOMALY
OD-BF-01                           = NO AUTOMATIC MIGRATION
PRODUCTION MUTATION                = 0
CODE / ARCHIVE MUTATION            = 0
BACKFILL GO (OD-BF-08)             = NO
```

---

## SYMPTOM

Exactly **one** dry-run candidate:

| Field | Value |
|-------|-------|
| classification | **ANOMALY** |
| action | **QUARANTINE** |
| failure_reason | **identity_mismatch** |
| identity_anomaly | **true** |
| DB_update_status | **NOT_ATTEMPTED** |

Asset:

`000d406d-265e-4e49-bd3f-a542d5dd0b41`

---

## OBSERVED EVIDENCE

### Live DB record (SELECT-only, this RCA)

| Field | Value |
|-------|-------|
| asset_id | `000d406d-265e-4e49-bd3f-a542d5dd0b41` |
| beat_id | `520b9eb8-1ae8-49e6-8a4a-e5f7a8533d85` |
| owner_id | `e5f13715-46df-4021-b7b6-d0e3bd1a11ef` |
| purpose | MASTER |
| asset_status | READY |
| beat_status | PUBLISHED |
| ownership_type | USER |
| storage_bucket | beat-audio |
| content_type | audio/wav |
| byte_size | 2646044 |
| checksum_sha256 | **NULL** |
| is_active | true |
| replaced_by_asset_id | null |
| created_at | 2026-09-28 10:42:48.917638+00 |
| current object_key | `user/e5f13715-…/520b9eb8-…/master/ef9e21dc-d941-4608-b26e-ee4ea417ad63.bin` |

### Path vs DB binding

| Binding | Path segment | DB | Match? |
|---------|--------------|-----|--------|
| owner | `e5f13715-46df-4021-b7b6-d0e3bd1a11ef` | owner_id same | **YES** |
| beat | `520b9eb8-1ae8-49e6-8a4a-e5f7a8533d85` | beat_id same | **YES** |
| asset (legacy filename UUID) | `ef9e21dc-d941-4608-b26e-ee4ea417ad63` | asset.id `000d406d-…` | **NO** |

### Expected keys (deterministic)

| Key | Value |
|-----|-------|
| expected_canonical_key | `user/…/520b9eb8-…/000d406d-…/master.bin` |
| expected_legacy_twin | `user/…/520b9eb8-…/master/000d406d-….bin` |
| stored object_key | `user/…/520b9eb8-…/master/ef9e21dc-….bin` |

Stored ≠ expected twin → `identityMismatch` in `mapFar01BackfillAsset`.

### Collision / second-record checks (SELECT-only)

| Check | Result |
|-------|--------|
| Rows with exact same `object_key` | **1** (this asset only) |
| Asset row with `id = ef9e21dc-…` | **0** |
| Other keys containing path UUID | **1** (this key only) |

### Dry-run Storage evidence (archive)

| Check | Result |
|-------|--------|
| source_existence on stored key | **true** |
| source_size | 2646044 |
| destination_existence (canonical) | **false** |

---

## DATA FLOW

```text
DB beat_audio_assets.object_key  (authoritative stored source)
  + beats.owner_id / beat id / asset.id
       ↓
mapFar01BackfillAsset
  expectedLegacyTwin = buildLegacyUserBeatMasterObjectKey(owner, beat, assetId)
  parseLegacyUserMasterPath(object_key) → pathAssetId
  identityMismatch =
      legacy shape AND
      (object_key ≠ expectedTwin OR pathAssetId ≠ assetId OR owner/beat mismatch)
       ↓
runFar01Preflight (OD-BF-01)
  → ANOMALY + QUARANTINE + reason identity_mismatch
  → no MIGRATE
```

---

## CODE PATH

| Module | Behavior |
|--------|----------|
| `mapping.ts` | Computes twin + `identityMismatch` |
| `audio-validation.ts` `buildLegacyUserBeatMasterObjectKey` | `user/{owner}/{beat}/master/{assetId}.bin` |
| `preflight.ts` | OD-BF-01 quarantine gate |
| `gates.ts` `evaluateDbUpdateGate` | Blocks DB update on quarantine |

---

## ROOT CAUSE

**FACT:** The stored legacy `object_key` embeds filename UUID **`ef9e21dc-…`**, which is **not** equal to DB primary key **`000d406d-…`**, while owner/beat path segments match DB. FAR-01 correctly applies **OD-BF-01** → **QUARANTINE**.

**INFERENCE:** Likely a historical key-binding error at create/upload time (asset id regenerated or key built from a different UUID than the inserted row). Phase 0 / Design already recorded this **same** pair (`DESIGN_FAR_01_BACKFILL.md` §3.1).

**Not established:** Which UUID is “the correct content identity” beyond DB authority (DB says asset is `000d406d-…`; bytes live under `ef9e21dc-…` key).

---

## SECURITY IMPACT

| Topic | Assessment |
|-------|------------|
| Cross-owner / IDOR via path owner | **Low on ownership axis** — path owner == DB owner |
| Wrong-asset binding | **Present** — path claims a UUID that is **not** any `beat_audio_assets.id` |
| Auto-migrate risk | Would point destination at DB asset id while copying bytes from a key named for another UUID → **forbidden** by OD-BF-01 |
| Object shared by another owner | **No evidence** (single row, owner match) |
| Safe automatic identity repair from read-only evidence alone | **NO** — Design §3.3: do not assume which UUID is correct |

---

## OPERATIONAL IMPACT

| Impact | Detail |
|--------|--------|
| Migrate set | Asset **excluded** from automatic MIGRATE (correct) |
| Canary eligibility | Must **not** enter N=5 canary set |
| Fleet | Must remain quarantined until Owner disposition |
| Orphans | Path UUID is **not** a second DB asset; not the same as the 28 Storage orphans class |

---

## OPTIONS (no selection — Owner decides)

| ID | Option | Mutates? |
|----|--------|----------|
| B0 | **Keep QUARANTINE** indefinitely / until later review | No |
| B1 | **Owner affirms DB asset id** as authority → manual remapped migrate plan (future mutating GO) | Future yes |
| B2 | **Owner affirms path UUID** as authority → would imply DB id correction (high risk; separate design) | Future yes |
| B3 | **Leave bytes + row as-is**; exclude forever from FAR-01 | No |
| B4 | Deeper forensic: Storage HEAD on expected twin; audit upload logs if any | Read-only |

**Current classification must remain QUARANTINE** until Owner Gate B disposition.

---

## RISKS

| Risk | Notes |
|------|-------|
| Silent remap | Choosing wrong UUID breaks content↔row binding |
| Including in canary | Violates OD-BF-01 |
| Deleting object/row | Not authorized; destroys evidence |

---

## OPEN QUESTIONS

1. Why was `object_key` minted with `ef9e21dc-…` while row id is `000d406d-…`? (logs / code revision at 2026-09-28)
2. Does any external system reference the path UUID?
3. Owner disposition preference among B0–B4?

---

## RECOMMENDED NEXT EVIDENCE STEP

Under **GATE B — Identity Investigation GO** (read-only):

1. Storage HEAD on **expected twin** key (expect miss) — confirm no second object.
2. Storage HEAD on **stored** key (already true in dry-run; reconfirm if needed).
3. Optional: search app/ops logs around `created_at` for asset creation (if available).
4. Produce Owner disposition packet — **still no migrate**.

Do **not** UPDATE `object_key`, COPY, or DELETE.

---

**Classification remains: QUARANTINE**
**Backfill GO: NO**
**STOP — await OWNER REVIEW / GATE B**
