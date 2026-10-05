# STORAGE-ARCH-07 — LOCAL WINDOWS BACKUP PLANE DESIGN FREEZE

**Epic:** `STORAGE-ARCH-07` · Local Windows Layer-2 Independent Copy  
**Status:** **DESIGN FREEZE COMPLETE** · **OD-VPS-LOCAL-01…12 OWNER APPROVED / CLOSED**  
**Date:** 2026-10-05  
**Prerequisite audit:** [STORAGE_ARCH_07_LOCAL_BACKUP_AUDIT.md](./STORAGE_ARCH_07_LOCAL_BACKUP_AUDIT.md)  
**Parent:** OD-SA-06 · OD-SA-07-01…16 · OD-VPS-01…20 / OD-SA-07-14a · VPS Phase 1–6 **PASS**

```text
LOCAL BACKUP DESIGN             = FROZEN
LOCAL BACKUP IMPLEMENTATION     = PASS (see STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION.md)
LOCAL BACKUP OBJECTS            = 43/43 SHA VERIFIED · MANIFEST VERIFIED
LOCAL RESTORE VERIFIED          = 43/43 (see STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md)
AWS                             = DEFERRED (not cancelled forever)
ARCH-05                         = READY FOR OWNER DELETE GO · SAFE 32/32 · DELETE 0
```

This freeze authorized **architecture**. Implementation + restore drill executed under separate Owner GOs — [impl](./STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION.md) · [restore](./STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md).

---

## 1. Frozen topology

```text
SUPABASE STORAGE (PRIMARY · beat-audio)
        ↓  (already done · VPS Phase 4–6)
VPS CONTABO — Layer-1 / staging
  /srv/bitrymdym-backup
  43/43 BACKED UP · SHA+manifest
  3/43 RESTORE VERIFIED
        ↓  (future Implementation GO only)
LOCAL WINDOWS PC — Layer-2 independent copy
  C:\BitRymDym-Backup\
  PULL via SCP/SFTP
  APPEND / RETAIN
  NOT Object Lock / NOT WORM
```

| Plane | Role | Immutable? | Current state |
|-------|------|------------|---------------|
| Supabase Storage | PRIMARY media | No | 43 objects |
| Contabo VPS | Layer-1 staging / fast restore | No | 43/43 BACKED UP |
| Local Windows | Layer-2 independent copy | No | **43/43 RESTORE VERIFIED** |
| AWS S3 Object Lock | Future optional immutable DR | Yes (when built) | **DEFERRED** |

---

## 2. Owner Decisions — CLOSED / APPROVED

| ID | Decision | Status |
|----|----------|--------|
| **OD-VPS-LOCAL-01** | Local Windows = Layer-2 **independent copy** outside Supabase and VPS. **Not** Object Lock / WORM equivalent. | **CLOSED / APPROVED** |
| **OD-VPS-LOCAL-02** | Contabo VPS remains Layer-1 staging / working copy / fast restore plane. | **CLOSED / APPROVED** |
| **OD-VPS-LOCAL-03** | **PULL ONLY** — Owner Windows initiates pull from VPS. VPS must **not** push into Owner PC. | **CLOSED / APPROVED** |
| **OD-VPS-LOCAL-04** | **NO DELETE PROPAGATION** — forbidden: `rsync --delete` or any mirror that removes local history when remote shrinks. | **CLOSED / APPROVED** |
| **OD-VPS-LOCAL-05** | **APPEND / RETAIN** — COPY / SKIP / NEW VERSION; never blind overwrite without SHA identity check. | **CLOSED / APPROVED** |
| **OD-VPS-LOCAL-06** | **SHA-256 mandatory** on full payload. ETag is advisory only. | **CLOSED / APPROVED** |
| **OD-VPS-LOCAL-07** | **Manifest mandatory** (fields below). | **CLOSED / APPROVED** |
| **OD-VPS-LOCAL-08** | **Restore drill mandatory** before RESTORE VERIFIED. Never overwrite production. | **CLOSED / APPROVED** |
| **OD-VPS-LOCAL-09** | Encryption / security controls required (BitLocker finding remains open until elevated verify). | **CLOSED / APPROVED** (policy) · BitLocker evidence still **FINDING** |
| **OD-VPS-LOCAL-10** | Local path = `C:\BitRymDym-Backup\` (collision check: **ABSENT** · safe to use later). | **CLOSED / APPROVED** |
| **OD-VPS-LOCAL-11** | **AWS DEFERRED** for current operating variant; optional future immutable DR. Do not configure AWS in local implementation. | **CLOSED / APPROVED** |
| **OD-VPS-LOCAL-12** | Scope default YES: living USER · PLATFORM · ORPHAN. NO default: `take-audio` · `audio-artifacts`. No automatic bucket expansion. | **CLOSED / APPROVED** |

---

## 3. Path freeze

**Root (approved):** `C:\BitRymDym-Backup\`

**Collision check (2026-10-05):** path **ABSENT** — no conflicting tree.

**Layout:**

```text
C:\BitRymDym-Backup\
  objects\
    beat-audio\
      <safe-relative-object-key>
  manifests\
    <backup_run_id>\
      *.json
  restore-drills\
    <restore_run_id>\
  logs\
  README.txt
```

**Rules:**

- Deterministic map: `objects/<bucket>/<safe-object-key>`
- Fail-closed path validation (reuse SA07 / VPS helpers conceptually): reject `..`, absolute paths, empty segments, control chars, backslashes-as-traversal
- Never place DR tree inside Desktop git working copy or OneDrive sync root
- Do **not** create this directory until **PHASE LOCAL-BACKUP-IMPLEMENTATION** Owner GO

---

## 4. Transfer freeze

```text
LOCAL WINDOWS (Owner)
  --scp/sftp pull (OpenSSH, existing Contabo key)-->
VPS /srv/bitrymdym-backup/objects + manifests
  --> local staging
  --> SHA-256
  --> size check
  --> atomic rename into objects/
  --> manifest commit under manifests/<run>/
```

| Requirement | Freeze |
|-------------|--------|
| Auth | SSH public key (`bitrymdym-e3-contabo` or successor read-capable principal) |
| Ports | Existing SSH **22** only · no SMB · no new inbound on Owner PC |
| Direction | **PULL** from Windows |
| Resume | Re-get incomplete + SHA compare |
| Idempotency | Same bucket+key+sha256 → **SKIP** |
| Changed object | Same key + different SHA → **NEW VERSION** (retain prior; no blind overwrite) |
| Tools | OpenSSH SCP/SFTP sufficient for 43 objects · no install required for V1 |
| Post-transfer | Destination SHA must match source/manifest SHA |

---

## 5. Manifest freeze (minimum fields)

```text
backup_run_id
created_at / backup_timestamp
source_bucket
source_object_key
source_version_id
source_size
source_content_type
source_etag
classification
owner_user_id          (nullable)
owner_user_number      (nullable)
source_sha256
backup_source          = "vps-layer1"
vps_object_path
destination_path
backup_created_at
verification_status    = PENDING | SHA_VERIFIED | RESTORE_VERIFIED
```

No secrets: no service_role, tokens, AWS keys, private keys.

Manifest must prove: **what / when / from where / with which SHA / to where**.

---

## 6. Status ladder (local plane)

```text
PROPOSED
  → COPIED
  → SHA VERIFIED
  → MANIFEST VERIFIED
  → RESTORE VERIFIED
  → INDEPENDENT DR VERIFIED
```

**Hard rules:**

```text
BACKED UP          ≠ SAFE TO DELETE
SHA VERIFIED       ≠ RESTORE VERIFIED
LOCAL COPY EXISTS  ≠ ARCH-05 READY
INDEPENDENT DR VERIFIED ≠ OWNER APPROVED DELETE
```

Orphan **SAFE FOR DELETE** only after (all):

1. Local (and/or other Owner-approved DR) backup with SHA + manifest  
2. Restore verification  
3. No active DB refs  
4. No retention / living-user / platform constraints  
5. Explicit Owner allowlist GO  

---

## 7. Retention (design only — no purge implementation)

| Class | Proposal |
|-------|----------|
| Living USER | latest + **1** previous generation |
| PLATFORM | latest + **1** previous generation |
| ORPHAN | retain **≥ 90 days** after remote retirement mark |
| Manifest | retain **≥ 180 days** |
| Restore-drill artifacts | retain **≥ 7 days** |
| Staging | **24–72 h** then discard staging only |

**Frozen constraint:** no automatic local purge in Implementation V1 without a later Owner GO. Design values above are planning defaults only.

---

## 8. Restore freeze

```text
C:\BitRymDym-Backup\objects\
  → C:\BitRymDym-Backup\restore-drills\<restore_run_id>\
  → SHA-256
  → size
  → WAV header validation
  → ffprobe
  → PASS / FAIL per object
```

**Forbidden without separate Owner GO:**

- Local → Supabase Storage production write  
- Local → overwrite VPS `objects/`  
- In-place “fix” of production masters  

---

## 9. Security freeze

### 9.1 Finding (open evidence)

```text
SECURITY FINDING:
BitLocker / Device Encryption status requires separate elevated verification.
UNKNOWN ≠ PASS.
```

### 9.2 Required controls (policy — implement only under Implementation GO)

| Control | Requirement |
|---------|-------------|
| BitLocker / Device Encryption | Verify **ON** for volume hosting backup **before** claiming Layer-2 trustworthy; or use encrypted external volume |
| Dedicated directory | `C:\BitRymDym-Backup\` only |
| NTFS ACL | Owner-only (no Everyone / Users write/read beyond necessity) |
| Network share | **Forbidden** for this tree |
| Secrets in tree | **Forbidden** |
| Optional extra encryption | Deferred; not required for Design Freeze |

---

## 10. Scope freeze

| In scope (default YES) | Out of scope (default NO) |
|------------------------|---------------------------|
| `beat-audio` living USER | `take-audio` |
| `beat-audio` PLATFORM | `audio-artifacts` |
| `beat-audio` ORPHAN | Any other bucket without new Owner GO |

Source of truth for pull V1: **VPS Layer-1** (already SHA+manifest verified), not a second blind pull from Supabase (avoids double download risk; Supabase remains PRIMARY).

---

## 11. ARCH-05

```text
ARCH-05 = BLOCKED / NOT READY
```

Even after this freeze, ARCH-05 stays blocked until:

1. These Owner Decisions remain in force  
2. Local copy implemented and reconciled (or Owner accepts alternate DR bar in writing)  
3. SHA reconciliation  
4. Manifest reconciliation  
5. Restore drill evidence  
6. Security finding addressed to Owner satisfaction  
7. Separate Owner GO with exact orphan allowlist  

`BACKED UP` on VPS alone does **not** unlock delete.

---

## 12. AWS

```text
AWS S3 Object Lock = DEFERRED
NOT CONFIGURED
NOT REQUIRED for Local Layer-2 implementation phase
NOT CANCELLED as future immutable option
```

Local Layer-2 does **not** retire the option of AWS COMPLIANCE Object Lock later.

---

## 13. Implementation gate (next)

**Next stage name:** `PHASE LOCAL-BACKUP-IMPLEMENTATION`  
**Requires:** separate **OWNER GO**

Allowed only after that GO (preview — not authorized now):

1. Create `C:\BitRymDym-Backup\{objects,manifests,restore-drills,logs}`  
2. Pull from VPS with hard allowlist / run id  
3. SHA + manifest verify  
4. Optional canary restore drill locally  
5. Evidence docs update  

**Still forbidden until further GO:** full local restore-to-production, AWS, ARCH-05, orphan delete, commit/push/deploy unless Owner requests.

---

## 14. Relationship to other freezes

| Document | Relationship |
|----------|--------------|
| [STORAGE_ARCH_07_DESIGN_FREEZE.md](./STORAGE_ARCH_07_DESIGN_FREEZE.md) | Parent AWS-oriented BACKUP plane; Phase A still BLOCKED; Local Layer-2 is additive |
| [STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md](./STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md) | Layer-1 Contabo; unchanged compute role |
| [STORAGE_ARCH_07_LOCAL_BACKUP_AUDIT.md](./STORAGE_ARCH_07_LOCAL_BACKUP_AUDIT.md) | Feasibility evidence |
| [STORAGE_ARCH_07_IMPLEMENTATION.md](./STORAGE_ARCH_07_IMPLEMENTATION.md) | VPS Phase 1–6 evidence; local = 0 |

---

## 15. Mutation ledger (this freeze stage)

```text
SUPABASE: NO MUTATION
VPS: NO MUTATION
LOCAL PC: NO MUTATION
AWS: NO MUTATION
BACKUP: NOT CREATED
RESTORE: NOT EXECUTED
COMMIT: NO
PUSH: NO
DEPLOY: NO
```

---

## 16. Final status

```text
OWNER DECISIONS (OD-VPS-LOCAL-01…12): CLOSED / APPROVED
DESIGN FREEZE: COMPLETE
IMPLEMENTATION: PASS (43/43)
RESTORE: 43/43 PASS
AWS: DEFERRED
ARCH-05: NOT READY
```

**Living evidence:** [restore drill](./STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md) · [implementation](./STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION.md). Next: Owner REVIEW — ARCH-05 requires separate GO.
