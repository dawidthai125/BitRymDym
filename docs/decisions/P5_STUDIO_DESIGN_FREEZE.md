# P5 Studio — Design Freeze

**Status:** **P5 DESIGN FREEZE — GO**  
**Date:** 2026-10-06  
**Baseline:** `bface6c36661e9bdc9142add85f58a03ea2e1760`  
**Audit SSOT:** [P5_STUDIO_ARCHITECTURE_AUDIT.md](../architecture/P5_STUDIO_ARCHITECTURE_AUDIT.md)  
**Implementation start unit:** P5.1 (Project / Track / Clip foundation)

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

*Freeze locked. Implementation must not contradict this document without a new Owner decision.*
