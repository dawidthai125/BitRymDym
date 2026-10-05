# STORAGE-ARCH-07 — LOCAL WINDOWS BACKUP AS INDEPENDENT DR COPY (AUDIT)

**Date:** 2026-10-05  
**Type:** READ-ONLY feasibility audit · **ZERO MUTATION**  
**Owner intent:** Defer AWS Object Lock for now; evaluate Owner Windows PC as an independent DR copy beyond Supabase + Contabo VPS Layer-1.  
**Status:** **AUDIT COMPLETE** · decisions **CLOSED** · Implementation **PASS** · Restore **PASS** — [restore](./STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md) · local **43/43 RESTORE VERIFIED**

```text
LOCAL BACKUP AUDIT              = PASS (with CONDITIONS)
EXISTING LOCAL BITRYMDYM STORAGE BACKUP = NO
LOCAL CAPACITY                  = PASS (current + near-term)
TRANSFER FEASIBILITY            = PASS (SCP/SFTP pull; tools present)
SECURITY                        = FINDINGS (BitLocker status unknown without elevation)
RESTORE FEASIBILITY             = PASS (design; ffprobe present locally)
INDEPENDENT DR FEASIBILITY      = PASS / CONDITIONS
AWS                             = NOT REQUIRED FOR THIS AUDIT PHASE
SUPABASE MUTATION               = NO
VPS MUTATION                    = NO
LOCAL BACKUP CREATED            = NO
RESTORE EXECUTED                = NO
COMMIT / PUSH / DEPLOY          = NO
ARCH-05                         = CLOSED / DELETE EXECUTED / VERIFIED (later; local 43/43 RETAINED)
```

---

## 1. Executive Summary

| Question | Finding |
|----------|---------|
| Does Owner Windows already hold an independent `beat-audio` object-byte DR copy? | **NO** |
| Is capacity enough for current 43 objects (~106 MiB / ~115 MiB on VPS)? | **YES** (~103 GB free on `C:`) |
| Can Windows pull from VPS without new installs? | **YES** — OpenSSH `scp`/`sftp` + existing Contabo key |
| Is local Windows a substitute for AWS Object Lock / WORM? | **NO** |
| Is local Windows a sensible **additional** independent copy after VPS Layer-1? | **YES, with CONDITIONS** (encryption, append/retain, external media long-term, Owner GO + Design Freeze) |

**Current verified Storage chain (pre-local):**

```text
Supabase beat-audio (43)
  → VPS Contabo Layer-1 (/srv/bitrymdym-backup) 43/43 BACKED UP
  → canary restore verified 3/43
  → AWS: NOT CONFIGURED
  → Local Windows object-byte DR: ABSENT
```

**Historical local DB dump** at `C:\BitRymDym-recovery\` remains **DB-only** and is **not** a Storage DR copy (see [HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md](./HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md)).

**WGDOM** scheduled tasks and Desktop JSON export are **out of scope** and must not be treated as BitRymDym Storage backup.

---

## 2. Local Machine Inventory

| Item | Evidence |
|------|----------|
| Hostname / user | `TAJSKI` / `dawid` |
| OS | Microsoft Windows 11 Home · build **26200** · 64-bit |
| RAM | ~15.6 GB total · ~0.6 GB free at audit sample (transient) |
| System volume | `C:` · **NTFS** · **475.71 GB** · **103.01 GB free** (~21.7%) |
| Physical disk | Samsung NVMe SSD **MZVL8512HELU** · ~477 GB · Healthy |
| Additional volumes `D:`/`E:`/`F:` | **MISSING** (no second local volume) |
| WSL | **NOT INSTALLED** |
| OpenSSH client | **PRESENT** (`ssh` / `scp` / `sftp` in System32) |
| Contabo SSH key | `~\.ssh\bitrymdym-e3-contabo` (+ `.pub`) |
| VPS reachability (read-only) | `ubuntu@161.97.72.197` → **OK** · `/srv/bitrymdym-backup` ≈ **115M** · **43** object files |
| `rsync` / `rclone` / `restic` / `borg` / `kopia` / `aws` CLI | **MISSING** |
| `ffprobe` | **PRESENT** (WinGet FFmpeg package) |
| `git` | PRESENT |
| BitLocker / device encryption | **UNKNOWN without elevation** (`Get-BitLockerVolume` / `manage-bde` Access denied). Registry `BitLockerStatus.BootStatus=1` is inconclusive alone. |
| BitRymDym Task Scheduler jobs | **NONE** (XML scan hit 0). WGDOM tasks exist and are **not** BitRymDym. |
| Dedicated local BitRymDym backup root | **ABSENT** (`C:\BitRymDym-Backup`, `D:\…` not found) |

---

## 3. Existing BitRymDym Backup Search

### 3.1 Scoped search (reasonable locations only)

Searched: `C:\BitRymDym-recovery\`, `C:\Users\dawid\Desktop\BitRymDym\`, Desktop root, Downloads, Documents/OneDrive name hits, common `C:\backup*` paths.  
Did **not** full-disk crawl.

### 3.2 Findings

| Path | Classification | Notes |
|------|----------------|-------|
| `C:\BitRymDym-recovery\bitrymdym-production-pre-account-profile-01.dump` | **DB dump only** | 532 829 B · PostgreSQL CUSTOM · **no Storage bytes** |
| `C:\Users\dawid\Desktop\BitRymDym\bitrymdym\` | **Repository / tooling** | SA07 scripts + JSON evidence docs · **not** object-byte DR tree |
| `C:\Users\dawid\Desktop\BitRymDym\bitrymdym-fixtures\` | **Dev fixtures** | ~95 WAV/MP3 · ~133 MB · BPM/test audio · **≠ production Storage keys / manifests / SHA ledger** |
| `C:\Users\dawid\Desktop\backup-2026-09-04.json` | **WGDOM (not BitRymDym)** | ~7.6 MB · `kw-directory` / WGDOM content · BitRym tokens **absent** |
| Downloads BitRym names | Marketing PNGs only | Not Storage backup |
| Production `master.bin` under Desktop/recovery/Downloads | **NOT FOUND** | No local production object tree |
| Local SHA-256 object ledger / VPS-mirrored manifests | **NOT FOUND** as a local DR store | Repo has *evidence JSON* from Phase 4–6, not local `objects/` copies |
| Sync tools / BitRym scheduled pull | **NOT FOUND** | |

### 3.3 Separation

| Domain | Status |
|--------|--------|
| BitRymDym Storage object-byte DR on this PC | **NO** |
| BitRymDym DB recovery artifact | **YES** (historical dump) |
| BitRymDym VPS Layer-1 | **YES** (on Contabo, not this PC) |
| WGDOM backups / tasks | **IGNORE for SA07** |

**Verdict:** `EXISTING LOCAL BITRYMDYM BACKUP` (Storage object bytes) = **NO**.

---

## 4. Capacity

### 4.1 Current production inventory (SSOT)

```text
beat-audio TOTAL = 43
USER = 8 · PLATFORM = 3 · ORPHAN = 32 · UNKNOWN = 0
BYTES = 111574892  (~106.4 MiB)
VPS tree now   ≈ 115 MiB (objects + manifests + restore-drill canary)
```

### 4.2 Sizing model (do not assume 111 MB forever)

| Tier | Objects + manifests | Restore-drill workspace | Growth / headroom | Total target |
|------|---------------------|-------------------------|-------------------|--------------|
| **MINIMUM** | ~0.15 GB | ~0.15 GB | ~0.2 GB | **~0.5 GB** |
| **RECOMMENDED** | ~1–2 GB | ~1 GB | ~3–7 GB | **~5–10 GB** dedicated folder |
| **LONG-TERM** | multi-GB library growth | periodic drills | version/retain history | **≥50 GB** preferably on **external** encrypted volume |

### 4.3 Host fit

- Free on `C:`: **~103 GB** → current + RECOMMENDED fit **PASS**.
- Single NVMe, no second internal volume → long-term independence **CONDITIONS** (external disk strongly recommended).
- Competing use of `C:` (OS, Desktop repo, fixtures ~133 MB, browser, etc.) → do **not** place DR solely inside the git working tree.

---

## 5. Proposed Local Backup Architecture

**Do not create yet.** Candidate root (Owner to approve path):

```text
C:\BitRymDym-Backup\                 # interim on C: if no external volume
  objects\
    beat-audio\
      <safe-object-key...>
  manifests\
    <backup_run_id>\
      *.json
  restore-drills\
    <restore_run_id>\
  logs\
  README.txt
```

**Preferred long-term root (when available):** encrypted external volume, e.g. `E:\BitRymDym-Backup\` (volume does not exist today).

### Identity (minimum)

```text
source_bucket + source_object_key + source_sha256
```

Plus: size, content_type, version_id, etag, classification, owner refs when available, backup timestamps, `backup_source=vps-layer1`, VPS path, local path, verification_status.

### Path safety

Reuse VPS/SA07 rules: fail-closed on traversal / absolute / control chars; never write into git repo or Desktop project tree.

### Semantics

**APPEND / RETAIN** — not a destructive mirror. New SHA for same key → new generation path or generation suffix; never silent overwrite; never `rsync --delete` without quarantine.

---

## 6. VPS → Local Transfer Options

| Mechanism | Available now | Direction | Notes |
|-----------|---------------|-----------|-------|
| **SCP / SFTP (OpenSSH)** | **YES** | **Windows PULL from VPS** | Preferred. Key `bitrymdym-e3-contabo`. Port **22**. Resume: partial (re-get + SHA). Idempotency: skip if local SHA matches manifest. |
| rsync via WSL | NO (WSL absent) | — | Would require install → **out of scope for this audit** |
| rclone / restic / borg / kopia | MISSING | — | Install forbidden in this audit |
| VPS PUSH into Owner PC | Possible but **discouraged** | inbound to home PC | NAT, firewall, larger attack surface |

**Preferred model:**

```text
LOCAL WINDOWS PULLS FROM VPS
  scp/sftp as ubuntu (sudo -u bitrymdym-backup read) OR dedicated read-only backup SSH principal (future)
  → stage locally
  → SHA-256
  → atomic rename into objects/
  → manifest commit
```

**Delete risk:** pull tools must **not** prune local objects when VPS/Supabase deletes. Local retention ≠ VPS listing.

**Feasibility:** **PASS** with existing OpenSSH + Contabo key + proven VPS tree.

---

## 7. Security

| Topic | Finding | Recommendation (future Owner GO) |
|-------|---------|----------------------------------|
| Disk encryption | **UNKNOWN** (no elevation) | Confirm BitLocker / Device Encryption **ON** for `C:` before trusting PC as DR; prefer encrypted external |
| NTFS ACL | Default user-writable Desktop/profile | Dedicated `C:\BitRymDym-Backup` with Owner-only ACL; not world-readable |
| Other Windows accounts | Home edition single-user typical | Still restrict ACL; no Everyone:F |
| At-rest crypto beyond BitLocker | Not present for a DR tree | Optional container (VeraCrypt/etc.) — only after Owner GO; **not** installed here |
| Secrets | Service role must **never** live in local backup tree | Pull from VPS using SSH key only; no Supabase keys in manifests |
| SSH key protection | Key present in `~\.ssh` | Keep private key ACL-tight; do not copy key into backup tree |

**Security status:** **FINDINGS** (encryption verification blocked without admin).

---

## 8. Delete / Retention Risk

### Required semantic

```text
DELETE in Supabase  ≠  DELETE on VPS  ≠  DELETE on Local
Local = APPEND / RETAIN / QUARANTINE
```

### Anti-patterns (NO-GO)

- `rsync --delete` / mirror sync that removes local orphans when remote shrinks  
- Cloud sync folders (OneDrive) that propagate deletes  
- Placing DR inside a synced Desktop folder without retention  

### Preferred controls (design only)

1. **Generation retention:** keep prior SHA generations under `objects/.../generations/<sha>/` or dated run folders.  
2. **Manifest ledger:** never rewrite history; new run IDs.  
3. **Quarantine:** objects no longer on VPS marked `RETIRED_REMOTE` but retained locally until Owner allowlist.  
4. **No automatic GC** of local DR without Owner GO (separate from ARCH-05).  
5. **Snapshots (optional later):** Volume Shadow Copy / external disk file-history — not configured today.

---

## 9. Restore Strategy (future)

```text
LOCAL BACKUP objects/
  → isolated restore-drills/<run>/
  → SHA-256 == manifest
  → size match
  → WAV header + ffprobe (available on this PC)
  → PASS / FAIL per object
```

**Never** without separate Owner GO:

```text
LOCAL → Supabase Storage production overwrite
LOCAL → in-place replace of VPS objects
```

Canary-first local restore drill (1 USER + 1 PLATFORM + 1 ORPHAN) should precede any bulk local restore verification — mirror Phase 5 discipline.

---

## 10. Independence Analysis

| Dependency plane | Local Windows copy independent? |
|------------------|----------------------------------|
| Supabase Storage | **YES** (if bytes pulled and retained offline of API) |
| Supabase DB | **YES** |
| Vercel | **YES** |
| Contabo VPS | **YES after pull completes** (failure of VPS does not erase already-pulled local bytes) |

### Common-mode risks (local is NOT WORM)

- Laptop theft / loss  
- Single SSD failure  
- Ransomware encrypting `C:`  
- Accidental `rm -rf` / Explorer delete  
- Destructive sync  
- No Object Lock / compliance retention  
- Owner travels with the only offline copy  

**Conclusion:** Local PC is an **independent copy relative to cloud/VPS**, but **weaker** than AWS S3 Object Lock for ransomware / accidental delete / custody. Acceptable as Layer-2 **with CONDITIONS**, not as sole final DR forever.

---

## 11. Local vs VPS vs AWS

| Criterion | Local Windows | VPS Contabo Layer-1 | AWS S3 Object Lock |
|-----------|---------------|---------------------|--------------------|
| Independence from Supabase | High (after pull) | High (after pull) | Highest (separate account) |
| Independence from Contabo | High | N/A (is Contabo) | High |
| Cost | Marginal (disk) | Already paid VPS | Incremental AWS $ |
| Immutability / WORM | **None** (unless extra tooling) | **None** | **COMPLIANCE Object Lock** |
| Ransomware resilience | **Low–medium** | Medium (remote) | **High** |
| Accidental DELETE resilience | Only if append/retain | Only if append/retain | High with Object Lock |
| Restore convenience | High (local + ffprobe) | Medium (SSH) | Medium |
| RPO (design) | Pull interval (manual/scheduled) | Already near-source | Batch after VPS/local |
| RTO | Fast for local drill | Medium | Medium |
| Operator burden | Owner discipline | Server principal exists | IAM + account ops |
| Current BitRymDym state | **Not built** | **43/43 BACKED UP** | **NOT CONFIGURED** |

### Recommendation for BitRymDym (audit opinion — not Owner decision)

1. **Keep Contabo as Layer-1 staging** (already PASS through Phase 6).  
2. **Add Local Windows as Layer-2 independent copy** via **pull + SHA + manifest + append/retain** — Design Freeze + Owner GO required before any copy.  
3. **Defer AWS** for now if Owner accepts higher ransomware/custody risk; **revisit AWS Object Lock** before scale / before any ARCH-05 orphan deletion authority.  
4. **Do not** treat local PC as equivalent to Object Lock.  
5. Prefer **external encrypted disk** for LONG-TERM once capacity/independence matter more than convenience.

---

## 12. Recommendation

| Item | Recommendation |
|------|----------------|
| Proceed to Design Freeze for local Layer-2? | **YES — feasible** |
| Create local copy in this audit? | **NO** (forbidden) |
| Path interim | `C:\BitRymDym-Backup\` (not under Desktop git tree) |
| Path long-term | External encrypted volume (Owner procure) |
| Transfer | Windows **SCP/SFTP pull** from VPS; SHA verify; atomic write |
| Retention | Append/retain; no delete propagation |
| Encryption gate | Confirm BitLocker/Device Encryption **before** trusting Layer-2 |
| AWS | Optional later; still the right **immutable** DR when ready |
| ARCH-05 | Still **NOT READY** until Owner decisions + verified local (or AWS) DR + restore policy |

---

## 13. Blockers

| Blocker | Severity | Notes |
|---------|----------|-------|
| BitLocker / encryption status unverified | **Medium** | Needs elevated Owner check |
| No second disk / external volume today | **Medium** (long-term) | Interim on `C:` acceptable with eyes open |
| No local Storage object DR yet | **Expected** | Implementation not started |
| WSL/rsync/rclone absent | **Low** | SCP sufficient for 43 objects |
| Home PC custody / ransomware | **Structural** | Accept or add AWS later |

None of these are hard blockers to **Design Freeze**; they are **CONDITIONS** for implementation GO.

---

## 14. Owner Decisions Required (PROPOSED — NOT CLOSED)

Do **not** treat the following as approved until Owner explicitly closes them:

| ID | Decision draft |
|----|----------------|
| **OD-VPS-LOCAL-01** | Local Windows backup = additional **independent DR copy** (Layer-2), not a replacement for VPS Layer-1 |
| **OD-VPS-LOCAL-02** | Contabo VPS remains Layer-1 staging / working copy |
| **OD-VPS-LOCAL-03** | Local backup is **not** a destructive mirror; Supabase/VPS DELETE **does not propagate** to local |
| **OD-VPS-LOCAL-04** | SHA-256 of full object payload is mandatory for every local object |
| **OD-VPS-LOCAL-05** | Manifest JSON per object/run is mandatory (no secrets) |
| **OD-VPS-LOCAL-06** | Isolated local restore drill is mandatory before claiming local RESTORE VERIFIED |
| **OD-VPS-LOCAL-07** | Retention / generation keep policy mandatory (append/retain + quarantine) |
| **OD-VPS-LOCAL-08** | Encryption requirement: BitLocker/Device Encryption verified **OR** encrypted external volume |
| **OD-VPS-LOCAL-09** | Approved local backup root path |
| **OD-VPS-LOCAL-10** | Transfer mechanism = Windows pull via SCP/SFTP from VPS (not VPS push) |
| **OD-VPS-LOCAL-11** | AWS Object Lock remains **deferred** (not cancelled forever) until Owner revisits |
| **OD-VPS-LOCAL-12** | ARCH-05 remains blocked until Owner-defined DR bar (local and/or AWS) + restore evidence |

---

## 15. Explicit No-Go Conditions

STOP / do not implement local DR if:

- Owner refuses append/retain and demands delete-mirroring sync  
- Encryption cannot be established and Owner rejects residual risk  
- Backup root would be placed inside OneDrive/Desktop git sync with delete propagation  
- Implementation attempts to write to Supabase Storage or mutate VPS objects as part of “local backup”  
- Local copy is claimed as **Object Lock equivalent**  
- ARCH-05 deletion is attempted using only “local backup planned” without verified restore + Owner allowlist  

---

## 16. Evidence

| Evidence | Result |
|----------|--------|
| OS / disk inventory | Windows 11 Home · `C:` NTFS 476 GB · 103 GB free · 1× Samsung NVMe |
| Tool inventory | ssh/scp/sftp/ffprobe/git present · rsync/rclone/restic/aws/WSL absent |
| SSH key + VPS probe | Contabo reachable · backup tree 115M · 43 files |
| Recovery folder | DB dump only |
| Desktop/Downloads search | No production Storage object tree; fixtures ≠ DR; WGDOM JSON separated |
| Scheduled tasks | WGDOM only; no BitRymDym backup task |
| Encryption | Not conclusively verified (access denied) |
| Mutations this audit | **NONE** |

---

## 17. Mutation Ledger

```text
SUPABASE MUTATION: NO
STORAGE MUTATION: NO
DB MUTATION: NO
AUTH MUTATION: NO
VPS MUTATION: NO
AWS MUTATION: NO
LOCAL BACKUP CREATED: NO
LOCAL DIRECTORY CREATED: NO
TOOLS INSTALLED: NO
RESTORE EXECUTED: NO
COMMIT: NO
PUSH: NO
DEPLOY: NO
ARCH-05 ACTIONS: NO
```

---

## Final status

```text
LOCAL BACKUP AUDIT: PASS
EXISTING LOCAL BITRYMDYM BACKUP: NO
LOCAL CAPACITY: PASS
TRANSFER FEASIBILITY: PASS
SECURITY: FINDINGS
RESTORE FEASIBILITY: PASS
INDEPENDENT DR FEASIBILITY: PASS / CONDITIONS
AWS: NOT REQUIRED FOR THIS PHASE
SUPABASE MUTATION: NO
VPS MUTATION: NO
LOCAL BACKUP CREATED: NO
RESTORE EXECUTED: NO
COMMIT: NO
PUSH: NO
DEPLOY: NO
ARCH-05: NOT READY UNTIL OWNER DECISION + DESIGN FREEZE + VERIFIED LOCAL COPY + RESTORE
```

**NEXT GATE = OWNER DECISION + DESIGN FREEZE**

Do not auto-start local backup implementation, AWS, restore expansion, or ARCH-05.
