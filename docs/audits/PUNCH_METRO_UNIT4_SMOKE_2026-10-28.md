# Unit 4 — punch / count-in / metro+loop smoke — 2026-10-28

**Status:** **PASS** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED** · `dpl_*` / alias this tip **NOT VERIFIED**  
**GO:** living NEXT po tipie mix-working docs · Owner unit 4 punch/metro.  
**Tip living (przed docs):** `d25aa29a23a327b1faff98562c644463073e5878` = `origin/main` (`git rev-parse` + `ls-remote`).  
**Kod DAW:** `01629f5` — **ancestor** HEAD (`merge-base --is-ancestor` exit 0).  
**Egress:** Master **−11.5 dB** · transport **Odtwórz** **nie** kliknięty jako osobny Play master · jeden krótki take (REC z accompaniment runtime, nie bulk master).

## Sesja / projekt (FACT)

| Pole | Wartość |
|------|---------|
| Sesja | `www.bitrymdym.pl` · Menu „Dawid” |
| Projekt | `/studio/p/178e902d-6ecf-4ef6-910c-d85612bb277c` · „Projekt z bitem” |
| Hard reload | navigate → ten sam URL |
| Wokal | `Uzbrojenie nagrywania` **pressed** (track `bb80c14e-…`) |

## Transport Loop / Metronom (FACT)

| Kontrolka | Start | Po toggle |
|-----------|-------|-----------|
| Loop (`studio-transport-loop`) | released · enabled | **„Loop włączony”** `pressed` |
| Metronom | released · enabled | **„Metronom włączony”** `pressed` |

Query placeholder „niedostępne”: **0**.

## Count-in / punch UI (FACT)

Panel Record (Inspector):

| Kontrolka | Stan |
|-----------|------|
| Combobox **Count-in** | widoczny · wartość **1 takt** (opcje 0/1/2/4) |
| Checkbox **Punch-in/out na uzbrojonej ścieżce** | widoczny (sekcja „Count-in / punch”) |

Punch **nie** włączony w tym smoke (wystarczy widoczność + count-in=1 przy REC).

## Krótki REC → Zachowaj (FACT)

| Krok | Wynik |
|------|--------|
| Mic | „Przygotuj mikrofon” → **„Mikrofon działa”** · Intel Smart Sound Array |
| Start | **● Nagraj** przy Count-in **1 takt** · Loop+Metro ON · Wokal armed |
| REC | Status **TRYB NAGRYWANIA** · playhead ~14 s w trakcie · Stop → UI długość **19.0 s** (cel 1–3 s przekroczony przez opóźnienie harnessu — jeden take, jak Keep smoke) |
| Po Stop | **„Nagranie gotowe — kliknij Zachowaj…”** · **✓ Zachowaj** |
| Zachowaj | `POST /api/takes/finalize` **200** · `POST …/record/place` **201** |
| Clip | TAKE `507d9cc2-…` · start `00:00.000` · długość `00:19.000` · Inspector **Rodzaj: TAKE** |

## Cleanup (FACT)

| Krok | Wynik |
|------|--------|
| Usuń klip | toolbar Usuń → **Potwierdź usunięcie** |
| Network | `DELETE …/clips/ad8e362a-0220-4976-a4c9-f57428e380dd` **200** |
| Po cleanup | waveform **00:19.000** / take id **nie** obecne · Bit `00:00–01:00` zostaje · starszy leftover `00:07.969–00:24.702` (pre-existing Keep) **nietknięty** |

Źródło TAKE pozostaje (UI: „Usunięcie dotyczy tylko klipu na osi”). Soft-delete take **nie** w zakresie.

## Explicit non-claim

- słyszalność metronomu / count-in / punch-in runtime (ucho Owner)
- punch ON + okno punch-in/out ćwiczone end-to-end
- `dpl_*` / alias bind do living tip `d25aa29`
- unit 5 jog · Product GREEN · PRODUCTION VERIFIED
- full master Play (celowo nie)

## NEXT

unit 5 jog = **osobne GO Ownera** · **≠ Product GREEN**.
