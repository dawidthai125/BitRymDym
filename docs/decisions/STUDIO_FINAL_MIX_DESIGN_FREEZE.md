# Studio Final Mix — Design Freeze

**Status:** DESIGN FREEZE — **GO WITH CONDITIONS**
**Date:** 2026-10-09
**Type:** DESIGN FREEZE ONLY — **NO IMPLEMENTATION IN THIS STEP**
**Product name:** Studio Final Mix (eksport kompletnej sesji osi czasu)
**Owner:** Prezes Dawid
**Architect:** ChatGPT
**Implementacja (później):** Cursor Agent — **tylko po osobnym Owner GO**

**Architecture audit:** [STUDIO_FINAL_MIX_ARCHITECTURE_AUDIT.md](../architecture/STUDIO_FINAL_MIX_ARCHITECTURE_AUDIT.md) · Etap 02A · **GO WITH CONDITIONS**
**Repo HEAD at freeze authoring:** `4c39e6c24c6f5f78c08cafe185f1d01f524f9c9c`
**Engine contracts:** [P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md](./P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md) · [P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md](./P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md) · [P6_7_CLIP_FADES_DESIGN_FREEZE.md](./P6_7_CLIP_FADES_DESIGN_FREEZE.md)
**Prior shell freeze (partially superseded):** [STUDIO_VISUAL_SHELL_DESIGN_FREEZE.md](./STUDIO_VISUAL_SHELL_DESIGN_FREEZE.md) · **OD-VS-03**
**Reuse map:** [REUSE_SSOT_MAP.md](../architecture/REUSE_SSOT_MAP.md)

```text
STUDIO FINAL MIX DESIGN FREEZE: GO WITH CONDITIONS
IMPLEMENTATION: NOT AUTHORIZED BY THIS DOCUMENT ALONE
E3 MIX / TAKE_EXPORT: MUST REMAIN SEPARATE PRODUCTS
CONTABO START: SEPARATE OPS GO (NOT IMPLIED)
OD-VS-03 DEEP-LINK: SUPERSEDED FOR FINAL MIX ONLY (AFTER OWNER ACCEPT)
```

**Naming (frozen):**

```text
Studio Final Mix     = export of Studio project timeline → durable audio artifact
E3 MIX               = take + beat + MixParameters product (unchanged)
TAKE_EXPORT          = single READY take encode (unchanged)
Studio Export UI     = MUST eventually enqueue Studio Final Mix (not Takes deep-link)
```

### Supersession — OD-VS-03 (Visual Shell)

[STUDIO_VISUAL_SHELL_DESIGN_FREEZE.md](./STUDIO_VISUAL_SHELL_DESIGN_FREEZE.md) froze **OD-VS-03 = B**: Export = deep-link `/account/takes` and forbade a new Studio export/render pipeline **for the Visual Shell unit**.

**This Final Mix freeze supersedes OD-VS-03 for the Export control’s product meaning only**, effective when Owner **ACCEPT**s this document:

| Was (OD-VS-03) | Becomes (Studio Final Mix) |
|----------------|----------------------------|
| Export → `/account/takes` | Export → enqueue Studio Final Mix for current `projectId` |
| Forbidden: Studio export pipeline | **Allowed** under this freeze + later Implementation GO |
| Contabo/always-on | Still **FORBIDDEN** without separate Ops GO (§5, §8) |

**Stage I (UI Export) — local WIP:** transport control is `StudioExportControl` (`Eksportuj WAV`) → `POST/GET /api/studio/projects/[projectId]/export` + owner download via `/api/mix/artifacts/[id]/download`. This implements OD-SFM-05 in the workspace. **Later:** Stage I.3A dialog focus/a11y; Stage I.7 **local E2E PASS** (isolated only). **Not** production GREEN: Contabo still STOPPED; live/offline FX parity unverified. See [STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md](./STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md) Stage I status.

**Unchanged by supersession:** P4.6 Take Export on `/account/takes` remains the take-download product; Visual Shell layout/chrome freezes otherwise intact; Loop/Metronome disabled affordances unchanged.

---

## 1. Executive Summary

Live Studio already interprets a rich session (clips, geometry, fades, mixer, FX) via `StudioAudioEngine` + `planVoicesAtPlayhead`. No product path turns that session into a file.

This freeze locks:

1. **What** Studio Final Mix is (timeline session export).
2. **What it is not** (E3 MIX, TAKE_EXPORT, Takes deep-link).
3. **Shared session interpretation SSOT** for live ↔ render parity.
4. **Job / Storage reuse posture** without forcing Contabo power-on.
5. **MVP scope** and hard Non-Goals.

Implementation, migrations (if any), Contabo ops, and production smoke each require **separate Owner GO**.

---

## 2. Canonical Baseline

| Item | Value |
|------|--------|
| Audit | Etap 02A · GO WITH CONDITIONS |
| Local app HEAD (authoring) | `4c39e6c` — includes Vocal Import (local; may be unpushed) |
| Studio playback SSOT | `StudioAudioEngine` via `studio-transport-provider.tsx` |
| Session plan (interpretation) | `studio-audio-schedule.ts` `planVoicesAtPlayhead` |
| Fade SSOT | `studio-clip-fade.ts` (clip runtime property) |
| FX SSOT | `studio-fx-chain.ts` / `studio-fx-graph.ts` |
| Persistence | Studio document + CAS (`document_version` / `studio_cas_*`) |
| E3 MIX | `mix_sessions` + `bakeServerBasicV1` — **orthogonal** |
| TAKE_EXPORT | `render_jobs.kind=TAKE_EXPORT` — **orthogonal** |
| Contabo | **STOPPED/DISABLED** until Ops GO (`REUSE_SSOT_MAP.md`) |
| Sacred WIP | `recording-eligibility-service.ts` — **out of scope forever for this unit** |

---

## 3. Scope

### IN (MVP product intent — when implemented under later GO)

| Item | Freeze |
|------|--------|
| Product | Export audible Studio session (BEAT_REF + TAKE clips as live would schedule them) |
| Interpretation | Shared plan: voices @ time, mute/solo, gains/pans, fades, track/master FX rules |
| Sources | Authorized resolve of beat + take media (server-side; no client object keys) |
| Output | Stereo file artifact in existing durable Storage plane |
| Jobs | Prefer extend `render_jobs` with distinct kind (see §8) |
| UI | Studio transport **Export** starts Final Mix for **current project** |
| AuthZ | Project owner only; take/beat re-validated at bake/claim |
| Parity tests | Plan + fixture audio correlation live-offline vs render-offline |

### OUT

See §5 Non-Goals.

---

## 4. Goals

1. Let an owner download a mix that matches Studio listen for shipped clip kinds.
2. Prevent a second ad-hoc “Studio bake” that duplicates schedule/fade/FX rules.
3. Keep E3 MIX and TAKE_EXPORT stable (no semantic merge).
4. Reuse Storage + job patterns where they fit; avoid new buckets by default.
5. Separate **architecture lock** from **ops Contabo** and **implementation**.

---

## 5. Non-Goals (FORBIDDEN in Studio Final Mix unit)

- Redefining E3 MIX / MixPanel / `mix_sessions` as Studio timeline export
- Calling `bakeServerBasicV1(take, beat)` the Studio Final Mix bake
- Shipping ARTIFACT clip playback (remains stub unless a later freeze)
- Automation lanes / freehand envelopes beyond existing clip fades
- Second `StudioAudioEngine` / second Studio `AudioContext` for export UI playback
- Merging `PlayerProvider` catalog engine into Studio export
- Contabo always-on / undocumented worker start as part of this freeze
- New Storage bucket without Owner+Architect proof of need
- Contabo as durable media SSOT (Storage remains SSOT)
- Changing recording eligibility, tiers, Sample Policy, or Sacred WIP
- Vocal Import scope reopen
- Soft CAS Recovery EPIC (separate)
- Bit-perfect guarantee vs live (target: shared plan + documented DSP policy)
- SCRATCH / instruments / P7 sample product
- Production smoke against prod Supabase without isolated env + Owner GO

FORBIDDEN working names for a parallel stack: `StudioMixEngine`, `FinalMixEngine2`, `TimelineBakeV1` that **reimplements** schedule/fade outside shared modules.

---

## 6. Frozen Architecture

```text
Studio document (DB + CAS)
  → load authorized project document
  → SHARED SESSION INTERPRETATION
        planVoicesAtPlayhead (+ track audible/solo)
        clip fade envelope (studio-clip-fade)
        track/master gain·pan
        track/master FX chain semantics (studio-fx-*)
  → RENDER REALIZATION (offline / worker — later GO)
        decode authorized sources
        apply SAME interpretation across timeline length
        encode → upload audio-artifacts (or approved reuse)
  → download via existing artifact AuthZ patterns
```

Live path (unchanged ownership):

```text
StudioTransportProvider → StudioAudioEngine
  → same interpretation modules for audible scheduling
```

**Invariant:** interpretation SSOT lives in Studio lib modules; renderer **consumes** them (or a thin pure extract), it does **not** invent a second timeline language.

```text
Studio Final Mix ≠ E3 MixParameters graph
Studio Final Mix ≠ TAKE_EXPORT take-only encode
StudioAudioEngine remains the live realization
OfflineAudioContext / Node PCM is a realization backend, not a second product model
```

---

## 7. Shared Session Interpretation (SSOT)

Frozen reuse targets (names may be extracted to pure helpers later, but semantics must match):

| Concern | Module / symbol |
|---------|-----------------|
| Active voices @ playhead | `planVoicesAtPlayhead` |
| BEAT_REF vs project beat | AUD-01 / `beatRefMatchesProjectSsot` |
| Track mute/solo | `isTrackAudible` / `trackGraphParams` |
| Clip gain/mute base | `clipGraphGain` / existing helpers |
| Fade envelope | `studio-clip-fade` (`fadeEnvelope`, `applyClipFadeGainParam` semantics) |
| FX chain model | `studio-fx-chain` (+ graph build rules from `studio-fx-graph`) |
| Time domain | integer milliseconds (P5 Studio freeze) |

**Renderer requirement:** for each output sample time `t` (or equivalent block), audible contribution MUST follow the same audible-set and gain×fade rules as live at playhead `t` (within documented DSP backend limits — §9).

---

## 8. Jobs, Storage, Worker

| Decision | Freeze |
|----------|--------|
| Job table | Prefer existing `render_jobs` |
| Kind | New distinct kind (working name: `STUDIO_EXPORT`) — **not** overload `MIX` or `TAKE_EXPORT` semantics |
| Artifact bucket | Prefer existing `audio-artifacts` |
| Object key | Owner-scoped path including `projectId` + `jobId` (exact pattern at implementation GO) |
| Client authority | Job id + project id only; **no** client `objectKey` / signed URL as AuthZ |
| Contabo | Optional realization host for FFmpeg/upload; **start requires Ops GO** |
| Worker entry | May extend `e3-render-worker-once` / pipeline **or** dedicated entry — must not break MIX/TAKE_EXPORT |
| Progress / cancel | Reuse existing job status / cancel patterns where applicable |

If implementation discovers a hard need for a new bucket or table, **stop and re-freeze** — do not invent silently.

---

## 9. DSP / Parity Policy

| Topic | Freeze |
|-------|--------|
| Target | Export matches Studio listen for MVP clip kinds under shared plan |
| Backend | Offline Web Audio **or** Node PCM graph equivalent — chosen at implementation GO with memory/duration limits |
| FX | Prefer same parameter model as `studio-fx-chain`; if Node cannot host identical nodes, document deltas in implementation report (no silent drift) |
| E3 `server-basic-v1` | **Must not** be the Studio Final Mix semantic engine |
| Long sessions | Hard duration/memory caps required before ship; fail closed with PL user message |
| Format (MVP default) | WAV 44.1/16 stereo **or** existing codec constants from `AUDIO_CODEC` — exact tier ladder at implementation GO |
| Metadata | Minimal: project id, job id, engine id string — no PII beyond owner AuthZ |

---

## 10. UI / Product Surface

| Surface | Freeze |
|---------|--------|
| Studio Export control | Eventually enqueues Studio Final Mix for current `projectId` |
| Current deep-link `/account/takes` | **Must not** remain the Final Mix product; Takes export stays on Account |
| Progress | Job polling / status PL — reuse patterns from take download / mix jobs where fit |
| Errors | Ownership, empty session, source unavailable, duration cap, CAS-unrelated conflict, worker infra blocked |

---

## 11. Security

- `requireUser` + project `owner_id` match.
- Takes: owner + READY (+ not deleted) when contributing.
- Beats: existing playback/asset AuthZ at resolve time.
- FINDING-01 style re-validation at claim/bake start (no trust of create-time-only AuthZ).
- No Contabo/Storage as AuthZ substitute for Postgres ownership.

---

## 12. Acceptance Criteria (for later implementation GO)

| ID | Criterion |
|----|-----------|
| AC-01 | Export job created only by project owner |
| AC-02 | Output includes scheduled BEAT_REF + TAKE contributions per shared plan |
| AC-03 | Mute/solo/gain/pan/fades affect export consistently with live fixtures |
| AC-04 | Track/Master FX applied per frozen DSP policy (deltas documented if any) |
| AC-05 | ARTIFACT clips do not become audible unless a later freeze ships them |
| AC-06 | E3 MIX and TAKE_EXPORT regression tests still PASS |
| AC-07 | No new bucket unless re-freeze approved |
| AC-08 | Contabo not started by app code paths; ops separate |
| AC-09 | Sacred WIP / eligibility / tiers unchanged |
| AC-10 | Unit + parity fixture suite green before any prod smoke |

---

## 13. Open Owner Decisions (do not invent in code)

| ID | Question | Default if Owner silent |
|----|----------|-------------------------|
| OD-SFM-01 | Job kind name (`STUDIO_EXPORT` vs other) | Use `STUDIO_EXPORT` |
| OD-SFM-02 | MVP format ladder (WAV only vs MP3 tiers) | WAV-only MVP |
| OD-SFM-03 | Max export duration / memory policy | Fail-closed ≤ sample-policy-ish cap (propose at impl GO) |
| OD-SFM-04 | Realization host: Contabo vs other | Contabo only after Ops GO; no always-on |
| OD-SFM-05 | Replace Export deep-link in same PR as enqueue | YES — Export must not remain Takes-only |
| OD-SFM-06 | Accept supersession of Visual Shell **OD-VS-03** for Export meaning | Required for UI wiring; default = ACCEPT with this freeze |

---

## 14. Implementation Phases (ordering only — not authorized)

```text
SFM-0  Design Freeze (THIS DOC) — DONE when Owner accepts
SFM-1  Pure session-interpretation extract + unit tests (no worker) — DONE (local)
SFM-1.1 Typed FX + source ids + overlap/pan/master tests — DONE (local)
SFM-2  Offline/Node bake MVP (BEAT_REF+TAKE, fades, mixer; FX dry-only fail-closed) — DONE (local core)
       See docs/architecture/STUDIO_FINAL_MIX_SFM2_OFFLINE_RENDER.md
       FX DSP adapters still NOT done (non-empty chain → typed error)
SFM-3  Job kind + artifact upload + AuthZ + Studio Export UI wiring
SFM-3F Bake/artifact Design Freeze (Stage F) — ACCEPTED
       [STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md](./STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md)
SFM-3G Local bake wiring (Stage G) — IMPLEMENTED in workspace / UNIT TESTED
       migration file present · NOT APPLIED · LOCAL INTEGRATION NOT RUN
SFM-4  Parity fixtures + regression vs E3/TAKE_EXPORT
SFM-5  Isolated-env smoke (local Supabase or approved non-prod) — Stage H GO
SFM-6  Ops GO Contabo (only if chosen host) + limited prod canary
```

Each phase needs explicit GO. **Do not skip to Contabo.**
Stage G is local code only — Stage H required before worker-once / migration apply.

---

## 15. Conditions Closed / Remaining

| Audit condition | Freeze resolution |
|-----------------|-------------------|
| C1 E3 ≠ Studio Final Mix | **Frozen** §1, §5, §6 |
| C2 Shared plan SSOT | **Frozen** §6–§7 |
| C3 Job/Storage without Contabo start | **Frozen** §8 |
| C4 Non-Goals | **Frozen** §5 |
| C5 Impl not authorized by audit | **Frozen** header + §14 |

**Remaining before code:** Owner acceptance of this freeze + separate Implementation GO for SFM-1+.

---

## 16. Explicit Non-Actions (this freeze step)

- No renderer code · no Contabo · no migrations · no push/deploy · no Sacred WIP edits · no `.env` changes · no production mutations

---

## 17. Stop Line

```text
ARCHITECTURE LOCKED FOR OWNER REVIEW
NEXT: Owner ACCEPT this freeze → then Implementation GO for SFM-1 only
```
