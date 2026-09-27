# RECORDING WAVE 2 — IMPLEMENTATION CLOSEOUT

**Type:** Implementation closeout (facts only)  
**Date:** 2026-09-27  
**Baseline:** `dd2ffd7b486829f6cbbb0cc549527a23c1621059`  
**Owner decisions:** OD-W2-01…04 CLOSED  

```text
COMMIT / PUSH / DEPLOY = NONE (Owner Review first)
```

---

## 1. Scope delivered

| Item | Status |
|------|--------|
| Take session = `takes` row (no `recording_sessions` table) | DONE |
| MediaRecorder / getUserMedia module | DONE |
| Microphone audio-only capture | DONE |
| Signed upload to private `take-audio` | DONE |
| Server finalize → `READY` | DONE |
| Duration probe fail-closed (OD-W2-04) | DONE |
| Interim AuthZ: logged-in + PUBLISHED only | DONE |
| No new `takes.create` permission | DONE |
| Tests (unit + live security) | DONE |
| Docs | DONE |

**OUT (correct):** PlaybackShell Record · Quick Take product UI · anon recording · entitlement engine · janitor · shared grants · Access Gate RECORD · MIX/EXPORT · beat-audio / `/api/beats/audio/*` reuse for takes

---

## 2. Canonical flow (implemented)

```text
AUTH (requireUser)
  → assertTakeRecordAccess (PUBLISHED + interim max)
  → INSERT takes PENDING_UPLOAD (service)
  → createSignedUploadUrl (take-audio)
  → client MediaRecorder → Blob
  → uploadToSignedUrl
  → finalize: download + MIME/size + duration probe
  → status READY (or FAILED / EXPIRED)
```

Object key (server-only): `user/{ownerId}/takes/{takeId}/mic.bin`

Effective max (interim W2): `MIN(beat.duration_seconds, 180)`

---

## 3. Files

| Path | Role |
|------|------|
| `src/lib/takes/authz.ts` | Interim RECORD AuthZ |
| `src/lib/takes/validation.ts` | MIME allow-list + MediaRecorder MIME pick |
| `src/lib/takes/take-transport.ts` | Session + finalize (For variants for tests) |
| `src/lib/takes/media-recorder.ts` | Capture module |
| `src/lib/takes/client-upload.ts` | Browser session→PUT→finalize helper |
| `src/app/api/takes/session/route.ts` | POST session |
| `src/app/api/takes/finalize/route.ts` | POST finalize |
| `src/lib/takes/wave2-unit.test.ts` | AuthZ + MediaRecorder unit |
| `src/lib/takes/wave2-live.test.ts` | Live transport + security A–M |

**No Wave 2 SQL migration** — Wave 1 schema sufficient.

---

## 4. Security matrix (live)

| ID | Check | Result |
|----|-------|--------|
| A | B cannot finalize A take | PASS |
| B/C | Foreign / client objectKey / ownerId | DENY |
| D/E | Client cannot set owner_id / READY | PASS (0 rows) |
| F | Client duration ignored | PASS (probe SOT) |
| G | Missing beat | NOT_FOUND |
| H/I/J | DRAFT / REJECTED / ARCHIVED | DENY |
| K | PUBLISHED happy path → READY | PASS |
| L | Anonymous | DENY via requireUser (API) |
| M | Expired take | DENY → EXPIRED |

Duration fail-closed + max exceeded → `FAILED` (not READY).

---

## 5. Storage

- Bucket `take-audio` remains **private**
- No public SELECT; no permanent client access
- Signed upload bound to server-chosen path

---

## 6. Regression guard

- Did **not** modify beat-audio transport routes
- Did **not** change BPM / playback / downloads / community / auth model
- Reused patterns only (`probeAudioDurationFromBytes`, signed upload shape, AuthError)

---

## 7. Next

```text
OWNER REVIEW → commit/push/deploy only with Owner GO
Wave 3 = PlaybackShell Record / product QT UX
```
