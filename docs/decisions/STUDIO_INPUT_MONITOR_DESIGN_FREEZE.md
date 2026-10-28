# Studio Input Monitor — Design Freeze

**Status:** DESIGN FREEZE + IMPLEMENTATION (Owner GO Studio vs DAW 2026-10-28)  
**OD-15:** OPEN

## IN

- Suchy monitor: `MediaStreamSource` → gain → destination **tego samego** Studio context.
- Mix: słychać, gdy transport gra (bit + monitor).
- Jawne echo / latencja przeglądarki.
- P5.8 `useMicAnalyser` + `BrdInputMonitor` **zostaje**.

## OUT

- Hardware low-latency I/O · drugi analyser · drugi silnik.
