# Orphan Cleanup — Inventory & Classification Design Freeze

**Status:** DESIGN FREEZE (documentation only)  
**Contract version:** `orphan-inv-class-v1`  
**Date:** 2026-10-25  
**Basis:** Owner-approved Design Freeze after audit *ORPHAN INVENTORY AND CLASSIFICATION DESIGN AUDIT* (`CONDITIONAL PASS`).  
**Related ops:** [ORPHAN_CLEANUP_FAIL_STOP_RUNBOOK.md](./ORPHAN_CLEANUP_FAIL_STOP_RUNBOOK.md) (fail-stop / mutate procedure — separate from this contract).

This document is the **design contract** for inventory, DB completeness controls, redacted classification reporting, and fail-closed behavior. Phases 2–3 local implementation exists under `scripts/orphan-cleanup/` and wiring in `scripts/production-storage-orphan-cleanup.ts`. This document still **does not** authorize production access, Storage listing against production, `--classify` against production, or `--execute`.

---

## Legend

| Tag | Meaning |
|-----|---------|
| **FACT** | Confirmed against analyzed tip code / prior local test run / this freeze text as a design decision recorded here |
| **INFERENCE** | Design conclusion derived from FACT; not independently re-proven in production |
| **NOT VERIFIED** | Requires further evidence before implementation or production use |
| **DESIGN** | Normative choice in this freeze (not yet shipped) |

---

## F. Current status and open issues (read first)

### FACT (current tip behavior)

- The orphan CLI does **not** list Storage itself; it consumes an `orphan-inv-v1` inventory document via default path, `--inventory-path`, or `--inventory-stdin` (exporter is **memory-only** — CLI does not write inventory files).
- Default `--classify` operator artifact is **redacted** (`PRODUCTION_STORAGE_ORPHAN_CLASSIFICATION_REDACTED.json`): digests/counts/flags only — **no** raw `object_path` / `paths` arrays.
- DB classify loads use explicit pagination (`.order("id").range`) + exact count controls via `fetchCompleteTable` (page size 500 in CLI wiring).
- Completeness flags: `count_complete`, `pages_consistent` are partial controls; `snapshot_consistent` is always `false` (no membership-freeze proof).
- Local mock suites prove only mocked behaviors — **not** production data completeness, Storage safety, or deploy parity.
- Production Storage/DB completeness and live API ceilings remain **NOT VERIFIED**.
- `--execute` / production Storage mutation remains **NOT AUTHORIZED** by this freeze.

### INFERENCE

- A safe production read-only verification path still requires a **separate Owner GO** (Phase 4 plan) to verify live limits and produce an authorized inventory input — local redaction/exporter do not replace that GO.

### NOT VERIFIED (before production claims)

- Exact Supabase Storage list API page limits, concurrent-write correctness, and failure modes for this project’s scale.
- Hosted PostgREST `max_rows` / `db-max-rows` for this project.
- Fitness of any live Storage `listPage` adapter (not authorized here).

### DESIGN decisions in this freeze

- Default operator-facing classification report is **redacted**.
- Raw path dumps are a **separate**, Owner-gated artifact class — not the default.
- Incomplete inventory or incomplete DB gates ⇒ **fail-closed** (no actionable `SAFE_DELETE`).
- `snapshot_consistent=false` must remain visible in operator reports; never claim snapshot from count/pages alone.

---

## A. Inventory contract

**Purpose (DESIGN):** Produce evidence that a listing of bucket `beat-audio` was attempted under controlled rules, and whether it finished completely.

### A.1 Scope

| Field / rule | Requirement |
|--------------|-------------|
| Bucket | `beat-audio` only for this contract |
| Prefixes in scope | All objects under the bucket for orphan planning: at minimum classify into path kinds `user`, `platform`, `catalog`, and `other` (unknown prefix) |
| Environment id | Non-secret label only (e.g. project ref alias / “production” / “staging”) — **never** service-role keys, JWTs, or connection strings |
| `listing_started_at` / `listing_finished_at` | ISO-8601 timestamps bounding the listing attempt |

### A.2 Pagination and termination (DESIGN)

Required evidence fields (normative names may be mapped 1:1 in a future exporter):

- `page_size` — declared page size used for the run  
- `pages_completed` — count of successfully fetched pages  
- `objects_accumulated` — count of objects accepted into the inventory set  
- `pagination_mechanism` — description of cursor/offset/token used (**NOT VERIFIED** which Supabase mechanism is correct until implementation spike)  
- `end_condition` — explicit predicate that ended the loop (e.g. “empty page” / “no next cursor”)  
- `listing_status`: one of `in_progress` \| `complete` \| `incomplete` \| `failed`

**Rules:**

1. Error on **any** page ⇒ transition to `failed` (or `incomplete` if partial pages were kept for forensics) and **must not** be promoted to `complete`.  
2. A partial listing **must not** be labeled `complete`.  
3. Abort / cancel mid-run ⇒ `incomplete` or `failed`, never `complete`.  
4. Supabase list limits and API mechanics are **NOT VERIFIED** here; implementation **must** verify them before claiming completeness.

### A.3 Integrity controls without raw paths in the ordinary report (DESIGN)

Ordinary inventory **summary** report (operator-facing) includes:

- `key_set_digest` — digest over the **sorted** set of object keys (algorithm named in the artifact, e.g. SHA-256 of newline-separated keys). Purpose: detect accidental truncation or silent rewrite of the set between inventory and classify.  
- `counts_by_path_kind` — counts for `user` / `platform` / `catalog` / `other`  
- `objects_accumulated`, pagination fields, status, environment id, timestamps  

Ordinary report **must not** include full Storage object paths or user UUIDs.

**Digest limitations (DESIGN + FACT of cryptography):** A path digest supports integrity and opaque cross-reference inside a controlled process. It is **not** a guarantee of anonymization or unlinkability; parties who already know a path can recompute the digest and correlate.

### A.4 Separation: file inventory vs fresh listing (FACT / DESIGN)

| Kind | Meaning |
|------|---------|
| File-backed inventory | Input file consumed by today’s classify path — completeness equals whatever wrote the file |
| Fresh Storage listing | New exporter run under this contract — only then may `listing_status=complete` be claimed for that run |

This freeze does **not** treat an existing on-disk inventory file as proof of a fresh complete listing.

---

## B. Database completeness contract

**Purpose (DESIGN):** Classification context loaded from the database must be either **proven complete for the run** or the run must fail closed.

### B.1 Sets requiring completeness evidence (FACT of current classify inputs / DESIGN for future)

Classification context in the analyzed design depends on sets derived from at least:

- `beat_audio_assets` (keys / ids / beat linkage used in classify)  
- `beats` (live ids / platform ownership signals)  
- `takes` (keys / ids)  
- `studio_clips` (source beat signals)  
- `studio_projects` (beat linkage)  
- `audio_artifacts` (keys)  
- plus allowlist / deleted-beat id inputs required by the classify process  

Future implementation must name each fetched set in the run evidence and attach a completeness check per set.

### B.2 Rules (DESIGN)

1. **Query error ⇒ abort.** A failed DB read must stop the run; it must not yield a “complete” classification. (**Aligned with FACT:** current production deps already `stop` on query errors.)  
2. **Successful `.select()` alone does not prove completeness.** (**FACT:** analyzed path has no explicit pagination; **INFERENCE:** silent row caps are a risk.)  
3. Implementation must use **explicit pagination** or another **verified** completeness mechanism (e.g. documented API guarantee + control count). Exact PostgREST limits remain **NOT VERIFIED** until checked.  
4. **Control comparison:** for each critical set, compare `fetched_row_count` to a trustworthy control (e.g. `count`/`head` exact total, or last-page emptiness under a verified page size). Mismatch ⇒ fail-closed.  
5. If completeness checks do not pass ⇒ `db_read_complete=false` and no complete classification / no delete candidates.

Do **not** change DB schema under this freeze. Do **not** run queries under this freeze.

---

## C. Redacted classification report

**Purpose (DESIGN):** Default audit output that preserves classification auditability without embedding raw paths or user UUIDs.

### C.1 Default schema (`report_contract_version`: `orphan-inv-class-v1`)

| Field | Description |
|-------|-------------|
| `classified_at` | ISO-8601 classification time |
| `report_contract_version` | `orphan-inv-class-v1` |
| `inventory_digest` | Same family as inventory `key_set_digest` for the inventory used |
| `inventory_object_count` | Objects presented to classify |
| `summary.total` / `SAFE_DELETE` / `KEEP` / `UNKNOWN` | Aggregate classification counts |
| `by_path_kind` | Map of path kind → counts per classification |
| `size_null_count` | Rows with missing size |
| `inventory_complete` | boolean — inventory passed final-classify acceptance |
| `db_read_complete` | boolean — raw DB fetch gate (not a snapshot proof) |
| `count_complete` | boolean — fetched length matched exact count (not a snapshot proof) |
| `pages_consistent` | boolean — ordered pages without duplicate/missing PK (not a snapshot proof) |
| `snapshot_consistent` | always `false` with current mechanism — membership freeze **not** proven |
| `actionable_gates_pass` | `inventory ∧ db_read ∧ count ∧ pages` — required for actionable `SAFE_DELETE`; does **not** imply snapshot |
| `integrity` | Result of gate/digest consistency checks (`pass` \| `fail` + reason code) |
| `optional_digest_samples` | Optional short prefixes of path digests for SAFE_DELETE/UNKNOWN buckets only — still not raw paths |
| `schema_version` | Tip field name for redacted report (`orphan-inv-class-v1`); Design Freeze historically said `report_contract_version` — tip uses `schema_version` |

### C.2 Path digest (optional cross-ref)

If used: `path_digest = H(canonical_object_path)` with named hash.

- **Intended use:** join redacted rows to an Owner-gated raw store without printing paths in the default report.  
- **Limitation:** Not anonymization; knowledge of the path allows correlation. Do not claim privacy guarantees beyond “raw path omitted from default artifact.”

### C.3 Raw path artifact (DESIGN — not implemented)

A raw report containing full object paths may be considered **only** as a separate, access-restricted artifact under an **explicit Owner GO**. This freeze does **not** authorize, implement, or require that artifact.

### C.4 Relation to current `--classify` (FACT)

Tip default classification artifact is **redacted** (aligned with §C.1). Raw path dumps remain a separate Owner-gated class (§C.3) and are **not** written by default CLI `onClassification`.

---

## D. Fail-closed matrix

| Condition | Required behavior |
|-----------|-------------------|
| Missing inventory input | Abort; no complete classify; no delete candidates |
| Inventory `incomplete` / `failed` / `in_progress` | Abort or refuse complete classify; no delete candidates |
| Listing/pagination error | `listing_status=failed` (or incomplete); never `complete` |
| DB query error | Abort; `db_read_complete=false` |
| DB completeness control mismatch | Abort; `db_read_complete=false` |
| Inventory digest integrity failure vs expected input | Abort; no complete classify |
| Failure to write the **redacted** report when redaction is required by policy | Abort; do not fall back to writing raw paths “to save the run” |
| Missing/invalid required inputs (env, allowlist when required, schema of inventory file) | Abort |
| Any attempt to emit delete candidates / `SAFE_DELETE` actionable for mutate while `inventory_complete=false` **or** `db_read_complete=false` | **Forbidden** — fail-closed; treat as incomplete / failed run |

In all rows above: the run **must not** be marked complete, and objects **must not** be admitted as authorized delete candidates.

This matrix complements — and does not replace — the mutate fail-stop rules in [ORPHAN_CLEANUP_FAIL_STOP_RUNBOOK.md](./ORPHAN_CLEANUP_FAIL_STOP_RUNBOOK.md).

---

## E. Phase separation and Owner consents

No phase implies consent for a later phase.

| Phase | What it is | What it is **not** |
|-------|------------|---------------------|
| **1. This Design Freeze** | Documentation contract only | Implementation, prod access, classify, execute |
| **2. Inventory exporter implementation** | Local/tooling work to meet §A | Prod listing; mutate |
| **3. DB completeness + redacted report implementation** | Code/tests against §B–§D | Prod reads; mutate |
| **4. Authorized production read-only** | Explicit Owner GO for inventory and/or redacted classify against production | `--execute` / `storage.remove` |
| **5. Mutate (`--execute`)** | Separate, explicit Owner production-mutate GO | Anything implied by phases 1–4 |

Additional constraints (**DESIGN** / runbook alignment):

- Fresh inventory is required before trusting a new classify for production decisions.  
- After any FAIL_STOP mutate attempt, treat Storage as possibly partial; require new inventory + new mutate GO (see fail-stop runbook).  
- Local mock suites (historical counts vary) do not satisfy phase 4 or 5.

---

## Out of scope

- Account-delete, FAR, beat-catalog fixture cleanup, or other cleanup scripts  
- Schema migrations, deploy, or production mutation  
- Claiming PRODUCTION GREEN or incident CLOSED  
- Changing `PROJECT_STATE` or the fail-stop runbook as part of this freeze file alone  

---

## Document control

| Item | Value |
|------|-------|
| Path | `docs/operations/ORPHAN_CLEANUP_INVENTORY_CLASSIFICATION_DESIGN.md` |
| Authority | Owner Design Freeze GO for documentation only |
| Next authorized step | Separate Owner GO for implementation and/or read-only prod work — **not** granted here |
