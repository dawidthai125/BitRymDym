# Studio Final Mix — Architecture Audit (Etap 02A)

**Status:** GO WITH CONDITIONS
**Date:** 2026-10-09
**Type:** READ-ONLY architecture audit — **NO IMPLEMENTATION**
**Repo HEAD at audit:** `4c39e6c24c6f5f78c08cafe185f1d01f524f9c9c`
**Vocal Import:** local commit on `main` (not pushed at audit time)
**Sacred WIP:** `recording-eligibility-service.ts` — out of scope / must remain untouched

```text
STUDIO FINAL MIX ARCHITECTURE AUDIT: GO WITH CONDITIONS
STUDIO TIMELINE → FILE EXPORT: NOT IMPLEMENTED
E3 MIX ≠ STUDIO SESSION EXPORT
TAKE_EXPORT ≠ STUDIO SESSION EXPORT
```

**Follow-on decision doc:** [STUDIO_FINAL_MIX_DESIGN_FREEZE.md](../decisions/STUDIO_FINAL_MIX_DESIGN_FREEZE.md)
**SFM-2 offline core (local):** [STUDIO_FINAL_MIX_SFM2_OFFLINE_RENDER.md](./STUDIO_FINAL_MIX_SFM2_OFFLINE_RENDER.md) — PCM bake dry-only; no job/worker/UI
**Stage F bake/artifact freeze:** [STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md](../decisions/STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md) — Owner ACCEPT OD-SFM-F01…F07
**Stage G local bake:** IMPLEMENTED in workspace · UNIT TESTED · migration `20261010030000_studio_export_audio_artifacts.sql` **NOT APPLIED** *(status at this audit)* · LOCAL INTEGRATION NOT RUN · LIVE PARITY NOT VERIFIED · PRODUCTION NOT DEPLOYED
**Addendum I.26/I.28:** production later applied the same SQL as `20261010185034_studio_export_audio_artifacts` (MCP history); local file renamed to that version in I.28 — SQL unchanged. This audit line is historical, not current production schema status.

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Is Studio Final Mix implemented? | **NO** |
| Partial path that sounds like it? | Studio **Export** UI = deep-link to `/account/takes` only |
| Can E3 MIX export a Studio timeline? | **NO** — take + beat + `MixParameters` only |
| Can TAKE_EXPORT export a Studio timeline? | **NO** — single READY take only |
| Safe next step? | Design Freeze locking shared session plan + non-goals |

---

## 2. Existing export inventory

| Function | Location | Status |
|----------|----------|--------|
| Studio Export control | `src/components/studio/studio-export-control.tsx` (wired in `studio-editor.tsx`) | **Stage I IMPLEMENTED** (local WIP) — WAV enqueue/status/download; OD-VS-03 deep-link superseded for Final Mix; runtime UI→API **NOT VERIFIED**; production **NOT DEPLOYED** |
| Visual Shell OD-VS-03 | `docs/decisions/STUDIO_VISUAL_SHELL_DESIGN_FREEZE.md` | Binding freeze: Export = `/account/takes`; forbade Studio export pipeline (**superseded for Final Mix by Design Freeze after Owner ACCEPT**) |
| TAKE_EXPORT enqueue | `src/lib/takes/take-export-service.ts` · `/api/takes/export` | EXISTS (code) |
| TAKE_EXPORT worker | `src/lib/audio/render-worker-pipeline.ts` `runClaimedTakeExportWorkerJob` | EXISTS (code); Contabo ops STOPPED |
| E3 feature flags | `src/config/audio-render.ts` (`E3_MIX_ENABLED`, `E3_RENDER_JOBS_ENABLED`) | EXISTS — defaults typically OFF |
| E3 MIX session | `src/lib/mix/session-service.ts` · `mix_sessions` | EXISTS — take+beat product |
| E3 bake | `src/lib/audio/server-basic-bake.ts` `bakeServerBasicV1` | EXISTS — 2 PCM buses + MixParameters |
| E3 preview graph | `src/lib/mix/mix-graph.ts` | EXISTS — MixPanel, not Studio timeline |
| Render jobs / artifacts | `render_jobs` · `audio-artifacts` | EXISTS |
| Contabo worker entry | `scripts/e3-render-worker-once.ts` | Code EXISTS; ops **STOPPED/DISABLED** (`REUSE_SSOT_MAP.md`) |
| OfflineAudioContext in Studio | `studio-waveform-peaks.ts` | Peaks decode only — not session export |
| ARTIFACT clip playback | `createArtifactSourceAdapter` | STUB → `AUDIO_SOURCE_UNAVAILABLE` |

**Doc drift:** `docs/audits/P4_6_LIVE_WORKER_VERIFICATION.md` claimed TAKE_EXPORT hard-reject in the worker; current HEAD wires TAKE_EXPORT in `runRealRenderWorkerJob`. Ops Contabo stop remains authoritative for live completion.

---

## 3. Session SSOT vs export

| Session element | SSOT | Live (`StudioAudioEngine`) | Session export |
|-----------------|------|----------------------------|----------------|
| Beat / BEAT_REF | `studio_projects.beat_id` + clips; AUD-01 filter in schedule | YES | NO (E3 uses mix_session beat) |
| TAKE clips | `studio_clips` | YES | NO (TAKE_EXPORT ignores geometry) |
| ARTIFACT | schema | STUB | NO |
| Geometry / trim / split | clip ms fields + CAS | YES (`planVoicesAtPlayhead`) | NO |
| Fades | `fadeInMs`/`fadeOutMs` + `studio-clip-fade` | YES | NO |
| Track/clip gain, pan, mute, solo | document + `studio-track-ops` | YES | NO |
| Track/Master FX | `studio-fx-chain` / `studio-fx-graph` | YES (Web Audio) | NO (E3 uses different Node DSP) |
| Master gain/pan | project fields | YES | NO as Studio document |
| Clip pan | — | **N/A** (no column / DTO field) | N/A |
| pitch_cents / stretch_ratio / clip `effects` jsonb | DB migration stubs only | **Unused** in `src/` | N/A — out of MVP |
| Automation lanes | none | N/A (fades ≠ lanes) | N/A |

**Reusable planning core (not used by any exporter today):**

- `src/lib/studio/studio-audio-schedule.ts` — `planVoicesAtPlayhead`
- `src/lib/studio/studio-clip-fade.ts` — envelope / `applyClipFadeGainParam`
- Track audible / solo: `isTrackAudible` via schedule helpers
- Engine wiring: `studio-transport-provider.tsx` → `StudioAudioEngine`

---

## 4. Live / render parity risks

1. **Product model mismatch** — N timeline clips vs E3 two-file bake vs take-only encode.
2. **DSP mismatch** — Studio Web Audio FX ≠ `server-basic-v1` approximations.
3. **Missing geometry** — offsets, fades, overlap-mix absent from current bake.
4. **OfflineAudioContext alone ≠ parity** — without shared plan + FX semantics, export will not match listen.
5. **ARTIFACT stub** — “complete session” including ARTIFACT is undefined until product decision.

---

## 5. Infrastructure and security (constraints)

- Studio project ownership: `getStudioProjectDocumentFor` / `owner_id`.
- Render source AuthZ: server resolve; clients must not supply storage keys (`render-source-core`).
- Durable media: Supabase Storage buckets (`beat-audio`, `take-audio`, `audio-artifacts`).
- Contabo EXTERNAL COMPUTE required for **current** FFmpeg job completion path; process is STOPPED without Owner Ops GO.
- Local `.env.local` may point at production Supabase — mutating smoke against prod is forbidden without isolated env + Owner GO.

---

## 6. Minimal viable Final Mix (audit recommendation)

1. Shared session interpretation reused by live and renderer (`planVoicesAtPlayhead` + fades + mixer/FX rules).
2. New bake path over **Studio document** (not `bakeServerBasicV1(take, beat)`).
3. Prefer reuse `render_jobs` + `audio-artifacts` with a distinct job kind; no new bucket without proof.
4. Encode/upload via existing worker plane **or** Owner-approved alternative; Contabo start is separate Ops GO.
5. Studio Export UI starts project export job (replace Takes deep-link for this product).
6. Out of MVP: ARTIFACT playback, automation lanes, Contabo always-on, bit-perfect guarantee.

---

## 7. Conditions for Design Freeze

| # | Condition |
|---|-----------|
| C1 | Freeze **must not** redefine E3 MIX as Studio Final Mix |
| C2 | Freeze **must** name shared session plan modules as SSOT for interpretation |
| C3 | Freeze **must** decide job kind / artifact key policy without requiring Contabo start in the freeze step |
| C4 | Freeze **must** list Non-Goals (second engine, merge with MixPanel, ARTIFACT ship, etc.) |
| C5 | Implementation **not** authorized by this audit alone — Owner GO after freeze |

---

## 8. Explicit non-actions (this audit)

- No code changes · no renderer · no Contabo · no migrations · no push/deploy · no Sacred WIP edits
