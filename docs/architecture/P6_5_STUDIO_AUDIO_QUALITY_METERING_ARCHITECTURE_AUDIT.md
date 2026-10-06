# P6.5 — Studio Audio Quality / Metering Foundation — Architecture Audit

**Status:** ARCHITECTURE AUDIT — **GO WITH CONDITIONS**  
**Date:** 2026-10-06  
**Type:** AUDIT ONLY — **NO IMPLEMENTATION · NO DESIGN FREEZE · NO MIGRATION · NO DEPLOY**  
**Production application SHA:** `f261ea8a622ee3b3038e81ff89be6277535821ae` (`f261ea8`)  
**Production deployment:** `dpl_5ZBCGED4nQBuWQx81aa9959YeKCM`  
**SSOT tip at audit:** `ec92d6cc2d9687a6b7c66e633f4f2ec3192898a8`  
**Baseline unit:** **P6.4.3 PRODUCTION VERIFIED — GREEN**  
**Parent product freeze:** [P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md](../decisions/P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md)  
**Prior UI freeze:** [P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md](../decisions/P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md)  
**Prior audit:** [P6_4_STUDIO_FX_UI_MIX_UX_ARCHITECTURE_AUDIT.md](./P6_4_STUDIO_FX_UI_MIX_UX_ARCHITECTURE_AUDIT.md)

```text
P6.5 ARCHITECTURE: GO WITH CONDITIONS
IMPLEMENTATION: FORBIDDEN IN THIS STEP
DESIGN FREEZE: NEXT STEP (after Owner accepts this audit)
PRODUCTION APP: UNCHANGED (f261ea8)
```

### Naming note (historical P6 sequence)

Parent P6 freeze §35 historically labeled **P6.5 = Production Gate**. Living Studio sequence has since shipped gates inside **P6.4.1–P6.4.3**. This audit **redefines P6.5** as **Studio Audio Quality / Metering Foundation**. Residual P6.4.4 wording in living SSOT (Master FX UI polish) is **orthogonal**; metering does not require reopening P6.4.x.

---

## Executive Summary

P6.1–P6.4.3 delivered a complete Mix path on a **single** `StudioAudioEngine`:

persist/CAS → Track FX → Master FX → Master Gain/Pan → Mix UX → mobile sheet → Production GREEN.

**P6.5 should add runtime metering only** — peak / RMS / clip indication for Studio playback — without a second engine, without DB/API, and without importing E3 `mix-graph` / `PlayerProvider`.

| Question | Audit answer |
|----------|----------------|
| Ready for Design Freeze? | **YES, with conditions** |
| Second AudioContext / MeteringEngine? | **FORBIDDEN** |
| Primary DSP surface | **`AnalyserNode` tap inside `StudioAudioEngine`** |
| AudioWorklet? | **NOT for P6.5** (defer for professional analysis later) |
| Track vs Master | **Option C architecture · Master-first MVP** |
| LUFS / True Peak / Spectrum | **OUT of P6.5 product scope** |
| Persist meters? | **NO — runtime-only** |
| New Studio API / tables? | **NO** |

**Verdict:** Architecture supports a minimal, mobile-safe Master meter foundation. Design Freeze must lock scope (no LUFS/spectrum creep), insert point, poll rate, lifecycle, and isolation tests before any code.

---

## Current Architecture

```text
Studio editor (Mix UX P6.4.3)
  → document model (tracks / master / FX / gain / pan / documentVersion)
  → StudioTransportProvider
  → StudioAudioEngine.setDocument / play / pause / stop
  → Web Audio graph (SSOT for audible mix)

Isolated (must stay isolated):
  PlayerProvider · StickyMiniPlayer · E3 MixPanel · src/lib/mix/mix-graph.ts
```

| Layer | Owner | P6.5 relevance |
|-------|--------|----------------|
| Persist | JSONB FX + columns gain/pan + CAS | **unchanged** — meters not persisted |
| Track FX graph | `syncTrackFx` | tap **must not** alter insert semantics |
| Master FX graph | `syncMasterFx` + `masterInput` | tap **downstream** of Master FX |
| Mix UI | `studio-editor` / FX sheet | meter **display only** |
| Mic monitor | `useMicAnalyser` + `BrdInputMonitor` | **pattern reuse OK**; **must not** create second Studio context |
| E3 Mix meter | `mix-graph.getMeterReading` | **FORBIDDEN import** — informational precedent only |

**Hard rules for P6.5:**

1. Exactly one Studio `AudioContext` — owned by `StudioAudioEngine`.  
2. UI never creates Web Audio nodes for mix metering.  
3. No `MeteringEngine` / `StudioAnalyzerEngine` / `MasterAudioEngine`.  
4. No PlayerProvider / E3 Mix / `mix-graph` imports into Studio.  
5. No new DB tables, RPC, or metering REST endpoints.

---

## Current Audio Graph

Verified from `src/lib/studio/studio-audio-engine.ts` (P6.2/P6.3/P6.4.1 runtime):

```text
Voice / Clip (MediaElementSource)
  → Clip Gain
  → Track input
  → Track FX[]          (optional; dry = input→gain)
  → Track Gain
  → Track Pan
  → Σ masterInput
  → Master FX[]         (optional; dry = masterInput→masterGain)
  → Master Gain
  → Master Pan
  → Destination
```

Special path (unchanged):

```text
Take preview → Clip Gain → Master Gain  (dry of Track FX and Master FX)
```

Engine already exposes diagnostics (`inspectTrackFx`, `inspectMasterFx`) and a host `requestTick`/`cancelTick` (rAF) for playhead clock — suitable for a **throttled** meter poll loop bound to engine lifecycle.

---

## Metering Architecture

### Recommended insert (P6.5)

```text
… → Master FX → Master Gain → Master Pan → AnalyserNode → Destination
```

| Property | Rule |
|----------|------|
| Node type | Web Audio **`AnalyserNode`** created by `StudioAudioEngine` only |
| Topology | Series pass-through (AnalyserNode does not alter samples when connected) |
| Gain/Pan semantics | Unchanged — meter is **observe-only** |
| Rebuild | Recreate/reconnect analyser when master chain rebuild disconnects destination path; dispose with engine |
| Preview Take | Still enters at Master Gain; analyser after Master Pan still sees preview + timeline sum as heard |

### Forbidden topologies

- Separate `AudioContext` only for meters (mic-style) for **mix** metering.  
- Parallel graph that duplicates FX/Gain (CPU + drift).  
- Reading meters from HTMLAudioElement `.volume` / media element peak.  
- Importing E3 `createMixPreviewGraph` / `getMeterReading`.

### Data flow

```text
StudioAudioEngine (playing/ready)
  → sample time-domain buffer (getFloatTimeDomainData)
  → compute peak / RMS / clip latch (pure functions)
  → throttle emit (≤ 10–15 Hz)
  → listener / subscription → Mix UI
  → paint meter (no PATCH, no DB)
```

---

## Track vs Master Recommendation

| Option | Description | UX | CPU / mobile | Architecture |
|--------|-------------|----|--------------|--------------|
| **A** | Master meter only | Good for “is the sum clipping?” | Lowest | Simplest |
| **B** | Always-on Track + Master | Best for mixing many tracks | High (N analysers) | Risky on ~390 |
| **C** | Master realtime + Track on-demand | Balanced | Medium | Best long-term |

### Decision

```text
ARCHITECTURE RECOMMENDATION = Option C
P6.5 IMPLEMENTATION MVP     = Option A (Master realtime)
Track meters                = MAY in same freeze as on-demand (selected track only)
Always-on per-Track meters  = OUT of P6.5
```

**Why C (architecture) / A (MVP):**

1. Master meter answers the primary quality question after Master FX + Gain/Pan.  
2. Always-on Track analysers scale with track count and hurt mobile battery.  
3. On-demand Track tap (selected Mix row / focused track) can reuse the same helper without a second engine.  
4. Matches parent freeze COULD item (“Peak `AnalyserNode` on Master”) without scope explosion.

---

## AnalyserNode vs AudioWorklet

| Criterion | AnalyserNode | AudioWorklet |
|-----------|--------------|--------------|
| Peak / RMS UI | **Sufficient** | Overkill |
| LUFS / true-peak | Weak / incomplete | Possible with custom DSP |
| Browser support | Universal Web Audio | Good modern; more plumbing |
| Mobile CPU | Low if throttled | Higher if naive |
| Next.js / SSR | Engine already client-only | Needs module load + worklet URL |
| Testability | Host can fake `createAnalyser` | Harder fakes |
| Complexity | Low | High |

### Decision

```text
P6.5 = AnalyserNode only
AudioWorklet = OUT of P6.5 (candidate for later professional / offline analysis)
```

---

## CPU / Mobile Performance

### Safe model (freeze must lock)

| Parameter | Recommendation |
|-----------|----------------|
| Emit rate to React | **10–15 Hz** (align with `useMicAnalyser` default 15 Hz) |
| Inner rAF | Allowed for sampling; **do not** `setState` every frame |
| `fftSize` | **256–512** for peak/RMS time-domain (buffer length) |
| `smoothingTimeConstant` | ~0.5–0.8 for UI stability |
| Spectrum FFT draws | **OUT** (see Spectrum) |
| Background tab | Pause emit when `document.visibilityState !== "visible"` |
| Lifecycle | Poll only when engine lifecycle ∈ `{ready, playing, paused}` with active context; **stop on `stopped` / `disposed`** |
| Track analysers | At most **one** optional on-demand Track analyser |
| Battery | Prefer pause when not playing if Design Freeze chooses “playing-only meters” |

### Desktop

15 Hz Master meter is negligible vs MediaElement decode + FX chain.

### Mobile ~390

Priority: no horizontal overflow (already GREEN), ≥44px controls (already GREEN), **no** spectrum waterfall, **no** N-track always-on analysers, respect safe-area / sticky transport.

---

## Peak / RMS

| Metric | P6.5 | Method |
|--------|------|--------|
| Peak (linear 0…1) | **IN** | max \|sample\| over time-domain buffer |
| Peak dBFS | **IN** | `20 * log10(peak)` with floor |
| RMS | **IN (simple)** | sqrt(mean square) over same buffer — **UI loudness proxy, not LUFS** |
| L/R balance | **MAY** | requires `ChannelSplitter` + dual analysers or channel indexing — freeze must say IN or OUT |
| Ballistics | Peak hold ~300–800 ms decay for readability |

Reuse classification ideas from mic monitor (`silent/quiet/good/hot/clip`) only as **Studio Mix meter states** — do not couple recording mic SSOT to mix meter SSOT.

---

## LUFS

| Question | Answer |
|----------|--------|
| Is Web Audio AnalyserNode enough for trustworthy realtime LUFS? | **NO** for product-grade integrated / short-term LUFS |
| Can we fake “LUFS” from RMS? | **FORBIDDEN** — would mislead users |
| Offline / export LUFS later? | Possible via AudioWorklet / offline render / server — **not P6.5** |

```text
LUFS = OUT OF P6.5
```

Parent freeze already lists LUFS as OUT; this audit **reaffirms**.

---

## True Peak

| Question | Answer |
|----------|--------|
| Sample peak via AnalyserNode | **YES** — sufficient for Studio Mix clip warning |
| Inter-sample True Peak (oversampled) | Needs oversampling / specialized DSP — **OUT of P6.5** |
| Relation to limiter | Existing limiter remains **IMPLEMENTATION LIMITATION**; metering must not claim brickwall/true-peak protection |

```text
True Peak (inter-sample) = OUT OF P6.5
Sample peak clip indication = IN (runtime)
```

---

## Clipping

| Topic | Recommendation |
|-------|----------------|
| Detect where | On Master path **after Master Gain + Master Pan** (what hits Destination) |
| Threshold | ~0.99 linear (−0.1 dBFS) or freeze-chosen constant |
| Hold | Latch UI clip flag **1–2 s** after last exceedance |
| Persist | **Never** |
| Before vs after Master FX | Optional second tap **OUT of P6.5**; one post-Master-Pan meter is enough |
| Limiter behavior | **Unchanged** |

Clip indicator is **runtime UX**, not a mastering report.

---

## Spectrum

| Concern | Assessment |
|---------|------------|
| FFT + paint cost | Material on mobile |
| UX value vs Mix Peak | Lower for BitRymDym core Mix loop |
| Parent freeze | Spectrum / mastering metering **OUT** |

```text
Spectrum analyzer = OUT OF P6.5 (candidate P6.x later or P7)
```

---

## Runtime vs Persisted Data

### PERSISTED (unchanged SSOT)

- project / tracks / clips  
- FX chains  
- Track Mute/Solo/Gain/Pan  
- Master Gain/Pan  
- `documentVersion`  

### RUNTIME ONLY (P6.5)

- peak / peakDb  
- RMS  
- clip latch  
- optional L/R balance  
- meter lifecycle state  

**No** metering columns, **no** metering JSONB, **no** metering PATCH.

---

## UI Architecture

Minimal surface (no final pixels in this audit):

| Placement | Proposal |
|-----------|----------|
| Master Mix card | Compact vertical or horizontal **level meter** next to Gain/Pan (not inside FX sheet) |
| Track Mix card | **Hidden by default**; optional thin meter when Track selected / on-demand (if freeze includes MAY) |
| FX sheet | **No** required meter (sheet already dense) |
| Transport | Remains sticky; meter must not steal Play/Stop |
| Mobile | Meter width fluid; **no** horizontal scroll; targets ≥44px for any interactive mute of meter (if any) |

### Refresh

UI subscribes to throttled engine snapshots; React re-render ≤15 Hz.

### Accessibility

| Requirement | Note |
|-------------|------|
| `aria-label` | e.g. „Poziom Master” |
| Live region | Prefer **polite** updates for clip text; avoid announcing every peak tick |
| Color | Clip state must not be color-only (text/icon) |
| Polish UX labels | Studio brand EN; meter labels PL |

---

## Accessibility

- Meter is primarily **visual**; do not make screen readers spam dB values.  
- Clip: short status text „Przesterowanie” with hold.  
- Keyboard: meters non-focusable unless interactive; transport/Mix controls remain primary focus order.  
- Respect reduced-motion: avoid flashy spectrum (already OUT).

---

## Security

| Topic | Finding |
|-------|---------|
| New endpoints | **Not required** — meters computed in-browser from owner’s already-authorized playback |
| Cross-user leak | Metering cannot expose another user’s audio; media URLs remain existing AuthZ |
| RLS / ownership | Unchanged |
| Unauth | Studio project load already gated; no metering API to attack |

---

## Testing Strategy

Design Freeze / impl later — **not implemented in this audit**.

| Area | Approach |
|------|----------|
| Fake host | Extend engine host with `createAnalyser` stub (mirrors existing Gain/Pan fakes) |
| Lifecycle | initialize → play → peak updates → pause/stop → emit stops → dispose → no leaked nodes |
| Rebuild | Master FX rebuild reconnects analyser; no double destination connect |
| Isolation | Studio metering modules MUST NOT match `PlayerProvider` / `mix-graph` / `MixPanel` / `StudioMixEngine` |
| Visibility | Hidden tab stops emit |
| Mobile contract | Source/contract tests for poll Hz, fftSize caps, Option A MVP |
| Regression | P6.1–P6.4.3 + Studio suite remain GREEN |

---

## Risks

### HIGH

| ID | Risk | Why |
|----|------|-----|
| H1 | Second AudioContext for mix meters | Breaks one-engine rule; drift vs audible path |
| H2 | Import E3 `mix-graph` meter | Violates Studio/E3 boundary |
| H3 | Scope creep to LUFS/True Peak/Spectrum | Mastering product in a Mix foundation slice |

### MEDIUM

| ID | Risk | Why |
|----|------|-----|
| M1 | Always-on Track analysers | Mobile CPU / battery |
| M2 | setState every rAF | React churn / jank |
| M3 | Meter after wrong node | Misleading clip (e.g. pre-Master-Gain only) |
| M4 | Claiming “broadcast LUFS” from RMS | Trust damage |

### LOW

| ID | Risk | Why |
|----|------|-----|
| L1 | Channel layout differences across browsers | L/R MAY needs careful freeze |
| L2 | Analyser reconnect on FX rebuild | Must be covered by tests |
| L3 | Confusion with mic `BrdInputMonitor` | Separate recording vs mix SSOT |

---

## Mitigations

| Risk | Mitigation |
|------|------------|
| H1 | Freeze: analyser created only in `StudioAudioEngine` |
| H2 | Isolation tests + import lint in Studio metering files |
| H3 | Explicit OUT list; Design Freeze scope table |
| M1 | Option A MVP; Track on-demand only |
| M2 | Throttle ≤15 Hz |
| M3 | Insert after Master Pan |
| M4 | Label as „Peak / poziom”, never „LUFS” |
| L2 | Rebuild/dispose tests |

---

## Out of Scope

P6.5 Architecture Audit / subsequent Design Freeze **must not** include:

- LUFS (integrated / short-term / momentary product claims)  
- Inter-sample True Peak / oversampling  
- Spectrum analyzer / waterfall / spectrogram  
- Brickwall limiter rewrite  
- Automation, buses, sends, sidechain, routing  
- AudioWorklet DSP product  
- New DB / RPC / metering API  
- PlayerProvider / E3 Mix merge  
- Recording input metering changes (existing mic monitor stays)  
- Autosave / project versioning / global Undo  
- Fixing known limitations: limiter IMPLEMENTATION LIMITATION · synthetic IR · delay no BPM sync · P5.10 TAKE preview fixture · wave4-live  
- Unrelated WIP cleanup  

---

## Required Design Freeze Decisions

Design Freeze (next document) must lock:

1. **Scope table:** Peak + RMS + clip IN; LUFS / True Peak / Spectrum OUT.  
2. **Insert point:** Master Pan → AnalyserNode → Destination.  
3. **Option A MVP** (+ whether Track on-demand MAY is in or deferred).  
4. **Poll rate / fftSize / visibility pause / playing-only vs paused meters.**  
5. **Clip threshold + hold duration + Polish copy.**  
6. **UI placement** on Master Mix card; a11y live-region policy.  
7. **Engine API shape** (e.g. `getMeterSnapshot()` / listener) — still no second engine.  
8. **Isolation tests** vs PlayerProvider / mix-graph.  
9. **No persistence / no new endpoints.**  
10. **Production Gate checklist** for P6.5 after impl.

Suggested next path:

```text
docs/decisions/P6_5_STUDIO_AUDIO_QUALITY_METERING_DESIGN_FREEZE.md
```

---

## Final Decision

```text
P6.5 ARCHITECTURE: GO WITH CONDITIONS
```

**Not NO-GO:** single-engine Mix graph is production-proven; AnalyserNode tap is a standard, low-risk observe path; mic analyser and E3 meter patterns prove feasibility without mandating imports.

**Not unconditional GO:** Design Freeze must prevent mastering-scope creep, lock Master-first MVP, poll/CPU caps, lifecycle/dispose rules, and Studio/E3 isolation before implementation.

---

## Next Step

```text
1. Owner reviews this audit
2. P6.5 Design Freeze (conditions above)
3. Owner GO → implement metering foundation only
4. Production Gate for P6.5
```

**Do not implement metering before Design Freeze.**  
**Do not start P6.4.4 / P6.5 code in this step.**
