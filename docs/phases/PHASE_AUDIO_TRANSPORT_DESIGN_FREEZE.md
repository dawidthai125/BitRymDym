# Audio Transport V1 — Design Freeze

**Status:** **APPROVED / OWNER GO** · Implementation **COMMITTED** · Deploy **PENDING VERCEL**  
**Date:** 2026-09-27  
**Depends on:** Phase 1.5 Storage · Phase 1.7 admin ops · BPM Production V1 (`471dd5b`)

```text
TRANSPORT = SIGNED BINARY UPLOAD → PRIVATE beat-audio
NOT = base64 Server Action JSON
NOT = serverActions.bodySizeLimit as the fix
BPM V1 = UNCHANGED (C_NEAR + RULE B)
MODEL = DRAFT-beat-first (Beat → Asset → Storage)
NO NEW TABLES / BUCKET / CRON IN V1
```

---

## 1. Problem

Admin audio-first UI encoded files with `FileReader.readAsDataURL` → base64 → Server Action JSON.

Next.js default **Server Action body limit = 1 MB**.

Live E2E: `bpm-120-steady.wav` (~2.6 MB) → **413 Body exceeded 1 MB limit** before analyze/create.

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

**Why signed upload:** Client sends binary to Supabase Storage with a **server-issued, short-lived** signed upload URL. Next.js never receives multi‑MB audio bodies. Meets Phase 1.5 50 MiB + private bucket. Phase 1.5 already allowed “carefully scoped signed upload URL + AuthZ”.

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
  → AUTH + ADMIN AUTHZ
  → POST session (JSON: declared size/MIME/filename)
  → create PLATFORM DRAFT (provisional bpm/duration)
  → create asset PENDING_UPLOAD + signed upload URL
  → CLIENT binary uploadToSignedUrl (private bucket)
  → POST analyze (JSON: beatId, assetId)
  → server download bytes → duration + BPM V1
  → UI AUTO_SUGGEST | MANUAL_REQUIRED
  → finalize Server Action (JSON metadata + bpm + override)
  → re-download → re-analyze → resolveCreateBpm
  → update beats.bpm (+ metadata) · asset → READY
  → Beat remains DRAFT (no auto-publish)
```

---

## 4. DRAFT-beat-first

Reuse existing model only:

- `beats` · `beat_audio_assets` · bucket `beat-audio`
- Lifecycle: `PENDING_UPLOAD` → `READY` | `FAILED` (also `REPLACED` / `ARCHIVED` as today)
- Object key SSOT: `platform/{beatId}/{assetId}/{purpose}.bin`

**No** staging prefix product model · **no** new tables · **no** TTL cron · **no** new bucket.

**Provisional draft fields:** `bpm = 1`, `duration_seconds = 1` until analyze/finalize overwrite. Provisional BPM is **not** a detector result and must never remain after successful finalize. Asset must **not** be READY until finalize succeeds.

---

## 5. BPM V1 (frozen — do not change)

Canonical commit: **`471dd5b`**

```text
A = tempo() · B = combTempo()
→ C_NEAR → RULE B
→ AUTO_SUGGEST | MANUAL_REQUIRED
→ resolveCreateBpm (override / match / manual)
→ beats.bpm ∈ [1, 300] integer
```

Transport supplies **bytes only**. No detector / RULE B / confidence UX changes.

Formats: WAV/MP3 auto · FLAC/AAC/M4A manual fallback.

---

## 6. Security gates

```text
REQUEST → AUTH → AUTHZ (ADMIN + beats.create/edit)
→ VALIDATION (MIME + ≤50 MiB)
→ PRIVATE STORAGE (signed upload TTL; no public permanent URL)
→ SERVER ANALYSIS
→ BUSINESS RULE (resolveCreateBpm)
→ DB + READY
```

**Forbidden:**

- service-role in browser  
- permanent public audio URL  
- client-chosen final object key  
- unauthorized Storage write  
- analysis failed → READY  
- invalid audio → READY  
- BPM mismatch without override → accept as auto  

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

Existing beat MASTER replace uses the same signed binary transport (session → upload → server complete → READY). No base64 Server Action. Access Gate unchanged.

---

## 9. Limits

- Domain SSOT: `BEAT_AUDIO_MAX_BYTES = 50 MiB` (server)  
- Client check = UX only  
- Do **not** treat SA `bodySizeLimit` as the audio transport solution  

---

## 10. UX (minimal)

SELECT → UPLOAD PROGRESS → ANALYZING → BPM AUTO/MANUAL → CREATE  
Errors: upload failed · unsupported format · too large · analysis failed · manual BPM required · create failed  

Forbidden copy: confidence · AI · 100% · candidates  

---

## 11. Scope

**IN:** admin create/analyze/MASTER binary transport · BPM wire-up · tests · docs  

**OUT:** community upload · Quick Take · tracks · payments · waveform · Access Gate redesign · DB redesign · new bucket · new BPM detector · accuracy certification  

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
