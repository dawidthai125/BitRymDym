# P6.7 Studio Clip Fades — Design Freeze

> **LIVING STATUS (2026-10-07):** **P6.7 = PRODUCTION VERIFIED / GREEN · CLOSED** @ app `06c60b5` · docs on `origin/main` · dpl `dpl_CpGUtwjDbvXdJ8oEuDyDFjQ1UgNp`.  
> Do **not** reimplement. Historical freeze text below is preserved (authoring-time state).

**Status (historical at freeze):** DESIGN FREEZE — **GO**  
**Date:** 2026-10-07  
**Type (historical):** DESIGN FREEZE ONLY at authoring — implementation later COMPLETE  
**Owner:** Prezes Dawid  
**Architect:** ChatGPT  
**Implementacja:** Cursor Agent (completed P6.7.1→P6.7.4)

**Architecture audit:** [P6_7_CLIP_FADES_ARCHITECTURE_AUDIT.md](../architecture/P6_7_CLIP_FADES_ARCHITECTURE_AUDIT.md) · `edf8fac` · **GO WITH CONDITIONS** (closed by this freeze)  
**Production application (at freeze authoring):** `c825e422111e69350abfb4bebbb38eb5d4707a8e` (`c825e42`) — **P6.6**  
**Living production application:** `06c60b5` — **P6.7 GREEN**  
**SSOT tip at freeze authoring:** `edf8fac`  
**Engine freeze:** [P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md](./P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md)  
**Prior metering:** [P6_6_STUDIO_TRACK_METERING_DESIGN_FREEZE.md](./P6_6_STUDIO_TRACK_METERING_DESIGN_FREEZE.md) · GREEN  
**Parent Mix/FX:** [P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md](./P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md)

```text
P6.7 DESIGN FREEZE: GO (historical)
P6.7 LIVING: PRODUCTION VERIFIED — GREEN · CLOSED @ 06c60b5
P6.6: PRODUCTION VERIFIED — GREEN (do not reopen)
P6.5 SCENARIO B: BLOCKED / INCONCLUSIVE (do not reopen)
```

This freeze **closes** Architecture Audit `GO WITH CONDITIONS` by locking Clip Fades as a **clip runtime property** on the existing clip `GainNode`: `effectiveGain = baseClipGain × fadeEnvelope`, canonical `fadeInMs`/`fadeOutMs` columns, deterministic validation/overlap/trim/split, CAS on fade-affecting writes, Clip PATCH + ClipEditPanel REUSE, mobile ~390, meters unchanged, and explicit Non-Goals (automation lanes, second engine, P7, P6.5 B, P6.6 reopen).

**Naming:** Living **P6.7 = Studio Clip Fades**.

---

## 1. Status

| Item | Value |
|------|--------|
| Decision | **P6.7 DESIGN FREEZE: GO** |
| Scope | Apply + mutate existing clip `fadeInMs` / `fadeOutMs` |
| Engine | Existing `StudioAudioEngine` only · one `AudioContext` |
| DSP home | Existing per-voice **Clip GainNode** |
| Persistence | Existing columns only · **no migration** |
| Implementation | **AUTHORIZED ONLY AFTER OWNER/ARCHITECT CONFIRMATION** — not auto-start |

### Architecture Audit conditions — closed by this freeze

| # | Audit condition | Freeze resolution |
|---|-----------------|-------------------|
| 1 | Owner scope = Clip Fades | **Accepted / frozen** (§3) |
| 2 | Single fade model on clip GainNode | **Frozen** (§6–8) |
| 3 | Compose with `clipGraphGain` | **Frozen** (§8) |
| 4 | Seek/pause/stop rebuild rules | **Frozen** (§11) |
| 5 | Validation vs `durationMs` + overlap | **Frozen** (§9) |
| 6 | Split inheritance | **Frozen** (§14) |
| 7 | Mutation API + CAS policy | **Frozen** (§15–16) |
| 8 | UI / mobile ~390 | **Frozen** (§18–19) |
| 9 | previewTake policy | **Frozen** (§12) |
| 10 | Non-Goals / boundaries | **Frozen** (§5, §22–23) |
| 11 | P6.5 B / P6.6 closed | **Frozen** (§22–23) |

---

## 2. Canonical Baseline

| Layer | Value |
|-------|--------|
| Production URL | https://www.bitrymdym.pl |
| App SHA | `c825e42` |
| Deployment | `dpl_3s3fAnvrpNVSwJcdhV8J1SZtc9g9` |
| Studio chunk | `3_efrbzvmc1dc.js` |
| Audit | `edf8fac` · GO WITH CONDITIONS |
| P6.1–P6.4.3 | PRODUCTION VERIFIED — GREEN |
| P6.5 | Master metering shipped · Scenario A PROVEN · Scenario B **BLOCKED / INCONCLUSIVE** |
| P6.6 | PRODUCTION VERIFIED — GREEN |
| Known limitations | limiter · synthetic IR · delay no BPM · TAKE preview fixture · wave4-live — **unchanged / OUT of fix scope** |

---

## 3. Scope

### IN

| Item | Freeze |
|------|--------|
| Product | Studio Clip Fades — apply `fadeInMs` / `fadeOutMs` on clip voice gain |
| Model | Clip **runtime property** (not automation lane, not FX) |
| DSP | Existing Clip `GainNode` · Web Audio param scheduling |
| Formula | `effectiveGain = baseClipGain × fadeEnvelope` |
| Persist | Existing `studio_clips.fade_in_ms` / `fade_out_ms` ↔ DTO `fadeInMs` / `fadeOutMs` |
| Write | Extend existing Clip PATCH · CAS · `documentVersion` |
| UI | Existing `ClipEditPanel` — Fade In / Fade Out |
| Mobile | ~390 · ≥44px · no horizontal overflow |
| Tests + Gate | Engine/API/UI contracts · regression P6.1–P6.6 |

### OUT

See §5 Non-Goals.

---

## 4. Goals

1. Close the P5.10 / P5.11 known gap: fades persisted but not applied.  
2. Give owners a minimal, mobile-safe way to set fade in/out.  
3. Keep one audio graph and one fade model forever (no second system later).  
4. Align fade writes with Studio CAS culture (`expectedDocumentVersion`).  
5. Leave P6.5/P6.6 metering topology untouched.

---

## 5. Non-Goals (FORBIDDEN in P6.7)

- Automation / automation lanes / Track or Project automation  
- Buses / sends / sidechain / routing changes  
- LUFS / True Peak / spectrum / AudioWorklet  
- New meters / second metering system / always-on N Track analysers  
- Track fades / Master fades  
- P7 (samples / instruments / pitch / stretch / reverse / loop)  
- Autosave / undo-redo / version history product  
- New DB tables / columns / migrations / RPC / Storage  
- Second `StudioAudioEngine` / second `AudioContext`  
- `FadeEngine` / `ClipFadeEngine` / `AutomationEngine` / `StudioMixEngine`  
- E3 `mix-graph` / MixPanel / PlayerProvider changes  
- Reopen P6.6.1–P6.6.3 · P6.5 Scenario B · P6.4.4  
- Full retrofit of **all** historical clip geometry mutations beyond fade-affecting paths defined here  
- Timeline visual fade handles (optional later; not required)

---

## 6. Frozen Architecture

```text
Voice / Clip (MediaElementSource)
  → Clip GainNode     ← ONLY fade apply site (base × envelope)
  → Track input
  → Track FX[]
  → Track Gain
  → Track Pan
  → [0|1 selected Track Analyser]   (P6.6 · UNCHANGED)
  → Σ
  → Master FX[]
  → Master Gain
  → Master Pan
  → Master Analyser                 (P6.5 · UNCHANGED)
  → Destination
```

Invariants:

- 1 `StudioAudioEngine` · 1 `AudioContext`  
- No extra GainNode solely for fade  
- No topology move of analysers / FX / Σ  
- `StudioTransport != PlayerProvider`  
- Engine ≠ E3 Mix  

---

## 7. Canonical Decision — What a Fade Is

```text
FADE = CLIP RUNTIME PROPERTY
    ≠ automation lane
    ≠ Track/Project automation
    ≠ FX registry entry
    ≠ separate AudioNode system
```

REUSE:

- `clipGraphGain` / `gainDbToLinearVolume` for **base** linear gain  
- Existing per-voice Clip `GainNode` for **effective** gain  
- Web Audio `AudioParam` cancel + set + linear ramps for envelope scheduling  

FORBIDDEN names/types: `FadeEngine`, `ClipFadeEngine`, `AutomationEngine`.

---

## 8. Fade Semantics (runtime)

### 8.1 Base gain (persisted, independent)

```text
baseClipGain = clipGraphGain(clip)
             = 0                         if clip.muted
             = gainDbToLinearVolume(clip.gainDb)  otherwise
```

Fade **MUST NOT** persist-modify `gainDb` / `muted` / Track gain / Master gain.

### 8.2 Envelope (local clip time)

Let:

- `D = durationMs` (integer ≥ 0)  
- `Fi`, `Fo` = **normalized** fade lengths (§9)  
- `t` = local position in clip = `playheadMs - timelineStartMs` (integer ms timeline SSOT)

For an active voice with `0 ≤ t < D` and `D > 0`:

```text
if Fi > 0 and t < Fi:
  fadeEnvelope = t / Fi
else if Fo > 0 and t >= (D - Fo):
  fadeEnvelope = (D - t) / Fo
else:
  fadeEnvelope = 1
```

Edge:

- `Fi === 0` → no fade-in region (envelope starts at 1 unless in fade-out)  
- `Fo === 0` → no fade-out region  
- `D === 0` → no audible voice / envelope unused  
- Outside `[0, D)` → voice inactive (existing scheduler rules)

### 8.3 Effective gain

```text
effectiveGain = baseClipGain × fadeEnvelope
```

Examples:

| baseClipGain | fadeEnvelope | effectiveGain |
|--------------|--------------|---------------|
| 0.8 | 0.5 | 0.4 |
| 0 (muted) | any | 0 |
| 1.0 | 1.0 | 1.0 |

**Never** write `effectiveGain` back to `gainDb`.

### 8.4 Curve

Frozen curve family: **linear in amplitude** (linear `AudioParam` ramps).  
Not equal-power crossfade product. Not dB-linear ramps.

---

## 9. Validation & Overlap Rule

### 9.1 Input constraints (API / UI → server)

Before normalize:

- integers (ms)  
- `fadeInMs >= 0`  
- `fadeOutMs >= 0`  
- `fadeInMs <= durationMs`  
- `fadeOutMs <= durationMs`  

Reject with **400** if non-integer / negative / `> durationMs` before normalize is attempted.  
(`NaN` / non-finite → 400.)

### 9.2 Overlap rule (deterministic — FROZEN)

If after accepting bounds:

```text
fadeInMs + fadeOutMs > durationMs
```

**MUST NOT** create a negative plateau or inverted envelope.

**Frozen normalize** (proportional, integer-safe):

```text
function normalizeFades(Fi, Fo, D):
  if D <= 0: return { fadeInMs: 0, fadeOutMs: 0 }
  Fi = clamp(Fi, 0, D)
  Fo = clamp(Fo, 0, D)
  if Fi + Fo <= D: return { fadeInMs: Fi, fadeOutMs: Fo }
  // proportional scale so Fi' + Fo' === D
  const sum = Fi + Fo
  const Fi2 = Math.floor((Fi * D) / sum)
  const Fo2 = D - Fi2
  return { fadeInMs: Fi2, fadeOutMs: Fo2 }
```

Properties:

- `fadeInMs' + fadeOutMs' === D` when overlap existed  
- preserves input ratio as closely as integer math allows  
- `fadeInMs' ≥ 0`, `fadeOutMs' ≥ 0`  
- no undefined behavior  

Server persists **normalized** values. Response returns normalized pair.

### 9.3 Always-valid persisted invariant

For every stored clip:

```text
fadeInMs >= 0
fadeOutMs >= 0
fadeInMs <= durationMs
fadeOutMs <= durationMs
fadeInMs + fadeOutMs <= durationMs   // true after normalize
```

---

## 10. Play / Seek / Pause / Resume / Stop

Frozen transport rules (timeline clock = integer ms SSOT):

| Event | Behavior |
|-------|----------|
| **PLAY** | Cancel prior clip-gain automation on active voices. Set `effectiveGain` for **current** local `t`. Schedule future linear ramps for remaining envelope breakpoints of each active voice. **Do not** restart fade from 0 unless `t === 0` (or inside true fade-in start). |
| **SEEK** | Immediately recompute envelope at new `t`. Cancel scheduled values. `setValue` to `effectiveGain(new t)`. Reschedule forward ramps from new position. |
| **SEEK INTO FADE** | Use mid-fade envelope level — **never** restart that fade from 0. |
| **SEEK OUT OF FADE** | Immediately use plateau or appropriate region level. |
| **PAUSE** | Keep transport paused; leave gain at current effective level (or cancel future ramps and hold current). Do not advance envelope while paused. |
| **RESUME** | Continue from **current** playhead using same rules as PLAY-from-position (not from clip start). |
| **STOP** | Existing StudioAudioEngine STOP semantics (playhead 0). Cancel ramps; voices disposed/stopped per existing engine; gain returns to neutral inactive state. |

Forbidden logic:

```text
"on every Play, always start fadeIn from 0 regardless of playhead"
```

---

## 11. Engine Scheduling Contract

Implementation MUST:

1. Use existing Clip `GainNode.gain` (`AudioParam`).  
2. On sync/start/seek: `cancelScheduledValues` (or equivalent safe cancel) then set current effective value.  
3. Schedule only **future** breakpoints (end of fade-in, start of fade-out, end of clip) via `linearRampToValueAtTime` (or equivalent linear ramp API).  
4. Recompute on document sync when fade fields / geometry / gainDb / mute change.  
5. Per-clip independence for overlapping clips (§13).  

MUST NOT:

- React `setState` at audio rate  
- `requestAnimationFrame` per clip for gain  
- `setInterval` per clip for gain  
- second GainNode “fade bus”

---

## 12. PreviewTake Policy

```text
Timeline voices: fades APPLY (this unit)
Take preview path: if it uses the same Clip GainNode path, APPLY the same envelope
                   using preview clip local time; do NOT redesign preview architecture
Preview remains dry of Track FX / Master FX (P6 foundation — UNCHANGED)
```

No separate preview fade product.

---

## 13. Overlapping Clips

Each clip has its **own** envelope on its **own** Clip GainNode.

```text
Clip A fadeOut  +  Clip B fadeIn  = independent
```

FORBIDDEN: one shared Track-level fade for multiple clips.

Overlap mix remains **MIX** (P5.10) — fades do not change overlap policy.

---

## 14. Trim Behavior

When a geometry op changes `durationMs` to `D2`:

```text
Fi2 = min(fadeInMs, D2)
Fo2 = min(fadeOutMs, D2)
{ fadeInMs, fadeOutMs } = normalizeFades(Fi2, Fo2, D2)
```

Persist clamped/normalized fades with the geometry update when values change.  
Never leave an invalid persisted fade state after trim.

Move-only ops that do not change `durationMs` leave fades unchanged.

---

## 15. Split Behavior (deterministic)

Existing pre-P6.7 code (historical): left geometry shrink; right insert with `fade_in_ms: 0`, `fade_out_ms: original.fade_out_ms`; left fade columns untouched. That is **insufficient** once fades are audible — P6.7 **replaces** split fade inheritance with the rule below.

### 15.1 Inputs

Split at timeline time → local offset `S` where `0 < S < D` (existing `splitClipGeometry` validates geometry).  
Source refs (Take/Beat/Artifact) remain **immutable** (existing rule).

### 15.2 Frozen fade inheritance (local-time)

Let original normalized `(Fi, Fo, D)`. Right duration `Dr = D - S`.

**LEFT** (duration `S`):

```text
fadeIn_L  = min(Fi, S)
fadeOut_L = 0
if S > (D - Fo):                    // split lands inside original fade-out window
  fadeOut_L = min(S - (D - Fo), S)
{ fadeInMs, fadeOutMs } = normalizeFades(fadeIn_L, fadeOut_L, S)
```

**RIGHT** (duration `Dr`):

```text
fadeIn_R  = 0                       // never restart a full fade-in on the right half
fadeOut_R = min(Fo, Dr)             // fade-out portion that can fit on the right
{ fadeInMs, fadeOutMs } = normalizeFades(fadeIn_R, fadeOut_R, Dr)
```

### 15.3 Continuity note (accepted limitation)

With only `fadeInMs`/`fadeOutMs` (envelope always 0↔base from local 0), a split **inside** an active fade-in region cannot perfectly preserve mid-envelope continuity without new schema fields. P6.7 **accepts** possible envelope discontinuity at the cut in that edge case.  
**OUT:** adding fade-start-level columns to fix that.

### 15.4 Non-negotiables

- No double-application of one fade across both clips as a shared Track fade  
- No source mutation  
- Both results must satisfy §9.3 invariants  
- `gainDb` / `muted` copy to right as today  

---

## 16. Persistence

| Item | Freeze |
|------|--------|
| Columns | `fade_in_ms`, `fade_out_ms` — **canonical** |
| DTO | `fadeInMs`, `fadeOutMs` |
| New tables | **NO** |
| New columns | **NO** |
| Migration | **NO** |
| Autosave | **NO** |

---

## 17. CAS / `documentVersion` (binding)

### 17.1 Fade mutation (primary)

Every **fade write** MUST:

```text
expectedDocumentVersion  →  compare to studio_projects.document_version
success                  →  document_version = expected + 1
stale                    →  HTTP 409 · zero mutation
```

### 17.2 Fade-affecting ops in P6.7

| Op | CAS |
|----|-----|
| Clip PATCH `set_fades` | **REQUIRED** `expectedDocumentVersion` |
| Geometry trim that clamps/normalizes fade columns | **REQUIRED** `expectedDocumentVersion` (P6.7 extends these ops) |
| Split (writes fade columns on left/right) | **REQUIRED** `expectedDocumentVersion` |

### 17.3 Explicitly not full H2 retrofit

Move-only / pure geometry that **does not** change fade columns may remain on the pre-P6.7 non-CAS path for this unit.  
P6.7 does **not** open full autosave / H2 clip CAS productization.

### 17.4 Responses

**SUCCESS (200):**

```text
{
  success: true,
  clip: StudioClipDto,          // includes normalized fadeInMs/fadeOutMs
  documentVersion: number       // new version
}
```

Split success MAY return `{ left, right, documentVersion }` with the same CAS rules.

**STALE (409):**

```text
{
  error: <stable conflict code/message family>,
  documentVersion?: number      // optional hint of current server version
}
```

- **No partial mutation**  
- UI MUST NOT treat 409 as success  
- UI MUST refresh/recover (reload document or apply returned version policy) before retry  
- After every success: `doc.project.documentVersion = response.documentVersion` before next CAS write (same lesson as P6.4.1)

---

## 18. API Contract

Prefer existing:

```text
PATCH /api/studio/projects/:projectId/clips/:clipId
```

### 18.1 New / extended op — `set_fades`

```text
Body:
{
  op: "set_fades",
  fadeInMs: number,                 // integer ms
  fadeOutMs: number,                // integer ms
  expectedDocumentVersion: number   // REQUIRED
}
```

Server:

1. AuthZ ownership  
2. Validate integers / bounds (§9.1)  
3. CAS check  
4. `normalizeFades`  
5. Persist + bump version  
6. Return 200 + clip + documentVersion  

No `/fade` endpoint.

### 18.2 Trim / split

Existing ops remain; P6.7 **adds** required `expectedDocumentVersion` when the op will write fade columns (trim duration change, split).  
Validation + normalize per §14–15.

### 18.3 AuthZ (REUSE)

| Actor | Result |
|-------|--------|
| Unauthenticated | **401** |
| Authenticated non-owner | **403** / deny |
| Owner | **200** on success |

REUSE: `requireUser` + existing project ownership asserts.  
No new AuthZ layer.

---

## 19. UI Contract

| Item | Freeze |
|------|--------|
| Surface | Existing **`ClipEditPanel`** only |
| Controls | **Fade In** · **Fade Out** |
| Units | Integer **ms** (display MAY show seconds derived from ms; persist ms) |
| Commit | Explicit commit / blur / pointer-up — **no autosave** |
| 409 | Show conflict · Odśwież / reload recovery — never ignore |
| Version | Apply `documentVersion` from success responses before next CAS |
| A11y | Labels in Polish UI label SSOT style; operable by keyboard |

FORBIDDEN: new global Fade panel, automation lane editor, timeline-only-drag MVP requirement.

---

## 20. Mobile Contract

| Rule | Freeze |
|------|--------|
| Width | Usable at **~390 px** |
| Targets | **≥ 44 px** |
| Overflow | **No horizontal overflow** |
| Transport | Remains reachable |
| Safe area | Respect existing Studio safe-area / bottom-nav lessons |

---

## 21. Meters Contract

| Meter | Freeze |
|-------|--------|
| Track Analyser | **UNCHANGED** (after Track Pan · ≤1 · P6.6) |
| Master Analyser | **UNCHANGED** (after Master Pan · P6.5) |
| Reader Hz | **UNCHANGED** (≤15 Hz) |
| Meaning | Meters observe post-fade audible mix (fade is upstream of Track input) — **no meter rewrite** |

P6.5 Scenario B remains **BLOCKED / INCONCLUSIVE** — OUT.

---

## 22. Performance Contract

- Native Web Audio scheduling only for envelope  
- No React/audio-rate updates  
- No per-clip rAF/timer gain loops  
- Must remain correct with overlapping clips + Play/Seek/Pause/Stop  
- No extra analysers  

---

## 23. Boundaries (do not reopen)

| Item | Status |
|------|--------|
| P6.6 | PRODUCTION VERIFIED — GREEN · **do not reopen** |
| P6.5 Scenario B | BLOCKED / INCONCLUSIVE · **do not reopen** |
| P6.4.4 | Absorbed/orthogonal · **do not reopen** |
| Automation / P7 / buses / autosave | OUT |

---

## 24. Implementation Sequence (after Owner GO — not this step)

| Phase | Deliverable |
|-------|-------------|
| **P6.7.1** | Pure normalize/envelope helpers + engine apply/seek/stop tests |
| **P6.7.2** | Clip PATCH `set_fades` + CAS + trim/split fade writes |
| **P6.7.3** | ClipEditPanel Fade In/Out + 409 recovery · mobile |
| **P6.7.4** | Production Gate |

---

## 25. Production Gate (future)

Minimum evidence after implementation:

1. Set non-zero fadeIn/fadeOut · reload persists normalized values  
2. Play from start → audible/observable fade-in  
3. Seek into fade-in → mid-level, no restart from silence  
4. Seek into fade-out / plateau → correct level  
5. Pause/resume mid-fade → continues from position  
6. Stop → safe neutral  
7. Two overlapping clips with independent fades  
8. Trim shortens → fades clamped/normalized valid  
9. Split → inheritance rule + invariants  
10. CAS success bumps version · stale 409 · no mutation  
11. Unauth 401 · non-owner deny · owner 200  
12. Mobile ~390 · ≥44px · no horizontal overflow  
13. Track Meter + Master Meter still work (P6.5/P6.6 regression)  
14. Automated suite + typecheck + build + scoped lint PASS  

---

## 26. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| **DF-01** | Existing `fadeInMs`/`fadeOutMs` remain canonical |
| **DF-02** | Fade uses existing Clip GainNode |
| **DF-03** | No second engine/context |
| **DF-04** | No new DB table/column |
| **DF-05** | `fadeInMs >= 0` |
| **DF-06** | `fadeOutMs >= 0` |
| **DF-07** | Fade values cannot exceed duration |
| **DF-08** | `fadeIn + fadeOut` overlap has deterministic normalize semantics (§9.2) |
| **DF-09** | Base Clip gain remains independent (not overwritten by effective) |
| **DF-10** | Play applies fade according to current position |
| **DF-11** | Seek recalculates fade immediately |
| **DF-12** | Seek into fade does not restart fade from 0 |
| **DF-13** | Pause/resume preserves correct fade-by-position behavior |
| **DF-14** | Stop resets correctly per existing engine STOP |
| **DF-15** | Overlapping Clips have independent fades |
| **DF-16** | Trim preserves valid fade invariants |
| **DF-17** | Split has deterministic fade inheritance (§15) |
| **DF-18** | Clip source remains immutable |
| **DF-19** | Fade-affecting Clip mutation uses `expectedDocumentVersion` |
| **DF-20** | Success increments `documentVersion` |
| **DF-21** | Stale mutation returns 409 |
| **DF-22** | 409 causes no mutation |
| **DF-23** | Ownership uses existing authz |
| **DF-24** | Unauthenticated = 401 |
| **DF-25** | Non-owner denied |
| **DF-26** | Owner mutation allowed |
| **DF-27** | Existing Clip PATCH reused (`set_fades`) |
| **DF-28** | Existing ClipEditPanel reused |
| **DF-29** | Mobile ~390 supported |
| **DF-30** | ≥44 px controls |
| **DF-31** | No horizontal overflow |
| **DF-32** | Track Meter unchanged |
| **DF-33** | Master Meter unchanged |
| **DF-34** | No React/rAF audio-rate updates |
| **DF-35** | No automation implementation |
| **DF-36** | No second metering system |

**Acceptance criteria count: 36**

---

## 27. Risks Closed by This Freeze

| ID | Risk | Closure |
|----|------|---------|
| H1 | Second fade/automation model | Single model on Clip GainNode · automation OUT |
| H2 | Seek/pause wrong gain | Position-based envelope + cancel/rebuild (§10–11) |
| H3 | Engine-only on zeros | UI + `set_fades` IN |
| M1 | CAS drift | Fade-affecting writes require expectedDocumentVersion |
| M2 | Overlap invert | Proportional normalize (§9.2) |
| M3 | Split surprise | Deterministic local-time inheritance (§15) |
| M4 | Meter rewrite temptation | Meters UNCHANGED (§21) |
| L1 | Mid-fade split discontinuity | Accepted limitation · no new columns |

---

## 28. Final GO / NO-GO

All audit conditions are resolved with implementable contracts. No open Owner business decision remains inside P6.7 scope.

```text
P6.7 DESIGN FREEZE: GO
```

Architecture Audit conditions are **resolved and frozen**.  
Implementation may proceed **only after Owner GO**, in sequence P6.7.1 → P6.7.4.

**Do not implement code in this step.**  
**Do not migrate.**  
**Do not deploy.**

---

## Appendix A — Polish UI labels (defaults)

| Concept | Label |
|---------|--------|
| Fade In | Fade In / Narastanie |
| Fade Out | Fade Out / Zanikanie |
| Milliseconds hint | ms |
| Conflict | Konflikt wersji. Odśwież i spróbuj ponownie. |

(Final copy may align with `src/lib/ui/labels.ts` during implementation without changing contracts.)

---

## Appendix B — normalize reference

```text
normalizeFades(Fi, Fo, D):
  if D <= 0: return (0, 0)
  Fi = clamp(Fi, 0, D); Fo = clamp(Fo, 0, D)
  if Fi + Fo <= D: return (Fi, Fo)
  Fi2 = floor((Fi * D) / (Fi + Fo))
  Fo2 = D - Fi2
  return (Fi2, Fo2)
```

---

*End of P6.7 Clip Fades Design Freeze.*
