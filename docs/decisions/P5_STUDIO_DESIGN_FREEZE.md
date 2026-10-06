# P5 Studio — Design Freeze

**Status:** **P5 DESIGN FREEZE — GO**  
**Date:** 2026-10-06  
**Baseline:** `bface6c36661e9bdc9142add85f58a03ea2e1760`  
**Audit SSOT:** [P5_STUDIO_ARCHITECTURE_AUDIT.md](../architecture/P5_STUDIO_ARCHITECTURE_AUDIT.md)  
**Implementation start unit:** P5.1 (Project / Track / Clip foundation)

---

## Numbering reconciliation (2026-10-06)

Living unit numbers after P5.8 production verify:

```text
P5.7 = Studio Architecture Audit (GO WITH CONDITIONS) — NOT punch
P5.8 = Studio Devices / Input & Device Foundation — PRODUCTION VERIFIED — GREEN @ 95e04ff
NEXT = Architecture Audit / formal next Studio unit definition (do not auto-start P6)
```

Historical “punch as P5.7” language in older audit §37 is superseded. See [P5_7_STUDIO_ARCHITECTURE_AUDIT.md](../architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md) · [P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md](./P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md).

Audio boundary (living):

```text
StudioTransport != PlayerProvider
P6 requires dedicated StudioAudioEngine / audio graph
(do not bolt FX onto HTMLAudioElement / simple StudioTransport)
```


---

## 1. Verdict

```text
P5 DESIGN FREEZE STATUS: GO
```

Owner implementation GO for P5.1 is authorized by this freeze after closing OD-P5-01…07 (below).

---

## 2. Closed Owner Decisions (OD-P5-01…07)

| ID | Decision | Status |
|----|----------|--------|
| **OD-P5-01** | P5/P6/P7 boundaries = Extensible Studio Foundation / Effects·Mix·Master / Creative audio. P4 DF §23 naming **superseded** for P5+ (note added on P4 DF). | **CLOSED** |
| **OD-P5-02** | Lyrics / play events **OUT of P5** (defer). | **CLOSED** |
| **OD-P5-03** | `/studio` = Project list hub; Quick Record stays on beat detail. | **CLOSED** |
| **OD-P5-04** | Brand word „Studio” may stay EN in nav; **all Studio controls/copy PL**. | **CLOSED** |
| **OD-P5-05** | Project **without** beat allowed (scratch Project). | **CLOSED** |
| **OD-P5-06** | Bounce/merge: **design contract in P5**; UI/ship deferred while worker STOPPED. | **CLOSED** |
| **OD-P5-07** | Quota: Sample Policy for Takes + **soft max projects** (`STUDIO_MAX_PROJECTS_PER_USER`). | **CLOSED** |

---

## 3. Core model (frozen)

```text
Project  →  Track  →  Clip  →  Take (reference / source)
```

| Entity | Responsibility |
|--------|----------------|
| **Take** | Source audio + existing P3/P4 lifecycle. Not a timeline object. |
| **Clip** | Placement of a source on the timeline (ms). |
| **Track** | Extensible channel (not vocal-only). |
| **Project** | Container: tracks, clips, tempo, master basics, document version. |

**Forbidden:** equating Take↔Clip, Track↔Take, Project↔marketplace `beats`.

---

## 4. Time SSOT (frozen)

- Persisted timeline: **integer milliseconds**
- Runtime may use samples / high-res seconds at edges
- Compatible with `takes.audio_offset_ms` (Take source alignment; Clip has own `timeline_start_ms` / `source_offset_ms`)

---

## 5. Module responsibilities

| Module | Owns | Does not own |
|--------|------|--------------|
| `src/lib/studio/*` | Project/Track/Clip domain, AuthZ, persistence | Take lifecycle, PlayerProvider |
| `StudioTransport` | Project playhead Play/Pause/Stop | Catalog beat playback |
| `PlayerProvider` | Global catalog playback | Project timeline |
| Take APIs | Mic capture / download / export | Project document |
| Beat Quick Record | Anon + account QT on beat detail | Project Studio |

**StudioTransport ≠ PlayerProvider** (hard rule).

---

## 6. P3 / P4 compatibility (frozen)

- Anonymous Quick Record on beat detail **unchanged**
- Ownership XOR / anon paths / claim **unchanged**
- Eligibility / title / My Recordings / RAW / ladder / TAKE_EXPORT / MIX split **unchanged**
- Studio recording (later units) **reuses** take session/finalize — no second recording system

---

## 7. P5 / P6 / P7 boundaries (frozen)

| Wave | IN | OUT |
|------|----|-----|
| **P5** | Project/Track/Clip/timeline/transport/devices/metronome/punch (by unit) | Full FX, samples, instruments, publish |
| **P6** | Effects, automation, buses, master chain, analyzers productized | — |
| **P7** | Sample/scratch/instruments/creative sources | — |

P5.1 implements **foundation only** (see §9). Punch/metronome/devices = later P5 units.

---

## 8. Extension points (justified stubs only)

- Track: `effects_chain jsonb NULL`, `output_route` default `MASTER`
- Clip: reserved nullable `pitch_cents`, `stretch_ratio` (unused in P5.1)
- Project: `master_fx_chain jsonb NULL`
- Track `type` enum includes future VOCAL/BEAT/SAMPLE/… without type-switch core logic

---

## 9. P5.1 scope (this ship)

**IN**

- DB: `studio_projects`, `studio_tracks`, `studio_clips` + RLS + service_role mutations
- Server services + ownership AuthZ
- APIs for project/track/clip CRUD essentials
- `/studio` project list · `/studio/p/[id]` editor shell
- StudioTransport (playhead ms)
- Track controls: name, order, mute, solo, volume, pan, record arm
- Clip representation on timeline (basic)
- Polish UX · mobile-sensible Basic layout

**OUT of P5.1**

- Punch, split, advanced trim, metronome, tap tempo, analyzer
- FX / samples / scratch / instruments / mastering
- Bounce UI · worker enablement
- Changing Quick Record / P3 / P4 contracts

---

## 10. Security (frozen)

- Every Project has `owner_id`
- Mutations via **service_role** admin path only (mirror takes)
- RLS: authenticated SELECT own projects / tracks / clips via ownership join
- Server verifies ownership; never trust client-supplied `project_id` alone

---

## 11. Soft caps (OD-P5-07)

- `STUDIO_MAX_PROJECTS_PER_USER` = **25** (config constant)
- Takes remain under Sample Policy

---

## 12. Implementation sequence after P5.1

P5.2 StudioTransport audio for BEAT clips → P5.3 clip edit ops → … per audit §37.

---

## 13. P5.2 scope (StudioTransport / BEAT_REF playback)

**Status:** implemented in repo (separate Production Verification gate).

**IN**

- `StudioTransport` drives project playhead + local `HTMLAudioElement` for BEAT_REF
- Project → Track(type=BEAT) → Clip(source=BEAT_REF) remains the only beat pointer
- Play / Pause / Stop / Seek · timeline playhead sync · integer ms SSOT
- Beat lane distinguished in UI · track mute/solo/volume affect beat audibility
- Polish loading / error states (no technical asset leak)
- Entry: `/studio?beatId=` and beat detail „Otwórz w Studio”
- Catalog `PlayerProvider` suppressed in Studio (not merged)

**OUT of P5.2**

- Punch-in/out · vocal recording · metronome · tap tempo
- FX / EQ / compressor / reverb / delay / autotune
- Samples · scratch · instruments · full mix · bounce · mastering

---

## 14. P5.3 scope (Clip edit operations)

**Status:** implemented in repo (separate Production Verification gate).

**IN**

- MOVE · TRIM · SPLIT on `studio_clips` geometry only
- Fields: `timeline_start_ms` · `duration_ms` · `source_offset_ms` (integer ms)
- Source Take / Beat / Artifact references immutable (no new storage objects)
- Ownership via existing `assertOwnsProject` + service_role mutations
- Polish UI: Przesuń / Przytnij / Podziel · seek vs edit mode (mobile-safe)
- StudioTransport respects post-edit BEAT_REF segments (multi-clip pick)

**OUT of P5.3**

- Full undo/redo stack · advanced snap/grid · waveform editor
- Punch-in/out · vocal recording · metronome · FX · mix/master

**No DB migration** — existing clip columns are sufficient.

---

## 15. P5.4 scope (Timeline UX & editing foundation)

**Status:** implementation in progress (separate Production Verification gate).

**IN**

- Timeline navigation: horizontal scroll · time ruler · shared playhead · time display
- View-only zoom (in / out / fit) — does not mutate Clip geometry
- Minimal snap (`off` | `grid`) via presentation resolver → persisted integer ms
- Clip selection (`selectedClipId` UI/runtime only; not persisted)
- Context actions reusing P5.3 MOVE / TRIM / SPLIT
- Delete Clip only (source Take / Beat / storage immutable) + ownership + confirm UX

**OUT of P5.4**

- Recording · punch · metronome · BPM editor · Tap Tempo
- Full undo/redo · multi-select · professional grid engine
- FX · samples · instruments · automation · mix/master

**No DB migration** — zoom/snap/selection are presentation/runtime only.

---

## 16. P5.5 scope (Recording foundation)

**Status:** implementation in progress (separate Production Verification gate).  
**Baseline:** P5.4 PRODUCTION VERIFIED GREEN @ `41161e15f2b14d6dbbc552294d4bd75a86fec5cd`

**IN**

- Studio UI → existing P3/P4 Take pipeline (eligibility · session · MediaRecorder · upload · finalize)
- Auth-only Studio recording (no new anonymous path)
- Playhead-captured `timeline_start_ms` → Clip after Take READY
- Track picker (extensible Track types; prefer non-BEAT)
- Mic permission + optional input device (`enumerateDevices` / `audioDeviceId`)
- Reuse `reduceRecordingUi` state machine · timer · input level meter
- Cancel / stop / finalize · place Clip via ownership-checked Studio API
- StudioTransport TAKE layer via `/api/takes/preview` (≠ PlayerProvider)
- Recording lock mode (no MOVE / TRIM / SPLIT / DELETE / accidental seek)
- Coexists with BEAT_REF clips; source Take immutable under timeline ops

**OUT of P5.5**

- Punch-in/out · pre-roll · count-in · metronome · BPM / Tap Tempo
- Latency calibration · full monitoring mix · FX · samples · instruments
- Second recording backend · client-chosen storage keys / owner ids
- DB migration (existing takes + studio_clips sufficient)

**No DB migration** — Take → Clip uses existing contracts.

---

*Freeze locked. Implementation must not contradict this document without a new Owner decision.*
