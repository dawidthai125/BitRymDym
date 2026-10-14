# Studio Final Mix Export — Bake / Artifact F-Addendum

**Status:** `OWNER ACCEPTED` (docs) — **NOT IMPLEMENTED**  
**Accepted:** 2026-10-14 (with Owner corrections A/B)  
**Type:** DESIGN FREEZE ADDENDUM — living for Studio Final Mix F02/F03 **scope only**  
**Parent bake freeze:** [STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md](./STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md) (historical F01…F07)  
**Product contract:** [STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md](./STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md)  
**Related stages freeze:** [STUDIO_FINAL_MIX_VERSION_STAGES_DESIGN_FREEZE_PROPOSAL.md](./STUDIO_FINAL_MIX_VERSION_STAGES_DESIGN_FREEZE_PROPOSAL.md) (`OWNER ACCEPTED` docs · Correction C naming)

```text
OD-SFM-F02b / F03b = OWNER ACCEPTED (documentation)
F02 / F03 = SUPERSEDED for Studio Final Mix scope only (history preserved)
F01, F04, F05, F06, F07 = UNCHANGED / IN FORCE
IMPLEMENTATION = NOT AUTHORIZED BY THIS DOCUMENT
CODE / STORAGE PATHS = UNCHANGED UNTIL SEPARATE IMPLEMENTATION GO
```

---

## 1. Purpose

Align Stage F bake/artifact freeze with the Owner-accepted Studio Final Mix product contract:

- multi-quality lazy exports (MP3 128/192/320 + WAV);
- Studio Final Mix retention **90 days** from version final eligibility (`MASTER_SUCCEEDED`);
- durable domain stages (OD-SFM-08 variant C) without semantic merge into E3 `kind=MIX`.

This addendum **formally supersedes** for **Studio Final Mix only**:

- **OD-SFM-F02** → replaced by **OD-SFM-F02b** (multi-format version-scoped keys);
- **OD-SFM-F03** → replaced by **OD-SFM-F03b** (90d from `MASTER_SUCCEEDED`).

Historical F02/F03 text remains in the parent bake freeze for audit. E3 MIX / TAKE_EXPORT retention and keys are **unchanged**.

---

## 2. Evidence — historical F02 / F03 (FACT — pre-supersession)

### 2.1 F02 — object key (WAV-only) — HISTORY

| Item | Evidence |
|------|----------|
| Freeze | Parent bake freeze §5 / §11 — `user/{ownerId}/studio-export/{projectId}/jobs/{jobId}/WAV.wav` |
| Code (still shipping until Implementation GO) | `src/lib/audio/artifact-object-key.ts` → `buildStudioExportArtifactObjectKey` |
| Behavior | `tier !== "WAV"` throws `"STUDIO_EXPORT MVP supports WAV tier only"` |
| Tests | `src/lib/audio/studio-export-bake-contract.test.ts` |
| Worker | `render-worker-pipeline.ts` uses `buildStudioExportArtifactObjectKey` |

**FACT:** multi-format is **not** implemented in code yet.

### 2.2 F03 — retention — HISTORY

| Item | Evidence |
|------|----------|
| Freeze | Parent §6 / §11 — reuse `artifactRetentionSeconds` |
| Matrix | `src/config/premium-tiers.ts` — FREE 48h · BRONZE 7d · SILVER/GOLD **30d** production |
| Gold 90d design-only | `goldRetentionDesignOnly` — **not** SFM product SSOT |

---

## 3. OD-SFM-F02b — multi-format object keys (**OWNER ACCEPTED**)

**ID:** `OD-SFM-F02b`  
**Scope:** Studio Final Mix quality artifacts only.  
**Out of scope:** E3 MIX keys, TAKE_EXPORT keys, beat-audio, take-audio.

### 3.1 Key shape

```text
user/{ownerId}/studio-export/{projectId}/versions/{versionId}/qualities/{QUALITY}/{jobId}.{ext}
```

| Token | Rule |
|-------|------|
| `ownerId`, `projectId`, `versionId`, `jobId` | Server UUIDs only — never client path segments |
| `QUALITY` | Exact enum: `MP3_128` \| `MP3_192` \| `MP3_320` \| `WAV` |
| `ext` | `mp3` for MP3_* · `wav` for WAV |
| Bucket | `audio-artifacts` only (`AUDIO_ARTIFACTS_BUCKET`) |

### 3.2 Why this shape

| Requirement | How addressed |
|-------------|---------------|
| Identify version + quality | Path includes `versionId` and `QUALITY` |
| No cross-format collision | Distinct `qualities/{QUALITY}/` |
| Separate versions | Distinct `versions/{versionId}/` |
| Artifact immutability | Distinct `jobId` objects; no silent overwrite of other version/quality/history |
| AuthZ | Path alone is **not** AuthZ (see §3.4) |

### 3.3 Correction B — current READY invariant (**OWNER ACCEPTED**)

Domain invariant (schema/SQL = Implementation Design — **not** invented here):

1. For each pair `(versionId, QUALITY)` there is **at most one** artifact treated as the **current downloadable result** of that quality for that version.
2. Earlier attempts / failed / superseded encode artifacts may be retained as **history** (tombstone / non-current), if the model keeps them.
3. **Never** silently overwrite a Storage object belonging to another version, another quality, or a historical result.
4. **Retry of the same job** must be deterministic and idempotent (same logical job → same intended object identity / no duplicate current pointer games). Exact retry mechanics = Implementation Design; must not violate (1)–(3).
5. A **new job** that merely uploads a file does **not** automatically become the current artifact.
6. Promoting an artifact to **current** for `(versionId, QUALITY)` happens **atomically** only after successful completion + validation.
7. Concurrent jobs for the same `(versionId, QUALITY)`: exactly one winner becomes current; losers are rejected or marked non-current / failed — rule must be unambiguous in Implementation Design.

### 3.4 Correction A — AuthZ, grants, downgrade (**OWNER ACCEPTED**)

Download AuthZ **must** verify (server-side):

- project/artifact **owner** (as applicable);
- **version** identity;
- **version grant** (first-download entitlement already held, or newly granted per OD-SFM-13/14);
- artifact **status** (e.g. READY, not expired/deleted as current);
- **quality** entitlement for that version.

Rules:

- Re-download of a version for which the user already holds a valid grant does **not** consume another daily limit or paid slot.
- After **plan downgrade**, previously granted qualities for that version remain downloadable per **OD-SFM-17** (historical entitlement).
- **New** qualities the user never had for that version follow the **current** plan — OD-SFM-17 is **not** a license to unlock new qualities after downgrade.
- Holding a grant does **not** imply the file exists forever: retention (F03b), artifact status, and legal regenerate-if-sources-available still apply.
- **`object_key` alone, a prior signed URL, or `READY` alone do not authorize download.**

### 3.5 Historical WAV keys (compatibility)

| Class | Policy |
|-------|--------|
| Pre-F02b objects `…/jobs/{jobId}/WAV.wav` | **Read-compatible** while object exists; do not rewrite Storage keys in place |
| New encodes after Implementation GO | Version-scoped multi-format keys only |
| Mapper | Prefer stored `audio_artifacts.object_key` as SSOT (never recompute from client) |

Do not migrate/rename existing production objects without a separate Ops GO. Legacy read path must still obey §3.4 AuthZ.

### 3.6 Relation to current code

- Today enqueue has `project_id` + job, **no** domain `versionId` (**FACT**).  
- F02b requires OD-SFM-08 durable versions (ACCEPTED · **NOT IMPLEMENTED**).  
- Implementation GO required before claiming F02b shipped.

### 3.7 Tests required (after Implementation GO — list only)

- Each QUALITY → correct ext; reject unknown; UUID asserts.  
- At most one current per `(versionId, QUALITY)`; concurrent loser non-current.  
- AuthZ: grant + historical quality after downgrade; deny new quality after downgrade; deny on key/URL/READY alone.  
- Legacy `…/WAV.wav` still readable under AuthZ.  
- No overwrite across version/quality.

---

## 4. OD-SFM-F03b — Studio Final Mix retention 90d (**OWNER ACCEPTED**)

**ID:** `OD-SFM-F03b`  
**Scope:** Studio Final Mix **final version** artifacts + internal master intermediates for that version.  
**Does not change:** TAKE retention, RAW take ledger TTL, beat downloads, E3 MIX/TAKE_EXPORT `artifactRetentionSeconds`.

### 4.1 Living history vs F03b

| Domain | Historical F03 | F03b (now) |
|--------|----------------|------------|
| E3 MIX / TAKE_EXPORT | tier `artifactRetentionSeconds` | **Unchanged** |
| Studio Final Mix | reused matrix (WAV MVP) | **SUPERSEDED** by F03b for SFM |
| SFM product | OD-SFM-12 | **90 days** from `MASTER_SUCCEEDED` |

### 4.2 Rules (OD-SFM-12)

1. **Clock start:** `retention_anchor_at = MASTER_SUCCEEDED_at` for that `versionId`.  
2. **Shared deadline:** all qualities of that version share `expires_at = anchor + 90 days`.  
3. Paid slot does **not** extend retention.  
4. **Grant ≠ file.**  
5. **After TTL:** clear `current_final_version_id` if it points at expired version; do not present as current final; artifact → `EXPIRED` (or equiv.); keep tombstone/metadata/audit.  
6. **Regeneration:** only if snapshot + authorized sources remain; else unavailable.  
7. **Cleanup:** idempotent; never delete object for RUNNING job; never purge other domains.

### 4.3 Isolation from premium matrix

- Do **not** use `limitsForPremiumTier().artifactRetentionSeconds` for SFM finals after Implementation GO.  
- Separate janitor filters for SFM versions.  
- Tests: BRONZE vs GOLD SFM same 90d; TAKE_EXPORT still on matrix.

### 4.4 Preserved from F03 (non-retention-number parts)

- Fail-closed READY; compensating Storage delete on failed complete; no owner self-serve delete of SUCCEEDED unless later freeze.

---

## 5. Unchanged F decisions

| ID | Status |
|----|--------|
| **F01** | **IN FORCE** |
| **F04** | **IN FORCE** |
| **F05** | **IN FORCE** |
| **F06** | **IN FORCE** |
| **F07** | **IN FORCE** |

---

## 6. Cross-cutting invariants

Separate planes: domain stage (`SFM_MIX` / `SFM_MASTER`) ≠ job status ≠ version grant ≠ artifact current/READY ≠ URL issuance.

Transactions (separate): payment→slot; grant+daily/slot consume; stage CAS; current-artifact promote.

Concurrency: unique grant `(user, version)`; at most one **current** artifact per `(version, quality)`; payment webhook idempotency (provider **OD-04 OPEN**).

---

## 7. Registry

| ID | Decision | Owner | Notes |
|----|----------|-------|-------|
| OD-SFM-F02 | Historical WAV-only key | ACCEPT (history) | **SUPERSEDED** for new SFM encodes by F02b |
| OD-SFM-F02b | Multi-format version-scoped keys + current READY invariant + AuthZ/downgrade | **OWNER ACCEPTED** | **NOT IMPLEMENTED** |
| OD-SFM-F03 | Historical reuse tier retention for Studio WAV MVP | ACCEPT (history) | **SUPERSEDED** for SFM finals by F03b |
| OD-SFM-F03b | SFM 90d from MASTER_SUCCEEDED | **OWNER ACCEPTED** | Studio-only · **NOT IMPLEMENTED** |
