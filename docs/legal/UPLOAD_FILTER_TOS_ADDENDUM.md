# Aneks do Regulaminu — automatyczna weryfikacja przesyłanych bitów

> **PROJEKT (DRAFT) — wymaga weryfikacji prawnej przed publikacją. Ten dokument nie jest poradą prawną.** Opisuje stan techniczny wdrożony w Serwisie (filtr uploadu, październik 2026). Miejsca oznaczone `[do ustalenia]` wymagają decyzji właściciela lub prawnika.

## § 1. Cel
1. Serwis automatycznie sprawdza bity przesyłane przez Użytkowników, aby ograniczyć publikację utworów naruszających prawa osób trzecich oraz utworów zawierających wokal lub mowę. Serwis przyjmuje wyłącznie podkłady instrumentalne.
2. Weryfikacja obejmuje każdy bit Użytkownika zgłoszony do publikacji, w tym ponowne zgłoszenie po wymianie pliku głównego (master).

## § 2. Zakres weryfikacji
1. Dla pliku głównego Serwis tworzy cyfrowy odcisk audio (fingerprint Chromaprint) i porównuje go z odciskami bitów już obecnych w Serwisie.
2. Odcisk wraz z czasem trwania nagrania jest przesyłany do usługi AcoustID (prowadzonej przez MetaBrainz Foundation) w celu porównania z publiczną bazą nagrań. **Do AcoustID trafia wyłącznie odcisk i czas trwania — nie plik audio, nie jego fragment ani dane Użytkownika (np. nazwa konta, e-mail).** Zapytanie wysyła serwer Serwisu, nie urządzenie Użytkownika.
3. Wykrywanie wokalu odbywa się w całości na serwerze Serwisu, przy użyciu modelu separacji źródeł dźwięku (Demucs) uruchamianego lokalnie. Nagranie nie jest w tym celu przekazywane podmiotom trzecim. Pliki robocze powstałe podczas analizy są usuwane niezwłocznie po jej zakończeniu.
4. Plik audio nie opuszcza infrastruktury Serwisu (hosting plików i serwer analizy) w związku z weryfikacją.

## § 3. Skutki weryfikacji
1. Bit jest **automatycznie odrzucany**, jeżeli:
   a) wykryto w nim wokal lub mowę (zasada zerowej tolerancji — wystarczą krótkie fragmenty), albo
   b) stwierdzono jednoznaczne dopasowanie do innego nagrania w bazie AcoustID lub do innego bitu w Serwisie.
2. Użytkownik otrzymuje informację o przyczynie odrzucenia w panelu bitu.
3. Pozytywny wynik weryfikacji **nie oznacza publikacji** — bit trafia do kolejki moderacji i jest dodatkowo sprawdzany przez moderatora. Bit nie może zostać zatwierdzony ani opublikowany bez zaliczonej weryfikacji automatycznej albo decyzji moderatora uchylającej odrzucenie.
4. Jeżeli weryfikacja nie może zostać przeprowadzona (błąd techniczny), bit pozostaje w kolejce i może zostać sprawdzony ponownie na polecenie moderatora; nie jest w tym czasie publikowany.
5. Automatyczna weryfikacja może się mylić (np. syntezator brzmiący jak głos). Nie stanowi ona oceny prawnej i nie zwalnia Użytkownika z odpowiedzialności za posiadanie praw do utworu i użytych sampli.

## § 4. Odwołanie i decyzja człowieka
1. Od automatycznego odrzucenia Użytkownik może złożyć odwołanie z poziomu panelu bitu, podając krótkie uzasadnienie.
2. Odwołanie rozpatruje moderator (człowiek). Moderator może uchylić automatyczne odrzucenie wyłącznie z podaniem uzasadnienia; uchylony bit wraca do kolejki moderacji i nadal wymaga zatwierdzenia.
3. Decyzje moderatora wraz z uzasadnieniem są rejestrowane.
4. Termin rozpatrzenia odwołania: `[do ustalenia, np. 14 dni]`.

## § 5. Dane osobowe (RODO)
1. Administratorem danych jest `[nazwa i dane administratora Serwisu]`.
2. Odcisk audio i wynik weryfikacji są powiązane z bitem, a przez bit z kontem Użytkownika, dlatego w Serwisie mogą stanowić dane osobowe.
3. Podstawy prawne `[do potwierdzenia przez prawnika]`:
   a) art. 6 ust. 1 lit. b RODO — wykonanie umowy (Regulaminu), w tym zasady przyjmowania wyłącznie podkładów instrumentalnych;
   b) art. 6 ust. 1 lit. f RODO — prawnie uzasadniony interes administratora: zapobieganie naruszeniom praw autorskich i pokrewnych, wykrywanie duplikatów oraz obrona przed roszczeniami.
4. Automatyczne odrzucenie jest decyzją podejmowaną w sposób zautomatyzowany. Użytkownikowi przysługuje prawo do interwencji człowieka, wyrażenia własnego stanowiska i zakwestionowania decyzji — realizowane przez odwołanie z § 4 `[do oceny zgodności z art. 22 RODO]`.
5. Odbiorcy: AcoustID / MetaBrainz Foundation otrzymuje wyłącznie odcisk i czas trwania, bez identyfikatorów Użytkownika. `[do ustalenia: ocena, czy sam odcisk przekazywany bez identyfikatorów stanowi dane osobowe; kraj przetwarzania i ewentualne zabezpieczenia transferu]`.
6. Okres przechowywania:
   a) odciski audio i wyniki weryfikacji — przez czas istnienia bitu w Serwisie; usuwane razem z bitem;
   b) rejestr decyzji moderatora i odwołań — `[do ustalenia, np. do upływu okresu przedawnienia roszczeń]`;
   c) pliki robocze analizy — usuwane niezwłocznie po zakończeniu analizy.
   `[do ustalenia: los odcisków bitów pozostających w Serwisie po usunięciu konta Użytkownika]`.
7. Użytkownikowi przysługują prawa z art. 15–21 RODO (dostęp, sprostowanie, usunięcie, ograniczenie, przenoszenie, sprzeciw) oraz prawo skargi do Prezesa UODO.

## § 6. Uwaga na przyszłość (nie publikować)
- Płatni dostawcy rozpoznawania (np. AudD, ACRCloud) nie są włączeni. Ich włączenie, jeśli wymaga przesłania fragmentu audio, wymaga rozszerzenia aneksu o przekazywanie nagrań podmiotom trzecim, podstawę prawną, umowę powierzenia (DPA) oraz kraj przetwarzania.
- Progi techniczne (np. czułość wykrywania wokalu i dopasowań) są opisane w `docs/architecture/UPLOAD_FILTER.md` i mogą się zmieniać bez zmiany aneksu, o ile nie zmienia się zakres przekazywanych danych.
