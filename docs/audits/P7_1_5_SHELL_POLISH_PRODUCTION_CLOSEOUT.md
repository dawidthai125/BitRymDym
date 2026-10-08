# Phase 7.1.5 — Shell Polish + Stacked Escape Fix — Production Closeout

**Status:** **CLOSED / PRODUCTION VERIFIED — GREEN**
**Date:** 2026-10-08
**Owner:** Prezes Dawid

---

## Release identity

| Field | Value |
|-------|--------|
| Previous production SHA (HISTORY) | `9abc1b647a042201ad263466aaecd984033a9b2a` (`9abc1b6`) — Phase 7.1.4 Mixer Dock |
| Feature LAND SHA | `f891bceed773a9a6a1085962e3602b52e846e2e5` (`f891bce`) — `feat(studio): ship phase 7.1.5 shell polish` |
| Escape fix LAND SHA | `3fccbf7e9f93df519aa57475d79d045b8d2a636d` (`3fccbf7`) — `fix(studio): prioritize FxSheet escape over overlays` |
| **Production SHA (canonical tip)** | **`3fccbf7`** |
| Deployment | `dpl_2E7JrvusAzAG8bsXydpqNJ36k6JR` · **READY** |
| Production URL | https://www.bitrymdym.pl |

---

## Scope shipped

### Shell polish (`f891bce`)

- Transport render isolation (controls / playhead / meters contexts + leaf consumers)
- StudioFxSheet a11y parity (dialog · aria-modal · Escape · Tab trap · focus restore · backdrop · close ≥44px)
- Space / Home / End transport shortcuts with typing exclusion
- Mobile toolbar „Więcej” overflow
- Minimal Inspector `aria-controls` / `panelId`
- Regression-sync source contracts (P2/P3/P4/P6.5/P6.6.2) — Owner-accepted exception

### Stacked Escape fix (`3fccbf7`)

- FxSheet Escape uses **capture** + `stopImmediatePropagation`
- Top-most dialog owns first Escape; underlying Mixer overlay remains open
- Second Escape closes Mixer

**Out of scope (unchanged):** Engine · Recording Eligibility · PlayerProvider · E3 · Supabase / RLS / CAS · Premium · Storage · Contabo · DB / API

---

## Production verification (tip `3fccbf7`)

### Routes

| Route | Status |
|-------|--------|
| `/` | 200 |
| `/beats` | 200 |
| `/account` | 200 |
| `/studio` | 200 |

### Stacked Escape (critical)

| Viewport | Escape #1 | Escape #2 |
|----------|-----------|-----------|
| Tablet ~820×1180 | FxSheet closes · Mixer remains | Mixer closes |
| Mobile ~390×844 | FxSheet closes · Mixer remains | Mixer closes |

**PASS**

### FxSheet a11y (desktop / tablet / mobile)

role=dialog · aria-modal=true · Tab trap · Escape · close button · focus restore — **PASS**

### Mixer / Inspector

Desktop dock coexistence · tablet/mobile overlay Escape/backdrop · Mixer↔Inspector XOR — **PASS** (7.1.4 contract preserved)

### Runtime / audio / data

| Check | Result |
|-------|--------|
| pageErrors | 0 |
| filtered console errors | 0 |
| AudioContext constructions | 1 |
| new AudioContext / StudioAudioEngine in editor chunk | none |
| PlayerProvider / E3 | untouched |
| Real project `a8b42570-…` | unchanged · `document_version=1` · trackCount=2 |
| Sacred WIP `recording-eligibility-service.ts` | untouched (local dirty · not production) |
| Disposable fixtures | cleaned |

---

## Architecture invariants

1 Studio editor · 1 StudioAudioEngine · 1 Studio AudioContext · Mixer/Inspector overlays remain z-40 · FxSheet remains z-50 top dialog.

---

## Next

**STOP** — documentation reconciliation may advance REPO tip docs-only · **do not** redeploy for docs · **do not** start P6.8 / next Studio unit without Owner GO.
