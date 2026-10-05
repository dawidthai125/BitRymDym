# STORAGE-ARCH-07 — VPS BACKUP PLANE DESIGN FREEZE

**Epic:** `STORAGE-ARCH-07` · VPS Layer-1 Working Copy (Contabo)  
**Status:** **DESIGN FREEZE COMPLETE** · **OD-VPS-01…20 OWNER APPROVED** · **OD-SA-07-14a OWNER APPROVED** · Phase 1–6 **PASS** · Phase 7+ **NOT STARTED**  
**Date:** 2026-10-05  
**Decydent:** Owner (Prezes Dawid) — Owner GO recorded 2026-10-05  
**Upstream audit:** Contabo VPS Backup Feasibility Audit (2026-10-05) · host `161.97.72.197` · result **B — YES WITH CONDITIONS**  
**Parent:** [STORAGE_ARCH_07_DESIGN_FREEZE.md](./STORAGE_ARCH_07_DESIGN_FREEZE.md) · [STORAGE_ARCH_01_DESIGN_FREEZE.md](./STORAGE_ARCH_01_DESIGN_FREEZE.md)

```text
VPS BACKUP PLANE DESIGN           = COMPLETE / OWNER APPROVED
OD-VPS-01…20                      = CLOSED / APPROVED
OD-SA-07-14a                      = CLOSED / APPROVED (Contabo Layer-1 staging exception)
PHASE 1 (security hardening)      = PASS (2026-10-05)
PHASE 2 (principal + directory)   = PASS (2026-10-05)
PHASE 3 (transfer + SHA + manifest + dry-run) = PASS / DRY-RUN VERIFIED (2026-10-05)
PHASE 4 (controlled canary)       = PASS / CANARY BACKED UP (2026-10-05)
  · production byte COPY          = 3/43 · NOT full backup
PHASE 5 (canary restore drill)    = PASS / CANARY RESTORE VERIFIED (2026-10-05)
  · restore dest                  = restore-drills/ only · NOT objects/ · NOT Supabase
PHASE 6 (full VPS expansion)      = PASS / VPS Layer-1 43/43 BACKED UP (2026-10-05)
  · restore verified              = 3/43 · AWS NOT CONFIGURED · evidence 43/43 RETAINED post ARCH-05
PHASE 7+                          = NOT STARTED (await separate Owner GO)
STORAGE / AWS / DB MUTATION       = NONE (ARCH-05 deleted prod orphans only; VPS untouched)
ARCH-05                           = CLOSED / DELETE EXECUTED / VERIFIED
STORAGE-ARCH-07 Phase A (AWS)     = BLOCKED (unchanged)
OD-SA-07-01…16                    = CLOSED (14a amends Contabo target only)
```

**Hard rule:** Contabo EXTERNAL COMPUTE role is **not** rewritten by this draft. Any Contabo backup role is an **additional, explicitly named BACKUP PLANE** and requires Owner GO on OD-VPS-* plus a scoped amendment path for OD-SA-07-14 (Contabo currently = NO in backup scope).

---

## 1. Purpose

Zamrozić (po Owner GO) architekturę **VPS BACKUP PLANE** jako:

```text
WORKING / STAGING COPY  (Layer-1)
≠ sole / final disaster recovery
≠ Object Lock / WORM immutable plane
≠ PRIMARY durable media (PRIMARY remains Supabase Storage)
```

Docelowy łańcuch (AWS = osobny etap):

```text
Supabase Storage (PRIMARY)
        ↓
VPS BACKUP PLANE (Layer-1 working copy)
        ↓
SHA-256 + MANIFEST
        ↓
RESTORE DRILL (isolated)
        ↓
AWS S3 Object Lock (immutable DR)   ← STORAGE-ARCH-07 Phase A+
```

---

## 2. Scope

**In scope (design):**

- Contabo host `vmi3622761` / `161.97.72.197` as candidate Layer-1 plane
- Dedicated principal + directory outside E3 worker tree
- Server-side pull of private `beat-audio` objects
- Atomic write · SHA-256 · mandatory manifest · idempotency · resume/retry
- Isolated restore drill
- Security hardening **gates** before first production copy
- Handoff model to AWS (later)

**Out of scope (this freeze):**

- Any VPS mutation / package install / SSH change
- Production Storage COPY
- AWS account / bucket / Object Lock proof
- ARCH-05 delete
- Application / Vercel / migration apply

---

## 3. Non-goals

- Contabo as sole/final DR  
- Contabo as durable audio library / PRIMARY media  
- Contabo as replacement for OD-SA-07-01…04 Object Lock plane  
- Public HTTP browse of backup objects  
- Overwrite restore into production Supabase Storage  
- Automatic orphan DELETE after VPS backup  
- Reopening OD-SA-07-01…16 without Owner GO  
- Changing STORAGE-ARCH-01 Hybrid C  

---

## 4. Relationship to STORAGE-ARCH-07

| Item | Status |
|------|--------|
| OD-SA-07-01…16 | **CLOSED** · unchanged by this draft |
| Immutable DR plane | Remains **external S3-compatible + Object Lock** (AWS selected, Phase A BLOCKED) |
| VPS plane | **Additive Layer-1** · does **not** satisfy OD-SA-07-04 immutability |
| OD-SA-07-14 Contabo = NO | Still CLOSED · **Owner Decision required** to add VPS BACKUP PLANE as explicit exception (see §4.1) |

### 4.1 OD-SA-07-14 amendment path (Owner GO required)

**Current CLOSED text:** Contabo = **NO** (default) in backup scope V1.

**Why amendment is needed:** Using Contabo as *backup target* conflicts with the literal “Contabo = NO” unless Owner explicitly adds:

```text
Contabo EXTERNAL COMPUTE        = unchanged (NOT durable library)
Contabo VPS BACKUP PLANE        = ALLOWED as WORKING/STAGING Layer-1 only
Contabo as sole/final DR        = FORBIDDEN
```

**Proposed mechanism (not executed):**

1. Owner GO closes OD-VPS-01…20  
2. Owner GO records **OD-SA-07-14a** (amendment) or superseding note: Contabo allowed **only** as VPS BACKUP PLANE / Layer-1  
3. OD-SA-07-01…13, 15–16 remain CLOSED  

Until that GO: **do not** treat Contabo as authorized backup target.

---

## 5. Relationship to STORAGE-ARCH-01

| Locked value | Unchanged |
|--------------|-----------|
| PRIMARY durable media | Supabase Storage |
| Contabo EXTERNAL COMPUTE | FFmpeg / ephemeral · **NOT** durable library |
| Hybrid C | LOCKED |
| OD-SA-07 Mix no-backup | LOCKED (naming adjacency ≠ OD-SA-07-01…16) |

VPS BACKUP PLANE is a **new privilege-separated role on the same host**, not a rewrite of EXTERNAL COMPUTE.

---

## 6. Relationship to ARCH-05

```text
ARCH-05 DELETE              = CLOSED / DELETE EXECUTED / VERIFIED
VPS evidence                = 43/43 RETAINED (no delete propagation)
```

VPS Design Freeze did not itself unlock ARCH-05; later Owner GO + allowlist did. VPS objects were **not** deleted when production orphans were removed.

Still required before any orphan delete may be considered:

```text
BACKED UP
+ MANIFEST VERIFIED
+ SHA MATCH
+ RESTORE VERIFIED
+ SAFE
+ OWNER APPROVED
= DELETE MAY BE CONSIDERED
```

Living **32** orphans: NOT SAFE · NOT BACKED UP · NOT RESTORE VERIFIED · NOT OWNER APPROVED · NOT DELETED · **ZERO DELETE**.

---

## 7. Existing VPS role

```text
HOST                        = Contabo · 161.97.72.197 · vmi3622761
ROLE                        = EXTERNAL COMPUTE (E3 render worker)
PATH                        = /opt/bitrymdym-e3-worker
SYSTEMD                     = bitrymdym-e3-worker.service · disabled / inactive
DEPLOYED_COMMIT             = 92496d4…
PRINCIPAL                   = bitrymdym-e3 (nologin)
```

---

## 8. New proposed VPS backup role

```text
ROLE                        = VPS BACKUP PLANE / Layer-1 WORKING COPY
CLASS                       = STAGING (OD-VPS-16 PROPOSED)
SAME HOST AS COMPUTE        = YES (common-mode risk accepted only with AWS DR later)
SOLE / FINAL DR             = NO (OD-VPS-02 PROPOSED)
```

---

## 9. Security boundary

**Before first production object copy (OD-VPS-20 PROPOSED — not executed):**

| Control | Required |
|---------|----------|
| SSH key-only | YES |
| PasswordAuthentication | OFF |
| Root SSH | restricted or disabled (prefer deploy key / sudo user) |
| UFW | ON · default deny inbound · allow SSH from Owner allowlist |
| fail2ban | ON (sshd) |
| Dedicated `bitrymdym-backup` | YES |
| Backup dir permissions | restrictive · see §12 |
| Public HTTP to backup tree | FORBIDDEN |
| Vercel inbound to VPS | NOT REQUIRED / NOT OPENED |

Audit baseline (2026-10-05): PasswordAuthentication **yes** · UFW **inactive** · fail2ban **absent** ⇒ **NOT READY** for production backup data.

---

## 10. Backup directory (proposed — NOT created)

Preferred root:

```text
/srv/bitrymdym-backup/
├── objects/            # content-addressed or key-mirrored finalized objects
├── manifests/          # JSONL run evidence (secondary)
├── staging/            # incomplete downloads (atomic rename out)
├── restore-drills/     # isolated restore targets only
└── logs/               # operator logs (no secrets / no signed URLs)
```

Rationale vs `/var/lib/...`: `/srv` is empty today, outside worker tree, conventional for site data, easy to mount a future encrypted volume.

**Forbidden locations:** `/opt/bitrymdym-e3-worker/**` · `/tmp` as durable store · world-readable paths.

---

## 11. Dedicated principal

```text
SYSTEM USER                 = bitrymdym-backup   (PROPOSED · not created)
SHELL                       = /usr/sbin/nologin (or equivalent)
HOME                        = /var/lib/bitrymdym-backup (or none)
GROUP                       = bitrymdym-backup
```

Backup worker process runs **as** `bitrymdym-backup` only.

---

## 12. Permissions

| Principal | `/srv/bitrymdym-backup` | Notes |
|-----------|-------------------------|-------|
| `bitrymdym-backup` | rwx on staging/objects/manifests/logs/restore-drills (as needed) | sole writer |
| `bitrymdym-e3` | **NO READ · NO WRITE · NO DELETE** | OD-VPS-06 |
| `ubuntu` / deploy sudoers | NO default access | break-glass only |
| `root` | ownership bootstrap only | minimize ongoing use |
| world | **0** | `0700` or `0750` backup-group-only |

**Minimal exception (OD-VPS-06):** none for E3 worker. If a future restore *tool* needs read, it runs as `bitrymdym-backup` or a separate `bitrymdym-backup-reader` — never as `bitrymdym-e3`.

Proposed ownership: `bitrymdym-backup:bitrymdym-backup` · mode `0700` on root and sensitive leaves.

---

## 13. Source authentication

```text
SOURCE                      = Supabase Storage · private bucket beat-audio
AUTH                        = dedicated backup credentials (service_role-class or scoped key)
LOCATION                    = VPS env file readable ONLY by bitrymdym-backup (0600)
VERCEL                      = MUST NOT hold backup-delete / backup-admin for VPS plane
PROD service_role on Vercel = MUST NOT gain VPS backup filesystem access
```

Aligns with OD-SA-07-08 spirit: separated principals · prefer no long-lived backup admin in Vercel.

---

## 14. Object download

```text
METHOD                      = server-side Storage download (service API) · TLS
PUBLIC URL / browser        = FORBIDDEN
CLIENT-SIDE HASH AS SSOT    = FORBIDDEN
CLASSIFICATION              = living USER · platform · orphan (from DB + storage.objects)
```

E3 worker already demonstrates server-side download patterns; VPS backup worker is a **separate** process/principal.

---

## 15. Atomic writes

Required pattern (OD-VPS-10 PROPOSED):

```text
download → /srv/bitrymdym-backup/staging/<run>/<tmp>
  → compute SHA-256 while streaming or after close
  → fsync file (and dir if platform allows)
  → atomic rename → objects/<final_key>
  → append/update manifest record
  → mark status COMPLETE only after rename + manifest durable
```

Failure mid-way ⇒ staging object discarded or retried · never advertised as COMPLETE.

---

## 16. SHA-256

Primary integrity (OD-SA-07-06 · OD-VPS-08):

```text
SHA256(source_bytes) == SHA256(vps_object_bytes)
size match
content-type recorded
exact source object_key
eTag advisory only
```

Production hashing of masters is an **Implementation** activity — not authorized by this draft alone.

---

## 17. Manifest

**Mandatory** (OD-VPS-09 · OD-SA-07-07).

### 17.1 Storage model (aligned with OD-SA-07-16)

| Layer | Role |
|-------|------|
| **PRIMARY** | DB manifest records (when migration applied under separate Implementation GO) |
| **SECONDARY** | JSONL evidence under `/srv/bitrymdym-backup/manifests/` |

Until DB migration is applied: JSONL on VPS is **operational evidence**; ARCH-05 still requires DB-primary path per STORAGE-ARCH-07 when that plane is live — do not silently demote SSOT.

### 17.2 Minimum fields

```text
backup_run_id
source_bucket
source_object_key
source_version          # if available; else null
size
content_type
sha256
etag                    # advisory
classification          # USER_MASTER | PLATFORM_MASTER | ORPHAN
owner_user_id           # if available
owner_user_number       # if available
backup_timestamp
backup_path             # absolute path under /srv/bitrymdym-backup/objects/
verification_status     # PENDING | HASH_OK | RESTORE_OK | FAILED
```

### 17.3 Object model (design — no table/file created)

```text
bucket
object_key
version_id
size
content_type
etag
sha256
source_created_at
backup_created_at
classification
owner_user_id
owner_user_number
status                  # STAGED | COMPLETE | FAILED | RETIRED
```

Idempotency identity (OD-VPS-11):

```text
source_bucket + source_object_key + source_sha256
```

---

## 18. Idempotency

Re-run with same identity ⇒ no duplicate COMPLETE objects; refresh manifest verification timestamp only if bytes/hash unchanged.

---

## 19. Retry / resume

| Case | Behavior |
|------|----------|
| Network fail mid-download | retry with backoff · staging incomplete discarded or resumed if size+partial policy defined |
| Hash mismatch | FAIL · quarantine/delete staging · do not COMPLETE |
| Disk full | STOP run · alert · no partial COMPLETE |
| Process crash | staging cleanup on next run · resume incomplete keys |

---

## 20. Retention (OD-VPS-14 PROPOSED — not closed)

| Class | Proposal | Rationale |
|-------|----------|-----------|
| Living USER / platform MASTER | Keep **latest COMPLETE** + **previous 1** generation · min **30 days** for superseded | Working copy; AWS holds immutable DR later |
| Orphan / historical (pre-ARCH-05) | Keep COMPLETE ≥ **90 days** after first verified backup | Matches OD-SA-07-05 GC-candidate floor |
| Manifests / verification metadata | Retain ≥ object retention · recommend **180 days** | Auditability |
| Staging incomplete | TTL **24–72h** then purge | Avoid disk leak |
| Restore-drill artifacts | TTL **7 days** after drill close | Isolated only |

Owner may tighten; **no automatic retention shorten** without audit (OD-SA-07-05 spirit).

---

## 21. Restore drill

Mandatory before any backup set is **RESTORE VERIFIED** (OD-VPS-13 · OD-SA-07-11):

```text
SOURCE BACKUP PATH          = /srv/bitrymdym-backup/objects/...
TARGET                      = /srv/bitrymdym-backup/restore-drills/<drill_id>/
OVERWRITE PRODUCTION        = FORBIDDEN
SHA CHECK                   = required PASS
```

---

## 22. Failure modes

| Mode | Impact | Mitigation |
|------|--------|------------|
| VPS disk loss | Lose Layer-1 copies | AWS immutable DR required for final DR |
| Contabo provider loss | Same | AWS |
| Root compromise | Local wipe | Harden SSH/UFW/fail2ban · encryption at rest · AWS off-host |
| Credential leak | Storage read | Scoped keys · rotation · no Vercel backup-admin |
| Worker/app escape | Should not touch backup | OD-VPS-06 permissions |
| Partial backup claimed complete | False ARCH-05 readiness | Atomic rename + manifest gate |

---

## 23. Monitoring

Minimum (design):

- Last successful `backup_run_id` age vs RPO target (≤24h for new masters — OD-SA-07-09)
- Failed hash count
- Disk free % on `/srv`
- Staging backlog age
- Orphan coverage % (backed up / 32)

No public dashboards required in V1.

---

## 24. Audit evidence

For each COMPLETE object:

- Manifest row/JSONL line  
- Absolute backup path  
- SHA-256  
- size · content-type · source key  
- timestamps  
- verification_status  

Bucket existence / worker presence / Contabo snapshot alone ≠ backup evidence.

---

## 25. AWS handoff (OD-VPS-17 PROPOSED)

**Recommended architecture:**

```text
Supabase ──pull──► VPS (Layer-1 · verify SHA)
                      │
                      └──push──► AWS S3 Object Lock (immutable DR)
```

**Why VPS → AWS (not only Supabase → AWS independently):**

- Reuse already-verified bytes · lower Supabase egress  
- Single operational pipeline on hardened host  
- AWS still stores independent Object-Lock copy (off Contabo)

**Constraint:** AWS Object Lock plane remains **mandatory** for final DR (OD-VPS-03). VPS never substitutes OD-SA-07-04.

Optional later: direct Supabase → AWS as parallel path — separate GO.

---

## 26. Rollback

| Phase | Rollback |
|-------|----------|
| Hardening | restore prior sshd/UFW from recorded evidence (Owner GO) |
| Directory/user | remove only if empty / never contained prod masters without archive |
| Backup objects | stop writer · retain evidence · do not delete masters without Owner GO |
| Manifest | retain failed runs as FAILED |
| ARCH-05 | always remains blocked unless ladder complete |

---

## 27. No-delete guarantees

```text
Production Supabase Storage objects   = NOT DELETED by VPS backup plane
VPS backup objects                    = NOT deleted by E3 worker
Orphan GC                             = FORBIDDEN until ARCH-05 ladder + Owner allowlist
This Design Freeze                    = ZERO DELETE authority
```

---

## 28. Owner approval gates

| Gate | Required before |
|------|-----------------|
| OD-VPS-01…20 Owner GO | Design Freeze = COMPLETE / APPROVED |
| OD-SA-07-14 amendment (or OD-SA-07-14a) | Contabo authorized as Layer-1 target |
| Phase 1 hardening GO | SSH/UFW/fail2ban changes |
| Phase 2 principal/dir GO | user/mkdir/chmod |
| Phase 3–7 Implementation GO | worker + production copy |
| Phase 8 restore GO | restore drill |
| Phase 10 AWS GO | Object Lock plane (existing STORAGE-ARCH-07) |
| ARCH-05 Owner allowlist | any orphan DELETE |

---

## 29. Owner Decisions — PROPOSED (NOT CLOSED)

| ID | Topic | Approved value | Status |
|----|-------|----------------|--------|
| **OD-VPS-01** | Contabo additional role = VPS BACKUP PLANE / Layer-1 | **YES** (compute role unchanged) | **CLOSED / APPROVED** |
| **OD-VPS-02** | VPS sole/final DR | **NO** | **CLOSED / APPROVED** |
| **OD-VPS-03** | AWS S3 Object Lock remains required immutable DR | **YES** | **CLOSED / APPROVED** |
| **OD-VPS-04** | Backup dir outside `/opt/bitrymdym-e3-worker` | **YES** (`/srv/bitrymdym-backup`) | **CLOSED / APPROVED** |
| **OD-VPS-05** | Dedicated user `bitrymdym-backup` | **YES** | **CLOSED / APPROVED** |
| **OD-VPS-06** | E3/app user NO READ/WRITE/DELETE on backup dir | **YES** (no worker exception) | **CLOSED / APPROVED** |
| **OD-VPS-07** | Private · server-side · non-public · non-browsable | **YES** | **CLOSED / APPROVED** |
| **OD-VPS-08** | Per-object metadata set (SHA-256, size, type, keys, class, owner refs, timestamps) | **YES** | **CLOSED / APPROVED** |
| **OD-VPS-09** | Manifest mandatory | **YES** | **CLOSED / APPROVED** |
| **OD-VPS-10** | Atomic write (staging → hash → fsync → rename → manifest) | **YES** | **CLOSED / APPROVED** |
| **OD-VPS-11** | Idempotent identity `bucket+key+sha256` | **YES** | **CLOSED / APPROVED** |
| **OD-VPS-12** | Resume/retry required | **YES** | **CLOSED / APPROVED** |
| **OD-VPS-13** | Restore drill required for VERIFIED · isolated only | **YES** | **CLOSED / APPROVED** |
| **OD-VPS-14** | Retention table in §20 | **APPROVED as proposed** | **CLOSED / APPROVED** |
| **OD-VPS-15** | Scope: see §30 | **APPROVED** | **CLOSED / APPROVED** |
| **OD-VPS-16** | Class = WORKING/STAGING COPY | **YES** | **CLOSED / APPROVED** |
| **OD-VPS-17** | AWS feed = VPS → AWS (primary handoff) | **YES** | **CLOSED / APPROVED** |
| **OD-VPS-18** | Encryption at rest | **YES** (LUKS/fscrypt or equiv. at Implementation) | **CLOSED / APPROVED** |
| **OD-VPS-19** | Restrictive ownership/permissions | **YES** | **CLOSED / APPROVED** |
| **OD-VPS-20** | Security hardening before first prod backup | **YES** | **CLOSED / APPROVED** |

**Owner GO 2026-10-05:** OD-VPS-01…20 **APPROVED** · OD-SA-07-14a **APPROVED** · Phase 1 hardening **AUTHORIZED** · Phase 2+ **not** authorized by that GO.

---

## 30. Backup scope (OD-VPS-15 PROPOSED)

| Content | VPS Layer-1 | Notes |
|---------|-------------|-------|
| A. Living USER MASTER (`beat-audio`) | **YES** | Aligns OD-SA-07-14 |
| B. Platform MASTER | **YES** | Aligns OD-SA-07-14 |
| C. Orphan objects before ARCH-05 | **YES** | Required before GC ladder |
| D. `take-audio` | **NO** (default) | OD-SA-07-14 · TTL/ephemeral |
| E. `audio-artifacts` | **NO** (default) | regenerable · OD-SA-07 Mix adjacency |

Current inventory reference (metadata only): 43 objects · ~111.6 MB · 11 linked · 32 orphan · Storage COPY still **0/43**.

---

## 31. Implementation plan (NOT EXECUTED)

### PHASE 0 — Owner approval

| | |
|--|--|
| Input | This Design Freeze + OD-VPS-01…20 proposals |
| Output | Owner GO · decisions CLOSED · OD-SA-07-14 amendment recorded |
| Mutation | Docs only |
| Evidence | DECISION_LOG + freeze status flip |
| Rollback | Leave PROPOSED |
| Owner GO | **YES** |

### PHASE 1 — VPS security hardening

| | |
|--|--|
| Input | Phase 0 GO |
| Output | key-only SSH · PasswordAuth off · UFW on · fail2ban · recorded before/after |
| Mutation | **VPS config** |
| Evidence | `sshd -T` · `ufw status` · fail2ban status |
| Rollback | restore prior configs from evidence |
| Owner GO | **YES** |

### PHASE 2 — Dedicated principal + directory

| | |
|--|--|
| Input | Phase 1 PASS |
| Output | `bitrymdym-backup` · `/srv/bitrymdym-backup/{objects,manifests,staging,restore-drills,logs}` · modes |
| Mutation | **VPS users/dirs** |
| Evidence | `getent` · `namei -l` / `ls -la` |
| Rollback | remove empty dirs/user if unused |
| Owner GO | **YES** |

### Owner GO ladder (executed) vs freeze ladder (below)

Owner **PHASE 3** (2026-10-05 **PASS**) covered design + fixture SHA/manifest + metadata dry-run only — **no** VPS worker deploy, **no** systemd timer, **no** production byte COPY.  
Owner **PHASE 4** maps to freeze **PHASE 6** (controlled production canary) and requires a separate GO.

### PHASE 3 — Backup worker

| | |
|--|--|
| Input | Phase 2 · credentials · repo tooling under Implementation GO |
| Output | Worker runnable as `bitrymdym-backup` · dry capable |
| Mutation | Code deploy to VPS (not production Storage) |
| Evidence | version pin · unit file disabled until canary |
| Rollback | disable unit · remove binary |
| Owner GO | **YES** |
| 2026-10-05 | Design helpers in-repo **PASS** · **worker not deployed** (deferred) |

### PHASE 4 — Manifest + SHA-256

| | |
|--|--|
| Input | Worker |
| Output | JSONL writer + (optional) DB manifest apply under separate migration GO |
| Mutation | VPS files · maybe DB schema if authorized |
| Evidence | sample fixture manifest |
| Rollback | drop unapplied migration · keep fixtures |
| Owner GO | **YES** (DB apply separate) |
| 2026-10-05 | Fixture SHA + manifest schema **PASS** · DB manifest migration **NOT applied** |

### PHASE 5 — Dry-run

| | |
|--|--|
| Input | Fixture or non-prod object |
| Output | staging→rename→hash→manifest PASS without prod masters if possible |
| Mutation | VPS staging only |
| Evidence | logs + fixture paths |
| Rollback | purge staging |
| Owner GO | **YES** |
| 2026-10-05 | Metadata dry-run **PASS** (COPY 43 planned · objects written **0**) |

### PHASE 6 — Production canary

| | |
|--|--|
| Input | Owner-selected **1** living MASTER |
| Output | 1/43 COMPLETE · HASH_OK |
| Mutation | Storage **READ** + VPS **WRITE** |
| Evidence | manifest line + sha |
| Rollback | retain canary object · stop further copies |
| Owner GO | **YES** |

### PHASE 7 — Full current Storage backup

| | |
|--|--|
| Input | Canary PASS |
| Output | 43/43 COMPLETE (or documented skips) · orphans included |
| Mutation | Storage READ + VPS WRITE |
| Evidence | coverage report |
| Rollback | stop writer · keep COMPLETE set |
| Owner GO | **YES** |

### PHASE 8 — Restore drill

| | |
|--|--|
| Input | Sample COMPLETE set |
| Output | isolated restore · SHA PASS · `RESTORE_OK` |
| Mutation | VPS restore-drills only · **no** prod overwrite |
| Evidence | drill report |
| Rollback | purge drill dir |
| Owner GO | **YES** |

### PHASE 9 — Reconciliation

| | |
|--|--|
| Input | Phase 7–8 evidence |
| Output | SSOT update · ARCH-05 still NOT READY unless ladder complete |
| Mutation | Docs |
| Evidence | PROJECT_STATE / handoff |
| Rollback | n/a |
| Owner GO | recommended |

### PHASE 10 — AWS immutable copy

| | |
|--|--|
| Input | STORAGE-ARCH-07 Phase A unblocked (AWS account/creds) |
| Output | Object Lock COMPLIANCE proof · VPS→AWS copy · DR verify |
| Mutation | AWS + VPS read |
| Evidence | DeleteDenied · version ids · sha match |
| Rollback | stop AWS writer · retain VPS |
| Owner GO | **YES** (existing STORAGE-ARCH-07 gate) |

---

## 32. Encryption at rest (OD-VPS-18 PROPOSED — not configured)

Preferred options (pick at Implementation GO):

1. **LUKS** volume mounted at `/srv/bitrymdym-backup`  
2. **fscrypt** on directory tree  
3. Per-object encryption (age/openssl) — higher complexity  

Minimum: encrypted volume **or** equivalent · TLS in transit · keys not in git · not readable by `bitrymdym-e3`.

---

## 33. Explicit status (living)

```text
DESIGN FREEZE                        = COMPLETE / OWNER APPROVED
OD-VPS-01…20                         = CLOSED / APPROVED
OD-SA-07-14a                         = CLOSED / APPROVED
PHASE 1 VPS SECURITY HARDENING       = PASS (2026-10-05)
PHASE 2 PRINCIPAL + DIRECTORY        = PASS (2026-10-05)
PHASE 3+                             = NOT STARTED
STORAGE COPY                         = 0/43
ARCH-05                              = NOT READY
STORAGE-ARCH-07 AWS Phase A          = BLOCKED
Admin SSH path                       = ubuntu@ + key bitrymdym-e3-contabo + sudo
Root SSH                             = DISABLED (PermitRootLogin no)
Backup principal                     = bitrymdym-backup (uid 997 · nologin · locked · no sudo · no SSH)
Backup root                          = /srv/bitrymdym-backup (0700 · empty)
```

### 33.1 Phase 1 evidence (summary)

| Control | After |
|---------|-------|
| PasswordAuthentication | **no** |
| AuthenticationMethods | **publickey** |
| PermitRootLogin | **no** |
| UFW | **active** · deny in / allow out · **22/tcp only** |
| fail2ban | **active** · jail **sshd** |
| unattended-upgrades | **active** |
| E3 worker | **inactive/disabled** (unchanged) · `DEPLOYED_COMMIT=92496d4…` |

Config backup on host: `/root/bitrymdym-phase1-backup-20261005T030032Z`

### 33.2 Phase 2 evidence (summary)

| Item | Value |
|------|--------|
| User | `bitrymdym-backup` · uid **997** · gid **987** · shell `/usr/sbin/nologin` · locked (`passwd -S L`) |
| Groups | only `bitrymdym-backup` |
| Sudo | **not allowed** |
| SSH | no `~/.ssh` · nologin |
| Directory | `/srv/bitrymdym-backup/{objects,manifests,restore-drills,logs}` · owner/group backup · **0700** |
| Isolation | `bitrymdym-e3` DENIED · `ubuntu` (no sudo) DENIED · backup user R/W/D PASS |
| Contents | **0 files** · no production data |

---

**Phase 3+ requires a separate Owner GO.** Do not pull Storage / compute SHA / write manifests / install backup tools without that GO.
