# Recording / Quick Take — architecture index

**Status:** Design Freeze **LOCKED** · Wave 1–2 **CLOSED** · Wave 3 **DEPLOYED** @ `507f78f` · **PRODUCTION VERIFY NOT CLOSED** (duration probe blocker)

**Canonical freeze:** [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md)  
**Wave 2 closeout:** [RECORDING_WAVE2_IMPLEMENTATION_CLOSEOUT.md](../audits/RECORDING_WAVE2_IMPLEMENTATION_CLOSEOUT.md)  
**Wave 3 readiness:** [RECORDING_WAVE3_READINESS_AUDIT.md](../audits/RECORDING_WAVE3_READINESS_AUDIT.md)  
**Wave 3 closeout:** [RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md](../audits/RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md)

## Wave 1 delivered

| Piece | Location |
|-------|----------|
| Table `takes` + enums + RLS | `supabase/migrations/20260927180000_recording_wave1_take_foundation.sql` |
| Private bucket `take-audio` | same migration |
| Object keys | `src/lib/takes/object-key.ts` |
| Config | `src/config/recording.ts` |

## Wave 2 delivered

| Piece | Location |
|-------|----------|
| Interim AuthZ | `src/lib/takes/authz.ts` |
| Session + finalize | `src/lib/takes/take-transport.ts` · `/api/takes/session` · `/api/takes/finalize` |
| MediaRecorder module | `src/lib/takes/media-recorder.ts` |
| Client upload helper | `src/lib/takes/client-upload.ts` |

## Wave 3 delivered

| Piece | Location |
|-------|----------|
| Recording UI state machine | `src/lib/takes/recording-ui-state.ts` |
| RecordingPanel | `src/components/takes/recording-panel.tsx` |
| Beat detail composition | `src/components/takes/beat-recording-surface.tsx` |
| PlaybackShell sync handle | `playFromStart` / `stopPlayback` / `setControlsLocked` |
| Take-only preview signed GET | `src/lib/takes/take-preview.ts` · `POST /api/takes/preview` |

**OD-W3 (CLOSED):** beat plays from 0 during capture · anon OUT · sibling panel (not merged reducer) · take-only preview (no dual-play).

**Not in Wave 3:** Anonymous QT · shared grants · entitlement engine · janitor · own take download · MIX/EXPORT.

**Reuse:** Wave 2 transport + MediaRecorder; beat PLAYBACK Access Gate unchanged; take-audio remains private.
