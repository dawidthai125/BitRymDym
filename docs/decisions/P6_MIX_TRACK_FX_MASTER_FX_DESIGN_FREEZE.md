# P6 Mix / Track FX / Master FX Foundation — Design Freeze

**Status:** DESIGN FREEZE — GO WITH CONDITIONS  
**Date:** 2026-10-06  
**Product name:** Studio Mix / Track FX / Master FX Foundation  
**Type:** DESIGN FREEZE ONLY — **NO IMPLEMENTATION IN THIS STEP**  
**Architecture audit:** [P5_11_STUDIO_POST_AUDIO_ENGINE_ARCHITECTURE_AUDIT.md](../architecture/P5_11_STUDIO_POST_AUDIO_ENGINE_ARCHITECTURE_AUDIT.md)  
**Parent contracts:** [P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md](./P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md) · [P5_STUDIO_DESIGN_FREEZE.md](./P5_STUDIO_DESIGN_FREEZE.md) · [P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md](./P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md) · [P5_6_STUDIO_TAKE_WORKFLOW_DESIGN_FREEZE.md](./P5_6_STUDIO_TAKE_WORKFLOW_DESIGN_FREEZE.md)  
**Production application SHA:** `9c2a958cf94aca07679ed338cc23e21bb600fd4c`  
**Production deployment:** `dpl_L7pB5A8iuY8CKipxbLsGEVLESZTC`  
**Repo tip at freeze authoring:** `2039e9364b3d44e7f5ea5b608044cee641bc5c23`  
**Production URL:** https://www.bitrymdym.pl

```text
P6 DESIGN FREEZE STATUS: GO WITH CONDITIONS
IMPLEMENTATION: NOT PART OF THIS TASK
SECOND STUDIO ENGINE: FORBIDDEN
E3 MIX MERGE: FORBIDDEN
RECORDING INPUT FX: FORBIDDEN
```

**Unit numbering (frozen here):**

```text
P5.10 = Studio Audio Engine — PRODUCTION VERIFIED — GREEN
P5.11 = Architecture Audit (post–P5.10) — GO WITH CONDITIONS
P6    = THIS Design Freeze — Mix / Track FX / Master FX Foundation
P6.1…P6.5 = implementation slices (see §35) after Owner GO
```

Do **not** call this unit P5.12. Do **not** call punch / samples / buses “P6”.

---

## 1. Status

```text
DESIGN FREEZE: GO WITH CONDITIONS
IMPLEMENTATION: NOT STARTED
DB MIGRATION: NOT REQUIRED (jsonb columns already exist)
PRODUCTION: UNCHANGED (9c2a958)
```

**Conditions (must be honored in implementation, not reasons to delay the freeze):**

1. Persist only into existing `studio_tracks.effects_chain` and `studio_projects.master_fx_chain`. **No new tables. No RPC. No Storage.**
2. FX writes **MUST** bump `document_version` with **CAS** (`expectedDocumentVersion`).
3. Engine remains **one** `StudioAudioEngine`. Insert nodes into the P5.10 graph.
4. Do **not** import `mix-graph.ts`, MixPanel, or PlayerProvider.
5. Recording / devices / Take pipeline stay SSOT of P5.5–P5.8.
6. Take **preview stays dry of FX chains** (P5.11 SHOULD → **OUT of P6 Foundation**; see §24).
7. Full autosave / H2 clip-mutation versioning remains **later**. P6 closes versioning **only for FX writes**.

---

## 2. Baseline

| Item | Value |
|------|--------|
| Production app | `9c2a958` — P5.10 GREEN |
| Production deploy | `dpl_L7pB5A8iuY8CKipxbLsGEVLESZTC` |
| P5.10 freeze | `e191f5c` |
| P5.10 impl | `9c2a958` |
| P5.10 SSOT | `2392016` |
| P5.11 audit | `2039e93` · GO WITH CONDITIONS |
| Engine | `src/lib/studio/studio-audio-engine.ts` |
| Schedule | `planVoicesAtPlayhead` · overlap = MIX |
| Track mix helpers | `isTrackAudible` · `gainDbToLinearVolume` · `normalizePan` |
| Track PATCH today | `PATCH /api/studio/projects/:id/tracks/:trackId` — name/mute/solo/gain/pan/arm |
| `document_version` today | Bumped **only** in `updateStudioTrackControlsFor` |
| jsonb stubs | `effects_chain` (tracks) · `master_fx_chain` (projects) — **not in DTO** |
| `output_route` | CHECK `IN ('MASTER')` — buses OUT |
| E3 Mix | `src/lib/mix/params.ts` + `mix-graph.ts` — **separate product** |
| WIP | Untouched |

Verified in schema (`20261006051500_p5_1_studio_project_track_clip_foundation.sql`): columns exist, nullable jsonb, no CHECK on chain shape.

---

## 3. Cel

Zamrozić **implementowalny kontrakt** warstwy Mix/FX nad istniejącym silnikiem:

- persistowana, walidowana, wersjonowana topologia FX,
- jedna kolejność SSOT (dokument = runtime),
- bypass bez kasowania,
- fail-closed bez crashu i bez niekontrolowanego audio,
- Track chain ≠ Master chain.

P6 **nie** buduje drugiego engine, nie jest migracją E3 Mix, nie jest DAW-em.

---

## 4. Zakres

### IN (P6 Foundation)

- JSONB contracts `schemaVersion: 1`
- Server validation + DTO + dedicated mutations
- `document_version` bump + CAS on FX writes
- Track FX series inserts (pre-fader)
- Master FX series inserts (pre-master-fader; limiter last if present)
- Registry: `eq` · `compressor` · `limiter` · `reverb` · `delay`
- Bypass / reorder / add / remove
- Engine lifecycle: build / rebuild / dispose chains
- Test strategy + Production Gate definition

### OUT (formal — §32)

Buses, sends, sidechain, automation, autotune, pitch, stretch, reverse, loop, LUFS/true peak, input FX, output device, ARTIFACT playback, P7 engines, punch, metronome, BPM UX, autosave, E3 merge, global undo.

---

## 5. Architecture Decision

```text
P6 = insert FX layer on StudioAudioEngine
StudioAudioEngine ≠ PlayerProvider ≠ E3 Mix ≠ recording pipeline
Overlap remains MIX
Track/Master gain-pan-mute-solo remain P5.10 graph SSOT
HTMLAudioElement.volume remains NOT mix SSOT
```

**Reuse:** keep `isTrackAudible`, `gainDbToLinearVolume`, `normalizePan`, adapter registry, existing AuthZ (`assertOwnsProject`). Parameter *ranges* may **echo** E3 basic Mix numbers (same physical units) but live in a **Studio-owned** validator module (e.g. `src/lib/studio/studio-fx-chain.ts`). **Do not** call `parseMixParameters` / `createMixPreviewGraph`.

**No duplicate:** one chain parser/normalizer on the server and the same pure module imported by the engine (isomorphic validation). Engine must not invent a second schema.

---

## 6. Existing Audio Engine contract (P5.10 — unchanged)

```text
Voice (MediaElementAudioSourceNode)
  → Clip GainNode
  → Track input GainNode
  → Track GainNode          ← fader (gainDb, mute/solo → 0)
  → Track StereoPannerNode
  → Master GainNode
  → Master StereoPannerNode
  → destination
```

Clock, overlap MIX, adapters, fail-closed sources, STOP playhead 0, one context per editor — **P5.10 SSOT**. P6 only **inserts** series FX nodes at frozen points below.

Preview Take today: `clipGain → masterGain` (skips Track graph). P6 does **not** change that to wet (see §11).

---

## 7. Track FX graph

**Frozen topology (pre-fader inserts):**

```text
Voice
  → Clip Gain
  → Track FX[0]
  → Track FX[1]
  → …
  → Track input / Track Gain / Track Pan     ← “Track Node” (P5.10)
  → (sum into Master path)
```

| Slot | Owner | Notes |
|------|--------|--------|
| Clip Gain | Engine (existing) | `gainDbToLinearVolume` / mute |
| Track FX[i] | Engine, rebuilt from `effects_chain.effects[]` | Array index = order |
| Track Node | Engine (existing) | gain / pan / `isTrackAudible` |

**Empty chain:** Clip Gain connects directly to Track input (today’s wiring).

**Bypassed effect:** previous output connects to next input; persisted row stays. Implementation MAY keep a disconnected node or omit it; audible result MUST be wire-through.

**Disabled track (mute / not solo):** Track Node gain 0 as today; FX nodes MAY remain connected (CPU SHOULD later) — audible result unchanged.

---

## 8. Master FX graph

**Frozen topology:**

```text
Σ Track Pans
  → Master FX[0]
  → Master FX[1]
  → …
  → Master Gain / Master Pan     ← “Master Node” (P5.10)
  → destination
```

If the chain contains `limiter` and it is **enabled**, it **MUST** be the **last enabled** Master effect. Server rejects writes that place an enabled limiter before another enabled Master effect.

Track `limiter` has **no** “must be last on track” rule (clip-style peak control is allowed mid-chain).

**Empty Master chain:** Track pans connect to Master Gain (today’s wiring).

---

## 9. `effects_chain` JSONB contract

**Column:** `studio_tracks.effects_chain` (already exists, nullable).

**Canonical object (schemaVersion 1):**

```json
{
  "schemaVersion": 1,
  "effects": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "type": "eq",
      "enabled": true,
      "params": { }
    }
  ]
}
```

| Field | Rule |
|-------|------|
| `schemaVersion` | integer, **required**, P6 Foundation = **1** |
| `effects` | array, required (may be `[]`) |
| `effects[i].id` | UUID string, unique **within the chain** |
| `effects[i].type` | registry type (lowercase, see §11) |
| `effects[i].enabled` | boolean; `false` = bypass; **does not delete** |
| `effects[i].params` | object; keys per type (§12) |
| Order | **`effects[]` index is SSOT.** No parallel `order` field. |

**NULL / missing column:** normalize on read to `{ "schemaVersion": 1, "effects": [] }`. Do not write null after first successful P6 save (implementation SHOULD persist canonical empty object).

**Max length:** **8** effects per track chain (mobile + MediaElement voices already cost CPU; 8 series inserts is a hard server cap for v1).

**Forbidden extra keys at write:** reject unknown top-level keys (`additionalProperties` false) except future-proof `schemaVersion`. Unknown keys **inside params**: reject on write.

---

## 10. `master_fx_chain` JSONB contract

**Column:** `studio_projects.master_fx_chain` (already exists, nullable).

**Same envelope as Track** (`schemaVersion` + `effects[]`). **Separate document.** Do not share array identity, IDs, or mutation API with Track chains.

**Max length:** **8** effects on Master.

**Extra Master rule:** enabled `limiter` must be last enabled item (see §8).

**DTO names (frozen):**

| DB | DTO |
|----|-----|
| `effects_chain` | `effectsChain` on `StudioTrackDto` |
| `master_fx_chain` | `masterFxChain` on project in `StudioProjectDocument` |

---

## 11. Effect registry contract

**Module ownership (implementation):** Studio-only registry. Not E3 Mix registry.

```text
STUDIO_FX_CHAIN_SCHEMA_VERSION = 1
STUDIO_FX_TYPES = eq | compressor | limiter | reverb | delay
```

| type | Track | Master | Web Audio sketch (informative, not a second engine) |
|------|-------|--------|------------------------------------------------------|
| `eq` | YES | YES | 3× `BiquadFilterNode` (lowshelf, peaking, highshelf) |
| `compressor` | YES | YES | `DynamicsCompressorNode` |
| `limiter` | YES | YES | `DynamicsCompressorNode` (high ratio / knee) + makeup/ceiling as Gain — **not** LUFS |
| `reverb` | YES | YES | `ConvolverNode` **or** compact feedback comb/allpass; wet/dry Gain pair. Impulse generation is implementation detail; **must not** fetch Storage URLs from the client as authority |
| `delay` | YES | YES | `DelayNode` + feedback Gain + wet/dry. **Not** BPM-synced |

**Unknown `type` on write:** HTTP 400, chain not saved.  
**Unknown `type` on read (corrupt / future row):** that slot **bypass** (wire-through) + diagnostic `AUDIO_FX_UNKNOWN_TYPE`; rest of chain continues.

**Duplicate `id` on write:** 400.  
**Client omits `id`:** server generates UUID.  
**Client supplies `id`:** keep if unique UUID.

**First-wave split (naming only — still one freeze):**

| Slice | Ships types in graph |
|-------|----------------------|
| P6.1 | validation + persist all five types (data) |
| P6.2 | Track graph: all five |
| P6.3 | Master graph: all five |
| P6.4 | UI |
| P6.5 | Production Gate |

Do not ship a sixth type in Foundation.

---

## 12. Parameter schema

All numbers: finite JSON numbers. No strings-as-numbers on write.

### `eq`

Three bands. Defaults = flat.

| Param | Unit | Min | Max | Default |
|-------|------|-----|-----|---------|
| `low.frequencyHz` | Hz | 20 | 500 | 120 |
| `low.gainDb` | dB | -12 | 12 | 0 |
| `low.q` | — | 0.1 | 12 | 0.7 |
| `mid.frequencyHz` | Hz | 200 | 5000 | 1000 |
| `mid.gainDb` | dB | -12 | 12 | 0 |
| `mid.q` | — | 0.1 | 18 | 1 |
| `high.frequencyHz` | Hz | 2000 | 20000 | 8000 |
| `high.gainDb` | dB | -12 | 12 | 0 |
| `high.q` | — | 0.1 | 12 | 0.7 |

Ranges aligned in spirit with E3 basic EQ (±12 dB) plus explicit frequencies (Studio needs a real insert, not only 3 gains).

### `compressor`

| Param | Unit | Min | Max | Default |
|-------|------|-----|-----|---------|
| `thresholdDb` | dB | -60 | 0 | -24 |
| `ratio` | :1 | 1 | 20 | 3 |
| `attackMs` | ms | 0 | 200 | 10 |
| `releaseMs` | ms | 10 | 2000 | 100 |
| `makeupDb` | dB | -12 | 12 | 0 |

### `limiter`

| Param | Unit | Min | Max | Default |
|-------|------|-----|-----|---------|
| `thresholdDb` | dB | -24 | 0 | -1 |
| `ceilingDb` | dB | -6 | 0 | -0.1 |

`ceilingDb` MUST be ≥ `thresholdDb` is **not** required (ceiling is output cap). If `ceilingDb` > 0 rejected. This is **peak clip protection**, not true-peak / LUFS (OUT).

### `reverb`

| Param | Unit | Min | Max | Default |
|-------|------|-----|-----|---------|
| `mix` | 0–1 wet | 0 | 1 | 0 |
| `decaySeconds` | s | 0.1 | 6 | 1.2 |

### `delay`

| Param | Unit | Min | Max | Default |
|-------|------|-----|-----|---------|
| `mix` | 0–1 wet | 0 | 1 | 0 |
| `timeMs` | ms | 1 | 2000 | 250 |
| `feedback` | 0–1 | 0 | 0.95 | 0.25 |

**No BPM sync.** `timeMs` is absolute.

**Missing param on write:** fill default then persist canonical object (so reload matches engine).  
**Out-of-range on write:** 400, no clamp.  
**Out-of-range on read (corrupt):** bypass that effect + `AUDIO_FX_INVALID_PARAMS`.

---

## 13. Versioning

| Layer | Meaning |
|-------|---------|
| `studio_projects.document_version` | Project document CAS / bump (existing integer ≥ 1) |
| `effects_chain.schemaVersion` / `master_fx_chain.schemaVersion` | Shape of **that JSON document** |
| `studio_projects.schema_version` | P5.1 project schema — **do not** overload for FX |

**`schemaVersion` 1:** this freeze.

**Write `schemaVersion` ≠ 1:** 400 until a future freeze defines v2 + migrator.

**Read `schemaVersion` missing / not 1:** treat chain as **unusable** → empty audible chain (dry Track/Master Node) + `AUDIO_FX_CHAIN_UNSUPPORTED`. **Do not** crash. **Do not** migrate in place in P6 Foundation.

**Future v2:** additive migrator in a later freeze; v1 readers skip via unsupported path until deployed.

**No** project revision history table.

---

## 14. Bypass

| State | Persist | Audible |
|-------|---------|---------|
| `enabled: true` + valid | kept | in graph, in array order |
| `enabled: false` | **kept (MUST NOT delete)** | wire-through |
| chain `effects: []` | empty | Clip Gain → Track Node / tracks → Master Node |
| invalid / unknown (read path) | kept (do not auto-rewrite on GET) | wire-through that slot |
| AudioNode construct fail | persist unchanged | wire-through that slot + `AUDIO_FX_NODE_FAILED` |

Bypass is **not** a runtime-only React flag. UI toggle = persist `enabled` + bump version.

---

## 15. Ordering

- SSOT = array order in JSONB.
- Reorder = persist new array (same ids) + CAS + bump.
- UI list order MUST bind to `effects[]`, never to a second sort key.
- Engine rebuilds in array order after each `setDocument`.

---

## 16. Lifecycle

**Owner:** `StudioAudioEngine` (same instance as P5.10).

```text
initialize AudioContext
  → ensureTrackGraph / master
  → buildFxChain(track|master) between frozen insertion points
setDocument / chain mutation
  → rebuild only chains whose serialized canonical JSON changed
  → reconnect Clip Gain → FX → Track Node (or skip)
dispose / project switch / editor unmount
  → disconnect+dispose FX nodes with Track/Master graphs
seek / pause / stop
  → do NOT rebuild chains (FX are document, not transport)
play
  → resume context; chains already connected
```

**Parameter change:** persist first (or optimistic UI + persist); engine updates `AudioParam.value` when document arrives. **No** React-driven `element.volume` for FX.

**Remove effect:** drop from array, persist, dispose that node, rewire neighbors.

**Avoid leaks:** every `create*` in a chain must be tracked on the TrackGraph / Master graph object and disconnected on rebuild/dispose (same pattern as P5.10 track teardown).

**Do not** create a second `AudioContext` for FX.

---

## 17. Persistence

**Mutations (frozen API shape — implement in P6.1):**

```text
PATCH /api/studio/projects/:projectId/tracks/:trackId/effects
  body: { expectedDocumentVersion: number, chain: StudioFxChainV1 }

PATCH /api/studio/projects/:projectId/master-fx
  body: { expectedDocumentVersion: number, chain: StudioFxChainV1 }
```

Do **not** overload existing track PATCH for chains (keeps P5.8/P5.1 clients small and makes CAS explicit).

| Who | What |
|-----|------|
| Route | nodejs, same `studioApiErrorResponse` |
| Service | `assertOwnsProject` + admin client (existing privilege-escalation triggers) |
| Validate | isomorphic `parseStudioFxChain(chain, { role: "track" \| "master" })` |
| Write | jsonb column + `document_version = expected + 1` **WHERE document_version = expected** |
| CAS miss | **409** · Polish: konflikt wersji dokumentu — odśwież projekt |
| Success | `{ success: true, documentVersion, effectsChain \| masterFxChain }` |

**Runtime-only (never persist):** AudioNodes, AudioContext state, playhead, `failedClips`, diagnostics.

**GET project document:** include normalized chains on tracks + project.

**No Storage. No signed URLs in chain JSON.**

---

## 18. `document_version`

| Mutation | Bump? |
|----------|--------|
| PLAY/PAUSE/SEEK/STOP / AudioContext | NO |
| Track gain/mute/solo/pan/name/arm (existing) | YES (already) |
| **Track `effects_chain` write** | **YES + CAS** |
| **Project `master_fx_chain` write** | **YES + CAS** |
| Clip move/trim/split | NO in P6 (H2 remains later) |

P6 **does not** retrofit CAS onto existing track-control PATCH (SHOULD later / H2). It **does** require CAS on **new** FX endpoints so two mix edits cannot silently clobber.

Engine never bumps version.

---

## 19. Validation

**Write path (authoritative):**

1. AuthZ ownership.
2. JSON object, `schemaVersion === 1`.
3. `effects.length` ≤ 8.
4. Each effect: UUID, known type, boolean `enabled`, params per §12.
5. Master: enabled limiter last.
6. Unique ids.
7. Reject unknown keys / NaN / Infinity.

**Read path:** normalize null → empty v1; if unusable, dry chain + error code; **do not** 500 the GET.

User-facing write errors (Polish, stable):

| Code | Copy |
|------|------|
| `FX_CHAIN_INVALID` | Nie udało się zapisać efektów. Sprawdź parametry i spróbuj ponownie. |
| `FX_CHAIN_VERSION_CONFLICT` | Projekt został zmieniony. Odśwież Studio i spróbuj ponownie. |
| `FX_CHAIN_UNSUPPORTED` | Ten łańcuch efektów nie jest obsługiwany. |

Engine codes (extend P5.10 set; diagnostic ≠ device codes):

```text
AUDIO_FX_UNKNOWN_TYPE
AUDIO_FX_INVALID_PARAMS
AUDIO_FX_CHAIN_UNSUPPORTED
AUDIO_FX_NODE_FAILED
```

---

## 20. Fail-closed

| Fault | Engine | Persist |
|-------|--------|---------|
| Unknown type (read) | Skip slot, continue chain | unchanged |
| Params out of range (read) | Skip slot | unchanged |
| Corrupt JSON | Dry that chain | unchanged |
| `schemaVersion` ≠ 1 | Dry that chain | unchanged |
| Node construct throws | Skip slot + `AUDIO_FX_NODE_FAILED` | unchanged |
| `AudioContext` unavailable | Existing P5.10 `AUDIO_CONTEXT_UNAVAILABLE`; no FX | N/A |
| One Track chain fails | Other tracks + Master continue | N/A |
| Master chain fails | Tracks still mix through Master Node dry of FX | N/A |

**Never:** throw through React render; never play at unexpected gain; never use client `ownerId` / `objectKey`.

Source failures remain P5.10 (`failedClips`). FX failure MUST NOT mark the Clip failed.

---

## 21. Track vs Master capability matrix

| FX | Track | Master | Note |
|----|-------|--------|------|
| EQ | YES | YES | Pre-fader track; pre-fader master |
| Compressor | YES | YES | |
| Limiter | YES | YES | Master: last enabled if present |
| Reverb | YES | YES | Insert wet/dry; **no send** |
| Delay | YES | YES | Absolute ms; **no BPM sync** |

Gate, de-esser, chorus, multiband, autotune: **OUT** of Foundation.

---

## 22. Recording boundary

```text
Recording pipeline ≠ StudioAudioEngine ≠ P6 FX
```

P6 MUST NOT: `getUserMedia`, TakeMediaRecorder, eligibility, finalize, upload, claim, P5.8 devices, `useMicAnalyser` destination routing.

Input / monitoring FX = **future freeze**.

---

## 23. PlayerProvider boundary

```text
PlayerProvider ≠ StudioAudioEngine
```

Studio keeps suppression. Engine and FX modules MUST NOT import PlayerProvider. Catalog playback stays HTMLAudio.

---

## 24. E3 Mix boundary

E3 Mix remains catalog beat MixPanel Web Audio.

P6 is **not** a MixPanel port. **No** shared engine. Optional later COULD: extract **stateless** clamp helpers — not in Foundation MUST.

Isolation tests (P6.5): studio engine / fx / editor MUST NOT match `MixPanel` / `mix-graph`.

**Take preview (frozen):** **OUT of P6 Foundation as a wet path.** Preview stays pause-timeline → preview voice → **Master Node only** (gain/pan). **Skip Track FX and Master FX.** Unplaced/library Takes have no Track chain to inherit. Optional wet preview = later SHOULD.

---

## 25. Mobile

- One engine; no mobile fork.
- Chain UI: vertical list, large bypass target, reorder via explicit up/down (not hover-drag as the only path).
- Param editing: one effect expanded at a time on ~390×844.
- Cap 8 effects is a mobile CPU guardrail.
- PLAY remains the user-gesture `AudioContext.resume` (P5.10).

No separate mobile DSP quality.

---

## 26. Performance

| Guardrail | Value | Why |
|-----------|--------|-----|
| Max effects / track | 8 | Server + CPU |
| Max effects / master | 8 | same |
| Rebuild | only when canonical chain JSON changes | avoid seek thrash |
| Voices | P5.10 MediaElement per overlapping clip | unchanged |
| Convolver | if used, one buffer per decay bucket, not per voice | memory |

**SHOULD:** dispose unused FX nodes on bypass (optional). **COULD:** benchmark 8 FX × N overlapping Takes on mid Android.

No extra hard cap on clip count in P6 (P5.10 problem).

---

## 27. Security

- Mutations: authenticated owner via `assertOwnsProject` + service_role writes (existing triggers).
- No client `ownerId` / `objectKey` in chain JSON.
- Server validates types/ranges (never trust client).
- GET remains owner read (existing RLS select-own).
- FX cannot mint Storage URLs.
- Live IDOR was **not** rerun in P5.10 — P6 Production Gate **SHOULD** include owner vs other-user **FX PATCH 404/401**, not a full IDOR campaign unless Owner expands scope.

---

## 28. Testing strategy

*(tests are implemented in P6.1–P6.5, not in this freeze)*

### Unit

- parse/normalize empty, null, v1
- defaults fill
- ranges reject
- order = array
- bypass `enabled: false` identity
- unknown type write reject / read skip
- schemaVersion ≠ 1
- Master limiter-not-last reject
- unique id / max 8
- isolation greps: no MixPanel, no PlayerProvider, no `getUserMedia`

### Graph (engine tests, fake AudioContext like P5.10)

- insert Track FX between clipGain and track input
- insert Master FX between track pan sum and master gain
- rebuild on reorder/remove
- bypass wire-through
- dispose / project switch no leftover connects
- seek/stop does not drop persist
- invalid slot does not kill other voices (P5.10 fail-closed still holds)

### Persistence

- roundtrip JSONB
- `document_version` +1
- CAS 409
- 400 invalid
- non-owner denied
- GET includes chains

### Production Gate (P6.5)

- SHA = GitHub commit = served bundle
- **Skipping build cache** / HTML no-store (P5.8 lesson)
- Served JS contains Studio FX markers (freeze implementation will name them) and **not** MixPanel on Studio path
- Real Beat+Take still play
- Add EQ on vocal track, persist, reload, still engaged
- Bypass, reorder, Master limiter last
- Mobile 390×844 add/bypass
- Owner-only PATCH

P5.10 TAKE fixture limitation remains **KNOWN LIMITATION — NOT a P6 blocker**. Do not require live A+B healthy-take overlap as P6 exit unless Owner adds it.

---

## 29. MUST

1. Single `StudioAudioEngine`; frozen insert points.
2. Existing jsonb columns only.
3. `schemaVersion: 1` envelope; array order SSOT.
4. Server validation + isomorphic parse.
5. FX writes bump `document_version` with CAS.
6. Bypass persists `enabled: false`.
7. Fail-closed slots; no crash; other voices continue.
8. Isolation: PlayerProvider, E3 Mix, recording.
9. Master enabled limiter last.
10. Preview remains dry of chains.
11. Isolation tests + served-JS cache gate.

---

## 30. SHOULD

1. Persist canonical empty object instead of SQL NULL after first write.
2. Owner FX PATCH AuthZ check in Production Gate.
3. Investigate P5.10 TAKE preview fixture (ops) — not P6 code.
4. Clip fades still unused — do not invent a second fade model in FX.
5. CAS on other Studio mutations (H2) — later.
6. Later wet preview option.

---

## 31. COULD

1. Shared stateless clamp helper with E3 (not graph).
2. Peak `AnalyserNode` on Master.
3. Bypass disposes nodes.
4. Mobile CPU benchmark doc.
5. 5-band EQ in a later schemaVersion.

---

## 32. OUT

- Autotune / pitch correction  
- Time-stretch / reverse / loop engine  
- Automation lanes / AudioParam curves vs timeline / BPM-sync DSP  
- Bus / sends / sidechain / `output_route` expansion  
- LUFS / true peak / spectrum / mastering metering product  
- Input / recording monitoring FX  
- Output device / `setSinkId`  
- ARTIFACT playback  
- P7 instruments / samples / scratch / guitar / piano / bass / synth  
- Punch / metronome / BPM UX  
- Autosave / project version history / global undo-redo  
- Merge E3 Mix / PlayerProvider rewrite  
- Gate / de-esser / chorus / multiband (E3 Pro)  
- New DB tables / RPC / Storage  
- Fixing P5.10 fixture or engine refactors unrelated to inserts  
- This freeze’s production code  

---

## 33. Risks

| Level | Risk | Mitigation |
|-------|------|------------|
| HIGH | Importing mix-graph into Studio | Isolation tests; OUT merge |
| HIGH | FX on HTMLAudio `.volume` | Graph-only MUST |
| HIGH | Recording stream into Track FX | OUT input FX |
| MEDIUM | Lost update without CAS | CAS on FX endpoints |
| MEDIUM | Convolver memory on mobile | decay cap 6s; shared IR |
| MEDIUM | Dual order fields | array-only SSOT |
| MEDIUM | Preview users expect wet | documented OUT; later SHOULD |
| LOW | DTO omit until P6.1 | expected |
| LOW | jsonb null vs `{}` | normalize on read |

---

## 34. Dependencies

- P5.10 engine GREEN (satisfied).
- Existing jsonb columns (satisfied).
- Existing `document_version` column (satisfied).
- Owner GO to **implement** after this freeze.
- **Not** dependent on H1 capabilities, H2 autosave, ARTIFACT, buses.

---

## 35. Implementation sequence

Preferred (matches audit; contracts before nodes; UI last):

| Slice | Scope | Why this order |
|-------|--------|----------------|
| **P6.1** | Parser/registry/defaults + DTO + PATCH effects/master-fx + CAS bump + unit tests | Persist/security before audio |
| **P6.2** | Track insert graph + rebuild/dispose + engine tests | Most user-visible mix |
| **P6.3** | Master insert graph + limiter-last + engine tests | Summing path after tracks work |
| **P6.4** | Chain UI (list, bypass, reorder, params) mobile-first | Needs live graph |
| **P6.5** | Production Gate (served JS, cache, persist reload, AuthZ smoke) | Same as P5.8/P5.10 |

Do not start P6.4 UI before P6.1 validation (client-only chains would fork SSOT).

---

## 36. Production Gate definition

P6 is **GREEN** only if:

```text
IMPLEMENTATION slices P6.1–P6.4 complete per this freeze
typecheck PASS · P6 tests PASS · P6 lint PASS · build PASS
Production SHA = GitHub commit = served bundle
Skipping build cache (or equivalent proof) · HTML no-store/MISS
Studio path: FX graph markers present · MixPanel absent
Track FX persist + reload PASS
Master FX persist + reload PASS
Bypass persist PASS
CAS 409 PASS (staging or production-safe fixture)
Beat+Take timeline still plays (P5.10 regression)
Recording / devices / PlayerProvider / E3 Mix UNCHANGED
DB: no new tables · no RPC · no Storage change
```

Inherited: P5.10 TAKE fixture limitation is **not** a P6 fail.

---

## 37. Exit criteria

```text
DESIGN FREEZE ACCEPTED
  → Owner GO for P6.1
  → implementation follows this document
  → no silent topology change
  → Production Gate GREEN
  → SSOT reconcile (later docs-only unit)
```

**This document is the SSOT for “what P6 is.”** Code after GO must not widen IN/OUT without a new freeze.

---

## OPEN DECISIONS introduced

**NONE.** Topology, jsonb, registry, CAS, preview-dry, limiter-last, caps, sequence, and boundaries are frozen. IR/reverb implementation technique is an implementation detail inside the `reverb` contract, not an OD.

WIP in the working tree is **out of scope** and must remain untouched.
