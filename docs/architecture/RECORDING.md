# Recording / Quick Take — architecture index

**Status:** Design Freeze **LOCKED** · Wave 1 foundation **IMPLEMENTED** · Wave 2 transport/MediaRecorder **IMPLEMENTED** (Owner Review)

**Canonical freeze:** [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md)  
**Wave 1 closeout:** [RECORDING_WAVE1_IMPLEMENTATION_CLOSEOUT.md](../audits/RECORDING_WAVE1_IMPLEMENTATION_CLOSEOUT.md)  
**Wave 2 readiness:** [RECORDING_WAVE2_READINESS_AUDIT.md](../audits/RECORDING_WAVE2_READINESS_AUDIT.md)  
**Wave 2 closeout:** [RECORDING_WAVE2_IMPLEMENTATION_CLOSEOUT.md](../audits/RECORDING_WAVE2_IMPLEMENTATION_CLOSEOUT.md)

## Wave 1 delivered

| Piece | Location |
|-------|----------|
| Table `takes` + enums + RLS | `supabase/migrations/20260927180000_recording_wave1_take_foundation.sql` |
| Private bucket `take-audio` | same migration (client INSERT/SELECT DENY) |
| Object keys | `src/lib/takes/object-key.ts` → `user/{ownerId}/takes/{takeId}/mic.bin` |
| Config (retention/caps constants) | `src/config/recording.ts` |
| Domain types | `src/types/domain.ts` (`Take`, statuses) |

## Wave 2 delivered

| Piece | Location |
|-------|----------|
| Interim AuthZ (auth + PUBLISHED) | `src/lib/takes/authz.ts` |
| Session + finalize transport | `src/lib/takes/take-transport.ts` |
| API | `POST /api/takes/session` · `POST /api/takes/finalize` |
| MediaRecorder module | `src/lib/takes/media-recorder.ts` |
| Client upload helper | `src/lib/takes/client-upload.ts` |

**Session model:** existing `takes` row (`PENDING_UPLOAD` → `READY` / `FAILED` / `EXPIRED`). No `recording_sessions` table.

**Duration:** server probe via `probeAudioDurationFromBytes`; fail-closed if unprobeable (OD-W2-04). Interim max = `MIN(beat.duration_seconds, 180)`.

**Not in Wave 2:** PlaybackShell Record button · Quick Take product UI · anon recording · entitlement engine · janitor · Access Gate RECORD capability · shared grants.

**Reuse:** [AUTHORIZATION.md](./AUTHORIZATION.md) · [AUDIO_TRANSPORT.md](./AUDIO_TRANSPORT.md) patterns — **never** `beat-audio` or `/api/beats/audio/*` for takes.
