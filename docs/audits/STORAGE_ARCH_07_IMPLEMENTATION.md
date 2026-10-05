# STORAGE-ARCH-07 IMPLEMENTATION EVIDENCE

**Date:** 2026-10-04 (living note 2026-10-05)  
**Provider (Owner GO):** AWS S3 · `eu-central-1`  
**Implementation GO:** ISSUED  
**Implementation Plan:** COMPLETE (this evidence + freeze) · separate `STORAGE_ARCH_07_IMPLEMENTATION_PLAN.md` **does not exist**  
**ARCH-05 DELETE GO:** ISSUED · **CLOSED / VERIFIED** — [ARCH_05_DELETE_EXECUTION.md](./ARCH_05_DELETE_EXECUTION.md)

```text
DESIGN FREEZE                     = COMPLETE
VPS PHASE 1 (hardening)           = PASS
VPS PHASE 2 (principal + dir)     = PASS
VPS PHASE 3 (transfer design + dry-run) = PASS / DRY-RUN VERIFIED
VPS PHASE 4 (controlled canary)   = PASS / CANARY BACKED UP
VPS PHASE 5 (canary restore drill)= PASS / CANARY RESTORE VERIFIED
VPS PHASE 6 (full VPS expansion)  = PASS / VPS Layer-1 43/43 BACKED UP
  VPS BYTE COPY (evidence)        = 43/43 RETAINED on VPS Layer-1
  RESTORE VERIFIED (VPS canary)   = 3/43
  LOCAL RESTORE VERIFIED          = 43/43
  CLAIM                           = VPS+Local evidence retained · NOT AWS Object Lock
IMPLEMENTATION (AWS plane)        = NOT STARTED / BLOCKED
PHASE A (AWS Object Lock COMPLIANCE) = BLOCKED
REASON                            = dedicated AWS account + CLI + credentials UNAVAILABLE
LIVE PRODUCTION STORAGE           = 11 (post ARCH-05 DELETE)
ARCH-05                           = CLOSED / DELETE EXECUTED / VERIFIED
COMMIT / PUSH                     = NOT EXECUTED (this session)
```

Do not treat local COMPLIANCE simulator as Phase A evidence.  
Do not claim **FULL DR COMPLETE** or **AWS Object Lock**. VPS evidence remains **43/43 RETAINED** after production orphan delete.

### Living reconciliation (2026-10-05) — DB ≠ Storage

```text
HISTORICAL LOCAL DB BACKUP        = FOUND
  Path: C:\BitRymDym-recovery\bitrymdym-production-pre-account-profile-01.dump
  Type: PostgreSQL CUSTOM / PGDMP · 532829 B · TOC 835
  Provenance: LIKELY PRODUCTION / MEDIUM · project_ref NOT PROVEN from PGDMP
  Storage bytes: NOT INCLUDED · Storage metadata tables: INCLUDED
  Restore: NOT VERIFIED
  SSOT: docs/audits/HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md

STORAGE OBJECT BYTES BACKUP       = VPS Layer-1 43/43 BACKED UP · AWS ABSENT · restore 3/43
IAM policy templates under scripts/storage-arch-07/iam/ = scaffold only · AWS NOT configured
```

**Wording:** BitRymDym has a historical local DB recovery artifact and a **full VPS Layer-1 Storage backup (43/43)**. AWS Object Lock / immutable DR remain absent. Canary restore verified for 3/43 only.

Historical DB dump is **not** STORAGE-ARCH-07 evidence and does **not** unblock Phase A or ARCH-05.

---

## VPS Phase 3 — backup transfer design + SHA-256 + manifest + dry-run (2026-10-05)

**Owner GO:** APPROVED — PHASE 3  
**Status:** **PASS** · **DRY-RUN VERIFIED** · **NOT BACKED UP**

### Helpers reused (no parallel backup system)

| Module | Role |
|--------|------|
| `src/lib/storage/backup-manifest.ts` | classify · SHA-256 · idempotency · VPS path map · dry-run planner · atomic write |
| `src/lib/storage/backup-manifest.test.ts` | Phase 3 fixture tests |
| `scripts/storage-arch-07-phase3-dry-run.ts` | metadata-only dry-run against inventory JSON |

### Fresh read-only inventory (`beat-audio`)

```text
TOTAL      = 43
USER       = 8
PLATFORM   = 3
ORPHAN     = 32
UNKNOWN    = 0
BYTES      = 111574892
SOURCE     = storage.objects + beat_audio_assets (metadata only · no payload download)
```

Orphans remain **PROPOSED** backup scope only — **not** SAFE · **not** OWNER APPROVED · **not** DELETED.

### Architecture (designed)

```text
Supabase Storage (read)
  → server-side metadata / future byte pull
  → VPS Layer-1 /srv/bitrymdym-backup/objects/<bucket>/<safe-key>
  → SHA-256 (primary integrity; eTag advisory only)
  → manifest (audit / idempotency / resume / restore id)
  → restore verification (future)
  → AWS S3 Object Lock (future · NOT CONFIGURED)
```

**Identity:** `source_bucket` + `source_object_key` + `source_sha256` (+ size, content_type, version_id, etag, classification, owner refs when available).  
**Idempotency key:** `(source_bucket, source_object_key, source_sha256)`. Same key + different SHA ⇒ **UPDATE** (new generation; no blind overwrite).  
**Atomic write:** staging file → complete download → SHA-256 → fsync/close → rename → manifest commit.  
**Path safety:** fail-closed on `../`, absolute paths, empty segments, control chars.

### Fixture verification (non-production)

```text
fixture bytes     = "RIFF....WAVEfixture-phase3"
source SHA-256    = adf962269b757cea643d777abba0c58431ca2b5b6360e4156dece7b2d13a4a5f
destination SHA   = MATCH
mismatch test     = PASS (flipped byte detected)
manifest fixture  = PASS (required fields + JSON + restore path identity)
path traversal    = BLOCKED
idempotency       = PASS (COPY/SKIP/UPDATE/BLOCKED)
vitest            = src/lib/storage/backup-manifest.test.ts · 12 passed
```

### Metadata dry-run (production read-only)

```text
COPY     = 43   (no Layer-1 destination yet)
SKIP     = 0
UPDATE   = 0
BLOCKED  = 0
VPS /srv/bitrymdym-backup/objects file count = 0
VPS manifests file count                     = 0
```

**Ladder status for all 43:** **PROPOSED** (dry-run plan) ≠ **BACKED UP** ≠ **RESTORE VERIFIED** ≠ **SAFE**.

### Mutation ledger (Phase 3)

```text
SUPABASE MUTATION: NONE
STORAGE MUTATION: NONE
DB MUTATION: NONE
STORAGE OBJECTS COPIED: 0
STORAGE OBJECTS DELETED: 0
AWS MUTATION: NONE
AWS OBJECTS: 0
RESTORE: 0
SECRETS LOGGED: NONE
```

### Next after Phase 3 (executed)

```text
PHASE 4 — CONTROLLED PRODUCTION BACKUP CANARY → PASS (see below)
```

---

## VPS Phase 4 — controlled production canary (2026-10-05)

**Owner GO:** APPROVED — PHASE 4 CANARY  
**Status:** **PASS** · **CANARY BACKED UP** · (restore: see Phase 5) · **ARCH-05 NOT READY**  
**Evidence:** [STORAGE_ARCH_07_PHASE4_CANARY_EVIDENCE.json](./STORAGE_ARCH_07_PHASE4_CANARY_EVIDENCE.json)  
**Tool:** `scripts/storage-arch-07-phase4-canary.ts`

### Fresh inventory (pre-copy)

```text
TOTAL / USER / PLATFORM / ORPHAN / UNKNOWN = 43 / 8 / 3 / 32 / 0
BYTES = 111574892
DRIFT vs Phase 3 = NONE
```

### Allowlist (exactly 3)

| Class | object_key (abbrev) | size | owner |
|-------|---------------------|------|-------|
| USER | `user/1809c420-…/795b8ed5-…/master.bin` | 2646044 | user_number **61** · living |
| PLATFORM | `platform/0a3a2ca4-…/a1d7df29-…/master.bin` | 2646044 | ownership PLATFORM |
| ORPHAN | `user/1f1c5cfc-…/ce8a64ee-….bin` | 2646044 | db_refs=0 |

`backup_run_id` = `sa07-phase4-canary-2026-10-05T032831381Z-7693eb89`

### Verification

```text
source SHA-256 (all 3 payloads) = 90ee033a87843110a16869da4b2ac414c1c36061b54cc7bb3770ede3c4c12261
destination SHA                 = MATCH ×3
destination size                = MATCH ×3 (2646044)
manifests                       = 3/3 VERIFIED under /srv/bitrymdym-backup/manifests/<run>/
VPS objects tree                = exactly 3 files · owner bitrymdym-backup · mode 0600
E3 (bitrymdym-e3) read          = NO
ubuntu (no sudo) read           = NO
```

### Ladder after canary (updated by Phase 5)

```text
USER       = CANARY BACKED UP · CANARY RESTORE VERIFIED · NOT SAFE FOR DELETE
PLATFORM   = CANARY BACKED UP · CANARY RESTORE VERIFIED · NOT SAFE FOR DELETE
ORPHAN     = BACKED UP · CANARY RESTORE VERIFIED · NOT SAFE FOR DELETE · NOT ARCH-05 READY
remaining 40 objects = NOT BACKED UP
```

### Mutation ledger (Phase 4)

```text
SUPABASE MUTATION: NONE (read/download only)
STORAGE DELETE: 0
DB MUTATION: 0
AUTH MUTATION: 0
AWS MUTATION: NONE · AWS OBJECTS: 0
RESTORE: 0  (Phase 4 — restore drill is Phase 5)
PRODUCTION OBJECTS COPIED: 3
POST-COPY production beat-audio count: 43 (unchanged)
```

### Next after Phase 4 (executed)

```text
PHASE 5 — CANARY RESTORE DRILL → PASS (see below)
```

---

## VPS Phase 5 — canary restore drill (2026-10-05)

**Owner GO:** APPROVED — PHASE 5 CANARY RESTORE  
**Status:** **PASS** · **CANARY RESTORE VERIFIED** · **ARCH-05 NOT READY**  
**Evidence:** [STORAGE_ARCH_07_PHASE5_RESTORE_EVIDENCE.json](./STORAGE_ARCH_07_PHASE5_RESTORE_EVIDENCE.json)  
**Tool:** `scripts/storage-arch-07-phase5-restore-drill.py` (VPS-local as `bitrymdym-backup`)

```text
restore_run_id         = sa07-phase5-restore-20261005T033401Z-5560b4f7
source_backup_run_id   = sa07-phase4-canary-2026-10-05T032831381Z-7693eb89
restore_directory      = /srv/bitrymdym-backup/restore-drills/<restore_run_id>/
restore_source         = VPS Layer-1 backup (NOT Supabase)
supabase_as_source     = false
```

| Class | SHA | size | WAV header | ffprobe | overall |
|-------|-----|------|------------|---------|---------|
| USER | PASS | PASS | PASS | PASS (wav / pcm_s16le / 44100 / 1ch / 30s) | **PASS** |
| PLATFORM | PASS | PASS | PASS | PASS | **PASS** |
| ORPHAN | PASS | PASS | PASS | PASS | **PASS** |

```text
manifest source_sha256 == backup SHA == restore SHA ×3
manifest source_size   == backup size == restore size ×3
backup_immutability    = PASS (objects/ unchanged after COPY restore)
VPS objects            = 3
VPS restore copies     = 3
production beat-audio  = 43 (unchanged)
E3 / ubuntu read of restore-drills = NO
```

**Does NOT mean:** ARCH-05 SAFE · ORPHAN SAFE FOR DELETE · OWNER APPROVED DELETE · FULL DR.

### Mutation ledger (Phase 5)

```text
SUPABASE MUTATION: NONE
STORAGE MUTATION: NONE
STORAGE DELETE: 0
DB MUTATION: 0
AUTH MUTATION: 0
AWS MUTATION: NONE · AWS OBJECTS: 0
RESTORE DESTINATION: isolated restore-drills only
```

### Next after Phase 5 (executed)

```text
PHASE 6 — FULL VPS BACKUP EXPANSION → PASS (see below)
```

---

## VPS Phase 6 — full VPS Layer-1 backup expansion (2026-10-05)

**Owner GO:** APPROVED — PHASE 6 FULL VPS BACKUP  
**Status:** **PASS** · **VPS Layer-1 43/43 BACKED UP** · restore still **3/43** · **ARCH-05 NOT READY**  
**Evidence:** [STORAGE_ARCH_07_PHASE6_FULL_BACKUP_EVIDENCE.json](./STORAGE_ARCH_07_PHASE6_FULL_BACKUP_EVIDENCE.json) · [allowlist](./STORAGE_ARCH_07_PHASE6_ALLOWLIST.json)  
**Tool:** `scripts/storage-arch-07-phase6-full-backup.ts`

```text
backup_run_id   = sa07-phase6-full-2026-10-05T033904413Z-9230c8a9
fresh inventory = 43 / USER 8 / PLATFORM 3 / ORPHAN 32 / UNKNOWN 0 · DRIFT NONE
canary pre-check= 3/3 unchanged (SHA + size)
new allowlist   = 40 (USER 7 + PLATFORM 2 + ORPHAN 31)
new COPY        = 40/40 VERIFIED
SKIP            = 0
VPS objects     = 43 (owner bitrymdym-backup · mode 0600)
manifests       = 43 (Phase4×3 + Phase6×40)
SHA reconcile   = 43/43 PASS
identity match  = 43/43
production      = 43 unchanged · deletes 0
E3 / ubuntu     = NO READ
restore         = 3/43 VERIFIED (unchanged)
AWS             = NOT CONFIGURED
ARCH-05         = NOT READY
```

Orphans 32/32: **BACKED UP** · **NOT SAFE FOR DELETE** · **NOT ARCH-05 READY**.

### Mutation ledger (Phase 6)

```text
SUPABASE MUTATION: NONE (read/download only)
STORAGE DELETE: 0
DB MUTATION: 0
AUTH MUTATION: 0
AWS MUTATION: NONE · AWS OBJECTS: 0
RESTORE EXPANSION: NOT EXECUTED
```

### Next (STOP GATE)

```text
PHASE 7 — RESTORE VERIFICATION EXPANSION
  or PHASE 7 — AWS IMMUTABLE DR
  (separate Owner GO required)
NO orphan delete / ARCH-05 / commit / push / deploy without Owner request
```
