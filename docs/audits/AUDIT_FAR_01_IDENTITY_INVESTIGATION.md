# AUDIT — FAR-01 Identity Investigation (GATE B)

**Type:** Read-only investigation
**Date:** 2026-10-03
**Owner GO:** GATE B — IDENTITY INVESTIGATION = GO
**Evidence JSON:** `docs/audits/evidence/far01-identity-investigation-2026-10-03.json`
**Dry-run archive:** `far01-prod-dry-run-2026-10-03.json` — **UNCHANGED**

```text
GATE B                     = COMPLETE
CLASSIFICATION             = QUARANTINE (unchanged)
GATE C BACKFILL GO         = NO
OBJECT_KEY CORRECTION      = NOT EXECUTED
STORAGE COPY/DELETE        = 0
MUTATION ATTEMPTED         = 0
SERVICE-ROLE               = NO
```

---

## 1. Scope

Read-only forensics for asset `000d406d-265e-4e49-bd3f-a542d5dd0b41` (dry-run ANOMALY / QUARANTINE). No remediations.

---

## 2. Full DB record (live SELECT)

| Field | Value |
|-------|-------|
| asset_id | `000d406d-265e-4e49-bd3f-a542d5dd0b41` |
| owner_id | `e5f13715-46df-4021-b7b6-d0e3bd1a11ef` |
| beat_id | `520b9eb8-1ae8-49e6-8a4a-e5f7a8533d85` |
| asset_status | READY |
| beat_status | PUBLISHED |
| ownership_type | USER |
| is_active | true |
| replaced_by_asset_id | null |
| purpose | MASTER |
| storage_bucket | beat-audio |
| content_type | audio/wav |
| byte_size | 2646044 |
| checksum_sha256 | NULL |
| created_at | 2026-09-28 10:42:48.917638+00 |
| current_object_key | `user/e5f13715-…/520b9eb8-…/master/ef9e21dc-d941-4608-b26e-ee4ea417ad63.bin` |

---

## 3. Path UUID `ef9e21dc-…` occurrences

| Search | Count |
|--------|------:|
| as `beat_audio_assets.id` | **0** |
| as `beats.id` | **0** |
| as `beats.owner_id` | **0** |
| in any `object_key` | **1** (this row only) |
| as `replaced_by_asset_id` targeting path UUID | **0** |
| rows with `replaced_by_asset_id` = quarantine asset | **0** |

---

## 4. Keys and Storage HEAD

| Key | Exists | Size |
|-----|--------|------:|
| current legacy object_key | **YES** | 2646044 |
| expected canonical (`…/000d406d-…/master.bin`) | **NOT_FOUND** | — |
| expected legacy twin (`…/master/000d406d-….bin`) | **NOT_FOUND** | — |

No COPY attempted. No conflict object at expected destinations.

---

## 5. Collision / pattern scan

| Check | Result |
|-------|--------|
| Rows sharing exact object_key | **1** |
| Cross-owner same object_key | **0** |
| Legacy twin_match (path UUID == asset.id) | **67** |
| Legacy twin_mismatch | **1** (this asset only) |
| Similar mismatch other assets | **NONE** |

---

## 6. Binding / security

| Binding | Path vs DB |
|---------|------------|
| owner | **MATCH** |
| beat | **MATCH** |
| asset (filename UUID vs id) | **MISMATCH** |

| Security question | Answer |
|-------------------|--------|
| Owner binding OK? | **YES** (path owner == DB owner) |
| Beat binding OK? | **YES** |
| Object usable by other owner (DB evidence)? | **No second row / no cross-owner** |
| Cross-owner collision? | **NO** |
| Second asset → same object? | **NO** |
| Path UUID safe as identity? | **NO** — not an asset/beat/owner id |

**Cannot uniquely repair identity from read-only evidence alone** (Design §3.3 / OD-BF-01).

**Classification remains: QUARANTINE.**

---

## 7. Possible historical causes (not chosen)

| Hypothesis | Evidence |
|------------|----------|
| Wrong UUID at key mint vs row insert | Compatible with stored key ≠ expected twin; path UUID orphaned |
| Stale rename / prior asset id | No DB row for path UUID; no replaced_by chain found |
| Current product key generation bug | **Unlikely for new writes** — WRITE SSOT is canonical; legacy builder forbidden for writes |
| Documented Phase 0 anomaly | **YES** — same asset pair already in `DESIGN_FAR_01_BACKFILL.md` §3.1 |

No heuristic “winner” selected.

---

## FACTS

1. Single QUARANTINE identity mismatch in entire legacy USER MASTER READY set.
2. Owner/beat path match DB; asset filename UUID does not.
3. Path UUID exists nowhere else as identity.
4. Expected canonical + expected twin Storage objects **NOT_FOUND**.
5. No cross-owner / multi-row object_key collision.
6. No mutations performed.

## EVIDENCE

- Live SQL (this session)
- R1 Storage HEAD (current / canonical / twin)
- JSON: `docs/audits/evidence/far01-identity-investigation-2026-10-03.json`
- Prior: dry-run + RCA-B + Design §3.1

## LIMITATIONS

- No application upload logs retrieved for `created_at`
- Content of quarantine object not hashed this Gate (optional; not required for identity)

## OPEN QUESTIONS

1. Owner disposition: B0 keep / B1 affirm DB id / B2 affirm path UUID / B3 permanent exclude?
2. Any external reference to path UUID `ef9e21dc-…`?

## OWNER DECISION REQUIRED

- Disposition among **B0–B3** (see PLAN)
- Keep asset **out of canary** under all options until explicit mutating GO
- **GATE C remains NO**

---

**GATE B: COMPLETE**
**identity_status: QUARANTINE**
**GATE C — BACKFILL GO: NO**
**STOP**
