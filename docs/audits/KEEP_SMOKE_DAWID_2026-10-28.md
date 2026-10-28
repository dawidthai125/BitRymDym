# Keep smoke — sesja Dawida — 2026-10-28

**Status:** **PASS** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED** · `dpl_*` / alias **NOT VERIFIED**  
**GO:** Owner „ty zrob test” = Keep smoke w Cursor Browser.  
**Tip living (przed docs):** `26db6343416c0f13c7ac22e24393529a0301794c` = `origin/main` (`git rev-parse` + `ls-remote`).  
**Egress:** Master **0.0 dB** · **nie** kliknięto transport **Odtwórz** ani workflow **▶ Odtwórz** · jeden krótki take (nie bulk master).

## Kroki (FACT)

| Krok | Wynik |
|------|--------|
| Sesja | `www.bitrymdym.pl` · Menu „Dawid” |
| Projekt | `/studio/p/178e902d-6ecf-4ef6-910c-d85612bb277c` · „Projekt z bitem” · 97 BPM |
| Wokal | `Uzbrojenie nagrywania` **pressed** · Record → ścieżka Wokal |
| Mic | Permission **granted** · Intel Smart Sound Array · „Przygotuj mikrofon” → **● Nagraj** |
| REC | Start z playhead `00:00.000` · **■ Zatrzymaj nagrywanie** · długość UI **18.0 s** (cel 1–3 s przekroczony przez opóźnienie snapshotu w trakcie RECORDING — jeden take, nie master) |
| Po Stop | Status **„Nagranie gotowe — kliknij Zachowaj, żeby wstawić na ścieżkę.”** · przycisk **✓ Zachowaj** widoczny |
| Zachowaj | Klik → **Zapisywanie…** → clip na osi |
| Clip | Waveform Wokal `00:00.000–00:18.000` · Inspector **Rodzaj: TAKE** · start `00:00.000` · długość `00:18.000` |
| Network (hook `fetch`) | `POST /api/takes/finalize` **200** · `POST …/record/place` **201** |

## Nie potwierdzone

- Słyszalność take / metronom / loop (Loop i Metronom na www: **„niedostępne w tej wersji Studio”**).
- `dpl_*` / bind aliasu do living tip.
- Auto-place po Stop — **nie** wystąpił; place dopiero po **Zachowaj**.
