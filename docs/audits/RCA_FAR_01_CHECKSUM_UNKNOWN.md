# RCA-A — FAR-01 Checksum UNKNOWN (67 MIGRATE)

**Type:** Root Cause Analysis (read-only)
**Date:** 2026-10-03
**Companion evidence:**
- `docs/audits/evidence/far01-prod-dry-run-2026-10-03.json` (**unmodified**)
- `docs/audits/AUDIT_FAR_01_PRODUCTION_DRY_RUN_EVIDENCE_REVIEW.md`
- `docs/audits/DESIGN_FAR_01_BACKFILL.md` §4.4 (OD-BF-02 LOCKED)
- `docs/audits/AUDIT_FAR_01_PHASE0_SOAK_BACKFILL_READINESS.md` (historical NULL ×68)

```text
PRODUCTION MUTATION        = 0
CODE MUTATION              = 0
ARCHIVE MUTATION           = 0
BACKFILL GO (OD-BF-08)     = NO
SERVICE-ROLE USED          = NO (SQL via project MCP read; no product mutation path)
```

---

## SYMPTOM

Production Dry-Run classified **67 / 70** USER MASTER candidates as:

| Field | Value |
|-------|-------|
| classification / status | **UNKNOWN** |
| action | **MIGRATE** |
| checksum_status | **UNKNOWN** |
| content_identity | **UNKNOWN** |
| DB_update_status | **SKIPPED** |
| Preflight reason (code) | `eligible_migrate_checksum_unknown` |

Rule chain: **OD-BF-02 / C-01** — `checksum_sha256` NULL → UNKNOWN ≠ PASS.

---

## OBSERVED EVIDENCE

### Dry-run archive (SSOT for classification)

All **67 UNKNOWN** share (Evidence Review):

- source exists
- destination absent
- identity OK
- legacy key ≠ canonical key
- `checksum_status = UNKNOWN`
- action = MIGRATE

### Live DB (this RCA, SELECT-only)

| Population (USER · MASTER · READY · beat-audio) | Count |
|------------------------------------------------|------:|
| Total | **70** |
| `checksum_sha256` NULL | **68** |
| `checksum_sha256` PRESENT | **2** |
| Legacy shape (approx) | **68** |
| Canonical shape | **2** |

The **2 PRESENT** checksum rows are exactly the dry-run **PASS / already_canonical** assets:

- `e31ae14a-925d-40dc-9515-eb80249d460f`
- `4e68c869-892d-4b79-a4b1-1e80db22b47f`

Therefore: **all 68 legacy-shaped rows remain checksum NULL**, of which dry-run assigned **67 MIGRATE + 1 QUARANTINE/ANOMALY**.

**Note:** Dry-run telemetry still reports `checksum_status=UNKNOWN` even for the 2 PRESENT rows, because `checksumStatusFromAsset` in `preflight.ts` returns UNKNOWN for presence-without-post-copy-compare (not a second root cause for the 67).

---

## DATA FLOW

```text
Upload / finalize path (product)
  → optional SHA-256 of bytes (server)
  → public.beat_audio_assets.checksum_sha256  (DB column)

FAR-01 loader (prod-db-reader)
  → SELECT … checksum_sha256 …
  → Far01AssetSnapshot.checksum_sha256

runFar01Preflight
  → checksumStatusFromAsset(checksum)
       NULL/"" → UNKNOWN
       non-null → still UNKNOWN until post-copy compare (C-01)
  → if else-eligible legacy:
       classification = UNKNOWN
       action = MIGRATE
       reason = eligible_migrate_checksum_unknown

Storage HEAD / list (prod-storage-inspector)
  → exists / size / contentType only
  → NEVER computes or returns SHA-256
```

---

## CODE PATH

| Module | Role |
|--------|------|
| `src/lib/beats/audio-service.ts` | Server upload computes `createHash("sha256")` and **writes** `checksum_sha256` |
| `src/lib/beats/audio-transport.ts` | Signed-upload **inserts NULL**; finalize paths **can** update checksum after reading bytes (admin) |
| `adapters/prod-db-reader.ts` | SELECT includes `checksum_sha256` |
| `adapters/prod-storage-inspector.ts` | HEAD/list metadata only — **no hash** |
| `preflight.ts` | OD-BF-02 UNKNOWN classification |
| `integrity.ts` | Post-copy: NULL either side → checksum UNKNOWN; size-only may allow DB under OD-BF-02 |

---

## ROOT CAUSE

**Primary (FACT):** The **67 MIGRATE UNKNOWN** assets are **legacy-shaped** USER MASTER rows whose DB column `beat_audio_assets.checksum_sha256` is **NULL**. FAR-01 correctly refuses to label checksum PASS (OD-BF-02 / C-01) and emits `eligible_migrate_checksum_unknown`.

**Contributing (FACT + prior Phase 0):** Legacy fleet was ingested / finalized on a path that left checksum NULL historically (Phase 0: 68/68 legacy NULL). Canonical-path assets (2) have checksum PRESENT — consistent with newer finalize/server-hash paths.

**Not the cause:** Missing Storage objects, identity mismatch (those are the separate quarantine row), or dry-run “bug.” Classification matches locked policy.

---

## FACT / INFERENCE / OPEN QUESTION

| Kind | Statement |
|------|-----------|
| **FACT** | Column `checksum_sha256` is the sole FAR-01 checksum input today |
| **FACT** | Storage HEAD adapter does not expose content hashes |
| **FACT** | 68/70 USER MASTER READY have NULL checksum; all legacy-shaped |
| **FACT** | Product code *can* compute SHA-256 when it holds bytes (audio-service / finalize) |
| **FACT** | OD-BF-02 already allows a **size-only** LIVE path with explicit UNKNOWN labeling (Owner-locked in design) — separate from “fill checksums” |
| **INFERENCE** | Legacy rows likely never completed a checksum-writing finalize, or were created before that write was reliable |
| **INFERENCE** | Re-hashing 67 objects requires full object download (or equivalent), not HEAD |
| **OPEN** | Exact historical upload code revision that created each legacy row |
| **OPEN** | Whether Owner wants checksum **fill** before canary, or acceptance of OD-BF-02 size-only for canary/fleet |
| **OPEN** | Whether any external store already holds hashes (none found in FAR-01 path) |

---

## SECURITY IMPACT

| Topic | Assessment |
|-------|------------|
| Treating NULL as PASS | **Forbidden** — would fake integrity |
| Size equality as sole integrity | Already Owner-locked under OD-BF-02 **with UNKNOWN telemetry**; still **not** cryptographic identity (C-03) |
| Read-only SHA-256 via content download | Possible in principle if SELECT/download allowed; expands beyond HEAD-only; touches **C-R1-01** (Storage SELECT breadth OPEN) |
| R1 today | SELECT policies on `storage.objects` for `beat-audio` — metadata/list verified; **full download not part of dry-run contract** |
| Writing checksums back to DB | Requires **UPDATE** privilege — **out of R1**; would be a separate mutating ops GO |

---

## OPERATIONAL IMPACT

| Impact | Detail |
|--------|--------|
| Canary / Backfill readiness narrative | Fleet remains **checksum UNKNOWN** unless Owner accepts OD-BF-02 size-only or authorizes checksum evidence campaign |
| Dry-run | Correctly non-blocking for MIGRATE disposition under design, but Owner review still required before LIVE |
| Cost of re-hash (if authorized) | ~67 objects × ~2.6 MB ≈ **~175 MB** download + CPU; duration depends on host |
| Scope creep risk | “Hash all 67” must not silently become DB UPDATE of `checksum_sha256` without a write GO |

---

## OPTIONS (no selection — Owner decides)

| ID | Option | Mutates? | Notes |
|----|--------|----------|-------|
| A0 | **Accept OD-BF-02 size-only** for future canary/LIVE (checksum stays UNKNOWN in telemetry) | No (policy) | Already designed; still needs explicit Gate A / Backfill GO later |
| A1 | **Read-only SHA-256 campaign** (download → hash → evidence artifact only; no DB write) | Storage **read** of full objects | Violates HEAD-only model; needs Gate A + R1/download authz review |
| A2 | **Checksum backfill to DB** after verified hashes | DB UPDATE | Separate mutating GO; not R1 |
| A3 | **Do nothing** until Owner Gate A | No | Status quo; Backfill GO remains NO |
| A4 | Change OD-BF-02 | Policy change | **Forbidden without separate Owner decision** |

**Size match ≠ checksum PASS** under all options unless OD-BF-02 is explicitly reopened (not recommended here).

---

## RISKS

| Risk | If |
|------|-----|
| False confidence | Collapsing UNKNOWN → PASS in reports |
| Covert download campaign | Running content hash under dry-run credentials without Gate A |
| Partial hash set | Hashing subset then treating rest as PASS |
| Privilege escalation | Using service-role to hash/write |

---

## OPEN QUESTIONS

1. Does Owner accept **size-only OD-BF-02** for canary without filling checksums?
2. If hashing is desired: evidence-only vs DB persist?
3. Allowed credential for download (R1 vs other read role)?
4. Is ~175 MB full-fleet download acceptable?

---

## RECOMMENDED NEXT EVIDENCE STEP

**Non-mutating / Owner-gated:**

1. Owner issues **GATE A — Checksum Evidence GO** with explicit choice among A0–A3.
2. If A1: design a **separate** read-only hasher (not dry-run entrypoint) with rate limits, no DB write, archive of hashes only.
3. Do **not** alter OD-BF-02, archive JSON, or product code in this step.

---

**Backfill GO: NO**
**Canary: NOT EXECUTED**
**STOP — await OWNER REVIEW / GATE A**
