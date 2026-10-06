# P5.9 Studio Architecture Audit (post–P5.8)

**Status:** COMPLETE — audit artifact only  
**Date:** 2026-10-06  
**Auditor role:** Senior Staff Engineer / Software Architect / Security Architect  
**Scope:** Architecture evaluation after P5.8 Production Verified GREEN. **No implementation. No Design Freeze. No migrations. No production code changes.**

**SSOT inputs read:**
- `docs/ssot/MASTER_SSOT_v0.1.md`
- `docs/PROJECT_STATE.md`
- `docs/MASTER_HANDOFF.md`
- `docs/FINAL_COLD_START_HANDOFF.md`
- `docs/README.md`
- `docs/CHANGELOG.md`
- `docs/architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md`
- `docs/architecture/P5_6_STUDIO_ARCHITECTURE_AUDIT.md`
- `docs/architecture/P5_STUDIO_ARCHITECTURE_AUDIT.md`
- `docs/decisions/P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md`
- `docs/decisions/P5_6_STUDIO_TAKE_WORKFLOW_DESIGN_FREEZE.md`
- `docs/decisions/P5_STUDIO_DESIGN_FREEZE.md`
- Code: `src/config/studio.ts`, `src/lib/studio/*`, `src/components/studio/*`, `src/components/player/*`, `src/lib/mix/mix-graph.ts`, `src/lib/takes/*`, Studio migrations

**Unit numbering (this audit):**

```text
P5.7 = Architecture Audit (GO WITH CONDITIONS) — complete
P5.8 = Studio Devices / Input Foundation — PRODUCTION VERIFIED — GREEN
P5.9 = THIS Architecture Audit (post–P5.8)
```

Do **not** call punch “P5.7” or “P5.9”. Punch remains later ergonomics, not this audit.

---

## 1. Executive Summary

Studio after P5.8 is a **production-ready foundation/editor/recording workflow**, not a DAW. Domain model (Project → Track → Clip → Take), security mutation pattern, `finalize ≠ place`, `StudioTransport ≠ PlayerProvider`, and P5.8 device/input layer are **sound and verified**.

The next architectural step is **not** product FX (EQ/reverb/autotune) and **not** punch/metronome. It is a **dedicated Studio audio engine / multi-source playback foundation** — the unresolved P5.7 H4 condition that still blocks safe P6 mix/FX work.

Bolting FX, routing, buses, or true overlap mixing onto today’s dual-`HTMLAudioElement` StudioTransport would create a second brittle engine and violate living SSOT.

```text
P5.9 ARCHITECTURE: GO WITH CONDITIONS
```

**Recommended next formal stage after Owner acceptance:**  
**Design Freeze** for **Studio Audio Engine / Multi-Source Playback Foundation**  
(engine + scheduling + track audio controls → clock/transport remains separate; **no** product FX chain in that unit).

---

## 2. Canonical Baseline

| Item | Value |
|------|--------|
| Production URL | https://www.bitrymdym.pl |
| Production application SHA | `95e04ff534d58de3476e3a2dc620a13fbcacb7ba` |
| Production deployment | `dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S` |
| Repo HEAD / origin/main (audit start) | `c4c756976a2e1ec34f6268ec17bbda47474f29df` |
| HEAD == origin/main | YES |
| SSOT reconcile | `docs: reconcile SSOT after P5.8 production verification` |
| P5.1–P5.6 | PRODUCTION VERIFIED — GREEN |
| P5.7 | GO WITH CONDITIONS |
| P5.8 | PRODUCTION VERIFIED — GREEN |
| D02 | CLOSED (`44dc22c` TEST ONLY) |
| Deploy for this audit | NOT REQUIRED |
| WIP | Present and **untouched** |

---

## 3. Current Studio Architecture

```text
Catalog playback:
  PlayerProvider → single HTMLAudioElement → sticky mini-player
  (suppressed while Studio transport mounted)

Studio playback (P5.2–P5.8):
  StudioTransportProvider
    → HTMLAudioElement (BEAT_REF clock)
    → HTMLAudioElement (TAKE layer, first-wins under playhead)
  useMicAnalyser → AudioContext (metering only · not destination)

E3 Mix (outside Studio):
  createMixPreviewGraph (Web Audio) on beat MixPanel
  ≠ Studio engine · do not adopt as Studio master by default

Recording (P5.5/P5.6 + P5.8 devices):
  eligibility → session → TakeMediaRecorder (ideal deviceId)
  → finalize → READY → explicit place
  Device prefs = localStorage only

Persistence:
  Project / Track / Clip / Take in Postgres + Storage
  document_version column exists (partial bump — see §7)
```

**Primary anchors:**

| Concern | Path |
|---------|------|
| Transport FSM | `src/lib/studio/studio-transport.ts` |
| Transport engine | `src/components/studio/studio-transport-provider.tsx` |
| Take pick | `src/lib/studio/studio-take-audio.ts` (`pickTakeClipAtPlayhead`) |
| Beat pick | `src/lib/studio/studio-beat-audio.ts` |
| Catalog player | `src/components/player/player-provider.tsx` |
| E3 Mix graph | `src/lib/mix/mix-graph.ts` |
| Config enums | `src/config/studio.ts` |
| Devices | `src/lib/studio/studio-input-devices.ts` · `src/hooks/use-studio-input-devices.ts` |
| Recording panel | `src/components/studio/studio-recording-panel.tsx` |
| Service / AuthZ | `src/lib/studio/studio-service.ts` |

---

## 4. P5.7 Conditions Review

| ID | Condition | Status after P5.8 | Blocker for next freeze? |
|----|-----------|-------------------|--------------------------|
| **H1** | Track Type + Capabilities before creative expansion | **OPEN** — enum reserved; BEAT/VOCAL hardcodes remain (seed, recordable filter, beat fallback) | **No** for audio-engine freeze · **Yes** before P7 track UX expansion |
| **H2** | Freeze `document_version` before autosave | **OPEN** — bump only on track-control updates; clip/timeline ops do not bump | **No** for audio-engine freeze · **Yes** before autosave/versioning |
| **H3** | Unit numbering (P5.7 ≠ punch) | **RECONCILED** in living SSOT | No |
| **H4** | Dedicated StudioAudioEngine before P6 FX | **OPEN** — still dual HTMLAudio; E3 Mix not Studio | **Yes** — primary condition for any mix/FX product unit |
| **M1** | Overlap = first-wins | **Still true** — architectural limit of current engine | Elevates to **engine scope** (not mere UX copy) |
| **M2** | ARTIFACT silent in transport | **Still true** | Non-blocking; natural first consumer of engine |
| **M3** | Parallel beat vs Studio recording panels | Document-only | Non-blocking |
| **M4** | Multi-tab last-write-wins | Unchanged | Non-blocking until collab |

**P5.8 did not close H1/H2/H4.** It correctly closed the device/input foundation and left engine/capability/version contracts for later freezes.

---

## 5. StudioAudioEngine Assessment

### What exists

- **StudioTransport:** playhead FSM + two `HTMLAudioElement`s (beat clock + take layer).
- **PlayerProvider:** catalog-only; Studio suppresses sticky player.
- **E3 Mix:** `createMixPreviewGraph` — Web Audio from two media elements on **beat MixPanel**, not Studio timeline.
- **Mic metering:** `useMicAnalyser` creates `AudioContext` / `AnalyserNode` without monitoring speakers — compatible with P5.8 freeze; **not** a Studio graph.

### Gaps vs P6 ambitions

| Need | Current | Gap |
|------|---------|-----|
| N concurrent audible sources | Max 2 elements; first-wins TAKE | Scheduler + N sources / voices |
| Per-track volume/mute/solo/pan as audio | UI/DB track controls exist; transport does not apply a full mix graph | Engine must consume track controls |
| FX / send / bus / master | None in Studio | Requires graph |
| Deterministic mix of overlaps | first-wins | Requires multi-voice scheduling |
| Reuse E3 Mix graph as Studio | Tempting but wrong ownership | Adapter or new Studio-owned graph |

### Verdict

```text
StudioAudioEngine: REQUIRED before P6 FX/mix/master product work
Current HTMLAudio dual-element path: ADEQUATE for P5 foundation · INADEQUATE for P6
E3 Mix graph: REUSE CANDIDATE for patterns · NOT drop-in Studio SSOT
```

**Do not** implement the engine in this audit.  
**Do not** bolt FX onto `StudioTransportProvider` HTMLAudio elements.

---

## 6. Track Capability Assessment

### Evidence

- Extensible enum in `src/config/studio.ts`: `VOCAL`, `BEAT`, `SAMPLE`, `SCRATCH`, `INSTRUMENT`, `GUITAR`, `FX`, `BUS`, `OTHER`.
- Project seed always creates **BEAT + VOCAL** (`studio-service.ts`).
- Recordable tracks: `trackType !== "BEAT"` (`studio-recording-panel.tsx`).
- Beat playback fallback prefers `trackType === "BEAT"`.
- Labels/default names are type-aware; domain ops claim type-agnostic intent in places.

### Verdict

```text
Capability model: NOT IMPLEMENTED
Hardcoded BEAT/VOCAL: PRESENT (functional for current product)
Risk if ignored before P7: HIGH (type-switch explosion)
```

**Recommendation:** Treat as **SHOULD** before creative track expansion; **not** a MUST blocker for Studio Audio Engine Design Freeze. Engine freeze should prefer **capabilities / roles** (e.g. canRecord, canCarryBeatRef, canAcceptTake) over new `if (type === …)` branches.

---

## 7. document_version Assessment

### Evidence

- Column + DTO: `studio_projects.document_version` → `documentVersion`.
- **Only** `updateStudioTrackControlsFor` increments (`document_version + 1`).
- Clip add/move/trim/split/delete, track reorder, place take: **no bump**.
- P5.8 device preference: localStorage — correctly **outside** document_version.

### Verdict

```text
document_version: EXISTS · NOT a frozen conflict/autosave contract
Lost-update risk under future autosave: HIGH if freeze skipped
Blocker for StudioAudioEngine: NO
Blocker for autosave / multi-tab recovery: YES
```

---

## 8. Multi-source Playback Assessment

### Evidence

- Overlapping TAKE clips allowed in data model / tests.
- `pickTakeClipAtPlayhead` uses `Array.find` on timeline-sorted clips → **first-wins**.
- Beat side similarly picks one BEAT_REF under playhead.
- Track mute/solo helpers exist for UI audibility semantics; transport does not mix overlaps.

### Verdict

```text
first-wins: KNOWN P5 LIMIT · now an ENGINE DESIGN INPUT
UX-only label: INSUFFICIENT if next unit claims “mix”
Architectural blocker for true multi-track mix: YES (needs engine)
Architectural blocker for Design Freeze of engine foundation: NO — freeze must specify scheduler
```

---

## 9. ARTIFACT Assessment

### Evidence

- `ARTIFACT` is a valid `source_kind` with XOR FK to `audio_artifacts`.
- Clips can be stored via API validation.
- StudioTransport has **no** ARTIFACT playback path (label-only in editor).
- Artifact bytes live in E3 `audio-artifacts` bucket / render pipeline.

### Verdict

```text
ARTIFACT: PERSIST / VALIDATE — YES
ARTIFACT: STUDIO PLAYBACK — NO
Deferral: ACCEPTABLE until engine exists
Natural early consumer of StudioAudioEngine: YES
Blocker for engine Design Freeze: NO
```

---

## 10. Recording Architecture Assessment

### Confirmed SSOT (no second system)

```text
eligibility → session → TakeMediaRecorder → finalize → READY → explicit place
```

- `finalize ≠ place` frozen (P5.6) and still encoded in panel comments + place route.
- Take remains immutable source after READY.
- P5.8 device layer: separate from `reduceRecordingUi`; does not own capture lifecycle; prefs not in DB/Profile/Project/`document_version`.
- `TakeMediaRecorder` uses `deviceId: { ideal }` (P5.8).

### Regression / blocker check

| Check | Result |
|-------|--------|
| Second recording engine | **NOT FOUND** |
| Device prefs in document_version | **NOT FOUND** |
| finalize auto-place | **NOT FOUND** |
| Security ownership of place | place uses READY take ownership + project ownership (server) |

```text
Recording architecture: HEALTHY
P5.8 device layer: COMPATIBLE
BLOCKER for next stage: NONE from recording
```

---

## 11. P3 / P4 / P5 Regression Boundaries

Future Studio units **must not** break:

| Boundary | Rule |
|----------|------|
| P3 | Anonymous ownership XOR · claim RPC · cookie-bound READY |
| P4 | Eligibility · download ladder · RAW · TTL/cap via Premium Sample Policy |
| P5 recording | Session/finalize/place AuthZ · Take storage identity server-owned |
| Storage | No client `ownerId` / `objectKey` as authority |
| Player | `StudioTransport != PlayerProvider` |
| Takes | Immutable READY source · place creates Clip, not new media identity |

Next engine work must **consume** Take preview URLs / beat access gates — not invent parallel signed-URL authority.

---

## 12. Mobile Readiness

P5.8 production gate verified Studio shell at **390×844** with recording + mic UI and no horizontal overflow.

Next engine unit **must** keep:

- touch transport / record controls,
- input meter,
- timeline usability,
- no desktop-only Web Audio assumptions without mobile fallback policy in freeze.

```text
Mobile: CONSTRAINT for next freeze · not a later add-on
Current foundation: ADEQUATE to proceed to engine Design Freeze
```

---

## 13. P6 Readiness Matrix

| Area | Status | Rationale |
|------|--------|-----------|
| EQ / compressor / limiter / reverb / delay / de-esser | **READY WITH REFACTOR** | Needs StudioAudioEngine graph; no bolt-on to HTMLAudio |
| Autotune / pitch correction | **NOT READY** | Needs engine + DSP policy + likely offline/worker path; product freeze later |
| Volume / pan / mute / solo (true audio) | **READY WITH REFACTOR** | DB/UI track controls exist; transport must apply via engine |
| Routing / buses / send-return | **NOT READY** | No bus graph in Studio |
| Master bus / master chain | **READY WITH REFACTOR** | Requires engine; do not steal E3 Mix ownership blindly |
| Metering (peak / true peak / LUFS / spectrum) | **NOT READY** | No Studio master meter chain; E3/product metering elsewhere |
| Clipping detection (Studio master) | **NOT READY** | Depends on master meter |
| Automation (volume/pan/FX) | **NOT READY** | No automation model / lanes / persistence |
| Punch / pre-roll / count-in / metronome | **OUT OF SCOPE** for engine-first unit (later ergonomics) |

```text
P6 product FX/mix/master: NOT READY TO IMPLEMENT NOW
P6 precondition (engine foundation Design Freeze): READY TO FREEZE
```

---

## 14. P7 Readiness Matrix

| Area | Status | Rationale |
|------|--------|-----------|
| Track enum reserved (SAMPLE/SCRATCH/GUITAR/…) | **READY WITH REFACTOR** | Enum exists; capabilities missing |
| SAMPLE / SCRATCH as Clip sources | **READY WITH REFACTOR** | Likely additive `source_kind` + engine voice; freeze later |
| Instrument engines (piano/bass/synth) | **NOT READY** | No instrument runtime |
| Pitch / time-stretch / reverse / loop | **READY WITH REFACTOR** | Needs engine + offline/online policy; not HTMLAudio hacks |
| Drag & drop media | **NOT READY** | No DnD media pipeline in Studio |
| Capability flags | **NOT READY** | Required before creative track UX expansion |

```text
P7 creative expansion: NOT READY
P7 depends on: capabilities freeze + engine voices + additive source kinds
```

---

## 15. Security Assessment

### Current pattern (retain)

- `assertOwnsProject` on Studio mutations.
- Service-role writes + owner RLS reads (P5.1 pattern).
- Place rejects client-controlled storage identity; Take ownership server-checked.
- Device preference local-only — **no** cross-user leak via DB.

### Next-stage security requirements (engine freeze must state)

| Topic | Requirement |
|-------|-------------|
| Preview URLs | Continue Take preview / beat access gates; no new client objectKey authority |
| Multi-source fetch | Per-source AuthZ; fail closed per voice |
| ARTIFACT play | Artifact ownership / project link rules before audible |
| Offline DSP / worker | If introduced later: separate AuthZ + no widening take-audio ACL |
| Cross-user | Preserve 404-class denial; unauth 401 on protected Studio APIs |

```text
Security baseline: SOUND for current Studio
Engine unit: must preserve boundaries · no new client ownership fields
```

---

## 16. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Jumping to FX UI without engine | **CRITICAL** | Gate: engine Design Freeze first |
| Reusing E3 Mix graph as silent Studio SSOT | **HIGH** | Explicit adapter or Studio-owned graph in freeze |
| Calling next unit “P6” and shipping product FX only | **HIGH** | Name foundation unit clearly |
| Autosave without document_version contract | **HIGH** | H2 before autosave |
| Capability skip before GUITAR/SAMPLE UX | **HIGH** | H1 before P7 expansion |
| Second mic/analyser/recording engine | **HIGH** | Keep TakeMediaRecorder + useMicAnalyser SSOT |
| Treating first-wins as acceptable for “mix” marketing | **MEDIUM** | Engine scheduler in freeze |

---

## 17. Blockers

### Blockers for **product P6 FX/mix/master implementation**

1. No StudioAudioEngine / audio graph boundary.  
2. first-wins overlap cannot express real multi-track mix.  
3. Track audio controls not applied as a mix graph.

### Blockers for **Design Freeze of Studio Audio Engine foundation**

**NONE** that require code/DB changes first.

Conditions are **freeze content** requirements (MUST list below), not pre-freeze refactors.

### Non-blockers (defer)

- ARTIFACT silence  
- document_version incomplete bump (until autosave)  
- Capability hardcodes (until creative track expansion)  
- Punch / metronome / BPM UX  

---

## 18. Required Refactors

**Before / during next implementation unit (after its Design Freeze GO):**

| Refactor | Timing |
|----------|--------|
| Introduce StudioAudioEngine boundary (clock vs graph) | **In** next impl unit |
| Multi-voice / overlap scheduler replacing first-wins take element | **In** next impl unit |
| Apply track volume/mute/solo/pan through engine | **In** next impl unit |
| Keep PlayerProvider suppressed / isolated | Preserve |
| Keep recording pipeline + P5.8 devices untouched functionally | Preserve |
| Capability model | **Later** freeze before P7 |
| document_version full mutation contract | **Later** freeze before autosave |

**No broad refactor required before Design Freeze authoring.**

---

## 19. Recommended Next Unit

### Decision

After Owner acceptance of this audit:

```text
NEXT FORMAL STAGE =
  Design Freeze:
  “Studio Audio Engine / Multi-Source Playback Foundation”
```

### What that unit is

- Dedicated **StudioAudioEngine / audio graph** owned by Studio (not PlayerProvider, not silent E3 Mix takeover).
- **Multi-source scheduling** (beat + N takes/artifacts as voices; define overlap policy beyond first-wins).
- Wire existing **track volume / mute / solo / pan** into audible reality.
- Preserve **StudioTransport** as timeline clock / transport UX (or explicitly redefine clock ownership in freeze).
- Preserve recording + P5.8 devices + `finalize ≠ place`.
- Mobile 390×844 constraints in freeze.

### What that unit is **not**

- Product FX rack (EQ/comp/reverb/delay/autotune).  
- Automation lanes.  
- Punch / metronome / count-in.  
- Autosave / versioning UI.  
- P7 samples / instruments / stretch.  
- Capability-system full rollout (may define hooks only).

### Numbering note

This audit is **P5.9**. The **implementation** unit number after Design Freeze should be assigned **in that freeze** (may be labeled P5.10 or P6.0-foundation — Owner/Architect choice). Do **not** start coding under a vague “P6” meaning product FX.

---

## 20. Explicit OUT OF SCOPE

```text
OUT for this audit and for the immediate next Design Freeze content:
  Punch-in/out · Pre-roll · Count-in · Metronome · BPM UX · Quantization
  Product FX chains · Autotune · Automation
  Autosave · Project versioning UI · Undo/Redo
  SAMPLE/SCRATCH/INSTRUMENT engines · time-stretch · reverse · loop engine
  DB device preferences · Profile/Project device SSOT
  Collaborative locking · Multi-user editing
  Code / DB / RPC / API / Storage / test changes (this audit)
  Deploy
```

---

## 21. Final Decision

```text
P5.9 ARCHITECTURE: GO WITH CONDITIONS
```

### MUST (before approving any P6 **product FX/mix/master** Design Freeze)

1. Complete **Design Freeze + Implementation + Production Verify** of **Studio Audio Engine / Multi-Source Playback Foundation**.  
2. Keep `StudioTransport != PlayerProvider`.  
3. Keep `finalize ≠ place` and Take immutability.  
4. Do **not** bolt FX/routing/master onto dual HTMLAudio StudioTransport.  
5. Engine freeze must define overlap/multi-voice policy (first-wins cannot remain the silent mix model).

### SHOULD

1. Prefer capability-oriented APIs in engine freeze (avoid new BEAT/VOCAL hardcodes).  
2. Plan ARTIFACT playback as an early engine consumer.  
3. Document E3 Mix vs Studio graph ownership explicitly (adapter vs separate).  
4. Keep mic metering on `useMicAnalyser` (no second analyser empire).

### COULD

1. Minimal master meter stub after engine voices exist.  
2. Soft-deprecate first-wins with feature flag during migration.  
3. Align docs SSOT after engine freeze GO (living state update).

### OUT

Product FX · automation · punch · autosave · P7 creative engines · DB device prefs · collab locking · this-audit code changes.

### Blockers for **next Design Freeze** (engine foundation)

```text
NONE (proceed to Design Freeze authoring when Owner GO)
```

### Blockers for **jumping to product P6 FX**

```text
StudioAudioEngine missing
Multi-source mix undefined (first-wins)
Track controls not in audio graph
```

### Rationale

1. P5.1–P5.8 production baseline is coherent and GREEN.  
2. Remaining gap is the **audio runtime**, not more recording UX.  
3. P5.7 H4 remains the critical architectural condition; P5.8 correctly did not close it.  
4. H1/H2 remain important but gate **different** future units (P7 tracks / autosave).  
5. No CRITICAL security or recording regression found that blocks audit GO.

**Next step after Owner/Architect acceptance:** author **Design Freeze** for **Studio Audio Engine / Multi-Source Playback Foundation**. **No implementation until that freeze is GO.**

---

*End of P5.9 Studio Architecture Audit. Single allowed artifact path: `docs/architecture/P5_9_STUDIO_ARCHITECTURE_AUDIT.md`.*
