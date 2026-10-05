# Changelog

Wszystkie istotne zmiany dokumentacji i (później) aplikacji.

Format: data, zakres, skrót.

---

## 2026-10-05 — DOCUMENTATION CONTINUITY RECONCILIATION

**Status:** DOCS ONLY · tip / production **`1c63080`** · NEXT = **P3 READ-ONLY AUDIT**
**SSOT:** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [PROJECT_STATE.md](./PROJECT_STATE.md)

- Ujednolicono CURRENT baseline: HEAD = origin/main = Production = `1c63080` · deploy `dpl_2YVDSYPXsmrmx9hxQiF9X6AgVRQP`
- POLISH-01 / P0 / P1 / P2 / BPM / ARCH-05 / ADMIN W0–W4 oznaczone jako CLOSED / VERIFIED w living docs
- Known waiver: `e3-7-f` / `EXPORT_WAV` · PRE-EXISTING / WAIVED
- NEXT GATE = P3 Anonymous → Account Claim · NOT STARTED · audit first
- Runtime / DB / Storage / migracje: **NONE**

## 2026-10-05 — POLISH-01 (+ residual hotfix) PRODUCTION VERIFIED

**Status:** **CLOSED / PRODUCTION VERIFIED** · verify **GREEN WITH NOTES**
**Feature:** `579acb3` · **Residual:** `1c63080` · Deploy: `dpl_2YVDSYPXsmrmx9hxQiF9X6AgVRQP`
**SSOT:** [POLISH-01_DESIGN_FREEZE.md](./audits/POLISH-01_DESIGN_FREEZE.md)

- OD-PL-01…06 LOCKED · UI PL + KEEP EN (Studio/Mix/Master/Premium/tiers/BPM/…)
- Residual: home `miejscu` · beat `nagrania` / `nagraj nagranie` · moderation `· Administrator`
- Waiver suite: `e3-7-f` EXPORT_WAV — not a POLISH regression

## 2026-10-05 — P2 Explicit Sample Replace PRODUCTION VERIFIED

**Status:** **CLOSED / PRODUCTION VERIFIED — GREEN** @ `943d81e`
**SSOT:** [P2_REPLACE_SAMPLE_IMPLEMENTATION.md](./audits/P2_REPLACE_SAMPLE_IMPLEMENTATION.md) · docs verify `fa7bfe3`

- Variant C · `replaces_take_id` · finalize swap · advisory lock · cross-beat + anonymous own replace

## 2026-10-05 — P1 Sample Policy Matrix PRODUCTION VERIFIED

**Status:** **CLOSED / PRODUCTION VERIFIED — GREEN** @ `5927e35`
**SSOT:** [P1_SAMPLE_POLICY_MATRIX.md](./audits/P1_SAMPLE_POLICY_MATRIX.md) · docs verify `c38e8d2`

- `getSamplePolicy` · `sample_policy_settings` · Bronze/Silver/Gold defaults · Anonymous ≠ Free

## 2026-10-05 — P0 PLATFORM master download deny PRODUCTION VERIFIED

**Status:** **CLOSED / PRODUCTION VERIFIED — GREEN** @ `fdfff71`
**SSOT:** [P0_PLATFORM_MASTER_DOWNLOAD_DENY.md](./audits/P0_PLATFORM_MASTER_DOWNLOAD_DENY.md) · docs verify `23577a3`

- User-facing PLATFORM DOWNLOAD DENY · PLAYBACK ALLOW · ADMIN/OPS export separate · no generic `canDownload`

## 2026-10-05 — ARCH-05 POST-DELETE RECONCILIATION (CLOSED / VERIFIED)

**Status:** CLOSEOUT **PASS** · live Storage **11 / 8 / 3 / 0 / 0** · historical backup **43/43 RETAINED**
**SSOT:** [ARCH_05_POST_DELETE_RECONCILIATION.md](./audits/ARCH_05_POST_DELETE_RECONCILIATION.md)

- Read-only re-inventory: USER **8** · PLATFORM **3** · ORPHAN **0** · UNKNOWN **0** · total **11**
- VPS Layer-1 **43/43** · Local Layer-2 SHA/manifest/restore **43/43** · no delete sync
- ARCH-05 remains **CLOSED / VERIFIED** · no new Storage mutation · no deploy
- Next: Owner Review · do not re-open ARCH-05 without new Owner GO

## 2026-10-05 — ARCH-05 DELETE EXECUTED (CLOSED / VERIFIED)

**Status:** DELETE **PASS** · **32/32** · Storage **43 → 11** · unexpected deletes **0**
**SSOT:** [ARCH_05_DELETE_EXECUTION.md](./audits/ARCH_05_DELETE_EXECUTION.md) · [evidence](./audits/ARCH_05_DELETE_EXECUTION_EVIDENCE.json)

- Owner GO issued for exact allowlist only · version-bound `remove([{path, versionId}])`
- Pre: **43 / 8 / 3 / 32 / 0** · revalidation **32/32 PASS** · Local/VPS **43/43**
- Post: **11 / 8 / 3 / 0 / 0** · DB-linked **11** · Auth/Profiles **UNCHANGED**
- Local backup + VPS Layer-1: **43/43 RETAINED** (no delete propagation)
- Ladder: SAFE → OWNER APPROVED → DELETE EXECUTED → POST-DELETE VERIFIED
- Commit/push/deploy: **NO**

## 2026-10-05 — ARCH-05 FINAL SAFE-TO-DELETE READINESS (READY FOR OWNER DELETE GO)

**Status:** AUDIT **PASS** · SAFE **32/32** · DELETE **0** · OWNER DELETE GO **NOT ISSUED**
**SSOT:** [ARCH_05_FINAL_SAFE_TO_DELETE_READINESS.md](./audits/ARCH_05_FINAL_SAFE_TO_DELETE_READINESS.md) · [allowlist](./audits/ARCH_05_DELETE_ALLOWLIST.json)

- Fresh inventory **43 / 8 / 3 / 32 / 0** · no drift
- Each orphan: auth/profile absent · DB/take/artifact refs 0 · not platform · no quarantine/MIGRATE · FAR-01 retain **NO**
- Local backup + restore evidence **32/32** · `version_id` bound in allowlist
- Ladder: **SAFE** · not OWNER APPROVED · not DELETED
- Next: Owner REVIEW → optional **OWNER GO — ARCH-05 DELETE**

## 2026-10-05 — LOCAL WINDOWS BACKUP RESTORE DRILL (PASS)

**Status:** PHASE LOCAL-BACKUP-RESTORE-DRILL **PASS**
**SSOT:** [STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md) · [evidence](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL_EVIDENCE.json)

- LOCAL → LOCAL ISOLATED restore · run `local-restore-20261005T040831Z-76ca3678`
- Source backup `local-layer2-full-20261005T040146Z-42d6212b` · **43/43** SHA+SIZE+WAV+ffprobe **PASS**
- Source `objects/` integrity **PASS** · Supabase/VPS/AWS **NO MUTATION**
- Ladder: **RESTORE VERIFIED** · ARCH-05 **NOT READY** · orphans **NOT SAFE FOR DELETE**
- Next: Owner REVIEW (no ARCH-05 without separate GO)

## 2026-10-05 — LOCAL WINDOWS BACKUP IMPLEMENTATION (PASS)

**Status:** PHASE LOCAL-BACKUP-IMPLEMENTATION **PASS**
**SSOT:** [STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION.md](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION.md) · [evidence](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION_EVIDENCE.json)

- Windows PULL from VPS Layer-1 → `C:\BitRymDym-Backup\` · run `local-layer2-full-20261005T040146Z-42d6212b`
- **43/43** COPIED · SHA VERIFIED · MANIFEST VERIFIED · bytes **111574892**
- Restore drill **not** executed (**0/43**) · ARCH-05 **NOT READY** · BitLocker remains **SECURITY FINDING**
- Supabase/VPS: no mutation · no delete propagation
- Next: Owner REVIEW → **PHASE LOCAL-BACKUP-RESTORE-DRILL**

## 2026-10-05 — LOCAL WINDOWS BACKUP PLANE DESIGN FREEZE (COMPLETE)

**Status:** OD-VPS-LOCAL-01…12 **CLOSED / APPROVED** · Design Freeze **COMPLETE** · Implementation **NOT STARTED**
**SSOT:** [STORAGE_ARCH_07_LOCAL_BACKUP_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_DESIGN_FREEZE.md) · [audit](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_AUDIT.md)

- Local Windows = Layer-2 independent copy · VPS remains Layer-1 · PULL-only · append/retain · no delete propagation
- Path freeze: `C:\BitRymDym-Backup\` (collision check ABSENT · directory **not** created)
- SHA-256 + manifest + isolated restore drill mandatory · AWS **DEFERRED** · ARCH-05 **NOT READY**
- BitLocker remains **SECURITY FINDING** until elevated verification
- Next gate: Owner GO — **PHASE LOCAL-BACKUP-IMPLEMENTATION** (no auto-start)

## 2026-10-05 — VPS BACKUP PLANE PHASE 6 FULL VPS BACKUP (PASS)

**Status:** Owner GO **APPROVED** · Phase 6 **PASS** · **VPS Layer-1 43/43 BACKED UP** · restore still **3/43** · Phase 7 **NOT STARTED**
**SSOT:** [STORAGE_ARCH_07_IMPLEMENTATION.md](./audits/STORAGE_ARCH_07_IMPLEMENTATION.md) · [evidence](./audits/STORAGE_ARCH_07_PHASE6_FULL_BACKUP_EVIDENCE.json)

- Fresh inventory unchanged: 43 / USER 8 / PLATFORM 3 / ORPHAN 32 · canary 3/3 immutable
- New exact allowlist COPY: **40** (USER 7 + PLATFORM 2 + ORPHAN 31) · SHA+size VERIFIED ×40
- VPS objects **43** · manifests **43** · SHA reconcile **43/43** · production Storage **43** · deletes **0**
- Restore verified remains **3/43** · AWS **NOT CONFIGURED** · ARCH-05 **NOT READY**
- Next gate: Owner GO for **PHASE 7 — RESTORE VERIFICATION EXPANSION** or **AWS IMMUTABLE DR**

## 2026-10-05 — VPS BACKUP PLANE PHASE 5 CANARY RESTORE DRILL (PASS)

**Status:** Owner GO **APPROVED** · Phase 5 **PASS / CANARY RESTORE VERIFIED** · Phase 6 later **PASS** (see above)
**SSOT:** [STORAGE_ARCH_07_IMPLEMENTATION.md](./audits/STORAGE_ARCH_07_IMPLEMENTATION.md) · [evidence](./audits/STORAGE_ARCH_07_PHASE5_RESTORE_EVIDENCE.json)

- Restore source = VPS Layer-1 backup only (Supabase **not** used as restore source)
- USER / PLATFORM / ORPHAN: SHA+size+WAV header+ffprobe **PASS** ×3
- Isolated dest: `/srv/bitrymdym-backup/restore-drills/sa07-phase5-restore-20261005T033401Z-5560b4f7/`
- Backup objects unchanged · production Storage still **43** · deletes **0** · AWS **0**
- Does **not** mean ARCH-05 SAFE / orphan delete / full DR

## 2026-10-05 — VPS BACKUP PLANE PHASE 4 CONTROLLED CANARY (PASS)

**Status:** Owner GO **APPROVED** · Phase 4 **PASS / CANARY BACKED UP** · Phase 5 later **PASS** (see above)
**SSOT:** [STORAGE_ARCH_07_IMPLEMENTATION.md](./audits/STORAGE_ARCH_07_IMPLEMENTATION.md) · [evidence](./audits/STORAGE_ARCH_07_PHASE4_CANARY_EVIDENCE.json)

- Exact allowlist COPY: 1 USER + 1 PLATFORM + 1 ORPHAN · SHA+size VERIFIED ×3
- VPS `/srv/bitrymdym-backup/objects` = **3** files · owner `bitrymdym-backup` · mode 0600
- Production `beat-audio` still **43** · Storage deletes **0** · DB/Auth/AWS **0**
- Orphan status: **BACKED UP / NOT SAFE FOR DELETE** · ARCH-05 still **NOT READY**

## 2026-10-05 — VPS BACKUP PLANE PHASE 3 TRANSFER DESIGN + DRY-RUN (PASS)

**Status:** Owner GO **APPROVED** · Phase 3 **PASS / DRY-RUN VERIFIED** · Phase 4 later **PASS** (see above)
**SSOT:** [STORAGE_ARCH_07_IMPLEMENTATION.md](./audits/STORAGE_ARCH_07_IMPLEMENTATION.md) · [VPS freeze](./audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md)

- Fresh `beat-audio` inventory: TOTAL 43 · USER 8 · PLATFORM 3 · ORPHAN 32 · UNKNOWN 0
- Reused `backup-manifest` helpers: SHA-256 · path fail-closed · idempotency · atomic write · dry-run planner
- Fixture SHA match + mismatch + manifest schema tests **PASS** (`backup-manifest.test.ts`)
- Metadata dry-run: COPY 43 · SKIP 0 · UPDATE 0 · BLOCKED 0 (at time of Phase 3 · VPS objects were 0)
- No Storage/DB/AWS mutations · no secrets logged · ARCH-05 still **NOT READY**

## 2026-10-05 — VPS BACKUP PLANE PHASE 2 PRINCIPAL + DIRECTORY (PASS)

**Status:** Owner GO **APPROVED** · Phase 2 **PASS** · Phase 3 later **PASS** (see above)
**SSOT:** [STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md)

- User `bitrymdym-backup` (uid 997) · nologin · locked · no sudo · no SSH · group-only self
- `/srv/bitrymdym-backup/{objects,manifests,restore-drills,logs}` · owner backup · **0700** · **0 files**
- Isolation PASS: `bitrymdym-e3` DENIED · `ubuntu` (no sudo) DENIED · backup user R/W/D PASS
- E3 worker unchanged · no Storage pull · no backup tools installed · no AWS · no Phase 3

---

## 2026-10-05 — VPS BACKUP PLANE PHASE 1 SECURITY HARDENING (PASS)

**Status:** Owner GO **APPROVED** · Phase 1 **PASS** · Phase 2 later **PASS** (see above)
**SSOT:** [STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md)

- OD-VPS-01…20 **CLOSED / APPROVED** · OD-SA-07-14a **CLOSED / APPROVED**
- Contabo `161.97.72.197`: SSH key-only · PasswordAuthentication **no** · PermitRootLogin **no** (admin = `ubuntu` + sudo)
- UFW **active** · deny in / allow out · inbound **22/tcp only**
- fail2ban **active** · jail **sshd** (only package installed this phase)
- E3 worker unchanged: inactive/disabled · `DEPLOYED_COMMIT=92496d4…`

---

## 2026-10-05 — VPS BACKUP PLANE DESIGN FREEZE (DRAFT / PROPOSED)

**Status:** Design draft **COMPLETE** · OD-VPS-01…20 later **APPROVED** (see Phase 1 entry) · historical draft note
**SSOT:** [STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md)

- Contabo feasibility audit result **B — YES WITH CONDITIONS** recorded as design input only
- Contabo EXTERNAL COMPUTE role **unchanged** · Contabo ≠ sole/final DR · AWS Object Lock remains required immutable DR
- Proposed Layer-1 path: Supabase → VPS (`/srv/bitrymdym-backup`) → SHA-256/manifest/restore drill → later AWS
- OD-SA-07-14 Contabo Layer-1 exception later approved as **OD-SA-07-14a**
- ARCH-05 remains **NOT READY** · Storage COPY **0/43**

---

## 2026-10-05 — HISTORICAL LOCAL DB BACKUP RECONCILIATION (DOCS-ONLY)

**Status:** Docs SSOT reconciled · **no** AWS / Storage / DB / restore / commit / push
**SSOT:** [HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md](./audits/HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md)

- Historical local PostgreSQL CUSTOM dump **FOUND** at `C:\BitRymDym-recovery\bitrymdym-production-pre-account-profile-01.dump`
- Size **532829** B · TOC **835** · pg_dump **17.11** ← PostgreSQL **17.6** · archive **2026-10-03 19:28:34**
- Provenance **LIKELY PRODUCTION / MEDIUM** · project_ref **NOT PROVEN** from PGDMP
- Dump includes DB/Auth + `storage.*` **metadata** · **excludes** Storage object bytes
- Restore **NOT VERIFIED** · **do not** assign `bdpygdvfgbggermvqtys` to this dump
- Canonical wording: BitRymDym has a historical local DB recovery artifact, but no independently verified Supabase Storage object backup
- STORAGE-ARCH-07 Phase A remains **BLOCKED** · Storage COPY **0/43** · ARCH-05 remains **NOT READY** · 32 orphans unchanged (ZERO DELETE)

---

## 2026-10-04 — STORAGE-ARCH-07 IMPLEMENTATION GO (PHASE A STOP)

**Status:** Implementation GO **ISSUED** · AWS S3 `eu-central-1` selected · **PHASE A STOP / BLOCKED**
**SSOT:** [STORAGE_ARCH_07_IMPLEMENTATION.md](./audits/STORAGE_ARCH_07_IMPLEMENTATION.md)

- Tooling + manifest migration **authored locally** (not applied to production DB)
- Unit tests PASS (13) · fixture restore drill PASS · Phase A AWS lock proof **FAIL / STOP**
- aws CLI missing · AWS credentials unset · dedicated backup account **not provisioned**
- Production Storage COPY **NOT EXECUTED** · ARCH-05 **NOT READY / BLOCKED** · 32 orphans **not deleted**
- Commit/push deferred: production verification cannot PASS without Object Lock evidence
- Note (2026-10-05): historical local **DB** dump later found — still **≠** Storage object backup

---

## 2026-10-04 — STORAGE-ARCH-07 DESIGN FREEZE (OWNER DECISIONS CLOSED)

**Status:** **DESIGN FREEZE COMPLETE** · Owner Decisions **OD-SA-07-01…16 CLOSED** · **IMPLEMENTATION NOT STARTED**
**SSOT:** [STORAGE_ARCH_07_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_07_DESIGN_FREEZE.md) · [DECISION_LOG.md](./decisions/DECISION_LOG.md)

- PRIMARY remains Supabase Storage · BACKUP plane design = external S3-compatible + Versioning + Object Lock/WORM (Compliance preferred) + separate account + SHA-256 + required manifest
- Contabo / DB PITR / W4 JSON ≠ Storage backup (unchanged SSOT)
- GC ladder + SAFE FOR GC contract frozen · ARCH-05 remains **BLOCKED**
- Living orphans **32** = NOT SAFE / NOT BACKED UP / NOT RESTORE VERIFIED / NOT OWNER APPROVED / NOT DELETED
- Naming adjacency documented: **OD-SA-07** (Mix no-backup default) ≠ **OD-SA-07-01…16**
- No Storage/DB mutation · no Implementation GO · no commit/push required by this freeze session unless separately authorized

---

## 2026-10-04 — FAR-01 FINAL SOAK AUDIT (DOCS RECONCILIATION)

**Status:** Final soak audit **COMPLETE** · docs living SSOT reconciled · **no Storage/DB/Auth/app mutation**
**SSOT:** [FAR_01_CURRENT_STATE.md](./audits/FAR_01_CURRENT_STATE.md)

- Soak clock **elapsed**; soak integrity **FAILED / CONTAMINATED**
- Original FAR-01 retain-set (**67**) **already gone outside FAR-01 retirement flow** (USER-CLEANUP-01 collateral) — **not** formal FAR-01 retirement
- **FAR-01 RETIREMENT = NOT EXECUTED**
- Living Storage: USER masters **8** · platform **3** · orphan/historical/delete-residue **32** · retained **0** · quarantine **0** · MIGRATE **0** · beat-audio total **43**
- Current **32** orphans = candidate scope for separate **ARCH-04/05** orphan-GC audit — **not** approved for deletion · **not** automatic FAR-01 retirement candidates
- Backup evidence **NOT VERIFIED** · continuous soak telemetry **NOT VERIFIED**
- Production app remains `ddcee65` (docs tip may advance independently)

---

## 2026-10-04 — ADMIN USER DELETE W4 (CLOSED / PRODUCTION VERIFIED)

**Status:** **CLOSED / PRODUCTION VERIFIED**
**SSOT:** [ADMIN_USER_DELETE_DESIGN_FREEZE.md](./decisions/ADMIN_USER_DELETE_DESIGN_FREEZE.md)
**Implementation / production app:** `ddcee65` · `dpl_C1y6toEPYacQmsxv5Jsa8Dj5KM38` · READY / PROMOTED
**DB:** `20261004174202` / `admin_user_management_w4_delete` (local file `20261004190900` — timestamp drift)

- Shared `executeAccountProfile01Deletion` + admin `adminDeleteUserAction` + audit `USER_ACCOUNT_DELETE`
- Delete E2E: disposable USER fixtures (#85 lifecycle / #86 email) via `/admin/users`
- **EMAIL E2E PASS** — Resend production env · sender domain `bitrymdym.pl` · real disposable inbox · subject/reason/Polish body verified · no UUID/user_number/secrets
- Remaining P2 (documented, non-blocking): last-admin TOCTOU; no durable idempotency; live last-admin concurrency NOT VERIFIED; published USER beat retain NOT LIVE-DATA VERIFIED; migration timestamp drift

---

## 2026-10-04 — ADMIN USER MANAGEMENT W3 (AUDIT HISTORY UI) — CLOSED / PRODUCTION VERIFIED

**Status:** **CLOSED / PRODUCTION VERIFIED**
**App SHA:** `237a86f` · deployment `dpl_DjmSXuv7UbB2jYpfidAuXKLWWaQR` · READY / PROMOTED
**DB tip:** `20261004144223` · **W3 migration NONE** · DB **UNCHANGED** by W3
**SSOT:** [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](./decisions/ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md) · [W3 closeout](./audits/ADMIN_USER_MANAGEMENT_W3_CLOSEOUT.md)

- `/admin/users` — read-only Historia zmian
- AuthZ: ADMIN ∧ `audit_log.view` (MODERATOR/USER DENY)
- SELECT `admin_audit_events` via `createSupabaseAdminClient()` — no read RPC, no authenticated SELECT policy
- Filters: `auditAction` + `auditUser` · page size 25 · `created_at DESC, id DESC`
- Production: 49 audit rows · deleted-target snapshots · pagination/filters verified · P0/P1 = 0
- W2 findings preserved (last-admin concurrency, migration timestamp drift, `user_number` holes, retained audits)
- W4 Admin Delete: see [ADMIN_USER_DELETE_DESIGN_FREEZE.md](./decisions/ADMIN_USER_DELETE_DESIGN_FREEZE.md) (**PENDING OWNER GO**)

---

## 2026-10-04 — ADMIN USER MANAGEMENT W2 (MUTATIONS + AUDIT WRITE)

**Status:** **IMPLEMENTED** (repository) · **PRODUCTION NOT DEPLOYED** · production DB **UNCHANGED**
**SSOT:** [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](./decisions/ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md)

- `/admin/users` Zarządzaj → server action → `admin_apply_user_management`
- `admin_audit_events` (ON DELETE SET NULL) · atomic mutation+audit
- Self-demotion DENY · last-admin advisory lock · Premium `manual_admin`
- W3 history UI **NOT STARTED** · migration **not applied** to production

---

## 2026-10-04 — ADMIN USER MANAGEMENT W1 (READ-ONLY LIST)

**Status:** **IMPLEMENTED** · **NOT production-deployed**
**SSOT:** [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](./decisions/ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md)

- `/admin/users` — ADMIN + `users.view`/`users.edit`
- Search: ksywka / e-mail / `user_number`
- Filters: Premium · role · rank (resolver SSOT)
- No mutations · no `admin_audit_events` migration · W2 not started

---

## 2026-10-04 — ADMIN USER MANAGEMENT W0 (OWNER DECISIONS LOCKED)

**Status:** **W0 CLOSED** · feature **NOT IMPLEMENTED** · **NOT committed / NOT pushed / NOT deployed**
**SSOT:** [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](./decisions/ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md) · [DECISION_LOG.md](./decisions/DECISION_LOG.md)

```text
OD-ADMIN-01 = YES
OD-ADMIN-02 = NO
OD-ADMIN-03 = NO
OD-ADMIN-04 = OPTIONAL EXPIRATION
OD-ADMIN-05 = YES
OD-ADMIN-06 = YES
OD-ADMIN-07 = YES / W3
```

Next: W1 read-only `/admin/users` requires separate Owner GO.

---

## 2026-10-04 — USER-FACING POLISH LOCALIZATION (CLOSED / PRODUCTION VERIFIED GREEN)

**Status:** **CLOSED** · **PRODUCTION VERIFIED GREEN**
**Final app SHA:** `ffe723b` · deployment `dpl_FkuQKRm6JE6gNqZkCopE4UmvUviM`
**Closeout SSOT:** [USER_FACING_POLISH_LOCALIZATION_IMPLEMENTATION.md](./audits/USER_FACING_POLISH_LOCALIZATION_IMPLEMENTATION.md)
**Email templates:** [USER_FACING_POLISH_LOCALIZATION_EMAIL_TEMPLATES.md](./audits/USER_FACING_POLISH_LOCALIZATION_EMAIL_TEMPLATES.md)

### Delivery

- App localization @ `4ebd1d3` · P2 chrome cleanup @ `ffe723b`
- Production UX verification **PASS** · P0/P1/P2 = **0**
- P2 CLOSED: `Workspace` → `Studio` · `Raw` → `Surowy`
- DB / Storage unchanged · Auth templates unchanged on final deploy gate
- Supabase Auth email inbox E2E = **BLOCKED — NO INBOX ACCESS** (evidence limitation)

---

## 2026-10-04 — P2 POLISH CHROME CLEANUP (Workspace · Raw)

**Status:** **SHIPPED** · production @ `ffe723b` / `dpl_FkuQKRm6JE6gNqZkCopE4UmvUviM`
**Baseline:** `4ebd1d3` · USER-FACING POLISH LOCALIZATION

### Changes

- `/` home studio card chrome: `Workspace` → `Studio` (reuse existing section label)
- `/beats` catalog mood filter: remove English `Raw`; reuse existing Polish mood `Surowy` in UI presentation taxonomy (`demo-beats` only — no DB/API contract change)

---

## 2026-10-03 — ACCOUNT / PROFILE-01 (BLOCKER FIX CYCLE · AWAITING OWNER RE-REVIEW)

**Status:** Blocker fixes in working tree · **NOT committed / NOT pushed / NOT production-DB-applied / NOT deployed**
**Baseline:** `0ca0115` · USER-ID-01 PRODUCTION VERIFIED — GREEN

### Blocker fixes

- **Recovery:** PKCE (`flow=recovery`) + OTP (`type=recovery`) keep session → `/auth/reset-password`; signup confirm still signs out
- **Delete/audio:** orchestrator nullifies `created_by` before anonymize/Auth delete; migration updates audio trigger for controlled retained/nullify states without opening USER privilege

### Prior implement scope (still in tree)

- Mandatory ksywka · profile edit · change password · forgot/reset · delete orchestrator
- OTD-01 C / OTD-02 A / OTD-03 A / OTD-04 · USER-ID-01 untouched

---


## 2026-10-03 — USER-CLEANUP-01 + USER-ID-01 (IMPLEMENTED · OWNER VERIFICATION PENDING)

**Status:** Production DB mutated · app/docs in working tree · **NOT committed / NOT pushed / NOT app-deployed**

### USER-CLEANUP-01

- Deleted exactly **93** allowlisted fixture users; KEEP Dawid + Tajski
- `auth.users` / `profiles` = **2**; platform beats = **3**; Dawid baseline intact; anon take-audio = 12; orphan-31 untouched
- Evidence: [USER_CLEANUP_01_PREDELETE_SNAPSHOT.md](./audits/USER_CLEANUP_01_PREDELETE_SNAPSHOT.md) · [USER_CLEANUP_01_POSTDELETE_EVIDENCE.md](./audits/USER_CLEANUP_01_POSTDELETE_EVIDENCE.md)

### USER-ID-01

- Remote migration tip: `20261003110802` / `user_id_01_stable_user_number`
- Hardening migration (repo, **pending apply**): `20261003123000` — authenticated DENY any `user_number` UPDATE incl. NULL→value
- App: `PROTECTED_PROFILE_FIELDS` includes `user_number`
- `profiles.user_number` BIGINT NULL + `user_number_seq` + immutability trigger
- Dawid = **1** · Tajski = **NULL** · next signup = **2**
- Session/account expose own number; public DTOs never; ADMIN can see foreign numbers; MODERATOR cannot
- SSOT: [AUTHORIZATION.md](./architecture/AUTHORIZATION.md#user-id-01--stable-user-number) · [USER_ID_01_EVIDENCE.md](./audits/USER_ID_01_EVIDENCE.md)

---

## 2026-10-03 — FAR-01 OPERATOR TOOLING + DEF-01 + SOAK ACTIVE (DOCS RECONCILIATION)

**Status:** Repository / Production app tip `e03f3be` · deployment `6823806375` · FAR-01 campaign **SOAK ACTIVE** · FAR-01 **NOT CLOSED**

### FAR-01 operator tooling (Commit 1 — not a UI release)

- Commit: `e03f3be` — `feat(far01): add production backfill operator tooling`
- R1 role `far01_dryrun_readonly` · LIVE role `far01_live_mutator` (prod applied; repo filenames production-aligned)
- Production dry-run · credential gates · canary **N=5 PASS** · fleet **N=62 PASS**
- Soak **ACTIVE**: start `2026-10-03T04:40:56.645Z` · end `2026-10-04T04:40:56.645Z` · interim **PASS** · no drift
- Inventory (living): legacy1 · canonical77 · platform3 · retained67 · orphans30 · orphan Storage97 · quarantine1 · MIGRATE=0
- Retirement / cleanup / orphan deletion: **NOT EXECUTED**
- Living status: [FAR_01_CURRENT_STATE.md](./audits/FAR_01_CURRENT_STATE.md)

### DEF-01

- **CLOSED / PRODUCTION VERIFIED** @ `fbc696f`
- Remote migration `20261003051539` / `def01_e3_definer_execute_revoke`
- Four E3 DEFINER trigger functions: anon/authenticated EXECUTE revoked
- ACTIVE P0 / P1: **NONE VERIFIED**
- HIBP: **DEFERRED / ACCEPTED RISK** (not solved)

### Documentation

- Living SSOT reconciled: FINAL_COLD_START · MASTER_HANDOFF · PROJECT_STATE · architecture index · this CHANGELOG
- Contabo documented as **EXTERNAL COMPUTE** (STOPPED/DISABLED) · Supabase Storage = durable media SSOT

---

## 2026-10-02 — FAR-01 / STORAGE-ARCH-02-KEY — PHASE 1 DR-A (SHIPPED / PRODUCTION VERIFIED)

**Status:** **SHIPPED** · **PRODUCTION VERIFIED — GREEN WITH EVIDENCE LIMITATIONS** · app `f514a51` · deployment `6817346937` · Vercel `dpl_HuRoZ9MQ7VM5jYmeJ19YJsoasM7h`

- Phase 1 DR-A: controlled dual-accept (canonical MASTER **or** deterministic legacy twin from authorized DB identities)
- Shared helper: `isAuthorizedUserBeatObjectKeyRepresentation` · wired through `assertUserBeatObjectKeyBinding` / `assertUserAssetBinding`
- Canonical WRITE SSOT unchanged (`buildUserBeatAudioObjectKey`) · dual-write **NO** · DR-B **DEFERRED**
- Live test fixtures stop seeding new legacy USER beat keys (OD-KEY-06)
- Exact product commit: `feat(storage): add FAR-01 DR-A dual-read` (8 files)
- Verify PASS: Production SHA · Access Gate signed URL for existing legacy PUBLISHED MASTER · platform canonical playback · no dual-write · no backfill · orphans untouched (30) · regression
- Evidence limitations: DR-A binding/publish ACCEPT live · USER canonical playback · cross-owner live · arbitrary legacy live — **NOT VERIFIED** / **PARTIAL** (safe mutation required); unit contract **14/14 PASS**
- Inventory unchanged: **68** legacy PUBLISHED USER · **2** canonical USER DRAFT · **3** platform — **not migrated**
- **Backfill / retirement = NOT STARTED** · next gate = PHASE 0 SOAK / BACKFILL READINESS AUDIT (separate Owner GO)
- Closeout: [FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md](./audits/FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md)

---

## 2026-10-02 — POLISH UX — MIX / MASTER / RECORDING / PLAYBACK (CLOSED / PRODUCTION VERIFIED)

**Status:** **CLOSED** · **PRODUCTION VERIFIED — PASS WITH EVIDENCE LIMITATIONS** · app `0afa29b` · deployment `6815846706` · Vercel `dpl_9EDrc78ompk8B2QZk6tDwQurntus`

- Polish UX: Mix · Master · Recording · Playback · export/status labels · a11y strings · take→nagranie (in-scope)
- KEEP: MIX · MASTER · Premium · Pro · EQ · LUFS · dB · dBFS · MP3 · WAV · REC
- Exact product commit: `feat(ux): localize mix master recording ui` (9 files)
- Verify PASS: Production SHA · Mix · Master · Recording · Playback · 390px · 1440px · runtime smoke · no observed functional regression
- Evidence limitations: REC Stop during REC · EN `json.error` passthrough · Premium metering — **NOT VERIFIED**
- Residual (OUT OF SCOPE): F-UX-01…03 `próba` copy outside 9-file release · F-UX-04 hardening candidate
- Security / Auth / RLS / DB / Storage / audio engine / API / ENV / Infrastructure **unchanged**
- Prior Wave A Account / Beats @ `2c4200b` remains CLOSED (parent Prod tip)
- Closeout: [POLISH_UX_PRODUCTION_CLOSEOUT.md](./audits/POLISH_UX_PRODUCTION_CLOSEOUT.md)

---

## 2026-10-02 — WAVE A — ACCOUNT / BEATS VISUAL CLOSURE (CLOSED / PRODUCTION VERIFIED)

**Status:** **CLOSED** · **PRODUCTION VERIFIED — GREEN** · app `2c4200b` · deployment `6810556404` · Vercel `dpl_9FdJrwvxGdwafGUTbzpKDzeds9PE`

- `/account/beats`: AppShell studio · PageFrame · SectionLabel · BRD tokens · PL copy · mobile-first
- Access: `requireRole(["USER"])` removed → `requireUser()` (ADMIN ALLOW · own beats only)
- Label: `MASTER READY` → `audio gotowe`
- Keep: `listOwnUserBeats` · `UserBeatActions` · `BeatGrantsPanel` · owner_id scoping
- Exact file: `src/app/account/beats/page.tsx`
- Verify PASS: Production SHA · Anonymous · ADMIN route · ADMIN owner scoping · Mobile 390 · Desktop 1440 · `/account` · `/account/takes` · runtime
- Explicit NOT VERIFIED: USER authenticated path · live cross-owner isolation (second account unavailable)
- Security / Auth architecture / RLS / DB / Storage / audio / Recording / E3 **unchanged**
- Prior Wave B Mix presentation @ `812a9d4` remains PRODUCTION VERIFIED (parent tip)
- Closeout: [A_ACCOUNT_BEATS_PRODUCTION_CLOSEOUT.md](./audits/A_ACCOUNT_BEATS_PRODUCTION_CLOSEOUT.md)

---

## 2026-10-02 — FALA 1B — ACCOUNT + PANEL ADMINISTRACYJNY (CLOSED / PRODUCTION VERIFIED)

**Status:** **CLOSED** · **PRODUCTION VERIFIED — GREEN** · app `42369c0` · deployment `6802739724` · Vercel `dpl_7hbfYd1wD6QGAbV6vLqLCXusjx7X`

- Account: `/account` BRD studio „Twoje studio” · debug dump email/role/permissions removed from UI · decorative Waveform · `listOwnTakes` read-only
- Account Takes: `/account/takes` BRD shell · OwnTakesList behavior unchanged
- Admin: `/admin` → **Panel Administracyjny** → **Pulpit** (no redirect hub) · chrome + nav (Pulpit / Bity / Moderacja / Nowy bit / Katalog)
- Admin polish: `/admin/beats` · `/admin/moderation` presentation / PL labels
- Shared: `src/lib/ui/labels.ts` (presentation-only)
- Security / Auth / RLS / audio / Recording / D02 **unchanged**
- Prior Fala 1A public visual foundation @ `fdf74f9` remains PRODUCTION VERIFIED (parent baseline)
- Deferred: full `/account/beats` redesign · Mix Panel · dead BeatListRow/BrdSymbol · Geist fonts · deep admin expansion
- Closeout: [FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md](./audits/FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md)

---

## 2026-10-02 — FALA 3.5.1 — RECORDING EXPERIENCE + DUAL AUDIO TIMELINE (CLOSED)

**Status:** **CLOSED** · Owner verification **PRELIMINARY PASS** · Production **NOT DEPLOYED**

- Live mic waveform + Input Monitor · BIT waveform during REC · shared REC playhead
- BRD Take Preview (BIT + TAKE dual rail · play/pause/seek) · no native `<audio controls>` in take UI
- Regression fix: BIT rail visibility (`rgba` rest bars · studio height)
- Closeout: [FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md](./audits/FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md)
- Note: Owner QA wstępny; pełne production verification = osobny krok po deployu
- Fala 4 **NOT STARTED**

---

## 2026-10-01 — FINAL COLD START HANDOFF PACK (DOCS-ONLY)

**Status:** Cold-start pack **READY** · docs tip baseline `82e0194` · Production app `6dfd201` **UNCHANGED** · STORAGE-ARCH-02 **NOT STARTED**

- New entry: [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md)
- Living SSOT entry points updated (PROJECT_STATE · MASTER_HANDOFF · docs README · architecture README)
- Docs tip corrected to `82e0194` (`a8e9356` kept as historical reference)
- Documented known DOCUMENTATION/IMPLEMENTATION DRIFT notes for new agents
- No code/DB/Storage/env/worker/deploy mutations

---

## 2026-10-01 — STORAGE-ARCH-01 — DESIGN FREEZE LOCKED + LIVING SSOT RECONCILIATION

**Status:** **STORAGE-ARCH-01 = LOCKED** · Final Architecture Review **PASS WITH FINDINGS** · Owner Review **PASS** · Implementation **NOT STARTED** · STORAGE-ARCH-02 **NOT STARTED** · Production app `6dfd201` **UNCHANGED** · deploy `dpl_3H57UgU2TfqkYawzamsVJ13qnMsG` **UNCHANGED**

- Audit + Design Freeze + Final Architecture Review complete (docs layer)
- OD-SA-01…10 LOCKED (3 private buckets · dual-read→staged migration · MASTER+fallback · artwork deferred · janitor/backup/orphans = future waves)
- Living SSOT reconciled: PROJECT_STATE · MASTER_HANDOFF · docs README · architecture README
- FAR-02 closed (living handoff links to Storage freeze/audit)
- FAR-01 / FAR-03 / FAR-04 remain deferred (Wave 02 dual-read · Wave 07 scale threshold · observability)
- Contabo remains ephemeral compute only · Supabase Storage remains durable media SSOT
- No code/DB/Storage/env/worker/deploy mutations
- Canonical: [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · [STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md)

---

## 2026-10-01 — E3 PRODUCTION ENABLEMENT — FINAL GREEN + DOCS RECONCILIATION

**Status:** **E3 = PRODUCTION VERIFIED — GREEN** (PASS WITH FINDINGS) · app `6dfd201` · deploy `dpl_3H57UgU2TfqkYawzamsVJ13qnMsG` · Mix/Jobs/PUBLIC_AUDIO **ON**

- E3 Production Enablement **COMPLETE** (GO #2 Contabo · GO #3 flags · GO #4 Basic Free Final Truth · GO #5 Public Free Audio)
- AC-PE-12 / F-PE-02 implemented @ `6dfd201` (`assertPublicFreeAudioReleased` · Mix/job/download wires)
- GO #5 **PASS**: Free Basic Mix → BASIC_MP3 render → READY artifact → signed download
- Private `audio-artifacts` preserved · public object inaccessible · Free HQ/WAV **DENY** · worker 401/403 verified
- Worker Contabo bootstrap `92496d4` · final state **STOPPED / DISABLED**
- FINAL E3 STATUS: **PRODUCTION VERIFIED — GREEN**
- Deferred remain deferred: Premium Production E2E · artifacts janitor · ops dashboard · live rollback drill · STEMS · payments · public Free HQ/WAV
- Living docs reconciled (PROJECT_STATE · MASTER_HANDOFF · README · architecture README · PE freeze ops continuity · GO #2 CLOSED/SUPERSEDED stamp) — historical closeouts untouched

---

## 2026-09-30 — OWNER GO #2 — WORKER INFRASTRUCTURE — BLOCKED

**Status:** **GO #2 = BLOCKED** (partial progress) · Application `9026fa9` **UNCHANGED** · **E3 = DARK** · Mix/Jobs/Public **UNSET** · **no Production claim/render/artifact**

- FFmpeg 9.0.2 + libmp3lame + pcm_s16le verified on **candidate** agent machine (≠ approved Production host)
- `E3_RENDER_WORKER_SECRET` = **CONFIGURED** in Vercel Production project env (Encrypted) · live deploy **PENDING REDEPLOY** (GO #2 forbids Next.js redeploy)
- Claim/fake-complete auth smoke: **403** without/wrong Bearer · no Production job claimed
- **BLOCKERS:** approved EXTERNAL worker host **Owner decision required** · `scripts/e3-render-worker-once.ts` fails under plain `tsx` (`server-only`) — needs Owner GO for bootstrap fix
- Record: [E3_WORKER_INFRASTRUCTURE_GO2.md](./audits/E3_WORKER_INFRASTRUCTURE_GO2.md)
- Next = **WORKER INFRASTRUCTURE BLOCKER REVIEW** (do not auto-start GO #3)

## 2026-09-30 — W6.2/W6.3 UX RELEASE — PRODUCTION VERIFIED

**Status:** **W6.2/W6.3 UX = CLOSED / PRODUCTION VERIFIED** @ `9026fa9` · deploy `dpl_2aZabB1AtXCUNGEERmjwupXTVP9S` · **E3 = DARK** · **NOT** Production Enablement

- Shipped presentation only: touch ≥44 · SiteHeader/safe-area · PlaybackShell · Download/Auth CTAs · MixPanel RSC `mixEnabled` · progressive disclosure · jobs-OFF Export error UX
- Production Verify: `/` `/beats` `/beat/[id]` `/sign-in` `/sign-up` `/account` · 200 · `min-h-11` · `viewport-fit=cover` · Mix UI **absent** (flags UNSET) · worker claim **403** · overflow OK @360
- **E3 flags remain UNSET** · no worker · no render · no artifacts
- Next = **OWNER GO #2 — WORKER INFRASTRUCTURE** (do not auto-start)

---

## 2026-09-30 — E3 PRODUCTION ENABLEMENT — DESIGN FREEZE


**Status:** **DESIGN FREEZE COMPLETE** · Architecture Review **PASS WITH FINDINGS** · Implementation **NONE** · Production `17c4d530` **DARK** · **NO COMMIT/PUSH/DEPLOY/ENV/WORKER/RENDER**

- Owner decisions locked: **OD-E3-PE-01=B** (Mix+Jobs+worker+secret+controlled render) · **PE-02=PROVISION NOW** · **PE-03=REQUIRE PUBLIC_AUDIO RUNTIME GATE** (design now / implement later) · **PE-04=SHIP W6.2/W6.3 BEFORE ENABLEMENT** · **PE-05=YES** controlled real Production render (later GO)
- Staged flag strategy: W6 UX → worker infra → Mix → Jobs → secret → controlled render → verify → optional Public Free Audio
- `E3_PUBLIC_AUDIO` remains **OFF** for first enablement; public Free Audio = separate Owner GO #5 after runtime gate exists
- Canonical: [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md)
- Next = **ARCHITECTURE REVIEW / OWNER GO** (GO #1 = W6 UX ship)

---

## 2026-09-29 — E3.8 W6.5 — FINAL CLOSEOUT (OWNER-ACCEPTED EMULATED CERT)


**Status:** **W6 = CLOSED / PASS** · **CERTIFICATION MODE = OWNER-ACCEPTED EMULATED** · Production `17c4d530` **UNCHANGED** · **E3 = DARK** · **no Production enablement** · **no live render / artifacts / worker**

- **OD-W6-03 CLOSED / OWNER ACCEPTED:** Owner accepts emulated Playwright Chromium/WebKit + Android UA evidence as the certification substitute (physical iOS Safari / Android Chrome unavailable in agent environment)
- Explicit limitation recorded: **no physical-device execution** — do not describe as physical iOS/Android PASS
- W6.4 = **PASS** · Owner-accepted emulated · Desktop ≥1024 = **REAL PASS** (Production DARK regression)
- Mobile certification prerequisite = **SATISFIED**
- Closeout: [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md)
- Checklist: [E3_8_W6_CERT_CHECKLIST.md](./audits/E3_8_W6_CERT_CHECKLIST.md)
- Evidence retained: `docs/audits/_w64_evidence/`
- **W6 PASS ≠** `E3_PUBLIC_AUDIO` ON · **≠** Production render enablement · **≠** E3 epic COMPLETE
- Next = **OWNER DECISION / NEXT RELEASE STAGE** (do not auto-open next feature / do not enable Production flags)

---

## 2026-09-29 — E3.8 W6.4 — DEVICE CERTIFICATION (EMULATED EVIDENCE)

**Status:** Evidence executed · later **Owner-accepted as PASS** in W6.5 · Production `17c4d530` **UNCHANGED** · **E3 = DARK** · **no live render / artifacts**

- Emulated matrix: Playwright Chromium (35 cells) + WebKit (4 beat viewports) · overflow PASS · CTA ≥44 · playback smoke PASS
- Preview Mix ON (`mixEnabled=true`) verified via official `vercel curl` · jobs OFF
- Production Dark = **PASS** (Mix absent · E3 flags UNSET)
- Desktop Chrome ≥1024 Production = **PASS** (DARK regression)
- Physical iOS/Android = **not executed** (documented limitation)
- Checklist: [E3_8_W6_CERT_CHECKLIST.md](./audits/E3_8_W6_CERT_CHECKLIST.md)

---

## 2026-09-29 — E3.8 W6.3 — MIX / MASTER / EXPORT MOBILE PRESENTATION (CODE · PRE-COMMIT)


**Status:** **W6.3 IMPLEMENTED** · Owner Verification pending · Production app remains `17c4d530` · **E3 = DARK** · **COMMIT/PUSH/DEPLOY = NONE** · **no live render**

- **AR-W6-01:** RSC `E3_MIX_ENABLED` → `mixEnabled` prop → MixPanel (client no longer imports env flag)
- Mix/Master: native `<details>` progressive disclosure · touch CTAs `min-h-11` · sliders `h-11` · `min-w-0` overflow hygiene
- Export: Basic / HQ / WAV / Premium lock / status / error / disabled Download presentation · jobs-OFF error copy for W6 cert
- **NOT done:** `E3_RENDER_JOBS_ENABLED` · worker · FFmpeg · artifacts · Production env · Mix/Master DSP/AuthZ
- Next = **OWNER W6.3 VERIFICATION GO** → then W6.4 only

---

## 2026-09-29 — E3.8 W6.2 — SHARED MOBILE PRESENTATION (CODE · PRE-COMMIT)

**Status:** **W6.2 IMPLEMENTED** · Owner Verification pending · Production app remains `17c4d530` · **E3 = DARK** · **COMMIT/PUSH/DEPLOY = NONE**

- Surface-local touch targets (`min-h-11`) on SiteHeader nav · PlaybackShell Play/Mute · Download · Auth submit/CTAs · home/sign-in/sign-up/confirmed links · beats list rows
- Safe-area: `viewportFit: cover` · header insets · body bottom inset
- Global Button default `h-8` **unchanged** (no desktop density regression via global default)
- Recording CTAs already `min-h-11` — reused / not redesigned
- **OUT:** Mix/Master/Export presentation (W6.3) · hamburger · AuthZ/DSP · E3 flags · live render
- Next = **OWNER W6.2 VERIFICATION GO** → then W6.3 only

---

## 2026-09-29 — E3.8 W6.1 — CERTIFICATION FOUNDATION (DOCS)

**Status:** **W6.1 COMPLETE** (docs) · Owner Verification pending · Design Freeze COMPLETE · Arch Review **PASS WITH FINDINGS** · Owner Implement GO **GRANTED** · Production `17c4d530` · **E3 = DARK**

- Deliverable: fillable cert checklist [E3_8_W6_CERT_CHECKLIST.md](./audits/E3_8_W6_CERT_CHECKLIST.md) (REUSE freeze §§5–7 as criteria SSOT — no duplicate acceptance prose)
- Locked Implement decisions: **AR-W6-01** RSC `mixEnabled` prop · **AR-W6-02** Preview Mix-only · **AR-W6-03** Export presentation/status/error only (no live render)
- Recording historical W6 security = **OUT** (OD-W6-01)
- **CODE / CONFIG / COMMIT / PUSH / DEPLOY = NONE**
- Next = **OWNER W6.1 VERIFICATION GO** → then W6.2 only

---

## 2026-09-29 — E3.8 W6 MOBILE CERT — DESIGN FREEZE

**Status:** **DESIGN FREEZE COMPLETE** · Arch Review later **PASS WITH FINDINGS** · Implement GO later **GRANTED** · Production remains `17c4d530` · **E3 = DARK**

- Owner Decisions: **OD-W6-01 = A** (OAD-05 mobile cert only · Recording W6 security OUT) · **OD-W6-02 = A** (Preview Mix cert · Production flags UNSET) · **OD-W6-03** device matrix frozen (iOS Safari + Android Chrome · 360/390/412/768 + desktop ≥1024)
- Waves frozen: W6.1 checklist → W6.2 shared presentation → W6.3 Mix/Master/Export presentation → W6.4 device matrix → W6.5 closeout
- Acceptance frozen: CTA ≥44×44 · overflow-x · playback · Basic Mix on Preview · Export presentation/status/error · Premium UX readable · no Production enablement
- **OUT:** redesign · native apps · DSP/AuthZ/business logic · Production render · public Free Audio ON
- Canonical: [E3_8_W6_MOBILE_CERT_PLAN.md](./audits/E3_8_W6_MOBILE_CERT_PLAN.md)
- Checklist: [E3_8_W6_CERT_CHECKLIST.md](./audits/E3_8_W6_CERT_CHECKLIST.md)

---

## 2026-09-29 — E3.7 PREMIUM RENDER — PRODUCTION VERIFIED (POST-DEPLOY)

**Status:** **E3.7 PRODUCTION VERIFIED** @ `17c4d530` · Owner Verification **PASS WITH FINDINGS** · **E3 = DARK** · real render **NOT EXECUTED** · artifact **NONE**

- Production application = `17c4d530c2ecc7c0c8e68cf6266e73b330f09be1` (`feat(audio): implement E3.7 premium export`)
- Production deployment = `dpl_BsdUUMvwsgg3xGJthfSYXE52rQCe` · URL https://www.bitrymdym.pl
- Previous Production = `183b2a4` (E3.6)
- **Verify:** public smoke `/` `/beats` `/sign-in` `/sign-up` `/account` · apex→www **PASS** · regression **PASS** · worker/claim **403** (secret UNSET) · E3 flags **UNSET**
- **E3.7 on Production (DARK):** `server-pro-v1` · Master Plan A · HQ MP3 **320** · WAV **44.1/16/stereo** · tier download AuthZ · private `audio-artifacts`
- **NOT enabled:** Production render · worker secret · public Free Audio · E3 epic COMPLETE
- INFO: G5 soft RMS ≠ full ITU-R BS.1770 (non-blocking)
- Closeout: [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)
- Next = **OWNER DECISION** (do **not** auto-enable E3)

---

## 2026-09-29 — E3.7 PREMIUM RENDER — COMMITTED + PUSHED (POST-COMMIT DOCS)

**Status (historical):** **E3.7 IMPLEMENTED** · Owner Verification **PASS WITH FINDINGS** · **COMMITTED + PUSHED** @ `17c4d530` · Production then still `183b2a4` · **E3 = DARK**

- Repository / `origin/main` = `17c4d530c2ecc7c0c8e68cf6266e73b330f09be1` (`feat(audio): implement E3.7 premium export`)
- Production application (then unchanged) = `183b2a4` · deployment `dpl_D5EfHdSSahouFftf5HK35wKSHmts`
- **E3.7 waves A–H on main:** `server-pro-v1` Pro Mix · Master **Plan A** · HQ MP3 **320** · WAV **44.1/16/stereo** · EXTERNAL worker dispatcher · tier-aware download AuthZ · Premium Export UX · tests **100/100**
- **Later:** Production Deploy + Verify completed @ `17c4d530` · `dpl_BsdUUMvwsgg3xGJthfSYXE52rQCe` — see Production Verified entry above
- Closeout: [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)

---

## 2026-09-29 — E3.7 PREMIUM RENDER — IMPLEMENTATION CLOSEOUT (DOCS · PRE-COMMIT)

**Status (historical at authorship):** **E3.7 IMPLEMENTED** · Owner Verification **PASS WITH FINDINGS** · docs reconciliation · **COMMIT/PUSH/DEPLOY = NONE** at that moment · Production app remains `183b2a4` · **E3 = DARK**

- Production application (unchanged) = `183b2a4` · deployment `dpl_D5EfHdSSahouFftf5HK35wKSHmts` · Documentation tip then = `f944747`
- **E3.7 waves A–H:** `server-pro-v1` Pro Mix (`MixProParams`) · Master **Plan A** (OD-E37-01) · HQ MP3 **320** · WAV **44.1/16/stereo** · EXTERNAL worker dispatcher · tier-aware download AuthZ · thin Premium Export UX (HQ+WAV+Basic) · tests **100/100** · typecheck/build/security/regression **PASS**
- **Premium Final Truth:** Pro Mix → Master Plan A → HQ/WAV encode → QC → private `audio-artifacts` → READY · **not** `server-basic-v1`
- **Basic path:** `server-basic-v1` → Basic MP3 128 unchanged
- **Download:** `quality_tier` → `EXPORT_BASIC_MP3` / `EXPORT_HQ_MP3` / `EXPORT_WAV`
- **Production safety:** flags UNSET · worker secret UNSET · Production Render **NOT EXECUTED** · no Production E3.7 deploy
- **OUT:** STEMS · `artifact_kind` · payments · public Free Audio · W6 matrix · Production enablement · `MasterProParams` / True Peak / BS.1770 · bake↔encode ±5% QC (OD-E37-03 OUT)
- INFO: G5 soft RMS approximation · *(then)* E3.7 code uncommitted until Owner Commit GO — **later committed** @ `17c4d530`
- Closeout: [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)
- Next at authorship = **OWNER COMMIT GO** — superseded by Commit+Push @ `17c4d530`

---

## 2026-09-29 — E3.6 BASIC MP3 EXPORT — POST-RELEASE CLOSEOUT (DOCS)

**Status:** **E3.1 → E3.6 CLOSED / PRODUCTION VERIFIED** @ `183b2a4` · **E3 = DARK** · docs reconciliation · **no app/DB/env/deploy in this closeout**

- Application / Production = `183b2a4a7ea3cc8be7f0ac337e75e915ffdae0b9` (`feat(audio): implement E3.6 basic mp3 export`)
- Production deployment = `dpl_D5EfHdSSahouFftf5HK35wKSHmts` · URL https://www.bitrymdym.pl · Production Verify = **PASS**
- Previous Production = `fbece37` (E3.5 Render Jobs)
- **E3.6 shipped:** source authorization/resolution · `server-basic-v1` bake · real Basic MP3 **128 kbps stereo** · **OD-E36-04 = C** native/system FFmpeg + libmp3lame on **EXTERNAL worker** (FFmpeg **not** an app npm dependency) · QC · signed download · thin Free Export UX · Final Truth READY artifact path · tests
- **Production safety (unchanged / DARK):** `E3_RENDER_JOBS_ENABLED` / `E3_MIX_ENABLED` / `E3_PUBLIC_AUDIO` = **UNSET** · `E3_RENDER_WORKER_SECRET` = **UNSET** · Production real render **NOT ENABLED / NOT EXECUTED**
- History preserved: E3.1 @ `35e1eaa` → E3.2 @ `24e50ac` → E3.3 @ `8283bd0` → E3.4 @ `69dc9d1` → E3.5 @ `fbece37` → E3.6 @ `183b2a4`
- Closeout: [E3_6_PRODUCTION_CLOSEOUT.md](./audits/E3_6_PRODUCTION_CLOSEOUT.md)
- Architecture continuity: [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) · [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](./architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md)
- INFO (non-blockers): Live Full E2E not executed · Free Export needs EXTERNAL worker process · G5 soft RMS (not full BS.1770) · Fake-complete ≠ Final Truth · native FFmpeg per OD-E36-04
- D02 @ `e98ba52` · W1–W5 @ prior SHAs — unchanged
- Docs-only tip may advance after Owner docs-commit GO — **do not** redeploy docs as application
- Next = **OWNER DIRECTION / READY FOR NEXT AUDIT** (do **not** auto-select E3.7+)

---

## 2026-09-28 — D02 ANONYMOUS QUICK TAKE — POST-RELEASE CLOSEOUT (DOCS)

**Status:** **D02 CLOSED / IN V1** · **SHIPPED** · **PRODUCTION VERIFIED** @ `e98ba52` · docs reconciliation · **no app/DB/deploy**

- Application / Production = `e98ba52c610b4c6dee8f69aa76f734b6cbe898ab` (`feat: add d02 anonymous quick take`)
- Production Verify = GREEN · Closeout: [RECORDING_D02_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)
- Contract addendum reconciled: [PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md](./phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md)
- Preserve NOT EXECUTED: post-expiry live · 3/day · missing READY-master case · W4/W5 full interactive · mobile 390/412
- POST-RELEASE FINDING: anonymous verify artifacts TTL-bound (MEDIUM=1) — no delete feature in closeout
- OUT unchanged: anon→account claim · durable anon download · MIX/EXPORT/TRACK/PAYMENTS/PREMIUM/SOCIAL/DUAL-PLAY · grant PLAYBACK|DOWNLOAD
- Wave 5 @ `37892a6` unchanged · W4 ownership path unchanged
- Docs-only tip may advance after Owner docs-commit GO — **do not** redeploy docs as application
- Next = **OWNER DIRECTION / READY FOR NEXT AUDIT**

---

## 2026-09-28 — D02 ANONYMOUS QUICK TAKE — DESIGN FREEZE ADDENDUM

**Status (freeze gate — historical):** **DESIGN FREEZE COMPLETE** · Implementation GO was **NONE** at freeze time · Architecture Review was next gate · **no app/DB/config change in that docs step**

- Canonical: [PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md](./phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md)
- At freeze: D02 CLOSED / IN V1 · delivery still NOT SHIPPED
- Frozen: TTL 7200s · max 30s · caps 1/3/concurrent 1 · dedicated take identity ≠ `brd_dl_aid`
- Preview YES (short-lived signed) · durable download NO · anon→account claim NO · PUBLISHED only · dual-play OUT
- Wave 5 / MIX / EXPORT / Track / Payments / grant PLAYBACK|DOWNLOAD = OUT
- **Later:** Implementation + Production Verify completed @ `e98ba52` — see Post-Release Closeout entry above

---

## 2026-09-28 — RECORDING WAVE 5: PRODUCTION VERIFIED / CLOSED

**Status:** **CLOSED / PRODUCTION GREEN** @ `37892a6adca1ac3b4bf68a06af248ca38bbcc177`

- Scope: Shared Grants → RECORD only (`beat_access_grants`)
- OWNER VERIFICATION = PASS · PRODUCTION VERIFY = PASS
- Production URL: https://www.bitrymdym.pl
- D03 decision unchanged CLOSED / IN Recording EPIC · delivery = SHIPPED / PRODUCTION VERIFIED
- D02 Anonymous QT at Wave 5 closeout: CLOSED / IN V1 · delivery then NOT SHIPPED / DEFERRED *(later shipped @ `e98ba52`)*
- Security continuity: P1-B/P1-C CLOSED · P1-A HIBP BLOCKED · Wave 5 AuthZ/IDOR/RLS PASS · Take ACL unchanged
- Closeout: [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)
- Known INFO: React hydration warning on `/beat/[id]` (non-blocker)
- Migration timestamp drift = P2 OPS (deferred)
- Docs-only tip may advance after this closeout — **do not** redeploy docs without Owner Production GO
- Next at Wave 5 closeout = **OWNER DIRECTION / READY FOR NEXT AUDIT** (no auto EPIC)

---

## 2026-09-28 — RECORDING WAVE 5 IMPLEMENTATION (LOCAL · PRE-COMMIT)

**Status:** Implementation complete locally · remote DB migration applied · **COMMIT/PUSH/DEPLOY = NONE** · production app remains `99c4815`

- Scope: Shared Grants → RECORD only (`beat_access_grants`)
- D03 decision unchanged CLOSED / IN EPIC; delivery implemented pending Owner Verification
- OUT unchanged: PLAYBACK/DOWNLOAD via grant · Anon QT · MIX/EXPORT · Payments · take sharing
- AuthZ: `assertTakeRecordAccess` + grant domain; PUBLISHED RECORD without grant preserved (W4)
- APIs: `/api/beats/[id]/grants` · revoke · `/api/account/grants`
- UI: Moje bity grant panel · `/account/shared`
- Next: **OWNER VERIFICATION** → then commit GO

---

## 2026-09-28 — P1 SECURITY HARDENING CLOSEOUT (DOCS)

**Status:** documentation continuity after P1-B/P1-C · **no app deploy** · production app remains `99c4815`

- Git / origin/main = `b4199ef` (`security: harden definer grants and updated_at search path`)
- **P1-B** selective DEFINER EXECUTE REVOKE = **CLOSED** / VERIFIED / committed+pushed
- **P1-C** `set_updated_at` (`search_path` + `pg_catalog.now()`) = **CLOSED** / VERIFIED / committed+pushed
- Remote DB contains P1-B + P1-C hardening
- **P1-A HIBP** = **BLOCKED** — Owner Dashboard action required (not enabled)
- Security = **GREEN WITH WARNINGS** · CRITICAL=0 · HIGH=0 · MEDIUM residual = HIBP disabled
- Migration timestamp drift local↔remote = **P2 OPS** (not P1 blocker)
- Wave 5 = **NOT IMPLEMENTED** / **NO IMPLEMENTATION GO**

---

## 2026-09-28 — DOCUMENTATION CONTINUITY RECONCILIATION

**Status:** documentation only (Owner GO: docs continuity) · **no app / DB / env / deploy**

- Added canonical cold-start entry [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)
- Entry points: MASTER_HANDOFF → PROJECT_STATE → SSOT / architecture / audits
- Clarified production app `99c4815` ≠ git docs tip (prior tip `406ff5b`; do not auto-align)
- Next = **OWNER DIRECTION / COLD START AUDIT** (Wave 5 = **no** automatic GO)
- Decision ≠ delivery: D02/D03 decisions unchanged; delivery NOT SHIPPED; no Implementation GO
- Continuity rule: documentation ≠ proof of shipped implementation; code/schema = evidence
- Deferred (not done here): freeze / SYSTEM_ARCHITECTURE §9 / SSOT §18 / OPEN_DECISIONS D02–D03 wording sync — awaits Owner clarification

---

## 2026-09-28 — RECORDING WAVE 4: PRODUCTION VERIFIED / CLOSED

**Status:** **CLOSED / PRODUCTION GREEN** @ `99c4815e26b224cb66e221831687b0688bf20476`

- Production deploy Ready · aliased https://www.bitrymdym.pl
- Smoke + live W4 E2E (BEGINNER record→download→delete, caps, IDOR) PASS
- PRO/LEGEND entitlement snapshots PASS; Chromium WebM/Opus regression PASS
- Janitor: Hobby daily `0 0 * * *`; unauthorized cron 401 PASS; scheduled run PENDING_SCHEDULE
- Closeout: [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md)
- OUT remains: anon QT · grants · MIX/EXPORT · payments

---

## 2026-09-28 — RECORDING WAVE 4: HOBBY-COMPATIBLE DAILY JANITOR CRON

**Status:** hotfix (Wave 4 still OPEN — not CLOSED)

- Vercel Hobby rejects hourly cron; schedule changed to `0 0 * * *` (00:00 UTC daily)
- Expiry AuthZ unchanged (immediate DENY); janitor remains cleanup/lifecycle only
- No business-logic / schema / AuthZ / entitlement changes

---

## 2026-09-27 — RECORDING WAVE 4: ENTITLEMENT / RETENTION / JANITOR / ANTI-ABUSE / DOWNLOAD / MOJE PRÓBKI

**Status:** **IMPLEMENTED / READY_FOR_OWNER_REVIEW** — COMMIT / PUSH / DEPLOY = NOT PERFORMED · production still @ `9f6f006`

- Entitlement SSOT: BEGINNER 30s · PRO/LEGEND `MIN(beat,180)` (`entitlement.ts` + session/finalize)
- Retention: account-level `expires_at`; AuthZ DENY when expired
- Anti-abuse race-safe: `claim_take_recording_session` (advisory_xact_lock) + unique PENDING per owner
- Janitor: Vercel Hobby daily cron `0 0 * * *` → `GET /api/cron/takes-janitor` (`CRON_SECRET`) — take-audio only; expiry AuthZ remains immediate
- Own take download: `POST /api/takes/download` signed GET TTL 300s
- Soft-delete: `POST /api/takes/delete` → DELETED + deleted_at
- UI: `/account/takes` Moje próbki (preview / download / delete)
- Migration: `20260927220000_recording_wave4_session_claim.sql` (applied remote)
- Tests: wave4-unit + wave4-live; full `src/lib/takes` regression PASS
- Report: [RECORDING_WAVE4_IMPLEMENTATION_REPORT.md](./audits/RECORDING_WAVE4_IMPLEMENTATION_REPORT.md)
- OUT: anon QT · grants · MIX/EXPORT · publish · payments

---

## 2026-09-27 — RECORDING WAVE 3: DURATION HOTFIX PRODUCTION VERIFIED / CLOSED

**Status:** **CLOSED / PRODUCTION VERIFIED** @ `9f6f006c4dbb3354260ca2f5479c18952f8a713a`

- Blocker discovered on `507f78f`: Chromium timesliced WebM/Opus → music-metadata `format.duration` missing → finalize `DURATION_PROBE_FAILED`
- Hotfix: `fix(recording): support chromium webm duration fallback` @ `9f6f006`
- RCA: [RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md](./audits/RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md)
- Production E2E: real MediaRecorder `audio/webm;codecs=opus` + timeslice 250 → upload → decode fallback duration → READY_TAKE → signed take-only preview PASS

---

## 2026-09-27 — RECORDING WAVE 3: PRODUCTION BLOCKER RCA + HOTFIX

**Status:** superseded by production verify CLOSED @ `9f6f006`

- RCA: [RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md](./audits/RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md)
- Cause: timesliced Chromium MediaRecorder WebM omits Info.Duration; music-metadata ignores Clusters
- Fix: server-side `audio-decode` PCM fallback when EBML/WebM lacks metadata duration (client duration still untrusted)
- Fixture: `src/lib/beats/fixtures/chromium-mediarecorder-opus.webm`

---

## 2026-09-27 — RECORDING WAVE 3: PLAYER INTEGRATION + TAKE PREVIEW

**Status:** **DEPLOYED** @ `507f78fb03347683c847d5b0a0d76a3fffe1827d` · **PRODUCTION VERIFY NOT CLOSED**

- Sibling `RecordingPanel` + `BeatRecordingSurface` on beat detail
- Pure `recording-ui-state` machine (separate from `reducePlayback`)
- Thin PlaybackShell sync: playFromStart(0) + stop + controls lock (OD-W3-01)
- Take-only preview via `POST /api/takes/preview` owner signed GET (OD-W3-04)
- Anonymous QT OUT (OD-W3-02); interim AuthZ unchanged (auth + PUBLISHED)
- Tests: wave3-unit + wave3-live preview AuthZ
- Closeout: [RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md](./audits/RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md)
- OUT: dual-play, anon, grants, entitlements, download, MIX/EXPORT
- **Prod verify:** UI START/STOP/CANCEL + upload PASS; finalize **FAIL** — `DURATION_PROBE_FAILED` on real Chromium MediaRecorder `audio/webm; Opus` (music-metadata returns no `format.duration`). READY_TAKE / take preview not reached. Blocker — no hotfix without Owner GO.

---

## 2026-09-27 — RECORDING WAVE 2: TRANSPORT + MEDIARECORDER

**Status:** **IMPLEMENTED** (Owner review / commit pending)

- Take session = existing `takes` row (`PENDING_UPLOAD` → `READY`)
- MediaRecorder / getUserMedia module (`src/lib/takes/media-recorder.ts`)
- Signed upload + finalize for private `take-audio` (`/api/takes/session`, `/api/takes/finalize`)
- Interim AuthZ: authenticated + PUBLISHED beat; max = `MIN(beat, 180)`
- Duration probe fail-closed (OD-W2-04); no client duration trust
- Tests: wave2-unit + wave2-live security matrix
- Closeout: [RECORDING_WAVE2_IMPLEMENTATION_CLOSEOUT.md](./audits/RECORDING_WAVE2_IMPLEMENTATION_CLOSEOUT.md)
- OUT: PlaybackShell Record, QT product UI, anon, entitlements, janitor

---

## 2026-09-27 — RECORDING WAVE 1: TAKE FOUNDATION

**Status:** **IMPLEMENTED** (Owner review / commit pending)

- New domain table `takes` (not extending `beat_audio_assets`)
- Enums: `take_status`, `take_recording_mode`
- RLS: owner SELECT own non-deleted; client mutations DENY (service_role only)
- Private bucket `take-audio` (client Storage INSERT/SELECT DENY)
- Object key helpers + `src/config/recording.ts` retention/anti-abuse constants
- Tests: wave1-foundation unit + live RLS/storage
- Migration: `20260927180000_recording_wave1_take_foundation.sql` (applied remote)
- OUT: MediaRecorder, Record UI, upload transport API, shared grants, janitor

---

## 2026-09-27 — RECORDING / QUICK TAKE DESIGN FREEZE v1.0 LOCKED

**Status:** **DESIGN FREEZE LOCKED** · Owner D01–D08 / OD-REC-01…08 **CLOSED** · **IMPLEMENTATION NONE**

- Canonical: [PHASE_RECORDING_DESIGN_FREEZE.md](./phases/PHASE_RECORDING_DESIGN_FREEZE.md)
- RECORD ≠ PLAYBACK ≠ DOWNLOAD; anon QT IN V1; shared grants IN EPIC; hybrid Account Level + future Premium
- Retention: BEGINNER 24h · PRO 10d · LEGEND 30d; anti-abuse caps locked; own take download YES (anon no durable DL)
- MIC TAKE ≠ mix; MIX/EXPORT OUT (OD-14); `MIN(beat, entitlement, 180)` server-enforced
- Next: Wave 1 Implementation AUDIT/PLAN only after separate Owner GO

---

## 2026-09-27 — COMMUNITY WAVE 5: HARDENING + EPIC CLOSEOUT

**Status:** **IMPLEMENTED / VERIFIED** · EPIC **COMPLETE / LOCKED**

- Submit cooldown: `beats.last_submitted_at` + trigger (60s) + service `assertSubmitCooldown`
- Cleared on `REJECTED → DRAFT` (legitimate rework allowed)
- Security regression suite (AuthZ/IDOR/READY/Storage/public visibility)
- Live E2E: cooldown DENY · reject/rework · approve · publish · public · PLATFORM regression
- Audit/telemetry: DOWNLOAD_EVENT remains SSOT for downloads; beat lifecycle audit **deferred** (invariants enforced without new framework)
- Migration: `community_wave5_submit_cooldown`

---

## 2026-09-27 — COMMUNITY WAVE 4: STAFF PUBLISH APPROVED USER BEATS

**Status:** **IMPLEMENTED / VERIFIED** · ADMIN + MODERATOR · USER DENY · READY hard gate first

- `publishApprovedUserBeat`: `beats.publish` → APPROVED USER only → READY+object-key gate → `PUBLISHED`
- Moderation UI: tabs W moderacji / Zaakceptowane · `Opublikuj` (no metadata edit)
- Public reuse: `/beats` · `/beat/[id]` · PlaybackShell · Access Gate · download / My Downloads
- USER: status Opublikowany · CTA `Zobacz bit`
- Tests: community-wave4 unit A–R + live E2E; PLATFORM regression PASS
- No new migration (Wave 1 MOD publish RLS reused)

---

## 2026-09-27 — COMMUNITY WAVE 3: SUBMIT + MODERATION

**Status:** **IMPLEMENTED / VERIFIED** · APPROVED ≠ PUBLISHED · Wave 4 publish still pending

- Submit: `submitUserBeat` DRAFT→PENDING_REVIEW (own USER + active MASTER READY revalidated)
- Moderation: `approveUserBeat` / `rejectUserBeat` (+ required `rejection_reason`); queue `/admin/moderation`
- USER UI: `/beats/upload`, `/account/beats`; Polish status labels; resubmit after REJECTED→DRAFT
- MOD playback via existing PlaybackShell + Access Gate (staff non-public PLAYBACK)
- Migration `community_wave3_user_edit_freeze`: USER metadata edits only DRAFT/REJECTED
- Tests: community-wave3 unit + live RLS/E2E; APPROVED not in public catalog
- Wave 4 remaining: APPROVED→PUBLISHED UI/flow (service already exists)

---

## 2026-09-27 — COMMUNITY WAVE 2: USER SIGNED AUDIO TRANSPORT

**Status:** **IMPLEMENTED / VERIFIED** · Storage INSERT still **DENY** · beat stays **DRAFT**

- Reuse Audio Transport V1: signed upload → analyze → finalize → MASTER READY
- Routes: `POST /api/beats/audio/session`, `POST /api/beats/audio/analyze`, `finalizeUserBeatWithMasterAction`
- Object key: `user/{ownerId}/{beatId}/{assetId}/master.bin` (server-chosen)
- Migration `community_wave2_user_audio`: asset trigger allows USER beats with `user/{ownerId}/` prefix
- Replacement: new PENDING → READY activates; previous MASTER → REPLACED
- Live E2E: `bpm-120-steady.wav` → duration 30 · BPM 120 · no 413 · DRAFT retained
- IDOR / AuthZ unit tests + PLATFORM transport regression preserved

---

## 2026-09-27 — COMMUNITY WAVE 1: OWNERSHIP / RLS / AUTHZ FOUNDATION

**Status:** **IMPLEMENTED** · Design Freeze honored · UI/transport **OUT**

- Migration `community_wave1_ownership`: `rejection_reason`, USER `beats.create`, `beats.publish` (ADMIN+MODERATOR), RLS insert/update, trigger rewrite
- App: ownership-aware `assertPublishHardGate`; USER/MOD transition matrix; community service contracts; `user/` object key validator
- Tests: community-wave1 contracts A–T + IDOR; total suite GREEN
- Live RLS: USER own insert/select; foreign/PLATFORM/PUBLISHED insert DENY; MOD reject+reason / approve; ADMIN PLATFORM insert regression
- Storage INSERT remains default deny

---

## 2026-09-27 — COMMUNITY BEAT UPLOAD + MODERATION — DESIGN FREEZE

**Status:** Design Freeze **READY / OWNER GO** · Implementation **NONE** · Migration **NONE**

- Owner GO closed OD-COMMUNITY-01…05 (staff publish; rejection_reason; USER `beats.create`; all account levels upload; USER archive own PUBLISHED)
- Frozen: USER ownership + lifecycle DRAFT→PENDING_REVIEW→APPROVED→PUBLISHED; USER never publishes; reuse `beat-audio` + signed upload; object key `user/{ownerId}/{beatId}/{assetId}/master.bin`
- Docs: [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)
- Baseline: `47643c2` · Production GREEN · Phase 1.9 CLOSED

---

## 2026-09-27 — EPIC-A: PHASE 1.9 CLOSEOUT + PUBLISH HARD GATE

**Status:** Implementation **COMPLETE** on `main` @ `47643c2` · Phase 1.9 **CLOSED / LOCKED** · Production **VERIFIED GREEN**

- Server: `transitionBeatStatus(…, PUBLISHED)` requires PLATFORM + active MASTER READY (same `beat_id`); create no longer inserts as PUBLISHED
- UI publish gate preserved; GAP-PUBLISH-READY **CLOSED**
- Docs reconciled; production verify GREEN @ `47643c2`

---

## 2026-09-27 — AUDIO TRANSPORT V1 (SIGNED BINARY UPLOAD)

**Status:** Design Freeze **APPROVED** · Implementation **CLOSED / PRODUCTION VERIFIED** @ `73e213c`

- Gap: base64 Server Action vs Next.js 1 MB body limit blocked >1 MB WAV E2E
- Decision: **signed binary upload** to private `beat-audio` (not bodySizeLimit-as-fix; not RH multipart as sole path)
- DRAFT-beat-first · BPM V1 unchanged (`471dd5b`)
- Live E2E localhost + production: `bpm-120-steady.wav` ~2.52 MiB → session → signed upload → analyze → finalize · no HTTP 413 · BPM 120 AUTO_SUGGEST
- Docs: [PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md](./phases/PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md) · [AUDIO_TRANSPORT.md](./architecture/AUDIO_TRANSPORT.md)

---

## 2026-09-27 — BPM PRODUCTION IMPLEMENTATION V1

**Status:** **IMPLEMENTED** on `main` · **ACCURACY NOT CERTIFIED** · Phase 1.9 **NOT CLOSED**

- Platform Beat create: A=`tempo()` + B=`combTempo()` → C_NEAR → RULE B → AUTO_SUGGEST | MANUAL_REQUIRED
- Server re-probe + `resolveCreateBpm`; client BPM untrusted; user override allowed (1–300)
- DB unchanged (`beats.bpm` only); no telemetry / confidence columns
- Docs: [PHASE_BPM_DESIGN_FREEZE.md](./phases/PHASE_BPM_DESIGN_FREEZE.md) · [BPM_AUTO_DETECTION.md](./architecture/BPM_AUTO_DETECTION.md)

---

## 2026-09-26 — SCOPE B — BPM AUTO-DETECTION (RESEARCH → V1)

**Status:** Research + Design Freeze completed; production wiring shipped as V1 above · **NOT accuracy-certified**

- Detector: `@audio/beat` signal analysis (not ID3); decode WAV/MP3 via `audio-decode`; FLAC/AAC/M4A → manual BPM
- Experiments V2–V5 + Design Freeze precede production resolver (C_NEAR + RULE B)
- Benchmark fixtures remain outside git; accuracy Owner-gated

---

## 2026-09-26 — SCOPE A — AUDIO-FIRST PLATFORM BEAT UPLOAD (LOCAL)

**Status:** Scope A **IMPLEMENTED locally** · BPM auto (**Scope B**) **DEFERRED** · Phase 1.9 **NOT CLOSED** · **NO COMMIT / NO PUSH**

- `/admin/beats/new`: audio-first UX — select file → server `music-metadata` duration → title suggestion → manual BPM/metadata → CREATE DRAFT + existing MASTER upload pipeline
- `duration_seconds`: server source of truth (`Math.round` float → int); range 1–180; no hardcoded 120; manual duration input removed
- Title: pure `suggestTitleFromFilename` (editable); BPM: manual only, no default 140, no detector
- Dependency: `music-metadata` (server-only / `serverExternalPackages`); no Access Gate / RLS / AuthZ / GAP-PUBLISH-READY changes
- Scope B (BPM auto-detection): **DEFERRED — Owner GO required**
- Next: Owner uses audio-first create → READY → UI publish → agent live E2E

---

## 2026-09-26 — PHASE 1.9 — FIRST PLATFORM BEAT (BLOCKED ON OPERATOR UI)

**Status:** Cold-start **PASS** · ADMIN **PASS** · First beat **BLOCKED** (no ADMIN browser session for agent) · Phase **NOT CLOSED**

- Live: ADMIN=1 · beats=0 · PUBLISHED=0 · READY=0 · events=0 · `beat-audio` private
- No new architecture; REUSE Phase 1.7 admin UI + 1.5 Access Gate + 1.8A downloads
- Agent cannot complete create/upload/publish without Owner ADMIN login + MASTER file via UI
- Fixture (outside git): `../bitrymdym-fixtures/phase19-master-tone.wav` (5s tone WAV)
- Local uncommitted: admin nav „Panel administratora”; Phase 1.9 docs drift updates
- Next: Owner creates + publishes first PLATFORM beat → agent resumes live E2E

---

## 2026-09-26 — AUTH PRODUCTION CANONICAL URL FIX (IN PROGRESS)

**Status:** Code + Vercel env updated · **Supabase Auth Site URL = HUMAN OPERATOR REQUIRED** · Phase 1.9 still PARTIAL

- Canonical production origin: `https://bitrymdym.pl`
- Code: `getSiteUrl()` / `getAuthEmailRedirectTo()`; `signUp` passes `emailRedirectTo` → `/account`
- Production guard: `VERCEL_ENV=production` never falls back to `*.vercel.app`
- Vercel Production env: `NEXT_PUBLIC_SITE_URL=https://bitrymdym.pl` set
- Custom SMTP / branded sender: **OUT** (future Owner GO)
- Supabase Dashboard still required:
  - Site URL → `https://bitrymdym.pl`
  - Redirect allow-list: `https://bitrymdym.pl/**`, `https://www.bitrymdym.pl/**`, localhost, preview wildcards
- Deploy of this commit required before production signup sends BitRymDym redirects from app `emailRedirectTo`

---

## 2026-09-26 — PHASE 1.9 — DESIGN FREEZE APPROVED / IMPLEMENTATION IN PROGRESS

**Status:** DESIGN FREEZE **APPROVED / LOCKED** · IMPLEMENTATION **IN PROGRESS** · PRODUCTION BOOTSTRAP **PENDING** (not CLOSED)

- Candidate: Operator Production Enablement (OD-20 manual ADMIN + first PLATFORM beat + live E2E)
- Freeze: [PHASE_1_9_DESIGN_FREEZE.md](./phases/PHASE_1_9_DESIGN_FREEZE.md)
- Runbook: [PRODUCTION_BOOTSTRAP.md](./runbooks/PRODUCTION_BOOTSTRAP.md)
- No app/DB/bootstrap code; no migration; OD-20 unchanged
- Live baseline pre-bootstrap: ADMIN/PUBLISHED/READY/users/beats = 0
- Next: Human operator executes runbook → production verify → closeout
- FOLLOW-UP: stale drift in `PHASE_1_FOUNDATION.md` + root `README.md` (not fixed in this phase unless Owner expands docs GO)

---

## 2026-09-26 — PHASE 1.8A — CLOSED / LOCKED (production verified)

**Status:** **COMPLETE / CLOSED / LOCKED** @ `fd87f23` on `main` / `origin/main`

- Commit: `fd87f23` — `feat(downloads): complete phase 1.8a download productization`
- Push: COMPLETE → `origin/main`
- Production deploy: Vercel **success**; live marker Phase 1.8A on bitrymdym.pl / www / vercel.app
- Production Verify: **PASS** (homepage, sign-in/up, `/account/downloads` anon → sign-in gate, security smoke)
- Live Download E2E: **NOT VERIFIED** (`published_count=0`, `admin_count=0` / OD-20) — non-blocking
- Next: **COLD-START AUDIT (next Foundation candidate)**

---

## 2026-09-26 — PHASE 1.8A — DOCUMENTATION CLOSEOUT COMPLETE

**Status:** IMPLEMENTATION AUDIT PASS · DOCUMENTATION CLOSEOUT COMPLETE · **READY FOR OWNER REVIEW** (not CLOSED)

- Design Freeze: [PHASE_1_8A_DESIGN_FREEZE.md](./phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED
- OD-05 = 2 / UTC day · OD-06 = 4 / UTC day · OD-17 = signed URL SUCCESS → finalize event
- Flow: AUTH → AUTHZ → READY → RESERVATION (TTL 120s, not an event) → signed URL → FINALIZE → `beat_download_events`
- Audit: OD-17 / reservation / crash safety / concurrency / grants / RLS / security PASS; tests **84/84**
- Known non-blocking: no live RLS/concurrency integration tests; Live E2E NOT VERIFIED (`published_count=0`, `admin_count=0`)
- Homepage stale “Download OUT” copy corrected
- Phase **NOT CLOSED**; not committed / not pushed
- Next: OWNER REVIEW → COMMIT → PUSH → PRODUCTION VERIFY

---

## 2026-09-26 — PHASE 1.8A — IMPLEMENTATION FIX (OD-17 reservation)

**Status:** IMPLEMENTATION COMPLETE (fix) — uncommitted — **READY FOR IMPLEMENTATION AUDIT**

- Root cause addressed: provisional event-before-URL rejected
- Model: `beat_download_reservations` (ephemeral) ≠ `beat_download_events` (final OD-17)
- Flow: AuthZ → reserve → signed URL SUCCESS → finalize event
- Least-privilege: revoked anon/authenticated DML on events; reservations client-denied
- Dropped `claim_beat_download_slot`; RPCs service_role only
- Migration: `phase_1_8a_download_reservation` applied remote
- Phase **NOT CLOSED**

---

## 2026-09-26 — PHASE 1.8A — IMPLEMENTATION COMPLETE (not CLOSED)

**Status:** IMPLEMENTATION COMPLETE — local / uncommitted — **READY FOR IMPLEMENTATION AUDIT**

- Design Freeze: [PHASE_1_8A_DESIGN_FREEZE.md](./phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED
- Migrations: `phase_1_8a_download_events`, `phase_1_8a_claim_rpc_grants` (applied remote)
- Table: `beat_download_events` + RLS (own SELECT); claim RPC service_role only
- Config SSOT: `src/config/downloads.ts` (anon=2, user=4, UTC day)
- Access Gate REUSE: DOWNLOAD branch + atomic limit claim + event
- UI: Download CTA on `/beat/[id]`; Moje pobrane `/account/downloads`
- OD-05 / OD-06 / OD-17 CLOSED interim; OD-13 / OD-04 OUT
- Tests 59/59; lint / typecheck / build PASS
- Live Download E2E: **NOT VERIFIED** (empty catalog / no ADMIN)
- Phase **NOT CLOSED**; not committed / not pushed

---

## 2026-09-26 — PHASE 1.7 — COMPLETE / CLOSED / LOCKED

**Status:** COMPLETE / COMMITTED / PUSHED — `ed499ee` on `main` / `origin/main`

- Commit: `ed499ee` — `feat(admin): complete phase 1.7 platform content ops`
- Design Freeze: [PHASE_1_7_DESIGN_FREEZE.md](./phases/PHASE_1_7_DESIGN_FREEZE.md) — APPROVED / LOCKED
- Routes: `/admin`, `/admin/beats`, `/admin/beats/new`, `/admin/beats/[id]`
- REUSE: createPlatformBeat, updateBeatMetadata, uploadPlatformBeatAudio, lifecycle `DRAFT → PUBLISHED`, Access Gate PLAYBACK
- UI Publish gate: READY MASTER required; GAP-PUBLISH-READY server hard rule preserved
- Production: **GREEN / VERIFIED** (Vercel PASS)
- Production smoke: public/auth/routing/security/regression **PASS**
- Live Admin E2E: **NOT VERIFIED** — OD-20 / `admin_count=0` (non-blocking)
- Published Content E2E: **NOT VERIFIED** — `published_count=0` (non-blocking)
- Audit infrastructure GAP preserved; OD-04 … OD-18 remain OPEN
- Next: Cold-Start Audit for next Foundation candidate

---

## 2026-09-26 — PHASE 1.6 — COMPLETE / CLOSED / LOCKED

**Status:** COMPLETE / COMMITTED / PUSHED — `39be430` on `main` / `origin/main`

- Commit: `39be430` — `feat(beats): complete phase 1.6 playback surface`
- Design Freeze: [PHASE_1_6_DESIGN_FREEZE.md](./phases/PHASE_1_6_DESIGN_FREEZE.md) — APPROVED / LOCKED
- Routes: `/beats` (PUBLISHED-only catalog), `/beat/[id]` (PUBLISHED-only detail + PlaybackShell)
- Playback via existing Access Gate (`PLAYBACK` only); signed PLAYBACK URL
- Hard OUT: DOWNLOAD UI / limits / counters / audit; Quick Take; waveform engine
- Production: **GREEN / VERIFIED**
- OD-04 … OD-18 remain OPEN
- Downloads remain **PARTIAL**; Quick Take **NOT STARTED**
- Next: Phase 1.7 Cold-Start candidates → Owner Design Freeze selection

---

## 2026-09-26 — PHASE 1.5 — COMPLETE / LOCKED

**Status:** COMPLETE / COMMITTED / PUSHED — `0ec0be0` on `main` / `origin/main`

- Commit: `0ec0be0` — `feat(audio): complete phase 1.5 private storage and access gate`
- Design Freeze: `0e5c491`
- Migration `20260925220000_phase_1_5_audio_storage.sql` / live `phase_1_5_audio_storage`
- Private bucket `beat-audio`; `beat_audio_assets`; Access Gate; signed URL PLAYBACK 120s / DOWNLOAD 300s
- Unit 28/28; live Storage/RLS/signed URL PASS; pre-commit audit PASS
- OD-12 remains OPEN; player/limits/Quick Take/community/payments out of scope
- Next: Phase 1.6 Cold-Start Audit

---

## 2026-09-26 — PHASE 1.5 — PRIVATE AUDIO STORAGE + ACCESS GATE (IMPLEMENTATION)

**Status:** superseded by COMPLETE / LOCKED entry above (`0ec0be0`)

- Migration `20260925220000_phase_1_5_audio_storage.sql` applied live (`phase_1_5_audio_storage`)
- Private bucket `beat-audio`; table `beat_audio_assets`; no audio columns on `beats`
- Object keys opaque `.bin`; interim MIME allow-list + 50 MiB (OD-12 OPEN)
- Access Gate: anonymous / authenticated / admin upload paths; signed URL PLAYBACK 120s / DOWNLOAD 300s
- ADMIN PLATFORM upload only; USER/MODERATOR upload DENY; MODERATOR download DENY
- Unit 28 PASS; live Storage/RLS/signed URL PASS; lint / typecheck / build PASS
- Out of scope: player, limits, Quick Take, community upload, watermark, payments

---

## 2026-09-26 — PHASE 1.5 — DESIGN FREEZE LOCKED

- Commit: `0e5c491` — `docs(phase-1.5): freeze private audio storage architecture`
- Document: `docs/phases/PHASE_1_5_DESIGN_FREEZE.md`
- Pushed to `origin/main`

---

## 2026-09-25 — PHASE 1.4 — BEATS DOMAIN FOUNDATION (COMPLETE / LOCKED)

**Status:** COMPLETE / COMMITTED / PUSHED — `6cb1e9a` on `main` / `origin/main`

- Migration `20260925130000_phase_1_4_beats.sql` applied live on `rzzxrgcdogkybkiidqgw` (additive; no `db reset`)
- `beat_status` / `beat_ownership_type` enums; `public.beats` metadata table (no audio columns)
- Ownership integrity (PLATFORM⇒null owner; USER⇒required owner); status transition guards; prefer ARCHIVE
- RLS: published public read; admin write; moderator review path; ownership/status protected
- Domain: `Beat` / `BeatStatus` / `BeatOwnershipType`; central validator + transitions; `src/lib/beats/*`
- Unit 21/21 PASS; live RLS PASS; lint / typecheck / build PASS
- Docs: `BEATS.md` + PROJECT_STATE / PHASE_1 / SYSTEM_ARCHITECTURE / AUTHORIZATION / README
- Out of scope: Storage, player, downloads, Quick Take, community upload, payments
- OD-04…OD-18 remain OPEN (OD-12 OPEN)
- Next: Phase 1.5 Design Freeze (NOT STARTED)

---

## 2026-09-25 — PHASE 1.3 — DOCUMENTATION LOCK CLOSEOUT

- Docs aligned to canonical `main` @ `efe3f71`
- Phase 1.3 marked **COMPLETE / LOCKED**
- Ready for Phase 1.4 planning (no implementation in this closeout)

---

## 2026-09-25 — PHASE 1.3 — COMMIT + MAIN PROMOTION

- Commit: `efe3f71` — `feat(auth): complete phase 1.3 identity and rls`
- Branch: `cursor/phase-1-3-auth` pushed; fast-forward promoted to `main` / `origin/main`
- Identity / Auth foundation: profiles, roles, account levels, permissions, authorization helpers
- RLS + privilege escalation protection
- Live Supabase verification PASS (project `rzzxrgcdogkybkiidqgw`)
- Excluded from commit: `.env.local`, `.agents/`, `.cursor/`, `skills-lock.json`, `supabase/.temp/`

---

## 2026-09-25 — PHASE 1.3 — FINAL PRE-COMMIT AUDIT PASS

- Git: `.env.local` ignored; no secrets in diff
- Code/security review PASS (Role ≠ AccountLevel; no auto-admin; service role server-only)
- Lint / typecheck / unit / build PASS
- Status: **OWNER REVIEW COMPLETE** — **READY TO COMMIT** (commit/push not performed)

**Commit hygiene notes (non-blocking):** decide whether to include `.agents/`, `skills-lock.json`, `.cursor/mcp.json`, and `scripts/_live_verify_phase13.mjs` in the Phase 1.3 commit; `supabase/.temp/` now gitignored.

---

## 2026-09-25 — PHASE 1.3 — LIVE SUPABASE VERIFICATION PASS

- Supabase MCP configured (`.cursor/mcp.json` + user mcp) for project `rzzxrgcdogkybkiidqgw`
- MCP authenticated; identity migration applied via `apply_migration` (no `db reset`)
- Live Auth: profile auto-create → `USER` + `BEGINNER_RAPPER`
- Live RLS: own read ALLOW; cross-user DENY; display_name ALLOW; role/account_level escalation DENY
- Permission catalog writes DENY; Auth sign-in / session / sign-out PASS
- Unit 6/6 PASS; lint / typecheck / build PASS
- Status: **READY FOR OWNER REVIEW** (not locked; commit/push not performed)

---

## 2026-09-25 — PHASE 1.3 — CLI ACCESS RECOVERY ATTEMPT

- Diagnosed: CLI credential in Windows Credential Manager belongs to a different Supabase account
- Visible projects: unrelated only (not BitRymDym)
- `supabase link --project-ref rzzxrgcdogkybkiidqgw` → privilege denied
- Agent shell is non-TTY → interactive `supabase login` impossible
- Blocker narrowed to: **SUPABASE_ACCESS_TOKEN** from BitRymDym-owning account
- Migration / live Auth/RLS: still not executed

---

## 2026-09-25 — PHASE 1.3 — LIVE SUPABASE VERIFICATION (PARTIAL)

- `.env.local` created locally (gitignored) for project `rzzxrgcdogkybkiidqgw`
- Auth API health: OK
- Identity migration: **NOT APPLIED** (CLI link denied for this project; no DB password / Management token)
- Live Auth/RLS suite: **NOT RUN**
- Result: **BLOCKED** — awaiting migration apply path from Owner

**Static security audit:** PASS · **Unit:** PASS · **Live RLS:** BLOCKED

---

## 2026-09-25 — PHASE 1.3 — LIVE SUPABASE VERIFICATION ATTEMPT

- Runtime check performed: `.env.local` absent; no BitRymDym project linked
- Local Docker Supabase unavailable
- Unrelated CLI-visible org projects: not used
- Migration / live Auth / live RLS: **not executed**
- Result: **SUPABASE RUNTIME UNAVAILABLE** / **BLOCKED**

**Static security audit:** PASS · **Unit:** PASS · **Live RLS:** BLOCKED

---

## 2026-09-25 — PHASE 1.3 — OWNER DECISIONS CLOSED

- OD-19 closed
- BEGINNER_RAPPER approved as signup default
- OD-20 closed
- no automatic first-admin mechanism
- manual/operator-controlled admin bootstrap
- live Supabase verification remains pending

**Static security audit:** PASS · **Live RLS:** BLOCKED (credentials)

---

## 2026-09-25 — PHASE 1.3 — AUTH + USERS / ROLES / PERMISSIONS / PROFILES

**Status:** PENDING OWNER REVIEW

- Supabase Auth integration (sign-up / sign-in / sign-out) — minimal UI
- `profiles` + trigger on Auth user create (default role `USER`)
- Roles: ADMIN / MODERATOR / USER; Account levels: working SSOT names
- Permission catalog seeded from SSOT §36 examples; role mapping ADMIN + MODERATOR
- Server authorization helpers (`requireUser` / `requireRole` / `requirePermission`)
- RLS + privilege-escalation trigger in SQL migration
- Unit tests for authorization helpers
- Docs: AUTHORIZATION.md; OD-19 / OD-20 initially OPEN (closed in later entry same day)
- Live Supabase project credentials: not configured in agent environment

**Not included:** Beats, tracks, audio, Quick Take, downloads, payments, admin panel, auto-admin bootstrap.

---

## 2026-09-25 — PHASE 1.2 — APPLICATION SCAFFOLD / TECHNICAL BOOTSTRAP

**Status:** LOCKED (Owner APPROVED)

- Next.js 16 App Router + TypeScript + Tailwind CSS v4
- shadcn/ui baseline (minimal `Button` + utils) as technical base only
- BitRymDym Design System foundation (`src/styles/tokens.css`, `src/components/brand`)
- Supabase client integration stubs (`src/lib/supabase/*`) — no schema / Auth / RLS / Storage
- `.env.example` placeholders only
- Base application shell `/` + `loading` / `error` / `not-found`
- Domain type foundation (`Role` ≠ `AccountLevel`)
- Validation: lint PASS, typecheck PASS, build PASS
- Documentation updated (PROJECT_STATE, PHASE_1, APPLICATION_SCAFFOLD, architecture)

**Not included:** Auth, Users, Roles, Permissions, Profiles, beats, player, Quick Take, downloads, payments, production Supabase setup.

---

## 2026-09-25 — Foundation Documentation Baseline LOCKED

- OD-01 closed
- OD-02 closed
- OD-03 closed
- System Architecture documented
- Project State established
- Documentation Continuity Rule established
- Foundation documentation approved by Owner
- No application implementation started

**Foundation Documentation Baseline:** LOCKED
**Application implementation:** not started.

---

## 2026-09-25 — Foundation documentation closeout (pre-lock)

- OD-01 CLOSED / ACCEPTED (frontend stack)
- OD-02 CLOSED / ACCEPTED (Next.js application server)
- OD-03 CLOSED / ACCEPTED (Supabase infrastructure)
- System architecture baseline udokumentowany (`docs/architecture/SYSTEM_ARCHITECTURE.md`)
- Documentation Continuity Rule ustanowiona (`docs/DOCUMENTATION_CONTINUITY.md`)
- Project State utworzony (`docs/PROJECT_STATE.md`)
- Aktualizacja OPEN_DECISIONS, DECISION_LOG, SSOT (zgodność z OD-01–03), PHASE_1, docs README
