# Filtr uploadu bitów (auto check)

Status: implementacja w gałęziach `feat/upload-filter-db` → `feat/upload-filter-worker` → `feat/upload-filter-moderation`.

## Przepływ
1. Właściciel wysyła bit (`submitUserBeat`) → `PENDING_REVIEW` + `enqueue_beat_auto_check` (check przypięty do `master_asset_id` + `checksum_sha256`).
2. Worker na hoście E3 (`npm run autocheck:worker:poll`) bierze job (`claim_next_beat_auto_check`), dekoduje MASTER (ffmpeg), liczy Chromaprint (`fpcalc`), porównuje z własnym katalogiem (`beat_audio_fingerprints`), opcjonalnie pyta AcoustID (tylko fingerprint), separuje wokal Demucs `htdemucs` (CPU) i liczy udział okien 1 s z wokalem > −30 dBFS.
3. `decideAutoCheck` → `complete_beat_auto_check`:
   - twarde trafienie (własny katalog ≥ 0,85 i ≥ 20 s, AcoustID ≥ 0,9) → `rejected_match`, bit → `REJECTED`;
   - wokal (≥ 2 okna lub ≥ 2 %, albo pre-screen ≥ 0,8) → `rejected_vocals`, bit → `REJECTED`;
   - brak własnego katalogu lub separacji wokalu → `error` / `needs_config` (bit zostaje w `PENDING_REVIEW`, nie da się zatwierdzić);
   - reszta → `passed` (nadal czeka na moderatora — **nigdy auto-publikacji**).
4. Zatwierdzenie/publikacja bitu USER wymaga `beat_auto_check_cleared` (trigger `beats_auto_check_gate` + `assertBeatAutoCheckCleared` w serwisie).
5. Odwołanie: właściciel `request_beat_auto_check_appeal`; moderator `override_beat_auto_check` (log w `beat_moderation_decisions`, `auto_check_override`), bit wraca do `PENDING_REVIEW`.

## Brak klucza AcoustID
`ACOUSTID_CLIENT_KEY` pusty → provider `acoustid` = `not_configured`, check działa dalej na własnym katalogu + wokalu. Check nigdy nie przechodzi bez własnego katalogu i detekcji wokalu. Gdy klucz jest ustawiony, błąd albo timeout AcoustID zostawia bit w `PENDING_REVIEW` (`error`) — to nie jest wynik „brak trafienia”. Moderator może puścić sprawdzanie jeszcze raz.

## Providerzy (pluggable)
`src/lib/beats/auto-check/providers.ts` — interfejs `RecognitionProvider { name, required, recognize(ctx) }`. Nowy provider = nowa fabryka + dopisanie do listy w `worker.ts`. Zewnętrzni providerzy są `required: false` i muszą zwracać `not_configured` bez klucza.

## Backlog: paid providers (AudD, ACRCloud)
Nie zaimplementowane (decyzja właściciela: na razie tylko darmowe opcje).
- **AudD** — wysyła fragment audio (nie fingerprint); wymaga rozszerzenia regulaminu o przekazywanie audio podmiotowi trzeciemu i DPA.
- **ACRCloud** — fingerprint lub audio, lepsze pokrycie muzyki komercyjnej i coverów; płatny plan, klucz + secret.
- Implementacja: provider `required: false`, próg w `AUTO_CHECK_THRESHOLDS`, aktualizacja `docs/legal/UPLOAD_FILTER_TOS_ADDENDUM.md`.

## Ograniczenia
- Porównanie z własnym katalogiem jest liniowe (cały katalog w pamięci) — OK do kilku tysięcy bitów; potem indeks (np. hash 20-bitowy w tabeli).
- Wykrywa kopie/sample tego samego nagrania, nie wykrywa przearanżowań melodii.
- Fingerprinty powstają tylko dla bitów, które przeszły przez check — backfill istniejących bitów = osobny skrypt (backlog).

## Prawa w całym serwisie (decyzja właściciela 2026-11-26)
Migracja `20261126120000_rights_checks.sql`, kod `src/lib/rights/*`, poller `scripts/beat-auto-check-worker-poll.ts`.
- **Odciski katalogu:** poller w wolnej chwili liczy odcisk każdego bitu APPROVED/PUBLISHED (także bitów z generatora przeniesionych z „Oczekujących” do katalogu darmowego lub płatnego) i każdego sampla PUBLISHED oraz PENDING_REVIEW (`sample_audio_fingerprints`, dla czekających także `matches` jako podpowiedź dla moderatora). Brak pracy → kolejna próba po minucie.
- **Katalog utworów:** publikacja wymaga oświadczenia o prawach (`rights_accepted_at`) i ustawia `check_status = pending` przy ukrytym utworze (`withdrawn_at`). Poller (`claim_next_work_rights_check` → `complete_work_rights_check`) liczy odcisk gotowego mastera, każdego wgranego nagrania/stemu w projekcie (bez kopii sampli z katalogu) i własnego bitu, który nie przeszedł moderacji; porównuje z bitami katalogu (poza bitem projektu) i AcoustID. Brak trafień → `passed` i utwór wchodzi do katalogu. Trafienie, błąd albo odrzucony własny bit → `held` i decyzja w `/admin/prawa`. Strażnik `catalog_works_guard` nie wpuści utworu bez `passed`. `rejected`/`removed` blokuje ponowną publikację tego mastera.
- **Oświadczenia:** import stemów i „Sam mastering” (serwer wymaga `?rights=1&rv=<wersja>`), import wokalu (`source: "import"` + `rightsStatementVersion` w `/api/takes/session`; bez nich 400 `RIGHTS_REQUIRED`), publikacja w katalogu. Od 2026-11-26 każde oświadczenie przy wgraniu jest w `upload_rights_statements` (kto, projekt, wersja `UPLOAD_RIGHTS_STATEMENT_VERSION`, czas, SHA-256 pliku). Okno w przeglądarce zostało tylko jako wygoda. Nagrywarka Windows i mikrofon (`source` brak/`mic`/`recorder`) oświadczenia nie potrzebują.
- **Zgłoszenia:** „Zgłoś naruszenie praw” pod utworem, bitem i samplem (`/api/reports`, bez konta, 5 na godzinę z jednego połączenia, IP tylko jako skrót). Mail na kontakt@bitrymdym.pl. Panel `/admin/prawa`: wpuść/odrzuć utwór, zdejmij utwór, ukryj sampel, zarchiwizuj bit, odrzuć zgłoszenie. `/admin/utwory`: „Zdejmij z katalogu”.
- **Ograniczenia:** AcoustID zna głównie wydane utwory (słabo bity i a cappella). Płatny rozpoznawacz (ACRCloud) — decyzja właściciela. `source` przy nagraniu podaje klient: kto skłamie „mic”, ominie samo oświadczenie, ale nie ominie kontroli pliku (niżej).

## Lista blokad i kontrola każdego wgrania (2026-11-26)
Migracje `20261126171000_blocked_audio_fingerprints.sql`, `20261126172000_upload_rights_statements.sql`; kod `src/lib/rights/upload-screen*.ts`; worker `scripts/upload-screen-worker-poll.ts` (unit `bitrymdym-upload-screen-worker-poll.service`, env `UPLOAD_SCREEN_ENABLED=true`).
- **Zdjęcie = blokada:** „Odrzuć/Zdejmij” utworu, „Ukryj sampel” i „Zarchiwizuj bit” w `/admin/prawa` wołają `block_audio_source` → `blocked_audio_fingerprints` (utwór: zatwierdzony master + stemy i importy wokalu projektu; bit: aktywny MASTER z SHA-256 i odciskiem; sampel: plik z odciskiem, SHA-256 liczony przed usunięciem). Migracja uzupełniła listę o wszystko zdjęte wcześniej (utwory `rejected/removed`, zgłoszenia `removed`). Brakujące odciski i skróty liczy worker.
- **Przy każdym wgraniu (przed READY):** finalize nagrania, stemu/„Sam mastering”, gościa, bitu użytkownika i sampla sprawdza typ z zawartości (magic bytes) i SHA-256 w `check_upload_sha256` (lista blokad + bity katalogu poza bitem projektu i własnymi). Trafienie → odmowa (403 `BLOCKED_AUDIO`/`CATALOG_BEAT`), plik usunięty, wpis w `upload_block_events`.
- **Odcisk akustyczny (po READY, przed obróbką):** take dostaje `screen_status = pending`; worker liczy Chromaprint i porównuje z listą blokad (próg ścisły 0,85 i ≥ min(20 s, 80 % krótszego pliku) albo długi 0,5 i ≥ 30 s przy pliku ≥ 20 s) i z bitami katalogu (tylko ścisły). Trafienie → take `DELETED`, obiekt usunięty, wpis w dzienniku. 3 błędy → `error`.
- **Bramka obróbki:** trigger na `studio_master_jobs` i `studio_cleanup_jobs` (+ wcześniejsze `upload_screen_gate_project` w API) nie wpuści mastera, miksu, eksportu ani czyszczenia, gdy plik projektu czeka (`409 upload_screening`) albo jest zablokowany (`403 upload_blocked`). Bez działającego workera nowe wgrania czekają — świadomie (fail closed).
- **Bity użytkowników** sprawdza dalej auto-check: odciski z listy blokad są w jego katalogu (twarde trafienie → `rejected_match`).
- **Dziennik moderacji:** `/admin/prawa` → „Lista blokad i odrzucone wgrania”.
- **Nie objęte:** utwór referencyjny do masteringu (z założenia cudzy, usuwany po zadaniu) i profil szumu.

## Prywatne linki do odsłuchu (2026-11-26)
Token 192 bity (HMAC id linku), w bazie tylko sha256; termin, cofanie, właściciel (RLS: tylko swoje). Strona, `/api/listen/[token]/audio` i karta OG idą przez `lookupListenToken`: nieznany/wygasły/cofnięty/cudzy token = 404, a 20 nietrafionych prób z jednego IP w 10 min (`studio_listen_peek`, migracja `20261126170000`) blokuje dalsze próby z tego IP (strona 404, audio 429). Plik tylko przez podpisany URL na 60 s (bucket prywatny). Nagłówki `X-Robots-Tag: noindex` i `Referrer-Policy: no-referrer` (next.config).
