# P5.11 Studio Architecture Audit (post–P5.10 StudioAudioEngine)

**Status:** COMPLETE — audit artifact only  
**Date:** 2026-10-06  
**Auditor role:** Senior Staff Engineer / Software Architect / Security Architect  
**Scope:** Architecture evaluation after P5.10 Production Verified GREEN. **No implementation. No Design Freeze. No migrations. No production code changes.**

**SSOT inputs read:**
- `docs/ssot/MASTER_SSOT_v0.1.md`
- `docs/PROJECT_STATE.md`
- `docs/MASTER_HANDOFF.md`
- `docs/FINAL_COLD_START_HANDOFF.md`
- `docs/README.md`
- `docs/CHANGELOG.md`
- `docs/architecture/README.md`
- `docs/architecture/P5_9_STUDIO_ARCHITECTURE_AUDIT.md`
- `docs/architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md`
- `docs/architecture/P5_6_STUDIO_ARCHITECTURE_AUDIT.md`
- `docs/architecture/P5_STUDIO_ARCHITECTURE_AUDIT.md`
- `docs/decisions/P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md`
- `docs/decisions/P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md`
- `docs/decisions/P5_6_STUDIO_TAKE_WORKFLOW_DESIGN_FREEZE.md`
- `docs/decisions/P5_STUDIO_DESIGN_FREEZE.md`
- `docs/architecture/RECORDING.md` (boundary)
- `src/lib/mix/mix-graph.ts` · `src/components/mix/mix-panel.tsx`
- `src/components/player/player-provider.tsx`
- Code: `src/lib/studio/studio-audio-*.ts`, `studio-transport-provider.tsx`, `studio-editor.tsx`, `studio-service.ts`, `studio-track-ops.ts`, `config/studio.ts`, P5.1 migration, `p5-10-audio-engine.test.ts`

**Unit numbering (this audit):**

```text
P5.7  = Architecture Audit (GO WITH CONDITIONS) — historical, conditions reviewed
P5.8  = Studio Devices / Input Foundation — PRODUCTION VERIFIED — GREEN
P5.9  = Architecture Audit (GO WITH CONDITIONS) — historical, recommended engine freeze
P5.10 = Studio Audio Engine / Multi-Source Playback — PRODUCTION VERIFIED — GREEN
P5.11 = THIS Architecture Audit (post–P5.10)
```

Do **not** call punch, FX, Mix, or Master “P5.11”. This file is audit-only.

---

## 1. Executive Summary

P5.10 closed the P5.7/P5.9 **H4** condition: Studio timeline audio is a **single `StudioAudioEngine`** with `AudioContext`, `planVoicesAtPlayhead` (overlap = MIX), Track/Master Gain+StereoPanner, adapter registry, and fail-closed source errors. Dual-`HTMLAudioElement` mix SSOT and transport first-wins are **gone**. PlayerProvider and E3 Mix remain isolated. Recording is unchanged.

That foundation **is architecturally sufficient to start a Design Freeze for product P6 Mix / Track FX / Master FX** (insert chains on the existing graph). It is **not** sufficient to claim sample-accurate automation, buses/sends, autotune, input-monitoring FX, or P7 instruments without further freezes.

A **second Studio engine foundation is not required**. Remaining gaps are **freeze contracts** (insert topology, persist of existing jsonb stubs, version bump for FX writes, OUT list), not a missing playback engine.

```text
P5.11 ARCHITECTURE: GO WITH CONDITIONS
```

**Recommended next formal stage after Owner acceptance:**  
**Design Freeze** for **P6 Mix / Track FX / Master FX Foundation**  
(insert FX chains on Track Node + Master Node · persist via existing jsonb stubs · bypass · no buses · no automation lanes · no autotune · no recording-input FX · no E3 Mix merge).

---

## 2. Canonical Baseline

| Item | Value |
|------|--------|
| Production URL | https://www.bitrymdym.pl |
| Production application SHA | `9c2a958cf94aca07679ed338cc23e21bb600fd4c` |
| Production deployment | `dpl_L7pB5A8iuY8CKipxbLsGEVLESZTC` |
| P5.10 Design Freeze | `e191f5c6c517a10eda8154ff8dfb8373e14e31d6` |
| P5.10 implementation | `9c2a958cf94aca07679ed338cc23e21bb600fd4c` |
| P5.10 SSOT reconciliation | `2392016bd76425b30dd3e27080e94bc0a36317dd` |
| Repo HEAD / origin/main (audit start) | `2392016bd76425b30dd3e27080e94bc0a36317dd` |
| HEAD == origin/main | YES |
| P5.1–P5.6 | PRODUCTION VERIFIED — GREEN |
| P5.7 | GO WITH CONDITIONS (historical) |
| P5.8 | PRODUCTION VERIFIED — GREEN |
| P5.9 | GO WITH CONDITIONS (historical) |
| P5.10 | PRODUCTION VERIFIED — GREEN |
| D02 | CLOSED (`44dc22c` TEST ONLY) |
| Deploy for this audit | NOT REQUIRED |
| WIP | Present and **untouched** |

---

## 3. P5.7 Conditions Review

| ID | Original condition | Status after P5.10 | Blocker for P6 Mix/FX freeze? |
|----|--------------------|--------------------|-------------------------------|
| **H1** | Track Type + Capabilities before creative expansion | **OPEN** — engine does **not** branch on `trackType`; UI/seed still BEAT/VOCAL hardcodes | **No** for P6 insert FX · **Yes** before P7 track UX expansion |
| **H2** | Freeze `document_version` before autosave | **OPEN** — bump still only on track-control updates | **No** for starting P6 freeze · **Yes** before autosave · P6 freeze **MUST** include bump rules for FX persist writes |
| **H3** | Unit numbering (P5.7 ≠ punch) | **RECONCILED** | No |
| **H4** | Dedicated StudioAudioEngine before P6 FX | **CLOSED** — P5.10 GREEN | **No** — this was the primary P6 gate |
| **M1** | Overlap = first-wins | **CLOSED** in Studio transport — scheduler mix | No |
| **M2** | ARTIFACT silent | **OPEN** — stub adapter | **No** for P6 FX |
| **M3** | Parallel beat vs Studio recording panels | Unchanged | No |
| **M4** | Multi-tab last-write-wins | Unchanged | No until collab |

**H4 is satisfied.** P6 is no longer blocked by “no Studio graph”.

---

## 4. P5.9 Conditions Review

P5.9 recommended **engine / multi-source freeze first**, not product FX.

| P5.9 claim | After P5.10 |
|------------|-------------|
| Dual HTMLAudio mix SSOT | **Removed** from Studio transport path |
| `pickTakeClipAtPlayhead` as transport | **Not** on transport path (helper remains for tests / non-transport) |
| Overlap MIX | **Implemented** in `planVoicesAtPlayhead` |
| Track gain/mute/solo/pan in graph | **Implemented** (`isTrackAudible`, `gainDbToLinearVolume`, `normalizePan`) |
| Engine ≠ PlayerProvider ≠ E3 Mix | **Holds** (isolation greps + no MixPanel imports under `src/lib/studio` / `src/components/studio`) |
| Capability before P7 | **Still valid** |
| document_version before autosave | **Still valid** |
| Product FX NOT READY TO IMPLEMENT NOW (P5.9) | **Superseded:** product FX Design Freeze is now the next unit **with conditions** |

P5.9 MUST-before-P6 (engine exists, overlap mix, track graph, no HTMLAudio FX bolt-on) are **met**. Remaining MUST items belong **inside** the P6 freeze, not a P5.12 engine rewrite.

---

## 5. P5.10 Production State

```text
StudioAudioEngine          = SHIPPED / PRODUCTION VERIFIED — GREEN
Served chunk               = 0p8mql3sjqfx_.js
  YES                      = StudioAudioEngine · AUDIO_SYNC_FAILED
                             · createMediaElementSource · createStereoPanner
  NO                       = pickTakeClipAtPlayhead · takeAudioRef
Cache                      = Skipping build cache · HTML no-store / MISS
SHA alignment              = GitHub commit = deployment = served bundle
Tests                      = 187 unit · P5.10 = 19 · typecheck PASS · P5.10 lint PASS · build PASS
```

### Known production verification limitation (canonical fact)

> P5.10 Production Gate nie uzyskał realnego live A+B overlap na dwóch zdrowych nagraniach Take z powodu konkretnego fixture, który zwrócił `Nie udało się odtworzyć nagrania`. Beat playback działał poprawnie. Multi-source scheduling i overlap mixing zostały pokryte przez testy. P5.10 został formalnie uznany PRODUCTION VERIFIED — GREEN.

**Audit classification of that fact:**

```text
KNOWN LIMITATION — NOT BLOCKER
```

**Why not architecture blocker:** engine fail-closes a failed TAKE voice (`failedClips` + skip) and continues other voices — matching “Beat continued”. Copy `Nie udało się odtworzyć nagrania` maps to TAKE `AUDIO_SOURCE_UNAVAILABLE` / `AUDIO_PLAYBACK_FAILED` (preview URL, media `play()`, or asset), not to first-wins or a second engine. Live A+B of two healthy Takes was **not executed** on that fixture; unit/integration cover mix.

**Residual risk (SHOULD, not MUST for freeze start):** production TAKE preview/asset path for that fixture class should be investigated before using live overlap as a P6 acceptance gate. Do not treat it as proof of a mix-graph defect.

**Live IDOR was not rerun in the P5.10 gate** — inherited security boundary, not a re-executed test.

---

## 6. StudioAudioEngine Assessment

**Evidence (runtime):** `src/lib/studio/studio-audio-engine.ts` · host in `StudioTransportProvider` (`useRef` + mount/dispose, `key={project.id}`).

| Concern | Finding |
|---------|---------|
| One engine per editor | **YES** — created on provider mount; `dispose()` on unmount; `setDocument` for updates |
| AudioContext lifecycle | create on `initialize`; `resume()` on PLAY if suspended; `close()` on dispose |
| Source lifecycle | adapter `resolve` → `MediaElementAudioSourceNode`; fail-closed |
| Voice lifecycle | Map keyed by clip id; pause when off-playhead; dispose on clip removal / preview / engine dispose |
| Track nodes | `input → gain → pan → masterGain` per track id |
| Master node | `masterGain → masterPan → destination` |
| Scheduling | rAF tick + `planVoicesAtPlayhead` |
| Shared clock | epoch `{epochContextTime, epochPlayheadMs}` |
| Seek | new epoch + resync `element.currentTime` |
| Pause | stop clock, pause timeline voices, keep playhead |
| Stop | pause voices, epoch null, playhead **0** |
| Dispose | voices, track graphs, master, context close |

**Hidden second Studio engine:** **NOT FOUND** on Studio timeline. Remaining separate contexts: PlayerProvider HTMLAudio; E3 Mix graph on MixPanel; `useMicAnalyser` metering AudioContext (P5.8 allowed).

**HTMLAudio as mix SSOT:** **NO**. Elements exist as **media sources** (`volume = 1`); mix is Gain/Panner. Tests assert mix is not `HTMLAudioElement.volume`.

**First-wins fallback in transport:** **NO**.

**`if sourceType` in core schedule:** **NO**. Scheduler is kind-agnostic; `sourceKind` is adapter lookup + error copy only.

**Gaps (not missing engine):**
- Clip `fadeInMs` / `fadeOutMs` persisted, **not** applied on clip GainNode.
- Preview voice connects `clipGain → masterGain`, **bypassing Track graph**.
- Voices that leave the playhead are **paused**, not always disposed (memory/CPU SHOULD).
- `AUDIO_DECODE_FAILED` is defined; MediaElement path typically surfaces as playback/source failure.

```text
StudioAudioEngine: READY (playback / mix foundation)
Hidden dual Studio engine: NOT FOUND
Ready for P6 insert FX Design Freeze: YES WITH CONDITIONS
```

---

## 7. Multi-Source Assessment

Production scheduler `planVoicesAtPlayhead` includes every unmuted, in-range, audible Clip.

Confirmed in architecture + tests:
- Beat + Take
- Take + Take (same track overlap)
- Beat + many Takes
- Multiple tracks via per-track graphs summing at Master

Each planned clip is an independent Voice (own element + clipGain) into a Track graph.

**Determinism:** geometry + playhead + mute/solo → plan set. Offsets are per-clip (`sourceOffsetSeconds`). Seek realigns all voices to the same playhead.

**Failure isolation:** resolve/play failure → that clip in `failedClips`; others continue. Preview URL fail does not stop Beat (matches production).

**Sync:** diagnostic `AUDIO_SYNC_FAILED` if media `currentTime` skew > 40 ms vs plan; transport **does not** treat sync as fatal UI error.

```text
Multi-source: READY
```

---

## 8. Overlap Assessment

```text
Overlap = MIX  (P5.10 freeze · implemented)
```

Independent Voices summed in Web Audio. Not first-wins. `pickTakeClipAtPlayhead` is **not** the transport path.

Live A+B of two healthy Takes: **not heard in P5.10 production gate** (fixture limitation, §5). Architecture + tests still specify mix.

```text
Overlap: READY
Live A+B fixture: KNOWN LIMITATION — NOT BLOCKER
```

---

## 9. Clock Assessment

| Layer | Mechanism |
|-------|-----------|
| Persist / UI | integer ms (`clampPlayheadMs`) |
| Runtime | `AudioContext.currentTime` + epoch |
| PLAY / SEEK | shared epoch for all voices |
| STOP | playhead 0 (FSM) |
| Timeline end | transport sets playhead to `timelineLengthMs` (end), not STOP-0 |

MediaElement `currentTime` is **not** sample-accurate `AudioBufferSourceNode.start(when)`. Adequate for insert FX and mix. **NOT READY** to claim sample-accurate automation, beat-grid processing, or BPM-synced delays without a later buffer/worklet freeze. BPM/metronome remain OUT.

```text
Clock: READY for P6 insert FX
Clock: NOT READY for sample-accurate automation / BPM-sync DSP
```

---

## 10. Track Graph Assessment

Canonical implemented path:

```text
Voice (MediaElementAudioSourceNode)
  → Clip GainNode (gainDb / mute)
  → Track input GainNode
  → Track GainNode (gainDb · mute/solo via isTrackAudible)
  → Track StereoPannerNode (normalizePan)
  → Master GainNode
  → Master StereoPannerNode
  → destination
```

Helpers reused: `isTrackAudible`, `gainDbToLinearVolume`, `normalizePan`.

**Sufficient base for an FX chain?** **YES** as insertion **around** Track and Master nodes, if the freeze names pre- vs post-fader. Graph does **not** yet allocate empty FX slots; P6 must insert nodes (refactor of `ensureTrackGraph`, not a new engine).

```text
Track graph: READY (mix foundation)
FX slot nodes: NOT ALLOCATED (READY WITH REFACTOR)
```

---

## 11. FX Insertion Assessment

**Stable insertion points (recommended for P6 freeze):**

| Insert | Where | Notes |
|--------|--------|-------|
| Track FX chain | After Track `input`, before or after Track gain (MUST freeze order) | Independent of source adapters |
| Master FX chain | After Master gain (and typically after pan **or** before limiter — MUST freeze) | Same AudioContext |
| Clip FX | Optional later; clipGain already exists | Do not conflate with Track FX |
| Bypass | Gain 0 / disconnect bypass path on a chain input | Must be in freeze |
| Automation later | `AudioParam` on inserted nodes | Do not drive FX from React `.volume` |

**Adapter independence:** FX must hang off Track/Master, **not** inside BEAT_REF/TAKE adapters. Current registry supports that.

**Chainability:** Web Audio `connect()` supports series Biquad/DynamicsCompressor/Delay/Convolver. Parallel send needs extra taps (**bus freeze**).

**Autotune / pitch correction:** **NOT READY** as live insert. Needs analysis buffer / AudioWorklet / offline — P5.9 still holds. **OUT** of first P6 freeze.

If freeze tried to ship autotune or send/return on MediaElement-only graph without topology: **NOT READY**.

```text
Insert FX (EQ / comp / gate / de-esser / reverb / delay as AudioNodes): READY WITH REFACTOR
Autotune / pitch live: NOT READY
```

---

## 12. Routing / Bus Assessment

- All tracks connect to **Master**. `outputRoute` persists (`DEFAULT 'MASTER'`, DB check **only `'MASTER'`**).
- Engine **ignores** `outputRoute` (always Master).
- No bus tracks, no send/return, no parallel FX graph.

| Question | Answer |
|----------|--------|
| Can P6 start without buses? | **YES** — Track → Master insert FX |
| Must bus schema freeze before FX? | **NO** |
| Can routing be added later without engine rewrite? | **YES** — tap Track output; expand `output_route` check; optional BUS track type already in enum |
| Is string `outputRoute` enough now? | **YES** for Master-only; **NOT** enough as a bus router until constraint + engine consume it |
| Freeze routing architecture before P6? | **SHOULD document “Master only”; MUST NOT pretend buses exist** |

```text
Routing: READY (Track → Master only)
Bus / send-return: NOT READY (later freeze) · NOT a P6 start blocker
```

---

## 13. Master Assessment

Master Gain + Pan exist and are a valid **insertion point** for a Master chain (EQ, compressor, limiter).

**Not present:** product limiter, LUFS, true peak, spectrum, Master meter UI. `AnalyserNode` on Master is a cheap COULD; LUFS/true-peak is a later metering freeze.

```text
Master Node: READY as insertion point
Master product (limiter / LUFS / true peak / spectrum): NOT READY (out of first P6 unless explicitly scoped)
```

---

## 14. Automation Assessment

Document (Project/Track/Clip rows) is separate from runtime nodes. Engine writes `AudioParam.value` from document on `setDocument` / sync — **not** HTMLAudio mix.

**Does not** yet:
- schedule `AudioParam` curves vs timeline
- persist automation lanes
- apply clip fades

Automation does **not** require a completed autosave/`document_version` contract **to start thinking**, but **persisted automation** needs a mutation + versioning freeze (H2). **Do not** put automation lanes in the first P6 FX freeze.

React state currently **mirrors** playhead; mix params should keep flowing document → engine, not the reverse.

```text
Automation: NOT READY (later freeze)
Blocker for P6 insert FX: NO
Blocker for autosave: H2 still YES
```

---

## 15. Source Adapter Assessment

Registry: `BEAT_REF`, `TAKE`, `ARTIFACT` stub. Core scheduler does not switch on kind for mix.

New SAMPLE/INSTRUMENT kinds: add adapter + `STUDIO_CLIP_SOURCE_KINDS` (config/DB) **without** rewriting scheduler, **if** they remain URL/media-like. Instruments that generate audio need a different voice type (Buffer/Worklet) — **P7**, not P6 FX.

FX remain off adapters.

```text
Adapter interface: READY for URL sources
Future SAMPLE: READY WITH REFACTOR (kind + adapter + AuthZ)
INSTRUMENT engines: NOT READY
```

---

## 16. ARTIFACT Assessment

Stub returns `AUDIO_SOURCE_UNAVAILABLE`. Transport ignores ARTIFACT errors in UI.

Playback can be added later without engine rewrite. **Does not block P6 FX.** Should stay a future adapter, not a P6 source requirement.

```text
ARTIFACT playback: NOT READY · NOT P6 BLOCKER
```

---

## 17. PlayerProvider Boundary

```text
PlayerProvider ≠ StudioAudioEngine
```

Studio suppresses catalog player while the editor is mounted. Timeline audio does not use PlayerProvider. Served Studio path does not import PlayerProvider as the mix engine.

**P6 MUST NOT** share the Studio graph with PlayerProvider or route Studio FX through catalog HTMLAudio.

```text
PlayerProvider: ISOLATED · READY to keep isolated
```

---

## 18. E3 Mix Boundary

E3 Mix (`mix-graph.ts` / MixPanel) is a **separate** Web Audio surface on the catalog beat page. Studio engine does not import MixPanel. **No Mix migration in P5.10.**

P6 **can** be built without migrating E3 Mix. Shared **low-level** helpers (dB mapping, a Biquad factory) are optional COULD — **a shared Studio+E3 engine would be an error**.

Risk of accidental MixPanel import: currently **low** (tests + no imports). P6 freeze MUST keep the ban.

```text
E3 Mix: ISOLATED · do not merge
Two Web Audio product surfaces: ALLOWED
```

---

## 19. Recording Boundary

```text
Recording Pipeline ≠ StudioAudioEngine
```

Engine may play READY Takes. It does not own session, eligibility, finalize, upload, claim, `getUserMedia`, devices, or input meter (`useMicAnalyser` remains a **separate** short-lived context).

**Input monitoring + input FX** is a **different** architecture than playback Track FX (live MediaStream → graph → destination/headphones, latency, feedback). **P6 playback FX freeze MUST NOT swallow recording monitoring FX.** That needs its own freeze if desired.

Preview Take (post-record) bypasses Track FX today — freeze MUST say whether preview is dry Master or follows Track chain.

```text
Recording: UNCHANGED / ISOLATED
Recording monitoring FX: NOT READY · OUT of first P6 unless separately frozen
```

---

## 20. Device / Output Assessment

P5.8: input device + permission + localStorage. **No** output device / `setSinkId` / AudioContext sink.

Does missing output-device architecture **block P6 insert FX?** **NO.** FX process the graph before destination; default device is enough.

Mobile `setSinkId` support is incomplete — later COULD.

```text
Output device: NOT READY · NOT P6 BLOCKER
```

---

## 21. Performance Assessment

Risks (no code benchmarks in this audit):
- One `HTMLAudioElement` + `MediaElementAudioSourceNode` per overlapping clip
- Paused-but-retained voices
- Signed-URL refresh + `load()`
- Repeated seek/play recreates epoch and may restart media
- Project switch disposes engine (good)
- Duplicate AudioContext: engine + mic analyser + (elsewhere) MixPanel if user has both tabs

**SHOULD** follow-up (not P6 start blocker): voice dispose-when-off-timeline; cap concurrent voices; optional buffer decode for short clips.

```text
Performance: READY WITH REFACTOR (operational SHOULD)
Formal benchmark: COULD follow-up
```

---

## 22. Mobile / Browser Assessment

PLAY resumes suspended `AudioContext` (user gesture). Autoplay policy is respected if PLAY is a click.

Risks: iOS many simultaneous media elements; `createMediaElementSource` once-per-element (engine creates new elements); StereoPanner quirks; background tab suspend; 390×844 layout is P5.8-era, not FX CPU.

P6 **insert** FX can run on mobile **if** freeze keeps light node counts and does not add autotune/convolution halls as default. Heavy Master metering = later.

```text
Mobile: READY WITH REFACTOR (constraints, not a second engine)
```

---

## 23. Security Assessment

Engine has no `ownerId` / `objectKey`. Beat URLs: `requestBeatAudioAccessAction`. Take URLs: `POST /api/takes/preview`. Fail-closed on missing URL.

P6 FX persist is **document JSON**, not a new Storage authority, if freeze uses existing jsonb + `studio-service` ownership (`assertOwnsProject`).

**Live IDOR was not rerun in P5.10.** Inherited P3/P4/P5 boundaries remain SSOT. P6 MUST NOT add client-side Storage keys.

```text
Security: READY (inherited) · Live IDOR re-run: NOT DONE (limitation)
```

---

## 24. DB / API / RPC / Storage Assessment

P5.10 did not change DB/API/RPC/Storage.

Existing unused persist slots:
- `studio_projects.master_fx_chain jsonb`
- `studio_tracks.effects_chain jsonb`

DTOs **omit** those fields. No RPC required for jsonb owned by existing service-role mutations.

**P6 insert FX can be designed:**
- **Without** new Storage
- **Without** new RPC
- **Possibly without** new tables if freeze maps chains onto existing jsonb
- **With** API/DTO + `document_version` bump on FX writes (existing pattern on track controls)
- Bus routing would need **CHECK** expansion on `output_route` (currently `IN ('MASTER')`) — **later**

If freeze wants per-clip FX or automation lanes, that is extra schema — **OUT** of a minimal P6 foundation unless explicitly included.

```text
DB: jsonb stubs EXIST · DTO/API NOT WIRED
Storage / RPC: no P6 requirement for insert FX
```

---

## 25. P6 Readiness Matrix

| Obszar | Status | Blocker for P6 freeze start? | Uzasadnienie |
|--------|--------|------------------------------|--------------|
| StudioAudioEngine | READY | No | One context, lifecycle, dispose |
| Multi-source | READY | No | `planVoicesAtPlayhead` |
| Track graph | READY | No | Gain/pan/mute/solo in graph |
| FX insertion | READY WITH REFACTOR | No | Nodes not pre-allocated; topology MUST freeze |
| Track FX chain | READY WITH REFACTOR | No | Hang off Track Node; persist `effects_chain` |
| Master FX | READY WITH REFACTOR | No | Hang off Master; persist `master_fx_chain` |
| Routing | READY | No | Master-only |
| Bus | NOT READY | No | Later freeze; not required to start P6 |
| Automation | NOT READY | No | Later; H2 if persisted |
| document_version | NOT READY (autosave) | No for freeze start | MUST bump on FX persist; full contract still autosave-gated |
| Metering | NOT READY | No | LUFS/true-peak later; peak analyser COULD |
| Recording monitoring FX | NOT READY | No | Separate freeze; OUT of playback P6 |
| Output device | NOT READY | No | Default sink enough |
| Mobile | READY WITH REFACTOR | No | Gesture + media-element limits |
| Performance | READY WITH REFACTOR | No | Voice count SHOULD |
| Security | READY | No | Inherited; IDOR not rerun |

---

## 26. P7 Readiness

| Capability | Status |
|------------|--------|
| SAMPLE (clip kind + adapter) | READY WITH REFACTOR |
| SCRATCH / GUITAR / PIANO / BASS / SYNTH as **track types** | Enum reserved; **capability model required** before UX |
| INSTRUMENT engines | NOT READY |
| Pitch / time-stretch / reverse / loop as DSP | NOT READY (buffer / offline) |
| Drag & drop library | NOT READY (product + AuthZ) |
| Capability flags | NOT IMPLEMENTED · **SHOULD before P7**, not P6 FX |

---

## 27. Risks

### HIGH

| Risk | Notes |
|------|--------|
| Bolting FX onto remaining MediaElements as `.volume`/element FX | Would undo P5.10 graph SSOT |
| Merging E3 Mix graph into Studio | Dual product engines becoming one accidental god-graph |
| Putting recording input FX in the same P6 unit as playback FX | Different latency/capture lifecycle |
| Claiming autotune as Track insert | Not supported by current voice type |

### MEDIUM

| Risk | Notes |
|------|--------|
| document_version incomplete if FX persist ships | Lost updates; freeze MUST bump |
| Buses implied by UI without CHECK/engine | `output_route` cannot store bus names today |
| ARTIFACT silent | Confusion, not mix breakage |
| Output devices | Not P6 |
| Performance / many media elements | Mobile CPU |
| TAKE fixture limitation misread as mix bug | Investigation SHOULD |
| Preview bypasses Track FX | User hears dry Take preview vs wet timeline |

### LOW

| Risk | Notes |
|------|--------|
| DTO omits jsonb FX stubs | Expected until P6 freeze |
| Clip fades unused | Document in freeze; one fade model later |
| Naming P5.11 vs P6 | This audit ≠ implementation unit |

---

## 28. Blockers

**Blockers to starting P6 Mix/FX/Master Design Freeze:** **NONE** (H4 closed).

**Blockers that the P6 freeze itself must not ignore (conditions, not NO-GO):**
1. Freeze insert topology (pre/post fader, Master order, bypass).
2. Freeze persist mapping (`effects_chain` / `master_fx_chain`) + `document_version` bump on those writes.
3. Explicit OUT: autotune, buses, automation lanes, input FX, PlayerProvider, E3 merge.
4. Preview vs Track chain behavior.

**Blockers to later units (unchanged):**
- H2 before autosave
- H1 before P7 creative track UX
- Buffer/Worklet freeze before sample-accurate automation / pitch / stretch

---

## 29. MUST

Before **implementing** P6 (i.e. inside the forthcoming Design Freeze, not as a new engine unit):

1. Treat P5.10 graph as SSOT; insert AudioNodes on Track/Master; never HTMLAudio mix FX.
2. Specify Track FX vs Master FX order (including pan vs FX vs limiter).
3. Specify bypass.
4. Specify persist: reuse jsonb stubs vs new columns; DTO + AuthZ via existing studio service.
5. Specify `document_version` increment on FX-chain mutations (even if full H2 autosave remains later).
6. Keep adapters FX-free; keep PlayerProvider and E3 Mix isolated.
7. Keep recording capture/metering out of the playback FX unit.
8. Keep overlap = MIX; fail-closed per source.
9. Do not require ARTIFACT playback or capability system for P6 start.

---

## 30. SHOULD

1. Investigate the production TAKE fixture that returned `Nie udało się odtworzyć nagrania` (asset/preview/CORS/media), without reopening P5.10 as failed.
2. Apply clip fades on clip GainNode **or** explicitly defer to automation freeze (single model).
3. Dispose voices that leave the playhead.
4. Route Take **timeline** through Track FX; document preview dry-vs-wet.
5. Expose a simple Master peak `AnalyserNode` only if cheap and frozen.
6. Prefer capability-shaped APIs (`isTrackPlayable` already exists on engine document) — no new `trackType ===` in engine.
7. Optional shared **stateless** DSP helpers with E3 — never a shared engine.

---

## 31. COULD

1. Formal voice-count / mobile CPU benchmark.
2. Decode-to-`AudioBuffer` for short clips.
3. Output `setSinkId`.
4. Peak meters per track.
5. Wire `outputRoute` read-through (still Master-only).

---

## 32. OUT

Do **not** implement in the next unit (unless Owner later changes freeze scope):

- Autotune / live pitch correction
- Time-stretch / reverse / loop DSP
- Automation lanes / clip envelopes as a product system
- Bus / send-return / parallel FX
- LUFS / true peak / spectrum product
- Recording input FX / monitoring-to-speakers rewrite
- Output device picker
- ARTIFACT playback ship
- Capability system / SAMPLE library / instruments
- Punch / metronome / BPM as transport
- Autosave / collab locking
- PlayerProvider rewrite
- E3 Mix migration
- DB/RPC/Storage unrelated to frozen FX jsonb
- Code in **this** audit

---

## 33. Recommended Next Unit

**Not** another Studio playback-engine foundation.

**Yes:** **P6 Design Freeze — Mix / Track FX / Master FX Foundation**

Suggested freeze scope (for the freeze author, not this audit to freeze):

```text
IN:
  Track insert FX chain (series) + bypass
  Master insert FX chain (series) + bypass
  Persist via existing effects_chain / master_fx_chain (or equivalent frozen mapping)
  Engine consumes chains; UI rack only as frozen
  document_version bump on chain writes

OUT:
  Buses, sends, automation, autotune, input FX, metering product, ARTIFACT, P7
```

Name it **P6** (product Mix/FX/Master foundation), not “P5.12 engine”. Exact insert list (EQ vs comp vs reverb in v1) is a freeze product choice, not this audit.

---

## 34. Final Architecture Decision

```text
ARCHITECTURE: GO WITH CONDITIONS
```

**Meaning:** P5.10 StudioAudioEngine / multi-source foundation **is enough** to open a Design Freeze for proper P6 Mix / Track FX / Master FX. Conditions are **MUST contracts in that freeze**, not a demand for a prior implementation stage.

```text
P5.7 H4 (engine before P6): CLOSED
P5.10: PRODUCTION VERIFIED — GREEN
Next: P6 Mix / Track FX / Master FX Design Freeze
Not next: second Studio engine · not auto P7 · not autotune · not buses
```
