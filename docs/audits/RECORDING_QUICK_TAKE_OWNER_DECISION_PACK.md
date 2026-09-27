# RECORDING / QUICK TAKE — OWNER DECISION PACK

**Cel:** Decyzje produktowe przed LOCK Design Freeze v1.0  
**Źródła:** cold-start audit · Design Freeze proposal · MASTER SSOT §18–§24 · OPEN_DECISIONS  
**Baseline:** `c5e1f17` · Community EPIC CLOSED  

```text
IMPLEMENTATION = NONE
COMMIT / PUSH / DEPLOY = NONE
```

**Zasada tego packa:** nie pytamy o nazwy tabel, route’ów, object key, RLS ani MediaRecorder.  
Weryfikacja względem SSOT: część „OPEN” z proposalu jest **ARCHITECTURE-RESOLVABLE** — poniżej tylko prawdziwe decyzje Ownera.

---

## DECISION 01

**ID:** OD-REC-OWNER-01  
**Temat:** Czy RECORD jest osobnym prawem od PLAYBACK / DOWNLOAD?

**Obecna propozycja:** Tak — capability `RECORD` niezależne od `PLAYBACK` i `DOWNLOAD` (ten sam Access Gate, osobna reguła).

**Opcja A:** RECORD osobno (PLAYBACK ≠ RECORD, DOWNLOAD ≠ RECORD)  
**Opcja B:** Każdy z prawem PLAYBACK może nagrywać (RECORD wynika z PLAYBACK)  
**Opcja C:** RECORD tylko przy DOWNLOAD (albo odwrotnie) — silne sprzężenie z limitami pobrań

**Konsekwencje:**  
- A: jasne AuthZ; shared grant może dać odsłuch bez nagrywania (i odwrotnie, jeśli kiedyś potrzeba).  
- B: prostszy model; utrata kontroli „słucha ≠ nagrywa”; trudniej o bezpieczne shared beats.  
- C: miesza produkt download (OD-05/06) z recording; ryzyko regresji pobrań.

**REKOMENDACJA ARCHITEKTONICZNA:** Opcja A minimalizuje duplicate AuthZ i nie rusza OD-05/06. Wybór należy do Ownera (semantyka dostępu).

---

## DECISION 02

**ID:** OD-REC-OWNER-02  
**Temat:** Anonymous Quick Take w pierwszym EPIC / V1?

**Obecna propozycja:** SSOT §20 dopuszcza anon QT „jeżeli pozwalają ustawienia”; Design Freeze zostawia to OPEN.

**Opcja A:** V1 = tylko zalogowani (BEGINNER+); anon QT później  
**Opcja B:** V1 obejmuje anon QT (30 s, krótki TTL, CTA login)  
**Opcja C:** Anon może nagrywać lokalnie w przeglądarce bez uploadu (brak serwerowego take)

**Konsekwencje:**  
- A: mniejszy abuse surface; szybszy bezpieczny MVP.  
- B: zgodne z pełnym SSOT §20; wymaga tożsamości anon + janitor + limity od dnia 1.  
- C: słaby produkt (znikające próbki); prawie bez wartości „Moje próbki”.

**REKOMENDACJA ARCHITEKTONICZNA:** A jest najtańsze bezpiecznie; B jest OK jeśli Owner priorytetuje viral test bez konta. Nie wybieramy za Ownera.

---

## DECISION 03

**ID:** OD-REC-OWNER-03  
**Temat:** Shared beat → RECORD — uprawnienie i zakres EPIC

**Obecna propozycja:** Grant capability w tym samym Access Gate; implementacja shared w Wave 5; V1 start = PUBLISHED public.

**Opcja A:** V1 tylko PUBLISHED publiczne; shared RECORD w osobnej fali po grants  
**Opcja B:** Shared grants + RECORD w scope pierwszego EPIC (przed lub wraz z Full Take)  
**Opcja C:** Shared user zawsze może RECORD jeśli ma jakikolwiek dostęp do beatu (bez osobnej flagi record)

**Konsekwencje:**  
- A: QT na katalogu działa wcześniej; historia „producent udostępnia → nagrywam” czeka.  
- B: spełnia Owner story wcześniej; większy scope (nowa domena grantów).  
- C: niebezpieczne / za szerokie — brak rozróżnienia odsłuch vs nagrywanie.

**REKOMENDACJA ARCHITEKTONICZNA:** Produktowo A vs B to priorytet roadmapy. Semantyka grantu z flagą record (nie C) jest bezpieczniejsza technicznie.

---

## DECISION 04

**ID:** OD-REC-OWNER-04  
**Temat:** Mapowanie Full Take na poziomy konta (vs SSOT „Premium”)

**Obecna propozycja:** Owner brief: BEGINNER = QT 30 s; PRO = Full Take; LEGEND = Full Take+. SSOT §22–§23 opisuje **Premium** Full Take, nie `PRO_RAPPER` (OD-08 nadal OPEN).

**Opcja A:** `PRO_RAPPER` = Full Take; `LEGEND_RAPPER` = Full Take+ (retention dłuższy); bez osobnego bytu „Premium” w V1  
**Opcja B:** Full Take dopiero po płatnym Premium (OD-04/07/08); account levels tylko QT / przyszłość  
**Opcja C:** PRO i LEGEND oba Full Take z tym samym limitem czasu; różnica tylko retention / quota

**Konsekwencje:**  
- A: spójne z briefem Ownera; wymaga zamknięcia mapowania w freeze.  
- B: zgodne z dosłownym SSOT „Premium”; Full Take poza recording MVP bez payments.  
- C: prostsze entitlementy; LEGEND bez „dłuższego nagrania”, tylko dłuższe trzymanie.

**Uwaga:** Sam wzór `MIN(beat.duration, entitlement, 180)` jest już w SSOT — **nie** jest decyzją Ownera (patrz ARCHITECTURE-RESOLVABLE). Decyzja dotyczy **komu** przypisać entitlement Full Take.

**REKOMENDACJA ARCHITEKTONICZNA:** To czysta decyzja produktowa / billing. Architektura obsłuży A–C tym samym resolverem entitlementów.

---

## DECISION 05

**ID:** OD-REC-OWNER-05  
**Temat:** Retention LEGEND (i ewentualna różnica vs PRO)

**Obecna propozycja:** BEGINNER 24 h (SSOT); Premium/PRO 10 dni (SSOT przykład); LEGEND „dłużej niż PRO” — bez liczby.

**Opcja A:** LEGEND = 30 dni (przykład)  
**Opcja B:** LEGEND = 10 dni jak PRO (różnica indziej: quota / download)  
**Opcja C:** Inna wartość podana przez Ownera (np. 14 / 60 / bezterminowe — bezterminowe **niezalecane** technicznie wobec SSOT „temporary”)

**Konsekwencje:** Koszt storage, janitor, UX „Moje próbki”, wartość LEGEND.

**REKOMENDACJA ARCHITEKTONICZNA:** Unikać indefinite retention w V1. Liczbę wybiera Owner; mechanizm `expires_at` + janitor jest techniczny.

---

## DECISION 06

**ID:** OD-REC-OWNER-06  
**Temat:** Czy owner może nagrywać na własnym bicie **nieopublikowanym** (DRAFT / REJECTED)?

**Obecna propozycja:** V1 wąsko = tylko PUBLISHED; own non-published = OPEN.

**Opcja A:** Tylko PUBLISHED (publiczny katalog)  
**Opcja B:** PUBLISHED + własny DRAFT/REJECTED (producent testuje przed submit)  
**Opcja C:** Także PENDING/APPROVED własny — szersze

**Konsekwencje:**  
- A: najprostsze AuthZ.  
- B: sensowne dla community producers; więcej ścieżek testowych.  
- C: rzadko potrzebne; większa powierzchnia.

**REKOMENDACJA ARCHITEKTONICZNA:** A najbezpieczniejsze na start; B jest uzasadnione produktowo dla uploaders — bez wpływu na MIX.

---

## DECISION 07

**ID:** OD-REC-OWNER-07  
**Temat:** Limity antyabuse: aktywne take’y + liczba sesji / okres

**Obecna propozycja:** Muszą istnieć proste capy; konkretne liczby OPEN.

**Opcja A (przykład do potwierdzenia lub zmiany):**  
- BEGINNER: max 3 active READY, max 10 creates / UTC day, concurrent sessions = 1  
- PRO: max 10 active, max 30 / day, concurrent = 1  
- LEGEND: max 20 active, max 50 / day, concurrent = 1  
- ANON (jeśli włączony): max 1 active, max 3 / day  

**Opcja B:** Tylko concurrent = 1 + max duration; bez daily/active (słabsze)  
**Opcja C:** Owner podaje własne liczby

**Konsekwencje:** Storage flood, koszt, UX „limit reached”. Zbyt luźne = abuse; zbyt ciasne = frustracja.

**REKOMENDACJA ARCHITEKTONICZNA:** Same istnienie capów jest konieczne technicznie; **wartości** są produktowe. Opcja B niezalecana przy anon lub publicznym QT.

---

## DECISION 08

**ID:** OD-REC-OWNER-08  
**Temat:** Pobieranie własnego MIC TAKE

**Obecna propozycja:** Nie automatyczne; osobna polityka od beat DOWNLOAD (OD-05/06 bez zmian). SSOT §19/§21: „pobrać zgodnie z zasadami systemu”.

**Opcja A:** Wszyscy zalogowani z take mogą pobrać własny MIC (póki nie wygasł)  
**Opcja B:** BEGINNER = preview only; download od PRO/LEGEND  
**Opcja C:** Download własnego take liczony w limicie pobrań bitów (OD-05/06) — sprzężenie

**Konsekwencje:**  
- A: zgodne z intuicją „moja próbka”.  
- B: mocniejszy upgrade path.  
- C: miesza produkty; ryzyko regresji Phase 1.8A — niezalecane architektonicznie.

**REKOMENDACJA ARCHITEKTONICZNA:** Unikać C. A vs B = decyzja monetizacji / produktu.

---

## ARCHITECTURE-RESOLVABLE

Elementy **nie** wymagające decyzji produktowej Ownera (SSOT / istniejąca architektura / bezpieczny default techniczny):

| # | Element | Podstawa |
|---|---------|----------|
| 1 | BEGINNER Quick Take **max 30 s** | SSOT §19 — już ustalone |
| 2 | BEGINNER retention **24 h** | SSOT §21 |
| 3 | Wzór `MIN(beat.duration, entitlement.max, 180)` | SSOT §22 + Owner brief; egzekucja **server-side** |
| 4 | PRO/Premium retention **10 dni** *jeśli* Full Take = ten tier | SSOT §23 przykład `premium_take_retention_days = 10` |
| 5 | MIC TAKE ≠ permanentny mix; MIX/EXPORT poza EPIC | SSOT §24 · OD-14 · DF-REC-01/02 |
| 6 | Preview = lokalnie BEAT + MIC; bez pliku mix w V1 | SSOT §24 |
| 7 | V1 = natywny output MediaRecorder; allow-list webm/mp4; transcoding DEFERRED | Ograniczenia przeglądarek; OD-12 |
| 8 | Osobny prywatny bucket take (nie mieszać z masterami w `beat-audio` jako domena QT) | Phase 1.5 domain partition |
| 9 | Signed upload session → PUT → finalize (wzorzec Audio Transport) | Istniejąca architektura |
| 10 | Duration truth = server probe; client timer tylko UX | Security SSOT §39 |
| 11 | Soft-delete status + janitor hard-remove storage (brak public URL) | Operacyjny default; indefinite keep sprzeczne z SSOT temporary |
| 12 | Take download **nie** mutuje OD-05/06/17 | Izolacja Phase 1.8A |
| 13 | ROLE ≠ ACCOUNT LEVEL; brak self-escalation account_level | AuthZ LOCKED |
| 14 | Nazwy tabel / route / object key / RLS details / TTL signed URL | Decyzje implementacyjne architekta |
| 15 | Concurrent recording session = 1 (techniczny minimum) | Anti-abuse baseline; liczby daily/active → Owner (D07) |
| 16 | Reuse Access Gate (jeden resolver) zamiast drugiego silnika dostępu | ZERO DUPLICATE LOGIC |

**Uwaga do obszarów 3–5, 9–12 z briefu weryfikacji:**  
- BEGINNER limit / PRO time formula / preview / format / soft+cleanup → **resolvable** jak wyżej.  
- PRO „komu Full Take”, LEGEND retention, shared, RECORD capability, download take, active/daily caps → **Owner** (D01–D08).

---

## TRUE OWNER DECISIONS

| # | ID | Temat |
|---|-----|--------|
| 1 | OD-REC-OWNER-01 | RECORD vs PLAYBACK/DOWNLOAD |
| 2 | OD-REC-OWNER-02 | Anonymous QT w V1 |
| 3 | OD-REC-OWNER-03 | Shared beat RECORD + kolejność w EPIC |
| 4 | OD-REC-OWNER-04 | Mapowanie Full Take → PRO/LEGEND vs Premium |
| 5 | OD-REC-OWNER-05 | Retention LEGEND |
| 6 | OD-REC-OWNER-06 | RECORD na własnym non-PUBLISHED |
| 7 | OD-REC-OWNER-07 | Active takes + daily rate numbers |
| 8 | OD-REC-OWNER-08 | Download własnego MIC TAKE |

```text
TRUE_OWNER_DECISIONS = 8
```

(Nie forsowano sztucznych 12 — proposalowe OD-REC-07…12 o bucket/TTL/probe są techniczne.)

---

## DESIGN FREEZE BLOCKERS

**Blokują LOCK Design Freeze v1.0** (bez odpowiedzi nie wolno twierdzić, że freeze jest zamknięty):

| Priorytet | ID | Dlaczego |
|-----------|-----|----------|
| P0 | OD-REC-OWNER-01 | Semantyka całego Access modelu |
| P0 | OD-REC-OWNER-04 | Bez mapowania nie da się zapisać tabeli entitlementów w freeze |
| P0 | OD-REC-OWNER-02 | Zakres V1 (anon czy nie) zmienia threat model i fale |
| P0 | OD-REC-OWNER-03 | Czy shared jest IN EPIC czy DEFERRED — scope freeze |

**Blokują start Wave 1 implementacji** (po LOCK docs):

| | ID | |
|--|-----|--|
| P0 | OD-REC-OWNER-01, 02, 04 | AuthZ + entitlement config + zakres anon |
| P1 | OD-REC-OWNER-07 | Wartości capów w config (można tymczasowy interim **tylko** jeśli Owner poda jawne interim numbers w GO) |
| P1 | OD-REC-OWNER-08 | Jeśli Wave 3 ma CTA „Pobierz” |

**Mogą zostać DEFERRED w freeze z jawnym „later wave”** (nie blokują QT na PUBLISHED dla BEGINNER):

| ID | Warunek defer |
|----|----------------|
| OD-REC-OWNER-03 | Freeze zapisuje: shared = Wave N / OUT of MVP |
| OD-REC-OWNER-05 | Freeze zapisuje: LEGEND retention TBD; LEGEND = PRO interim **tylko** jeśli Owner tak każe |
| OD-REC-OWNER-06 | Freeze zapisuje: V1 = PUBLISHED only |

---

## FINAL

```text
OWNER_DECISION_PACK      = COMPLETE
TRUE_OWNER_DECISIONS     = 8
ARCHITECTURE_RESOLVABLE  = 16
IMPLEMENTATION           = NONE
COMMIT                   = NONE
PUSH                     = NONE
DEPLOY                   = NONE
```

**Next:** Owner odpowiada A/B/C (lub własne wartości) na D01–D08 → Architect zamyka Design Freeze v1.0 → dopiero potem Implementation GO.
