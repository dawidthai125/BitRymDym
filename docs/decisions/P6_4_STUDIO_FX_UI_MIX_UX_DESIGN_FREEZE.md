# P6.4 — Studio FX UI / Mix UX — Design Freeze

**Status:** DESIGN FREEZE — **GO**  
**Date:** 2026-10-06  
**Type:** DOCS ONLY — **NO IMPLEMENTATION · NO DB MIGRATION · NO DEPLOY**  
**Owner:** Prezes Dawid  
**Architect:** ChatGPT  
**Implementacja:** Cursor Agent (po Owner GO na implementację)

**Baseline production application:** `350303e9506d8300b03dae7e1530f06756971736` (`350303e`)  
**Production deployment:** `dpl_AdUhQzAFBNAFeJ8qTEaa4jTpbsho`  
**Architecture audit:** `7868fe0` → [P6_4_STUDIO_FX_UI_MIX_UX_ARCHITECTURE_AUDIT.md](../architecture/P6_4_STUDIO_FX_UI_MIX_UX_ARCHITECTURE_AUDIT.md)  
**Parent freeze:** [P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md](./P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md)

```text
P6.4 DESIGN FREEZE: GO
IMPLEMENTATION: FORBIDDEN IN THIS STEP
PRODUCTION APP: UNCHANGED (350303e)
NO DEPLOY
```

This freeze **closes** the Architecture Audit `GO WITH CONDITIONS` by locking Master Gain/Pan (Option A), FX registry UI SSOT, CAS/`documentVersion` propagation, mobile/a11y, and performance rules.

---

## 1. Status

| Item | Value |
|------|--------|
| Decision | **P6.4 DESIGN FREEZE: GO** |
| Scope | FX UI + Studio Mix UX over existing engine/API |
| Parent P6 | Binding; this freeze specializes P6.4 UI slice |
| Next | P6.4.1 implementation (after Owner GO) |

---

## 2. Baseline

| Layer | SHA / ID | State |
|-------|----------|--------|
| Production application | `350303e` | P6.3 Master FX GREEN |
| Production deployment | `dpl_AdUhQzAFBNAFeJ8qTEaa4jTpbsho` | unchanged by this freeze |
| P6.4 Architecture Audit | `7868fe0` | GO WITH CONDITIONS → closed here |
| SSOT tip at freeze authorship | `7868fe0`+ | docs only |

**Do not change P6.3 engine/API contracts except the minimal Master Gain/Pan mutation and Track PATCH `documentVersion` return required by this freeze.**

---

## 3. Goals

1. Give users a mobile-first Mix UX for Track/Master FX and mix controls.  
2. Bind UI exclusively to existing persistence + `StudioAudioEngine`.  
3. Preserve CAS integrity across Track control bumps and FX writes.  
4. Close Master Gain/Pan write GAP via Option A (existing document columns + CAS).  
5. Drive all FX UI from one registry SSOT (no second FX catalog in React).

---

## 4. Scope (IN)

### Track

- FX chain: list, add, remove, reorder, bypass (`enabled`), parameters  
- Mute, Solo, Gain, Pan (reuse existing controls; integrate with FX entry + version plumbing)

### Master

- FX chain: list, add, remove, reorder, bypass, parameters (+ limiter-last UX guard)  
- Gain, Pan (new UI + mutation contract — Option A)

### UX / platform

- Desktop + mobile ~390 px  
- Accessibility  
- Saving / error / conflict / loading / empty states  
- Polish Studio language (brand „Studio” stays EN)

---

## 5. Out of Scope

Automation, LUFS, True Peak, advanced metering, autotune, pitch correction, time stretch, reverse, loop, samples, instruments, scratch, buses, sends, sidechain, output routing, `setSinkId`, autosave, full project versioning / H2 clip CAS retrofit, recording rewrite, PlayerProvider rewrite, E3 Mix migration, wet Take preview, new FX types, second `AudioContext` / Mix/Master/FxUi engines, P7 creative features.

**Explicit LOW decisions:**

| Topic | Decision |
|-------|----------|
| DSP English jargon as primary labels | OUT — Polish labels (Appendix A) |
| Desktop-only HTML5 drag/drop as sole reorder | OUT — ↑↓ mandatory; DnD optional later |
| Metering / LUFS / True Peak in Mix UX | OUT |

---

## 6. Architecture

### Hard boundary

```text
UI (StudioFxChainEditor / StudioMixControl / studio-editor)
  ↓
existing Studio mutation API (Track PATCH · Track FX PATCH · Master FX PATCH · Master Mix PATCH)
  ↓
Studio document (effects_chain · master_fx_chain · track controls · master_gain_db · master_pan · document_version)
  ↓
StudioAudioEngine.setDocument / sync
  ↓
Web Audio
```

### Forbidden

```text
UI → AudioContext
UI → PlayerProvider
UI → E3 Mix / MixPanel / mix-graph
UI → second StudioMixEngine / MasterAudioEngine / FxUiAudioEngine
UI → own FX catalog duplicate of studio-fx-chain
```

### Topology (unchanged)

```text
Voice → Clip Gain → Track FX[] → Track Gain/Pan/Mute/Solo
  → Σ (masterInput)
  → Master FX[]
  → Master Gain → Master Pan → Destination
```

---

## 7. FX Registry SSOT

**Single source:** `src/lib/studio/studio-fx-chain.ts` (and only extensions of that module).

Existing:

- `STUDIO_FX_TYPES` = `eq | compressor | limiter | reverb | delay`
- `STUDIO_FX_REGISTRY` (track/master eligibility)
- `STUDIO_FX_DEFAULTS`
- parse/validate ranges (server SSOT)
- max 8 effects

**P6.4.2 MUST export UI metadata from the same module family**, e.g.:

```text
STUDIO_FX_UI_META[type] → {
  labelPl,
  params: [{ path, labelPl, min, max, step, unit, kind: "slider" | "number" }]
}
```

Rules:

1. Ranges in UI meta **must match** parser ranges (no widening).  
2. React components **must not** hardcode per-type param catalogs.  
3. Do **not** import E3 `params.ts` / MixPanel schemas.  
4. Server validation remains authoritative; UI meta is for render only.

**FX types locked:** exactly the five above — no new types in P6.4.

---

## 8. Shared FX Chain Editor

### Component concept

```text
StudioFxChainEditor
  role: "track" | "master"
  projectId
  trackId?          // required when role=track
  chain: StudioFxChainV1
  documentVersion
  onDocumentVersionChange
  onChainChange     // after successful persist
  savingState
```

One implementation, two roles. **No** copy-paste Track → Master panel.

### FX card model

```text
┌────────────────────────────────────┐
│ Label FX     ↑ ↓     Włączony|Wył. │
│ (expanded params when open)        │
│ Usuń                               │
└────────────────────────────────────┘
```

Adapt to existing Studio design system (colors, type, spacing, focus) — **no new design system**.

### Behaviors

| Action | Persist | Notes |
|--------|---------|--------|
| Add | FX PATCH + CAS | defaults from `STUDIO_FX_DEFAULTS`; refuse at max 8 |
| Remove | FX PATCH + CAS | |
| Reorder ↑↓ | FX PATCH + CAS | primary on mobile + desktop |
| Bypass | FX PATCH + CAS | `enabled` only; keep id/order |
| Params | FX PATCH + CAS | commit on pointer up / keyboard commit |
| Drag/drop | optional desktop later | must not be mobile-only path |

### Limiter-last (Master)

- UI prevents placing limiter anywhere except last (disable invalid ↑/↓ / refuse add-not-last).  
- Server remains SSOT: still handle `400 FX_CHAIN_INVALID`.  
- Track role: no limiter-last constraint (unchanged).

### Optimistic UI

Prefer **mutation → success → commit UI** for reorder/add/remove.  
Light local preview allowed for slider drag **before** persist; never claim `saved` until `200`.  
On `409`/`400`: no silent success; rollback local preview to last server chain.

---

## 9. Track FX UX

| Entry | From track card control „Efekty” (or equivalent) opens shared editor with `role="track"`. |
| Empty | „Brak efektów. Dodaj efekt.” + add menu from registry. |
| Expand | Mobile: **at most one** expanded FX. Desktop: may show more; same data model. |
| API | Existing `PATCH .../tracks/:trackId/effects` |

---

## 10. Master FX UX

| Entry | Master section / „Master · Efekty” opens same `StudioFxChainEditor` with `role="master"`. |
| API | Existing `PATCH .../master-fx` |
| Extra | Limiter-last guard + Master Gain/Pan `StudioMixControl` in same Master surface |

---

## 11. Track Mix UX

**REUSE** existing `studio-editor` controls:

- `ToggleChip` — Mute („Wycisz”), Solo („Odsłuch”), REC  
- Gain / Pan `input[type=range]` — local on change, persist on `pointerUp`

**Do not rebuild** unless required for version plumbing or a11y gaps.

### Binding rule (HIGH — closed)

Track PATCH today bumps `document_version` **without** CAS and **without** returning the new version to the client (`patchTrack` updates track only).

**Frozen requirement:**

1. Track control mutation responses **MUST** include `documentVersion` (and preferably project fields needed).  
2. UI **MUST** set `doc.project.documentVersion` (or equivalent live version) to that value before any subsequent FX PATCH.  
3. Do **not** disable FX CAS.  
4. Do **not** retrofit full Track-control CAS in P6.4 (parent freeze H2 deferred) — only **version return + UI apply**.

```text
Track PATCH  N → N+1  → response.documentVersion = N+1
                         ↓
UI documentVersion = N+1
                         ↓
FX PATCH expectedDocumentVersion = N+1
```

---

## 12. Master Gain / Pan — OPTION A

### Decision

**OPTION A — minimal existing document mutation path.**

- Persist to existing columns: `master_gain_db`, `master_pan`.  
- No new `master_settings` table / parallel state store.  
- No second SSOT.  
- Runtime continues to use existing Master Gain/Pan nodes in `StudioAudioEngine`.

### Mutation contract (P6.4.1)

Implement **one** of (prefer first if project PATCH already exists/extends cleanly):

| Preferred | `PATCH /api/studio/projects/:projectId` body `{ expectedDocumentVersion, masterGainDb?, masterPan? }` |
| Alternate | `PATCH /api/studio/projects/:projectId/master-mix` same body |

**Required properties:**

| Property | Rule |
|----------|------|
| AuthZ | owner session; `assertOwnsProject`; unauth `401`; cross-user deny |
| CAS | **required** `expectedDocumentVersion`; mismatch → `409` with conflict copy |
| Bump | `document_version + 1` on success |
| Response | `{ success, documentVersion, masterGainDb, masterPan }` |
| Validation | same numeric bounds as Track Gain/Pan UX (−24…12 dB; pan −1…1) unless already frozen elsewhere — do not invent new ranges |
| Engine | UI updates document → engine via existing `masterGainDb` / `masterPan` fields |

Track Gain/Pan stay on existing Track PATCH (non-CAS + version return). Master Gain/Pan are **CAS-aware** from day one of P6.4.1 to avoid a second stale-version class of bugs.

### UX

Shared `StudioMixControl`:

```text
target: "track" | "master"
control: "gain" | "pan"
```

Reuse slider pattern: local drag → commit on pointer up / keyboard commit → saving state.

---

## 13. CAS / documentVersion

| Mutation | CAS? | Version out |
|----------|------|-------------|
| Track FX PATCH | YES | YES |
| Master FX PATCH | YES | YES |
| Master Gain/Pan PATCH | YES | YES |
| Track Mute/Solo/Gain/Pan/REC | NO (existing) | **YES (new required return)** |

**Live version owner in UI:** single field derived from `doc.project.documentVersion`, updated on every successful mutating response listed above, and on full document reload.

**After every successful mutation:** `documentVersion = response.documentVersion`. Never reuse a stale expected version for the next CAS write.

---

## 14. Saving states

```text
idle | saving | saved | error | conflict
```

Polish feedback (minimum):

| State | Copy |
|-------|------|
| saving | Zapisywanie… |
| saved | Zapisano |
| error | Nie udało się zapisać |
| conflict | Projekt został zmieniony w innej sesji. Odśwież dane i spróbuj ponownie. |

**Autosave: OUT.**

Immediate save on explicit actions (add/remove/reorder/bypass/commit param/mix).

---

## 15. Conflict handling

For `409 FX_CHAIN_VERSION_CONFLICT` (and Master Mix CAS conflict if same code family):

1. Set state `conflict`.  
2. Show frozen meaning (Polish above). Prefer API message if already `FX_CHAIN_VERSION_CONFLICT_PL`; UX may use the slightly clearer freeze wording — both mean: refresh, do not overwrite.  
3. Offer **Odśwież** → reload Studio document → update version + chains.  
4. **No** blind overwrite. **No** ignore. **No** disable CAS.  
5. Discard unconfirmed local drafts on refresh (default).

---

## 16. Desktop UX

- Same `StudioFxChainEditor` as mobile.  
- May present as side panel, drawer, or inline Master/Track section.  
- Optional drag/drop **only** if stable and keyboard-accessible; ↑↓ remain available.  
- No separate desktop business logic fork.

---

## 17. Mobile UX (~390 px)

| Rule | Freeze |
|------|--------|
| Presentation | Drawer / bottom sheet for FX editor |
| Transport | Always reachable (Play/Pause/Stop not trapped behind opaque non-dismissible layer) |
| Context | Clear Track name or „Master” header in sheet |
| Expand | Max **one** expanded FX |
| Params | No required horizontal scroll for core params |
| Reorder | ↑ / ↓ mandatory |
| Bypass / Delete | Visible, ≥44×44 touch targets |
| Safe area | Controls above bottom nav; avoid known click-intercept zone |
| Feedback | saving / conflict visible in sheet |

---

## 18. Accessibility

Minimum (reuse existing Studio patterns):

| Control | Requirement |
|---------|-------------|
| Mute / Solo / Bypass | `aria-pressed` (+ visible label) |
| Gain / Pan / FX params | `aria-label` + current value / unit |
| Delete | `aria-label` (e.g. „Usuń efekt …”) |
| Reorder ↑↓ | accessible names („Przenieś efekt w górę/dół”) |
| Focus | visible focus; restore focus when closing drawer |
| Keyboard | Tab; Space/Enter toggles; ↑↓ buttons operable without pointer |
| Touch | ≥44×44 px |

---

## 19. Performance

```text
pointermove → local UI value only
pointerup / keyboard commit → one mutation
```

Forbidden:

- PATCH on every `pointermove`  
- Audio graph rebuild driven by React render per keystroke  
- Direct `AudioParam` writes from React as SSOT  

Engine applies document after successful persist (structure changes may rebuild; param-only updates may use existing in-place path).

---

## 20. Security

UI is not an authorization source.

| Case | Expected |
|------|----------|
| Unauthenticated | `401` |
| Owner | `200` on valid write |
| Cross-user | deny (`403`/`404` per existing AuthZ) |
| Stale CAS | `409` |
| Invalid chain | `400 FX_CHAIN_INVALID` |

Server validates chain JSON and ownership on every FX/Master write.

---

## 21. Runtime / persistence boundary

| Persisted | Runtime |
|-----------|---------|
| `effects_chain`, `master_fx_chain` | Track/Master FX node graphs |
| `enabled`, params, order | dry/pass-through when disabled |
| Track mute/solo/gain/pan | Track Gain/Pan/Mute/Solo nodes |
| `master_gain_db`, `master_pan` | Master Gain/Pan nodes |
| `document_version` | — |

UI mirrors **document**. Engine owns Web Audio nodes.

---

## 22. Error model

| Code / case | UX |
|-------------|-----|
| `400 FX_CHAIN_INVALID` | Show server Polish message; keep prior chain |
| `409 FX_CHAIN_VERSION_CONFLICT` | Conflict state + Odśwież |
| Network / 5xx | „Nie udało się zapisać” |
| Limiter-last blocked in UI | Explain before PATCH; still handle 400 |

Do not show „Nieznany błąd” for known FX CAS conflicts.

---

## 23. Component reuse

| Reuse | Do not reuse as Studio Mix |
|-------|----------------------------|
| `ToggleChip` | E3 MixPanel |
| Track Gain/Pan slider pattern | PlayerProvider |
| `startTransition` + status/error | `mix-graph` |
| Existing Studio drawer/sheet/focus styles | Second FX schema in components |
| `StudioFxChainEditor` × roles | Duplicated Master-only editor |
| `StudioMixControl` × track/master | Parallel master-only sliders |

---

## 24. Implementation sequence

Frozen order — **do not implement in this docs step**:

| Step | Deliverable |
|------|-------------|
| **P6.4.1** | Master Gain/Pan mutation contract (Option A) + Track PATCH returns `documentVersion` |
| **P6.4.2** | Shared registry-driven FX UI metadata + param field foundation |
| **P6.4.3** | Track FX UI (`StudioFxChainEditor` role=track) |
| **P6.4.4** | Master FX UI (same editor role=master + limiter-last) |
| **P6.4.5** | Track/Master Mix UX integration (`StudioMixControl`, version plumbing) |
| **P6.4.6** | Mobile + accessibility hardening |
| **P6.4.7** | Production Gate |

---

## 25. Production Gate requirements (future)

### Track

FX add / remove / reorder / bypass / params · Mute · Solo · Gain · Pan

### Master

FX add / remove / reorder / bypass / params · Gain · Pan · limiter-last

### Persistence

reload · `documentVersion` · CAS · `409` recovery · Track PATCH version propagation into FX CAS

### Runtime

Track FX · Master FX · Track controls · Master controls · transport

### Mobile

~390 px drawer/sheet usable; transport available

### Security

unauth · owner · cross-user

### Regression

P6.1 · P6.2 · P6.3 · P5 · P4 · P3 · PlayerProvider · E3 Mix

**Production application for Gate comparison remains `350303e` until P6.4 deploy.**

---

## 26. Risks

### HIGH — closed by this freeze

| ID | Risk | Freeze closure |
|----|------|----------------|
| H1 | Stale FX CAS after Track PATCH | Track responses return `documentVersion`; UI applies before FX CAS |
| H2 | Master Gain/Pan gap | Option A CAS mutation + `StudioMixControl` |
| H3 | Duplicated FX metadata | Extend `studio-fx-chain` UI meta SSOT only |

### MEDIUM — closed

| ID | Risk | Freeze closure |
|----|------|----------------|
| M1 | Mobile gestures / nav intercept | Drawer + safe area + ≥44px; transport reachable |
| M2 | Slider version storms | Commit on pointer up only |
| M3 | Limiter-last UX | Prevent in UI; still handle 400 |
| M4 | Optimistic reorder | Prefer success-then-commit |

### LOW — closed / OUT

| ID | Topic | Decision |
|----|-------|----------|
| L1 | Jargon | Polish labels (Appendix A) |
| L2 | Desktop-only DnD | ↑↓ mandatory |
| L3 | Metering scope creep | OUT |

---

## 27. Conditions (binding for implementation)

1. UI → API → document → `StudioAudioEngine` only.  
2. Shared `StudioFxChainEditor` for Track and Master.  
3. FX UI meta exported from registry module family — no second catalog.  
4. Track PATCH returns + UI applies `documentVersion`.  
5. Master Gain/Pan = Option A + CAS.  
6. No autosave; commit on pointer up / keyboard commit.  
7. Mobile ↑↓ + one expanded FX + drawer/sheet.  
8. Never ignore `409`; never disable CAS.  
9. No PlayerProvider / E3 Mix / second AudioContext.  
10. Param ranges only those already validated in `studio-fx-chain` parsers.

---

## 28. Final GO / NO-GO

```text
P6.4 DESIGN FREEZE: GO
```

Architecture Audit conditions are **resolved and frozen**. Implementation may proceed only after Owner GO, in sequence P6.4.1 → P6.4.7.

**Do not implement UI in this step.**

---

## Appendix A — Polish labels (frozen defaults)

| Concept | Label |
|---------|--------|
| Effects | Efekty |
| Add effect | Dodaj efekt |
| Empty chain | Brak efektów. Dodaj efekt. |
| Enabled | Włączony |
| Disabled | Wyłączony |
| Move up / down | W górę / W dół |
| Remove | Usuń |
| Master | Master |
| Gain | Głośność |
| Pan | Panorama |
| EQ | EQ |
| Compressor | Kompresor |
| Limiter | Limiter |
| Reverb | Pogłos |
| Delay | Delay |
| Threshold | Próg |
| Ratio | Stopień kompresji |
| Attack | Atak |
| Release | Zwolnienie |
| Makeup | Wyrównanie |
| Ceiling | Sufit |
| Mix (wet) | Poziom efektu |
| Decay | Zanikanie |
| Time | Czas |
| Feedback | Sprzężenie |
| Q | Q |
| Frequency | Częstotliwość |
| Refresh | Odśwież |
| Conflict | Projekt został zmieniony w innej sesji. Odśwież dane i spróbuj ponownie. |

Brand string **Studio** remains English.

---

## Appendix B — Parameter ranges (authoritative; UI must match)

From `studio-fx-chain` parsers (do not widen):

**EQ:** low Hz 20–500 def 120; mid 200–5000 def 1000; high 2000–20000 def 8000; gainDb −12…12; Q low/high 0.1–12 def 0.7; mid Q 0.1–18 def 1.

**Compressor:** thresholdDb −60…0 def −24; ratio 1–20 def 3; attackMs 0–200 def 10; releaseMs 10–2000 def 100; makeupDb −12…12 def 0.

**Limiter:** thresholdDb −24…0 def −1; ceilingDb −6…0 def −0.1.

**Reverb:** mix 0–1 def 0; decaySeconds 0.1–6 def 1.2.

**Delay:** mix 0–1 def 0; timeMs 1–2000 def 250; feedback 0–0.95 def 0.25.

**Suggested UI steps (render only):** gain/dB 0.1–0.5; mix 0.01; time 1 ms; Q 0.1 — finalize in P6.4.2 metadata without changing server bounds.

---

## Appendix C — Next step

```text
Owner GO → P6.4.1 Master Gain/Pan mutation contract
         + Track PATCH documentVersion return
         + shared FX UI foundation (P6.4.2 may start after 4.1 contract lands)
```

**No UI implementation before Owner GO on implementation.**  
**Production application remains `350303e`. No deploy in this freeze.**
