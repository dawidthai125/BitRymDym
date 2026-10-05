# P0 — PLATFORM original beat master DOWNLOAD deny

**Status:** PRODUCTION VERIFIED — GREEN  
**Commit:** `fdfff71`  
**Deploy:** `dpl_7yxpB9hawcBoWGrp8YNX1pRxhhQ3` → aliased `www.bitrymdym.pl`  
**Owner GO:** TAK  
**OD-RS-R1:** KEEP — ADMIN/OPS privileged export ALLOW  
**Scope:** P0 only (P1–P6 untouched)

---

## 1. RCA

User-facing product DOWNLOAD previously treated Access Gate like PLAYBACK for ADMIN (always true) and allowed ANON/USER DOWNLOAD of PUBLISHED beats without checking `ownership_type`. PLATFORM masters were therefore downloadable via `requestBeatAudioAccess({ purpose: "DOWNLOAD" })` / `DownloadButton`, which violates the product rule:

> `ownership_type = PLATFORM` + user-facing download = **DENY**

PLAYBACK signed GET and recording source must remain ALLOW; they are not product DOWNLOAD.

---

## 2. Found download / access paths (`beat-audio`)

| Path | Role | P0 action |
|------|------|-----------|
| `requestBeatAudioAccess` + `purpose=DOWNLOAD` | User-facing Access Gate | **DENY** when `ownership_type=PLATFORM` |
| `requestBeatAudioAccessAction` | Server Action wrapper | inherits gate |
| `DownloadButton` | Beat detail CTA | Hidden for PLATFORM; still calls DOWNLOAD action |
| `requestBeatAudioAccess` + `purpose=PLAYBACK` | Player / Mix / recording source | **ALLOW** (unchanged) |
| `requestPlatformBeatOpsExport` | ADMIN/OPS only | **ALLOW** PLATFORM (privileged, `download: true`) |
| `AdminPlatformOpsExportButton` | Admin beat page | OPS export only |
| `api/admin/beats/[id]/master` | Upload session/complete only | Not a download path |
| Direct Storage / public bucket | N/A (private + signed URL) | No change |
| Take / mix / render download helpers | Other resources | Out of scope (no unified `canDownload()`) |

---

## 3. Authorization gate

- New helper: `canDownloadOriginalBeatMaster({ actor, beatStatus, ownershipType })`
- `canRequestBeatAudioAccess` for `DOWNLOAD` delegates to that helper
- Invariant: `ownershipType === "PLATFORM"` → always `false` on user-facing DOWNLOAD (including ADMIN)
- Missing / unknown ownership on DOWNLOAD → fail closed
- PLAYBACK ignores ownership (PUBLISHED for all; staff for non-published)
- Server loads `ownership_type` in `loadBeatForAccess` **before** signed URL mint
- Deny message: `Original platform beat download is not available.` → PL: `Pobieranie oryginalnego bitu jest niedostępne.`

AccountLevel / Premium tiers are intentionally unused for P0.

---

## 4. Admin / OPS separation

- Privileged path: `requestPlatformBeatOpsExport` / `requestPlatformBeatOpsExportAction`
- Requires `requireRole(["ADMIN"])`
- Ownership-aware: PLATFORM only
- Signed URL with `download: true`
- Purpose label: `OPS_EXPORT` (not user-facing `DOWNLOAD`)
- Not wired into `DownloadButton`
- Admin UI: `AdminPlatformOpsExportButton` on `/admin/beats/[id]`

---

## 5. Playback / recording separation

- PLAYBACK signed GET remains ALLOW for PLATFORM
- Mix session beat source uses PLAYBACK
- Recording surfaces use PLAYBACK / player — not DOWNLOAD
- Signed PLAYBACK URL is not treated as product DOWNLOAD (no slot / DOWNLOAD_EVENT)

---

## 6. Test matrix

| # | Case | Expected | Result |
|---|------|----------|--------|
| 1 | PLATFORM + ANON + DOWNLOAD | DENY | PASS (unit) |
| 2–5 | PLATFORM + FREE/BRONZE/SILVER/GOLD (USER actor) + DOWNLOAD | DENY | PASS (unit) |
| 6 | PLATFORM + ADMIN user-facing DOWNLOAD | DENY | PASS (unit + prod) |
| 7 | PLATFORM + authorized OPS export | ALLOW | PASS (prod ADMIN) |
| 8 | USER-owned DOWNLOAD | existing ALLOW rules kept | PASS (unit) |
| 9 | PLATFORM PLAYBACK | ALLOW | PASS (unit + prod) |
| 10 | PLATFORM recording source (PLAYBACK) | ALLOW | PASS (UI surface + PLAYBACK) |
| 11 | Signed PLAYBACK ≠ product DOWNLOAD | contract | PASS (prod HEAD 200; DOWNLOAD action DENY) |
| 12 | Direct DownloadButton / action bypass | server DENY | PASS (prod Server Action) |
| 13 | Forged / missing beat | NOT_FOUND / DENY | PASS (prod forged UUID) |
| 14 | IDOR (ownership fail-closed) | DENY | PASS (unit) |

Primary file: `src/lib/beats/p0-platform-download-deny.test.ts`  
Also updated: `audio-validation.test.ts`, `authz-regression.test.ts`, `security-contract.test.ts`, `community-wave4.test.ts`, `user-errors.test.ts`, `od17-semantics.test.ts`.

Local targeted: **137/137 PASS**.

---

## 7. Bypass tests

- UI hide is not the boundary — gate + server action enforce DENY
- OPS export is separate; DownloadButton never calls it
- No unified `canDownload()` across take/mix/render
- DOWNLOAD without `ownershipType` fails closed

---

## 8. Data safety

P0 is **code / access-policy only**.

Post-deploy production snapshot (unchanged):

| metric | value |
|--------|-------|
| beats_total | 17 |
| beats_published | 17 |
| beats_platform | 17 |
| assets_ready | 17 |
| takes_total | 1 |

Sample PLATFORM beat `ee65a815-…` Bit By DTT BPM **92** unchanged. No Storage migration.

---

## 9. Changed files

- `src/lib/beats/audio-validation.ts` — `canDownloadOriginalBeatMaster` + DOWNLOAD ownership gate
- `src/lib/beats/audio-access.ts` — load ownership; PLATFORM deny; OPS export
- `src/lib/beats/audio-actions.ts` — OPS export action
- `src/lib/beats/public.ts` / `src/lib/ui/user-errors.ts` — PL deny message
- `src/app/beat/[id]/page.tsx` + `beat-detail-client.tsx` — hide PLATFORM DownloadButton
- `src/components/admin/admin-platform-ops-export-button.tsx` — OPS UI
- `src/app/admin/beats/[id]/page.tsx` — wire OPS button
- Tests listed in §6
- This report + evidence JSON

---

## 10. Remaining out of scope (untouched)

- **P1** Premium sample matrix  
- **P2** TTL  
- **P3** quota  
- **P4** replace / claim  
- **P5** GOLD take download / plays / ratings  
- **P6** USER-owned beat policy reopen / R3 / R4  

BPM Quality V2: closed, not reopened.

---

## Production verify

| Check | Result |
|-------|--------|
| PLATFORM playback | PASS (Player Pauza + Server Action PLAYBACK URL) |
| PLATFORM recording source | PASS (Nagraj surface present; PLAYBACK ALLOW) |
| PLATFORM master download | DENY (`Pobieranie oryginalnego bitu jest niedostępne.`) |
| Direct download Server Action | DENY (no signed URL) |
| Signed PLAYBACK GET | PASS (HEAD 200 `audio/mpeg`) |
| ADMIN OPS export | PASS (signed URL with `download=`) |
| Data / Storage mutation | NONE |

### P0 PLATFORM MASTER DOWNLOAD:
**PRODUCTION VERIFIED — GREEN**
