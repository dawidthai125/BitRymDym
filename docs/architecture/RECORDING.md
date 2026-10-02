# Recording / Quick Take — architecture index

**Status:** Design Freeze **LOCKED** · Wave 1–5 **CLOSED** · D02 **SHIPPED / PRODUCTION VERIFIED** @ `e98ba52` · **Fala 3.5.1 Recording Experience CLOSED** (Owner preliminary PASS · **NOT DEPLOYED**) · production app GREEN (prior baselines)

**Canonical freeze:** [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md)  
**D02 CURRENT CONTRACT:** [PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md](../phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md) (Design Freeze COMPLETE · **SHIPPED** @ `e98ba52`)  
**D02 closeout:** [RECORDING_D02_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)  
**Fala 3.5.1 closeout:** [FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md](../audits/FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md)  
**Wave 3 closeout:** [RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md](../audits/RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md)  
**Wave 4 closeout:** [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md)  
**Wave 4 report:** [RECORDING_WAVE4_IMPLEMENTATION_REPORT.md](../audits/RECORDING_WAVE4_IMPLEMENTATION_REPORT.md)  
**Wave 5 closeout:** [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)

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

**OD-W3 (CLOSED):** beat plays from 0 during capture · anon OUT of W3 wave · sibling panel (not merged reducer) · take-only preview (no dual-play).

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

## D02 — Anonymous Quick Take (CLOSED / IN V1 · SHIPPED / PRODUCTION VERIFIED @ `e98ba52`)

| Piece | Location |
|-------|----------|
| Claim RPC + PENDING unique + advisory lock `87245104` | `supabase/migrations/20260928160000_recording_d02_anon_take_claim.sql` |
| Identity cookie `brd_tk_aid` | `src/lib/takes/anonymous-identity.ts` · `src/config/recording.ts` |
| Token hash | `src/lib/takes/token-hash.ts` |
| Anon AuthZ / entitlement | `assertAnonTakeRecordAccess` · `computeAnonymousRecordingMaxSeconds` |
| Transport + preview | `anon-take-transport.ts` · `anon-take-preview.ts` |
| APIs | `/api/takes/anon/session` · `finalize` · `preview` |
| UI | `RecordingPanel` anonymous path · beat detail max SSOT |

**Contract:** TTL 7200s · max 30s · caps 1/3/concurrent 1 · hash-only · PUBLISHED+READY master · preview YES · durable anon download NO · anon→account claim NO · dual-play OUT · no grant APIs.

**W4/W5:** authenticated `claim_take_recording_session` and Shared Grants unchanged.

**Status:** **CLOSED / IN V1** · **SHIPPED** · **PRODUCTION VERIFIED** @ `e98ba52` · [RECORDING_D02_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)

## Fala 3.5.1 — Recording Experience + Dual Audio Timeline (CLOSED · NOT DEPLOYED)

| Piece | Location |
|-------|----------|
| Live mic peaks / level | `useMicAnalyser` · `TakeMediaRecorder.getStream()` |
| Live MIC rail + Input Monitor | `brd-live-mic-waveform.tsx` · `brd-input-monitor.tsx` |
| BIT rail during REC | `PlaybackShell` Waveform + REC-panel Bit Waveform |
| READY_TAKE dual preview | `brd-take-preview-rail.tsx` · `take-preview-graph.ts` · `peaks-from-buffer.ts` |
| Waveform peaks / tone | `waveform.tsx` (`peaks?` · `tone: "take"` · `peaksFromSeed` retained) |

**Contract:** PlaybackShell remains BIT playback SSOT · no second audio engine · no native take `<audio controls>` · D02 / Storage / AuthZ unchanged.

**Status:** **CLOSED** · Owner verification **PRELIMINARY PASS** · Production **NOT DEPLOYED** — [FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md](../audits/FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md)
