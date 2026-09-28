# Recording / Quick Take — architecture index

**Status:** Design Freeze **LOCKED** · Wave 1–4 **CLOSED** @ `99c4815` · production GREEN

**Canonical freeze:** [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md)  
**Wave 3 closeout:** [RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md](../audits/RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md)  
**Wave 4 closeout:** [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md)  
**Wave 4 report:** [RECORDING_WAVE4_IMPLEMENTATION_REPORT.md](../audits/RECORDING_WAVE4_IMPLEMENTATION_REPORT.md)

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

## Wave 4 delivered (CLOSED @ `99c4815`)

| Piece | Location |
|-------|----------|
| Entitlement / retention / anti-abuse SSOT | `src/lib/takes/entitlement.ts` |
| Race-safe session claim | `claim_take_recording_session` + `take-transport.ts` |
| Shared owner AuthZ gate | `src/lib/takes/take-access.ts` |
| Own download | `take-download.ts` · `POST /api/takes/download` |
| Soft-delete | `take-delete.ts` · `POST /api/takes/delete` |
| Janitor | `takes-janitor.ts` · `GET /api/cron/takes-janitor` · `vercel.json` |
| Moje próbki | `/account/takes` · `list-own-takes.ts` |

**Entitlement:** BEGINNER `MIN(beat,30)` · PRO/LEGEND `MIN(beat,180)` — server only.  
**Retention:** BEGINNER 24h · PRO 10d · LEGEND 30d via `expires_at`.  
**Anti-abuse:** active READY caps + UTC day sessions + max 1 `PENDING_UPLOAD` (advisory lock).  
**Janitor:** Vercel Hobby daily cron `0 0 * * *` (00:00 UTC) + `CRON_SECRET` (not pg_cron). Expiry AuthZ remains immediate/server-side; janitor is cleanup only.

**Not in Wave 4:** Anonymous QT · shared grants · MIX/EXPORT · Track publish · payments/Premium · dual-play.

**Reuse:** Wave 2/3 transport + MediaRecorder + preview; Chromium WebM duration fallback (`9f6f006`) unchanged.

## Wave 5 — Shared Grants → RECORD (CLOSED / PRODUCTION VERIFIED @ `37892a6`)

| Piece | Location |
|-------|----------|
| Table `beat_access_grants` + create RPC (advisory lock) | `supabase/migrations/20260928140000_recording_wave5_beat_access_grants.sql` |
| ACTIVE predicate + max 20 | `src/config/beat-access-grants.ts` |
| Grant domain (service_role) | `src/lib/grants/beat-access-grants.ts` |
| RECORD AuthZ source label | `assertTakeRecordAccess` (+ optional `activeRecordGrant`) |
| Owner/grantee APIs | `/api/beats/[id]/grants` · revoke · `/api/account/grants` |
| UI | `BeatGrantsPanel` on Moje bity · `/account/shared` |

**Contract:** Shared Grants → RECORD only. No PLAYBACK/DOWNLOAD via grant. PUBLISHED RECORD without grant unchanged (W4). Non-PUBLISHED + grant = DENY. Grant ≠ take ACL. Revoke blocks new sessions only.

**Status:** **CLOSED / PRODUCTION VERIFIED** @ `37892a6` · https://www.bitrymdym.pl · [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)
