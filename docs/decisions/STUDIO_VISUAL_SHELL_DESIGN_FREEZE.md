# BitRymDym — Studio Visual Shell Freeze

**Type:** Design Freeze / SSOT (presentation shell on existing Studio)  
**Unit name:** STUDIO VISUAL SHELL PASS  
**Not a phase:** this is **not** P7.1.7 and must not be labeled as such  
**Owner / Architect:** Prezes Dawid  
**Date:** 2026-10-08  

---

## 1. Status

| Item | Value |
|------|--------|
| Design Freeze | **LOCKED** (OD-VS-01…05) |
| Implementation | **COMPLETE** (uncommitted worktree at Final Review) |
| Final Review | **YELLOW — REVIEW PASSED WITH NON-BLOCKING GAPS** |
| Architecture | **GREEN** |
| OD-VS contracts | **ALL PASS** |
| Production | **UNTOUCHED** by this pass |
| Next | Owner decision — live visual sign-off / commit / further steps · **no re-implementation required** for missing live walkthrough |

```text
STUDIO VISUAL SHELL = existing Studio + Visual Shell Pass
≠ new Studio
≠ P7.1.7
≠ new audio / persist / CAS / recording architecture
```

---

## 2. Scope

**IN:** Presentation / chrome density and DAW-like affordances on the existing Studio shell, reusing existing mix / transport / inspector / mixer / recording owners.

**OUT:** New Studio product, new phase number, functional Loop/Metronome, new export pipeline, full multi-track metering, Real Device Verification, pixel-perfect mockup recreation, production deploy.

Related closed baselines (do not reopen):
- Phase 7.1.6 Auto Save + CAS — CLOSED / GREEN @ `4fa658d`
- Phase 7.1.5 Shell Polish — CLOSED / GREEN @ `3fccbf7` (ancestry)
- Phase 7.1.4 Mixer Dock — [P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md](./P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md)
- Phase 7.1.3 Inspector IA — CLOSED / GREEN @ `8f6eeca`
- P6.6 selected-track metering — [P6_6_STUDIO_TRACK_METERING_DESIGN_FREEZE.md](./P6_6_STUDIO_TRACK_METERING_DESIGN_FREEZE.md)
- P4.6 Take Export surface — `/account/takes`

---

## 3. Baseline

| Layer | Value |
|-------|--------|
| Repository HEAD / origin/main (at Final Review) | `28861497c97e6b0f6f795d35439c3dbbedee3190` |
| Production app SHA | `4fa658d33c7e0124d1fabc5c8c4ebbe0b05b4ba1` (`4fa658d`) |
| Production deployment | `dpl_6saiDX4bSbwWp7U7S2QLRMcGLEcy` |
| Production URL | https://www.bitrymdym.pl |
| Dual-plane | REPOSITORY tip may ≠ PRODUCTION APP · Visual Shell **not** production at Final Review |
| Sacred WIP | `src/lib/takes/recording-eligibility-service.ts` · SHA256 `5AE4C2311704DCDAE51CE36D8E69E1CA162F0C55AB14866EB30E73DC50EEECB9` |

---

## 4. Owner Decisions

| ID | Topic | Choice | Summary |
|----|-------|--------|---------|
| **OD-VS-01** | Loop / Metronome | **B** | Disabled visual placeholders only |
| **OD-VS-02** | Master Volume | **A** | Compact Transport control → `masterGainDb` / `patchMasterMix` |
| **OD-VS-03** | Export | **B** | Deep-link to existing Take Export `/account/takes` |
| **OD-VS-04** | Track Volume / Pan | **A** | Compact editable Track Header controls → `patchTrack` |
| **OD-VS-05** | Mixer M/S/R | **A** | Mirrored Mixer controls → same `patchTrack` |

No additional OD-VS decisions. Do not invent substitutes.

---

## 5. OD-VS-01

**Loop / Metronome — B (disabled placeholders).**

- Controls are visually present in Transport.
- Both are `disabled` with clear unavailable aria/title copy.
- **Not** an implemented feature.
- Forbidden: loop runtime, metronome runtime, loop/metronome state, click-track / oscillator engine for this affordance.

---

## 6. OD-VS-02

**Master Volume — A (compact Transport control).**

- Compact Master control lives in Transport chrome.
- Uses existing `masterGainDb` and `patchMasterMix`.
- Local drag / commit UX may update document view; persistence remains the existing master-mix path.
- Forbidden: second audio control system, new GainNode graph for Transport chrome.

---

## 7. OD-VS-03

**Export — B (existing Take Export deep-link).**

- Target: `/account/takes`.
- Presentation only — navigates to existing product surface (P4.6 Take Export).
- Forbidden: new Studio export/render pipeline, Contabo/always-on compute, new export engine.

---

## 8. OD-VS-04

**Track Volume / Pan — A (compact Track Header controls).**

- Compact Vol / Pan in Track Header.
- Commit path: existing `patchTrack` (CAS `expectedDocumentVersion`).
- Forbidden: second track persistence path, header-local store that bypasses orchestrator/CAS.

---

## 9. OD-VS-05

**Mixer M/S/R — A (mirrored Mixer controls).**

- Mixer exposes M / S / R mirrors of track mute / solo / recordArmed.
- Same `patchTrack` as Track Header.
- Forbidden: `MixerMuteStore`, second mute/solo/arm state, divergent SSOT.

---

## 10. Architecture Locks

| Domain | Locked owner |
|--------|----------------|
| Audio | `StudioAudioEngine` + `StudioTransportProvider` · **one** Studio `AudioContext` |
| Transport | `StudioTransportProvider` · `StudioTransportBar` · `studio-transport` |
| Persistence | `StudioPersistOrchestrator` |
| CAS | `expectedDocumentVersion` · `documentVersion` · `studio_cas_*` |
| Selection | Existing Studio editor selection SSOT |
| FX | `StudioFxSheet` · `StudioFxChainEditor` |
| Recording | `StudioRecordingPanel` · `studio-record-service` · existing recording eligibility architecture |
| Mixer chrome | `StudioMixerDockChrome` · `StudioMixerOverlay` · `StudioMixControl` |

Visual Shell **must not** create:
- second `AudioContext` / `StudioAudioEngine` / TransportProvider / PlayerProvider in Studio
- global selection store
- second persistence orchestrator
- new CAS layer or CAS bypass
- second recording eligibility service
- new storage SSOT / AuthZ path / FX persistence / Track·Clip persistence mechanism
- new Contabo architecture

---

## 11. Visual Scope

### Transport
Play · Pause · Stop · Record affordance · Loop (disabled) · Metronome (disabled) · BPM · Time Signature · Current Time · Duration · compact Master Volume · Save Status · Export deep-link.

BPM / signature bind to existing `doc.project.tempoBpm` / `timeSignatureNum` / `timeSignatureDen` (no parallel tempo SSOT).  
Record opens existing recording inspector context (`inspectorPreferRecord` + single mounted `StudioRecordingPanel`).

### Toolbar
Select · Split · Delete · Snap · Zoom · Add Track · Track Capacity — existing modes only; density/alignment polish only.

### Timeline
Ruler · playhead · waveform · clip lanes · existing seek · existing selection · visual density (e.g. lane height presentation). Geometry / seek / selection / CAS contracts unchanged.

### Track Headers
Track name · type / BEAT identity · M/S/R · compact Volume · compact Pan · reorder · menu.

### Inspector
Presentation mapping only: Settings · Effects · File · Record → existing inspector context / FxSheet / clip panel / recording panel. Not new subsystems.

### Mixer
Track name · meter (selected-track contract) · vertical level · pan · M/S/R · FX · sticky Master · existing dock/overlay behavior.

---

## 12. Responsive Scope

Freeze **existing** responsive architecture (no new responsive system):

| Viewport | Behavior |
|----------|----------|
| Desktop (`xl+`) | Inspector rail + Mixer dock coexist |
| Medium | Existing overlays / sheets · Inspector ↔ Mixer XOR |
| Small | Existing bottom sheets · overflow · sticky transport |

---

## 13. Design Language

Reuse existing BitRymDym design system only:

- Cream paper / existing `--brd-*` tokens
- Bottle green accent
- Source Serif 4 · Schibsted Grotesk · IBM Plex Mono (existing stacks)
- Existing radii / lines / paper surfaces

Forbidden: second design system, new global token architecture, purple/glow redesign drift.

---

## 14. Allowlist

Visual Shell implementation / contract files:

```text
src/components/studio/studio-editor.tsx
src/components/studio/studio-inspector-shell.tsx
src/components/studio/studio-mix-control.tsx
src/components/studio/studio-mixer-shell.tsx
src/components/studio/studio-toggle-chip.tsx
src/lib/studio/studio-visual-shell.test.ts
src/lib/studio/p7-1-4-mixer-dock.test.ts
src/lib/studio/p6-4-3-mix-ux.test.ts
```

Unrelated dirty worktree files (other audits, scripts, other studio PR-guard tests, Sacred WIP content dirty-but-fingerprint-stable, etc.) are **not** Visual Shell scope.

---

## 15. Explicitly Out of Scope

- Loop implementation
- Metronome implementation
- New `AudioContext` / `StudioAudioEngine` / TransportProvider / PlayerProvider in Studio
- New global selection store
- New persistence architecture / new CAS layer / CAS bypass
- New recording eligibility / Sacred WIP modification
- New storage architecture
- DB schema / RLS / Auth changes
- E3 · Catalog Player · Contabo · always-on compute
- New Export pipeline
- Full multi-track metering (beyond P6.6 selected-track contract)
- Real Device Verification
- Pixel-perfect mockup recreation
- **P7.1.7**

---

## 16. Known Non-Blocking Gaps

These are **accepted gaps**, not architecture failures:

1. Loop / Metronome remain feature gaps (disabled UI only).
2. Mixer metering remains selected-track-only per P6.6.
3. Visual Shell is not pixel-identical to the reference DAW mockup.
4. Real Device Verification was not executed for this pass.
5. Live authenticated Studio walkthrough was not completed in Final Review (local `/studio` auth-gated).
6. Interactive visual density vs mockup was not finally confirmed by browser walkthrough.
7. Worktree remains dirty per existing dual-plane / WIP workflow.

---

## 17. Validation Status

Recorded at Final Review (read-only):

| Check | Result |
|-------|--------|
| Focused Vitest | **9 files · 121 passed · 0 failed · 0 skipped** |
| Typecheck | **PASS** (`tsc --noEmit`) |
| Scoped lint | **PASS** |
| Scoped `git diff --check` | **PASS** |
| Sacred WIP fingerprint | **MATCH** |
| Architecture guards | **PASS** (no second engine / AC / persist / CAS bypass) |
| OD-VS-01…05 | **PASS** |
| Live authenticated Studio preview | **BLOCKED** (auth) → review **YELLOW** |
| Production | **UNTOUCHED** |

---

## 18. Production Safety

At Final Review / this freeze documentation:

| Action | Status |
|--------|--------|
| Commit | **NO** (not performed as part of Final Review) |
| Deploy | **NO** |
| DB mutation | **NO** |
| Production mutation | **NO** |
| Sacred WIP mutation | **NO** |

Do **not** document production as updated by Visual Shell until Owner authorizes commit + production verification separately.

---

## 19. Closure Criteria

Visual Shell implementation is **closed** when:

- OD-VS-01…05 remain as frozen above
- Architecture locks remain intact
- Sacred WIP fingerprint unchanged
- Focused Studio Visual Shell / related guards remain PASS
- TypeScript remains PASS
- No production mutation without Owner GO
- No unauthorized scope creep

**Live visual sign-off** is a **separate Owner step**.  
Missing live sign-off does **not** authorize re-implementing Visual Shell.

---

## 20. Owner / Architect Authority

Only Owner / Architect (Dawid) may:

- reopen or amend OD-VS-01…05
- authorize commit / deploy / production verification
- authorize any functional Loop / Metronome / Export pipeline / metering expansion
- authorize a future Studio phase (must not silently become “P7.1.7” without a separate freeze)

Agents must treat this file as SSOT for Studio Visual Shell intent.  
Code + tests remain evidence of implementation; production evidence remains a separate stage.

**Entry points:** [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) · [PROJECT_STATE.md](../PROJECT_STATE.md) · [REUSE_SSOT_MAP.md](../architecture/REUSE_SSOT_MAP.md)
