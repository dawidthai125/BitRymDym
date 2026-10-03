# PLAN — FAR-01 Checksum UNKNOWN + Identity Mismatch Blockers

**Type:** Forward plan only (no implementation · no production mutation)
**Date:** 2026-10-03
**Sources:**
- `RCA_FAR_01_CHECKSUM_UNKNOWN.md`
- `RCA_FAR_01_IDENTITY_MISMATCH.md`
- `AUDIT_FAR_01_PRODUCTION_DRY_RUN_EVIDENCE_REVIEW.md`
- `DESIGN_FAR_01_BACKFILL.md` (OD-BF-01 / OD-BF-02 LOCKED)
- Archive `far01-prod-dry-run-2026-10-03.json` (**do not modify**)

```text
THIS PLAN AUTHORIZES     = NOTHING
IMPLEMENTATION           = NO (await separate Owner GOs)
BACKFILL GO (OD-BF-08)   = NO
CANARY / FLEET / RETIRE  = NOT AUTHORIZED
OD-BF-01 / OD-BF-02      = DO NOT CHANGE without separate Owner decision
```

---

## Context snapshot

| Item | Value |
|------|-------|
| Dry-run | PASS |
| Inventory | 68 legacy / 2 canonical / 3 platform / 28 orphans |
| UNKNOWN MIGRATE | 67 — `eligible_migrate_checksum_unknown` |
| QUARANTINE / ANOMALY | 1 — `000d406d-…` identity_mismatch |
| PASS SKIP | 2 — already_canonical |
| Mutations | 0 |

---

## Owner gates (explicit · independent)

| Gate | Name | Unlocks | Does **not** unlock |
|------|------|---------|---------------------|
| **GATE A** | **Checksum Evidence GO** | Track A evidence work only (policy choice and/or read-only hash campaign design/execution as specified) | Backfill · Canary · identity repair |
| **GATE B** | **Identity Investigation GO** | Track B deeper read-only forensics + Owner disposition packet | Auto-migrate · object_key rewrite · Backfill |
| **GATE C** | **Backfill GO (OD-BF-08)** | LIVE / canary pipeline under existing OD-BF-07 | — |

**GATE C must not follow automatically from A or B.**
Even if A accepts size-only and B keeps quarantine, **OD-BF-08 remains NO** until a separate Owner Backfill GO.

---

# TRACK A — CHECKSUM

## Objective

Resolve Owner stance on integrity evidence for the **67 UNKNOWN MIGRATE** assets (and the broader **68 checksum-NULL legacy** population) **without** coercing UNKNOWN → PASS and **without** mutating production unless a later dedicated write GO exists.

## Evidence required

| Evidence | Purpose |
|----------|---------|
| Dry-run archive (existing) | Classification baseline |
| Live `checksum_sha256` NULL/PRESENT counts | Confirm still 68/2 |
| Code paths: `audio-service` / `audio-transport` / `preflight` / `integrity` | How hashes are created vs consumed |
| OD-BF-02 locked text | Size-only already Owner-approved **as policy**, not as automatic GO |

## Exact files / modules (reference only)

- `src/lib/beats/far01-backfill/preflight.ts`
- `src/lib/beats/far01-backfill/integrity.ts`
- `src/lib/beats/far01-backfill/adapters/prod-db-reader.ts`
- `src/lib/beats/far01-backfill/adapters/prod-storage-inspector.ts`
- `src/lib/beats/audio-service.ts`
- `src/lib/beats/audio-transport.ts`
- `docs/audits/DESIGN_FAR_01_BACKFILL.md` §4.4

**No code changes under this plan until a separate Implementation GO.**

## DB evidence required

- SELECT counts: NULL vs PRESENT for USER MASTER READY
- Confirm PRESENT rows = canonical PASS pair only

## Storage evidence required

- HEAD/list sizes already in dry-run for 67
- **Full object download / SHA-256:** only if Gate A explicitly chooses option A1

## Security constraints

- No service-role
- No UNKNOWN→PASS coercion
- Size equality ≠ checksum PASS (C-03)
- R1 HEAD-only remains default; content download expands **C-R1-01** surface
- DB write of checksums = separate mutating GO (not Gate A by default)

## Read-only requirements

Default Track A work is **read-only**.
If Gate A selects **A1 (hash campaign)**: read of object **bytes** is a deliberate exception to HEAD-only and must be scoped, logged, and non-writing.

## Options under Gate A (Owner picks one primary)

| Option | Description | Auto “hash all 67”? |
|--------|-------------|---------------------|
| **A0** | Accept OD-BF-02 **size-only** for future LIVE design narrative; keep checksum UNKNOWN in telemetry | **NO** |
| **A1** | Authorize **read-only** SHA-256 evidence campaign (artifact only) | Only if Owner says so in Gate A text |
| **A2** | Later: persist hashes to DB (requires **separate write GO**) | NO under Gate A alone |
| **A3** | Defer | NO |

**Plan does not assume A1.** Technical feasibility exists; security/cost may make A0 preferable.

## Acceptance criteria (Track A)

- Owner records Gate A choice (A0–A3) in writing
- If A0: checklist that OD-BF-02 size-only conditions are understood for canary design
- If A1: hasher design reviewed (no DB write; allowlist buckets/keys; rate limit; archive location) before run
- Evidence review doc updated only after Gate A execution (separate audit)
- Archive `far01-prod-dry-run-2026-10-03.json` untouched

## Failure criteria

- Any DB/Storage mutation without write GO
- Relabeling UNKNOWN as PASS
- Using service-role
- Treating Gate A as Backfill GO

## Owner decision required

**GATE A — Checksum Evidence GO** with explicit option id.

## Rollback considerations

- A0/A3: N/A
- A1: delete local hash evidence artifacts only; no prod state to roll back
- A2 (future): DB checksum UPDATE rollback plan required before that GO

## Production execution gate

Track A execution **≠** canary/fleet.
**GATE C** still required for Backfill.

---

# TRACK B — IDENTITY MISMATCH

## Objective

Complete Owner-ready disposition package for asset
`000d406d-265e-4e49-bd3f-a542d5dd0b41`
while classification remains **QUARANTINE**.

## Evidence required

| Evidence | Status |
|----------|--------|
| Dry-run quarantine row | Present |
| Live DB row | Reconfirmed this RCA |
| Path UUID as asset.id | **0 rows** |
| Duplicate object_key | **1 row only** |
| Storage HEAD stored key | Exists (dry-run) |
| Storage HEAD expected twin | **Recommended under Gate B** (expect miss) |

## Exact files / modules

- `src/lib/beats/far01-backfill/mapping.ts`
- `src/lib/beats/far01-backfill/preflight.ts`
- `src/lib/beats/audio-validation.ts` (`buildLegacyUserBeatMasterObjectKey`)
- `docs/audits/DESIGN_FAR_01_BACKFILL.md` §3.1–3.4

## DB evidence required

Already captured; Gate B may re-SELECT same row + confirm no new collisions.

## Storage evidence required

- HEAD stored key
- HEAD expected twin `…/master/000d406d-….bin`
- Optional: list prefix `user/{owner}/{beat}/master/` for unexpected siblings

## Security constraints

- No auto-migrate
- No object_key UPDATE
- No COPY/DELETE
- Do not assume path UUID or DB id is “correct” without Owner
- Keep asset out of canary N=5 set

## Read-only requirements

All Gate B work is **read-only** unless a later disposition GO authorizes mutation.

## Options under Gate B

| Option | Description |
|--------|-------------|
| **B0** | Keep QUARANTINE; no further action |
| **B1** | Owner affirms DB id authority → future remapped migrate design (separate mutating GO) |
| **B2** | Owner affirms path UUID authority → requires explicit high-risk DB redesign GO |
| **B3** | Permanent exclude from FAR-01 |
| **B4** | More forensics only (logs / HEAD twin) then return to B0–B3 |

## Acceptance criteria (Track B)

- Expected-twin HEAD result recorded
- Owner disposition (B0–B3) written
- Asset remains non-MIGRATE in any batch tooling config
- Classification stays QUARANTINE until disposition GO says otherwise

## Failure criteria

- Any rewrite of `object_key` / COPY under “investigation”
- Inclusion in canary
- Treating Gate B as Backfill GO

## Owner decision required

**GATE B — Identity Investigation GO** (forensics), then **Owner disposition** (B0–B3).

## Rollback considerations

Read-only: N/A.
Future mutating disposition: must include OD-BF-04-style rollback (source retain; no retirement).

## Production execution gate

Track B complete **≠** GATE C.

---

## Sequencing recommendation (non-binding)

```text
1) OWNER REVIEW of RCA-A + RCA-B
2) GATE A decision (checksum stance)     ──┐
3) GATE B decision (identity forensics)  ──┼─→ independent
4) Optional: A1/B4 evidence execution      │
5) Only later, separate: GATE C Backfill GO
6) Then OD-BF-07: DRY_RUN (done) → CANARY N=5 → VERIFY → APPROVAL → FLEET
```

Quarantine asset **never** enters canary automatically.

---

## Explicit non-goals

- Implementing hasher / mutators
- Changing OD-BF-01 / OD-BF-02
- Cleaning 28 orphans
- Canary / fleet / retirement
- Commit / push / deploy

---

## Verification checklist (this planning step)

| Check | Result |
|-------|--------|
| DB mutation | **0** |
| Storage mutation | **0** |
| ENV/secrets change | **0** |
| service-role product path | **NO** |
| Archive modified | **NO** |
| Product code modified | **NO** |
| Deploy / commit / push | **NO** |

---

**Backfill GO: NO**
**Canary: NOT EXECUTED**
**Fleet: NOT EXECUTED**
**Retirement: NOT EXECUTED**

**STOP — await OWNER REVIEW**
