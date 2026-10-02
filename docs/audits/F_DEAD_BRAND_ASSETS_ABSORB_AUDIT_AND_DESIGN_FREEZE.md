# F — DEAD BRAND ASSETS ABSORB — AUDIT + DESIGN FREEZE

**Type:** Audit + Design Freeze  
**Date:** 2026-10-02  
**Wave:** F (sequence position 1)  
**Owner decision:** **ABSORB** (audit before cleanup · no mass delete)  
**Status:** Arch Review **PASS WITH CONDITIONS** · Owner GO **GRANTED** · Implementation **IN WORKING TREE** (commit pending Owner)

```text
BASELINE APPLICATION SHA   = 42369c0
DOCS TIP                   = 6011c98
FALA 1B                    = CLOSED / PRODUCTION VERIFIED — GREEN
IMPLEMENTATION             = WORKING TREE ONLY · commit/push NOT DONE
```

Parent lock: [NEXT_WAVE_OWNER_DECISIONS_2026-10-02.md](./NEXT_WAVE_OWNER_DECISIONS_2026-10-02.md)

---

## 1. Purpose

Assess untracked / unused brand candidates deferred from Fala 1B:

- `BeatListRow` (`src/components/brand/beat-list-row.tsx`)
- `BrdSymbol` (`src/components/brand/brd-symbol.tsx`)
- Symbol PNGs under `public/brand/`

Decide ABSORB into design-system SSOT vs deferred cleanup — **without** shipping catalog UI changes or mass delete in this freeze gate.

---

## 2. Inventory (evidence)

| Asset | Path | Tracked? | Importers | Notes |
|-------|------|----------|-----------|-------|
| BeatListRow | `src/components/brand/beat-list-row.tsx` | **Untracked** | **0** | Editorial row · Waveform decorative · no PlayerProvider |
| BrdSymbol | `src/components/brand/brd-symbol.tsx` | **Untracked** | **0** | Mark-only · uses symbol PNGs |
| Symbol primary | `public/brand/bitrymdym-symbol.png` | **Untracked** | via BrdSymbol only (untracked) | Intrinsic ref in BrdSymbol |
| Symbol inverse | `public/brand/bitrymdym-symbol-inverse.png` | **Untracked** | via BrdSymbol only | Inverse variant |
| Symbol needcut | `public/brand/bitrymdym-symbolneedcut.png` | **Untracked** | **0** | Source/WIP — not wired |
| Logo source | `public/brand/bitrymdym-logo-source.png` | **Untracked** | **0** | Source master for logo |
| Logo production | `public/brand/bitrymdym-logo.png` | **Tracked** (shipped) | `BrdLogo` / `BrdLogoHomeLink` | **SSOT lockup in production** |

**Live catalog SSOT (shipped):** `BeatCatalogRow` — used by `beats-catalog-client.tsx` · wired to `PlayerProvider` / `BrdAudioPlayButton` / artwork.

**Live brand lockup SSOT (shipped):** `BrdLogo` → `/brand/bitrymdym-logo.png`.

---

## 3. Analysis

### 3.1 BeatListRow vs BeatCatalogRow

| Dimension | BeatListRow (local) | BeatCatalogRow (PROD) |
|-----------|---------------------|------------------------|
| Role | Editorial list row | Marketplace catalog row |
| Audio | Decorative Waveform only | Full player controls |
| Data shape | `BeatListRowData` | `PresentedBeat` |
| Status | Dead / unused | SSOT for `/beats` |

**Absorb recommendation (freeze proposal):**  
Do **not** replace `BeatCatalogRow` with `BeatListRow`.  
Treat `BeatListRow` as **duplicate / obsolete prototype** relative to catalog SSOT — candidate for **DELETE after Owner cleanup GO**, unless Owner later wants a non-player editorial list (new product decision).

### 3.2 BrdSymbol vs BrdLogo

| Dimension | BrdSymbol | BrdLogo |
|-----------|-----------|---------|
| Visual | Crown / BRD mark only | Full lockup (crown + wordmark) |
| Production | Not shipped | Shipped in SiteHeader |
| Value | Brand system completeness (mark-only use cases) | Current header SSOT |

**Absorb recommendation (freeze proposal):**  
**KEEP / ABSORB** `BrdSymbol` + primary/inverse PNGs into tracked brand kit **as optional mark component** (export from `brand/index.ts`) — **without** changing header lockup in this wave.  
`bitrymdym-symbolneedcut.png` and `bitrymdym-logo-source.png` = **source/WIP** → keep out of runtime OR archive under docs/brand source policy (Owner choice at cleanup GO).

---

## 4. Design Freeze decisions (proposed · pending Arch Review + Owner GO)

| ID | Decision | Proposed lock |
|----|----------|---------------|
| F-DF-01 | Catalog row SSOT | `BeatCatalogRow` remains sole catalog row |
| F-DF-02 | BeatListRow | **Do not ship** · do not wire · **DELETE** allowed only after cleanup GO |
| F-DF-03 | BrdSymbol | **ABSORB** (track + export) as mark-only primitive · no SiteHeader swap |
| F-DF-04 | Symbol PNGs primary/inverse | **ABSORB** with BrdSymbol |
| F-DF-05 | `*needcut*` / `*logo-source*` | **Not runtime** · Owner chooses archive vs delete at cleanup |
| F-DF-06 | Header mark | Remains `BrdLogo` / `bitrymdym-logo.png` |
| F-DF-07 | Audio | No PlayerProvider / audio engine changes |

---

## 5. Scope

**IN (after Owner GO allowlist):**

- Track + export `BrdSymbol` + primary/inverse PNGs (ABSORB)
- Optional delete of `BeatListRow` (if Owner confirms DELETE)
- Optional remove/archive of WIP PNGs
- Docs note in brand index / freeze closeout

**OUT:**

- Replacing `BeatCatalogRow`
- Header redesign / logo swap
- Catalog UX changes
- Auth / RLS / Storage / ENV / workers / recording / Mix
- Mass `git add` of unrelated untracked (agents/infra)

---

## 6. Allowlist (implementation — only after Owner GO)

Proposed maximum:

```text
src/components/brand/brd-symbol.tsx
src/components/brand/index.ts
public/brand/bitrymdym-symbol.png
public/brand/bitrymdym-symbol-inverse.png
# optional DELETE:
src/components/brand/beat-list-row.tsx
# optional archive/delete WIP (Owner pick):
public/brand/bitrymdym-symbolneedcut.png
public/brand/bitrymdym-logo-source.png
# docs closeout only if docs GO:
docs/audits/...
```

---

## 7. Risks · Rollback · Acceptance

| Risk | Level | Mitigation |
|------|-------|------------|
| Accidental catalog regression | LOW | No BeatCatalogRow edits |
| Shipping WIP assets | LOW | Exclude needcut/source from runtime |
| Staging pollution | MEDIUM | Exact allowlist |

**Rollback:** revert absorb commit; production unaffected if unused until import.

**Acceptance (post-GO):**

1. BrdSymbol tracked + exported OR explicitly deferred KEEP-local  
2. BeatListRow disposition recorded (deleted or still deferred)  
3. Zero new importers of BeatListRow  
4. BrdLogo header unchanged  
5. No audio/Auth/RLS/Storage changes  

---

## 8. Gate

```text
AUDIT (this doc) → ARCH REVIEW PASS WITH CONDITIONS → OWNER GO
→ IMPLEMENT (working tree) → OWNER REVIEW → COMMIT/PUSH (Owner only)
```

---

## 9. Implementation disposition (working tree · 2026-10-02)

| Item | Disposition | Evidence |
|------|-------------|---------|
| BeatCatalogRow | **UNCHANGED** SSOT | `beats-catalog-client.tsx` still sole consumer |
| BeatListRow | **DELETED** | Re-confirmed 0 code/test importers before delete |
| BrdSymbol | **ABSORBED** | File kept · exported from `brand/index.ts` · no header use |
| `bitrymdym-symbol.png` | **ABSORBED** | Required by BrdSymbol |
| `bitrymdym-symbol-inverse.png` | **ABSORBED** | Required by BrdSymbol inverse |
| `bitrymdym-symbolneedcut.png` | **DELETED** | 0 references · WIP |
| `bitrymdym-logo-source.png` | **DELETED** | 0 references · WIP source |
| BrdLogo / SiteHeader | **UNCHANGED** | No header swap |

**Commit / push / deploy:** NOT DONE — await Owner review.
