# P6.4 — Studio FX UI / Mix UX — Architecture Audit

**Status:** ARCHITECTURE AUDIT — **GO WITH CONDITIONS**  
**Date:** 2026-10-06  
**Type:** AUDIT ONLY — **NO IMPLEMENTATION · NO DESIGN FREEZE · NO DEPLOY**  
**Production application SHA:** `350303e9506d8300b03dae7e1530f06756971736` (`350303e`)  
**Production deployment:** `dpl_AdUhQzAFBNAFeJ8qTEaa4jTpbsho`  
**SSOT tip at audit:** `d8b4f8c`  
**Parent freeze:** [P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md](../decisions/P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md)  
**Prior audit:** [P5_11_STUDIO_POST_AUDIO_ENGINE_ARCHITECTURE_AUDIT.md](./P5_11_STUDIO_POST_AUDIO_ENGINE_ARCHITECTURE_AUDIT.md)

```text
P6.4 ARCHITECTURE: GO WITH CONDITIONS
IMPLEMENTATION: FORBIDDEN IN THIS STEP
DESIGN FREEZE: NEXT STEP (after Owner accepts this audit)
PRODUCTION APP: UNCHANGED (350303e)
```

---

## 1. Executive Summary

P6.1–P6.3 delivered **persist + CAS + Track FX graph + Master FX graph** on a single `StudioAudioEngine`. Production is **GREEN** at `350303e`.

**P6.4 must add UI only** — binding Studio Mix UX to:

```text
UI → existing FX PATCH (CAS) / existing Track PATCH → document model → StudioAudioEngine.setDocument
```

Findings:

| Area | State |
|------|--------|
| Track FX API + engine | **READY** |
| Master FX API + engine | **READY** |
| Track Gain/Pan/Mute/Solo UI | **EXISTS** (reuse) |
| Track / Master FX UI | **ABSENT** (greenfield under `studio-editor`) |
| Master Gain/Pan runtime + read DTO | **READY** |
| Master Gain/Pan mutation API + UI | **GAP** |
| FX registry types/defaults | **READY** |
| FX UI metadata (labels/ranges/steps for renderers) | **PARTIAL** (ranges private inside parsers) |
| Second audio engine / PlayerProvider / E3 Mix | **FORBIDDEN · currently isolated** |

**Verdict:** architecture is ready to Design Freeze P6.4 **with conditions** (Master Gain/Pan write path; registry UI metadata export; CAS/version UX around non-CAS track control bumps; mobile drawer model).

---

## 2. Current Architecture

```text
Voice → Clip Gain → Track FX[] → Track Gain/Pan/Mute/Solo
  → Σ (masterInput)
  → Master FX[]
  → Master Gain → Master Pan → Destination
```

| Layer | Owner | Notes |
|-------|--------|--------|
| Persist FX | `effects_chain` / `master_fx_chain` JSONB v1 | P6.1 |
| CAS | `expectedDocumentVersion` on FX PATCH | P6.1 RPC + qualify hotfix `57ef69e` |
| Track FX graph | `syncTrackFx` | P6.2 |
| Master FX graph | `syncMasterFx` + `masterInput` | P6.3 |
| Engine document | `StudioEngineDocument` (+ `masterFxChain`) | editor → transport → engine |
| Catalog / E3 | PlayerProvider · MixPanel · `mix-graph` | **isolated** |

**Hard rule for P6.4:** UI never owns Web Audio nodes, never creates `AudioContext`, never imports PlayerProvider / MixPanel / `mix-graph`.

---

## 3. Existing UI Inventory

| Surface | Location | Status |
|---------|----------|--------|
| Project shell / title / tempo | `studio-editor.tsx` | EXISTS |
| Transport Play/Pause/Stop/seek | `studio-transport-provider.tsx` + bar in editor | EXISTS |
| Recording panel | `studio-recording-panel.tsx` | EXISTS (out of P6.4 FX scope) |
| Track list header (name, ↑↓, REC) | `studio-editor.tsx` | EXISTS |
| Track Mute / Solo | `ToggleChip` in editor | EXISTS — Polish labels |
| Track Gain / Pan sliders | editor `input[type=range]` | EXISTS — optimistic `onChange`, persist `onPointerUp` |
| Timeline / clips | `StudioTimeline` in editor | EXISTS |
| Track FX list / add / params | — | **ABSENT** |
| Master FX list / add / params | — | **ABSENT** |
| Master Gain / Pan controls | — | **ABSENT** |
| FX conflict (409) UX | — | **ABSENT** (API returns Polish copy) |
| MixPanel / E3 Mix UI | catalog Mix | **MUST NOT reuse as Studio FX UI** |

**MUST REUSE:** `ToggleChip`, track slider pattern (optimistic + commit on pointer up), `startTransition` + `setError` / `setStatus`, Polish status/alert copy patterns, existing `patchTrack` fetch helper shape.

**MUST NOT duplicate:** a second track strip for “mix mode”, a parallel FX schema, or E3 MixPanel controls.

---

## 4. Track FX UI Audit

**Backend:** `PATCH /api/studio/projects/:id/tracks/:trackId/effects`  
Body: `{ expectedDocumentVersion, chain }` → `{ documentVersion, effectsChain }`  
Validation / limiter-on-track: no “must last” rule (Master only).

**UI today:** none. `effectsChain` is already mapped into `engineDocument` for runtime.

**P6.4 needs:**

- list bound 1:1 to `effects[]` order,
- add from registry (max 8),
- remove,
- reorder (↑↓ primary; drag optional later),
- bypass (`enabled`) without removing slot,
- expand-one-effect params on mobile,
- load from GET document,
- save via FX PATCH + CAS,
- surface `400 FX_CHAIN_INVALID` and `409 FX_CHAIN_VERSION_CONFLICT`.

---

## 5. Master FX UI Audit

**Backend:** `PATCH /api/studio/projects/:id/master-fx` — same CAS contract; **limiter-last** enforced server-side.

**UI today:** none. `masterFxChain` already wired into engine document.

**P6.4 needs:** same list/add/remove/reorder/bypass/params model as Track FX, with Master-specific:

- limiter-last UX guard (disable invalid drop / show why before PATCH),
- server remains SSOT (still expect `400` if violated).

Prefer **one shared chain editor component** parameterized by `role: "track" | "master"` (REUSE FIRST).

---

## 6. Track Mix Controls Audit

| Control | UI | Persist | Version | CAS |
|---------|-----|---------|---------|-----|
| Mute | `ToggleChip` „Wycisz” | `PATCH .../tracks/:id` `{ muted }` | bumps `document_version` | **NO** |
| Solo | `ToggleChip` „Odsłuch” | `{ solo }` | bumps | **NO** |
| Gain | range −24…12 dB step 0.5 | `{ gainDb }` on pointer up | bumps | **NO** |
| Pan | range −1…1 step 0.01 | `{ pan }` on pointer up | bumps | **NO** |
| REC arm | `ToggleChip` | `{ recordArmed }` | bumps | **NO** |

**Source of truth:** server track row → React `doc.tracks` → `engineDocument` → engine fader/pan nodes.

**Race note (HIGH for FX UI):** Track control PATCH increments `document_version` **without** `expectedDocumentVersion`. P6 freeze §18 explicitly **does not** retrofit CAS onto track-control PATCH in Foundation. P6.4 FX UI **must**:

1. keep a live `documentVersion` from project GET / last FX response,
2. refresh version after any track-control write (or after GET),
3. never ignore `409`.

Silent overwrite of FX chains via track controls is impossible (different columns), but **stale FX CAS** after mute/gain is likely — treat as expected, not a P6.4 blocker to invent new track CAS unless Design Freeze expands H2.

**Mobile:** chips + sliders already in per-track card; bottom nav can intercept clicks (known Gate observation) — Design Freeze should require scroll/safe-area / targets ≥44px.

---

## 7. Master Mix Controls Audit

| Concern | Status |
|---------|--------|
| Columns `master_gain_db` / `master_pan` | EXIST · read into DTO |
| Engine Master Gain/Pan | EXIST · downstream of Master FX |
| UI | **ABSENT** |
| Mutation API | **ABSENT** (no `updateStudioMasterMix` / project PATCH for gain/pan) |

**Classification:** **GAP** for user-facing Master Gain/Pan in P6.4 IN-list.

**Not a P6.3 regression** — runtime defaults (0 dB / pan 0) work.

**Design Freeze must choose one:**

| Option | Meaning |
|--------|---------|
| **A (recommended)** | Add minimal `PATCH` project master mix (gain/pan) + **CAS** aligned with FX writes · UI mirrors Track sliders |
| **B** | Defer Master Gain/Pan UI to post–P6.4 · P6.4 ships FX UI only · document as explicit OUT |
| **C** | Read-only display of master levels in P6.4 · write later |

Audit recommendation: **Option A** if Owner wants Mix UX complete; otherwise **B** to keep P6.4 slice = Chain UI only (matches freeze §35 wording).

---

## 8. FX Registry Audit

Existing (`studio-fx-chain.ts`):

```text
STUDIO_FX_TYPES = eq | compressor | limiter | reverb | delay
STUDIO_FX_REGISTRY = { track: true, master: true } × 5
STUDIO_FX_DEFAULTS = typed defaults
STUDIO_FX_CHAIN_MAX_EFFECTS = 8
```

**Gap:** ranges / units / Polish labels / step hints live **inside private parsers**, not as exportable UI metadata.

**Preferred P6.4 model:**

```text
STUDIO_FX_TYPES + STUDIO_FX_DEFAULTS + NEW StudioFxUiMeta (ranges, steps, labels PL)
  → shared ChainEditor / ParamField renderer
  → parseStudioFxChainForWrite (server SSOT unchanged)
```

**Condition:** Design Freeze must require **one** metadata module (or exported constants from `studio-fx-chain.ts`) — **forbid** a second hand-maintained FX catalog in React.

Do **not** import E3 `params.ts` / MixPanel schemas.

---

## 9. Parameter Schema Audit

Authoritative ranges from `studio-fx-chain.ts` parsers:

### EQ (`eq`)

| Field | Default | Min | Max | Unit |
|-------|---------|-----|-----|------|
| low.frequencyHz | 120 | 20 | 500 | Hz |
| mid.frequencyHz | 1000 | 200 | 5000 | Hz |
| high.frequencyHz | 8000 | 2000 | 20000 | Hz |
| *.gainDb | 0 | −12 | 12 | dB |
| low/high.q | 0.7 | 0.1 | 12 | Q |
| mid.q | 1 | 0.1 | 18 | Q |

### Compressor

| Field | Default | Min | Max | Unit |
|-------|---------|-----|-----|------|
| thresholdDb | −24 | −60 | 0 | dB |
| ratio | 3 | 1 | 20 | :1 |
| attackMs | 10 | 0 | 200 | ms |
| releaseMs | 100 | 10 | 2000 | ms |
| makeupDb | 0 | −12 | 12 | dB |

### Limiter (IMPLEMENTATION LIMITATION — not brickwall/true-peak/LUFS)

| Field | Default | Min | Max | Unit |
|-------|---------|-----|-----|------|
| thresholdDb | −1 | −24 | 0 | dB |
| ceilingDb | −0.1 | −6 | 0 | dB |

### Reverb (synthetic IR)

| Field | Default | Min | Max | Unit |
|-------|---------|-----|-----|------|
| mix | 0 | 0 | 1 | 0–1 |
| decaySeconds | 1.2 | 0.1 | 6 | s |

### Delay (no BPM sync)

| Field | Default | Min | Max | Unit |
|-------|---------|-----|-----|------|
| mix | 0 | 0 | 1 | 0–1 |
| timeMs | 250 | 1 | 2000 | ms |
| feedback | 0.25 | 0 | 0.95 | 0–1 |

**UI step:** Design Freeze should pick steps (e.g. gain 0.1 dB, mix 0.01, time 1 ms) — not invent new ranges.

**No new params** in P6.4.

---

## 10. Persistence / CAS UX Audit

| Path | Contract |
|------|----------|
| FX success | `200` + `documentVersion` + chain |
| Invalid | `400` `FX_CHAIN_INVALID` — Polish copy already frozen |
| Conflict | `409` `FX_CHAIN_VERSION_CONFLICT` — „Projekt został zmieniony. Odśwież Studio i spróbuj ponownie.” |
| Unauth | `401` |
| Cross-user | deny (`403`/`404` per existing AuthZ) |

**Required P6.4 UX:**

- never show success on 409,
- offer **Odśwież** (reload document) then retry,
- keep local draft only if Design Freeze allows explicit discard — default = reload wins,
- show compact saving state: `idle | saving | saved | error | conflict` (no autosave).

**Autosave:** OUT (P6 freeze).

**Immediate save model (recommended):** commit on control release / explicit „Dodaj efekt” / reorder buttons — same spirit as Track Gain `onPointerUp`.

---

## 11. Runtime vs Persistence Boundary

| Runtime (engine) | Persisted (DB / document) |
|------------------|---------------------------|
| AudioContext, nodes, AudioParam | `effects_chain`, `master_fx_chain` |
| playhead, lifecycle | `document_version` |
| `failedClips`, diagnostics | Track mute/solo/gain/pan/arm |
| preview dry path | Master gain/pan columns |

**UI rule:** React state mirrors **document**. Engine follows `setDocument`. Sliders must not call `AudioNode` APIs.

Param edit while playing: engine already supports in-place `applyPlan` when structure unchanged — UI should PATCH then let document flow update engine (may rebuild on reorder/add/remove).

---

## 12. Mobile UX Audit (~390 px)

Freeze §25 already requires: vertical list, large bypass, ↑↓ reorder, one expanded effect, cap 8.

**Recommendations:**

| Pattern | Rationale |
|---------|-----------|
| Per-track **FX** entry opens bottom sheet / drawer | Avoid packing params into already dense track card |
| Master section: sticky „Master” card or same drawer with role tab | One pattern for Track/Master |
| Transport stays visible | Do not cover Play/Stop with opaque full-screen without escape |
| Touch targets ≥ 44×44 | Align with existing Studio / W6 habits |
| Reorder = ↑↓ buttons first | Drag optional; not sole path |
| Avoid competing with timeline gestures | FX sheet above timeline while open |

Known risk: mobile bottom nav intercept (observed in Gates) — Design Freeze should specify layout so Mix controls sit above nav safe area.

---

## 13. Accessibility Audit

Existing positives: `aria-label` on gain/pan/playhead, `aria-pressed` on `ToggleChip`, transport labels in Polish.

**P6.4 must add:**

- listbox/list semantics for FX chain,
- bypass as `aria-pressed` or switch,
- reorder buttons with clear names („Przenieś efekt w górę”),
- slider/`input mode decimal` pairing with visible values + units,
- focus trap/restore for drawer,
- keyboard: Tab, Space/Enter toggle, optional Alt+↑↓ reorder,
- visible focus rings (reuse design tokens).

---

## 14. Performance Audit

| Risk | Mitigation |
|------|------------|
| PATCH per slider tick | Commit on pointer up / debounce ≥150–300 ms if continuous save chosen |
| Full chain rebuild every keystroke | Prefer structure-stable param PATCH; engine `applyPlan` |
| Re-render entire Studio editor | Isolate FX panel state; avoid remounting transport |
| 8 FX × multi-voice CPU | Cap already enforced; no UI expansion of cap |
| React render → audio | Forbidden |

No premature optimization without evidence.

---

## 15. Security Audit

Reuse P6.1 AuthZ:

- owner session required,
- `assertOwnsProject`,
- no client `ownerId`,
- server validates chain JSON,
- FX cannot mint Storage URLs.

P6.4 UI must not weaken this (e.g. no “admin override”, no trusting client-only validation as sole gate).

---

## 16. Risks

### HIGH

| ID | Risk | Why |
|----|------|-----|
| R1 | FX CAS stale after Track mute/gain | Track PATCH bumps version without CAS |
| R2 | Master Gain/Pan UI without write API | Silent fake UI or incomplete Mix UX |
| R3 | Duplicated FX metadata in React | Schema drift vs server |

### MEDIUM

| ID | Risk | Why |
|----|------|-----|
| R4 | Mobile nav / timeline gesture conflicts | Observed click intercept |
| R5 | Slider spam → version storms | Many bumps + more 409s |
| R6 | Ignoring limiter-last until 400 | Poor UX; still must keep server SSOT |
| R7 | Optimistic FX reorder without reconcile | Diverges from engine on failure |

### LOW

| ID | Risk | Why |
|----|------|-----|
| R8 | Polish vs English DSP jargon | Needs label map |
| R9 | Desktop-only drag/drop | Freeze already prefers ↑↓ |
| R10 | Over-building metering/LUFS into Mix UX | Scope creep |

---

## 17. P6.4 Scope (recommended IN)

- Track FX UI (list, add, remove, reorder, bypass, params)
- Master FX UI (same + limiter-last affordance)
- Save / error / conflict UX for FX CAS
- Mobile-first drawer/sheet + ~390 layout
- Accessibility for new controls
- Reuse Track Mute/Solo/Gain/Pan patterns (polish only if needed)
- **Master Gain/Pan UI only if Design Freeze picks Option A** (API + CAS)

---

## 18. OUT of Scope

Automation, LUFS, true peak, advanced metering, autotune, pitch, stretch, reverse, loop, instruments, samples, scratch, buses, sends, sidechain, output device / `setSinkId`, autosave, full project versioning / H2 clip CAS retrofit, recording rewrite, PlayerProvider rewrite, E3 Mix migration, wet Take preview, new FX types, second AudioContext / Mix/Master/FxUi engines, P7 creative features.

---

## 19. Dependencies

| Dependency | Status |
|------------|--------|
| P6.1 persist + CAS | GREEN |
| P6.2 Track FX graph | GREEN |
| P6.3 Master FX graph | GREEN @ `350303e` |
| P6 Design Freeze | BINDING |
| Owner GO for Design Freeze then implement | REQUIRED |
| Master Gain/Pan write path | **CONDITIONAL** (Option A/B/C) |
| Exported FX UI metadata | **CONDITIONAL** |

---

## 20. Conditions (must be in Design Freeze)

1. **UI → API → document → `StudioAudioEngine` only** — no direct Web Audio from components.  
2. **Shared Track/Master chain editor** driven by registry + UI metadata export (no second FX catalog).  
3. **CAS UX:** handle `409` with Polish refresh message; keep `documentVersion` coherent after track-control bumps.  
4. **Mobile:** ↑↓ reorder; one expanded effect; drawer/sheet; transport reachable; targets ≥44px.  
5. **Master Gain/Pan:** explicit Option A, B, or C in Design Freeze (no silent half-UI).  
6. **No autosave; no E3/PlayerProvider imports; no new FX types; no new engine.**  
7. **Limiter-last:** UX prevention + server rejection remain.  
8. **Param ranges:** only those in §9; steps chosen in freeze; no range widening.

---

## 21. Final GO / NO-GO

```text
P6.4 ARCHITECTURE: GO WITH CONDITIONS
```

**Not NO-GO:** backend + engine + Track mix UI foundations are sufficient.  
**Not unconditional GO:** Master Gain/Pan write gap + UI metadata export + CAS/version UX must be frozen before coding.

---

## 22. Recommended Design Freeze

Next document (do **not** author here):

```text
docs/decisions/P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md
```

Should lock: IA (Track card vs drawer), shared chain component API, metadata export shape, save/conflict FSM, Master Gain/Pan option, Polish label map, a11y checklist, test + Production Gate plan for P6.4/P6.5.

---

## 23. Next Step

```text
1. Owner reviews this audit
2. P6.4 Design Freeze (GO WITH CONDITIONS addressed)
3. Owner GO → implement P6.4 UI only
4. P6.4/P6.5 Production Gate (per P6 freeze)
```

**Do not implement UI before Design Freeze.**

---

## Appendix A — Recommended Polish labels (draft for freeze)

| Concept | Label |
|---------|--------|
| Effects | Efekty |
| Add effect | Dodaj efekt |
| Bypass / enabled | Wyłączony / Włączony (or „Omijaj”) |
| Reorder up/down | W górę / W dół |
| Master | Master |
| Gain | Głośność |
| Pan | Panorama |
| Threshold | Próg |
| Ratio | Ratio (or „Stopień kompresji”) |
| Attack / Release | Atak / Zwolnienie |
| Makeup | Wyrównanie |
| Ceiling | Sufit |
| Mix | Mix (or „Poziom efektu”) |
| Decay | Zanikanie |
| Time | Czas |
| Feedback | Sprzężenie |
| Conflict | use frozen `FX_CHAIN_VERSION_CONFLICT` copy |

Exact wording: Design Freeze.

---

## Appendix B — Evidence pointers

| Topic | Path |
|-------|------|
| Track controls UI | `src/components/studio/studio-editor.tsx` |
| Engine Master insert | `src/lib/studio/studio-audio-engine.ts` |
| Registry / validation | `src/lib/studio/studio-fx-chain.ts` |
| Track FX PATCH | `src/app/api/studio/projects/[projectId]/tracks/[trackId]/effects/route.ts` |
| Master FX PATCH | `src/app/api/studio/projects/[projectId]/master-fx/route.ts` |
| Track control PATCH (no CAS) | `src/app/api/studio/projects/[projectId]/tracks/[trackId]/route.ts` |
| P6 sequence | freeze §35 |

---

**Production application remains `350303e`. No deployment in this audit.**
