# AUDIT — FAR-01 Canary Execution (N=5)

**Type:** LIVE Canary execution (not Fleet / Backfill / Retirement)
**Date:** 2026-10-03
**Owner GO:** YES — CANARY N=5 APPROVED
**Evidence:** `docs/audits/evidence/far01-canary-n5-far01-bf-2026-10-03T04-06-42-045Z.json`

```text
FLEET / BACKFILL / RETIREMENT          = NOT EXECUTED
SERVICE-ROLE                           = NO
OD-BF-08                               = false (A2 ≠ Backfill GO)
COMMIT / PUSH / DEPLOY                 = NO
```

---

## 1. Classification

# **CANARY EXECUTION = PASS**

| Item | Value |
|------|-------|
| Owner GO | YES |
| N | 5 |
| batch_id | `far01-bf-2026-10-03T04-06-42-045Z` |
| mode | LIVE |
| pipeline phase | CANARY |
| Deterministic selection | PASS |
| Quarantine in set | NO |
| Storage COPY | SUCCESS × 5 |
| Destination verification | PASS × 5 |
| Integrity (size PASS + checksum UNKNOWN / OD-BF-02) | PASS path × 5 |
| DB UPDATE `object_key` | SUCCESS × 5 |
| DB post-verification | PASS × 5 |
| Legacy source retention | PASS × 5 |
| Rollback events | NONE (not required) |
| DB mutations | **5** |
| Storage mutations | **5** |
| Service-role | **NO** |

---

## 2. A2 attestation

| Item | Result |
|------|--------|
| Verified grant required | YES |
| Boolean-only GO | REJECTED by design (not used) |
| `od_bf_08` | **false** |
| Signing | Session-ephemeral Ed25519 under Owner Canary GO |
| Private key persisted | **NO** |
| Evidence binding | `FAR01_GATE_C_EVIDENCE_BINDING_V1` matched |
| Issuer / batch_scope | `owner-canary-go` / `far01-canary-n5-2026-10-03` |

---

## 3. Deterministic selection (N=5)

Quarantine `000d406d-265e-4e49-bd3f-a542d5dd0b41` **excluded**.

| # | asset_id | source_key | destination_key |
|---|----------|------------|-----------------|
| 1 | `06f0226f-86e4-48fd-98ce-05bf333959d2` | `user/15e52402-…/master/06f0226f-….bin` | `user/15e52402-…/06f0226f-…/master.bin` |
| 2 | `5810a1a7-d494-461e-b994-a060c27f68d4` | `user/213b9dd8-…/master/5810a1a7-….bin` | `user/213b9dd8-…/5810a1a7-…/master.bin` |
| 3 | `2a24d6f5-f330-4d7b-93d3-05dc5a304bfa` | `user/a3594334-…/master/2a24d6f5-….bin` | `user/a3594334-…/2a24d6f5-…/master.bin` |
| 4 | `6170c8ee-cbe3-4b62-9ecc-459224869673` | `user/33d14137-…/master/6170c8ee-….bin` | `user/33d14137-…/6170c8ee-…/master.bin` |
| 5 | `10b7d85a-4aef-4d03-9626-e4c546f81215` | `user/c0e2e60e-…/master/10b7d85a-….bin` | `user/c0e2e60e-…/10b7d85a-…/master.bin` |

Full keys recorded in evidence JSON (no secrets).

---

## 4. Per-asset execution

| # | asset_id | Storage COPY | Dest HEAD | Integrity | DB UPDATE | DB post-verify | Source retained | Status |
|---|----------|--------------|-----------|-----------|-----------|----------------|-----------------|--------|
| 1 | `06f0226f-…` | SUCCESS | PASS | size PASS / checksum UNKNOWN | SUCCESS | PASS | YES | **PASS** |
| 2 | `5810a1a7-…` | SUCCESS | PASS | size PASS / checksum UNKNOWN | SUCCESS | PASS | YES | **PASS** |
| 3 | `2a24d6f5-…` | SUCCESS | PASS | size PASS / checksum UNKNOWN | SUCCESS | PASS | YES | **PASS** |
| 4 | `6170c8ee-…` | SUCCESS | PASS | size PASS / checksum UNKNOWN | SUCCESS | PASS | YES | **PASS** |
| 5 | `10b7d85a-…` | SUCCESS | PASS | size PASS / checksum UNKNOWN | SUCCESS | PASS | YES | **PASS** |

Order per asset: identity/AuthZ → quarantine → A2 → source validation → dest pre-HEAD → COPY (`upsert:false`) → dest post-HEAD → integrity → DB re-read → UPDATE `object_key` only → DB post-verify → telemetry.

Hard stop: not triggered (all five completed PASS).

---

## 5. Post-canary verification (global)

For each of 5:

| Check | Result |
|-------|--------|
| Canonical destination exists | PASS |
| Destination size = source size | PASS |
| DB `object_key` = canonical | PASS |
| Legacy source still exists | PASS |
| DB checksum not written (still NULL / UNKNOWN policy) | PASS |
| Quarantine not selected | PASS |

No Fleet / Backfill / Retirement / source deletion.

---

## 6. Observability (OD-BF-03)

Evidence JSON includes per-asset: `batch_id`, `asset_id`, `source_key`, `destination_key`, sizes, checks, DB key confirmation.

| Item | Value |
|------|-------|
| Failures | none |
| Retries | 0 |
| Remnants | none |
| Rollback | NOT_REQUIRED |

---

## 7. Mutation counts

| Kind | Count |
|------|------:|
| Storage COPY | **5** |
| DB `object_key` UPDATE | **5** |
| Other DB columns | **0** |
| Source deletes | **0** |
| Overwrites | **0** |

---

## 8. Runtime note

Executor process exited non-zero after asset loop solely because it incorrectly called the **DRY_RUN-only** archive helper on a LIVE summary. All five LIVE mutations had already completed SUCCESS. Post-verify re-HEADs + DB SELECTs confirmed PASS; evidence JSON written without re-mutation.

TEMP executor scripts removed after run. No secrets in evidence/audit.

---

## 9. Tests / typecheck / lint

Run after execution in same GO session (see final response).

---

## 10. STOP

Canary complete. **Not** Backfill GO. **Not** Fleet GO. Awaiting Architect Review.
