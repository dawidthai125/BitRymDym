# Evidence — on-media foam + theme toggle persistence (2026-10-24)

**Parent:** `f3b8e75` global dark default  
**Direction:** [VISUAL_DIRECTION_GLOBAL_DARK_DEFAULT_2026-10-24.md](../../decisions/VISUAL_DIRECTION_GLOBAL_DARK_DEFAULT_2026-10-24.md)  
**OD-15 / OD-16:** remain **OPEN**

## Code change

- New semantic token `--brd-on-media` (= `--brd-recess-fg` `#efe9df`) — always-light foam for text/borders on photos & dark scrims.
- Applied on home featured overlay, rec/studio media chrome, final CTA on VisualScene, VisualScene captions, `BrdButton`/`BrdLink` `onDark`.
- Card backgrounds and green/rec button foregrounds still use `--brd-paper` (different role).

## Contrast on real overlay (not flat token pair)

Playwright screenshots `[data-testid=home-featured-media-overlay]`, samples mid-band pixels of the painted PNG, compares to computed `color` (`rgb(239,233,223)`).

| Theme · viewport | Sampled bg RGB | Ratio | AA 4.5 |
|------------------|----------------|------:|--------|
| dark desktop | 48,48,44 | 10.97 | PASS |
| light desktop | 48,48,44 | 10.97 | PASS |
| dark mobile | 58,57,52 | 9.58 | PASS |
| light mobile | 54,55,51 | 9.93 | PASS |

Source: `capture-report.json` · probe PNGs `probe-overlay-bg-*.png`

## Theme toggle persistence (asserted, not spoofed)

Script seeds via Playwright `storageState` only (does **not** `setAttribute('data-theme')` after load).  
Each step asserts `localStorage bitrymdym.theme` === `html[data-theme]` + `.dark` class.

Round-trip (desktop + mobile): dark → click light → assert → reload light → click dark → reload dark — **PASS**.

Screenshots: `toggle-*-after-toggle-light.png`, `*-after-reload-light.png`, `*-after-reload-dark.png` · home `*-home-*` @ **1280×800** / **390×844** (IHDR OK).

**Not claimed:** FOUC absence from screenshots alone (boot script is the FOUC mitigation; this pack proves persistence after load/reload).

## Out of scope / status

| Item | Status |
|------|--------|
| Studio / takes / account logged-in chrome | **NOT VERIFIED** (no local session) |
| Production UI smoke | **NOT RUN** |
| Sacred WIP / `studio-editor.tsx` WIP | preserved, untouched |
