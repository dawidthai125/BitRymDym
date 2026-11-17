# Visual direction — paper zine + control room (2026-10-24)

**Status:** **ACCEPTED FINAL** (OD-15 CLOSED 2026-11-17) · OD-16 **CLOSED / ACCEPTED** 2026-11-17  
**Lock:** [VISUAL_IDENTITY_OD15_LOCK_2026-11-17.md](./VISUAL_IDENTITY_OD15_LOCK_2026-11-17.md)  
**Authority:** Owner (Prezes Dawid) visual brief · Owner GO 2026-11-17  
**Does not replace:** [STUDIO_VISUAL_PARITY_V2_DESIGN_FREEZE.md](./STUDIO_VISUAL_PARITY_V2_DESIGN_FREEZE.md) (CLOSED — DAW structure / audio / CAS contracts remain)

---

## 1. Intent

Two product surfaces, one brand system (`--brd-*` in `src/styles/tokens.css`):

| Surface | Routes | Character |
|---------|--------|-----------|
| **Public zine / label cover** | `/`, `/beats`, `/beat/[id]` (+ Quick Take) | Paper, bottle green, REC red, display/ui/meta fonts, waveforms, existing logo |
| **Night control room** | `/studio`, `/studio/p/[projectId]`, `/account/takes` | Graphite, warm cream text, sparse amber, REC red only for record |

Shared invariants: existing logo lockup, typography triad, waveform language, red REC signal.

---

## 2. How control-room is scoped (non-global)

`AppShell tone="studio"` remains **chrome-only** (padding / sticky / nav) and is shared with `/account`, `/library`, `/settings`.

Night graphite is applied only via:

```html
<main data-brd-surface="control-room">…</main>
```

CSS remaps existing `--brd-*` names under that attribute (`src/app/globals.css`). Account / library / settings **without** the attribute stay on paper.

Studio transport uses stable `--brd-recess` / `--brd-recess-fg` so the strip stays dark when paper/ink remap.

---

## 3. What this does **not** change

- Studio Visual Parity V2 shell: Transport + Toolbar + Timeline + Inspector + Mixer
- Audio engines, CAS / autosave, eligibility, upload, preview, delete, AuthZ
- Schema, migrations, production data
- OD-16 status (**CLOSED / ACCEPTED** 2026-11-17 · [BRAND_COPY_OD16_LOCK_2026-11-17.md](./BRAND_COPY_OD16_LOCK_2026-11-17.md); OD-15 **CLOSED / ACCEPTED**)
- Sacred WIP path (untouched)

---

## 4. Photography / authored covers (Owner follow-up)

Demo visuals (`public/demo/visual/*`, hash-based `BeatArtwork`) are **not** real user sessions. Brand improves when Owner supplies:

1. Authored home scenes (mic / booth / console / night) replacing stock demo
2. Real beat covers wired through existing `cover_ref` (UI wiring separate GO)
3. Optional control-room ambient stills for empty Studio states

---

## 5. Acceptance (presentation)

- Public first viewport reads as one zine cover composition (brand + headline + scene)
- Quick Take shows session rhythm: mic → REC → send → take (existing phases preserved)
- Studio / takes archive readable on graphite with warm text; amber sparse; REC red for record
- Mobile + desktop contrast / focus / disabled / loading / error / empty preserved
- No global repaint of account / library / settings via `tone="studio"`

---

## 6. Follow-up 2026-10-24 (copy + control-room REC)

**Additive polish only · OD-15 CLOSED 2026-11-17 · OD-16 CLOSED 2026-11-17 · Studio V2 structure unchanged**

| Change | Detail |
|--------|--------|
| UI copy | Dropped implementation-y strings (“bezpieczeństwa bez zmian”, “marketplace’owego szumu”, “czekamy na press”, “nie Twoja sesja”, etc.) for short PL rapper-facing lines |
| REC contrast | Under `[data-brd-surface="control-room"]` only: `--brd-rec: #db5a5a` (~4.74:1 on `#161918`); public `#9a2f2f` kept |
| Chrome seam | Paper header/nav over graphite main treated as intentional brand frame after local fixture screenshots — **no** global header theme |
| Evidence | [audits/_visual_followup_2026-10-24/README.md](../audits/_visual_followup_2026-10-24/README.md) |
