# P6.7 Studio Clip Fades — Architecture Audit

> **LIVING STATUS (2026-10-07):** **P6.7 = PRODUCTION VERIFIED / GREEN · CLOSED** @ app `06c60b5` · docs tip `e136558`.  
> Do **not** re-audit as “next unit” or reimplement. Historical audit text below is preserved.

**Status (historical):** ARCHITECTURE AUDIT — **GO WITH CONDITIONS** · **CLOSED BY DESIGN FREEZE + IMPLEMENTATION**  
**Date:** 2026-10-07  
**Freeze:** [P6_7_CLIP_FADES_DESIGN_FREEZE.md](../decisions/P6_7_CLIP_FADES_DESIGN_FREEZE.md) · **GO** · living impl **GREEN**  
**Type (historical):** AUDIT ONLY at authoring  

**Repository HEAD / origin/main (SSOT tip at audit):** `cb4f930e63f7b0caae0b24e963ffdae6a536e389` (`cb4f930`)  
**Production application SHA (at audit):** `c825e422111e69350abfb4bebbb38eb5d4707a8e` (`c825e42`)  
**Living production application SHA:** `06c60b5` — **P6.7 GREEN**  
**Baseline unit (at audit):** **P6.6 On-demand Track Peak Metering — PRODUCTION VERIFIED — GREEN**  
**Prior SSOT reconcile:** `cb4f930` — [CHANGELOG](../CHANGELOG.md)  
**Prior metering freeze:** [P6_6_STUDIO_TRACK_METERING_DESIGN_FREEZE.md](../decisions/P6_6_STUDIO_TRACK_METERING_DESIGN_FREEZE.md)  
**Prior metering audit:** [P6_6_STUDIO_ARCHITECTURE_AUDIT.md](./P6_6_STUDIO_ARCHITECTURE_AUDIT.md)  
**Engine freeze:** [P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md](../decisions/P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md)  
**Post-engine audit:** [P5_11_STUDIO_POST_AUDIO_ENGINE_ARCHITECTURE_AUDIT.md](./P5_11_STUDIO_POST_AUDIO_ENGINE_ARCHITECTURE_AUDIT.md)  
**Parent Mix/FX freeze:** [P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md](../decisions/P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md)

```text
P6.7 ARCHITECTURE: GO WITH CONDITIONS (historical)
P6.7 DESIGN FREEZE: GO (historical)
P6.7 LIVING: PRODUCTION VERIFIED — GREEN · CLOSED @ 06c60b5
P6.6: PRODUCTION VERIFIED — GREEN (do not reopen)
P6.5 SCENARIO B: BLOCKED / INCONCLUSIVE (do not reopen)
```

---

## 1. Executive Summary

This audit reconstructs **what the next Studio unit should be** from living SSOT and the Studio codebase — it does **not** invent a feature and does **not** authorize implementation.

| Question | Audit answer |
|----------|----------------|
| What is the next planned stage? | Living SSOT says **NEXT ARCHITECTURE AUDIT / formal next Studio unit definition** — not a pre-named epic |
| Strongest SSOT-backed candidate? | **P6.7 — Clip Fades** (`fadeInMs` / `fadeOutMs` apply on existing clip `GainNode`) |
| Why? | P5.10 Design Freeze **SHOULD**; P5.11 + P6.6 audits list as known gap / #1 Owner alternative after metering; schema + DTO + engine document fields exist; larger leftovers remain **NOT READY** |
| Second engine? | **FORBIDDEN** |
| New DB tables? | **NO** — columns already exist |
| New API? | **LIKELY YES (CONDITION)** — no write path for fades today; geometry PATCH does not accept fade fields |
| CAS / `documentVersion`? | **CONDITION** — clip geometry writes today do **not** bump `document_version`; Design Freeze must lock policy |
| Fix P6.5 Scenario B? | **OUT** — remains **BLOCKED / INCONCLUSIVE** |
| Reopen P6.6? | **FORBIDDEN** |
| Ready for Design Freeze? | **YES, with conditions** |
| Ready to implement? | **NO** — **NOT AUTHORIZED** |

**Verdict:** Current architecture can host clip fades without a fundamental rebuild. Insertion point is the existing per-voice clip `GainNode`. Competing candidates (automation, buses, autosave, P7, punch, reopen P6.4.4 / P6.5 B / P6.6) are weaker or forbidden. Design Freeze must lock apply semantics, write/CAS policy, UI, and Non-Goals before any code.

---

## 2. Canonical Baseline

| Layer | Value |
|-------|--------|
| Production URL | https://www.bitrymdym.pl |
| App SHA | `c825e42` |
| Deployment | `dpl_3s3fAnvrpNVSwJcdhV8J1SZtc9g9` |
| Served Studio chunk | `3_efrbzvmc1dc.js` |
| SSOT tip | `cb4f930` |
| Vitest | **1410 PASS · 1 SKIP · 0 FAIL** |
| P6.1–P6.4.3 | **PRODUCTION VERIFIED — GREEN** |
| P6.5 | Master metering **SHIPPED** · Scenario A **PROVEN** · Scenario B **BLOCKED / INCONCLUSIVE** |
| P6.6 | **PRODUCTION VERIFIED — GREEN** · P6.6.1 `a8a3337` · P6.6.2/3 `c825e42` |
| Engine | One `StudioAudioEngine` / editor · one `AudioContext` |
| Isolation | `StudioTransport != PlayerProvider` · engine ≠ E3 `mix-graph` · no `StudioMixEngine` · no separate `MeteringEngine` |

### Living NEXT (before this audit)

```text
NEXT GATE / NEXT UNIT = NEXT ARCHITECTURE AUDIT (Owner/Architect)
                      · do NOT auto-start implementation
                      · do NOT reopen P6.6 / P6.5 Scenario B / P6.4.4
```

Sources: [PROJECT_STATE.md](../PROJECT_STATE.md) · [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) · [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md) · [CHANGELOG.md](../CHANGELOG.md).

---

## 3. How the next unit was identified (SSOT FIRST — no invention)

### 3.1 Living SSOT does not pre-name P6.7

After P6.6 GREEN reconcile, living docs intentionally stop at **Architecture Audit / formal next unit definition**. They **forbid** reopening:

- P6.6.1 / P6.6.2 / P6.6.3  
- P6.5 Scenario B  
- P6.4.4 residual  

They also forbid auto-start of **P7**, automation, buses, punch, samples.

### 3.2 Ranking from prior audits (evidence chain)

| Source | Statement |
|--------|-----------|
| P5.10 Design Freeze | Clip fades fields exist; **SHOULD** apply as gain automation on clip voice if cheap; **not** a P6 automation system; if deferred = known gap; **must not invent a second fade model later** |
| P5.11 Architecture Audit | Fades persisted, **not** applied on clip GainNode; SHOULD apply **or** defer to automation freeze (**single model**) |
| P6 Mix/FX Design Freeze | “Clip fades still unused — do not invent a second fade model in FX” |
| P6.6 Architecture Audit | Orthogonal to metering; if Owner rejects Track metering, next formal audits could target **(1) Clip fades** then **(2) Mix polish**; do not combine fades into P6.6 freeze |
| P6.6 Design Freeze | Non-Goal: “Clip fades engine apply” |
| Living PROJECT_STATE | Automation / Autotune = **NOT READY**; P7 = capabilities + engines **NOT READY**; autosave gated by H2 |

### 3.3 Competing candidates — rejected as next unit

| Candidate | Status | Why not next |
|-----------|--------|--------------|
| Reopen P6.6 | **CLOSED GREEN** | Forbidden |
| P6.5 Scenario B | **BLOCKED / INCONCLUSIVE** | Forbidden reopen; not a product blocker for fades |
| P6.4.4 Master FX polish | Absorbed / orthogonal | Explicitly do not reopen |
| Always-on N Track meters / LUFS / spectrum | OUT of P6.5/P6.6 | Scope creep |
| Automation lanes | **NOT READY** | Needs AudioParam curve + lane model (+ H2 if persisted) |
| Buses / sends / sidechain | **NOT READY** | `outputRoute` Master-only |
| Autosave | **OPEN H2** | `document_version` not frozen as autosave contract |
| P7 samples / instruments / pitch / stretch | Engines **NOT READY** | Needs H1 Track Type + Capabilities freeze first |
| Punch / pre-roll / count-in / metronome | Deferred recording UX | Explicitly not auto-start |
| Residual Mix polish (bottom-nav) | Polish debt | Valid later; weaker product slice than closing known engine gap |

### 3.4 Naming

```text
P6.7 = Studio Clip Fades
     = apply existing fadeInMs / fadeOutMs on clip voice GainNode
     = complete P5.10 SHOULD / P5.11 known gap
     ≠ automation lanes
     ≠ P7 creative engines
```

Living P6 sequence already redefined historical parent §35 labels (P6.5 metering, P6.6 Track Peak). **P6.7** continues that living numbering for a small engine-adjacent completeness slice **before** P7 expansion.

---

## 4. Current State (after P6.6)

### 4.1 Product stack

```text
Studio editor (Mix UX + Master Meter + selected Track Meter)
  → document (tracks / clips / master / FX / documentVersion)
  → StudioTransportProvider
  → StudioAudioEngine (one context)
  → Web Audio graph = audible mix SSOT

Isolated (must stay isolated):
  PlayerProvider · StickyMiniPlayer · E3 MixPanel · mix-graph.ts
```

### 4.2 Audio graph (canonical)

```text
Voice / Clip (MediaElementSource)
  → Clip Gain                    ← fade target (today: static clipGraphGain only)
  → Track input
  → Track FX[]                   (optional)
  → Track Gain
  → Track Pan
  → [0|1 selected Track Analyser]  (P6.6)
  → Σ masterInput
  → Master FX[]
  → Master Gain
  → Master Pan
  → Master Analyser              (P6.5)
  → Destination
```

Invariants (unchanged by this candidate):

- 1 `StudioAudioEngine` · 1 `AudioContext`
- ≤1 Track Analyser · ≤1 Master Analyser
- shared `studio-meter` + shared meter reader
- selected Track only · no always-on N Track analysers

### 4.3 Clip fades today

| Layer | Reality |
|-------|---------|
| DB | `studio_clips.fade_in_ms` / `fade_out_ms` · `NOT NULL DEFAULT 0` · `CHECK >= 0` |
| DTO | `StudioClipDto.fadeInMs` / `fadeOutMs` |
| Engine document | `StudioEngineClip` carries fields |
| Engine apply | **NO** — `clipGraphGain` uses only `gainDb` / `muted`; voice sets `clipGain.gain.value` statically |
| UI edit | **NO** — `ClipEditPanel` = move / trim / split / delete only |
| API write | **NO** — clip PATCH = geometry ops only |
| Create / split | Defaults / partial copy; no product fade editor |

---

## 5. Target State (P6.7 candidate)

### IN (recommended)

| Item | Rule |
|------|------|
| Apply fades | Use existing `fadeInMs` / `fadeOutMs` on **clip voice `GainNode`** during timeline Play |
| Topology | **No new AudioContext** · no second engine · no change to Track/Master FX/meter topology |
| Persistence model | **Reuse** existing columns / DTO fields |
| Product edit (recommended) | Minimal UI + mutation so fades are not DB-only stubs |
| Caps | Design Freeze must lock `fadeInMs`/`fadeOutMs` vs `durationMs` (overlap / clamp) |
| Seek / pause / stop | Recompute or cancel ramps safely on transport transitions |
| Mobile ~390 | Fade edit usable; transport reachable; ≥44px |
| Security | Existing project ownership / AuthZ |
| Tests | Engine ramp/seek contracts + API validation + Mix/meter regression |
| Gate | Production evidence: non-zero fade audible/observable under Play · Stop safe · Track/Master meters still work |

### OUT (recommended)

| Item | Why |
|------|-----|
| Automation lanes / envelopes | Separate later freeze |
| Second fade model under FX | Forbidden by P5.10 / P6 Mix freeze |
| Pitch / stretch / reverse / loop | P7 |
| Buses / sends / sidechain | Later |
| Autosave | H2 |
| LUFS / True Peak / spectrum / AudioWorklet | OUT of metering units; still OUT |
| Always-on N Track analysers | P6.6 Non-Goal remains |
| P6.5 Scenario B CDP campaign | Remains BLOCKED / INCONCLUSIVE |
| Reopen P6.6.1–P6.6.3 | Closed GREEN |
| Reopen P6.4.4 | Forbidden |
| PlayerProvider / E3 mix-graph / StudioMixEngine | Isolation |
| New tables / Storage / RPC | Unjustified for this gap |
| Wet Take preview rewrite | Out unless Freeze explicitly includes preview path policy |

---

## 6. Gap Analysis

| Need | Have today | Gap |
|------|------------|-----|
| Persist fade values | Columns + DTO + read path | Write API + UI |
| Apply on playback | Per-clip `GainNode` | Schedule ramps vs timeline / playhead |
| Combine with clip gain/mute | `clipGraphGain` | Multiply / compose with fade envelope |
| Transport transitions | Play/Pause/Stop/Seek | Cancel/rebuild ramps on seek & stop |
| Split semantics | Split copies `fade_out_ms` on right; left keeps original | Freeze must define left/right fade inheritance |
| Versioning | FX/Master CAS exist | Clip geometry / fade writes **do not** bump `document_version` today |
| Metering coexistence | P6.5/P6.6 meters after Track/Master Pan | Fades before Track input — meters should still reflect post-fade audible level (CONDITION: confirm expected meter meaning) |

---

## 7. Architecture Fit

```text
Fundamental rebuild required?  NO
Second StudioAudioEngine?      FORBIDDEN / unnecessary
Second AudioContext?           FORBIDDEN / unnecessary
E3 mix-graph reuse?            FORBIDDEN
New MeteringEngine?            FORBIDDEN / unnecessary
Fits existing graph?           YES — clip GainNode is the natural insert
```

P6.7 is a **completion of a deferred P5.10 SHOULD** on infrastructure that already exists. It does not reopen Mix UX productization, metering Option C, or P7 expansion.

---

## 8. Data Model

| Question | Answer |
|----------|--------|
| New tables? | **NO** |
| New columns? | **NO** (already `fade_in_ms` / `fade_out_ms`) |
| DTO changes? | Likely none for fields; maybe validation helpers |
| Migration? | **NO** for recommended scope |

**CONDITION:** Design Freeze must define validation:

- integers ms ≥ 0  
- relationship to `durationMs` (e.g. `fadeIn + fadeOut ≤ duration` or clamp)  
- interaction with trim/split  

---

## 9. API

| Question | Answer |
|----------|--------|
| Existing clip PATCH sufficient? | **NO** for product fades — geometry-only today |
| New endpoint required? | **Not necessarily** — can extend clip PATCH with fade op(s) **or** dedicated fade mutation |
| AuthZ | Reuse ownership via existing studio service helpers |
| Unauth | Expect 401 baseline unchanged |

**CONDITION:** Design Freeze must choose **one** mutation shape (extend geometry route vs new op) and response shape (`documentVersion` policy — see §10).

Engine-only apply of always-zero defaults would be architecturally incomplete as a product unit (gap remains invisible). Recommended IN includes a minimal write path.

---

## 10. CAS / Concurrency

| Surface today | `document_version` |
|---------------|--------------------|
| Track controls / Master gain-pan / FX chains | Bump + CAS (as applicable) |
| Clip geometry / split / delete | **No bump observed** |

**CONDITION (before Design Freeze):**

1. Decide whether fade writes **must** bump `document_version` and use `expectedDocumentVersion` (align with Mix/FX CAS culture), **or** explicitly remain geometry-class non-CAS with documented rationale.  
2. Do **not** silently invent full autosave / H2 clip CAS retrofit in P6.7.  
3. If CAS is chosen, UI must apply returned version before subsequent FX CAS (same lesson as P6.4.1).

This is a **CONDITION**, not a BLOCKER for architecture fit — either policy can be frozen, but **must** be explicit.

---

## 11. Audio Topology

Recommended apply path:

```text
Voice → Clip Gain (base clipGraphGain × fade envelope) → Track input → …
```

| Change | Required? |
|--------|-----------|
| New nodes per clip beyond existing GainNode | **NO** (prefer `AudioParam` ramps on existing gain) |
| Move Track/Master analysers | **NO** |
| Change Σ / Master FX order | **NO** |
| Touch meter reader Hz | **NO** |

**RISK / CONDITION:** Seek into mid-fade and Pause/Resume must not leave gain stuck at envelope mid-point incorrectly. Design Freeze must specify cancel/rebuild rules.

---

## 12. Engine

| Question | Answer |
|----------|--------|
| Changes to `StudioAudioEngine`? | **YES** — apply envelope when starting/syncing voices |
| Changes to `studio-audio-schedule`? | Likely — schedule helpers for fade windows vs playhead |
| New engine class? | **FORBIDDEN** |
| PreviewTake path | **CONDITION** — dry preview currently uses clip gain path; freeze must say fade-on-preview YES/NO |

REUSE:

- `clipGraphGain` / `gainDbToLinearVolume`  
- voice `clipGain` lifecycle in `studio-audio-engine.ts`  
- `planVoicesAtPlayhead`  
- integer ms timeline clock  

---

## 13. UI

| Existing | Extensible? |
|----------|-------------|
| `ClipEditPanel` (move/trim/split/delete) | **YES** — natural home for fadeIn/fadeOut controls |
| Timeline clip chrome | Optional later polish — not required for MVP if panel exists |
| Mix meters / Mix controls | Unchanged |

**CONDITION:** Mobile ~390 — prefer compact numeric/stepper or short sliders; one expanded editor; no horizontal overflow; transport reachable.

Do **not** build a full automation lane UI.

---

## 14. Mobile

| Concern | Assessment |
|---------|------------|
| ~390 px editor | Feasible if fades live in existing clip sheet/panel |
| Extra AudioNodes | None beyond existing clip Gain |
| CPU | Short `linearRampToValueAtTime` / cancel+set — **LOW–MEDIUM** if capped and not per-frame React |
| Gesture conflicts | Avoid competing with timeline drag; commit on pointer up (Mix UX lesson) |

---

## 15. Security

| Concern | Assessment |
|---------|------------|
| Ownership | Existing studio project ownership sufficient |
| Cross-user | Existing deny baseline must remain |
| Unauth | 401 baseline must remain |
| New privilege surface | None if mutation stays under owned project clip routes |

No new Storage / signed URL surface for fades.

---

## 16. Performance

| Risk | Level | Mitigation for Freeze |
|------|-------|------------------------|
| Extra AudioNodes | LOW | Reuse clip GainNode |
| AudioParam ramp storms | MEDIUM | Schedule on voice start / seek only; cancel on stop |
| React state storm | LOW–MEDIUM | Do not mirror envelope to React at 60 Hz |
| Memory | LOW | No decode pipeline change |
| Interaction with meters ≤15 Hz | LOW | Meters remain snapshot readers |

---

## 17. Regression Risks

Most exposed surfaces:

1. Timeline Play with BEAT_REF + TAKE overlap (MIX)  
2. Seek / Pause / Stop playhead 0  
3. Clip trim / split / move after non-zero fades  
4. Track Mute/Solo/Gain/Pan + Master path  
5. P6.2/P6.3 FX rebuilds during document sync  
6. P6.5 Master Meter + P6.6 Track Meter Live Peak  
7. Take preview dry path  
8. Mobile clip edit sheet vs bottom-nav  

P6.5 Scenario B is **not** a regression gate for P6.7.

---

## 18. Risks

### HIGH

| ID | Risk | Classification |
|----|------|----------------|
| H1 | Inventing a second fade/automation model | **CONDITION** — Freeze must say single model = clip GainNode envelope; automation lanes OUT |
| H2 | Seek/pause leaves wrong gain | **CONDITION** — cancel/rebuild rules mandatory |
| H3 | Product unit without write path (engine-only on zeros) | **CONDITION** — include minimal UI+API or Owner explicitly accepts engine-only |

### MEDIUM

| ID | Risk | Classification |
|----|------|----------------|
| M1 | `document_version` policy drift vs FX CAS | **CONDITION** — lock bump/CAS or explicit non-CAS |
| M2 | `fadeIn+fadeOut > durationMs` | **CONDITION** — validate/clamp |
| M3 | Split inheritance surprises | **CONDITION** — define left/right rules |
| M4 | Meter expectation (pre vs post fade) | **RISK** — document expected audible/meter relationship |
| M5 | MediaElement timing vs ramp accuracy | **RISK** — accept “good enough” for MediaElement voices; not sample-accurate automation claim |

### LOW

| ID | Risk | Classification |
|----|------|----------------|
| L1 | Polish-only Mix bottom-nav intercept | OUT / later |
| L2 | Visual fade handles on timeline | OUT of MVP unless Owner expands Freeze |
| L3 | P5.10 TAKE preview fixture limitation | Pre-existing / out-of-scope unless Freeze includes preview |

### Not blockers for this unit

| Item | Why |
|------|-----|
| P6.5 Scenario B | Orthogonal CDP limitation |
| Autosave H2 | Not required to apply/persist fades via explicit commit |
| P7 capabilities H1 | Not required for BEAT_REF/TAKE clip fades |

---

## 19. REUSE FIRST map

| Need | Reuse |
|------|--------|
| Engine | `src/lib/studio/studio-audio-engine.ts` |
| Schedule / clip gain | `src/lib/studio/studio-audio-schedule.ts` (`clipGraphGain`) |
| Types | `src/lib/studio/studio-types.ts` |
| Persist / ownership | `src/lib/studio/studio-service.ts` |
| Clip geometry ops | `src/lib/studio/studio-clip-ops.ts` |
| Clip API | `src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts` |
| Clip UI | `ClipEditPanel` in `src/components/studio/studio-editor.tsx` |
| Gain helper | `gainDbToLinearVolume` (existing SSOT) |
| Meters | Leave P6.5/P6.6 APIs unchanged |
| FX registry / CAS | Unchanged |

**ZERO DUPLICATE LOGIC:** do not add fade helpers inside FX registry, MixPanel, or PlayerProvider.

---

## 20. Recommended implementation phases (for later Freeze — not authorized now)

| Phase | Deliverable |
|-------|-------------|
| **P6.7.0** | Design Freeze (conditions in §22) |
| **P6.7.1** | Engine apply + seek/stop/pause contracts + unit tests |
| **P6.7.2** | Mutation API + validation (+ CAS policy) |
| **P6.7.3** | Clip edit UI (mobile-first) |
| **P6.7.4** | Production Gate |

Do **not** combine with automation lanes, autosave, or P7 in the same freeze.

---

## 21. Architecture Decision

```text
P6.7 ARCHITECTURE: GO WITH CONDITIONS
```

**Not unconditional GO:** Design Freeze must lock apply model, write/CAS policy, validation, transport transitions, UI/mobile, and Non-Goals.

**Not NO-GO:** Schema/DTO/engine insertion point exist; SSOT repeatedly names this gap; competing next units are NOT READY or forbidden; no fundamental rebuild required.

---

## 22. Conditions Before Design Freeze

1. **Owner accepts P6.7 candidate scope** = Studio Clip Fades (`fadeInMs` / `fadeOutMs` on clip voice GainNode).  
2. **Owner accepts** that P6.5 Scenario B remains **BLOCKED / INCONCLUSIVE** and is **OUT**.  
3. **Owner accepts** P6.6 remains **PRODUCTION VERIFIED — GREEN** and is **not** reopened.  
4. Design Freeze must lock:  
   - single fade model on existing clip `GainNode` (no second system)  
   - compose with `clipGraphGain` (`gainDb` / `muted`)  
   - seek / pause / stop / play rebuild rules  
   - validation vs `durationMs` + split inheritance  
   - mutation API shape + **documentVersion / CAS policy**  
   - UI placement (ClipEditPanel or equivalent) · mobile ~390  
   - previewTake fade YES/NO  
   - Production Gate evidence style  
   - Explicit Non-Goals (automation lanes · P7 · buses · autosave · meter rewrite · P6.5 B · P6.6 reopen)  
5. **No implementation** until Owner GO after Design Freeze.

If Owner instead chooses Mix polish, automation, or P7 as the next named unit, **this P6.7 clip-fades audit does not authorize that rename** — a separate audit is required.

---

## 23. P6.7 Authorization State

```text
P6.7 IMPLEMENTATION: NOT AUTHORIZED
DESIGN FREEZE: NOT STARTED
```

This document is architecture discovery only.  
Do **not** start Design Freeze coding.  
Do **not** deploy.  
Do **not** mutate production.  
Do **not** reopen P6.5 / P6.6 / P6.4.4.

---

## Final Decision Block

```text
P6.7 CANDIDATE SCOPE     = Studio Clip Fades (apply fadeInMs / fadeOutMs)
P6.7 ARCHITECTURE        = GO WITH CONDITIONS
DESIGN FREEZE            = NEXT (Owner GO)
IMPLEMENTATION           = NOT AUTHORIZED
PRODUCTION APP           = UNCHANGED (c825e42)
DEPLOYMENT               = UNCHANGED (dpl_3s3fAnvrpNVSwJcdhV8J1SZtc9g9)
P6.6 STATUS              = PRODUCTION VERIFIED — GREEN (unchanged)
P6.5 SCENARIO B          = BLOCKED / INCONCLUSIVE (unchanged)
NEXT AFTER OWNER ACCEPT  = Design Freeze for P6.7 (docs-only) · then Owner GO for code
```
