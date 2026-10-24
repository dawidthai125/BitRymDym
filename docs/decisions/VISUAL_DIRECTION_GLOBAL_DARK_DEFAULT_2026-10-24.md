# Visual direction — global dark default (2026-10-24)

**Status:** ADDITIVE OWNER DIRECTION · **≠** closing OD-15 / OD-16  
**Builds on:** [VISUAL_DIRECTION_ZINE_CONTROL_ROOM_2026-10-24.md](./VISUAL_DIRECTION_ZINE_CONTROL_ROOM_2026-10-24.md)  
**Does not reopen:** Studio Visual Parity V2 structural contracts (DAW chrome / audio / CAS)

---

## Intent

| Theme | Role | Palette |
|-------|------|---------|
| **Dark (default)** | Entire app when no preference stored | Graphite control-room: `#161918` / `#101312`, warm ink, amber `#c4893a`, REC `#db5a5a` |
| **Light (toggle)** | Paper zine / label cover | Existing paper `#f2ebe0`, bottle green, REC `#9a2f2f` |

Shared invariants: logo, Source Serif 4 / Schibsted Grotesk / IBM Plex Mono, waveforms, sharp radii, editorial zine character.

---

## Mechanism

- SSOT attribute: `html[data-theme="dark"|"light"]` + class `.dark` when dark (Tailwind `dark:`).
- Preference: `localStorage` key `bitrymdym.theme` only — **no** DB / cookies / migrations.
- Missing/invalid → **dark**.
- Blocking boot script (`beforeInteractive`) prevents light FOUC.
- Toggle in `SiteHeader` (+ `AuthThemeBar` on auth routes without header).
- Single semantic `--brd-*` map — no competing public vs Studio color systems.
- Historical `data-brd-surface="control-room"` markup remains; palette comes from global theme.

---

## Accessibility

- Dark REC `#db5a5a` ≈ 4.74:1 on `#161918` (AA).
- Light mute darkened to `#5c635c` for AA on paper.
- `color-scheme` set per theme for native form controls.
- Toggle: visible „Motyw / Ciemny|Jasny”, keyboard, focus ring, `aria-pressed`.

---

## On-media foam (follow-up)

`--brd-on-media` (= `--brd-recess-fg` `#efe9df`) is the semantic light foreground for photo overlays and dark scrims. Do not use `--brd-paper` for that role in dark theme (paper is graphite surface). Card fills and green/rec button ink keep their existing `--brd-paper` roles.

---

## Brand assets (Owner follow-up)

Dark mode inverts the current lockup PNG for readability. Authored **light-on-dark** logo + real covers would improve brand without inventing stock photos.

---

## Evidence

[audits/_visual_theme_global_dark_2026-10-24/README.md](../audits/_visual_theme_global_dark_2026-10-24/README.md) · follow-up [audits/_visual_theme_followup_on_media_2026-10-24/README.md](../audits/_visual_theme_followup_on_media_2026-10-24/README.md)
