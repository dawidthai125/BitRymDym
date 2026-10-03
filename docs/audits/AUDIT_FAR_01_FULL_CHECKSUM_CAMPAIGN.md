# AUDIT — FAR-01 Full Read-Only Checksum Evidence Campaign (GATE A1)

**Type:** Read-only evidence campaign execution
**Date:** 2026-10-03
**Owner / Architect GO:** GATE A1 — FULL READ-ONLY CHECKSUM EVIDENCE CAMPAIGN = GO
**Evidence JSON:** `docs/audits/evidence/far01-checksum-campaign-2026-10-03.json`
**Dry-run archive:** `far01-prod-dry-run-2026-10-03.json` — **UNCHANGED**

```text
MODE                       = READ_ONLY_EVIDENCE
GATE B (identity)          = B0 KEEP QUARANTINE (LOCKED)
GATE C BACKFILL GO         = NO
DB checksum persistence    = NO
CLASSIFICATION ENGINE      = UNCHANGED
SERVICE-ROLE               = NO
DB / STORAGE MUTATIONS     = 0
```

---

## 1. Scope

Process all **68** legacy USER MASTER READY objects under FAR-01:

- Storage download via existing R1
- Local SHA-256
- DB SELECT of `checksum_sha256` (expected NULL)
- Identity binding check (OD-BF-01)
- No writes, no migrate, no Backfill

---

## 2. Objective

Obtain independent **content SHA-256** evidence for the legacy fleet before any future Backfill decision.

**Wording discipline:**

- Content SHA-256 was **independently observed**.
- `DB checksum_sha256 = NULL` for all 68 → remains **UNKNOWN** under OD-BF-02.
- Do **not** say “checksum verified” against DB for these rows.

---

## 3. Production inventory (campaign header)

| Class | Count |
|-------|------:|
| legacy (processed) | **68** |
| canonical | **2** |
| platform | **3** |
| orphan Storage | **28** (prior verified; not re-walked) |

---

## 4. R1 capability

| Item | Result |
|------|--------|
| Credential | `far01_dryrun_readonly` + anon/publishable apikey |
| Method | `storage.download(object_key)` |
| Privilege expansion | **NONE** |
| Service-role | **NO** |
| C-R1-01 | OPEN — content download used as authorized for this Gate A1 |

---

## 5. Method

For each legacy asset, in order:

1. HEAD (existence / size)
2. Download bytes
3. SHA-256 locally
4. Compare to DB checksum (NULL → `checksum_comparison=DB_NULL`)
5. Size equality (HEAD / download / DB byte_size)
6. Identity via `mapFar01BackfillAsset` (quarantine if mismatch)

No DB UPDATE of hashes. No Storage mutation.

---

## 6. Deterministic ordering

```text
ORDER BY created_at ASC, asset_id ASC
```

First processed: `06f0226f-86e4-48fd-98ce-05bf333959d2`
Quarantine asset processed in sequence (not remediated): `000d406d-265e-4e49-bd3f-a542d5dd0b41`

---

## 7. Per-asset result summary

| evidence_status | Count |
|-----------------|------:|
| OBSERVED_HASH | **67** |
| OBSERVED_HASH_QUARANTINE | **1** |
| READ_ERROR / SIZE_ERROR / HASH_ERROR / DB_ERROR | **0** |

| Metric | Count |
|--------|------:|
| processed | **68** |
| source_missing | **0** |
| download_errors | **0** |
| size_errors | **0** |
| hash_errors | **0** |
| db_errors | **0** |

Every one of the 68 assets has a JSON record.

---

## 8. Hash evidence summary

| Metric | Value |
|--------|-------|
| observed_hash_available | **68 / 68** |
| db_checksum_null | **68 / 68** |
| checksum_comparison | **DB_NULL × 68** |
| observed_hash_matches_existing_db_checksum (legacy DB column) | **0** (expected — all NULL) |
| distinct_observed_sha256 | **1** |

**Independently observed content SHA-256 (all 68 objects):**

`90ee033a87843110a16869da4b2ac414c1c36061b54cc7bb3770ede3c4c12261`

**Separate note (not a legacy DB MATCH):** Gate A sample previously showed the same hex equals the **canonical** assets’ stored `checksum_sha256`. That is **side evidence of shared content**, not a transfer of “DB checksum verified” onto legacy rows (OD-BF-02: legacy DB remains NULL / UNKNOWN).

---

## 9. Size evidence summary

| Metric | Count |
|--------|------:|
| size_equal = true | **68** |
| size_equal = false | **0** |
| Uniform size | **2646044** bytes |

Size equality is a **separate** evidence field — **not** checksum PASS.

---

## 10. Errors

**None.** Fail-closed paths were not triggered.

---

## 11. Identity findings

| Metric | Count |
|--------|------:|
| identity_ok | **67** |
| identity_quarantine | **1** |

Quarantine (B0 LOCKED — unchanged):

| Field | Value |
|-------|-------|
| asset_id | `000d406d-265e-4e49-bd3f-a542d5dd0b41` |
| identity_status | **QUARANTINE** |
| evidence_status | OBSERVED_HASH_QUARANTINE |
| Content SHA-256 independently observed | YES (same hex as fleet) |
| Remediation | **NONE** |

---

## 12. Security evidence

| Control | Result |
|---------|--------|
| R1 only | **YES** |
| service_role_used | **false** |
| RLS / Storage policy changes | **NONE** |
| Secrets in JSON | **NONE** (JWT/api keys absent) |
| Classification / preflight / mutators code | **UNCHANGED** |

---

## 13. Mutation evidence

| Metric | Value |
|--------|------:|
| db_mutations | **0** |
| storage_mutations | **0** |
| writes_attempted | **0** |
| checksum persistence | **NO** |

---

## 14. Limitations

1. Campaign does **not** change FAR-01 preflight UNKNOWN classification.
2. Observed hashes are **evidence artifacts**, not DB truth, until a separate persist GO.
3. Single distinct hash ⇒ strong signal of identical bytes across legacy fleet; still not a Backfill GO.
4. Orphan count not re-inventoried this run.
5. Canonical pair not re-hashed in this campaign (legacy-only scope).

---

## 15. Conclusion

| Gate | Status |
|------|--------|
| GATE A1 campaign | **COMPLETE** |
| GATE B quarantine | **LOCKED (B0)** — still QUARANTINE |
| GATE C Backfill GO | **NO** |

**Acceptance:** `processed_count = 68`, zero mutation, service-role false, OD-BF-02 wording preserved (DB NULL → UNKNOWN; content independently observed).

### Verification (local)

| Check | Result |
|-------|--------|
| `tsc --noEmit` | **PASS** |
| eslint `src/lib/beats/far01-backfill` | **PASS** |
| vitest FAR-01 suites | **80/80 PASS** |

---

**STOP — await OWNER / ARCHITECT REVIEW**
**Backfill GO: NO · Canary: NOT EXECUTED · Fleet: NOT EXECUTED · Retirement: NOT EXECUTED**
