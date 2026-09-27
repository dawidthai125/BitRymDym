# RECORDING WAVE 3 — IMPLEMENTATION CLOSEOUT

**Type:** Implementation closeout (facts only)  
**Date:** 2026-09-27  
**Baseline:** `2ab3e3e22f8ef1ed727eeabfa59c830d32e9d418`  
**Owner decisions:** OD-W3-01…04 CLOSED  

```text
RECORDING_WAVE3 = IMPLEMENTED / TESTED
COMMIT / PUSH / DEPLOY = NONE (Owner Review first)
```

---

## 1. Scope delivered

| Item | Status |
|------|--------|
| `RecordingPanel` sibling on beat detail | DONE |
| Pure recording UI state machine | DONE |
| Thin PlaybackShell sync (playFromStart / stop / lock) | DONE |
| Mic permission UX + errors | DONE |
| Start/stop/cancel + timer | DONE |
| Upload/finalize progress via Wave 2 transport | DONE |
| Take-only preview signed GET | DONE |
| Auth / PUBLISHED eligibility UI | DONE |
| Mobile-first touch targets | DONE |
| Anon OUT | DONE (CTA login only) |

**OUT (correct):** dual-play · anonymous QT · grants · entitlements · janitor · anti-abuse · own take download · MIX/EXPORT

---

## 2. Architecture

```text
beat/[id]
  └── BeatRecordingSurface
        ├── PlaybackShell (ref handle; reducePlayback unchanged)
        ├── RecordingPanel (recording-ui-state + TakeMediaRecorder + upload)
        └── DownloadButton
```

**OD-W3-01:** Start → beat seek 0 + play + MediaRecorder; Stop → stop both.  
**OD-W3-03:** No merge into `reducePlayback`.  
**OD-W3-04:** Preview = take-only `<audio>` via `/api/takes/preview`.

---

## 3. Security

- Preview: `requireUser` · owner match · READY · not expired · canonical object key · private `take-audio` signed GET
- Upload/finalize: unchanged Wave 2 AuthZ
- Client duration / ownership not trusted
- No public take URL

---

## 4. Tests (local closeout)

| Suite | Result |
|-------|--------|
| Full vitest | **343 PASS** / **0 FAIL** / **1 SKIP** |
| Lint | PASS |
| Typecheck | PASS |
| Build | PASS |

---

## 5. Files (primary)

- `src/lib/takes/recording-ui-state.ts`
- `src/lib/takes/take-preview.ts`
- `src/app/api/takes/preview/route.ts`
- `src/components/takes/recording-panel.tsx`
- `src/components/takes/beat-recording-surface.tsx`
- `src/components/player/playback-shell.tsx` (imperative handle only)
- `src/app/beat/[id]/page.tsx`
- `src/lib/takes/wave3-unit.test.ts` · `wave3-live.test.ts`

**No Wave 3 SQL migration.**

---

## 6. Known carry-overs

- Medium: `audio/ogg` picker vs interim allow-list (Wave 2; fail-closed at session)
- Design Freeze §19 still historically lists Anon QT in W3 — implementation follows OD-W3-02 OUT
- Medium (historical): Chromium MediaRecorder WebM/Opus duration — **FIXED** @ `9f6f006` (audio-decode fallback). See [RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md](./RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md).

---

## 7. Production verify (2026-09-27)

```text
FEATURE_DEPLOY = 507f78fb03347683c847d5b0a0d76a3fffe1827d
HOTFIX_DEPLOY  = 9f6f006c4dbb3354260ca2f5479c18952f8a713a
CHROMIUM_MEDIARECORDER = audio/webm;codecs=opus · timeslice 250
DURATION_FALLBACK = PASS (music-metadata duration null → decode 27s → READY)
TAKE_PREVIEW / SECURITY / CANCEL / MOBILE / SMOKE = PASS
RECORDING_WAVE3 = CLOSED
```

---

## 8. Next

```text
Wave 3 CLOSED — later waves only with Owner GO (anon QT / grants / entitlements)
```
