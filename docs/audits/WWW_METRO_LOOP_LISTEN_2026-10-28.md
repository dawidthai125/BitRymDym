# www Metro/Loop Play + TAKE listen — 2026-10-28

**Status:** AudioContext **running** **PASS** · TAKE ścieżka odtwarzania **PASS** · ucha (klik / wokal) **NOT VERIFIED** · loop wrap **NOT VERIFIED** · `dpl_*` **NOT VERIFIED** · alias SHA bind **NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**  
**GO:** Owner „Go pracujcie wszyscy” = NEXT po www metro chrome (Play + listen TAKE).  
**Egress:** jeden krótki Play · Bit **wyciszony** w trakcie · Master **0.0 dB** · Stop po playhead **00:09.192** · **nie** bulk masters · **nie** długi odsłuch.

## 1. Żywy Git (FACT)

| Pole | Wartość |
|------|---------|
| `git rev-parse HEAD` | `c52f38c47d830bd17cae30ce7445f59827335dfc` |
| `git ls-remote origin refs/heads/main` | ten sam SHA |
| Subject | `docs: record www metro loop runtime vs Keep smoke history` |
| Parent | `c3b80636622316b999ffbeece33c46274d6357c6` |
| Kod DAW | `01629f531c82bdf66c8019c90f5597597586bf1b` — ancestor |

## 2. GitHub Production (FACT)

| SHA | GH deployment | state | unique URL |
|-----|---------------|-------|------------|
| `c52f38c` living tip | **`7380550674`** `2026-10-28T08:25:35Z` | **success** | `https://bitrymdym-j7wf3q5lf-dawidthai125s-projects.vercel.app` |
| `c3b8063` HISTORY | **`7380377160`** | success | `bitrymdym-6m0t2jn31-…` |

`dpl_*` **NOT VERIFIED**. Alias → SHA **NOT VERIFIED**.

## 3. Sesja / projekt (FACT)

Cursor Browser · Menu **„Dawid”** · `https://www.bitrymdym.pl/studio/p/178e902d-6ecf-4ef6-910c-d85612bb277c` · „Projekt z bitem” · 97 BPM.

| Kontrolka | Stan przed Play |
|-----------|-----------------|
| Loop | **„Loop włączony”** `aria-pressed=true` |
| Metronom | **„Metronom włączony”** `aria-pressed=true` · title **„Metronom — klik runtime”** |
| Master | **0.0 dB** (slider nie obniżany — uniknięto dodatkowego CAS) |
| Bit | **Wycisz** `pressed=true` (potem przywrócone `false`) |
| Wokal | nie wyciszony |

## 4. Play — metronom + loop (FACT)

| Obserwacja | Wartość |
|------------|---------|
| Transport | **Odtwórz** → status **„Odtwarzanie”** · Pauza enabled · Odtwórz disabled |
| `AudioContext` | **utworzony** · `state=running` · `sampleRate=48000` |
| `currentTime` (≈2.2 s po sondzie) | **9.2 s** |
| Playhead | **00:09.192** (start **00:00.000**) |
| Toasty / `role=alert` | **0** |
| Stop | playhead z powrotem **00:00.000** · status **„Gotowy”** |

**Werdykt 1:** audio context **startuje** = **PASS**. Słyszalny klik metronomu / wrap loop **NOT VERIFIED** (agent nie słyszy; wrap nie zaobserwowany w oknie ~9 s).

## 5. TAKE clip (FACT)

Keep smoke clip nadal na osi:

| Pole | Wartość |
|------|---------|
| Waveform | **00:00.000–00:18.000** (`data-testid=studio-clip-waveform`) |
| `sourceKind` | **TAKE** |
| `sourceTakeId` | `0ffb274a-6385-4162-9604-91909b66a27f` |
| `durationMs` | **18000** |
| Bit clip (osobny) | waveform **00:00.000–01:00.000** · wyciszony w Play |

Resource timing (bez tokenów / signed query):

- `GET /api/takes/preview`
- Storage `take-audio/user/…/takes/0ffb274a-…/mic.bin` (signed)
- Storage `beat-audio/platform/…/master.bin` (signed) — Bit **muted**, nie bulk download

Playhead **00:09.192** leży wewnątrz TAKE. Wokal unmuted. Brak błędu UI.

**Werdykt 2:** ścieżka odtwarzania TAKE **PASS** (clip + signed `mic.bin` + playhead w oknie). **≠ błąd**. Ucho (słyszalne vs cisza) **NOT VERIFIED**.

## 6. Restore (FACT)

Po Stop: Bit **Wycisz** z powrotem `pressed=false` · status **Gotowe**. Loop/Metro pozostawione włączone. Master nadal **0.0 dB**.

## 7. Explicit non-claim

- Product GREEN / PRODUCTION VERIFIED
- `dpl_*` / bind aliasu do SHA
- słyszalność ucha (klik metronomu, wrap loop, wokal)
- markery schema+CAS
- Contabo / SFM
