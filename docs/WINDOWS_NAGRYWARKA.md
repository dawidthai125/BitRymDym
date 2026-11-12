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

## Instalator

Publiczny plik: `https://pub-8c6908a0590848aeb53ab34c2317d857.r2.dev/bitrymdym/BitRymDym-Setup.exe`

Bucket `kt-releases`, klucz `bitrymdym/BitRymDym-Setup.exe`. Plik nie wchodzi do gita i nie wchodzi na Vercel. Lokalny wynik Inno: `desktop/recorder/installer/output/BitRymDym-Setup.exe`.
