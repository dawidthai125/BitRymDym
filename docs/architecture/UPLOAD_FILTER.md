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
- **Oświadczenia:** import stemów (serwer wymaga `?rights=1`), „Sam mastering”, publikacja w katalogu; import wokalu pyta w oknie potwierdzenia (to ta sama ścieżka co nagranie, serwer ich nie odróżnia).
- **Zgłoszenia:** „Zgłoś naruszenie praw” pod utworem, bitem i samplem (`/api/reports`, bez konta, 5 na godzinę z jednego połączenia, IP tylko jako skrót). Mail na kontakt@bitrymdym.pl. Panel `/admin/prawa`: wpuść/odrzuć utwór, zdejmij utwór, ukryj sampel, zarchiwizuj bit, odrzuć zgłoszenie. `/admin/utwory`: „Zdejmij z katalogu”.
- **Ograniczenia:** AcoustID zna głównie wydane utwory (słabo bity i a cappella). Linki prywatnego odsłuchu (`listen-links`) nie są sprawdzane. Płatny rozpoznawacz (ACRCloud) — decyzja właściciela.
