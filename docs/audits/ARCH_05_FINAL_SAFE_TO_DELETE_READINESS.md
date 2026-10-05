# ARCH-05 — FINAL SAFE-TO-DELETE READINESS AUDIT

**Phase:** ARCH-05 FINAL SAFE-TO-DELETE READINESS AUDIT  
**Status:** **SUPERSEDED by DELETE EXECUTION** (was READY FOR OWNER DELETE GO)  
**Date:** 2026-10-05  
**Owner GO scope (this audit):** AUDIT ONLY — delete later executed under separate GO  
**Evidence:** [ARCH_05_FINAL_SAFE_TO_DELETE_READINESS_EVIDENCE.json](./ARCH_05_FINAL_SAFE_TO_DELETE_READINESS_EVIDENCE.json)  
**Allowlist:** [ARCH_05_DELETE_ALLOWLIST.json](./ARCH_05_DELETE_ALLOWLIST.json)  
**Execution (historical):** [ARCH_05_DELETE_EXECUTION.md](./ARCH_05_DELETE_EXECUTION.md)  
**Living closeout:** [ARCH_05_POST_DELETE_RECONCILIATION.md](./ARCH_05_POST_DELETE_RECONCILIATION.md)  
**Operator:** `scripts/arch-05-safe-to-delete-readiness-audit.ts`

```text
AUDITED              = YES
BACKED UP            = 32/32 (Local Layer-2 + VPS Layer-1)
RESTORE VERIFIED     = 32/32 (local isolated drill)
SAFE                 = 32/32
OWNER APPROVED       = YES (later Owner GO — ARCH-05 DELETE)
DELETED              = 32/32 (see ARCH_05_DELETE_EXECUTION.md)
```

---

## 1. Fresh production inventory

| Class | Count | Bytes |
|-------|------:|------:|
| USER | 8 | (included in total) |
| PLATFORM | 3 | (included in total) |
| ORPHAN | **32** | 84673408 |
| UNKNOWN | 0 | 0 |
| TOTAL | **43** | **111574892** |

**DRIFT:** NO

---

## 2. Ladder

```text
PROPOSED → BACKED UP → RESTORE VERIFIED → SAFE
OWNER APPROVED = NOT GIVEN
DELETED = 0
```

This audit promotes **RESTORE VERIFIED → SAFE** only.  
It does **not** authorize DELETE.

---

## 3. Backup / restore evidence (shared)

| Plane | Run ID | Result |
|-------|--------|--------|
| Local Layer-2 backup | `local-layer2-full-20261005T040146Z-42d6212b` | 43/43 SHA+MANIFEST |
| Local restore drill | `local-restore-20261005T040831Z-76ca3678` | 43/43 SHA+SIZE+WAV+ffprobe |
| VPS Layer-1 | Phase 6 | 43/43 BACKED UP (context) |

Each of the 32 orphans was verified against local objects + manifests + restore evidence (exact key, size, SHA).

---

## 4. FAR-01 disposition

Living SSOT ([FAR_01_CURRENT_STATE.md](./FAR_01_CURRENT_STATE.md)):

- FAR-01 retained sources present now: **0**
- FAR-01 RETIREMENT: **NOT EXECUTED**
- These 32 are **historical / orphan / delete-residue** candidates for ARCH-05 — **not** FAR-01 retirement targets

| Key shape | Count |
|-----------|------:|
| legacy `…/master/{id}.bin` | 28 |
| canonical_v2 `…/master.bin` | 4 |

**FAR01_RETENTION_NO = PASS** for all 32 (no living retain hold).  
FAR-01 campaign remains CONTAMINATED / NOT CLOSED as a campaign fact; it does not block SAFE for these keys under current evidence.

---

## 5. Per-object matrix summary

Required flags (all PASS for SAFE):

`ORPHAN_CONFIRMED` · `AUTH_ABSENT` · `PROFILE_ABSENT` · `BEAT_REF_0` · `ASSET_REF_0` · `TAKE_REF_0` · `ARTIFACT_REF_0` · `PLATFORM_NO` · `RETENTION_NO` · `FAR01_RETENTION_NO` · `QUARANTINE_NO` · `MIGRATE_NO` · `LOCAL_BACKUP_VERIFIED` · `LOCAL_RESTORE_VERIFIED`

Also: production object exists · size match · `version_id` captured · allowlist bound to version.

---

## 6. Object table

| # | object_key | classification | DB refs | retention | backup | restore | SAFE |
|---|---|---|---:|---|---|---|---|
| 1 | `user/1f1c5cfc-addc-42af-aee2-e87b09baf7ef/13688975-a77a-4649-8ced-2ed2c2e66055/master/ce8a64ee-4421-4ded-909f-ff4f764b4d68.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 2 | `user/2e454a67-851b-4160-90af-e67bbc58dd55/c91e0c6c-19bc-4613-834e-a940f5cd6ea9/d0633b35-023e-413c-b31b-ff279eb0a4e8/master.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 3 | `user/384dc32d-c4af-4673-bb4e-0a5e2bc189e4/832ab70f-3b1c-4034-88fe-cdef95038669/d27a8bda-a7d0-4518-8bd2-133c99d6e4e6/master.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 4 | `user/3cff9c2d-b57a-4a81-b1d4-df917a3d1a83/2a2e5cc7-3818-428f-a3f7-49af895f3d4b/master/a8776adf-79fa-4e11-865c-85e404a43be1.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 5 | `user/4a0124dc-16e8-49f5-bcac-de9da1a79d2b/eb626f7c-e731-446f-9c23-6dcf4c182db2/master/9b6318ef-5a33-489d-b965-a97bde723580.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 6 | `user/518e8a32-fdbf-408b-a63e-98bb621f8c5e/3f654778-200b-481d-ad1d-ea83f3b73326/master/1da31499-c134-4101-9912-2ebcb16a9e1c.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 7 | `user/51a5455b-bfad-4680-a215-9eb95cc56e8e/8ba4dc25-ccda-464a-ae14-094d63dfc37b/62e310c2-ab4f-48f3-93a4-49fe2c471a5d/master.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 8 | `user/5d85440a-4871-43b1-ab06-d92da24bebe3/af189b71-26fb-4a23-9114-a895f4844489/master/bb885dd0-8e10-4809-8302-35a36a7353a7.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 9 | `user/641ac0c3-9bc5-4bef-9780-8432c456044c/2c925f3b-5e45-4722-bdd0-6d9726e521d2/master/e948dfb7-fd34-446f-99e8-c966a59cb23f.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 10 | `user/73947bf8-df03-497d-896f-4108a3b36d36/f4bae7e8-a8ab-49cc-96f7-4b140e2af97e/master/20463455-040c-4f61-aa0b-67d4f6ca4206.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 11 | `user/76163dfb-4cb6-4cdf-84c8-84913f2b1bea/b81dff87-a60e-4dc8-9632-7dce3ce505f4/master/78971597-5823-4cc9-86d1-04b16555550f.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 12 | `user/80d5e96d-7adc-4404-83f9-4e1fdf6f79e9/b00d7750-541e-4828-bec6-20e06f715488/master/c1f5ac14-b881-47e0-8277-2cf0d2bd52c0.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 13 | `user/82cad961-aaa7-453a-84d7-879083e8d100/ea97e1b6-d920-40c6-90f9-a6d7424f92f0/master/98fd2671-fdd2-49cb-ad36-000d271db385.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 14 | `user/82ce8b8f-672d-4ee3-ba6d-0e3a661da3a1/08162b30-554c-4f94-8f15-07e7a89b27e5/master/c9cb48eb-ce5a-4ad1-86b4-c3b6fd2b77d5.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 15 | `user/8ce3ec66-7abd-4258-af61-cc4234129868/495c5903-fefb-47ee-961c-0afff2d187b6/master/c467185f-c5fd-43aa-905e-fdb5f00a79c5.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 16 | `user/9a563d3f-d0ee-4db1-9a6f-ea2926180e23/ff759f1c-3136-4fe7-a68f-bb59aab7749c/master/9b768cac-db99-40b2-87b8-3800612cfdd1.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 17 | `user/9dae86a4-cdd4-43e8-92d4-61a73a2a28a6/39986429-15d1-49fb-97e2-e0cefd60d729/master/d35f3c6a-ef9f-4f17-b2eb-fb3a31c90498.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 18 | `user/b83550d7-d75a-4c85-abae-9db50a634d06/8b7bd5df-9136-4d7c-b036-fe4e4e7093a5/master/22572141-b786-4c3b-b093-9eee543124bb.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 19 | `user/b91ad2fd-739f-41ec-b8b4-ef6e7e91626f/1a61cd77-6ccc-4ebe-91fe-ff5974982580/32892c5c-5f09-4f28-9f21-ab7d4e8ac64f/master.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 20 | `user/bd84f4ef-c44d-45ac-a816-504535af7d4d/6900317e-42da-44f7-a92c-0d9928eebfb9/master/3b01c382-5c9c-4e6d-9bb2-1645937d6018.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 21 | `user/c0400f9c-eddb-4e9e-93b7-d56caa506dcd/b8785544-096a-484c-940e-3d3815071727/master/25375d64-9063-4f3b-be0c-bab6586c86be.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 22 | `user/cae53ec7-824f-4753-b43c-44d22fd06f39/f2855e97-5d83-404e-aa26-12b44fd73d10/master/e52c8b2f-3515-458e-ae34-435ca3adbf25.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 23 | `user/cb6eb74d-2e31-4216-82b0-2e56194669eb/4b362260-7587-484f-bc5f-bb2e17b60e68/master/cae8ebe0-db3c-4356-be9e-a86a86254350.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 24 | `user/d138f834-a700-4b79-8ade-6080c6ac3d45/02198f36-d31e-4052-8f29-349e075b8645/master/a65ea063-75bc-4b81-91cb-c0fb08503125.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 25 | `user/d369347d-5174-43e8-90ed-76a387cbed8a/03e8c6f1-1b5f-4564-a0e5-81899f3581eb/master/380bcb82-0b6d-4200-9bf0-c50f45e33da2.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 26 | `user/d369347d-5174-43e8-90ed-76a387cbed8a/538e34f2-74e8-48df-a88b-0a11710f8a4e/master/3f8a38a7-2fda-49e6-b545-da0a8d5ca7ab.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 27 | `user/d369347d-5174-43e8-90ed-76a387cbed8a/c40fa60b-7682-4900-822d-ceac8b5bbcf4/master/8da74881-8269-4c46-bf9f-9d65839ffd3c.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 28 | `user/e48f2f09-3310-485a-83e5-f66a1fba2a37/47a31903-b5ff-406c-99db-5f7728adb372/master/7b163bc0-622e-4a8a-813e-8f4e9b928f7a.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 29 | `user/e48f2f09-3310-485a-83e5-f66a1fba2a37/970ac165-1f62-493d-a0ea-ec718ad4485a/master/c5a77364-5bf2-447b-92b6-5733cfb9eb28.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 30 | `user/e48f2f09-3310-485a-83e5-f66a1fba2a37/ab89d2e6-50a8-4693-bd36-e5edfad07b67/master/1c07435b-eb33-4f88-bb4b-299741ffb73d.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 31 | `user/eba0e942-33c7-4cfc-91b1-db727478b4ab/84a9fcf5-b372-4429-8334-464a459db409/master/a515bc9c-f507-4850-8813-5b05b23ca413.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |
| 32 | `user/f33a9299-11a1-4d1c-aa35-1f3d22cb7398/eb88f509-5eda-44a7-a2ed-7900952567b0/master/9053b595-531d-4a74-ae59-2b1fbb12b98d.bin` | ORPHAN | 0 | NO | VERIFIED | VERIFIED | YES |

---

## 7. Totals

```text
TOTAL ORPHANS: 32
SAFE: 32
NOT SAFE: 0
UNKNOWN: 0
BACKED UP: 32/32
RESTORE VERIFIED: 32/32
OWNER APPROVAL: NOT GIVEN
DELETE EXECUTED: 0
ARCH-05: READY FOR OWNER DELETE GO
```

---

## 8. Allowlist / staleness

- `ALLOWLIST_CREATED_AT`: see JSON `allowlist_created_at`
- `ALLOWLIST_VALIDATION_STATE`: `VALID_AT_CREATION`
- Becomes **STALE** after: new upload · key/version change · DB ref change · owner/auth/profile change · retention/FAR-01 change
- Delete must use **object_key + version_id** (not key alone)

**DELETE requires separate:** `OWNER GO — ARCH-05 DELETE`

---

## 9. Mutation ledger

```text
SUPABASE: READ ONLY
PRODUCTION STORAGE: NO DELETE
PRODUCTION DB: READ ONLY
AUTH: READ ONLY
VPS: READ ONLY
LOCAL BACKUP: READ ONLY
AWS: NO MUTATION
DELETE: 0
COMMIT: NO
PUSH: NO
DEPLOY: NO
```

---

## 10. STOP

Do **not** delete. Wait for Owner REVIEW → optional `OWNER GO — ARCH-05 DELETE`.
