# P6.5 Studio Audio Quality & Metering — Design Freeze

**Status:** DESIGN FREEZE — **GO**  
**Date:** 2026-10-06  
**Type:** DOCS ONLY — **NO IMPLEMENTATION · NO DB MIGRATION · NO DEPLOY**  
**Owner:** Prezes Dawid  
**Architect:** ChatGPT  
**Implementacja:** Cursor Agent (po Owner GO na implementację)

**Baseline production application:** `f261ea8a622ee3b3038e81ff89be6277535821ae` (`f261ea8`)  
**Production deployment:** `dpl_5ZBCGED4nQBuWQx81aa9959YeKCM`  
**SSOT tip at freeze:** `ec92d6cc2d9687a6b7c66e633f4f2ec3192898a8`  
**Architecture audit:** `fe4eb0d68528f87d94ce7845bb3e746f5e625191` → [P6_5_STUDIO_AUDIO_QUALITY_METERING_ARCHITECTURE_AUDIT.md](../architecture/P6_5_STUDIO_AUDIO_QUALITY_METERING_ARCHITECTURE_AUDIT.md)  
**Prior Mix UX:** [P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md](./P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md) · P6.4.3 GREEN @ `f261ea8`  
**Parent product freeze:** [P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md](./P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md)

```text
P6.5 DESIGN FREEZE: GO
IMPLEMENTATION: FORBIDDEN IN THIS STEP
PRODUCTION APP: UNCHANGED (f261ea8)
NO DEPLOY
```

This freeze **closes** Architecture Audit `GO WITH CONDITIONS` by locking Master-only realtime metering MVP: single `AnalyserNode` after Master Pan, sample Peak + clip latch, runtime-only snapshots, ≤15 Hz UI emit, lifecycle/visibility rules, Master Mix UI placement, mobile/a11y, and test/acceptance contracts.

**Naming:** Historical parent P6 §35 “P6.5 = Production Gate” is **superseded**. Living P6.5 = **Studio Audio Quality / Metering Foundation** (Master-only MVP).

---

## Status

| Item | Value |
|------|--------|
| Decision | **P6.5 DESIGN FREEZE: GO** |
| Scope | Master-only realtime Peak + clipping indication |
| Engine | Existing `StudioAudioEngine` only |
| Persistence | **None** for meter state |
| Next | P6.5 Implementation (after Owner GO) |

---

## Baseline

| Layer | SHA / ID | State |
|-------|----------|--------|
| Production application | `f261ea8` | **P6.4.3 PRODUCTION VERIFIED — GREEN** |
| Deployment | `dpl_5ZBCGED4nQBuWQx81aa9959YeKCM` | Ready · www |
| SSOT reconciliation | `ec92d6c` | Living tip at freeze authoring |
| Architecture audit | `fe4eb0d` | **GO WITH CONDITIONS** (closed by this freeze) |
| P6.1–P6.4.3 | GREEN | Must not regress |
| Known limitations | limiter · synthetic IR · delay no BPM · TAKE preview · wave4-live | **Unchanged / OUT of fix scope** |

---

## Architecture Decision

| Decision | Freeze |
|----------|--------|
| Product slice | **Master-only realtime metering MVP** |
| Engine | **Exactly one** `StudioAudioEngine` per Studio editor |
| DSP | **`AnalyserNode` only** — no AudioWorklet |
| Track meters | **OUT of P6.5** (future on-demand Track metering may be documented elsewhere; **not implemented**) |
| Second engines | **FORBIDDEN:** `MeteringEngine`, `StudioAnalyzerEngine`, `MasterAudioEngine`, `StudioMixEngine`, second `AudioContext`, parallel meter graph |
| Boundaries | **FORBIDDEN:** `PlayerProvider`, E3 Mix, `mix-graph`, `MixPanel` |
| Data | Runtime-only `MeterSnapshot` — **no DB / RPC / REST** |
| UI ownership | React receives **snapshots**, never `AudioNode` / `AnalyserNode` |

Audit Option C (Master realtime + Track on-demand) is **architecture future**. **P6.5 implements Option A only.**

---

## Audio Graph

### Current (P6.4.3)

```text
Clip → Track FX → Track Gain/Pan → Σ (masterInput)
  → Master FX → Master Gain → Master Pan → Destination
```

### P6.5 (frozen)

```text
Clip → Track FX → Track Gain/Pan → Σ (masterInput)
  → Master FX → Master Gain → Master Pan → AnalyserNode → Destination
```

| Rule | Freeze |
|------|--------|
| Insert | **After** Master Pan, **before** Destination |
| Topology | Series pass-through on the **existing** graph |
| Parallel graph | **FORBIDDEN** |
| Gain/Pan/FX semantics | **Unchanged** — analyser is observe-only |
| Take preview | Remains dry of Track/Master FX → Master Gain; still audible through Master Pan → analyser → Destination |

---

## AnalyserNode

| Parameter | Freeze |
|-----------|--------|
| Count | **Exactly one** active analyser per engine lifecycle |
| Owner | Created/disposed **only** by `StudioAudioEngine` |
| `fftSize` | **256** (preferred). **512** only if a documented runtime constraint requires it — not for spectrum |
| Spectrum / FFT visualization | **OUT** — fftSize exists solely for analyser time-domain buffer sizing |
| `smoothingTimeConstant` | Implementation may use ~0.5–0.8; must not change audible graph |
| UI exposure | **Never** pass analyser to React |

AudioWorklet: **OUT of P6.5**.

---

## MeterSnapshot

Minimal runtime contract (names may be TypeScript-idiomatic; fields are frozen):

```text
MeterSnapshot {
  peak: number          // linear 0…1 sample peak
  clipping: boolean     // latched sample-peak clip indication
  updatedAtMs: number   // performance.now() or engine host clock ms
}
```

| Rule | Freeze |
|------|--------|
| Source | Engine / controlled reader only |
| Persist | **Never** |
| API | **No** HTTP endpoint |
| Extra fields | Forbidden unless required for internal reader and **not** shown as LUFS/True Peak/RMS product metrics |
| RMS | **Not required** for P6.5 UX. If used internally for computation, must not appear as LUFS and must not expand product scope. Prefer **omit** if unused. |

---

## Peak

| Item | Freeze |
|------|--------|
| Meaning | **Sample peak** — max \|sample\| over the current analyser time-domain buffer |
| Range | Linear **`0 … 1`** (1.0 ≈ 0 dBFS full-scale in the analyser buffer) |
| Display | Optional numeric Peak (e.g. dBFS derived as `20 * log10(peak)` with floor when peak ≈ 0) — label as **Peak**, never LUFS / True Peak |
| No playback / Stop | UI shows **neutral** Peak (`0` / empty bar) — see Play/Pause/Stop |
| Naming | Polish UX may use „Peak” / „Poziom”; English brand **Studio** unchanged |

---

## Clipping

| Item | Freeze |
|------|--------|
| Kind | **Sample-peak clipping indication** |
| Detection | `peak >= 1.0` (0 dBFS sample peak in the buffer) |
| Correction | **None** — no auto gain, no auto limiter engage, no graph mutation |
| Latch | **`1500 ms`** from last detection while updates run |
| While latched | `clipping = true` |
| After latch without new hits | `clipping = false` |
| On Stop | `clipping = false` immediately |
| Limiter | **Unchanged** (known IMPLEMENTATION LIMITATION remains) |
| UI | Non-color-only indicator (text/icon + color allowed together) |
| Polish copy | e.g. „Przesterowanie” |

---

## Lifecycle

| Event | Freeze |
|-------|--------|
| Engine create / initialize | Create **one** analyser; wire Master Pan → Analyser → Destination |
| FX rebuild | Must **not** create a second analyser; reconnect existing analyser (or equivalent single-instance policy) so Destination path stays single |
| Duplicate prevention | Assert/invariant: ≤1 active Master analyser for the engine |
| Dispose | Stop meter reader/timers/listeners; disconnect/release analyser with engine; close no extra AudioContext |
| UI unmount | Unsubscribe only — must not leave orphaned timers if engine still alive; dispose engine remains SSOT for node teardown |

---

## Visibility

| State | Freeze |
|-------|--------|
| `document.visibilityState === "hidden"` | **Stop meter updates** (no snapshot emit to UI) |
| Return to `visible` | Resume updates **without** new AudioContext and **without** new analyser |
| Memory | No leaked listeners/timers across visibility toggles |

---

## Play / Pause / Stop

| Transport | Meter emit | Peak UI | Clipping |
|-----------|------------|---------|----------|
| **PLAY** | Start delivering snapshots (≤15 Hz) | Live Peak | Latch rules apply |
| **PAUSE** | **No** unnecessary updates — freeze emit (or hold last snapshot without new polls; prefer **stop polling**) | Hold last Peak **or** freeze display — **MUST NOT** keep hot polling | Latch may remain until Stop or latch timeout without new hits; prefer **no new detections** while paused |
| **STOP** | Stop emit | **Neutral** (Peak → 0 / empty) | **`clipping = false`** |

**MVP preference (frozen):** after STOP, UI returns to **neutral** Peak and cleared clipping.

---

## Master UI

Integrate into existing Master Mix card (`studio-editor` P6.4.3) — **no new page**.

Preferred order:

```text
Master
  → Gain
  → Pan
  → Meter
  → FX entry
```

| Rule | Freeze |
|------|--------|
| Visual | Simple bar / level — no chart library, no spectrum canvas |
| Peak | Optional numeric Peak |
| Clipping | Clear indicator |
| FX sheet | Meter **not required** inside FX drawer |
| Transport | Sticky transport remains reachable; meter must not trap Play/Stop |

---

## Mobile

| Rule | Freeze |
|------|--------|
| Target | **~390 px** |
| Overflow | **No** horizontal overflow |
| Layout | Light; no new gesture language |
| Transport | No interference with sticky Play/Pause/Stop |
| Bottom nav | **No** global nav redesign; reuse existing safe-area / scroll-padding from P6.4.3 |
| Sheet | Meter lives on Master Mix surface (not a heavy nested chart) |

---

## Accessibility

| Rule | Freeze |
|------|--------|
| Node | Prefer non-spammy semantics; `role="meter"` **only if** mapping is accurate for the Peak control |
| Live announcements | **Throttled** — must **not** announce 10–15 times/sec |
| Content | Accessible Peak value + clipping state available (e.g. `aria-valuenow` / status text on change at low rate, or on clip edge only) |
| Color | Clipping must not be color-only |
| Labels | PL UX; brand **Studio** EN |

---

## Performance Budget

### Desktop

- No audible degradation from metering  
- No duplicate AudioContext / AnalyserNode  
- No React render storm (`requestAnimationFrame → setState` at 60 FPS **FORBIDDEN**)  
- UI subscription **≤ 10–15 updates/sec**

### Mobile

- Same ≤15 Hz cap  
- Pause when hidden  
- **No** Track analysers  
- **No** spectrum  

### Reader model

Controlled timer/subscription (or throttled rAF that **batches** emit ≤15 Hz). Graph rebuild **not** driven by meter ticks.

---

## Security

| Rule | Freeze |
|------|--------|
| Endpoints | **None** new |
| RLS / ownership | **Unchanged** |
| Scope | Metering only inside already-authorized Studio session / playback |
| Leakage | Must not expose another user’s audio or project data |

---

## Testing Contract

Minimum frozen coverage:

### Engine

- Analyser created once per lifecycle  
- No duplicate analyser after FX rebuild  
- No second AudioContext  
- Insertion after Master Pan (inspect/reconnect assertions)  
- Dispose cleans reader + analyser  
- Isolation: no PlayerProvider / mix-graph / StudioMixEngine

### Meter

- Peak snapshot bounds  
- Clipping detection at ≥ 0 dBFS sample peak  
- Clipping latch ~1500 ms  
- Clipping reset on Stop  
- Play starts emit; Pause stops unnecessary emit; Stop neutrals UI state  
- Visibility pause/resume without new context/analyser

### UI

- Master meter renders  
- Peak display  
- Clipping indication (non-color-only)  
- Accessibility throttling contract  
- Mobile ~390 / no horizontal overflow  

### Regression

P6.1 · P6.2 · P6.3 · P6.4.1 · P6.4.2 · P6.4.3 · Studio suite · typecheck · build · scoped lint  

---

## Out of Scope

Definitively **OUT** of P6.5:

- LUFS (any claim or fake RMS-as-LUFS)  
- Inter-sample True Peak / oversampling  
- Spectrum / FFT visualization / waterfall  
- AudioWorklet product  
- Always-on Track meters  
- On-demand Track meters (**implementation**) — may be future unit only  
- Limiter rewrite / brickwall product  
- Automation · buses · sends · routing  
- Recording / input-output device / latency changes  
- Samples · scratch · lyrics · comments · reactions · ranking · messaging · marketplace  
- Global Undo/Redo · autosave · project versioning  
- New DB columns/tables/RPC/REST  
- PlayerProvider / E3 Mix merge  

---

## Known Limitations

Do **not** fix in P6.5:

- Limiter IMPLEMENTATION LIMITATION  
- Reverb synthetic IR  
- Delay no BPM sync  
- P5.10 TAKE preview may fail  
- wave4-live PRE-EXISTING / OUT-OF-SCOPE  
- Unrelated local WIP  

If metering makes a known limitation more visible, **document** it — do not expand scope.

---

## Implementation Sequence

Frozen order — **do not implement in this docs step**:

1. `StudioAudioEngine` analyser lifecycle (create / reconnect / dispose)  
2. Runtime `MeterSnapshot` + pure peak/clip helpers  
3. Controlled meter reader/subscription (≤15 Hz)  
4. Clipping latch (1500 ms) + Stop/visibility rules  
5. Master Meter UI (Gain → Pan → Meter → FX)  
6. Visibility lifecycle wiring  
7. Mobile + accessibility hardening  
8. Unit / runtime tests  
9. Regression (P6.1–P6.4.3 + Studio)  
10. Production Gate  
11. SSOT reconciliation  

---

## Acceptance Criteria

P6.5 is **PRODUCTION VERIFIED — GREEN** only if all hold:

1. Exactly one `StudioAudioEngine`  
2. Exactly one analyser per engine lifecycle  
3. Analyser inserted after Master Pan  
4. No second AudioContext  
5. No PlayerProvider / E3 / mix-graph involvement  
6. Master-only meter (no Track meters)  
7. Peak works (sample peak 0…1)  
8. Clipping detection works  
9. Clipping latch (~1500 ms) works  
10. Stop resets runtime clip + neutral Peak UI  
11. `hidden` stops meter updates; `visible` resumes without new context/analyser  
12. UI ≤ 15 updates/sec  
13. No React render storm  
14. Mobile ~390 works  
15. No horizontal overflow  
16. Accessibility works (throttled; non-color-only clip)  
17. No DB / API changes  
18. Existing FX / transport / Mix controls do not regress  
19. Regression tests GREEN (P6.1–P6.4.3 + Studio + typecheck/build/scoped lint)  

---

## Final Decision

```text
P6.5 DESIGN FREEZE: GO
```

Audit conditions are **resolved and frozen**. Implementation may proceed **only after Owner GO**, in the sequence above, without expanding OUT-OF-SCOPE items.

---

## Next Step

```text
Owner GO → P6.5 Implementation
         → Production Gate
         → docs: reconcile SSOT after P6.5 production verification
```

**Do not implement in this step.**
