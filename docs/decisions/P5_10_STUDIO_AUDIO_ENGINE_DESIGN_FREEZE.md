# P5.10 Studio Audio Engine / Multi-Source Playback Design Freeze

**Status:** DESIGN FREEZE — GO WITH CONDITIONS  
**Date:** 2026-10-06  
**Product name:** Studio Audio Engine / Multi-Source Playback Foundation  
**Type:** DESIGN FREEZE ONLY — **NO IMPLEMENTATION IN THIS STEP**  
**Architecture audit:** [P5_9_STUDIO_ARCHITECTURE_AUDIT.md](../architecture/P5_9_STUDIO_ARCHITECTURE_AUDIT.md)  
**Parent contracts:** [P5_STUDIO_DESIGN_FREEZE.md](./P5_STUDIO_DESIGN_FREEZE.md) · [P5_6_STUDIO_TAKE_WORKFLOW_DESIGN_FREEZE.md](./P5_6_STUDIO_TAKE_WORKFLOW_DESIGN_FREEZE.md) · [P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md](./P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md) · [P5_7_STUDIO_ARCHITECTURE_AUDIT.md](../architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md)  
**Production application SHA:** `95e04ff534d58de3476e3a2dc620a13fbcacb7ba`  
**Production deployment:** `dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S`  
**Repo tip at freeze authoring:** `5cbed12d27f1d24296fb42610888558c1aa5d5eb`  
**Production URL:** https://www.bitrymdym.pl

```text
P5.10 DESIGN FREEZE STATUS: GO WITH CONDITIONS
IMPLEMENTATION: NOT PART OF THIS TASK
P6 product FX / mix rack / master DSP: FORBIDDEN in this unit
```

**Unit numbering (frozen here):**

```text
P5.7  = Architecture Audit (GO WITH CONDITIONS)
P5.8  = Studio Devices / Input Foundation — PRODUCTION VERIFIED — GREEN
P5.9  = Architecture Audit (post–P5.8) — GO WITH CONDITIONS
P5.10 = THIS Design Freeze — Studio Audio Engine / Multi-Source Playback Foundation
```

Do **not** call this unit “P6”. P6 remains later FX / mix / master **product** work.  
Do **not** call punch “P5.7”, “P5.9”, or “P5.10”.

---

## 1. Executive Summary

Studio after P5.8 is a verified editor/recording foundation. Playback is still **two `HTMLAudioElement`s** (beat clock + first-wins TAKE). That cannot host overlap mix, track graph, or later FX without becoming a second brittle engine.

P5.10 freezes **one Studio-owned audio engine**:

```text
Studio UI
  → StudioTransport (timeline clock / PLAY·PAUSE·STOP·SEEK UX)
  → StudioAudioEngine (AudioContext + voices + Track/Master graph)
  → authorized audio output
```

**Target of this unit (when later implemented):** concurrent audible Clips under a shared clock; Track `gainDb` / mute / solo / pan applied **in the graph**; Master node as future FX/bus attach point.

**Not this unit:** product FX, automation, mastering meters, instruments, ARTIFACT playback ship, E3 Mix migration, recording rewrite, PlayerProvider rewrite, autosave.

```text
StudioAudioEngine ≠ PlayerProvider
StudioAudioEngine ≠ E3 Mix product graph
StudioAudioEngine ≠ recording pipeline
first-wins MUST NOT remain the target mix model
```

---

## 2. Canonical Baseline

| Item | Value |
|------|--------|
| Production app | `95e04ff` — P5.8 GREEN |
| Production deploy | `dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S` |
| P5.9 audit | `5cbed12` · GO WITH CONDITIONS |
| SSOT reconcile | `c4c7569` |
| Domain | Project → Track → Clip → Take (P5.1 frozen) |
| Time persistence | **integer milliseconds** (P5 Studio freeze) |
| Transport FSM | `src/lib/studio/studio-transport.ts` |
| Current playback | `studio-transport-provider.tsx` · dual HTMLAudio |
| Track mix fields (already persisted) | `gainDb`, `pan`, `muted`, `solo`, `outputRoute`; clip `gainDb`/`muted`/`fadeInMs`/`fadeOutMs`; project `masterGainDb`/`masterPan` |
| Solo semantics | `isTrackAudible` — mute wins; if any solo, only solo tracks |
| Recording | eligibility → session → TakeMediaRecorder → finalize → READY → explicit place |
| Devices | P5.8 localStorage + `useMicAnalyser` (metering only) |
| Catalog | `PlayerProvider` — suppressed in Studio |
| E3 Mix | `src/lib/mix/mix-graph.ts` — beat MixPanel Web Audio |

WIP in the working tree is **out of scope** and must remain untouched.

---

## 3. Problem Statement

1. **One playhead ≠ one audible source is required**, but P5 playback picks a single TAKE (`pickTakeClipAtPlayhead` = `Array.find`) and a single BEAT_REF. Overlaps exist in the document and are silent-mixed as first-wins.
2. Track/clip/master gain, mute, solo, pan **already exist as document fields** and UI, but are not a real mix graph. Wiring them to HTMLAudio `.volume` would block P6.
3. E3 Mix already owns a Web Audio graph on the **catalog beat** surface. Copying that graph into StudioTransport, or bolting FX onto HTMLAudio, creates **dual-engine risk**.
4. `ARTIFACT` can persist but does not play. The engine must leave an adapter slot without shipping ARTIFACT audio now.
5. Recording, catalog PlayerProvider, and P5.8 devices are healthy. The gap is **Studio playback runtime**, not more Take UX.

---

## 4. Existing Audio Architecture

```text
Catalog:
  PlayerProvider → HTMLAudioElement → sticky mini-player

Studio (today):
  StudioTransportProvider
    HTMLAudio (BEAT_REF, clock via timeupdate)
    HTMLAudio (TAKE, first-wins)
  useMicAnalyser AudioContext → AnalyserNode (no destination)

E3 Mix (catalog beat MixPanel):
  createMixPreviewGraph
    MediaElementSource(beat) + MediaElementSource(take)
    → mix FX → limiter → basic master → destination
```

**Evidence (do not “fix” in this freeze):**

- Transport comment: distinct from PlayerProvider.
- Mix graph comment: client Mix + Basic Master preview; durable render out of scope.
- `STUDIO_CLIP_SOURCE_KINDS` = `TAKE` | `BEAT_REF` | `ARTIFACT`.
- `outputRoute` on tracks currently defaults conceptually to `"master"` — string exists; extra buses are **not** a graph yet.

---

## 5. Architectural Goals

1. One **StudioAudioEngine** per mounted Studio project editor.
2. **Multi-source** playback: all currently audible Clips mix under one clock.
3. **Shared clock** with integer-ms document playhead unchanged.
4. Track/clip/master **gain/mute/solo/pan consumed inside the graph**.
5. Extensible **source adapters** (no central `if sourceKind` engine core).
6. Stable **Track Node → Master → Output** attach points for later FX/buses.
7. Preserve `StudioTransport != PlayerProvider`, `finalize != place`, P5.8 devices, P3/P4 security.
8. Mobile 390×844: one engine, not a second mobile engine.
9. Zero new DB/RPC/Storage identity for this unit.

---

## 6. Explicit Non-Goals

```text
Product FX: EQ, compressor, limiter, reverb, delay, de-esser, autotune, pitch correction
Automation lanes / parameter automation
Mastering: LUFS, true peak, spectrum, clip detect as product features
P7: sample browser, instruments, scratch engine, time-stretch, reverse, loop editor, drag & drop
Punch, pre-roll, count-in, metronome, BPM UX, quantization
Recording rewrite, eligibility/session/finalize/place/claim changes
PlayerProvider rewrite
E3 Mix migration / Studio takeover of MixPanel
ARTIFACT playback ship (adapter slot only)
Autosave, document_version contract, undo/redo, collab locking
DB device preferences
Second analyser / second MediaRecorder
```

---

## 7. StudioAudioEngine Boundary

### Owns

- One `AudioContext` for the Studio editor session.
- Voice/source nodes for audible Clips.
- Track nodes (gain, mute, solo-derived audible, pan).
- Master node (gain, pan) as the single mix output of this unit.
- Scheduling against the shared clock (start/stop/offset of voices on PLAY/SEEK).
- Engine lifecycle (init, load, play, pause, seek, stop, dispose).
- Engine-stable error codes (see §28).
- Diagnostics: active voice count, load/play/sync failures, dispose.

### Does not own

- Project document CRUD, Clip geometry, Track reorder.
- Signed URL issuance, Storage keys, ownership.
- Recording capture / finalize / place.
- Mic permission / device list (P5.8).
- Input meter (`useMicAnalyser` remains).
- Catalog PlayerProvider.
- E3 MixPanel product graph.
- Timeline zoom/snap UI (P5.4).

### Layering (frozen)

```text
Studio UI (editor, transport buttons, meters)
    ↓ commands / subscriptions
StudioTransport          // playhead FSM · integer ms · STOP=0 (existing reduceStudioTransport)
    ↓ clock + transport events
StudioAudioEngine        // graph + voices
    ↓
Source adapters          // BEAT_REF · TAKE · (later ARTIFACT/SAMPLE/…)
    ↓
Track Node               // gain / mute / solo / pan
    ↓
Master Node              // masterGainDb / masterPan
    ↓
Audio destination
```

**Clock vs graph:** StudioTransport remains the **timeline clock and UX contract**. StudioAudioEngine is the **audible realization**. The engine must not invent a second user-facing playhead. UI reads playhead from Transport (updated from engine-reported time while playing — see §13).

**Forbidden:** engine directly mutating `studio_clips` / `studio_tracks` / `takes`.

---

## 8. PlayerProvider Boundary

```text
PlayerProvider  = catalog / marketplace beat playback
StudioAudioEngine = Studio project timeline playback
```

| Rule | Contract |
|------|----------|
| Isolation | Studio **must not** play timeline audio through PlayerProvider |
| Suppression | Existing `setSuppressed(true)` while Studio transport is mounted **remains** |
| Sticky mini-player | Hidden when suppressed; unchanged |
| Shared primitives | Optional later DRY of `dbToGain`-class helpers **only**; no shared playback session |
| Rewrite | **OUT** |

Why: catalog seek/queue/mini-player UX ≠ multi-clip timeline mix. Merging them would couple marketplace AuthZ/playback purpose with Studio document playback.

---

## 9. E3 Mix Boundary

```text
E3 Mix graph = product Mix/Master *preview* on beat recording surface
StudioAudioEngine = Studio timeline mix foundation
```

| Question | Decision |
|----------|----------|
| Share primitive math / node helpers? | **YES, later, optional** (`dbToGain`, panner mapping). Extract only if DRY without moving ownership. |
| Share the MixPanel graph as Studio SSOT? | **NO** |
| StudioAudioEngine owns all Web Audio in the product? | **NO** — owns Studio session Web Audio only |
| Migrate E3 Mix in P5.10 implementation? | **NO** |
| Dual Web Audio in the app? | **ACCEPTED** as two **product surfaces** (catalog Mix vs Studio). **FORBIDDEN:** two Studio timeline engines |

**Target later (not this freeze):** a shared low-level “audio node kit” used by MixPanel and Studio, still two graphs, one kit. Until that kit freeze exists, **copy of patterns is allowed; import of MixPanel into StudioTransport is not.**

---

## 10. Project → Track → Clip → Source Model

Frozen domain (unchanged from P5.1):

| Entity | Role | Must not become |
|--------|------|-----------------|
| **Project** | Document container (tempo, length, master, version) | AudioContext |
| **Track** | Mix channel / future FX host | Take |
| **Clip** | Timeline instance (start, duration, sourceOffset, clip gain/mute/fades) | AudioNode |
| **Take** | Immutable READY media asset | Track or Clip |
| **Beat** | Catalog/project beat referenced by BEAT_REF | Studio engine |
| **Audio Source (runtime)** | Engine voice bound to Clip + authorized URL/buffer | Persisted row |

```text
Take  --referenced by-->  Clip  --lives on-->  Track  --in-->  Project
                              |
                              v
                     StudioVoice (runtime only)
```

**Clip geometry remains document SSOT.** Engine maps Clip → voice; deleting a Clip disposes its voice; moving a Clip reschedules it.

---

## 11. Source Adapter Model

Engine core schedules **voices**. A **Source Adapter** supplies:

- resolve authorized playback handle (URL or buffer) **from already-authorized session data**
- report duration / readiness
- attach to a Track Node
- dispose

### MUST in this unit (architecture + later impl)

| Adapter | Source | Notes |
|---------|--------|--------|
| `BEAT_REF` | Project beat via existing beat access gate (`PUBLIC_PLAYBACK_PURPOSE` / Studio beat resolution) | Multiple BEAT_REF clips may be audible if geometry overlaps |
| `TAKE` | READY Take via existing `/api/takes/preview` (or equivalent signed preview) | Multiple overlapping TAKEs **mix** |

### MUST be addable later without core rewrite

| Adapter | Now |
|---------|-----|
| `ARTIFACT` | **Stub registered** — no playback ship; fail closed / silent with `AUDIO_SOURCE_UNAVAILABLE` |
| SAMPLE / INSTRUMENT / GUITAR / SCRATCH / FX SOURCE | **Not registered** |

**Forbidden in engine core:**

```text
if (sourceKind === "TAKE") { ... }
else if (sourceKind === "BEAT_REF") { ... }
```

as the **scheduling/mix** algorithm. Kind-specific I/O lives **only** in adapters.

**Media strategy (this unit):** default = **authorized media element or equivalent stream** feeding `MediaElementAudioSourceNode` (same family as E3 Mix). Decode-to-`AudioBuffer` is allowed later for short clips; not required to ship the foundation. **One AudioContext** per engine instance.

Adapters **never** accept client `objectKey` / `ownerId` as authority.

---

## 12. Multi-Source Playback Model

### Target (replaces first-wins)

At playhead `t` (integer ms):

1. Consider every Clip where  
   `timelineStartMs <= t < timelineStartMs + durationMs`.
2. Skip Clip if `clip.muted`.
3. Skip if Track not audible (`isTrackAudible`: muted off; if any track solo, only solo tracks).
4. Remaining Clips are **concurrent voices** — Beat + Take, Take + Take, Beat + many Takes.
5. Each voice offset = `sourceOffsetMs + (t - timelineStartMs)`.

### Overlap policy (frozen)

```text
Overlap = mix (sum in the graph), not first-wins
```

Known P5 limit is **deprecated as target**. During implementation, first-wins HTMLAudio path is **removed** from Studio timeline playback (library Take preview: see §14).

### Future sources

SAMPLE / INSTRUMENT / ARTIFACT participate as additional adapters/voices with the **same** scheduler. No parallel “instrument clock”.

### Loop

Loop of the **project timeline** is **OUT** of this unit (loop *readiness*: clock API may accept a future loop window; unused).

---

## 13. Shared Audio Clock

### Persistence (unchanged)

```text
document / UI playhead / Clip edges = integer milliseconds
```

### Runtime

```text
AudioContext.currentTime  (seconds, high precision)
```

### Conversion

```text
On PLAY or SEEK:
  epochContextTime = ctx.currentTime
  epochPlayheadMs  = transport.playheadMs

While playing:
  playheadMs = epochPlayheadMs + round((ctx.currentTime - epochContextTime) * 1000)
  clamped to [0, timelineLengthMs] via existing clampPlayheadMs

Voice start in context:
  sourceOffsetSec = sourceOffsetMs / 1000
  clipLocalSec    = max(0, (playheadMs - timelineStartMs) / 1000)
  when to start   = now + look-ahead (implementation detail; must stay sync-safe)
```

UI playhead **must not** independently drift from engine time while `phase === playing`. Transport TICK sourced from engine clock, not from a single HTMLAudio `timeupdate` as sole authority (that is the current first-wins clock bug for multi-source).

**Seek consistency:** after SEEK, every audible voice’s media position equals the formula above within a freeze tolerance:

```text
MAX_SYNC_SKEW_MS = 40   // diagnostic; UI still integer ms
```

Violation → `AUDIO_SYNC_FAILED` (diagnostic; user-facing: generic playback error — §28).

**Pause:** freeze epoch; do not reset playhead.  
**Stop:** existing contract — `phase = stopped`, `playheadMs = 0` (`reduceStudioTransport`). Engine stops all voices and returns media to idle.

---

## 14. Transport Integration

Existing FSM events remain the public Studio transport contract:

| Event | Engine |
|-------|--------|
| PLAY | Resume/start all voices for current `t` |
| PAUSE | Suspend graph / pause media; keep `t` |
| STOP | Stop voices; playhead 0 |
| SEEK | Reschedule all voices to new `t` **atomically** |
| SET_LENGTH | Clamp playhead; drop voices past new end |

**Take library preview (`previewTake`):** remains **Studio-owned**, never PlayerProvider. After engine exists, preview is an **engine preview voice** (solo preview may duck/pause timeline voices — existing UX: preview pauses beat). Must not reintroduce a second long-lived HTMLAudio pair outside the engine.

**Recording:** transport may still PLAY the beat under a live take (P5.5). Live mic is **not** an engine voice. Input meter stays `useMicAnalyser`. Engine continues timeline (typically BEAT_REF + existing clips); new Take appears only after place.

---

## 15. Track Audio Graph

```text
Voice (adapter)
  → Clip gain / mute / (fade later product)
  → Track Node
       gainDb → GainNode
       pan → StereoPannerNode (or equivalent)
       mute/solo → gain 0 via isTrackAudible (not disconnected-unless-needed)
  → Master Node
       masterGainDb, masterPan
  → destination
```

**This unit implements** Track Node + Master Node **without** insert FX slots populated.

**Clip fades** (`fadeInMs` / `fadeOutMs`): fields exist. **SHOULD** apply as gain automation on the clip voice if cheap; **not** a P6 automation system. If deferred, document as known gap — must not invent a second fade model later.

**`outputRoute`:** persist as today. This unit treats all tracks as routing to **Master**. Extra bus names are ignored until a bus freeze. **Do not** add bus tables now.

---

## 16. Gain / Mute / Solo / Pan Foundation

| Parameter | Lives | Engine |
|-----------|--------|--------|
| Track `gainDb`, `pan`, `muted`, `solo` | Document (`studio_tracks`) | Consumed live |
| Clip `gainDb`, `muted` | Document (`studio_clips`) | Consumed live |
| Project `masterGainDb`, `masterPan` | Document (`studio_projects`) | Consumed live |
| PLAY/PAUSE/SEEK/STOP | Runtime only | Not a document write |

**Solo:** reuse `isTrackAudible` (mute wins over solo).

**Linear mapping:** reuse `gainDbToLinearVolume` semantics (finite dB → linear; existing +12 dB cap in beat helper — keep one SSOT helper in Studio, do not fork).

**UI may already change track controls.** Implementation must route those values into the graph **without** treating HTMLAudio `.volume` as the mix SSOT.

Changing gain/mute/solo/pan **is document mutation** (existing `updateStudioTrackControlsFor` already bumps `document_version`). Engine does not bump version itself.

---

## 17. Routing / Bus / Master Boundary

```text
Source → Clip voice → Track Node → [future Track FX] → [future Bus] → Master Node → [future Master FX] → Output
```

| Node | This unit |
|------|-----------|
| Track Node | **YES** |
| Master Node | **YES** (gain/pan only) |
| Named buses / send-return | **NO** (slot: Track `outputRoute` remains string) |
| Meter tap | **COULD** AnalyserNode on Master for a simple peak — not LUFS/true-peak product |

Future FX insert: **after** Track dry gain/pan decision in a later freeze (typical: Track FX then pan, or pre-fader FX — **not decided here**; only that inserts hang off Track Node / Master Node, not off HTMLAudio).

---

## 18. Future FX Boundary

```text
Track Node
  → (P6) Track FX Chain
  → (P6) Bus / sends
Master Node
  → (P6) Master FX
  → Output
```

P5.10 **must not** implement EQ/comp/reverb/etc.  
P5.10 **must** leave a single graph so P6 does not create Engine v2.

Autotune / pitch: **NOT READY** (P5.9); likely offline/worker later — not an insert in this graph now.

---

## 19. Recording Boundary

Recording SSOT **unchanged**:

```text
eligibility → session → TakeMediaRecorder → upload → finalize → READY → explicit place
```

| Engine may | Engine must not |
|------------|-----------------|
| Play existing Clips / beat under record | Create sessions |
| Consume READY Take after place | Upload, objectKey, claim |
| Stay recording-safe on SEEK/PLAY | Own `getUserMedia` capture |
| | Replace `useMicAnalyser` |
| | Auto-place on finalize |

P5.8 device layer remains the input SSOT. Engine errors ≠ device errors.

---

## 20. Storage / Security Boundary

Engine consumes **only** playback handles produced by existing AuthZ:

- Beat: existing Studio/beat access actions (signed playback).
- Take: existing preview API (owner/session).
- Per-voice fetch **fail closed** (`AUDIO_SOURCE_UNAVAILABLE`).

```text
NO client-controlled ownerId
NO client-controlled objectKey as authority
NO engine-issued Storage URLs
IDOR / cross-user 404 / unauth 401 remain API/RPC problems, not engine bypasses
```

Project/Track/Take ownership stays in `studio-service` / takes APIs (`assertOwnsProject`, READY place checks).

---

## 21. ARTIFACT Strategy

| Question | Decision |
|----------|----------|
| Block engine freeze? | **NO** |
| Adapter interface now (design)? | **YES** — registered stub |
| Ship ARTIFACT audible playback in P5.10 impl? | **NO** |
| Add adapter later without core rewrite? | **YES** |
| AuthZ when shipped | Artifact ownership / project link — **later freeze** |

Silent ARTIFACT clips remain a known P5.9 M2 until that freeze.

---

## 22. Track Capability Compatibility

Capability system **not** a prerequisite (P5.9 H1).

Engine keys off **Clip adapters + Track mix fields**, not `trackType === "BEAT"|"VOCAL"`.

Implementation **SHOULD NOT** add new domain `if (trackType === …)` in the engine. Existing seed/recordable-track hardcodes may remain **outside** the engine until a capabilities freeze.

Illustrative future flags (not implemented):

```text
canRecord · canMonitor · canPlay · canEdit · supportsInput · supportsFx
```

`canPlay` would later gate whether a track’s clips spawn voices — engine should accept an optional `isTrackPlayable` predicate so capabilities can plug in without rewrite.

---

## 23. document_version Boundary

| State | document_version |
|-------|------------------|
| play / pause / seek / stop / AudioContext suspend | **Runtime only — no bump** |
| Track gain/mute/solo/pan (existing API) | Existing bump on track-control update |
| Clip move/trim/split | Existing (incomplete bump — **out of this freeze**; H2 before autosave) |

Engine **must not** implement autosave or expand version bumps.

Audio runtime (nodes, context state, decode cache) is **ephemeral**. Document remains Project/Track/Clip rows.

---

## 24. Lifecycle

```text
create → initialize (AudioContext) → load (adapters for current document)
  → ready → play ↔ pause → seek → stop → dispose
```

| Event | Behavior |
|-------|----------|
| Project switch / editor unmount | **dispose** previous engine; one instance |
| Track/clip add/move/delete | Reschedule / spawn / dispose affected voices; keep clock |
| New READY Take placed | New TAKE voice when geometry hits playhead |
| Tab hidden | Follow browser; may suspend context |
| Tab restored | Resume if transport still `playing` and context running; else stay paused with playhead |
| `AudioContext` suspended | `AUDIO_CONTEXT_UNAVAILABLE` / user-gesture resume path |
| Source 401/404 | That voice silent + `AUDIO_SOURCE_UNAVAILABLE`; others continue |

---

## 25. Concurrency

```text
One mounted Studio project editor = one StudioAudioEngine
```

| Case | Rule |
|------|------|
| Two engine instances in one editor | **FORBIDDEN** |
| Two browser tabs | Two engines, **no** sync (P5.9 M4) |
| Unmount | dispose context + media + listeners |
| Catalog + Studio | PlayerProvider suppressed; MixPanel not mounted in Studio editor |

Cross-tab audio sync: **OUT**.

---

## 26. Performance

- Lazy-load media for Clips near the playhead (lookahead window — implementation detail; freeze: do not decode the entire project eagerly on mobile).
- Dispose unused voices (ended clips, deleted clips).
- Do not allocate FX chains in this unit.
- One context; avoid extra `AudioContext` (metering analyser may remain a **separate** small context as today, or attach to engine later **without** replacing capture).
- Memory: cap concurrent decoded buffers if buffer strategy is used; media-element strategy preferred for long beats.
- Mobile: no `AudioWorklet` **requirement** in this unit.

No benchmarks in this freeze.

---

## 27. Mobile

- Viewport **390×844**, touch transport, timeline, record, monitor, track controls.
- **One engine** for desktop and mobile.
- Autoplay / `AudioContext` resume must be user-gesture friendly (PLAY).
- No separate iOS “HTMLAudio-only” engine. If iOS constraints force media elements, they still feed **this** graph.

---

## 28. Error Model

P5.8 device codes **stay** on the device layer. Engine codes are separate:

| Code | Meaning |
|------|---------|
| `AUDIO_CONTEXT_UNAVAILABLE` | No context / blocked / missing Web Audio |
| `AUDIO_SOURCE_UNAVAILABLE` | Authorized handle missing / 401/404 / empty adapter (ARTIFACT stub) |
| `AUDIO_DECODE_FAILED` | Decode path failed (if used) |
| `AUDIO_PLAYBACK_FAILED` | Media/graph start failed |
| `AUDIO_SYNC_FAILED` | Voices diverged beyond `MAX_SYNC_SKEW_MS` |
| `AUDIO_OUTPUT_ERROR` | Destination / hardware output failure |

`AUDIO_DEVICE_ERROR` is **not** an engine capture code — input devices remain P5.8 (`DEVICE_*`). Do not duplicate.

| Layer | User-facing (PL, via labels) | Diagnostic |
|-------|------------------------------|------------|
| UI | Short stable message | Code + voice/clip id (no storage keys) |
| Engine | Emits code | Logs code, adapter kind, clip id |

Do not treat `error.message` as contract (same rule as P5.8).

---

## 29. Accessibility Boundary

Engine exposes state for UI:

- transport phase, playheadMs  
- per-track audible (derived), mute/solo  
- engine error code  

Keyboard PLAY/PAUSE and control labels remain UI (existing PL Studio copy). Engine does not render DOM.

---

## 30. Observability

Minimum diagnostics (dev / structured, no PII deviceIds, no objectKeys):

- lifecycle transitions  
- source load failure (kind + clipId)  
- playback / sync failure  
- active voice count  
- dispose called vs leaked nodes (test assertion later)

No product telemetry platform in this unit.

---

## 31. Testing Strategy

**Do not add tests in this freeze.** Future implementation tests:

### Unit

Clock conversion; SEEK reschedule; overlap mix selection (two TAKEs both selected); `isTrackAudible` + engine mute/solo; pan/gain mapping; lifecycle dispose; adapter registry (unknown kind fail closed).

### Integration

Beat + Take; Take + Take overlap; two tracks; SEEK while playing; STOP → playhead 0; project unmount dispose; previewTake isolation from PlayerProvider.

### Security

Engine cannot play a Take preview without existing preview AuthZ; no objectKey in client engine config.

### Mobile

390×844 smoke: transport + no second player; gesture PLAY.

### Regression

P5.5/P5.6 finalize ≠ place; P5.8 devices; P3/P4; PlayerProvider isolation tests remain.

---

## 32. Implementation Order

**Not started by this task.** Logical order **after** Owner Implementation GO:

1. Clock mapping (ms ↔ `AudioContext`) + transport subscription  
2. StudioAudioEngine lifecycle + one AudioContext  
3. Adapter registry + TAKE + BEAT_REF adapters (authorized URLs only)  
4. Multi-voice scheduler (replace first-wins)  
5. Track Node + Master Node (gain/mute/solo/pan)  
6. Wire existing transport UI; suppress PlayerProvider (unchanged)  
7. previewTake via engine preview voice  
8. ARTIFACT stub adapter  
9. Unit/integration/regression  
10. Production Gate (served artifact check — P5.8 cache lesson)

---

## 33. DB / API / RPC / Storage Impact

| Surface | This unit |
|---------|-----------|
| DB migration | **NO** — reuse `gain_db`, `pan`, `muted`, `solo`, `master_*`, clip gain/mute/fades, `output_route` |
| RPC | **NO** |
| New public API | **NO** required — reuse beat access + `/api/takes/preview` |
| Storage | **NO** new buckets/keys |
| document_version semantics | **NO** change |

If a future bus table or ARTIFACT play AuthZ is needed, that is a **separate freeze**.

---

## 34. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Implementing FX “while we’re in the graph” | CRITICAL | OUT list; Production Gate rejects FX UI |
| Treating MediaElement graph as “still HTMLAudio SSOT” | HIGH | Mix SSOT = graph nodes, not element.volume |
| Importing MixPanel graph into Studio | HIGH | §9 NO |
| Leaving first-wins as default | HIGH | §12 mix policy |
| Second AudioContext sprawl | MEDIUM | One engine context; metering exception documented |
| iOS autoplay / resume | MEDIUM | PLAY user-gesture; tests on 390×844 |
| ARTIFACT stub mistaken for playback bug | LOW | Document M2 + stub code |

**Blockers to approve this freeze:** none that require code first (P5.9).

**Blockers to later P6 FX freeze:** this unit not GREEN in production.

---

## 35. MUST

### MUST BEFORE IMPLEMENTATION

1. Owner **Implementation GO** for P5.10 (this freeze ≠ impl).  
2. No app code in the freeze task (already).  
3. Do not start a vague “P6 FX” branch.

### MUST DURING IMPLEMENTATION

1. `StudioAudioEngine != PlayerProvider`.  
2. `finalize != place`; recording pipeline untouched.  
3. P5.8 device layer untouched as input SSOT.  
4. Replace timeline first-wins with **overlap mix**.  
5. Apply track/clip/master gain-mute-solo-pan **in the graph**.  
6. Integer-ms persistence; shared clock conversion §13.  
7. STOP = playhead 0 (existing FSM).  
8. One engine instance per editor; dispose on unmount.  
9. No new DB/RPC/Storage identity.  
10. Adapter registry; no core `if sourceKind` mix algorithm.  
11. Fail closed per missing source; other voices continue.  
12. Mobile 390×844; user-gesture PLAY.  
13. Production Gate verifies **served JS** contains engine (P5.8 cache incident).

---

## 36. SHOULD

1. Clip fades via clip-voice gain if inexpensive.  
2. Optional Master AnalyserNode for a simple meter (not LUFS).  
3. Avoid new `trackType ===` branches in engine.  
4. Optional `isTrackPlayable` predicate for future capabilities.  
5. Keep `useMicAnalyser` (no second recording analyser).  
6. SSOT living-docs update **after** impl GREEN (not this freeze).

---

## 37. COULD

1. Shared `dbToGain` helper with Mix (extract kit later).  
2. Lookahead load window tuning.  
3. Decode-to-buffer for short TAKEs after media-element path works.  
4. Feature flag during rollout (timeline HTMLAudio vs engine) — **temporary only**.

---

## 38. OUT

```text
FX implementation · EQ · compressor · limiter · reverb · delay · de-esser
Autotune · pitch correction · automation
Mastering LUFS / true peak / spectrum / clip detect as product
Sample browser · instruments · scratch · stretch · reverse · loop editor · DnD
Punch · pre-roll · count-in · metronome · BPM UX
Recording rewrite · PlayerProvider rewrite · E3 Mix migration
ARTIFACT playback ship · autosave · document_version expansion
Undo/Redo · collab · DB device prefs · extra bus schema
```

---

## 39. Final Design Freeze Decision

```text
P5.10 DESIGN FREEZE: GO WITH CONDITIONS
```

**Rationale for WITH CONDITIONS (not unconditional GO):**

1. E3 Mix remains a **second product-surface Web Audio graph** until a later shared-kit freeze — accepted, must not be “fixed” by merging Mix into Studio in this unit.  
2. ARTIFACT remains a **stub**; silence is specified, not a bug.  
3. Clip fades and master meter are SHOULD/COULD, not ship-blockers.  
4. Implementation is **explicitly excluded** from this task.

**Conditions do not include:** rewrite recording, capabilities, autosave, or DB migrations.

### MUST BEFORE IMPLEMENTATION

Owner Implementation GO.

### MUST DURING IMPLEMENTATION

See §35.

### SHOULD / COULD / OUT

See §36–§38.

```text
Implementation is NOT part of this task.
Next stage = separate implementation prompt after Owner GO.
Do not deploy from this freeze.
Production application remains 95e04ff until a later impl Production Gate.
```

**OPEN DECISIONS introduced by this freeze:** **NONE** (bus topology, Track FX insert order, ARTIFACT AuthZ, shared node-kit, and P6 FX remain **later** freezes — not silent ODs).

---

*End of P5.10 Studio Audio Engine / Multi-Source Playback Design Freeze.*
