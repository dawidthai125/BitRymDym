# Studio Markery verse/hook — Design Freeze (A3 / P7 lite)

**Status:** FREEZE ACCEPTED — vertical slice **IN** (schema + CAS + Inspector)  
**Date:** 2026-10-28  
**OD-15:** OPEN (nie zamykać)

## A3 lite — model dokumentu

- Markery należą do dokumentu projektu (`StudioProjectDocument.markers`).
- Czas wyłącznie w **ms** (integer ≥ 0).
- Kanon zapisu: istniejący `document_version` + `studio_cas_*` (service_role). **Nie** drugi silnik persist / localStorage.

## P7 lite — produkt

- Tylko `verse` | `hook`.
- Operacje: **dodaj** (przy playhead) / **usuń**.
- UI: Inspector (mobile-first). Rysowanie na timeline **OUT** tego slice.

## IN

- Kolumna `studio_projects.markers` (jsonb array) + RPC `studio_cas_apply_markers`.
- Apply: MCP `apply_migration` (jak Scratch CAS). **Nie** `db push`. Drift OK, nie repair.
- Panel w Inspectorze (recording chrome).

## OUT

- chorus / bridge / intro · drag na timeline · snap / BPM-grid · regiony · kolory · Sacred · `studio-editor.tsx` / `studio-service.ts` w tym slice · OD-15 close
