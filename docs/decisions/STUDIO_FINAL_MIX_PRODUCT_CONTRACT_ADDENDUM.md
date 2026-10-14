# STUDIO FINAL MIX — PRODUCT CONTRACT ADDENDUM

**Status:** **OWNER ACCEPTED** — product contract SSOT (documentation)  
**Accepted:** 2026-10-14  
**Type:** PRODUCT CONTRACT / SSOT ADDENDUM — **NO IMPLEMENTATION IN THIS DOCUMENT**  
**Owner:** Prezes Dawid  

**Parent freeze:** [STUDIO_FINAL_MIX_DESIGN_FREEZE.md](./STUDIO_FINAL_MIX_DESIGN_FREEZE.md)  
**Bake/artifact freeze:** [STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md](./STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md) (OD-SFM-F01…F07)  
**Supersedes (product ladder scope):** **OD-SFM-02** (historical WAV-only MVP) — see §16  

```text
PRODUCT CONTRACT: OWNER ACCEPTED (2026-10-14)
IMPLEMENTATION: NOT AUTHORIZED BY THIS DOCUMENT ALONE
PRODUCTION / CONTABO / PAYMENTS: NOT CHANGED BY THIS DOCUMENT
EXISTING WAV-ONLY CODE PATH: REMAINS UNTIL SEPARATE IMPLEMENTATION GO
```

---

## 1. Cel i granice produktu

Studio Final Mix jest osobnym produktem finalizacji utworów.

Studio Final Mix **nie jest** semantycznie tym samym co E3 MixPanel, `mix_sessions` ani `TAKE_EXPORT`. Dozwolone jest ponowne wykorzystanie wzorców technicznych (AuthZ, idempotencja, Storage, joby), ale **bez** wspólnego, niejawnego kontraktu biznesowego ani współdzielenia limitów / uprawnień z tymi domenami.

Niniejszy dokument **nie** dowodzi, że opisane funkcjonalności już istnieją w kodzie lub na produkcji.

---

## 2. OD-SFM-07 — Drabinka jakości (**ACCEPTED**)

Docelowa macierz pobierania Studio Final Mix:

| Plan | Odsłuch | MP3 128 | MP3 192 | MP3 320 | WAV | Dzienny limit pierwszego pobrania wersji |
|------|---------|---------|---------|---------|-----|-----------------------------------------:|
| FREE | Tak | Nie | Nie | Nie | Nie | 0 |
| BRONZE | Tak | Tak | Nie | Nie | Nie | 1 |
| SILVER | Tak | Tak | Tak | Nie | Nie | 2 |
| GOLD | Tak | Tak | Tak | Tak | Tak | 5 |

- MP3: CBR **128 / 192 / 320** kbps (parametry kodeka — konfrontacja z `src/config/audio-render.ts` przy implementacji; ten dokument nie twierdzi, że multi-variant Studio jest już wdrożony).
- WAV: parametry techniczne (sample rate / bit depth) — potwierdzić względem aktualnej konfiguracji przy Implementation GO; nie uznawać za zaimplementowane wyłącznie na podstawie tego addendum.
- Wszystkie warianty powinny być **widoczne** w UI także gdy zablokowane.
- Autoryzacja jakości i pobrania jest **zawsze** egzekwowana przez backend (UI nie jest AuthZ).

Ta macierz dotyczy **wyłącznie** Studio Final Mix (≠ TAKE_EXPORT ladder ≠ beat `downloadsDaily` ≠ `PREMIUM_TIER_MATRIX` capabilities bez osobnego resolvera SFM).

---

## 3. OD-SFM-08 — Osobne etapy MIX i MASTERING (**KIERUNEK ACCEPTED · SHAPE TECHNICZNY OPEN**)

Sekwencja domenowa:

```text
ACCEPTED_VERSION → MIX → MASTERING → EXPORT_VARIANTS (on-demand)
```

- MIX nie rozpoczyna się bez akceptacji konkretnej wersji.
- MASTERING nie rozpoczyna się przed sukcesem MIX.
- Eksport finalny / generowanie wariantu nie rozpoczyna się przed sukcesem MASTERING.
- Status zadania joba technicznego **nie** zastępuje statusu domenowego.
- Etapy są domeną Studio Final Mix — **nie** E3 MixPanel / `mix_sessions`.

**OPEN (przed Implementation GO):** dokładny podział na osobne rodzaje jobów vs checkpointy vs trwałe rekordy etapów — wymaga osobnego design freeze.

---

## 4. OD-SFM-09 — Akceptacja konkretnej wersji (**ACCEPTED**)

- Użytkownik zatwierdza wersję przyciskiem **„Zatwierdź do finalizacji”**.
- Akceptacja dotyczy konkretnej, **niezmiennej** wersji (trwały identyfikator wersji / snapshot) — nie tytułu, nazwy pliku ani URL.
- Zapis i odsłuch **nie** stanowią akceptacji.
- Bez akceptacji MIX nie może się rozpocząć.
- Zmiana projektu po akceptacji **nie** przenosi akceptacji na nową treść; nowa wersja wymaga ponownego zatwierdzenia.

---

## 5. OD-SFM-10 — Aktualność i historia (**ACCEPTED · retencja szczegółów OPEN**)

Rozróżniać:

1. aktualny final;
2. historyczny final;
3. prawo do pobrania konkretnej wersji;
4. status techniczny artefaktu (`READY` ≠ aktualny final).

Po powstaniu nowej zaakceptowanej / sfinalizowanej wersji stary final **nie** może być prezentowany ani autoryzowany jako **aktualny**.

Wcześniej uprawnione wersje historyczne wolno pobierać ponownie, jeśli:

- istnieje ważne uprawnienie;
- plik nadal istnieje;
- nie upłynęła retencja;

UI musi jednoznacznie oznaczać je jako **historyczne**.

Retencja: **90 dni** (patrz OD-SFM-12 — szczegóły start/koniec OPEN).

---

## 6. OD-SFM-11 — Autoryzacja serwerowa (**ACCEPTED**)

Backend jest źródłem prawdy dla:

- właściciela projektu i artefaktu;
- planu i dozwolonej jakości;
- akceptacji oraz etapów finalizacji;
- limitu dziennego i płatnego slotu;
- istnienia wcześniejszego uprawnienia (grant wersji);
- aktualności vs historyczności.

Dane klienta o limicie / uprawnieniach **nie są zaufane**.

Operacje odrębne:

1. zlecenie / generowanie eksportu wariantu;
2. przyznanie prawa (grant) do pierwszego pobrania wersji;
3. wydanie signed URL.

Ponowne wydanie URL **nie** zużywa kolejnego dziennego limitu ani płatnego slotu.

---

## 7. OD-SFM-12 — Retencja (**90 dni ACCEPTED · szczegóły OPEN**)

- Retencja finalnych artefaktów Studio Final Mix: **90 dni**.
- Zakup dodatkowego slotu **nie** powinien sam w sobie przedłużać retencji (**propozycja / oczekiwanie produktowe**; formalne zamknięcie szczegółów poniżej).

**OPEN przed implementacją / sprzedażą obietnic:**

- moment rozpoczęcia liczenia 90 dni;
- zachowanie **bieżącego** finala po upływie TTL;
- zachowanie metadanych / historii po usunięciu pliku;
- wpływ (lub brak wpływu) płatnego slotu na retencję — zamrozić przy Implementation GO.

Nie obiecywać bezterminowej dostępności plików.

---

## 8. OD-SFM-13 — Dzienny limit pierwszych pobrań (**ACCEPTED**)

| Plan | Limit nowych grantów pierwszego pobrania / dzień |
|------|-------------------------------------------------:|
| FREE | 0 |
| BRONZE | 1 |
| SILVER | 2 |
| GOLD | 5 |

- Limit dotyczy **pierwszego pobrania nowej wersji** (przyznania grantu wersji), nie liczby kliknięć ani re-downloadów już uprawnionej wersji.
- Reset: północ **`Europe/Warsaw`** (DST) — OD-SFM-18.
- Licznik **serwerowy**, odporny na równoległe żądania.
- **Zakaz** cichego współdzielenia z beat downloads, TAKE_EXPORT i RAW take downloads — osobny kontrakt / ledger Studio Final Mix.

---

## 9. OD-SFM-14 — Dodatkowy slot 7,99 PLN (**CENA + SEMANTYKA LIMITU ACCEPTED · reszta OPEN**)

### Wiążąca semantyka (Owner ACCEPTED)

Płatność **7,99 PLN** zapewnia **jeden jednorazowy dodatkowy limit pierwszego pobrania w danym dniu**.

- Jest to jednorazowe zwiększenie dziennego limitu pierwszych pobrań, **nie** nielimitowany download, abonament ani wielokrotne użycie tego samego slotu.
- Slot służy do **jednego** dodatkowego pierwszego pobrania wersji, dla której użytkownik nie ma jeszcze grantu.
- Po wykorzystaniu slot **nie** może być użyty ponownie.
- Ponowne pobranie wcześniej uprawnionego pliku / wersji **nie** zużywa nowego grantu ani nowego płatnego slotu.
- Zakup **nie** omija: właściciela, etapów finalizacji (Accept → MIX → MASTER), aktualności wersji ani jakości niedostępnych w planie.

### Nadal OPEN

- termin ważności **niewykorzystanego** slotu;
- dokładny moment przypisania slotu do wersji;
- zachowanie przy zmianie planu;
- zwrot **po** wykorzystaniu slotu (polityka);
- dostawca płatności i kontrakt webhooków / idempotencji płatności.

### Zwroty (ramy)

- Zwrot **przed** wykorzystaniem: unieważnia niewykorzystany slot.
- Zwrot **po** wykorzystaniu: polityka **OPEN**.

Płatność musi być idempotentna: powtórzony webhook nie przyznaje drugiego slotu; płatność nieudana / anulowana nie przyznaje slotu.

---

## 10. OD-SFM-15 — Ponowne pobranie (**ACCEPTED**)

Po przyznaniu grantu na konkretną wersję użytkownik może wielokrotnie pobierać uprawnione formaty tej wersji **bez** zużywania kolejnych dziennych grantów ani płatnych slotów.

Tożsamość wersji = trwałe identyfikatory (nie tytuł / filename / URL).

---

## 11. OD-SFM-16 — Nowa wersja po edycji (**ACCEPTED**)

Zmiana utworu skutkująca nową wersją wymaga:

1. nowej akceptacji („Zatwierdź do finalizacji”);
2. nowego MIX;
3. nowego MASTERING;
4. nowego grantu przy pierwszym pobraniu.

Wcześniejszy grant **nie** przenosi się na nową wersję. Nowe uprawnienie podlega aktualnemu planowi oraz dziennemu limitowi albo płatnemu slotowi.

---

## 12. OD-SFM-17 — Grant wersji, nie jakości (**ACCEPTED**)

Jeden grant uprawnia do pierwszego pobrania **konkretnej wersji** we **wszystkich jakościach dozwolonych przez aktualny plan**.

Przykład: SILVER z grantem na V1 może pobrać MP3 128 i MP3 192 bez zużycia kolejnego dziennego limitu.

Grant **nie** odblokowuje jakości poza planem.

Po obniżeniu planu:

- istniejące uprawnienie do wersji pozostaje;
- re-download wcześniej uprawnionej jakości pozostaje dozwolony;
- **nowa** jakość, do której użytkownik wcześniej nie miał prawa, podlega **aktualnemu** planowi.

---

## 13. OD-SFM-18 — Granica dnia (**ACCEPTED**)

Dzienny limit resetuje się o północy w strefie **`Europe/Warsaw`**.

Implementacja musi jawnie obsługiwać strefę i DST (dzień ≠ zawsze 24h).

---

## 14. Generowanie na żądanie (**ACCEPTED**)

Warianty finalne generowane są **na żądanie** (lazy), gdy użytkownik ma prawo i żąda konkretnej jakości.

System **nie** generuje automatycznie wszystkich jakości dla każdej wersji.

Generowanie nie może startować przed sukcesem MASTERING. Żądania tej samej wersji×jakości muszą być idempotentne (bez niekontrolowanych duplikatów).

---

## 15. Relacja do OD-SFM-F01…F07 (**OPEN uzgodnienie przed multi-format impl**)

Bake/artifact freeze (OD-SFM-F01…F07) pozostaje w mocy dla zrealizowanego WAV MVP (m.in. F02 klucz `…/WAV.wav`, F03 retention reuse w ówczesnym zakresie).

Ten kontrakt **rozszerza** produkt o multi-variant + limity + etapy domenowe. Przed Implementation GO multi-format wymagane jest jawne uzgodnienie:

- nowych kształtów object key (poza samym `WAV.wav`);
- relacji 90-dniowej retencji produktowej (OD-SFM-12) do F03 / `artifactRetentionSeconds`;
- braku cichego naruszenia F01…F07.

Do uzgodnienia: status **OPEN** (nie ACCEPTED jako F-addendum w tym commicie).

---

## 16. Formalne zastąpienie OD-SFM-02

| Pole | Wartość |
|------|---------|
| Historyczna decyzja | **OD-SFM-02** — MVP format ladder = WAV-only |
| Status od 2026-10-14 | **SUPERSEDED (product ladder scope)** przez to addendum (OD-SFM-07+) |
| Historia | Zachowana w [STUDIO_FINAL_MIX_DESIGN_FREEZE.md](./STUDIO_FINAL_MIX_DESIGN_FREEZE.md) §13 — **nie usuwać** pierwotnego brzmienia |
| Living product ladder | OD-SFM-07 (ten dokument) |
| Kod / runtime dziś | Ścieżka WAV-only MVP może nadal istnieć do osobnego Implementation GO — **ten dokument nie wdraża** multi-variant |

---

## 17. Warunki przed implementacją i produkcją

**Przed Implementation GO:**

- formalne ACCEPT niniejszego addendum — **DONE (2026-10-14)**;
- jawne supersede OD-SFM-02 — **DONE (docs)**;
- design freeze modelu wersji i etapów (zamknięcie OPEN OD-SFM-08 shape);
- model limitów / ledger / płatnego slotu (zamknięcie OPEN OD-SFM-14 gdzie blokuje kod);
- uzgodnienie F01–F07 vs multi-format + retencja;
- osobny Owner GO na kod.

**Przed Production / Ops GO:**

- osobny GO na migracje / worker / Contabo / płatności live;
- brak domniemania, że ACCEPT kontraktu = deploy lub enable poller.

---

## 18. Rejestr statusów decyzji (ten addendum)

| ID | Temat | Status |
|----|--------|--------|
| OD-SFM-07 | Drabinka jakości + limity dzienne (macierz) | **ACCEPTED** |
| OD-SFM-08 | Osobne etapy MIX/MASTER (kierunek) | **ACCEPTED (kierunek)** · **OPEN (shape techniczny)** |
| OD-SFM-09 | „Zatwierdź do finalizacji” | **ACCEPTED** |
| OD-SFM-10 | Aktualny vs historyczny final | **ACCEPTED** |
| OD-SFM-11 | AuthZ serwerowa | **ACCEPTED** |
| OD-SFM-12 | Retencja 90 dni | **ACCEPTED (90d)** · **OPEN (start/TTL current/metadane)** |
| OD-SFM-13 | Limity 0/1/2/5 | **ACCEPTED** |
| OD-SFM-14 | Slot 7,99 PLN (semantyka limitu dnia) | **ACCEPTED (semantyka)** · **OPEN (TTL/bind/refund-after/provider)** |
| OD-SFM-15 | Re-download bez nowego grantu | **ACCEPTED** |
| OD-SFM-16 | Nowa wersja = nowy proces + grant | **ACCEPTED** |
| OD-SFM-17 | Grant per wersja (nie per jakość) | **ACCEPTED** |
| OD-SFM-18 | Reset `Europe/Warsaw` + DST | **ACCEPTED** |
| OD-SFM-02 | WAV-only MVP | **SUPERSEDED (product ladder)** — historia zachowana |
| OD-SFM-F01…F07 | Bake/artifact | **IN FORCE** · multi-format relation **OPEN** |
