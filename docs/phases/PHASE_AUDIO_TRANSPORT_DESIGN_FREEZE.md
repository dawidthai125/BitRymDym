# Audio Transport V1 â€” Design Freeze

**Status:** **APPROVED / OWNER GO** Â· Implementation **CLOSED / PRODUCTION VERIFIED** @ `73e213c`
**Date:** 2026-09-27
**Depends on:** Phase 1.5 Storage Â· Phase 1.7 admin ops Â· BPM Production V1 (`471dd5b`)

```text
TRANSPORT = SIGNED BINARY UPLOAD â†’ PRIVATE beat-audio
NOT = base64 Server Action JSON
NOT = serverActions.bodySizeLimit as the fix
BPM V1 = UNCHANGED (C_NEAR + RULE B)
MODEL = DRAFT-beat-first (Beat â†’ Asset â†’ Storage)
NO NEW TABLES / BUCKET / CRON IN V1
```

---

## 1. Problem

Admin audio-first UI encoded files with `FileReader.readAsDataURL` â†’ base64 â†’ Server Action JSON.

Next.js default **Server Action body limit = 1 MB**.

Live E2E: `bpm-120-steady.wav` (~2.6 MB) â†’ **413 Body exceeded 1 MB limit** before analyze/create.

Domain contract `BEAT_AUDIO_MAX_BYTES = 50 MiB` was unreachable via UI.

Affected:

- `analyzeAdminBeatAudioAction({ base64 })`
- `createPlatformBeatWithMasterAction({ base64 })`
- `uploadPlatformBeatAudioAction({ base64 })`

---

## 2. Decision

| Choice | Status |
|--------|--------|
| Raise only `serverActions.bodySizeLimit` | **REJECTED** as architecture fix |
| Route Handler multipart as sole path | **NOT selected** for V1 (Vercel serverless body limits conflict with 50 MiB) |
| **Signed upload to private Storage (C)** | **SELECTED** |

**Why signed upload:** Client sends binary to Supabase Storage with a **server-issued, short-lived** signed upload URL. Next.js never receives multiâ€‘MB audio bodies. Meets Phase 1.5 50 MiB + private bucket. Phase 1.5 already allowed â€ścarefully scoped signed upload URL + AuthZâ€ť.

Server still:

- AuthZ before issuing URL
- Chooses final `object_key` (`platform/{beatId}/{assetId}/master.bin`)
- Validates MIME/size
- Runs BPM analysis from Storage bytes
- Finalizes READY only after business rules

---

## 3. Target flow (create)

```text
CLIENT FILE
  â†’ AUTH + ADMIN AUTHZ
  â†’ POST session (JSON: declared size/MIME/filename)
  â†’ create PLATFORM DRAFT (provisional bpm/duration)
  â†’ create asset PENDING_UPLOAD + signed upload URL
  â†’ CLIENT binary uploadToSignedUrl (private bucket)
  â†’ POST analyze (JSON: beatId, assetId)
  â†’ server download bytes â†’ duration + BPM V1
  â†’ UI AUTO_SUGGEST | MANUAL_REQUIRED
  â†’ finalize Server Action (JSON metadata + bpm + override)
  â†’ re-download â†’ re-analyze â†’ resolveCreateBpm
  â†’ update beats.bpm (+ metadata) Â· asset â†’ READY
  â†’ Beat remains DRAFT (no auto-publish)
```

---

## 4. DRAFT-beat-first

Reuse existing model only:

- `beats` Â· `beat_audio_assets` Â· bucket `beat-audio`
- Lifecycle: `PENDING_UPLOAD` â†’ `READY` | `FAILED` (also `REPLACED` / `ARCHIVED` as today)
- Object key SSOT: `platform/{beatId}/{assetId}/{purpose}.bin`

**No** staging prefix product model Â· **no** new tables Â· **no** TTL cron Â· **no** new bucket.

**Provisional draft fields:** `bpm = 1`, `duration_seconds = 1` until analyze/finalize overwrite. Provisional BPM is **not** a detector result and must never remain after successful finalize. Asset must **not** be READY until finalize succeeds.

---

## 5. BPM V1 (frozen â€” do not change)

Canonical commit: **`471dd5b`**

```text
A = tempo() Â· B = combTempo()
â†’ C_NEAR â†’ RULE B
â†’ AUTO_SUGGEST | MANUAL_REQUIRED
â†’ resolveCreateBpm (override / match / manual)
â†’ beats.bpm â [1, 300] integer
```

Transport supplies **bytes only**. No detector / RULE B / confidence UX changes.

Formats: WAV/MP3 auto Â· FLAC/AAC/M4A manual fallback.

---

## 6. Security gates

```text
REQUEST â†’ AUTH â†’ AUTHZ (ADMIN + beats.create/edit)
â†’ VALIDATION (MIME + â‰¤50 MiB)
â†’ PRIVATE STORAGE (signed upload TTL; no public permanent URL)
â†’ SERVER ANALYSIS
â†’ BUSINESS RULE (resolveCreateBpm)
â†’ DB + READY
```

**Forbidden:**

- service-role in browser
- permanent public audio URL
- client-chosen final object key
- unauthorized Storage write
- analysis failed â†’ READY
- invalid audio â†’ READY
- BPM mismatch without override â†’ accept as auto

---

## 7. Failure paths

| State | Behavior |
|-------|----------|
| UPLOAD_FAILED | asset `FAILED`; no READY |
| ANALYSIS_FAILED | asset `FAILED` (or remains non-READY); no READY |
| VALIDATION_FAILED | reject; no READY |
| DB_FAILED | no false READY |
| FINALIZE_FAILED | asset stays non-READY |

**Known gap (documented, not built):** orphan objects / abandoned DRAFT+PENDING without cron janitor.

---

## 8. MASTER replace

Existing beat MASTER replace uses the same signed binary transport (session â†’ upload â†’ server complete â†’ READY). No base64 Server Action. Access Gate unchanged.

---

## 9. Limits

- Domain SSOT: `BEAT_AUDIO_MAX_BYTES = 50 MiB` (server)
- Client check = UX only
- Do **not** treat SA `bodySizeLimit` as the audio transport solution

---

## 10. UX (minimal)

SELECT â†’ UPLOAD PROGRESS â†’ ANALYZING â†’ BPM AUTO/MANUAL â†’ CREATE
Errors: upload failed Â· unsupported format Â· too large Â· analysis failed Â· manual BPM required Â· create failed

Forbidden copy: confidence Â· AI Â· 100% Â· candidates

---

## 11. Scope

**IN:** admin create/analyze/MASTER binary transport Â· BPM wire-up Â· tests Â· docs

**OUT:** community upload Â· Quick Take Â· tracks Â· payments Â· waveform Â· Access Gate redesign Â· DB redesign Â· new bucket Â· new BPM detector Â· accuracy certification

---

## 12. Rollback

Revert admin UI + API routes to prior commit; Storage objects from failed attempts may remain until manual cleanup (orphan gap). BPM code at `471dd5b` untouched by transport rollback if separated cleanly.

---

## 13. Legend

| Label | Meaning |
|-------|---------|
| APPROVED | Owner GO for this freeze |
| SELECTED TRANSPORT | Signed upload (C) |
| BPM UNCHANGED | Detector + rules frozen |
| GAP | Orphan TTL / janitor deferred |

**End of Audio Transport Design Freeze.**
