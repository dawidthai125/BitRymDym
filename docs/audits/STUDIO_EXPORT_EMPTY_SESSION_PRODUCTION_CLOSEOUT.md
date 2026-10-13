# Studio Export — Empty-Session Production Closeout

**Status:** **PASS** (empty-session production gate only)  
**Date:** 2026-10-13  
**Unit:** GO-EMPTY-SESSION-PROD-EXECUTE + GO-CONTABO-ONESHOT (execution) · this file = docs closeout only  
**Living SSOT:** [PROJECT_STATE.md](../PROJECT_STATE.md)  
**Criteria:** [FINAL_MIX_PRODUCTION_GREEN_CRITERIA_FREEZE.md](../decisions/FINAL_MIX_PRODUCTION_GREEN_CRITERIA_FREEZE.md) gate **#6**  
**Local precursor (≠ prod):** [STUDIO_EXPORT_I18_EMPTY_SESSION_INTEGRATION.md](./STUDIO_EXPORT_I18_EMPTY_SESSION_INTEGRATION.md)

```text
Empty-session production gate: PASS
Stage J: CLOSED (unchanged)
FULL FIXTURE VERIFIED: NOT CONFIRMED
Final Mix Production GREEN: NOT VERIFIED
P6.8: NOT STARTED
Contabo always-on: OPEN / NOT VERIFIED · persistent worker disabled/inactive
```

---

## 1. Purpose

Record a durable, auditable **PASS** for the Final Mix **IN** gate: controlled production empty / fully muted Studio session export → terminal **`FAILED`** with public/allowlisted **`STUDIO_RENDER_EMPTY_SESSION`**, and **no** SUCCEEDED / READY / WAV artifact.

This closeout does **not** declare **Final Mix Production GREEN**, does **not** set **FULL FIXTURE VERIFIED**, and does **not** enable Contabo always-on.

---

## 2. Fixture (Owner-prepared · GO-FIXTURE-EMPTY)

| Item | Value |
|------|--------|
| `projectId` | `a8b42570-be37-4df5-82b7-bbefefc025b9` |
| `documentVersion` (pre-enqueue) | **9** |
| Timeline source | **1× `BEAT_REF`** (Owner PLATFORM catalog beat) |
| Track Bit | `muted: true` · `solo: false` |
| BEAT_REF clip | `muted: true` |
| Audible TAKE/BEAT_REF (mute/solo logic) | **0** |
| Historical WAV projects `bfc3d223-…` / `d07f3011-…` | **not used** |

---

## 3. Preflight (before enqueue)

- Authorized Owner browser session (normal app AuthZ · no service-role bypass).
- Fresh document read: version **9** · muted Bit + muted BEAT_REF · `audibleCount = 0`.
- `GET …/export` (no `jobId`): `found: false` before this attempt.
- Contract tip: `POST { expectedDocumentVersion, idempotencyKey }` · public failure allowlist includes `STUDIO_RENDER_EMPTY_SESSION`.

---

## 4. Enqueue (single POST)

| Item | Value |
|------|--------|
| Request | `POST /api/studio/projects/{projectId}/export` |
| `expectedDocumentVersion` | **9** |
| HTTP | **200** |
| `jobId` | `dac8ccb9-4bb1-48e9-848a-e8bfeb65d4fb` |
| `kind` | `STUDIO_EXPORT` |
| Initial `status` | `QUEUED` |
| `artifactId` | `null` |
| `workerInfraStatus` | `PREPARED_CODE` |
| Second POST | **none** |

---

## 5. Worker (single Contabo oneshot)

| Item | Value |
|------|--------|
| Host | `vmi3622761` / `ubuntu@161.97.72.197` |
| Path | I.45DR-approved: transient `systemd-run --wait --collect` · uid/gid `bitrymdym-e3` · `WorkingDirectory=/opt/bitrymdym-e3-worker` · `EnvironmentFile=-/etc/bitrymdym-e3-worker/worker.env` |
| Command | `npm run e3:worker:once -- dac8ccb9-4bb1-48e9-848a-e8bfeb65d4fb` |
| Unit | `bitrymdym-e3-empty-dac8ccb9.service` (collected after run) |
| Runtime | ≈ **8.4 s** |
| Process exit | **1** (controlled failure path · same class as local I.18) |
| Always-on after | `bitrymdym-e3-worker.service` **disabled / inactive** |
| Other jobs | **not** processed |

---

## 6. Terminal contract verification

| Check | Result |
|-------|--------|
| `status` | **FAILED** |
| Public `errorCode` | **`STUDIO_RENDER_EMPTY_SESSION`** |
| `artifactId` | **null** |
| SUCCEEDED | **absent** |
| READY / WAV artifact | **absent** |
| Public message | Allowlisted Polish empty-session copy (I.17 variant B) · ≠ raw DB/renderer text |

**Gate verdict:** **PASS**

---

## 7. Evidence limits (binding)

- Proves **one** production empty/muted-session controlled reject for the listed fixture/job.
- Does **not** prove full Live↔Offline PCM parity, Contabo always-on, or byte-level WAV QC for a successful export.
- Does **not** satisfy **FULL FIXTURE VERIFIED** (separate IN gate).
- Does **not** authorize Final Mix Production GREEN closeout.
- Local I.18 remains a separate historical evidence class (≠ this production PASS).

---

## 8. Explicit non-actions (this docs unit)

No production HTTP · no Contabo · no worker · no SQL/migrations · no deploy · no application code · no Sacred WIP · no dirty-worktree sync · no cookies/tokens/signed URLs/audio bytes retained.

---

## 9. Stop line

```text
Empty-session production gate: PASS
jobId: dac8ccb9-4bb1-48e9-848a-e8bfeb65d4fb
errorCode: STUDIO_RENDER_EMPTY_SESSION
artifactId: null
Stage J: CLOSED
FULL FIXTURE VERIFIED: NOT CONFIRMED
Final Mix Production GREEN: NOT VERIFIED
NEXT: Owner GO — FULL FIXTURE VERIFIED and/or Final Mix GREEN closeout (separate) · ≠ GREEN yet
```
