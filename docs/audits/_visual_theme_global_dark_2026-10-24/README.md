# Evidence — global dark default + light toggle (2026-10-24)

**Scope:** local Playwright captures · fixture/local `localhost:3456` · muted audio · DevTools overlays hidden · **no Play**  
**Direction:** [VISUAL_DIRECTION_GLOBAL_DARK_DEFAULT_2026-10-24.md](../../decisions/VISUAL_DIRECTION_GLOBAL_DARK_DEFAULT_2026-10-24.md)  
**OD-15 / OD-16:** remain **OPEN** · Studio Visual Parity V2 structure **not reopened**

## Capture

- Script: `_capture.mjs` (Playwright Chromium, `deviceScaleFactor: 1`)
- Viewports: **1280×800** and **390×844** (IHDR verified OK for all PNGs below)
- Themes: `localStorage bitrymdym.theme` = `dark` | `light` (+ `data-theme` assert)

## Contrast (relative luminance, WCAG AA text 4.5:1)

| Pair | Ratio | Status |
|------|------:|--------|
| Dark ink `#efe9df` on `#161918` | 14.66 | PASS |
| Dark mute `#9a9488` on `#161918` | 5.87 | PASS |
| Dark REC `#db5a5a` on `#161918` | 4.74 | PASS |
| Dark amber `#c4893a` on `#161918` | 5.89 | PASS |
| Light ink `#101412` on `#f2ebe0` | 15.68 | PASS |
| Light mute `#5c635c` on `#f2ebe0` | 5.22 | PASS |
| Light REC `#9a2f2f` on `#f2ebe0` | 6.29 | PASS |

## Screenshots

| Surface | Dark desktop/mobile | Light desktop/mobile | Note |
|---------|---------------------|----------------------|------|
| Home `/` | `dark-home-*` | `light-home-*` | PASS |
| Catalog `/beats` | `dark-beats-*` | `light-beats-*` | PASS |
| Beat / Quick Take | `dark-beat-detail-*` | `light-beat-detail-*` | PASS |
| Sign-in | `dark-signin-*` | `light-signin-*` | PASS (+ Motyw toggle) |
| Studio `/studio` | `dark-studio-gate-*` | `light-studio-gate-*` | Gate → sign-in without session |
| Takes `/account/takes` | `dark-takes-gate-*` | `light-takes-gate-*` | Gate → sign-in without session |
| Settings `/settings` | `dark-settings-*` | `light-settings-*` | Gate → sign-in without session |

**Studio logged-in editor / authenticated archive & account chrome:** **NOT VERIFIED** (no authorized local session).

## Controls run (this change)

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `vitest run src/lib/ui/theme.test.ts` (+ tokens) | PASS |
| eslint on theme-touched TS/TSX | PASS |
| Playwright IHDR sizes | PASS (28 PNGs) |
| Production deployment | **NOT RUN** / **NOT RE-VERIFIED** |

## Brand follow-up (Owner)

Dark mode uses CSS invert on the current logo PNG. Authored light-on-dark lockup + real covers would strengthen the brand without inventing stock imagery.
