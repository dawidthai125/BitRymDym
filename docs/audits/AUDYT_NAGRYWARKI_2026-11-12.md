# Audyt nagrywarki Windows (desktop/recorder), 2026-11-12

Zakres: `record_app.py` (2593 linii), `account_upload.py`, `desk.py`, `own_fx.py`, `record_wav.py`, spec/instalator, `docs/WINDOWS_NAGRYWARKA.md`.
Metoda: czytanie kodu, uruchomienie okna pod Xvfb (zrzuty), istniejące self-testy. NIE sprawdzono na Windows z prawdziwym mikrofonem (DirectShow, ffplay).

## Znaleziska (wg wagi)

### Wysokie
1. **Wysyłka na konto blokuje okno.** `send_selected` -> `_upload` -> `upload_vocals` idzie synchronicznie na wątku Tk: kilka-kilkadziesiąt MB, wiele żądań, timeout 60/120 s. Okno "nie odpowiada", brak postępu, brak anulowania, można kliknąć Wyślij drugi raz (duplikat projektu).
2. **Odsłuch bitu robi żądania sieciowe na wątku Tk** (`preview_beat` -> `_beat_listen` -> `_client().plan_usage()` + `playback`). Do 30-60 s zamrożenia przy słabej sieci.
3. **Tk z innego wątku.** `_prepare_listen` / `_play_mix` (wątki) wołają `_beat_listen`, które czyta `self.beat_var.get()` (zmienna Tk). Tk nie jest bezpieczny wątkowo: sporadyczne zawieszenia/wyjątki.
4. **Błędy sieci pokazują surowe wyjątki.** `URLError`, `TimeoutError`, `ConnectionError` nie są łapane w `SiteClient._json`, `put_wav`, logowaniu, odświeżaniu sesji, bootstrapie. Użytkownik widzi np. `<urlopen error [Errno 11001] getaddrinfo failed>`. Przy wysyłce wyjątek spoza `RuntimeError` omija opakowanie "Projekt X jest na koncie" (osierocony projekt bez informacji).
5. **Nagrywanie bez wykrywania awarii mikrofonu i gubienia próbek.** ffmpeg dshow ma `stderr=DEVNULL` i `-rtbufsize 64k` (ok. 0,67 s). Przy chwilowym przeciążeniu ffmpeg loguje "real-time buffer too full ... dropping frames" i gubi dźwięk, a program nic nie mówi. Odłączony/zajęty mikrofon: proces ffmpeg umiera po starcie, `_tick` tego nie widzi, użytkownik dowiaduje się dopiero po Stop ("Nagranie jest puste").
6. **Brak oceny jakości ujęcia po nagraniu.** Przester, zbyt cicho, brak sygnału wychodzą dopiero na stronie. W tej samej sprawie dokumentacja obiecuje czerwony wskaźnik, ale tylko w trakcie.

### Średnie
7. **Wylogowanie nie unieważnia sesji na serwerze.** `sign_out` tylko czyści plik; refresh token zostaje ważny.
8. **Sesja (access + refresh token + anon key) w jawnym JSON** w `%APPDATA%\BitRymDym\desktop-session.json`. Rekomendacja: DPAPI (CryptProtectData). Nie zrobione tu: nie da się przetestować bez Windows.
9. **Błędny komunikat logowania:** każdy `HTTPError` (też 429 i 5xx) = "Sprawdź e-mail i hasło".
10. **Layout:** podpis pod ścieżkami miał stały `wraplength=900` poza listą w `_fit_copy`, a okno nagrywania ma minimum 720 px (domyślnie 980x820). Przy minimum tekst wychodził poza ramkę. Uwaga: pierwsze zrzuty przy 480 px nie były reprezentatywne; przy 720 i 980 px po poprawce układ jest czysty (zrzuty Xvfb, czcionki zastępcze, nie Windows).
11. **Zamknięcie okna w trakcie wysyłki** bez ostrzeżenia (po poprawce #1 wątek jest daemonem, projekt zostałby niepełny).

### Niskie / do rozważenia
12. `wav_duration_ms` i `wav_seconds` zakładają nagłówek 44 B; ffmpeg dopisuje chunk LIST (różnica < 1 ms, nieszkodliwe).
13. Wysyłka częściowa (np. 3 z 4 ścieżek) tworzy projekt bez ponowienia; ponowne "Wyślij" robi nowy projekt.
14. Brak testów automatycznych w CI dla `desktop/` (są tylko self-testy uruchamiane ręcznie).
15. Brak miernika poziomu przed nagraniem (próba mikrofonu bez REC). Wymaga drugiego procesu ffmpeg i testów na Windows.
16. `ffplay`/`ffmpeg` szukane w WinGet + PATH; brak komunikatu naprawczego poza "Brak ffmpeg".

## Poprawione w tej rundzie (patrz commit)
1, 2, 3, 4, 5 (wykrywanie awarii + liczenie gubionych próbek + większy bufor), 6 (ocena ujęcia), 7 (unieważnienie sesji), 9, 10, 11.

## Zostaje na później
8 (DPAPI), 13 (wznowienie), 14 (CI), 15 (miernik przed nagraniem), test na prawdziwym Windows z mikrofonem.
