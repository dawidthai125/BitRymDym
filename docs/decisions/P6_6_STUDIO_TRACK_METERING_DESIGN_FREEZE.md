# P6.6 Studio Track Peak Metering — Design Freeze

**Status:** DESIGN FREEZE — **GO**  
**Date:** 2026-10-07  
**Type:** DOCS ONLY — **NO IMPLEMENTATION · NO DB MIGRATION · NO DEPLOY**  
**Owner:** Prezes Dawid  
**Architect:** ChatGPT  
**Implementacja:** Cursor Agent (**only after** Owner/Architect confirmation)

**Baseline production application:** `2258bdbbf5099189bf88e9ed65f41faf43afe226` (`2258bdb`)  
**Production deployment:** `dpl_54uwtNdFbSG4apwikSioTyevdYcr` · served Studio chunk `29qtmv8kgtz1f.js`  
**SSOT tip at freeze:** `f8573d0db83ad9f761f6388365a6036c0b3f455e` (`f8573d0`)  
**Architecture audit:** `f8573d0` → [P6_6_STUDIO_ARCHITECTURE_AUDIT.md](../architecture/P6_6_STUDIO_ARCHITECTURE_AUDIT.md)  
**Prior metering freeze:** [P6_5_STUDIO_AUDIO_QUALITY_METERING_DESIGN_FREEZE.md](./P6_5_STUDIO_AUDIO_QUALITY_METERING_DESIGN_FREEZE.md)  
**Prior Mix UX:** [P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md](./P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md) · P6.4.3 GREEN @ `f261ea8`  
**Parent product freeze:** [P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md](./P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md)

```text
P6.6 DESIGN FREEZE: GO
IMPLEMENTATION: AUTHORIZED ONLY AFTER OWNER/ARCHITECT CONFIRMATION
PRODUCTION APP: UNCHANGED (2258bdb)
NO CODE · NO DB · NO DEPLOY IN THIS STEP
```

This freeze **closes** Architecture Audit `GO WITH CONDITIONS` by locking On-demand Track Peak Metering: at most one Track `AnalyserNode` after Track Pan (before Σ), selection-driven lifecycle, REUSE of `studio-meter.ts` + Master meter patterns, Master analyser unchanged, runtime-only (no DB/API/CAS), mobile ~390, and explicit Non-Goals (always-on Track meters, LUFS/spectrum, P6.5 visibility/CDP reopen, P6.4.4 residual reopen).

**Naming:** Living P6.6 = **On-demand Track Peak Metering** (Option C completion after P6.5 Option A Master-only MVP).

---

## 1. Status

| Item | Value |
|------|--------|
| Decision | **P6.6 DESIGN FREEZE: GO** |
| Scope | On-demand Track Peak Metering (selected track only) |
| Engine | Existing `StudioAudioEngine` only |
| Track analysers | **0 or 1** active |
| Master analyser | **Unchanged** (exactly one) |
| Persistence | **None** for Track meter / selection |
| Implementation | **AUTHORIZED ONLY AFTER OWNER/ARCHITECT CONFIRMATION** — not auto-start |

### Architecture Audit conditions — closed by this freeze

| # | Condition | Freeze resolution |
|---|-----------|-------------------|
| 1 | Owner scope = On-demand Track Peak Metering | **Accepted / frozen** |
| 2 | Max one Track analyser | **Frozen** (§7–8) |
| 3 | Master analyser unchanged | **Frozen** (§10) |
| 4 | Single `StudioAudioEngine` | **Frozen** (§6) |
| 5 | No DB/API/CAS | **Frozen** (§12) |
| 6 | Existing visibility lifecycle reused | **Frozen** (§11) |
| 7 | Track meter runtime-only | **Frozen** (§9, §12) |
| 8 | Selection controls analyser lifecycle | **Frozen** (§8) |
| 9 | Mobile ~390 supported | **Frozen** (§15) |
| 10 | P6.5 Scenario B remains BLOCKED/INCONCLUSIVE | **Frozen** (§22) |
| 11 | P6.4.4 residual outside P6.6 | **Frozen** (§23) |

---

## 2. Canonical Baseline

| Layer | SHA / ID | State |
|-------|----------|--------|
| Production application | `2258bdb` | **P6.5 IMPLEMENTATION COMPLETE · DEPLOYED** |
| Deployment | `dpl_54uwtNdFbSG4apwikSioTyevdYcr` | Ready · www · chunk `29qtmv8kgtz1f.js` |
| SSOT tip | `f8573d0` | P6.6 Architecture Audit shipped |
| Architecture audit | `f8573d0` | **GO WITH CONDITIONS** (closed by this freeze) |
| P6.1–P6.4.3 | GREEN | Must not regress |
| P6.5 | Scenario A **PROVEN** · Scenario B **BLOCKED** · RUNTIME GATE **INCONCLUSIVE** (not GREEN · not FAILED) | Must not reopen B |
| Known limitations | limiter · synthetic IR · delay no BPM · TAKE preview · wave4-live | **Unchanged / OUT of fix scope** |

---

## 3. Scope

### IN

| Item | Freeze |
|------|--------|
| Product | On-demand Track sample Peak (+ clip latch reuse from P6.5 helpers) |
| Trigger | **Currently selected Track** only |
| DSP | Exactly **0 or 1** Track `AnalyserNode` owned by `StudioAudioEngine` |
| Topology | After Track Pan, before Σ `masterInput` |
| Helpers | REUSE `src/lib/studio/studio-meter.ts` |
| UI | Compact Peak meter on selected Track Mix row/card |
| Rate | ≤15 Hz UI emit (prefer shared `STUDIO_METER_HZ` / 12 Hz) |
| Visibility | REUSE existing engine/transport visibility pause/resume |
| Data | Runtime-only snapshots — never persist |

### OUT

See §5 Non-Goals.

---

## 4. Goals

1. Let the mixer observe Peak of the **selected** Track during timeline Play.  
2. Complete P6.5 Architecture Option C **without** always-on N-track meters.  
3. Preserve Master Meter topology, semantics, and regression GREEN path.  
4. Stay REUSE-FIRST: one engine, shared Peak helpers, existing Mix selection + mobile patterns.  
5. Zero new DB/API/CAS/document_version surfaces.  
6. Keep Studio isolated from PlayerProvider and E3 Mix.

---

## 5. Non-Goals

Definitively **OUT** of P6.6:

- LUFS · True Peak · Spectrum / FFT visualization / waterfall  
- AudioWorklet product metering  
- Always-on Track meters · N analysers for N tracks  
- Second `AudioContext` · `MeteringEngine` · `StudioMixEngine` · parallel meter graph  
- PlayerProvider · E3 `mix-graph` · MixPanel as Studio meter source  
- Automation · buses · sends · sidechain · advanced routing  
- Limiter rewrite  
- Autosave · undo/redo · project versioning · H2 full CAS retrofit  
- Clip fades engine apply  
- Take preview fixes  
- Export / render redesign  
- **P6.5 Scenario B visibility/CDP recovery** (must not chase P6.5 GREEN)  
- **P6.4.4 residual Master FX UI polish reopen**  
- New tables / columns / migrations / RPC / REST  
- Global bottom-nav redesign  

---

## 6. Architecture

| Decision | Freeze |
|----------|--------|
| Product slice | **On-demand Track Peak Metering** |
| Engine | **Exactly one** `StudioAudioEngine` per Studio editor |
| Master analyser | **Exactly one** (P6.5) — **unchanged** |
| Track analyser | **At most one** active; **zero** when no selection |
| DSP | Web Audio **`AnalyserNode` only** — no AudioWorklet |
| Second engines | **FORBIDDEN** |
| Boundaries | **FORBIDDEN:** PlayerProvider, E3 Mix, `mix-graph`, `MixPanel` imports into Studio metering |
| UI ownership | React receives **snapshots** only — never `AudioNode` / `AnalyserNode` |
| Peak math | **Shared** `studio-meter.ts` — no duplicate Peak implementation |
| UI pattern | REUSE Master meter presentation pattern (shared component **or** thin Track wrapper) — no new visual language |

### Forbidden names / shapes

`TrackMeteringEngine` · `StudioAnalyzerEngine` · second `AudioContext` · always-on per-track rAF loops · E3 `getMeterReading` import.

### Illustrative engine API (names may be idiomatic; fields frozen)

```text
setTrackMeterTarget(trackId: string | null)
subscribeTrackMeter(listener) | getTrackMeterSnapshot()
inspectTrackMeterTopology()   // test/diagnostics only
```

---

## 7. Audio Graph

### Current (P6.5 production)

```text
Clip → Track FX → Track Gain → Track Pan → Σ (masterInput)
  → Master FX → Master Gain → Master Pan → Master Analyser → Destination
```

### P6.6 (frozen)

**Selected track:**

```text
Clip → Track FX → Track Gain → Track Pan → Track Analyser → Σ (masterInput)
  → Master FX → Master Gain → Master Pan → Master Analyser → Destination
```

**Unselected tracks:**

```text
… → Track Pan → Σ (masterInput)     // no Track analyser
```

| Rule | Freeze |
|------|--------|
| Track insert | **After** Track Pan, **before** Σ |
| Master insert | **Unchanged** — after Master Pan, before Destination |
| Topology | Series pass-through · observe-only |
| Parallel graph | **FORBIDDEN** |
| Gain/Pan/Mute/Solo/FX semantics | **Unchanged** |
| Take preview path | **Unchanged** · not a Track-meter target |
| Max AnalyserNodes | **≤2** (1 Master + 0..1 Track) |

---

## 8. Track Selection Lifecycle

| Event | Freeze |
|-------|--------|
| Select Track A | Activate analyser on A only (0→1 or move) |
| Select Track B while A active | Dispose/disconnect A · activate B · **never** A+B simultaneous |
| Clear selection / no selected track | **Zero** Track analysers · restore `pan → masterInput` |
| Track removed while metered | Dispose Track analyser · clear target · no leak |
| Project / document change | Clear Track meter target · dispose Track analyser |
| Graph rebuild / FX sync | Reconnect **at most one** Track analyser; never duplicate |
| Engine dispose | Stop Track reader · disconnect/dispose Track analyser with engine |

Selection is **runtime UI/engine state only** — **not** persisted.

---

## 9. Metering Contract

REUSE P6.5 / `studio-meter.ts`:

| Item | Freeze |
|------|--------|
| Peak | Sample peak linear `0…1` (`samplePeakFromTimeDomain`) |
| Display | Optional dBFS via `peakToDbFs` / same floor |
| Clipping | Same latch rules as Master (`peak >= 1.0`, latch **1500 ms**, Stop clears) if Track clip UI is shown |
| Snapshot | Runtime-only; same field shape as Master (`peak`, `clipping`, timestamp) |
| Emit rate | **≤15 Hz** (prefer existing `STUDIO_METER_HZ` = 12) |
| fftSize | Prefer **256** (same as Master) |
| Spectrum | **OUT** |
| LUFS / True Peak | **OUT** |

UI must not invent a second Peak algorithm.

---

## 10. Master Meter Preservation

P6.6 **MUST NOT**:

- change Master analyser topology  
- add a second Master analyser  
- change Master reader lifecycle / Stop / clip latch semantics  
- change Master UI labels / Peak meaning  
- regress Master Scenario A–style Live Peak behavior  

Regression suite must keep P6.5 Master meter tests green.

---

## 11. Visibility Lifecycle

| Rule | Freeze |
|------|--------|
| Mechanism | **REUSE** existing `setMeterDocumentHidden` / transport `visibilitychange` |
| Track reader | Pause emits when document hidden; resume when visible **if** metering active — **without** new AudioContext/analyser |
| New visibility system | **FORBIDDEN** |
| P6.5 Scenario B CDP campaigns | **FORBIDDEN** in P6.6 |
| P6.5 GREEN chase | **FORBIDDEN** |

P6.5 Scenario B remains **BLOCKED / INCONCLUSIVE** — outside this freeze.

---

## 12. Data / API / CAS

```text
NO new tables
NO new columns
NO migrations
NO REST endpoints
NO RPC
NO document_version bumps for meter/selection
NO CAS interactions for meters
```

Track Peak, Track clip latch, and Track selection are **runtime-only**.

Existing FX / Master mix / Track control CAS paths remain unchanged.

---

## 13. Security

| Surface | Freeze |
|---------|--------|
| New HTTP / DB | **None** |
| AuthZ | Existing Studio project ownership only |
| Unauthenticated | Existing Studio API behavior unchanged |
| Owner | Metering only inside already-authorized Studio session |
| Non-owner | No new surface; existing deny paths unchanged |
| RLS | **Unchanged** |
| New auth helpers | **Do not add** unless proven necessary (default: none) |

Production Gate: re-smoke existing unauth / owner / cross-user baselines as **regression**, not new surface design.

---

## 14. Desktop UX

Integrate into existing Mix Track row/card — **no new page / full-screen panel**.

Preferred Track Mix composition (selected track):

```text
Track name
  → Mute / Solo
  → Gain
  → Pan
  → Peak Meter (on-demand)
  → FX entry (existing)
```

| Rule | Freeze |
|------|--------|
| Unselected tracks | **No** persistent Track Peak meter UI (or neutral/hidden — freeze preference: **no always-visible N meters**) |
| Selection | Visually unambiguous which track is metered |
| Visual language | Match Master Meter pattern |
| Transport | Sticky transport remains reachable |

---

## 15. Mobile UX

| Rule | Freeze |
|------|--------|
| Target | **~390 px** |
| Overflow | **No** horizontal overflow |
| Touch | Track selection works · interactive targets **≥44 px** |
| Transport | Play/Pause/Stop remain reachable |
| Bottom nav | **No** global redesign; must not cover critical Track controls |
| Safe-area | Reuse P6.4.3 scroll-padding / sheet patterns |
| Always-on meters | **FORBIDDEN** |

Desktop-only Track meters: **FORBIDDEN**.

---

## 16. Performance Budgets

| Budget | Freeze |
|--------|--------|
| Track analysers | **≤1** |
| Master analysers | **1** |
| Total analysers | **≤2** |
| Track UI emit | **≤15 Hz** |
| Master UI emit | Existing P6.5 limits |
| React | No `setState` every animation frame from meter rAF |
| Background | Pause Track meter emits with existing visibility pause |
| Stopped | Prefer no hot Track polling when transport stopped (align with Master Stop/neutral policy) |

---

## 17. Lifecycle / Dispose

| Event | Freeze |
|-------|--------|
| Play / Pause / Stop | Track reader follows engine metering activity policy (emit while useful; Stop → Track Peak neutral / clear latch if shown) |
| Visibility | §11 |
| Selection change | §8 |
| FX / graph rebuild | Reconnect ≤1 Track analyser; assert no duplicates |
| Track deletion | Dispose Track analyser |
| Project switch / editor unmount / engine dispose | Stop Track reader · dispose Track analyser · unsubscribe UI |
| Leak | **Forbidden** — orphaned analysers, timers, or listeners |

Diagnostics: implementation SHOULD expose inspect helpers for tests (topology: pan → trackAnalyser → masterInput; analyser count).

---

## 18. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| **ARCH-01** | Exactly one `StudioAudioEngine` per Studio editor lifecycle |
| **ARCH-02** | No second `AudioContext` created for Track metering |
| **ARCH-03** | Max **one** Track `AnalyserNode` active at any time |
| **ARCH-04** | Track analyser active only for the currently selected Track |
| **ARCH-05** | Selection A→B disposes/disconnects A and activates B (never both) |
| **ARCH-06** | No selection ⇒ **zero** Track analysers |
| **ARCH-07** | Track analyser topology: after Track Pan, before Σ |
| **ARCH-08** | Master analyser remains after Master Pan, before Destination |
| **ARCH-09** | Track Peak uses shared `studio-meter.ts` semantics (no duplicate Peak math) |
| **ARCH-10** | Track reader emit ≤15 Hz |
| **ARCH-11** | No per-frame React state storm from metering |
| **ARCH-12** | Visibility pause/resume reuses existing Studio lifecycle (`setMeterDocumentHidden` / transport) |
| **ARCH-13** | Dispose / project change / track removal cannot leak Track analyser or reader |
| **ARCH-14** | Graph reconnect cannot duplicate Track analyser |
| **ARCH-15** | No DB / API / RPC / CAS / `document_version` changes for meters |
| **ARCH-16** | Existing security boundaries unchanged (unauth / owner / non-owner) |
| **ARCH-17** | Desktop Mix UX: selected Track shows Peak meter in Mix row/card |
| **ARCH-18** | Mobile ~390: usable Track selection + meter; no horizontal overflow |
| **ARCH-19** | Interactive targets ≥44 px |
| **ARCH-20** | Transport remains reachable (sticky Play/Pause/Stop) |
| **ARCH-21** | Master meter behavior unchanged (topology + Peak semantics + regression) |
| **ARCH-22** | No LUFS / True Peak / Spectrum / AudioWorklet |
| **ARCH-23** | No always-on N-track metering |
| **ARCH-24** | P6.5 visibility/CDP issue remains outside scope (Scenario B stays BLOCKED/INCONCLUSIVE) |
| **ARCH-25** | P6.4.4 residual remains outside scope |
| **ARCH-26** | Isolation: no PlayerProvider / `mix-graph` / `StudioMixEngine` / `MeteringEngine` in P6.6 surface |
| **ARCH-27** | Regression: P6.1 · P6.2 · P6.3 · P6.4.1 · P6.4.2 · P6.4.3 · P6.5 automated suites PASS + typecheck/build/scoped lint |
| **ARCH-28** | Runtime regression: Track Mute/Solo/Gain/Pan/FX · Master Gain/Pan/FX · Transport Play/Pause/Stop/Seek · Master Meter |
| **ARCH-29** | Production-style evidence for Track Peak: timeline Play with real signal → selected Track Peak ≠ neutral (playhead>0 + Peak response); false GREEN forbidden |

**Acceptance criteria count:** **29** (ARCH-01…ARCH-29).

---

## 19. Implementation Phases

Frozen order — **do not implement in this docs step**:

| Phase | Deliverable |
|-------|-------------|
| **P6.6.1** | Engine: Track analyser lifecycle · `setTrackMeterTarget` · reconnect/dispose invariants · shared meter reader wiring |
| **P6.6.2** | UI: selected Track Mix Peak meter · selection binding · desktop + ~390 · a11y |
| **P6.6.3** | Tests + regression (P6.1–P6.5) + mobile checks + Production Gate (ARCH-29 style evidence; **no** P6.5 Scenario B CDP campaign) |

Rationale: engine invariants first (analyser count/topology), then UI, then Gate — matches REUSE of P6.5 Master meter delivery order and keeps Master regression hard to break.

---

## 20. Risks

| Level | Risk | Freeze mitigation |
|-------|------|-------------------|
| HIGH | Always-on N-track metres creep | Hard cap = 1 Track analyser |
| HIGH | Second engine / parallel graph | Forbidden names + isolation tests |
| HIGH | Reopening P6.5 Scenario B | Explicit §22 OUT |
| MEDIUM | Graph rebuild duplicates analyser | ARCH-14 + inspect tests |
| MEDIUM | Selection thrash leaks nodes | ARCH-05/06/13 |
| MEDIUM | Master Peak regression | ARCH-21 + P6.5 suite |
| LOW | Clip fades still unused | Documented Non-Goal |
| LOW | TAKE preview still stopMetering | Pre-existing OUT |

---

## 21. Rollback / Failure Boundaries

| Boundary | Rule |
|----------|------|
| Failed Gate | Do **not** claim PRODUCTION VERIFIED — GREEN |
| Partial ship | Prefer ship only after ARCH-01…29 Gate plan; do not leave dual Track analysers in production |
| Rollback | Revert app deploy; no DB rollback needed (no schema) |
| WIP / unrelated | Preserve unrelated local WIP; no `git clean` / stash of foreign work |
| Scope failure | If implementation drifts into LUFS/automation/DB — **stop** and reopen freeze |

---

## 22. P6.5 Boundary

| Item | Freeze |
|------|--------|
| P6.5 Master Meter | **Preserved** |
| P6.5 Scenario A | Proven — may inform Gate style for Track Peak |
| P6.5 Scenario B | **BLOCKED / INCONCLUSIVE** — **not reopened** |
| P6.5 GREEN chase | **FORBIDDEN** in P6.6 |
| New visibility CDP campaigns for P6.5 | **FORBIDDEN** |
| Visibility wiring for Track meter | REUSE only |

---

## 23. P6.4.4 Boundary

| Item | Freeze |
|------|--------|
| Historical P6.4.4 “Master FX UI” | Absorbed by P6.4.2/P6.4.3 · **orthogonal** |
| Reopen P6.4.4 as part of P6.6 | **FORBIDDEN** |
| Master FX sheet polish debt | Outside P6.6 |

---

## 24. Final Design Freeze Decision

```text
P6.6 DESIGN FREEZE: GO
```

Architecture Audit conditions are **resolved and frozen**.  
Implementation may proceed **only after Owner/Architect confirmation**, in phases P6.6.1 → P6.6.3, without expanding Non-Goals.

---

## 25. Implementation Authorization

```text
P6.6 DESIGN FREEZE: GO

P6.6 IMPLEMENTATION:
AUTHORIZED ONLY AFTER OWNER/ARCHITECT CONFIRMATION
```

**Do not auto-start implementation from this document alone.**  
**Do not deploy.**  
**Do not mutate production DB.**  
**Do not reopen P6.5 Scenario B or P6.4.4.**

---

## Next Step

```text
Owner/Architect confirmation
  → P6.6.1 Engine Track analyser lifecycle
  → P6.6.2 Track meter UI
  → P6.6.3 Regression + Production Gate
  → docs: reconcile SSOT after P6.6 production verification
```

**Do not implement in this step.**
