# Studio Metronome + Loop — Design Freeze

**Status:** DESIGN FREEZE + IMPLEMENTATION (Owner GO zdejmuje OD-VS-01 w tym zakresie, 2026-10-28)  
**OD-15:** OPEN

## IN

- Metronom: klik BufferSource na **tym samym** `StudioAudioEngine` context.
- Loop regionu: wrap playhead / seek na istniejącym clock (practice + rec).
- Transport toggle (nie disabled chrome).

## OUT

- Drugi AudioContext · oscillator engine · sample-accurate grid · VST · piano roll.

## Reuse

`studio-daw-clock.ts` · `StudioTransportProvider` · `StudioAudioEngine.getContextForAux`.
