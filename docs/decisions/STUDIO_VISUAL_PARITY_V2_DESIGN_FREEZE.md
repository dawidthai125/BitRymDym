# BitRymDym — Studio Visual Parity V2 Design Freeze

**Type:** Design Freeze / SSOT  
**Unit name:** STUDIO VISUAL PARITY V2  
**Not a phase number:** do **not** auto-label as P7.1.7  
**Owner / Architect:** Prezes Dawid  
**Date:** 2026-10-09  
**Status:** **APPROVED / FROZEN — IMPLEMENTATION IN WORKTREE (AWAITING CONTROLLED COMMIT / RELEASE)**

**Design target:** Owner-approved annotated professional DAW visualization (PRIMARY)  
**Baseline production:** `79bc69f9e696c535386901ff9784f00df659c98a` (`79bc69f`) — **production remains V1 Visual Shell until Owner commit + deploy**  
**Deployment:** `dpl_HboxsyYAMfYHnxBf8tWH7LoQCJes` (READY at freeze; **not** V2)  
**Prior freeze:** [STUDIO_VISUAL_SHELL_DESIGN_FREEZE.md](./STUDIO_VISUAL_SHELL_DESIGN_FREEZE.md) (V1)

```text
V1 = historical Visual Shell implementation record (OD-VS-01…05)
V2 = supersedes V1 ONLY as visual target / acceptance contract
V2 ≠ P7.1.7
V2 ≠ new audio / persist / CAS / recording architecture
IMPLEMENTATION = EXISTS IN WORKTREE (Owner IMPLEMENTATION GO granted)
COMMIT / PUSH / DEPLOY = NOT YET AUTHORIZED
LIVE AUTHENTICATED VISUAL VERIFICATION (AC-12) = STILL REQUIRED
MAXIMUM STATUS WITHOUT AC-12 = YELLOW (not GREEN)
PRODUCTION = STILL 79bc69f (V2 NOT DEPLOYED)
```

---

## 1. Scope

**IN:** Presentation / chrome density / empty-state contract on the existing Studio shell, reusing existing mix / transport / inspector / mixer / recording owners.

**OUT:** New Studio product; new audio / persist / CAS / recording systems; Loop / Metronome runtime; pixel-identical asset cloning; DB / Auth / RLS / E3 / Contabo / Catalog changes; Sacred WIP modification; automatic P7.1.7 numbering.

**Goal:** Studio visually reads as a professional DAW per the Owner design target, while preserving BitRymDym architecture.

**Owner GO (2026-10-09):** B (Visual Parity Implementation) + D (Design Freeze Update) + E (scoped pass Studio Visual Parity V2) — freeze write authorized; separate Owner **IMPLEMENTATION GO** granted; implementation exists in worktree and awaits controlled commit / release (production unchanged; AC-12 live verify still required).

---

## 2. Problem Statement

Visual Shell V1 shipped on production (`79bc69f`) with correct architecture and OD-VS contracts, but:

- `noBeat` replaces full transport with a minimal message + „+ Wybierz bit” strip,
- Mixer defaults to collapsed (`mixerOpen = false`),
- static audits passed without authenticated live visual verification,
- Owner rejects current production appearance versus the approved professional DAW visualization.

V2 closes the **visual acceptance gap** without inventing parallel systems.

---

## 3. Design Target

**PRIMARY:** Owner-attached annotated professional Studio DAW visualization.

**Parity means:** professional structure, hierarchy, density, and chrome completeness.

**Parity does not mean:** mandatory pixel-identical iconography, dark-theme clone, or invented fake waveforms.

Existing BitRymDym design tokens (cream / paper / bottle green / existing type stacks) remain the only design system.

---

## 4. Mandatory Visual Requirements

1. Full DAW chrome always: Transport + Toolbar + Timeline + Track headers/lanes + Inspector + Mixer surface.
2. `noBeat` must **not** collapse transport to a minimal strip — structure remains; controls disable; CTA coexists.
3. Transport density toward target: ops cluster · meta (time / BPM / signature) · Master · Save · Export — one sticky bar.
4. Professional DAW visual density (not generic CRUD/editor spacing).
5. Mixer on **xl**: expanded by default (user may collapse).
6. Inspector on **xl**: persistent rail; Settings / Effects / File (/ Record mapping).
7. Loop / Metronome: visually present, disabled placeholders (no runtime).
8. Brand tokens only — no second design system.

---

## 5. Mandatory Functional Requirements

| Control | Functional binding |
|---------|-------------------|
| Play / Pause / Stop | Existing `StudioTransportProvider` |
| Record | Existing path → `StudioRecordingPanel` |
| BPM / signature / time / duration | Existing project fields + playhead |
| Master Volume | Existing `patchMasterMix` / `masterGainDb` |
| Track Vol / Pan / M / S / R | Existing `patchTrack` |
| Export | Existing `/account/takes` deep-link |
| Save status | Existing persist orchestrator / status |
| Loop | **NONE** — visual only / disabled |
| Metronome | **NONE** — visual only / disabled |
| Mixer open / collapse | Existing `mixerOpen` / dock / overlay |

No new features solely to make the UI look fuller.

---

## 6. Empty State Contract

**LOCKED: EMPTY STATE WITH FULL DAW SHELL.**

When no beat is selected (`noBeat` / `!hasBeat` / `audioState === "no_beat"`):

| Surface | Required |
|---------|----------|
| Transport | Full chrome remains |
| Play / Pause / Stop / Record | May be disabled |
| Loop / Metronome | Remain disabled |
| BPM / signature / time / duration | Remain visible |
| Master / Save / Export | Remain visible |
| CTA „+ Wybierz bit” | Visible inside/alongside transport — does **not** replace the bar |
| Toolbar | Remains |
| Timeline + playhead | Remain |
| Tracks | Remain (empty lanes allowed) |
| Inspector | Remains |
| Mixer surface | Remains |

**Forbidden:** Replacing the entire transport with only a status message + button.

**Forbidden:** Inventing fake waveforms / audio for empty state.

---

## 7. Transport Contract

**LOCKED: Option B.**

Full `StudioTransportBar` chrome MUST remain structurally visible even in `noBeat`.

Required visual controls:

- Play · Pause · Stop · Record  
- Loop · Metronome (disabled placeholders)  
- BPM · Time Signature · Current Time · Duration  
- Master Volume · Save · Export  
- Choose Beat CTA („+ Wybierz bit”)

Reuse **only** existing `StudioTransportBar` + `StudioTransportProvider`.

No new transport architecture.

---

## 8. Mixer Contract

**LOCKED: Option C.**

| Viewport | Behavior |
|----------|----------|
| **xl** | Mixer **expanded by default**; user may collapse |
| **&lt;xl** | Existing overlay / sheet + Inspector ↔ Mixer XOR |

Presentation (existing architecture):

- Channel strips: name · selected-track meter (P6.6) · Level · Pan · M/S/R · FX  
- Master: sticky · Level · Pan · FX · meter  

No new audio analysers or audio nodes.  
No new mixer architecture.

---

## 9. Inspector Contract

Desktop **xl:** persistent Inspector rail.

Presentation tabs / mapping:

- Settings  
- Effects  
- File  
- Record mapping  

Reuse existing:

- `deriveStudioInspectorContext`  
- `StudioFxSheet`  
- Clip edit panel  
- `StudioRecordingPanel`  

No new Inspector SSOT / `InspectorTab` store.  
Exactly **one** mounted `StudioRecordingPanel`.

---

## 10. Timeline Contract

Keep: ruler · playhead · seek · selection · clip lanes.

Increase visual density toward the design target.

Do **not** change geometry / CAS architecture.

Waveforms appear only when real clips / sources exist.  
Never invent fake audio to satisfy the visual target.

---

## 11. Track Header Contract

Track headers must expose:

- name · type / BEAT identity  
- M · S · R  
- compact Volume · compact Pan  
- reorder · menu  

Use existing `patchTrack`.  
No new persistence mechanism.

---

## 12. Responsive Contract

| Viewport | Requirement |
|----------|-------------|
| **XL** | Full transport · timeline · persistent Inspector rail · Mixer **expanded by default** |
| **MD / LG** | Full transport · existing overlays / sheets · Inspector / Mixer XOR |
| **SM** | Sticky transport · bottom sheets · toolbar overflow · existing responsive architecture |

No second responsive architecture.

---

## 13. Architecture Locks

| Domain | Frozen owner |
|--------|----------------|
| Audio | One `StudioAudioEngine` · one Studio `AudioContext` · `StudioTransportProvider` |
| Catalog | Catalog `PlayerProvider` remains separate |
| Selection | Existing Studio editor selection SSOT |
| Persistence | `StudioPersistOrchestrator` |
| CAS | Existing CAS · `expectedDocumentVersion` |
| Recording | Existing recording service · existing eligibility service |
| Sacred WIP | `src/lib/takes/recording-eligibility-service.ts` — **untouched** |
| FX | Existing `StudioFxSheet` / `StudioFxChainEditor` |
| Tracks / Clips | Existing persistence |
| Storage | Supabase Storage |
| Auth | Existing Auth / ownership / RLS |
| E3 | Untouched |
| Contabo | Untouched |

No duplicate systems for visual cosmetics.

---

## 14. Out of Scope / Deferred

Explicitly **OUT** (separate Owner decision required):

- Loop runtime · Metronome runtime  
- New AudioEngine · AudioContext · TransportProvider  
- New selection store · persistence system · CAS · recording eligibility  
- New storage architecture  
- E3 · Contabo · Catalog Player changes  
- Auth redesign · RLS redesign · DB migrations  
- New export pipeline  
- Always-on multi-track meters  
- Real Device Audio Certification  
- Pixel-identical asset cloning  
- Automatic P7.1.7 numbering  
- Sacred WIP modifications  

---

## 15. Screenshot Parity Matrix

| # | Area | Screenshot Target | Current Production (`79bc69f`) | V2 Requirement | Mandatory? |
|---|------|-------------------|--------------------------------|----------------|------------|
| 1 | Top Navigation | AppShell brand nav | Existing AppShell | Keep; out of Studio-only redesign | NO (reuse) |
| 2 | Transport | Dense full DAW bar | Full only if beat; else empty strip | Full chrome always; disable in noBeat | **YES** |
| 3 | Edit Toolbar | Compact tools + add + capacity | Present, lighter density | Keep tools; tighten density | **YES** |
| 4 | Timeline Ruler | Clear time marks | Present | Keep + density polish | **YES** |
| 5 | Playhead | Visible vertical | Present | Keep | **YES** |
| 6 | Track Headers | M/S/(R) + Vol + Pan compact | Present when tracks | Keep + density toward target | **YES** |
| 7 | Track Lanes | Tall waveform lanes | Shorter / sparse | Denser lanes; empty OK | **YES** |
| 8 | Waveforms | Colored clips | When clips exist | No fake waveforms | YES (when data) |
| 9 | Inspector | Tabbed rail | Present | Present + presentation polish | **YES** |
| 10 | Mixer | Expanded strips | Default collapsed | xl default expanded | **YES** |
| 11 | Master Channel | Sticky in mixer | Exists when expanded | Sticky Master in expanded mixer | **YES** |
| 12 | Empty State | Implied full shell | Collapsed transport | Full DAW shell + CTA | **YES** |
| 13 | Responsive | Desktop DAW | Existing shells | xl / md / sm contracts above | **YES** |
| 14 | Overall Density | Professional DAW | Editor-like | DAW density; tokens only | **YES** |

---

## 16. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| **AC-01** | Professional DAW visual density and hierarchy match the approved design target |
| **AC-02** | Full transport chrome remains visible in `noBeat` |
| **AC-03** | `noBeat` communicates missing beat without collapsing the DAW shell |
| **AC-04** | Only existing `StudioTransportProvider` is used |
| **AC-05** | No second `AudioContext` or `StudioAudioEngine` |
| **AC-06** | Mixer uses existing architecture and is expanded by default on xl |
| **AC-07** | Inspector uses existing architecture |
| **AC-08** | Persistence / CAS unchanged |
| **AC-09** | Recording architecture unchanged |
| **AC-10** | Sacred WIP fingerprint unchanged |
| **AC-11** | No DB / Auth / RLS / E3 / Contabo / Catalog changes |
| **AC-12** | Authenticated live visual verification **PASS** |
| **AC-13** | Responsive visual verification **PASS** |
| **AC-14** | Automated regression tests **PASS** |
| **AC-15** | Production deployment SHA equals release commit |

---

## 17. Live Visual Verification Gate

**HARD RELEASE RULE.**

Visual Parity V2 **CANNOT** be marked **GREEN** based only on:

- source inspection · tests · TypeScript · build · static audit.

**Authenticated live visual verification is REQUIRED.**

Minimum states to verify live:

1. `noBeat`  
2. Beat selected  
3. Mixer collapsed  
4. Mixer expanded  
5. Inspector  
6. Transport  
7. Timeline  
8. Track headers  
9. xl desktop  
10. At least one narrow viewport  

Without authenticated live verification: **MAXIMUM STATUS = YELLOW**.

Owner may accept YELLOW only as an **explicit documented waiver**.

---

## 18. Regression Gates

Required before release:

- Focused Vitest (transport / mixer dock / mix-ux / visual parity / P7.1.x / architecture guards as applicable)  
- `tsc --noEmit`  
- Scoped lint  
- Production build  
- Sacred WIP fingerprint match  
- Diff excludes DB / Auth / RLS / E3 / Contabo / Catalog / new audio / persistence / selection systems  

---

## 19. Release Criteria

1. Owner GO on this Freeze *(this document — DONE)*  
2. Separate Owner **IMPLEMENTATION GO** + allowlist  
3. Cursor implementation (allowlist-bound)  
4. Read-only architecture audit  
5. Tests / typecheck / lint / build  
6. Commit  
7. Release Gate  
8. Owner push / deploy decision  
9. Vercel production SHA verification  
10. Authenticated live visual verification  
11. **GREEN** only if all mandatory gates PASS  

**Do not** start implementation from this Freeze alone.

---

## 20. Known Deferred Items

- Loop runtime  
- Metronome runtime  
- BPM / signature inline editing (if not already present)  
- Always-on multi-track meters  
- Real Device Audio Certification  
- Pixel-identical icon / asset pack  
- Any phase number beyond Owner naming (including P7.1.7)  

---

## Authority

Only Owner / Architect (Dawid) may reopen or amend this freeze, authorize implementation, or waive AC-12 / live GREEN.

Agents treat this file as SSOT for Studio Visual Parity V2 intent.

**Entry points:** [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) · [PROJECT_STATE.md](../PROJECT_STATE.md) · [STUDIO_VISUAL_SHELL_DESIGN_FREEZE.md](./STUDIO_VISUAL_SHELL_DESIGN_FREEZE.md) (V1 history)
