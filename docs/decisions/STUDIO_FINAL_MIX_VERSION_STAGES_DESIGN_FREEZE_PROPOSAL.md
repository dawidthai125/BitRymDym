# Studio Final Mix — Version & Domain Stages Design Freeze

**Status:** `OWNER ACCEPTED` (docs) — **NOT IMPLEMENTED**  
**Accepted:** 2026-10-14 (with Owner Correction C naming + Correction A AuthZ/downgrade)  
**Type:** DESIGN FREEZE — living for SFM version/stages/grants/slots documentation  
**Product contract:** [STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md](./STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md)  
**F-addendum:** [STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md](./STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md) (`OWNER ACCEPTED` docs · F02b/F03b)  
**Parent SFM freeze:** [STUDIO_FINAL_MIX_DESIGN_FREEZE.md](./STUDIO_FINAL_MIX_DESIGN_FREEZE.md)

```text
OD-SFM-08 / 12 / 14 = OWNER ACCEPTED
THIS DOCUMENT = OWNER ACCEPTED design freeze detail (docs)
IMPLEMENTATION = NOT AUTHORIZED
≠ E3 render_jobs.kind = 'MIX' · ≠ mix_sessions · ≠ TAKE_EXPORT
Domain stage names = SFM_MIX / SFM_MASTER (Correction C)
```

---

## 1. Locked Owner decisions

### OD-SFM-08 — Variant C (**OWNER ACCEPTED**)

- Durable **domain stage records** per accepted version.
- Technical **jobs** are a separate execution layer.
- `SFM_MIX` and `SFM_MASTER` are separate domain stages (see §3.0).
- `SFM_MIX` MVP may be a **light** prepare/validate stage.
- Full offline bake occurs in **`SFM_MASTER`**.
- Must **not** equate Studio domain stages with E3 `render_jobs.kind = 'MIX'`.
- Must **not** merge with `mix_sessions` or `TAKE_EXPORT`.
- Technical job status does **not** replace domain stage status.

### OD-SFM-12 — Retention (**OWNER ACCEPTED**)

- 90 days from `MASTER_SUCCEEDED` / final eligibility (domain: `SFM_MASTER` succeeded).
- Shared retention anchor for all qualities of that version.
- On TTL: clear `current_final_version_id` if it points at expired version; keep tombstone/metadata/audit; do not present as current final.
- Logical grant ≠ physical file existence.
- Regenerate only if snapshot + authorized sources remain.

### OD-SFM-14 — Paid day-slot Variant B (**OWNER ACCEPTED**)

- 7,99 PLN → one extra first-download limit that day (`AVAILABLE` after paid).
- Bind to version atomically at first-download **grant**.
- Unused slot expires midnight `Europe/Warsaw` (no rollover).
- Re-download of entitled version does not consume grant/slot.
- Refund before use → revoke unused slot.
- Refund after use → keep grant; do not auto-revoke grant; do not re-credit daily limit.
- Payment provider still **OPEN** (OD-04); idempotent webhooks required when chosen.

---

## 2. Relation to current `STUDIO_EXPORT` / WAV (FACT vs target)

| Plane | Today (FACT) | Target |
|-------|--------------|--------|
| Trigger | UI „Eksportuj WAV” → enqueue | After Accept → `SFM_MIX` → `SFM_MASTER` only |
| Domain stages | None | Durable `SFM_MIX` / `SFM_MASTER` records |
| Job | `kind=STUDIO_EXPORT`, WAV-only | Executors after stage gates; lazy quality encode |
| Snapshot | `document_snapshot` on job | Version immutable snapshot at Accept |
| Download | Artifact AuthZ + capability | + version grant + current/historical + F02b AuthZ |

Living WAV MVP code may remain until Implementation GO.

---

## 3. Domain model

### 3.0 Correction C — domain stage names (**OWNER ACCEPTED**)

Preferred domain stage identifiers:

| Domain name | Meaning |
|-------------|---------|
| **`SFM_MIX`** | Studio Final Mix mix stage (prepare/validate) |
| **`SFM_MASTER`** | Studio Final Mix mastering stage (offline bake) |

Rules:

- These are **Studio Final Mix domain names**, not `render_jobs.kind` values.
- They do **not** change existing E3 `kind='MIX'`.
- Existing E3 MIX jobs **must not** be used as SFM domain stages.
- Do not expand technical job-kind enums without need; executors remain a separate layer (e.g. continue using distinct job kinds / refs as Implementation Design requires).

### 3.1 Entities

```text
StudioFinalVersion
  id, project_id, owner_id
  source_document_version
  content_snapshot / fingerprint
  accepted_at
  retention_anchor_at?   -- set when SFM_MASTER succeeds
  expires_at?            -- anchor + 90d
  status: ACCEPTED | … | EXPORTS_ELIGIBLE | SUPERSEDED | EXPIRED

StudioFinalStage
  version_id
  kind: SFM_MIX | SFM_MASTER
  status: PENDING | RUNNING | SUCCEEDED | FAILED
  job_id? (executor ref only)
  error_code?
  unique (version_id, kind)

StudioFinalVersionGrant
  user_id, version_id
  source: DAILY | PAID_SLOT
  granted_at
  -- quality entitlement history per OD-SFM-17 / F02b §3.4

StudioFinalPaidDaySlot
  user_id, day_bucket (Europe/Warsaw)
  status: AVAILABLE | CONSUMED | EXPIRED | REVOKED
  payment_ref (idempotent)
  bound_version_id? (set on consume)
```

Project-level `current_final_version_id` preferred over embedding `current_final` only on the version row.

### 3.2 Minimal state transitions (version)

```text
ACCEPTED
  → SFM_MIX_PENDING → SFM_MIX_RUNNING → SFM_MIX_SUCCEEDED | SFM_MIX_FAILED
  → (from SFM_MIX_SUCCEEDED) SFM_MASTER_PENDING → … → SFM_MASTER_SUCCEEDED | SFM_MASTER_FAILED
  → (from SFM_MASTER_SUCCEEDED) EXPORTS_ELIGIBLE
  → SUPERSEDED (new Accept on newer version)
  → EXPIRED (retention TTL)
```

Illegal: `SFM_MASTER` before `SFM_MIX` succeeded; encode/grant-as-new-final before `SFM_MASTER` succeeded; treating job SUCCEEDED as domain succeeded without stage row update.

### 3.3 Realization (MVP)

| Stage | Domain meaning | MVP executor |
|-------|----------------|--------------|
| `SFM_MIX` | Prepare / validate / AuthZ sources / freeze plan | Light job or inline durable transition |
| `SFM_MASTER` | Offline bake → internal master representation | Heavy worker job (today’s bake core) |
| Export variants | Lazy encode per quality | Separate encode jobs after EXPORTS_ELIGIBLE + grant |

### 3.4 Separated concerns

| Concern | Not equal to |
|---------|--------------|
| Domain stage status (`SFM_*`) | Job status |
| Version grant | Artifact READY / current |
| Artifact current for quality | Current final version pointer |
| URL issuance | Grant consume |

### 3.5 Grant + slot transaction

Atomic server transaction:

1. Assert owner + version `EXPORTS_ELIGIBLE` + file-policy checks.  
2. If grant exists → allow re-download path (**no** daily/slot consume) — Correction A.  
3. Else if daily remaining → consume daily + insert grant.  
4. Else if `AVAILABLE` paid slot for Warsaw day → consume slot (bind version) + insert grant.  
5. Else deny.

Payment webhook only creates/updates slot `AVAILABLE` (idempotent). Never creates grant alone.

### 3.6 Correction A — downgrade / historical quality (**OWNER ACCEPTED**)

- Re-download under an existing version grant does **not** consume daily limit or paid slot.
- After plan **downgrade**, qualities previously entitled for that version remain downloadable (**OD-SFM-17**).
- Qualities **never** previously entitled follow the **current** plan only.
- Grant persistence ≠ infinite file retention (F03b / artifact status / regenerate rules).
- AuthZ checks version + quality entitlement; `object_key` / prior URL / `READY` alone are insufficient (see F02b §3.4).

---

## 4. Still OPEN

- Payment **provider** / webhook contract (**OD-04**).  
- Exact table/column names and migration pack.  
- Whether `SFM_MIX` always enqueues a job vs pure DB transition.  
- Detailed concurrency SQL (RPC vs app transaction) — Implementation Design.  
- Contabo/poller changes for new executors.  
- Exact promote-current-artifact algorithm under Correction B (domain invariant accepted; SQL TBD).

---

## 5. Required tests (list only — before Implementation GO)

- Illegal domain transitions; E3 `kind=MIX` cannot write SFM stages.  
- Grant unique + concurrent last daily/slot.  
- Slot midnight Warsaw + DST; refund AVAILABLE vs CONSUMED.  
- Downgrade: historical quality allow; new quality deny.  
- TTL clears current_final; historical labeling.  
- Job SUCCEEDED without stage update ≠ `SFM_MASTER` succeeded.  
- At most one current artifact per `(versionId, QUALITY)`.

---

## 6. Implementation gate

Implementation requires a **separate Owner GO**. This document authorizes documentation freeze only — not code, migrations, Contabo, or payments.
