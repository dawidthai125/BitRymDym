# Recording / Quick Take — architecture index

**Status:** Design Freeze **LOCKED** · Wave 1 foundation **IMPLEMENTED** (no MediaRecorder yet)

**Canonical freeze:** [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md)  
**Wave 1 audit:** [RECORDING_WAVE1_IMPLEMENTATION_AUDIT.md](../audits/RECORDING_WAVE1_IMPLEMENTATION_AUDIT.md)  
**Wave 1 closeout:** [RECORDING_WAVE1_IMPLEMENTATION_CLOSEOUT.md](../audits/RECORDING_WAVE1_IMPLEMENTATION_CLOSEOUT.md)

## Wave 1 delivered

| Piece | Location |
|-------|----------|
| Table `takes` + enums + RLS | `supabase/migrations/20260927180000_recording_wave1_take_foundation.sql` |
| Private bucket `take-audio` | same migration (client INSERT/SELECT DENY) |
| Object keys | `src/lib/takes/object-key.ts` → `user/{ownerId}/takes/{takeId}/mic.bin` |
| Config (retention/caps constants) | `src/config/recording.ts` |
| Domain types | `src/types/domain.ts` (`Take`, statuses) |

**Not in Wave 1:** Access Gate RECORD capability, signed upload product API, PlaybackShell Record, shared grants, janitor.

**Reuse:** [AUTHORIZATION.md](./AUTHORIZATION.md) · [AUDIO_TRANSPORT.md](./AUDIO_TRANSPORT.md) patterns for Wave 2+.
