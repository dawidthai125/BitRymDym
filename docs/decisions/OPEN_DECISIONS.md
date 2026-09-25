# Otwarte decyzje (DECISION REQUIRED)

**Źródło:** [MASTER SSOT v0.1](../ssot/MASTER_SSOT_v0.1.md) §44  
**Status:** oczekuje na decyzje Product Ownera / Architekta  
**Zasada:** Cursor Agent NIE może samodzielnie wymyślać ani zamrażać tych elementów.

---

## Jak korzystać z tego rejestru

1. Każda pozycja pozostaje otwarta, dopóki nie zostanie zapisana decyzja z właścicielem, datą i skutkiem dla SSOT.
2. Po decyzji: zaktualizować SSOT (wersja + historia), przenieść wpis do `DECISION_LOG.md`, usunąć z listy otwartych.
3. Implementacja funkcji zależnych od otwartej decyzji jest zablokowana.

---

## Lista otwartych decyzji

| ID | Temat | Kontekst SSOT | Blokuje | Status |
|----|--------|---------------|---------|--------|
| OD-01 | Dokładny stack frontendowy | §44 | scaffold aplikacji, player UI | OPEN |
| OD-02 | Dokładny stack backendowy | §44 | API, walidacja serwerowa | OPEN |
| OD-03 | Szczegółowa architektura Supabase | §5, §9, §44 | Auth, Storage, schemat DB | OPEN |
| OD-04 | Operator płatności | §15, §44 | Faza 4 — Payments | OPEN |
| OD-05 | Limit pobrań — użytkownik anonimowy | §13 (wstępnie 1–2/dzień) | Download limits | OPEN |
| OD-06 | Limit pobrań — użytkownik zalogowany | §13 (wstępnie 4/dzień) | Download limits | OPEN |
| OD-07 | Ceny Premium | §15, §48 | Faza 4 | OPEN |
| OD-08 | Dokładne poziomy Premium | §4, §22–23 | Faza 4 | OPEN |
| OD-09 | Ostateczne nazwy poziomów konta | §4 (`BEGINNER_RAPPER` / `PRO_RAPPER` / `LEGEND_RAPPER` — robocze) | Profile, billing | OPEN |
| OD-10 | Finalne nazwy głosowania | §27 | Faza 2 — Voting | OPEN |
| OD-11 | Mechanizm moderacji komentarzy | §28 | Faza 2 — Comments | OPEN |
| OD-12 | Metoda kodowania audio | §9, §24 | Playback / download versions | OPEN |
| OD-13 | Metoda watermarkingu audio | §9 | Download pipeline | OPEN |
| OD-14 | Metoda miksowania nagrania z bitem | §24 | Export / publikacja utworu | OPEN |
| OD-15 | Finalna identyfikacja wizualna | §2, §41 | Design system, UI | OPEN |
| OD-16 | Finalny język marki (copy) | §2, §41 | Teksty UI / marketing | OPEN |
| OD-17 | Zasady liczenia powtórnych pobrań | §17 | Download stats | OPEN |
| OD-18 | Zasady liczenia udostępnień | §34 | Beat sharing stats | OPEN |

---

## Uwagi implementacyjne (bez zamrażania wartości)

- Limity pobrań muszą być **konfigurowalne** (`anonymous_daily_download_limit`, `user_daily_download_limit`, `premium_daily_download_limit`) — nie hardcodowane (§13).
- Feature flags płatności startują jako **wyłączone** (§14–15).
- Supabase Auth jest **preferencją roboczą**, nie ostateczną decyzją (§5).
- Retencja nagrania Premium (`premium_take_retention_days = 10`) jest przykładem konfiguracji z SSOT — nie mnożyć magicznych liczb w kodzie (§23).

---

## Szablon decyzji (do użycia w `DECISION_LOG.md`)

```text
ID: OD-XX
Data:
Decydent:
Decyzja:
Uzasadnienie:
Wpływ na SSOT / architekturę:
Wersja SSOT po aktualizacji:
```
