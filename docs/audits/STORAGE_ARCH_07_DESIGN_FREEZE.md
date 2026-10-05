# STORAGE-ARCH-07 — DESIGN FREEZE

**Epic:** `STORAGE-ARCH-07` · OD-SA-06 (source MASTER backup required before scale)  
**Status:** **DESIGN FREEZE COMPLETE** · **OWNER DECISIONS CLOSED** · Implementation GO later **ISSUED** · Phase A **BLOCKED**  
**Date:** 2026-10-04 · living note **2026-10-05**  
**Decydent:** Owner (Prezes Dawid)  
**Upstream design audit:** STORAGE-ARCH-07 BACKUP DESIGN AUDIT (session 2026-10-04)  
**Parent freeze:** [STORAGE_ARCH_01_DESIGN_FREEZE.md](./STORAGE_ARCH_01_DESIGN_FREEZE.md)  
**Implementation evidence:** [STORAGE_ARCH_07_IMPLEMENTATION.md](./STORAGE_ARCH_07_IMPLEMENTATION.md)  
**Historical DB dump (≠ Storage):** [HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md](./HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md)  
**VPS Layer-1 freeze:** [STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md](./STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md)  
**Local Layer-2 freeze:** [STORAGE_ARCH_07_LOCAL_BACKUP_DESIGN_FREEZE.md](./STORAGE_ARCH_07_LOCAL_BACKUP_DESIGN_FREEZE.md) · audit [STORAGE_ARCH_07_LOCAL_BACKUP_AUDIT.md](./STORAGE_ARCH_07_LOCAL_BACKUP_AUDIT.md)

```text
STORAGE-ARCH-07 DESIGN FREEZE     = COMPLETE
OWNER DECISIONS OD-SA-07-01…16    = CLOSED (do not reopen)
VPS LAYER-1 (OD-VPS-01…20)        = APPROVED · Phase 1–6 PASS · COPY 43/43
LOCAL LAYER-2 (OD-VPS-LOCAL-01…12)= 43/43 RESTORE VERIFIED
IMPLEMENTATION PLAN               = COMPLETE (see IMPLEMENTATION.md; no separate PLAN file)
IMPLEMENTATION (AWS plane)        = NOT STARTED / BLOCKED · AWS DEFERRED for current variant
PHASE A                           = BLOCKED (no AWS account / CLI / credentials / bucket)
STORAGE MUTATION                  = NONE (this freeze doc)
DB MUTATION                       = NONE
STORAGE OBJECT BYTES BACKUP       = VPS 43/43 · LOCAL 43/43 RESTORE VERIFIED · AWS 0
ARCH-05 DELETE                    = CLOSED / DELETE EXECUTED / VERIFIED · prod Storage 11
```

---

## 1. Purpose

Zamrozić **docelową architekturę backupu Storage** dla BitRymDym (`beat-audio` source MASTER), zgodną z Hybrid C / STORAGE-ARCH-01, bez implementacji, bez kopii obiektów, bez GC.

Ten dokument **nie** autoryzuje:

- provisioningu backup account / bucket / IAM
- Storage COPY / DELETE
- restore drill execution
- ARCH-05 orphan delete
- deploy / promote / commit

---

## 2. SSOT reuse (unchanged)

| Item | Locked value | Source |
|------|--------------|--------|
| PRIMARY durable media | Supabase Storage | STORAGE-ARCH-01 · Hybrid C |
| Contabo | EXTERNAL COMPUTE · **NOT** backup | STORAGE-ARCH-01 |
| Mix artifacts backup | Default **NO** | **OD-SA-07** (STORAGE-ARCH-01) |
| Takes backup | Default **NO** (TTL) | STORAGE-ARCH-01 §17 |
| Orphan GC | Inventory → dry-run → Owner GO | OD-SA-08 · ARCH-04/05 |
| New Supabase V1 buckets | Forbidden without separate OD | OD-SA-01 |
| External Object Storage as **primary** durable | OPTIONAL · NOT IMPLEMENTED | STORAGE-ARCH-02 |

### Naming adjacency (not a conflict)

| ID | Meaning | Status |
|----|---------|--------|
| **OD-SA-07** | Mix artifact backup = **NIE** (default) | LOCKED (STORAGE-ARCH-01) · **unchanged** |
| **OD-SA-07-01…16** | STORAGE-ARCH-07 backup **design** Owner Decisions | **CLOSED** (this freeze) |

Do **not** treat OD-SA-07-01…16 as a reopen or rewrite of OD-SA-07 (Mix).

---

## 3. Frozen backup architecture

```text
PRIMARY:
  Supabase Storage · beat-audio

BACKUP (DESIGN FROZEN):
  EXTERNAL S3-COMPATIBLE OBJECT STORAGE
  + separate cloud account / project
  + dedicated backup bucket
  + Versioning ON
  + Object Lock / WORM ON (preferred: COMPLIANCE MODE)
  + SHA-256 primary integrity
  + required manifest (+ secondary evidence in backup plane)
  + dedicated writer / reader / break-glass admin principals

EXPLICITLY NOT BACKUP:
  Contabo
  DB backup / PITR
  W4 JSON / logical DB snapshots
  audio-artifacts (OD-SA-07 default)
  take-audio (default)
```

**Vendor / SKU:** NOT selected in this freeze. Selection deferred to Implementation Phase (cost/offer), subject to Object Lock Compliance compatibility (OD-SA-07-04).

**STORAGE-ARCH-02 boundary:** This freeze authorizes a **BACKUP plane** design only. It does **not** choose or implement external Object Storage as primary durable library.

---

## 4. Owner Decisions — CLOSED

| ID | Topic | Closed value | Status |
|----|-------|--------------|--------|
| **OD-SA-07-01** | Backup provider | EXTERNAL S3-COMPATIBLE OBJECT STORAGE (vendor/SKU deferred) | **CLOSED** |
| **OD-SA-07-02** | Backup location | SEPARATE CLOUD ACCOUNT/PROJECT · DEDICATED BACKUP BUCKET · logically & privilege-separated from prod Supabase | **CLOSED** |
| **OD-SA-07-03** | Versioning | ON | **CLOSED** |
| **OD-SA-07-04** | Immutability | Object Lock / WORM ON · preferred **COMPLIANCE MODE** · if provider lacks exact model → mark incompatible · **stop Implementation Phase** | **CLOSED** |
| **OD-SA-07-05** | Retention | Min **90 days** for GC-candidate backups · living MASTER ≥ active backup lifecycle · no automatic retention shortening without separate audit | **CLOSED** |
| **OD-SA-07-06** | Integrity | SHA-256 primary · `SHA256(source)==SHA256(backup)` · size match · content-type recorded · exact object key · eTag advisory only | **CLOSED** |
| **OD-SA-07-07** | Manifest | REQUIRED · minimum fields listed in §5 | **CLOSED** |
| **OD-SA-07-08** | Credentials | Prod `service_role`: NO backup-delete · NO backup-admin · prefer no long-lived backup creds in Vercel · dedicated writer / reader / break-glass admin | **CLOSED** |
| **OD-SA-07-09** | RPO | Target ≤ 24h for new MASTER uploads · **before every GC** object must be backed up + verified | **CLOSED** |
| **OD-SA-07-10** | RTO | Single object target ≤ 1h · bucket/set target ≤ 72h · operational targets ≠ provider SLA | **CLOSED** |
| **OD-SA-07-11** | Restore drill | Mandatory before first ARCH-05 DELETE + periodic after deploy · isolated restore only · never overwrite source | **CLOSED** |
| **OD-SA-07-12** | GC safety ladder | PROPOSED ≠ BACKED UP ≠ RESTORE VERIFIED ≠ SAFE ≠ OWNER APPROVED ≠ DELETED | **CLOSED** |
| **OD-SA-07-13** | SAFE FOR GC | All 11 conditions in §7 · any FAIL ⇒ NOT SAFE | **CLOSED** |
| **OD-SA-07-14** | Backup scope V1 | YES: living USER MASTER · platform MASTER · orphans before ARCH-05 · NO default: audio-artifacts · take-audio · Contabo | **CLOSED** · Contabo Layer-1 staging requires separate Owner GO (**OD-VPS-01…20** + **OD-SA-07-14a**) — [VPS freeze draft](./STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md) |
| **OD-SA-07-15** | Encryption | At rest: provider-managed minimum · in transit: TLS · SSE-S3/SSE-KMS/equivalent selectable at Implementation without lowering the model | **DESIGN CLOSED** |
| **OD-SA-07-16** | Manifest storage | PRIMARY: DB manifest records · SECONDARY: signed/hashed JSON evidence in backup plane · stop + report if impl hits transactional/security limits | **DESIGN CLOSED** |

---

## 5. Manifest minimum (OD-SA-07-07)

```text
manifest_id
backup_run_id
source_bucket
source_object_key
source_size_bytes
source_content_type
source_sha256
source_etag                 (if available)
source_version_id           (if available)
source_last_modified
classification
db_refs_count
backup_provider
backup_bucket
backup_object_key
backup_version_id
backup_sha256
backup_size_bytes
backed_up_at
hash_algorithm
verify_status
restore_drill_status
restore_drill_at
gc_safety_status
evidence_path
operator
tool_version
```

Bucket existence alone ≠ backup evidence.

---

## 6. Restore drill minimum (OD-SA-07-11)

1. Select one test object  
2. Confirm manifest `verify_status = MATCH`  
3. Restore to **isolated** location only  
4. SHA-256 restored  
5. Size  
6. MIME / content-type  
7. Read / decode / playability smoke  
8. Hash compare vs source manifest  
9. Write evidence  
10. Cleanup **only** the isolated restore target  

**Never** restore directly over the source object in `beat-audio`.

---

## 7. SAFE FOR GC (OD-SA-07-13)

Object may be **SAFE FOR GC** only if **all** are true:

1. classified ORPHAN  
2. identity unambiguous  
3. backup exists  
4. manifest exists  
5. SHA-256 MATCH  
6. restore capability VERIFIED  
7. not living USER  
8. not platform  
9. not active retention set  
10. no active DB reference  
11. concrete Owner GO for allowlist  

Any FAIL ⇒ **NOT SAFE**.

### Living orphans (as of this freeze)

```text
orphans = 32
PROPOSED            = yes (inventory candidates)
BACKED UP           = NO
RESTORE VERIFIED    = NO
SAFE                = NO
OWNER APPROVED      = NO
DELETED             = NO
```

---

## 8. ARCH-05 status (post-execution)

```text
ARCH-05 DELETE              = CLOSED / DELETE EXECUTED / VERIFIED
OWNER GO (delete)           = ISSUED
Production Storage          = 11 (USER 8 · PLATFORM 3 · ORPHAN 0)
VPS / Local evidence        = 43/43 RETAINED
SSOT                        = ARCH_05_DELETE_EXECUTION.md
```

Design Freeze itself did not authorize delete; later Owner GO + allowlist execution closed ARCH-05. Historical local **DB** dump still does **not** substitute for Storage object-byte evidence.

---

## 8.1 Living reconciliation — DB recovery vs Storage DR (2026-10-05)

**Correct wording:** BitRymDym has a historical local DB recovery artifact **and** VPS+Local Storage object-byte evidence (**43/43 RETAINED**). AWS Object Lock remains **DEFERRED**. Live production Storage after ARCH-05 = **11**.

| Plane | Status |
|-------|--------|
| Historical local PostgreSQL dump | **FOUND** · see [HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md](./HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md) |
| VPS Layer-1 Storage object-byte backup | **43/43 RETAINED** |
| Local Windows Layer-2 | **43/43 RETAINED** (restore verified) |
| AWS Object Lock | **DEFERRED** |
| OD-SA-07-01…16 | **CLOSED** · unchanged |

DB/PITR/W4 JSON/`storage.*` metadata ≠ STORAGE-ARCH-07 MASTER object backup.

---

## 9. Implementation readiness

| Item | Status |
|------|--------|
| Design Freeze | **COMPLETE** |
| Owner Decisions OD-SA-07-01…16 | **CLOSED** |
| Implementation | **NOT STARTED / BLOCKED** (AWS plane) |
| Implementation GO | **ISSUED** (post-freeze) |
| Phase A Object Lock proof | **BLOCKED** |
| Vendor/SKU selection | AWS S3 `eu-central-1` selected · account **not provisioned** |
| Backup plane provisioned | NO |
| Manifest schema in DB | authored locally · **not applied** |
| Production Storage COPY | **0/43** |
| Restore drill executed | NO (fixture-only ≠ production) |

**Implementation stop conditions:**

- Provider lacks Object Lock / WORM **Compliance**-class model (OD-SA-07-04) → mark incompatible · stop  
- Manifest storage hits transactional/security limits (OD-SA-07-16) → stop · report · do not silently change SSOT  
- Dedicated AWS account / CLI / credentials missing → Phase A **BLOCKED** (current)

---

## 10. Next gate

```text
NEXT GATE =
  Owner provision dedicated AWS account + BACKUP_WRITER credentials + CLI
  → resume Phase A Object Lock COMPLIANCE proof (DeleteDenied)
  → then bucket/IAM (no prod object copy until copy GO)
  → manifest apply
  → backup living USER + platform + orphans
  → checksum verify
  → restore drill
  → only then ARCH-05 allowlist path
```

---

## 11. Hard non-goals (this freeze)

- Code · migrations · RLS · Auth changes  
- Storage COPY / DELETE / upload  
- Hashing production masters as a backup operation  
- Creating production manifests  
- Restore drill execution  
- Contabo as backup  
- Treating historical local DB dump / PITR / W4 JSON as Storage object backup  
- Choosing STORAGE-ARCH-02 primary external library provider  
- ARCH-05 orphan deletion  
- Deploy / promote / alias change  

---

**Freeze-time Architecture Review:** PASS for design closure — implementation remains separately gated.
