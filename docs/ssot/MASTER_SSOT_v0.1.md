# BITRYMDYM — MASTER SSOT

**Wersja:** 0.1  
**Status:** DRAFT — FUNDAMENT  
**Właściciel produktu:** Dawid — Prezes / Product Owner  
**Główny Architekt:** ChatGPT  
**Agent implementacyjny:** Cursor Agent  
**Repozytorium:** `dawidthai125/BitRymDym`

---

# 1. CEL PROJEKTU

BitRymDym to platforma muzyczna skoncentrowana na rapie, hip-hopie oraz kulturze tworzenia bitów.

Platforma ma łączyć:

- producentów bitów,
- raperów,
- artystów,
- twórców,
- słuchaczy,
- społeczność BitRymDym.

Początkowo głównym celem jest udostępnianie autorskich bitów, ich odsłuch, pobieranie oraz możliwość sprawdzenia przez użytkownika, czy jego tekst i sposób rapowania pasują do danego bitu.

Docelowo BitRymDym ma rozwijać się w platformę społecznościową i współpracową, na której użytkownicy będą mogli:

- odkrywać bity,
- odsłuchiwać bity,
- pobierać bity,
- testować swoje wokale na bitach,
- nagrywać tymczasowe próbki,
- publikować gotowe utwory,
- oceniać utwory innych użytkowników,
- komentować,
- dodawać własne bity,
- prosić innych producentów o udostępnienie bitu,
- prowadzić prywatne rozmowy,
- udostępniać bity konkretnym użytkownikom,
- korzystać w przyszłości z funkcji Premium i płatnych.

---

# 2. FILOZOFIA PRODUKTU

BitRymDym NIE MOŻE wyglądać jak typowa strona wygenerowana przez AI.

Produkt ma posiadać:

- własną identyfikację wizualną,
- charakter,
- osobowość,
- humor tam, gdzie pasuje,
- muzyczny klimat,
- energię,
- profesjonalizm,
- wysoką jakość wykonania,
- charakterystyczne interakcje.

Należy unikać:

- typowych szablonów SaaS,
- generycznych landing page'y,
- przypadkowych gradientów,
- typowych dashboardów,
- stockowego wyglądu,
- pustych marketingowych haseł,
- tekstów brzmiących jak wygenerowane przez AI,
- nadmiaru kart z zaokrągleniami bez uzasadnienia,
- standardowego odtwarzacza HTML.

BitRymDym ma wyglądać jak **własna marka muzyczna**, a nie kolejny gotowy szablon internetowy.

---

# 3. ROLE SYSTEMOWE

Podstawowe role:

## ADMINISTRATOR

Pełny dostęp do systemu.

Administrator może:

- zarządzać użytkownikami,
- zarządzać rolami,
- zarządzać uprawnieniami,
- zarządzać bitami,
- akceptować i odrzucać bity użytkowników,
- moderować utwory,
- moderować komentarze,
- obsługiwać zgłoszenia,
- zarządzać ustawieniami systemu,
- zarządzać feature flags,
- zarządzać konfiguracją płatności,
- przeglądać statystyki,
- przeglądać logi audytowe,
- zarządzać ustawieniami Storage,
- zarządzać konfiguracją platformy.

## MODERATOR

Dostęp skoncentrowany na moderacji.

Może otrzymać uprawnienia do:

- moderowania użytkowników,
- moderowania bitów,
- moderowania utworów,
- moderowania komentarzy,
- obsługi zgłoszeń.

Moderator NIE powinien automatycznie otrzymywać dostępu do:

- krytycznych ustawień systemowych,
- konfiguracji płatności,
- kluczowych ustawień bezpieczeństwa.

## UŻYTKOWNIK

Standardowe konto użytkownika.

Może korzystać ze zwykłych funkcji platformy zgodnie z:

- rolą,
- poziomem konta,
- limitami,
- przyznanymi uprawnieniami,
- dostępem do konkretnego bitu.

---

# 4. ROLA ≠ POZIOM KONTA

Role systemowe oraz poziom konta muszą być osobnymi pojęciami.

## ROLA

```text
ADMIN
MODERATOR
USER
```

## POZIOM KONTA

Docelowo:

```text
BEGINNER_RAPPER
PRO_RAPPER
LEGEND_RAPPER
```

Poziomy konta będą związane przede wszystkim z przyszłymi funkcjami Premium i płatnymi.

NIE WOLNO traktować poziomu konta jako zamiennika roli systemowej.

**Signup default (OD-19 CLOSED / ACCEPTED, 2026-09-25):**

```text
role = USER
account_level = BEGINNER_RAPPER
```

`BEGINNER_RAPPER` jest **zatwierdzonym** defaultem nowego użytkownika.  
Nie jest mechanizmem Premium i nie przyznaje płatnych funkcji.

**First ADMIN (OD-20 CLOSED / ACCEPTED, 2026-09-25):**

Pierwszy ADMIN jest tworzony wyłącznie przez **manual / operator-controlled bootstrap** poza normalnym signup flow aplikacji.  
Zakazane: first-user admin, signup admin, hidden email admin, public bootstrap endpoint, client-side escalation.

---

# 5. AUTORYZACJA

Platforma musi obsługiwać:

- użytkowników niezalogowanych,
- użytkowników zarejestrowanych,
- użytkowników zalogowanych.

Użytkownik niezalogowany może korzystać z publicznych funkcji zgodnie z ustawionymi limitami.

Użytkownik zalogowany otrzymuje między innymi:

- własny profil,
- historię pobrań,
- katalog pobranych bitów,
- własne bity,
- własne utwory,
- własne próbki,
- udostępnione mu bity,
- wiadomości,
- powiadomienia.

Autoryzacja jest oparta o **Supabase Auth** (decyzja **OD-03 CLOSED / ACCEPTED**, 2026-09-25).

Architektura techniczna (stack FE, application server, infrastruktura): patrz [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) oraz [DECISION_LOG.md](../decisions/DECISION_LOG.md) (OD-01, OD-02, OD-03).

---

# 6. BITY

Bit jest jednym z głównych obiektów domenowych systemu.

Bit może należeć do:

1. platformy BitRymDym,
2. zarejestrowanego użytkownika / producenta.

Każdy bit powinien posiadać uporządkowane dane.

Minimalne informacje:

```text
title
producer
description
genre
style
bpm
key
scale
duration
tags
cover
audio
status
owner
created_at
updated_at
```

BPM MUSI być przechowywane jako wartość liczbowa.

Nie:

```text
"142 BPM"
```

Tylko:

```text
142
```

Interfejs może wyświetlać:

```text
142 BPM
```

---

# 7. MAKSYMALNA DŁUGOŚĆ BITU

Maksymalna długość bitu:

```text
180 sekund
```

czyli:

```text
3 minuty
```

Żaden opublikowany bit nie może mieć więcej niż 3:00.

Walidacja musi odbywać się po stronie serwera.

Sama walidacja frontendowa jest niewystarczająca.

---

# 8. STATUSY BITU

Bity użytkowników muszą posiadać cykl życia.

Podstawowe statusy:

```text
DRAFT
PENDING_REVIEW
APPROVED
PUBLISHED
REJECTED
ARCHIVED
```

Bit przesłany przez użytkownika nie może automatycznie stać się publiczny.

Musi przejść proces akceptacji.

---

# 9. AUDIO STORAGE

Oryginalne/masterowe pliki audio nie mogą być dostępne przez stałe publiczne URL-e.

Audio powinno być przechowywane w chronionym Storage.

Przykładowa architektura:

```text
MASTER AUDIO
      ↓
PRIVATE STORAGE
      ↓
CONTROLLED ACCESS
      ├── PLAYBACK VERSION
      └── DOWNLOAD VERSION
```

Nie wolno obiecywać, że audio będzie absolutnie niemożliwe do przechwycenia.

Celem jest:

- ochrona pliku master,
- ograniczenie przypadkowego pobierania,
- ograniczenie prostego kopiowania,
- kontrolowanie dostępu,
- rejestrowanie pobrań.

---

# 10. AUTORSKI ODTWARZACZ BITRYMDYM

BitRymDym MUSI posiadać własny, autorski odtwarzacz audio.

NIE WOLNO używać domyślnego:

```html
<audio controls>
```

jako finalnego interfejsu użytkownika.

Odtwarzacz ma być własnym, wielokrotnie wykorzystywanym komponentem BitRymDym.

Powinien obsługiwać:

- odtwarzanie,
- pauzę,
- przewijanie,
- waveform / wizualizację przebiegu audio,
- aktualny czas,
- długość utworu,
- głośność,
- wyciszenie,
- okładkę,
- tytuł,
- producenta,
- BPM,
- gatunek,
- styl,
- tonację,
- informacje o bicie,
- pobieranie, jeżeli użytkownik ma prawo do pobrania,
- nagrywanie, jeżeli użytkownik ma do tego prawo.

Odtwarzacz musi działać:

- na komputerze,
- laptopie,
- tablecie,
- telefonie.

Na urządzeniach mobilnych należy przewidzieć możliwość wykorzystania mini-playera.

Wygląd playera jest częścią identyfikacji marki BitRymDym.

---

# 11. INFORMACJE O BICIE

Strona bitu oraz player powinny pokazywać istotne informacje muzyczne.

Przykład:

```text
142 BPM
A minor
Dark Trap
2:47
```

W przyszłości mogą zostać dodane:

```text
Energy
Mood
Drums
Melody
Bass
Tags
```

Dane, które będą wykorzystywane do filtrowania lub wyszukiwania, powinny być kontrolowanymi wartościami, a nie dowolnym tekstem wpisywanym w wielu różnych miejscach.

---

# 12. SYSTEM POBIERANIA

Pobieranie NIE może być zwykłym publicznym linkiem do pliku.

Przepływ:

```text
ŻĄDANIE POBRANIA
        ↓
SPRAWDZENIE AUTORYZACJI
        ↓
SPRAWDZENIE ROLI / KONTA
        ↓
SPRAWDZENIE DOSTĘPU
        ↓
SPRAWDZENIE LIMITU
        ↓
SPRAWDZENIE ANTY-ABUSE
        ↓
ZAPISANIE INFORMACJI O POBRANIU
        ↓
WYGNEROWANIE CZASOWEGO SIGNED URL
        ↓
POBRANIE
```

Każde prawidłowe pobranie powinno być możliwe do zarejestrowania.

Przykładowe dane:

```text
user
beat
timestamp
file_type
source
access_type
```

---

# 13. LIMITY POBIERANIA

Wstępny pomysł biznesowy:

## Użytkownik niezalogowany

```text
1–2 pobrania dziennie
```

## Użytkownik zalogowany

```text
4 pobrania dziennie
```

Dokładne wartości:

```text
DECISION REQUIRED
```

Limity NIE mogą być rozsiane i zapisane na sztywno w kodzie.

Muszą być konfigurowalne.

Przykładowe ustawienia:

```text
anonymous_daily_download_limit
user_daily_download_limit
premium_daily_download_limit
```

---

# 14. FEATURE FLAGS

Funkcje płatne początkowo mają być WYŁĄCZONE.

Architektura musi od początku umożliwiać ich późniejsze włączenie.

Przykładowe feature flags:

```text
payments_enabled
premium_enabled
extra_downloads_enabled
single_beat_purchase_enabled
```

Feature flags powinny być zarządzane centralnie.

Administrator powinien docelowo móc je włączać i wyłączać z panelu administracyjnego.

---

# 15. SYSTEM PŁATNOŚCI

System płatności jest planowany, ale początkowo nieaktywny.

Przyszłe funkcje mogą obejmować:

1. zwiększenie limitów pobierania,
2. konta Premium,
3. jednorazowy zakup konkretnego bitu.

Operator płatności:

```text
DECISION REQUIRED
```

Nie implementować aktywnych płatności bez wyraźnej decyzji Product Ownera.

---

# 16. PROFIL UŻYTKOWNIKA

Zarejestrowany użytkownik posiada własny profil.

Potencjalne sekcje:

```text
Profil
Pobrane bity
Moje bity
Moje utwory
Moje próbki
Bity udostępnione
Wiadomości
Powiadomienia
Ustawienia
```

Dane prywatne nie mogą przypadkowo stać się publiczne.

---

# 17. POBRANE BITY

Po prawidłowym pobraniu bitu przez zalogowanego użytkownika bit powinien pojawić się w:

```text
MOJE POBRANE BITY
```

System powinien przechowywać między innymi:

- liczbę pobrań użytkownika,
- liczbę pobrań danego bitu.

Dokładne zasady liczenia wielokrotnych pobrań:

```text
DECISION REQUIRED
```

---

# 18. QUICK TAKE — TYMCZASOWE NAGRANIE

BitRymDym posiada własny system nagrywania zintegrowany z autorskim playerem.

Cel:

> Użytkownik może sprawdzić, czy jego tekst i sposób rapowania pasują do konkretnego bitu.

System ma działać na:

- komputerze,
- laptopie,
- telefonie,
- tablecie.

Użytkownik musi udzielić przeglądarce dostępu do mikrofonu.

---

# 19. QUICK TAKE — UŻYTKOWNIK STANDARDOWY

Standardowy użytkownik może nagrać:

```text
MAKSYMALNIE 30 SEKUND
```

Nagranie jest tymczasowe.

Użytkownik może:

- rozpocząć nagranie,
- zatrzymać nagranie,
- odsłuchać,
- nagrać ponownie,
- usunąć,
- pobrać zgodnie z zasadami systemu,
- zapisać w profilu zgodnie z zasadami konta.

Nagranie NIE jest automatycznie publikowane jako utwór.

---

# 20. QUICK TAKE — UŻYTKOWNIK NIEZALOGOWANY

Użytkownik niezalogowany może korzystać z testowego nagrywania, jeżeli pozwalają na to aktualne ustawienia systemu.

Nagranie anonimowego użytkownika jest tymczasowe.

Po nagraniu użytkownik powinien otrzymać jasny komunikat w stylu:

> Chcesz zachować tę próbkę? Zaloguj się lub załóż konto.

Powinny być dostępne odpowiednie akcje:

```text
ZALOGUJ SIĘ
ZAŁÓŻ KONTO
POBIERZ
```

Jeżeli użytkownik nie zaloguje się i nie zachowa nagrania zgodnie z dostępną opcją, próbka jest tymczasowa i zostaje automatycznie usunięta.

Zamknięcie strony nie może powodować trwałego przechowywania anonimowej próbki.

Anonimowe nagrania muszą posiadać krótki serwerowy TTL jako zabezpieczenie przed pozostawieniem plików w Storage.

---

# 21. QUICK TAKE — UŻYTKOWNIK ZALOGOWANY

Zalogowany użytkownik może zapisać próbkę w:

```text
MOJE PRÓBKI
```

Standardowa retencja:

```text
24 GODZINY
```

Po 24 godzinach nagranie jest automatycznie usuwane.

Użytkownik może wcześniej:

- odsłuchać,
- pobrać,
- usunąć,
- opublikować jako osobny utwór.

---

# 22. PREMIUM — FULL TAKE

Użytkownik Premium może nagrać cały utwór na wybranym bicie.

Maksymalny czas nagrania:

```text
DŁUGOŚĆ BITU
```

z ograniczeniem:

```text
MAKSYMALNIE 180 SEKUND
```

Przykłady:

```text
Bit 1:42 → nagranie maks. 1:42
Bit 2:15 → nagranie maks. 2:15
Bit 2:58 → nagranie maks. 2:58
Bit 3:00 → nagranie maks. 3:00
```

Żaden bit nie może mieć więcej niż 3:00.

---

# 23. PREMIUM — TYMCZASOWE NAGRANIE

Nagranie Premium jest nadal nagraniem tymczasowym.

Nie jest automatycznie publicznym utworem.

Retencja:

```text
10 DNI
```

Nagranie trafia do:

```text
MOJE PRÓBKI
```

Użytkownik może:

- odtworzyć,
- pobrać,
- usunąć,
- opublikować jako utwór.

Po 10 dniach plik zostaje automatycznie usunięty.

Okres 10 dni nie powinien być zaszyty w wielu miejscach aplikacji.

Przykładowa konfiguracja:

```text
premium_take_retention_days = 10
```

---

# 24. ARCHITEKTURA NAGRANIA

Bit nie powinien być automatycznie zapisywany razem z głosem użytkownika jako jeden trwały plik.

Koncepcyjnie:

```text
BIT PLAYBACK
      +
MICROPHONE INPUT
      ↓
DOŚWIADCZENIE UŻYTKOWNIKA
```

Głównym zapisywanym materiałem jest nagranie mikrofonu.

Pozwala to na:

- ograniczenie duplikowania audio,
- tymczasowe przechowywanie,
- późniejsze generowanie pliku,
- publikowanie utworu,
- elastyczne miksowanie.

Dokładna architektura eksportu/miksowania:

```text
DECISION REQUIRED
```

---

# 25. PUBLICZNE UTWORY

Użytkownik, który posiada odpowiedni dostęp do bitu, może w przyszłości przesłać gotowy utwór.

Utwór może posiadać:

```text
title
artist_name
pseudonym
audio
cover
description
beat_reference
```

Utwór powinien mieć cykl życia:

```text
DRAFT
PENDING_REVIEW
PUBLISHED
REJECTED
HIDDEN
REMOVED
```

---

# 26. POWIĄZANIE UTWORU Z BITEM

Każdy publiczny utwór nagrany na bicie BitRymDym powinien mieć relację z konkretnym bitem.

Koncepcyjnie:

```text
UTWÓR
   ↓
NAGRANY NA
   ↓
BIT
```

Dzięki temu możemy później wyświetlać:

- wszystkie utwory nagrane na danym bicie,
- liczbę utworów,
- oceny,
- komentarze,
- statystyki.

---

# 27. OCENIANIE UTWORÓW

Społeczność może oceniać publiczne utwory.

Wstępnie:

```text
👍 PODOBA MI SIĘ
👎 NIE PODOBA MI SIĘ
```

Ostateczne nazewnictwo może zostać zmienione podczas projektowania UX.

Jeden użytkownik powinien mieć maksymalnie jedną aktywną ocenę danego utworu.

System musi zabezpieczać przed wielokrotnym sztucznym głosowaniem.

---

# 28. KOMENTARZE

Użytkownicy mogą komentować publiczne utwory.

Komentarze muszą posiadać ochronę przed:

- spamem,
- reklamami,
- nadmierną ilością linków,
- wulgaryzmami,
- automatycznym spamem,
- nadużyciami,
- floodem.

Komentarz może posiadać status:

```text
VISIBLE
PENDING
BLOCKED
REPORTED
DELETED
```

Dokładny mechanizm moderacji:

```text
DECISION REQUIRED
```

---

# 29. BITY UŻYTKOWNIKÓW

Zarejestrowany użytkownik może przesłać własny bit.

Przepływ:

```text
UPLOAD
 ↓
VALIDATION
 ↓
PENDING REVIEW
 ↓
MODERATION
 ↓
APPROVED
 ↓
PUBLISHED
```

Użytkownik widzi swoje bity w:

```text
MOJE BITY
```

---

# 30. BITY UŻYTKOWNIKÓW — DOMYŚLNY DOSTĘP

Po akceptacji:

```text
ODSŁUCH: TAK
POBIERANIE: NIE
```

Inni użytkownicy mogą odsłuchać bit i ocenić go.

Jeżeli chcą otrzymać plik:

```text
POPROŚ O UDOSTĘPNIENIE
```

---

# 31. PROŚBA O UDOSTĘPNIENIE BITU

Użytkownik może wysłać właścicielowi bitu prośbę.

Przykładowo:

```text
CHCESZ TEN BIT?

Napisz do autora i poproś o możliwość pobrania.
```

Użytkownik może dodać wiadomość.

Właściciel otrzymuje:

```text
PROŚBA O UDOSTĘPNIENIE
```

Może:

- zaakceptować,
- odrzucić,
- odpowiedzieć,
- kontynuować rozmowę.

---

# 32. PRYWATNY CZAT

Użytkownicy mogą prowadzić prywatną rozmowę dotyczącą bitu.

Rozmowa powinna posiadać:

```text
conversation
participants
messages
timestamps
read/unread
related_beat
```

Wiadomości pozostają prywatne.

Dokładny system moderacji prywatnych wiadomości zostanie określony osobno.

---

# 33. UDOSTĘPNIENIE BITU

Jeżeli właściciel zaakceptuje prośbę:

```text
WŁAŚCICIEL
      ↓
PRZYZNAJE DOSTĘP
      ↓
UŻYTKOWNIK
```

Użytkownik otrzymuje bit w:

```text
BITY DO POBRANIA
```

z informacją:

```text
Udostępnione przez:
[NAZWA WŁAŚCICIELA]
```

---

# 34. LICZBA UDOSTĘPNIEŃ

Przy bicie użytkownika należy docelowo pokazywać:

```text
Udostępniono X razy
```

Dokładne zasady liczenia:

```text
DECISION REQUIRED
```

---

# 35. PANEL ADMINISTRATORA

Panel administracyjny docelowo powinien zawierać:

```text
Dashboard
Użytkownicy
Role
Uprawnienia
Bity
Utwory
Komentarze
Zgłoszenia
Moderacja
Wiadomości / narzędzia moderacyjne
Pobrania
Statystyki
Feature Flags
Płatności
Ustawienia systemowe
Storage
Audit Log
```

Nie implementować wszystkiego jednocześnie.

---

# 36. SYSTEM UPRAWNIEŃ

Uprawnienia muszą być oddzielone od ról.

Przykłady:

```text
users.view
users.edit
users.suspend

beats.create
beats.edit
beats.delete
beats.approve
beats.reject

tracks.view
tracks.moderate
tracks.remove

comments.moderate
comments.delete

reports.view
reports.resolve

payments.view
payments.manage

settings.view
settings.manage

feature_flags.view
feature_flags.manage

audit_log.view
```

Role powinny być zestawami uprawnień.

Nie należy rozsypywać logiki:

```text
if user.role === "admin"
```

po całym frontendzie.

---

# 37. AUDIT LOG

Istotne działania administracyjne powinny być rejestrowane.

Przykładowe dane:

```text
timestamp
actor
action
entity
entity_id
before
after
```

Przykład:

```text
25.09.2026
ADMIN
APPROVED
BEAT
#128
```

Audit Log jest elementem bezpieczeństwa systemu.

---

# 38. STORAGE — DANE STAŁE I TYMCZASOWE

System musi rozróżniać:

## DANE STAŁE

Przykłady:

- opublikowane bity,
- opublikowane utwory,
- okładki.

## DANE TYMCZASOWE

Przykłady:

- anonimowe Quick Take,
- próbki zwykłych użytkowników,
- próbki Premium.

Dane tymczasowe muszą posiadać automatyczne czyszczenie.

Żaden tymczasowy plik nie może pozostać w Storage na zawsze z powodu błędu aplikacji.

---

# 39. ZASADY BEZPIECZEŃSTWA

System musi zakładać, że klient może zostać zmanipulowany.

Nigdy nie ufamy wyłącznie frontendowi w kwestiach:

- limitów,
- ról,
- dostępu,
- własności,
- czasu nagrania,
- Premium,
- pobierania,
- uprawnień administratora.

Krytyczne reguły muszą być sprawdzane po stronie serwera.

Dotyczy to między innymi:

```text
download limits
beat ownership
beat access
premium status
recording duration
upload permissions
moderation permissions
admin permissions
```

---

# 40. MOBILE FIRST

Platforma musi poprawnie działać na:

- komputerach,
- laptopach,
- tabletach,
- telefonach.

Nagrywanie musi uwzględniać:

- uprawnienia mikrofonu,
- ograniczenia przeglądarek mobilnych,
- zmianę orientacji urządzenia,
- przerwanie nagrania,
- brak dostępu do mikrofonu.

Player musi być wygodny w obsłudze dotykowej.

---

# 41. DESIGN SYSTEM

Przed rozpoczęciem finalnego projektowania interfejsu należy przygotować:

```text
BITRYMDYM VISUAL IDENTITY
```

Dokument powinien określić:

- kolory,
- typografię,
- spacing,
- kształty,
- przyciski,
- karty,
- player,
- waveform,
- ikony,
- animacje,
- stany błędów,
- stany pustki,
- loading,
- komunikaty,
- styl tekstów.

Wizualny system ma być autorski.

---

# 42. ZASADA ROZWOJU

Projekt rozwijamy etapami.

Proces:

```text
POMYSŁ PREZESA
 ↓
ANALIZA ARCHITEKTA
 ↓
AKTUALIZACJA SSOT
 ↓
SPECYFIKACJA FUNKCJI
 ↓
PROMPT DLA CURSOR AGENT
 ↓
IMPLEMENTACJA
 ↓
TESTY
 ↓
DOCUMENTATION UPDATE
 ↓
AUDIT
 ↓
REVIEW
 ↓
OWNER APPROVAL
 ↓
COMMIT
 ↓
GITHUB
 ↓
DEPLOY
 ↓
PRODUCTION VERIFY
```

Obowiązuje stała **Documentation Continuity Rule**: każda decyzja, funkcja, zmiana architektury lub reguły biznesowej musi być odzwierciedlona w dokumentacji przed uznaniem zadania za ukończone. Patrz [DOCUMENTATION_CONTINUITY.md](../DOCUMENTATION_CONTINUITY.md).

Cursor Agent nie może samodzielnie zmieniać założeń produktu.

Jeżeli implementacja ujawni konflikt architektoniczny:

```text
STOP
 ↓
ZGŁOŚ PROBLEM
 ↓
ARCHITECTURE REVIEW
 ↓
DECYZJA
 ↓
AKTUALIZACJA SSOT
 ↓
KONTYNUACJA
```

---

# 43. ŹRÓDŁO PRAWDY

Obowiązuje następująca hierarchia:

```text
1. Najnowszy zatwierdzony SSOT
2. Dokumentacja architektury
3. Zatwierdzona specyfikacja funkcji
4. Zatwierdzony kod
5. Rozmowy i pomysły robocze
```

Jeżeli rozmowa lub nowy pomysł jest sprzeczny z zatwierdzonym SSOT, konflikt musi zostać rozwiązany i SSOT zaktualizowany przed implementacją.

---

# 44. ELEMENTY WYMAGAJĄCE JESZCZE DECYZJI

## Zamknięte baseline architektury (2026-09-25)

Następujące elementy **nie** są już otwarte — szczegóły w Decision Log:

- stack frontendowy — **OD-01 CLOSED** (Next.js, TypeScript, Tailwind, shadcn/ui jako baza, własny Design System, App Router),
- application server — **OD-02 CLOSED** (Next.js Server Actions / Route Handlers; bez osobnego Express/Nest/Fastify na start),
- infrastruktura Supabase — **OD-03 CLOSED** (PostgreSQL, Auth, RLS, Storage; Edge Functions gdy potrzebne).

## Nadal OPEN — nie zamrażać samodzielnie

Nie należy samodzielnie wymyślać i zamrażać przez Cursor następujących elementów:

- operator płatności (OD-04),
- dokładny limit pobrań dla anonimowego użytkownika (OD-05),
- dokładny limit pobrań dla zwykłego użytkownika (OD-06),
- ceny Premium (OD-07),
- dokładne poziomy Premium (OD-08),
- ostateczne nazwy poziomów kont (OD-09),
- finalne nazwy głosowania (OD-10),
- dokładny system moderacji komentarzy (OD-11),
- dokładna metoda kodowania audio (OD-12),
- dokładna metoda watermarkingu audio (OD-13),
- dokładna metoda miksowania nagrania z bitem (OD-14),
- finalna identyfikacja wizualna (OD-15),
- finalny język marki (OD-16),
- zasady liczenia powtórnych pobrań (OD-17),
- zasady liczenia udostępnień (OD-18).

Pełny rejestr: [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md).

---

# 45. PRIORYTET PIERWSZEGO ETAPU

## FAZA 1 — FUNDAMENT

Najpierw:

```text
GitHub
lokalne repozytorium
dokumentacja
Supabase
Authentication
Users
Roles
Permissions
Profiles
Beats
Beat metadata
Private audio storage
Custom Player
Playback
Download permissions
Download limits
Quick Take
Temporary recordings
```

---

# 46. FAZA 2 — SPOŁECZNOŚĆ

Następnie:

```text
User-uploaded beats
Moderation
Tracks
Voting
Comments
Reports
```

---

# 47. FAZA 3 — WSPÓŁPRACA

Następnie:

```text
Beat requests
Private messaging
Beat sharing
Notifications
```

---

# 48. FAZA 4 — PREMIUM

Dopiero później:

```text
Premium
Payments
Extended downloads
Premium Full Take
```

Płatności początkowo pozostają wyłączone.

---

# 49. GŁÓWNA ŚCIEŻKA UŻYTKOWNIKA

BitRymDym nie jest wyłącznie:

> stroną do pobierania bitów.

Docelowa ścieżka:

```text
ODKRYJ
 ↓
ODSŁUCHAJ
 ↓
SPRAWDŹ BPM / STYL
 ↓
SPRAWDŹ SWÓJ FLOW
 ↓
NAGRAJ
 ↓
POBIERZ / ZAPISZ
 ↓
STWÓRZ UTWÓR
 ↓
OPUBLIKUJ
 ↓
ZDOBĄDŹ OPINIE
 ↓
POZNAJ INNYCH TWÓRCÓW
 ↓
WSPÓŁPRACUJ
```

Ta ścieżka powinna być jednym z głównych kierunków projektowania produktu.

---

# 50. STATUS SSOT

Aktualny status:

```text
FOUNDATION DRAFT
VERSION 0.1
```

Dokument jest pierwszą wersją konstytucji produktu.

**Baseline architektury technicznej (OD-01 / OD-02 / OD-03):** ACCEPTED 2026-09-25 — szczegóły w [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) i [DECISION_LOG.md](../decisions/DECISION_LOG.md). Status SSOT produktu pozostaje FOUNDATION DRAFT do dalszego zatwierdzenia Ownera.

Każda istotna przyszła zmiana powinna:

- aktualizować wersję,
- być odnotowana w historii decyzji,
- wskazywać zmienione moduły,
- aktualizować dokumentację architektury, jeżeli jest to wymagane.

---

# 51. ZASADA DLA CURSOR AGENT

Cursor Agent ma traktować ten dokument jako nadrzędne źródło informacji o produkcie.

Cursor Agent:

- NIE powinien samodzielnie wymyślać nowych funkcji biznesowych,
- NIE powinien usuwać istniejących założeń bez zgody,
- NIE powinien zmieniać architektury bez uzasadnienia,
- NIE powinien tworzyć duplikatów istniejącej logiki,
- NIE powinien implementować funkcji oznaczonych jako `DECISION REQUIRED`,
- powinien zgłaszać konflikty architektoniczne,
- powinien pracować małymi, kontrolowanymi etapami,
- powinien tworzyć testy dla implementowanych funkcji,
- powinien respektować SSOT i dokumentację projektu.

---

# 52. JĘZYK PROMPTÓW DLA CURSOR AGENT

Wszystkie prompty i instrukcje przekazywane przez Architekta do Cursor Agent są przygotowywane **w języku polskim**.

Nazwy techniczne mogą pozostać w języku angielskim, jeżeli wynika to ze standardu technologicznego.

Dotyczy to między innymi:

- nazw plików,
- nazw tabel,
- nazw kolumn,
- nazw funkcji,
- nazw zmiennych,
- nazw endpointów,
- nazw bibliotek,
- nazw technologii.

Treść instrukcji, założenia, kryteria akceptacji i decyzje architektoniczne mają być opisywane po polsku.

---

# 53. PODSTAWOWA ZASADA PROJEKTU

BitRymDym ma prowadzić użytkownika od:

**„Znalazłem bit.”**

do:

**„Nagrałem coś na nim.”**

następnie:

**„Sprawdziłem, czy działa.”**

następnie:

**„Stworzyłem utwór.”**

następnie:

**„Pokazałem go ludziom.”**

i docelowo:

**„Poznałem producenta / rapera i zrobiłem coś razem.”**

To jest kierunek produktu.

---

# KONIEC — BITRYMDYM MASTER SSOT v0.1
