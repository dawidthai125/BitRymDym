# Aneks do Regulaminu — automatyczna weryfikacja przesyłanych bitów

> **PROJEKT (DRAFT) — wymaga weryfikacji prawnej przed publikacją.** Nie jest to porada prawna.

## § 1. Cel
1. Serwis automatycznie sprawdza przesyłane bity, aby ograniczyć publikację utworów naruszających prawa osób trzecich oraz utworów zawierających wokal (Serwis przyjmuje wyłącznie podkłady instrumentalne).

## § 2. Zakres weryfikacji
1. Dla każdego przesłanego pliku głównego (master) Serwis tworzy cyfrowy odcisk audio (fingerprint Chromaprint) i porównuje go z odciskami bitów już obecnych w Serwisie.
2. Odcisk może zostać przesłany do usługi AcoustID (MetaBrainz Foundation) w celu porównania z publiczną bazą nagrań. **Do AcoustID przekazywany jest wyłącznie odcisk i czas trwania — nie samo nagranie.** Plik audio nie opuszcza infrastruktury Serwisu.
3. Serwis analizuje nagranie pod kątem obecności wokalu przy użyciu modelu separacji uruchamianego na własnym serwerze Serwisu.
4. Odciski są przechowywane przez czas istnienia bitu w Serwisie i służą wyłącznie do wykrywania duplikatów i naruszeń.

## § 3. Skutki
1. Bit, w którym wykryto wokal lub jednoznaczne dopasowanie do innego nagrania, jest automatycznie odrzucany, a Użytkownik otrzymuje informację o przyczynie.
2. Pozytywny wynik weryfikacji nie oznacza publikacji — każdy bit jest dodatkowo sprawdzany przez moderatora.
3. Automatyczna weryfikacja może się mylić. Nie stanowi ona oceny prawnej ani nie zwalnia Użytkownika z odpowiedzialności za posiadanie praw do utworu.

## § 4. Odwołanie
1. Użytkownik może złożyć odwołanie od automatycznego odrzucenia z poziomu panelu bitu, podając krótkie uzasadnienie.
2. Odwołanie rozpatruje moderator. Decyzja moderatora i jej uzasadnienie są rejestrowane.

## § 5. Uwaga na przyszłość (nie publikować)
- Jeśli Serwis włączy płatnych dostawców rozpoznawania (np. AudD, ACRCloud), którzy wymagają przesłania fragmentu audio, aneks trzeba rozszerzyć o przekazywanie nagrań podmiotom trzecim, podstawę prawną (RODO, jeśli dotyczy), umowę powierzenia oraz kraj przetwarzania.
