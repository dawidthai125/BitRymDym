# PLAN — FAR-01 LIVE Mutator Readiness (post–Gate C prep)

**Type:** Implementation / ops plan (not execution)
**Date:** 2026-10-03
**Depends on:** `RCA_FAR_01_LIVE_MUTATOR_READINESS.md` · `AUDIT_FAR_01_GATE_C_IMPLEMENTATION_READINESS.md`
**Does not authorize:** Canary · Backfill · credential provisioning · Production mutation

```text
THIS PLAN          = DESIGN ONLY
CANARY EXECUTION   = NOT AUTHORIZED
BACKFILL GO        = NOT AUTHORIZED (OD-BF-08)
SERVICE-ROLE       = FORBIDDEN AS DEFAULT
```

---

## 1. Goal

Close Gate C blockers so Architect/Owner can later issue a **Canary GO review** decision (separate from OD-BF-08 Backfill GO).

---

## 2. Workstreams (ordered)

### WS-1 — Production Storage mutator adapter (GC-MUT-01)

**Out of scope until Owner GO for adapter implementation.**

Requirements:

1. Source key from DB-mapped candidate only.
2. Destination key from deterministic FAR-01 builder only.
3. Pre-COPY: caller already ran `preMutationHeadCheck` (adapter may re-HEAD).
4. COPY with **fail-if-exists** / `upsert: false`.
5. Never DELETE / MOVE source.
6. Never use service-role as default; accept injected LIVE client only.

### WS-2 — Production DB mutator adapter (GC-MUT-02)

1. Single-row `UPDATE beat_audio_assets.object_key`.
2. Optimistic lock: `WHERE id = $assetId AND object_key = $expectedLegacyKey`.
3. Return `rowsAffected`; runner treats ≠1 as FAIL.
4. No owner/beat/status bulk writes.
5. Optional post-UPDATE SELECT of `object_key` for verify (recommended).

### WS-3 — LIVE role provisioning (GC-LIVE-CRED-01)

**Design only until Owner GO.** Do not reuse R1.

| Item | Spec |
|------|------|
| Role name (suggested) | `far01_live_mutator` (or equivalent JWT claim) |
| Credential class env | `FAR01_LIVE_CREDENTIAL_CLASS=live_mutator` |
| Env names | `FAR01_LIVE_SUPABASE_URL` · `FAR01_LIVE_MUTATOR_KEY` · `FAR01_LIVE_API_KEY` |
| DB grants | Minimal UPDATE as in RCA §3.3 |
| Storage grants | Create-if-absent COPY to destination only; no source delete |
| Deny | service-role · dry-run class mix · broad admin |

Verification checklist (future):

- [ ] R1 JWT rejected by LIVE resolver
- [ ] LIVE JWT rejected by dry-run resolver
- [ ] Attempted overwrite of existing destination fails
- [ ] Optimistic lock mismatch → 0 rows, no silent success

### WS-4 — A2 signed artifact (mechanism ready)

Mechanism shipped: `attestation.ts` evidence-bound payload · `od_bf_08: false` · `FAR01_GATE_C_EVIDENCE_BINDING_V1`.

Owner offline steps (future, not this plan's execution):

1. Confirm evidence IDs + git SHA + inventory counts.
2. Sign with offline Ed25519 private key.
3. Configure LIVE runner public key + `expectedEvidence`.
4. Keep `od_bf_08: false` until separate OD-BF-08 decision.

**Do not invent a production signed GO artifact in-repo.**

### WS-5 — Canary N=5 (selection ready; execution not)

- Pool = 67 MIGRATE-eligible only.
- Exclude quarantine / canonical / platform / destination conflict / identity anomaly / incomplete evidence.
- Deterministic sort: `created_at ASC`, `id ASC`.
- Preview IDs (not executed):
  `06f0226f-86e4-48fd-98ce-05bf333959d2`
  `5810a1a7-d494-461e-b994-a060c27f68d4`
  `2a24d6f5-f330-4d7b-93d3-05dc5a304bfa`
  `6170c8ee-cbe3-4b62-9ecc-459224869673`
  `10b7d85a-4aef-4d03-9626-e4c546f81215`

Execution requires: WS-1 + WS-2 + WS-3 + signed A2 + operator approval + Architect Canary GO (still ≠ OD-BF-08).

---

## 3. Explicit non-goals

- Changing OD-BF-02 locked policy text
- Persisting observed SHA-256 into DB without separate Owner decision
- Canary / Fleet / Backfill / Retirement execution
- Committing secrets or real GO signatures

---

## 4. Exit criteria for “READY FOR CANARY GO REVIEW”

All of:

1. GC-MUT-01 / GC-MUT-02 closed with tests against non-prod or Owner-approved harness
2. GC-LIVE-CRED-01 provisioned + verified (no service-role)
3. A2 verify path wired in LIVE runner with evidence binding
4. OD-BF-02 narrative accepted by Owner for LIVE policy (UNKNOWN + independent hash evidence)
5. Canary selection re-verified against live inventory (same 5 or documented drift)
6. OD-BF-08 remains **false** / separate

Until then classification stays **BLOCKED** for Canary execution readiness.
