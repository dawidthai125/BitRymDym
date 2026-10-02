# FALA 3.5.1 — RECORDING EXPERIENCE + DUAL AUDIO TIMELINE — CLOSEOUT

**Type:** Implementation closeout  
**Date:** 2026-10-02  
**Epic:** Recording Experience (client UX) · Dual audio timeline (BIT + MIC / TAKE)  
**Status:** **CLOSED**  
**Owner verification:** **PRELIMINARY PASS**  
**Production:** **NOT DEPLOYED**

```text
FALA 3.5.1                 = CLOSED
Owner QA                   = PRELIMINARY PASS
Production deploy/verify   = NOT DONE (osobny krok)
Fala 4                     = NOT STARTED
```

**Limitation:** Owner QA wykonany wstępnie; pełne production verification pozostaje osobnym krokiem po deployu.

---

## 1. Scope delivered

| Item | Status |
|------|--------|
| Live microphone waveform (`AnalyserNode`) | DONE |
| Microphone Input Monitor (level / peak) | DONE |
| BIT waveform during REC (PlaybackShell + REC rail) | DONE |
| Shared REC timeline BIT + MIC | DONE |
| REC timer · Stop · Cancel | DONE |
| BRD Take Preview (READY_TAKE) | DONE |
| BIT + TAKE waveform dual rail | DONE |
| Dual playback play / pause / seek | DONE |
| Native `<audio controls>` removed from take preview UI | DONE |
| Responsive desktop / mobile | DONE |
| Regression fix — BIT waveform visibility | DONE |
| `npm run typecheck` | PASS |

**OUT of scope (correct):** Fala 4 · Home IA · `/beats` redesign · DB / Storage / Auth / API / Worker / ENV / D02 · PlayerProvider engine rewrite · watermark / ARTWORK-01 · production deploy.

---

## 2. Architecture (client)

```text
BeatRecordingSurface
  ├── PlaybackShell          — BIT playback SSOT (signed URL · Waveform · lock during REC)
  └── RecordingPanel
        ├── RECORDING: Bit Waveform + BrdLiveMicWaveform + BrdInputMonitor
        └── READY_TAKE: BrdTakePreviewRail (local dual graph · not PlayerProvider)
```

- `TakeMediaRecorder.getStream()` → live mic peaks via `useMicAnalyser`
- Take preview: `createTakePreviewGraph` + optional `peaksFromAudioBlob`
- Waveform API: optional `peaks` / `tone: "take"` · `peaksFromSeed` retained

---

## 3. Regression fix (in-wave)

**Issue:** BIT rail in Recording Surface appeared empty after 3.5.1 MIC rails.  
**Cause:** rest-bar colors used `color-mix()` in inline styles (weak / transparent) + undersized REC BIT rail.  
**Fix:** solid `rgba` rest colors · stronger min bar height · full studio BIT height during REC · `Bit` label on PlaybackShell.  
**Not rolled back:** live mic · Input Monitor · Take Preview · dual graph.

---

## 4. Primary files

| Path | Role |
|------|------|
| `src/components/takes/recording-panel.tsx` | Live MIC + READY_TAKE preview UI |
| `src/components/takes/beat-recording-surface.tsx` | `beatTitle` passthrough |
| `src/components/player/playback-shell.tsx` | BRD BIT rail · lock · progress |
| `src/lib/takes/media-recorder.ts` | `getStream()` |
| `src/hooks/use-mic-analyser.ts` | AnalyserNode peaks / level |
| `src/components/brand/waveform.tsx` | peaks / tone / seed |
| `src/components/brand/brd-live-mic-waveform.tsx` | Live MIC rail |
| `src/components/brand/brd-input-monitor.tsx` | Level meter |
| `src/components/brand/brd-take-preview-rail.tsx` | Dual BIT+TAKE preview |
| `src/components/brand/brd-audio-play-button.tsx` | BRD play control |
| `src/components/brand/brd-audio-meta.tsx` | Time / meta |
| `src/lib/audio/peaks-from-buffer.ts` | Take peaks decode |
| `src/lib/audio/take-preview-graph.ts` | Local dual playback |
| `src/components/player/player-provider.tsx` | Optional suppress hook for REC |
| `src/styles/tokens.css` | `--brd-audio-*` tokens |

---

## 5. Verification

| Check | Result |
|-------|--------|
| Owner preliminary QA | **PASS** („Oka działa, wstępnie możemy zamykać”) |
| Local typecheck | **PASS** |
| Production deploy | **NOT DONE** |
| Production E2E | **NOT DONE** (after deploy) |

---

## 6. Continuity

Living SSOT updated: `PROJECT_STATE.md` · `CHANGELOG.md` · `architecture/RECORDING.md` · `MASTER_HANDOFF.md` (this closeout linked).

**Next:** Owner GO for production deploy + full production verification · then backlog / next epic (not auto-start Fala 4).
