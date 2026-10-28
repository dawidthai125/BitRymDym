# Studio Punch-in/out + Count-in — Design Freeze

**Status:** DESIGN FREEZE + IMPLEMENTATION (Owner GO Studio vs DAW 2026-10-28)  
**Scope:** 1 uzbrojona ścieżka · istniejący TAKE pipeline · NIE Sacred  
**OD-15:** OPEN

## IN

- Count-in 0/1/2/4 takty z `tempoBpm` projektu.
- Punch-in/out w ms na jednej uzbrojonej ścieżce.
- REC start po count-in; auto-stop na punch-out.
- Finalize = istniejący `stopAndFinalize` (READY, **bez** auto-place — P5.6).

## OUT

- Multi-track REC · Sacred eligibility · piano roll · P6 automation · SFM.

## Reuse

`studio-daw-clock.ts` · `studio-recording-panel.tsx` · `uploadTakeRecordingBlob` · `placeReadyTakeAsStudioClip`.
