# AUDIT — FAR-01 Production Mutator Implementation

**Type:** Implementation audit (adapters + tests only)
**Date:** 2026-10-03
**Closes (code):** GC-MUT-01 · GC-MUT-02 · GC-MUT-03 (upsert:false enforcement in adapter)
**Does not close:** GC-LIVE-CRED-01 · OD-BF-08 · Canary GO
**Classification:** see §14

```text
PRODUCTION DB MUTATION       = 0
PRODUCTION STORAGE MUTATION  = 0
CANARY / BACKFILL / FLEET    = NOT EXECUTED
LIVE CREDENTIALS             = NOT PROVISIONED
SERVICE-ROLE                 = NO
FROM-ENV WRITE WIRING        = NONE
DEPLOY / COMMIT / PUSH       = NO (this workstream)
```

---

## 1. Executive summary

Production mutator **adapters** are implemented as dependency-injected code behind existing contracts (`Far01StorageMutator` · `Far01DbMutator`), with a gated LIVE executor enforcing Architect ordering and fail-closed gates.

**No Production mutation was executed.** Adapters are not auto-wired to Production env. LIVE credentials remain unprovisioned.

### Classification

# **IMPLEMENTATION VERIFIED WITH CONDITIONS**

Conditions: LIVE credentials still required before any Canary execution; OD-BF-08 still **NO**; Canary not authorized.

---

## 2. Implemented adapters

| Adapter | Path | Factory |
|---------|------|---------|
| Storage COPY | `adapters/prod-storage-mutator.ts` | `createFar01ProdStorageMutator(client)` |
| DB optimistic UPDATE | `adapters/prod-db-mutator.ts` | `createFar01ProdDbMutator(client)` |
| Gated LIVE executor | `live-mutation.ts` | `executeFar01LiveAssetMutation(...)` |
| Quarantine denylist | `quarantine.ts` | `FAR01_LOCKED_QUARANTINE_ASSET_IDS` |

**Not present (intentional):** `*FromEnv` write factories · admin client import · auto-run CLI.

Batch LIVE path (`batch.ts`) now calls `executeFar01LiveAssetMutation`.

---

## 3. Contract

| Contract item | Enforcement |
|---------------|-------------|
| `upsert: false` | Required param; adapter rejects ≠ false; dest HEAD hard stop |
| Source DB-authoritative | Identity gate: `asset.object_key === sourceKey` |
| Destination deterministic | Rebuild via `buildUserBeatAudioObjectKey`; refuse arbitrary keys |
| Optimistic DB lock | `WHERE id AND object_key = legacy AND storage_bucket` |
| object_key only | UPDATE payload = `{ object_key }` only |
| Fail closed | Deny mutators without LIVE inject; auth / identity / quarantine gates |

---

## 4. Execution ordering

```text
assert LIVE auth + A2 grant
→ identity / quarantine / canonical gates
→ SOURCE RE-HEAD
→ DESTINATION RE-HEAD   (DESTINATION_PRESENT → HARD STOP)
→ COPY (upsert:false)
→ DESTINATION VERIFY (+ source retained)
→ DB RE-HEAD (SELECT current object_key)
→ OPTIMISTIC DB UPDATE
→ DB VERIFY (SELECT object_key === canonical)
```

Order is implemented in `executeFar01LiveAssetMutation` + prod DB mutator internals. Not reversed.

---

## 5. Re-HEAD

| Step | Where |
|------|-------|
| Pre-COPY source + dest HEAD | `preMutationHeadCheck` + storage mutator defense-in-depth HEAD |
| Post-COPY source + dest HEAD | `postCopyReHeadVerify` |
| Pre-UPDATE DB re-read | `createFar01ProdDbMutator` SELECT |
| Post-UPDATE DB verify | SELECT after UPDATE |

Dry-run evidence is never used as sole mutation authority.

---

## 6. Optimistic locking

```sql
UPDATE beat_audio_assets
SET object_key = $destination
WHERE id = $assetId
  AND object_key = $expectedLegacy
  AND storage_bucket = 'beat-audio'
```

Pre-check: current `object_key` must equal expected legacy.
`rowsAffected !== 1` → FAIL. No bulk / owner / beat predicates.

---

## 7. Identity gate

Before COPY: `assertFar01MutationIdentityGate` confirms asset.id · owner_id · beat_id · current object_key · expected canonical destination. Path mismatch → DENY (QUARANTINE semantics). Arbitrary destination → DENY.

---

## 8. Quarantine gate

Locked id (B0):

`000d406d-265e-4e49-bd3f-a542d5dd0b41`

Denied in identity gate and DB mutator. Never executable by production mutator path.

---

## 9. Destination conflict

`DESTINATION_PRESENT` → hard stop (no overwrite, no skip-copy success). Retry with existing destination → CONFLICT / OWNER_REVIEW semantics (DENY). Same-size resume shortcut **removed**.

---

## 10. Rollback (OD-BF-04)

- No source DELETE / MOVE in adapters
- No automatic cleanup on failure
- Source retained on COPY/DB failure
- Destination may remain for inspection
- `planFar01Rollback` unchanged (DB revert to legacy)
- No automatic rollback executor added

---

## 11. Retry

Idempotent refusal: destination present → DENY. No overwrite. No automatic success. Concurrent DB key change → optimistic lock FAIL / DENY.

---

## 12. Credential boundary

| Control | Status |
|---------|--------|
| Injected client only | **YES** |
| No `*FromEnv` mutator factory | **YES** |
| No admin client import | **YES** |
| Service-role as apikey denied | **YES** (`assertFar01*MutatorClientAllowed`) |
| R1 not extended | **YES** |
| RLS / Storage policies unchanged | **YES** |
| LIVE credentials provisioned | **NO** |

LIVE class remains `live_mutator` (design). Runtime still requires explicit inject + A2 + operator approval via batch gates.

---

## 13. A2 gate dependency

LIVE mutation requires opaque `Far01VerifiedLiveGrant` from `verifyFar01SignedGoArtifact`. Plain `backfillGo: true` insufficient. Wrong mode (DRY_RUN) denied. Missing / invalid grant denied.

`od_bf_08` on A2 remains **false** — adapters do not grant Backfill GO.

---

## 14. Test results

| Suite | Result |
|-------|--------|
| `far01-backfill.test.ts` | PASS |
| `far01-backfill-blockers.test.ts` | PASS |
| `far01-prod-dry-run.test.ts` | PASS |
| `far01-prod-mutator.test.ts` (new) | PASS |
| **Total FAR-01** | **111 / 111** |
| `tsc --noEmit` | PASS |
| relevant ESLint | PASS |

Covered cases include: source missing · dest present · source/dest drift · identity · quarantine · DB key change · upsert false · COPY→DB success · COPY fail→no DB · DB fail source retained · post-verify fail · service-role · missing LIVE auth · invalid A2 · wrong mode · retry dest conflict · deterministic dest · arbitrary dest · owner/beat mismatch · inventory class denials.

---

## 15. Security review

| Risk | Mitigation |
|------|------------|
| Accidental Production write | No FromEnv write wiring; no Canary/Backfill CLI invoke |
| Service-role default | Explicit deny helpers; no admin import |
| Overwrite | HEAD + upsert:false |
| Blind UPDATE | Pre-read + optimistic predicate + post-verify |
| Quarantine migrate | Locked id denylist |
| Client key authority | Deterministic builder + identity gate |

---

## 16. Limitations / conditions

1. **GC-LIVE-CRED-01** still open — LIVE role not provisioned.
2. **Canary GO = NO** — adapters must not be executed in Production until Architect/Owner authorize.
3. **OD-BF-08 = NO** — Backfill GO not granted.
4. Adapters tested with in-memory fakes — not against Production.
5. Supabase Storage `copy` API has no native upsert flag; absence is enforced by pre-COPY HEAD.
6. OD-BF-02 unchanged — checksum not written.

---

## 17. Blocker status after this implementation

| Blocker | Status |
|---------|--------|
| GC-MUT-01 | **CLOSED (implementation)** |
| GC-MUT-02 | **CLOSED (implementation)** |
| GC-MUT-03 | **CLOSED (implementation)** |
| GC-LIVE-CRED-01 | **OPEN** |
| OD-BF-08 | **OPEN (NO)** |
| Canary execution | **NOT AUTHORIZED** |

---

## 18. Safety report

| Control | Result |
|---------|--------|
| Production DB mutations | **0** |
| Production Storage mutations | **0** |
| Service-role | **NO** |
| LIVE credentials | **NOT PROVISIONED** |
| Canary | **NOT EXECUTED** |
| Backfill | **NOT EXECUTED** |
| Fleet | **NOT EXECUTED** |
| Retirement | **NOT EXECUTED** |
| Deploy | **NO** |
| Commit | **NO** |
| Push | **NO** |

---

## 19. STOP

Implementation complete for production mutator adapters.
**Await Architect Review.** Do not execute Canary. Do not execute Backfill.
