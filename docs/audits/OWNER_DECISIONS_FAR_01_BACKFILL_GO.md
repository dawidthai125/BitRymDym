# OWNER DECISIONS — FAR-01 BACKFILL GO BLOCKERS

**Type:** Owner Decision Record
**Date:** 2026-10-02
**Status:** **OWNER DECISION LOCKED** (OD-ATT-01 · OD-DRYRUN-01 · OD-CANARY-N)
**Sources:**
- [RCA_FAR_01_BACKFILL_GO_BLOCKERS.md](./RCA_FAR_01_BACKFILL_GO_BLOCKERS.md)
- [PLAN_FAR_01_BACKFILL_GO_BLOCKERS.md](./PLAN_FAR_01_BACKFILL_GO_BLOCKERS.md)
- [DESIGN_FAR_01_BACKFILL.md](./DESIGN_FAR_01_BACKFILL.md)
- Prior OPEN packet content in this file (superseded for the three locked IDs)

```text
OD-ATT-01      = A2 (LOCKED)
OD-DRYRUN-01   = YES WITH CONDITIONS (LOCKED)
OD-CANARY-N    = 5 (LOCKED)
OD-BF-08       = SEPARATE GATE
BACKFILL GO    = NO
CANARY         = NOT EXECUTED
PRODUCTION DRY-RUN = NOT EXECUTED
THIS LOCK AUTHORIZES = decision record only
                     ≠ implementation
                     ≠ production dry-run execution
                     ≠ Backfill GO
                     ≠ canary / fleet / retirement
                     ≠ Storage / DB mutation
```

---

## Owner Decision Lock

### Locked table

| ID | Status | Decision (Owner — exact) |
|----|--------|--------------------------|
| **OD-ATT-01** | **LOCKED** | **A2** — Signed GO artifact |
| **OD-DRYRUN-01** | **LOCKED** | **YES WITH CONDITIONS** (conditions below) |
| **OD-CANARY-N** | **LOCKED** | **5** |
| **OD-BF-08** | **SEPARATE GATE** | Backfill GO = **NO** — not granted by this lock |

---

### OD-ATT-01 = A2 (LOCKED)

**Choice:** Signed GO artifact.

| Requirement | Locked rule |
|-------------|-------------|
| Artifact | Owner-signed GO artifact required for LIVE |
| Contents | Must carry **scope**, **expiry**, **issuer** (and GO affirmative) |
| Verification | Production LIVE **runner** verifies signature + expiry + scope before any LIVE path |
| In-process boolean | **Not trusted** as proof of authorization |
| Default deny | Absent / unverified grant → **DENY** |
| Invalid signature | **DENY** |
| Expired artifact | **DENY** |
| Wrong scope | **DENY** |

**Does not:** grant OD-BF-08 · execute LIVE · wire mutators · change default deny for dry-run.

---

### OD-DRYRUN-01 = YES WITH CONDITIONS (LOCKED)

**Choice:** Production-safe dry-run is **authorized in principle**, subject to **all** conditions below.

| # | Condition (mandatory) |
|---|------------------------|
| 1 | **B-04 loader capability must exist** before any production dry-run execution |
| 2 | Mode **forced DRY_RUN** |
| 3 | Mutators **DENY** (absent or deny-only adapters) |
| 4 | **No** Storage COPY / MOVE / DELETE |
| 5 | **No** DB UPDATE / INSERT / DELETE |
| 6 | **Read-scoped** credentials |
| 7 | **DB-authoritative** inventory |
| 8 | **No** free-form client / operator paths |
| 9 | **Full** inventory snapshot in evidence |
| 10 | **Per-asset** planned disposition |
| 11 | **Explicit** checksum **UNKNOWN** where applicable |
| 12 | Archive **batch_id** / runner **SHA** / **operator id** |
| 13 | Evidence **`live_mutations_attempted = 0`** |
| 14 | Dry-run **does not** grant Backfill GO |
| 15 | Production dry-run still requires a **separate operational execution step** (this lock ≠ run now) |

**Does not:** execute production dry-run · grant OD-BF-08 · authorize canary/fleet.

---

### OD-CANARY-N = 5 (LOCKED)

**Choice:** Canary size **N = 5**.

| Rule | Locked behavior |
|------|-----------------|
| N explicit | Required — no implicit unlimited |
| N = 5 | Canary = first **5** MIGRATE-eligible assets |
| N < 1 | **DENY** |
| N = 0 | **DENY** |
| N < 0 | **DENY** |
| Non-integer | **DENY** |
| N > inventory (eligible) | **DENY** |
| `null` / omitted | **DENY** |
| Ordering | Deterministic: **`created_at`**, then **`id`** |
| Quarantine | **Never** enters canary set |
| Sequence | **VERIFY** before **APPROVAL** · **APPROVAL** before **FLEET** |
| FLEET without verified canary | **DENY** |

**Does not:** execute canary · grant OD-BF-08 · allow fleet without verified canary.

---

### OD-BF-08 = SEPARATE GATE (REAFFIRMED)

```text
OD-BF-08     = SEPARATE GATE
BACKFILL GO  = NO
```

Even with OD-ATT-01 / OD-DRYRUN-01 / OD-CANARY-N locked:

- LIVE Storage COPY — **not authorized**
- DB `object_key` UPDATE — **not authorized**
- Canary LIVE / fleet — **not authorized**
- Retirement — **not authorized**

A future, distinct Owner act is required for Backfill GO.

---

## Gate posture (after lock)

| Gate | Status |
|------|--------|
| OD-ATT-01 | **LOCKED = A2** |
| OD-DRYRUN-01 | **LOCKED = YES WITH CONDITIONS** |
| OD-CANARY-N | **LOCKED = 5** |
| OD-BF-08 Backfill GO | **SEPARATE GATE · NO** |
| Implementation of plan phases | **NOT AUTHORIZED** by this lock alone |
| Production dry-run execution | **NOT EXECUTED** · needs loader + separate ops step |
| Canary / fleet / retirement | **NOT EXECUTED / NOT AUTHORIZED** |

---

## Explicit non-authorizations

```text
Implementation                              = NOT AUTHORIZED by this lock alone
Production dry-run execution                = NOT AUTHORIZED until conditions + ops step
Canary LIVE                                 = NOT AUTHORIZED
Backfill LIVE / fleet                       = NOT AUTHORIZED (OD-BF-08 = NO)
Retirement                                  = NOT AUTHORIZED
Storage COPY/MOVE/DELETE                    = NOT AUTHORIZED
DB UPDATE/INSERT/DELETE                     = NOT AUTHORIZED
```

---

## Next gate

```text
NEXT = Owner may authorize Implementation of named plan phases
       (PHASE A attestation A2 · PHASE C loader · PHASE D canary N=5 · …)
       still Backfill GO = NO
THEN = After B-04 loader: separate operational execution of production dry-run
       under OD-DRYRUN-01 conditions
THEN = Backfill GO review packet
THEN = OD-BF-08 (currently NO)
```

---

## Verification (this lock)

| Check | Value |
|-------|--------|
| OD-ATT-01 | **A2** |
| OD-DRYRUN-01 | **YES WITH CONDITIONS** |
| OD-CANARY-N | **5** |
| OD-BF-08 | **SEPARATE GATE** |
| Backfill GO | **NO** |

---

## Repository safety

| Check | Result |
|-------|--------|
| Only file touched | `docs/audits/OWNER_DECISIONS_FAR_01_BACKFILL_GO.md` |
| Code / ENV / secrets / Supabase / Storage | **UNTOUCHED** |
| Commit / Push / Deploy | **NONE** |
| Backfill / canary / prod dry-run | **NOT EXECUTED** |
| Mutations | **NONE** |

---

**OWNER DECISION LOCK COMPLETE**
**OD-ATT-01 = A2**
**OD-DRYRUN-01 = YES WITH CONDITIONS**
**OD-CANARY-N = 5**
**OD-BF-08 = SEPARATE GATE**
**BACKFILL GO = NO**
