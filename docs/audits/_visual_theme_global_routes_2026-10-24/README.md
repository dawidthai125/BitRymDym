# Evidence — global dark chrome across user routes (2026-10-24)

**Parent tip:** on-media follow-up `4c3a42b` · this pack commits after chrome placement fix  
**OD-15 / OD-16:** remain **OPEN**  
**Light paper:** remains toggleable alternative

## Product changes

- `SiteHeader`: `ThemeToggle` immediately before **Zaloguj** / **UserMenu** (after search); **Zaloguj** visible on mobile
- `ThemeToggle`: compact on narrow screens (`Motyw` label from `sm`)
- `/auth/*` layout: `AuthThemeBar` (covers reset-password / confirmed / email-change without touching Sacred/WIP pages)
- `/account/downloads`: removed hardcoded cream `oklch` wash → `--brd-paper`

## Capture method

- Local `localhost:3456`, muted audio, DevTools hidden, **no Play**
- Theme via Playwright `storageState` + assert `localStorage` ≡ `data-theme` (no post-load spoof)
- Viewports **1280×800** and **390×844** · themes dark + light

## Route group status

| Group | Routes captured | Visual status |
|-------|-----------------|---------------|
| Public home / catalog / about | `/`, `/beats`, `/about` | **PASS** (screenshots) |
| Beat detail / Quick Take chrome | `/beat/[id]` | **PASS** (screenshots; QT panel idle) |
| Auth forms | `/sign-in`, `/sign-up`, `/forgot-password` | **PASS** |
| Auth callback pages | `/auth/*` via layout | **NOT RUN** (no dedicated PNG in this pack; layout wiring only) |
| Studio / account / settings / library / takes | gated → `/sign-in` without session | **NOT VERIFIED** (logged-in chrome) |
| Admin | out of this pack | **NOT RUN** |
| Production UI smoke | — | **NOT RUN** |

## Toggle placement assert

Header pages: toggle index before Zaloguj / account control — see `capture-report.json` → `togglePlacement`.

## WIP

Sacred WIP + unrelated dirty tree (incl. `studio-editor.tsx`) **preserved / untouched**.
