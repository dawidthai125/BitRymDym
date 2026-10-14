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

## 3. OD-SFM-08 — Osobne etapy MIX i MASTERING (**OWNER ACCEPTED — wariant C**)

Sekwencja domenowa:

```text
ACCEPTED_VERSION → MIX → MASTERING → EXPORT_VARIANTS (on-demand)
```

**Owner ACCEPT (2026-10-14) — wariant C:**

- Trwałe **rekordy domenowych etapów** powiązane z zaakceptowaną wersją.
- Joby wykonawcze pozostają **osobną warstwą techniczną**.
- MIX i MASTER są odrębnymi etapami domenowymi.
- MIX MVP może być **lekkim** etapem przygotowania i walidacji.
- Właściwy offline bake odbywa się w **MASTER**.
- **Zakaz** utożsamiania Studio MIX z E3 `render_jobs.kind = 'MIX'` oraz scalania z `mix_sessions` / `TAKE_EXPORT`.
- Status joba technicznego **nie** zastępuje statusu domenowego.

Szczegółowy Design Freeze etapów: [STUDIO_FINAL_MIX_VERSION_STAGES_DESIGN_FREEZE_PROPOSAL.md](./STUDIO_FINAL_MIX_VERSION_STAGES_DESIGN_FREEZE_PROPOSAL.md) (**OWNER ACCEPTED** docs · nazwy domenowe `SFM_MIX` / `SFM_MASTER` · **NOT IMPLEMENTED**).

**Nadal nie zaimplementowane** — ta decyzja jest dokumentacyjna.

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

Retencja: **90 dni** (patrz OD-SFM-12 — **ACCEPTED**).

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

## 7. OD-SFM-12 — Retencja (**OWNER ACCEPTED**)

- Retencja finalnej wersji Studio Final Mix: **90 dni**.
- Zegar zaczyna się w momencie **`MASTER_SUCCEEDED` / final eligibility** dla konkretnej wersji.
- Wszystkie warianty jakości tej wersji dzielą **ten sam** punkt odniesienia retencji.
- Po TTL: jeśli `current_final_version_id` wskazuje wygasłą wersję → **usuń wskaźnik**; wygasła wersja **nie** może być prezentowana jako aktualny final.
- Zachować **tombstone**, metadane historii i audyt uprawnień.
- Uprawnienie logiczne do wersji **nie** gwarantuje fizycznego istnienia pliku.
- Regeneracja dopuszczalna tylko gdy istnieją wymagane źródła i snapshot oraz AuthZ nadal pozwala.
- Zakup dodatkowego slotu **nie** przedłuża retencji.
- Nie obiecywać bezterminowego przechowywania ani odtwarzania plików.

**F03b OWNER ACCEPTED (docs):** [F-addendum](./STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md) — SFM-only 90d; historical F03 superseded **for Studio Final Mix only**. Shipping code may still use matrix until Implementation GO.

**Nadal nie zaimplementowane.**

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

## 9. OD-SFM-14 — Dodatkowy slot 7,99 PLN (**OWNER ACCEPTED — wariant B**)

Płatność **7,99 PLN** zapewnia **jeden jednorazowy dodatkowy limit pierwszego pobrania w danym dniu**.

**Owner ACCEPT (2026-10-14) — wariant B:**

- Po potwierdzeniu płatności slot może mieć stan **`AVAILABLE`**.
- Slot wiąże się z konkretną wersją **atomowo przy przyznawaniu grantu** pierwszego pobrania (nie przy samym checkout).
- Niewykorzystany slot **wygasa o północy `Europe/Warsaw`** i **nie** przechodzi na kolejny dzień.
- Ponowne pobranie wcześniej uprawnionej wersji **nie** zużywa grantu ani slotu.
- Zwrot **przed** wykorzystaniem → odebranie (`REVOKED`) niewykorzystanego slotu.
- Zwrot **po** wykorzystaniu → **zachować** już przyznany grant; **nie** cofać grantu automatycznie; **nie** przyznawać ponownie dziennego limitu.
- Zakup **nie** omija: właściciela, Accept → MIX → MASTER, aktualności wersji ani jakości poza planem.
- Zdarzenia odrębne: zakup → potwierdzenie płatności → `AVAILABLE` → grant → generowanie pliku → URL.
- Płatność / webhook **idempotentne**; nieudana / anulowana płatność nie przyznaje slotu.

### Nadal OPEN

- dostawca płatności i szczegółowy kontrakt webhooków (**OD-04** / osobne GO);
- szczegóły implementacyjne ledgerów (nazwy tabel / RPC) — Design Freeze Implementation.

**Nadal nie zaimplementowane.**

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

## 15. Relacja do OD-SFM-F01…F07

→ [STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md](./STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md) — **OWNER ACCEPTED** (docs).

| ID | Status |
|----|--------|
| F01, F04–F07 | **IN FORCE** (unchanged) |
| F02 | **SUPERSEDED (SFM only)** by **F02b** |
| F02b | **OWNER ACCEPTED** · multi-format keys · current READY · AuthZ/downgrade · **NOT IMPLEMENTED** |
| F03 | **SUPERSEDED (SFM only)** by **F03b** |
| F03b | **OWNER ACCEPTED** · 90d from MASTER_SUCCEEDED · **NOT IMPLEMENTED** |

Kod produkcyjny może nadal realizować historyczne F02/F03 do osobnego Implementation GO.

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
- OD-SFM-08 / 12 / 14 Owner decisions — **DONE (docs)**;
- Version/Stages DF + F02b/F03b — **DONE (docs ACCEPT)** · **NOT IMPLEMENTED**;
- osobny Owner GO na **kod** (Implementation);
- osobne GO płatności (dostawca) — **OD-04 OPEN**.

**Przed Production / Ops GO:**

- osobny GO na migracje / worker / Contabo / płatności live;
- brak domniemania, że ACCEPT kontraktu = deploy lub enable poller.

---

## 18. Rejestr statusów decyzji (ten addendum)

| ID | Temat | Status |
|----|--------|--------|
| OD-SFM-07 | Drabinka jakości + limity dzienne (macierz) | **ACCEPTED** |
| OD-SFM-08 | Etapy MIX/MASTER — wariant C (durable stages + jobs) | **OWNER ACCEPTED** · **NOT IMPLEMENTED** |
| OD-SFM-09 | „Zatwierdź do finalizacji” | **ACCEPTED** |
| OD-SFM-10 | Aktualny vs historyczny final | **ACCEPTED** |
| OD-SFM-11 | AuthZ serwerowa | **ACCEPTED** |
| OD-SFM-12 | Retencja 90d od MASTER_SUCCEEDED + TTL current/tombstone | **OWNER ACCEPTED** · **NOT IMPLEMENTED** |
| OD-SFM-13 | Limity 0/1/2/5 | **ACCEPTED** |
| OD-SFM-14 | Slot 7,99 — wariant B (AVAILABLE → bind at grant; Warsaw expiry) | **OWNER ACCEPTED** · provider **OPEN** · **NOT IMPLEMENTED** |
| OD-SFM-15 | Re-download bez nowego grantu | **ACCEPTED** |
| OD-SFM-16 | Nowa wersja = nowy proces + grant | **ACCEPTED** |
| OD-SFM-17 | Grant per wersja (nie per jakość) | **ACCEPTED** |
| OD-SFM-18 | Reset `Europe/Warsaw` + DST | **ACCEPTED** |
| OD-SFM-02 | WAV-only MVP | **SUPERSEDED (product ladder)** — historia zachowana |
| OD-SFM-F01, F04–F07 | Bake/artifact (non-superseded) | **IN FORCE** |
| OD-SFM-F02 / F03 | Historical WAV key + tier retention (SFM) | **SUPERSEDED (SFM scope)** — historia zachowana |
| OD-SFM-F02b / F03b | Multi-format keys + SFM 90d | **OWNER ACCEPTED** · **NOT IMPLEMENTED** — [F-addendum](./STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md) |
