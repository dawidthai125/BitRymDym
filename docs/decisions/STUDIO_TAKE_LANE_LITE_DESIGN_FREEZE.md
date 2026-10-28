# Studio Take Lane Lite — Design Freeze

**Status:** DESIGN FREEZE + IMPLEMENTATION (Owner GO Studio vs DAW 2026-10-28)  
**OD-15:** OPEN

## IN

- Lista READY (`listReadyTakesForStudioPlace`) w panelu Record.
- **Umieść** = istniejący `record/place`.
- **Zastąp** = MUST: overlapping TAKE na ścieżce → `deleteStudioClipFor` + place (CAS).

## OUT

- Comping lanes · playlisty FL · auto-place po Stop (P5.6).
