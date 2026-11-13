# Limit nagrań liczy gotowe utwory (Owner, 2026-11-13)

Decyzja Ownera w rozmowie 2026-11-13.

- Ujęcia nie liczą się już do dziennego limitu. `claim_take_recording_session` nie zwraca `SESSION_DAY_CAP`; parametr `p_max_sessions_utc_day` zostaje w sygnaturze.
- Limit gotowych ujęć (`maxActiveReady`) nie liczy ujęć ułożonych w projekcie Studio (`studio_clips.source_take_id`).
- Dzienna liczba `recording.sessionsPerDay` (Free 1, Bronze 2, Silver 3, Gold 5) liczy gotowe utwory: pierwsze pobranie mastera z projektu (`claim_song_completion`, tabela `studio_song_completions`). Kolejne pobrania tego samego projektu się nie liczą. Ponad limit zużywa się kredyt pakietu `take`, inaczej `song_day_limit` (429) i komunikat w Studio. Blokowane jest pobranie kolejnego utworu, nie nagrywanie.
- Nagrywarka Windows ma osobny licznik wysyłek „Wrzuć do Studia” (`claim_desktop_studio_send`, tabela `desktop_studio_sends`), ta sama liczba na dobę UTC, bez kredytów pakietu.
- Pasek limitów konta: „Nagrania dziś” = gotowe utwory dziś.
- Mikrofon na stronie nie jest już blokowany przez `SESSION_DAY_CAP` (`recording-eligibility.ts`, `DAILY_TAKE_CAP_ACTIVE = false`). Licznik w serwisie uprawnień (Sacred WIP, nie ruszany) dalej podaje ujęcia z dziś tylko do wyświetlenia.

Migracja: `supabase/migrations/20261113120000_recording_counts_finished_songs.sql`. Test funkcji: PGlite (szkielet tabel), 5 scenariuszy.
