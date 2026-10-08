# Phase 7.1.4 — Mixer Dock / Chrome — Design Freeze

**Status:** **CLOSED / ACCEPTED** · Implementation GREEN · LAND GREEN · **PRODUCTION VERIFIED — GREEN**
**Date:** 2026-10-08
**Owner:** Prezes Dawid
**LAND SHA:** `9abc1b647a042201ad263466aaecd984033a9b2a` (`9abc1b6`)
**Production:** `9abc1b6` · dpl `dpl_7nZZXRBBZS3hJMzSfw4F8FXkRoww` · https://www.bitrymdym.pl
**Previous production tip (HISTORY):** `8f6eeca` — Phase 7.1.3 Inspector IA

---

## Owner decisions (FINAL)

| ID | Decision | Choice |
|----|----------|--------|
| **OD-P7.1.4-01** | Desktop Mixer placement | **A** — bottom collapsible dock in DAW shell |
| **OD-P7.1.4-02** | Collapsed chrome | **A** — thin chrome bar + chevron (UI-only) |
| **OD-P7.1.4-03** | Tablet/mobile surface | **A** — bottom sheet/drawer overlay + Inspector/Mixer XOR |
| **OD-P7.1.4-04** | Master in channel scroller | **A** — sticky-first |

### Closed predecessors (do not reopen)

- Phase 7.1.3 Inspector selection-driven IA — **CLOSED / GREEN** @ `8f6eeca`
- Inspector/Mixer mobile XOR = **A** (frozen in 7.1.3; reaffirmed for Mixer overlay)

---

## Locked architecture

- **1** `StudioAudioEngine` · **1** Studio `AudioContext`
- Mixer **reuses** `doc` / `engineDocument` / `selectedTrackId` / `patchTrack` / `patchMasterMix`
- Mixer **does not** create AudioContext, engine, analyser, rAF loop, selection store, or FX engine
- Header = primary M/S/R · Mixer = primary Gain/Pan/Meter/FX · Inspector = summary
- Master ≠ `studio_track`
- Desktop: Mixer dock **coexists** with Inspector rail (`≥ xl`)
- `< xl`: Inspector ↔ Mixer **XOR**
- No DB / API / RLS / Auth / Storage / CAS / Premium / E3 / PlayerProvider changes

---

## Evidence

- Commit: `feat(studio): land phase 7.1.4 mixer dock`
- Files: `studio-editor.tsx` · `studio-mixer-shell.tsx` · `p7-1-4-mixer-dock.test.ts`
- Closeout: [P7_1_4_MIXER_DOCK_PRODUCTION_CLOSEOUT.md](../audits/P7_1_4_MIXER_DOCK_PRODUCTION_CLOSEOUT.md)

---

## Next

**STOP** — do **not** start Phase 7.1.5 without separate Owner GO.
