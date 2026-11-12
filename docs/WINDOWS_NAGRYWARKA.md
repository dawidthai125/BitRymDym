# Nagrywarka Windows

Opis dla strony i dla pracy nad programem. Liczby planu bierze kod z `src/config/plan-policy.ts`. Strona publiczna: `/nagrywarka`.

Program leży w `desktop/recorder`. Nie jest drugim studiem i nie jest drugim masterem. Konto, limity i wysyłka idą istniejącymi trasami strony.

## Dwie drogi

1. **Program Windows.** Mikrofon do WAV na komputerze, odsłuch bitu bez zapisu, potem wysyłka wokalu na konto.
2. **Strona.** Szybkie nagranie na stronie opublikowanego bitu albo nagranie w projekcie studia. Tam kończy się numer: klipy, efekty, miks, master, eksport.

Mac nagrywa tylko w przeglądarce.

## Co robi program

- Logowanie tym samym kontem. Hasło nie trafia do pliku ustawień.
- Katalog opublikowanych bitów. Odsłuch ze strony nie zapisuje bitu. Własny WAV albo MP3 jest tylko zapasowym odsłuchem.
- Nagranie mikrofonu: mono, 16 bit, 48 kHz, bufor urządzenia 20 ms, bufor czasu rzeczywistego ffmpeg 256 kB (nie dodaje opóźnienia, a chroni przed gubieniem próbek), DirectShow. Bez WASAPI, ASIO i bez obietnicy zerowego opóźnienia.
- Ścieżki wokalu do limitu planu. Bit się nie liczy. Jedna ścieżka trzyma jedno ujęcie.
- Fala, M, S, X. Ostatniej ścieżki nie usuwa, tylko czyści ujęcie.
- Zaznaczenie fali i ED: wytnij, zostaw, wycisz, fade in, fade out. To zapisuje się w pliku WAV.
- Głośność od −36 dB do +12 dB i kanał lewo / środek / prawo. Słychać to w Graj miks. Do pliku na konto te ustawienia nie wchodzą.
- Wyciszenie i solo decydują, które ujęcia słychać i które jadą na konto.
- Wybór mikrofonu, gdy Windows pokazuje więcej niż jeden.
- Zaznaczone efekty strony zapisują się na ścieżce po wysłaniu. Brzmienie liczy studio. Program nie liczy DSP i nie ładuje VST.
- Wysyłka tworzy projekt studia. Idzie w tle: okno zostaje żywe, pasek stanu pokazuje kroki (projekt, ścieżka N z M, efekty), a Wyślij i Stop i wyślij są zablokowane do końca (nie powstanie drugi projekt). Zamknięcie okna w trakcie wysyłki pyta o potwierdzenie.
- Po Stop program ocenia ujęcie jednym zdaniem: przester, prawie cisza, cicho albo poziom OK, oraz ostrzega, gdy mikrofon zgubił próbki. To tylko wskazówka, wysyłki nie blokuje.
- Gdy mikrofon zniknie w trakcie nagrania (odłączony albo zajęty), program kończy nagranie, zostawia na liście to, co się zapisało, i podaje przyczynę z Windows.
- Błędy sieci są po polsku (brak połączenia, brak odpowiedzi na czas), bez adresów i szczegółów gniazd. Logowanie rozróżnia zły e-mail lub hasło, zbyt wiele prób i niedostępny serwer.
- Wyloguj kończy też sesję na serwerze, więc zapisany token odświeżania przestaje działać.
- Tokeny sesji leżą w `%APPDATA%\BitRymDym\desktop-session.json` zaszyfrowane Windows DPAPI (tylko to konto Windows je otworzy). E-mail i adres strony zostają jawne. Stary plik z jawnymi tokenami jest zaszyfrowany przy pierwszym wczytaniu. Gdy DPAPI zawiedzie, program zapisuje jawnie jak dawniej, żeby nie gubić sesji. Plik z innego konta Windows liczy się jako wylogowanie.
- Wznowienie wysyłki: stan przerwanej wysyłki (id projektu, wersja, ścieżki, ile ścieżek i efektów jest gotowych) leży w `%APPDATA%\BitRymDym\desktop-upload.json`, bez tokenów. Kolejne Wyślij dokańcza ten sam projekt od pierwszej niewysłanej ścieżki (nie tworzy drugiego), także po ponownym uruchomieniu programu, o ile pliki WAV nadal są. Inne ścieżki niż w przerwanej wysyłce porzucają ten stan i zaczynają nowy projekt.
- Pasek aktualizacji i numer wersji w stopce: patrz sekcja Aktualizacje.
- Nagłówek WAV: program czyta prawdziwy początek danych (ffmpeg dopisuje blok LIST, nagłówek ma 78 B, a nie 44). Dzięki temu czas ujęcia i czas wysyłki są dokładne, a początek fali nie dostaje fałszywego szczytu z tekstu nagłówka.
- Próba mikrofonu: osobny przycisk pod wyborem mikrofonu. Otwiera mikrofon bez nagrywania ujęcia (plik tymczasowy jest kasowany), pokazuje poziom, szczyt z ostatnich 3 s i podpowiedź (prawie cisza, za cicho, dobrze, za głośno). Sama się kończy po 60 s i przed nagraniem.
- Sieć dla odsłuchu bitu i miksu idzie poza wątkiem okna (okno nie zamarza przy słabym internecie).

## Czego program nie robi

- Nie miesza bitu do pliku wokalu.
- Odsłuch idzie na domyślne wyjście Windows. Nie ma osobnego wyboru słuchawek i głośników i nie ma dwóch miksów naraz.
- W trakcie nagrania nie podaje własnego głosu do słuchawek. Głośniki przy mikrofonie wchodzą w ujęcie.
- Nie rysuje nut. Nie robi miksu BITEK, masteringu, zatwierdzenia mastera, stemów, tekstu, okładki, wideo ani linku odsłuchu.
- Nie ma skrzynki do człowieka. Miks i master robi Bitek na stronie.
- Strojenie inne niż zero i sidechain są od Silver, tak jak na stronie.

## Limity

Free 30 s i 1 ścieżka, Bronze 60 s i 2, Silver 120 s i 8, Gold 180 s i 16. Efekty 4 / 4 / 12 / 12. Stemy 0 / 0 / 8 / 16. Bit nie zajmuje ścieżki nagrania.

## Aktualizacje (samoaktualizacja programu)

Program (od wersji 2026.11.12.2) sprawdza w tle przy starcie i co 6 godzin plik `https://pub-8c6908a0590848aeb53ab34c2317d857.r2.dev/bitrymdym/latest.json`. Gdy jest nowsza wersja, na dole okna pojawia się pasek „Jest nowa wersja … ZAKTUALIZUJ / Później”. Zaktualizuj pobiera instalator z postępem, sprawdza go i uruchamia (`/SILENT /UPDATE=1`), program się zamyka, a instalator uruchamia nową wersję. Nic nie dzieje się w trakcie nagrania, próby mikrofonu ani wysyłki (program każe najpierw skończyć). Starsze wersje bez tej funkcji (2026.11.12.1 i wcześniejsze) trzeba raz zainstalować ręcznie.

Bezpieczeństwo: `latest.json` jest podpisany Ed25519 (klucz prywatny w Vault OpenBot jako `BITRYMDYM_UPDATE_SIGNING_KEY`, publiczny w `desktop/recorder/updater.py`). Podpis obejmuje wersję, SHA-256, rozmiar i adres instalatora. Program instaluje tylko, gdy podpis się zgadza, wersja jest nowsza, adres jest https pod `.../bitrymdym/`, a pobrany plik ma dokładnie podpisany rozmiar i sumę. Sama podmiana pliku w buckecie nie wystarczy. Wyłączenie: zmienna `BITRYMDYM_NO_UPDATE=1`.

Publikacja nowego buildu (kolejność ma znaczenie, `latest.json` na końcu):
1. podbij `APP_VERSION` w `updater.py` i `AppVersion` w `installer/BitRymDym.iss` (CI sprawdza zgodność), commit, tag `recorder-v<wersja>`;
2. pobierz artefakt z workflow, sprawdź SHA-256;
3. R2: kopia poprzedniego `BitRymDym-Setup.exe` pod klucz z jego wersją, wgraj `BitRymDym-Setup-<wersja>.exe` i `BitRymDym-Setup.exe` (+ `.sha256`);
4. `python installer/publish_manifest.py --installer <plik> --version <wersja> --key <ścieżka klucza z Vault> --out latest.json --notes "…"` i wgraj `latest.json` jako `bitrymdym/latest.json` z `Cache-Control: no-cache`.

## Instalator

Instalator zawiera `ffmpeg.exe`, `ffplay.exe` i ich biblioteki DLL (GPL, build full shared z GyanD/codexffmpeg, wersja przypięta w workflow, licencja jako `FFMPEG-LICENSE.txt`). Program używa kopii obok siebie przed tym, co jest na PATH. ffplay jest potrzebny do odsłuchu bitu i miksu w słuchawkach; bez niego nagranie szłoby bez odsłuchu (stąd komunikat „Brak ffplay…”). Workflow sprawdza, że ffplay i ffmpeg (z DirectShow) działają oraz że zainstalowany program je widzi.

Budowa: workflow GitHub Actions `recorder-installer` (`.github/workflows/recorder-installer.yml`, uruchamiany ręcznie). Na runnerze Windows odpala testy modułów (w tym DPAPI), pobiera czcionki i ffmpeg z poprzedniego instalatora, buduje PyInstaller, sprawdza exe w trybie smoke, kompiluje Inno Setup i instaluje wynik po cichu, żeby sprawdzić zainstalowaną wersję. Wynik to artefakt `BitRymDym-Setup` z sumą SHA-256. Wersja jest w `installer/BitRymDym.iss` (`AppVersion`). Wgranie: AWS CLI v2 na endpoint R2 konta kt, klucze z Vault OpenBot; przed nadpisaniem poprzedni plik zostaje pod kluczem z wersją (`bitrymdym/BitRymDym-Setup-<wersja>.exe`).

Publiczny plik: `https://pub-8c6908a0590848aeb53ab34c2317d857.r2.dev/bitrymdym/BitRymDym-Setup.exe`

Bucket `kt-releases`, klucz `bitrymdym/BitRymDym-Setup.exe`. Plik nie wchodzi do gita i nie wchodzi na Vercel. Lokalny wynik Inno: `desktop/recorder/installer/output/BitRymDym-Setup.exe`.
