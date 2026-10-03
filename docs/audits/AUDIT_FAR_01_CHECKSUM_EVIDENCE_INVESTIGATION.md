# AUDIT — FAR-01 Checksum Evidence Investigation (GATE A)

**Type:** Read-only investigation
**Date:** 2026-10-03
**Owner GO:** GATE A — CHECKSUM EVIDENCE INVESTIGATION = GO
**Evidence JSON:** `docs/audits/evidence/far01-checksum-investigation-2026-10-03.json`
**Dry-run archive:** `far01-prod-dry-run-2026-10-03.json` — **UNCHANGED**

```text
GATE A                     = COMPLETE
GATE C BACKFILL GO         = NO
CANARY / FLEET / RETIRE    = NOT EXECUTED
DB checksum persistence    = NO
FULL FLEET HASH CAMPAIGN   = NOT EXECUTED
SERVICE-ROLE               = NO
MUTATION ATTEMPTED         = 0
```

---

## 1. Scope

Answer RCA-A questions with code + live evidence; probe whether R1 can perform content read; if yes, compute out-of-band SHA-256 for a **small deterministic sample** only; never persist hashes.

---

## 2. Why legacy `checksum_sha256` is NULL

### Live FACTS

| Population (USER · MASTER · READY · beat-audio) | Count |
|------------------------------------------------|------:|
| Legacy shape | **68** — checksum NULL **68/68** |
| Canonical shape | **2** — checksum PRESENT **2/2** |
| Distinct `byte_size` | **1 value: 2646044** (all 70 rows) |

### Code / data-flow FACTS

| Stage | Behavior |
|-------|----------|
| Signed-upload create (`audio-transport`) | Inserts `checksum_sha256: null`, status `PENDING_UPLOAD` |
| Analyze pending | May UPDATE checksum after download+hash |
| Finalize USER (`finalizeUserBeatAfterUploadFor`) | Downloads bytes → SHA-256 → `activateAssetReady(... checksum)` |
| Server upload (`audio-service`) | Hashes bytes at insert/activate |
| Current WRITE SSOT key | `buildUserBeatAudioObjectKey` → **canonical** `user/{owner}/{beat}/{assetId}/master.bin` |
| Legacy key builder | `buildLegacyUserBeatMasterObjectKey` — **FORBIDDEN for new writes** (OD-KEY-04/06) |

### Conclusion on historical NULL (FACT + bounded inference)

| Kind | Statement |
|------|-----------|
| **FACT** | Every legacy-shaped READY row still has NULL checksum today |
| **FACT** | Current finalize/activate paths **do** persist checksum when used |
| **FACT** | Current product write path uses **canonical** keys, not legacy |
| **FACT** | Phase 0 audits already recorded 68/68 legacy NULL (OD-KEY-08) |
| **INFERENCE** | Legacy fleet was created/activated by a **historical** path that left checksum NULL (pre-current finalize contract and/or non-finalize seeding), not by today’s finalizeUserBeatAfterUpload |
| **NOT PROVEN** | Exact git SHA / ops script that wrote each legacy row (no upload audit trail queried this session) |

**Not supported as sole cause without more logs:** “finalize was skipped for all 67” — possible, but indistinguishable from “older activate without checksum” without historical ops evidence.

---

## 3. R1 content-read capability

| Question | Result |
|----------|--------|
| A. Can current R1 download object bytes? | **YES** |
| Method | `supabase.storage.from('beat-audio').download(object_key)` with R1 transport (anon apikey + Bearer R1 JWT) |
| Privilege expansion this GO | **NONE** — used existing R1 |
| HEAD-only dry-run model | **Violated for this Gate A sample** (intentional, scoped) |
| C-R1-01 | **OPEN / empirically confirmed** — SELECT policy allows content download |

If Owner wants a least-privilege hasher that cannot download: would need a **separate Owner GO** to redesign Storage grants (e.g. metadata-only). Not provisioned here.

---

## 4. Read-only hash sample (not full fleet)

| Item | Value |
|------|-------|
| sample_size | **3** |
| Selection | Deterministic: first two lexicographic UNKNOWN migrate IDs from dry-run + one canonical PASS control |
| asset_ids | `02c18fb2-…`, `05d4a7d7-…`, `4e68c869-…` |
| Observed SHA-256 (all 3) | `90ee033a87843110a16869da4b2ac414c1c36061b54cc7bb3770ede3c4c12261` |
| Match to canonical DB checksum | **YES** (control + second canonical row share same DB hash) |
| Match to legacy DB checksum | **N/A** (NULL) |
| Persisted to DB | **NO** |

### Size equality (separate field — NOT checksum PASS)

| Check | Sample result |
|-------|---------------|
| HEAD size vs DB `byte_size` (2646044) | **equal** for all 3 |
| HEAD size vs downloaded bytes | **equal** for all 3 |
| OD-BF-02 | **Unchanged** — size ≠ checksum PASS |

### Aggregate observation (bounded)

All three sampled objects are **byte-identical**. Combined with fleet-wide identical `byte_size`, this **suggests** shared fixture/content across many rows — **not proven** for all 67/70 without a full campaign (not authorized as automatic next step).

---

## 5. Full-fleet hash campaign?

| Question | Answer |
|----------|--------|
| Technically feasible under current R1? | **YES** |
| Executed? | **NO** |
| Approx cost | ~70 × 2.6 MB ≈ **~185 MB** download |
| Security | Confirms broad content read via R1 (C-R1-01) |
| Required for Owner decision on A0 vs A1? | Sample already proves mechanism; full fleet needs **separate** Owner GO text |

---

## FACTS

1. Legacy READY = checksum NULL ×68; canonical PRESENT ×2.
2. Current finalize writes checksum; legacy keys are not current WRITE SSOT.
3. R1 can download content today.
4. Sample (n=3) observed hash identical; matches canonical DB checksum.
5. Size equality holds for sample; OD-BF-02 unchanged.
6. No DB/Storage mutation; dry-run archive unchanged.

## EVIDENCE

- Live SQL counts (this session)
- Code: `audio-transport.ts`, `audio-service.ts`, `audio-validation.ts`
- Probe: R1 `download` + SHA-256
- JSON: `docs/audits/evidence/far01-checksum-investigation-2026-10-03.json`

## LIMITATIONS

- Sample ≠ fleet proof
- No historical ops log proving exact create path per row
- Observed hashes not authoritative in DB until a persist GO

## OPEN QUESTIONS

1. Accept OD-BF-02 size-only for canary (A0) vs authorize full read-only hash campaign (A1) vs later DB persist (A2)?
2. Should R1 be narrowed to block download (separate security GO)?
3. Is identical-byte fleet intentional (fixtures) or unexpected?

## OWNER DECISION REQUIRED

- Stance among **A0 / A1 / A2 / A3** (see PLAN)
- Whether to open a **separate** GO for full-fleet hash or R1 download lockdown
- **GATE C remains NO**

---

**GATE A: COMPLETE**
**GATE C — BACKFILL GO: NO**
**STOP**
