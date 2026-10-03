# FAR-01 — CURRENT STATE (LIVING)

**Updated:** 2026-10-03
**Type:** Living operational status · not a historical closeout
**Rule:** Prefer this file + LIVE evidence over stale Phase 1 inventory numbers in older handoffs.

```text
FAR-01 DR-A (Phase 1)     = SHIPPED / PRODUCTION VERIFIED
FAR-01 CAMPAIGN           = IN PROGRESS / SOAK ACTIVE
FAR-01 CLOSED             = NO
RETIREMENT                = NOT EXECUTED
CLEANUP                   = NOT EXECUTED
MIGRATE candidates        = 0
```

---

## 1. Planes

| Plane | Value |
|-------|--------|
| Repository tooling tip | `e03f3be` — `feat(far01): add production backfill operator tooling` |
| Production app SHA | `e03f3be` (operator tooling; not a UI feature release) |
| Production deployment | `6823806375` |
| DB roles | `far01_dryrun_readonly` · `far01_live_mutator` |
| DB migrations | `20261002231150` · `20261003012453` (also in repo HEAD) |

---

## 2. Campaign progress

| Gate | Status |
|------|--------|
| R1 readonly role | APPLIED + repo reconciled |
| LIVE mutator role | APPLIED + repo reconciled |
| Production dry-run | EXECUTED (evidence) |
| Checksum / identity | RESOLVED for campaign gates (evidence) |
| Canary N=5 | **PASS** |
| Fleet N=62 | **PASS** |
| Soak | **ACTIVE** |
| Soak start | `2026-10-03T04:40:56.645Z` |
| Soak end (target) | `2026-10-04T04:40:56.645Z` |
| Interim soak | **PASS** · no inventory drift |
| Final soak / closeout | **PENDING** |

**Correct summary sentence:**
FAR-01 backfill campaign executed through canary + fleet; soak ACTIVE; final closeout pending.

**Forbidden claims:** FAR-01 CLOSED · backfill fully completed · retirement completed · cleanup completed.

---

## 3. Inventory (soak baseline / interim — no drift)

| Class | Count |
|-------|------:|
| legacy USER | 1 |
| canonical USER | 77 |
| platform | 3 |
| retained legacy sources | 67 |
| true/historical orphans | 30 |
| total orphan Storage | 97 |
| quarantine | 1 |
| MIGRATE candidates | 0 |

Evidence anchors (session):

- `docs/audits/AUDIT_FAR_01_SOAK_START.md`
- `docs/audits/AUDIT_FAR_01_INTERIM_SOAK.md`
- `docs/audits/evidence/far01-soak-start-baseline.json`
- `docs/audits/evidence/far01-interim-soak.json`
- `docs/audits/evidence/far01-canary-n5-*.json`
- `docs/audits/evidence/far01-fleet-62-*.json`

---

## 4. Next gate

```text
WAIT FOR SOAK END
  → FINAL SOAK AUDIT (read-only)
  → RECONCILIATION / Owner Review
  → FAR-01 CLOSEOUT only if evidence supports
  → only then Owner Decision for retirement / next epic
```

Do **not** auto-start: orphan cleanup · key retirement · STORAGE-ARCH-02 external storage · new backfill.

---

## 5. Historical note

Phase 1 DR-A dual-accept closeout remains valid history:
[FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md](./FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md)
Its pre-campaign inventory numbers (**68** legacy etc.) are **historical**, superseded for living ops by §3 above.
