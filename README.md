# BitRymDym

Platforma muzyczna skupiona na rapie, hip-hopie i kulturze tworzenia bitów.

**Kierunek produktu:** od „znalazłem bit” → „nagrałem coś na nim” → „stworzyłem utwór” → „pokazałem go ludziom” → współpraca.

## Status

| Element | Wartość |
|---------|---------|
| Cold start | [docs/FINAL_COLD_START_HANDOFF.md](./docs/FINAL_COLD_START_HANDOFF.md) · **§12 prompts** |
| Master Handoff | [docs/MASTER_HANDOFF.md](./docs/MASTER_HANDOFF.md) |
| Project State | [docs/PROJECT_STATE.md](./docs/PROJECT_STATE.md) · living tip / deploy / **§2c connections** |
| SSOT | [v0.1 FOUNDATION DRAFT](./docs/ssot/MASTER_SSOT_v0.1.md) |
| **Git / production planes** | **ONLY** [PROJECT_STATE.md](./docs/PROJECT_STATE.md) §2 — do not trust SHAs in this README table |
| **Production URL** | https://www.bitrymdym.pl · apex → www (e2e NOT VERIFIED) · https://bitrymdym.vercel.app |
| POLISH-01 / P0 / P1 / P2 | **CLOSED / PRODUCTION VERIFIED** (ancestry) |
| Recording Waves 1–5 | **CLOSED** / **PRODUCTION VERIFIED** |
| Studio P5–P6.7 / V2 | see PROJECT_STATE · P6.5 Scenario B **BLOCKED / INCONCLUSIVE** |
| Community Upload | **CLOSED / LOCKED** |
| Premium Retention | **HOLD** · local WIP · [fencing contract](./docs/decisions/PREMIUM_RETENTION_FENCING_CONTRACT.md) |
| Płatności / Premium catalog | wyłączone / NOT IMPLEMENTED |
| Next | **STOP — OWNER DECISION REQUIRED** — [PROJECT_STATE NEXT UNIT](./docs/PROJECT_STATE.md) |

## Nowy agent — start tutaj

1. [docs/FINAL_COLD_START_HANDOFF.md](./docs/FINAL_COLD_START_HANDOFF.md)
2. [docs/MASTER_HANDOFF.md](./docs/MASTER_HANDOFF.md)
3. [docs/PROJECT_STATE.md](./docs/PROJECT_STATE.md)
4. Pełna kolejność: [docs/README.md](./docs/README.md)

## Dokumentacja

- [Master Handoff](./docs/MASTER_HANDOFF.md) — cold-start continuity
- [Master SSOT v0.1](./docs/ssot/MASTER_SSOT_v0.1.md) — prawda produktowa
- [System Architecture](./docs/architecture/SYSTEM_ARCHITECTURE.md) — baseline techniczny
- [Recording](./docs/architecture/RECORDING.md) — Waves 1–4 CLOSED
- [Otwarte decyzje](./docs/decisions/OPEN_DECISIONS.md)
- [Decision Log](./docs/decisions/DECISION_LOG.md)
- [Documentation Continuity](./docs/DOCUMENTATION_CONTINUITY.md)

## Stack (zatwierdzony)

| Warstwa | Decyzja |
|---------|---------|
| Frontend | Next.js · TypeScript · Tailwind · shadcn/ui (baza) · App Router (**OD-01**) |
| Application server | Next.js Server Actions / Route Handlers (**OD-02**) |
| Infrastruktura | Supabase: PostgreSQL, Auth, RLS, Storage (**OD-03**) |

## App

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

Skopiuj `.env.example` → `.env.local`. Nie commituj sekretów. Nie commituj `.agents/` / `.cursor/` / `skills-lock.json`.

**Zaimplementowane (prod):** Auth · Profiles · Roles · Permissions · Account levels · Platform + community beats · private `beat-audio` · Access Gate · PlaybackShell · Downloads · BPM V1 · signed beat audio transport · Recording Waves 1–4 (takes, entitlement, retention, janitor, Moje próbki).

**NOT IMPLEMENTED:** Anonymous QT · shared grants · MIX/EXPORT · track publish from recording · payments/Premium catalog · messaging · voting · comments product.

## Testy

**Testy nigdy nie łączą się z produkcją.** `.env.local` zawiera produkcyjne klucze — żaden test go nie czyta i nie wolno przekazywać jego wartości do testów.

```bash
npm test                    # domyślny zestaw: testy bez bazy i bez prawdziwego kodowania MP3
npm run test:media          # prawdziwe kodowanie MP3 — wymaga FFmpeg, FFprobe i libmp3lame
npx vitest run src/lib/studio   # wybrany katalog (ścieżki podawaj dosłownie)
npm run test:integration    # testy zapisujące do bazy — wyłącznie lokalny stack
```

- **Domyślny zestaw** (`vitest.config.ts`) wyklucza pliki z `src/test/integration-test-files.ts`, testy FX parity i dwa pliki prawdziwego kodowania MP3 (`src/test/media-encode-test-files.ts`). Wykluczenie działa także przy podaniu ścieżki wprost oraz w `npm run test:watch`, bo oba używają tej samej konfiguracji. Instaluje globalny guard sieci (`src/test/network-guard.ts`): każde żądanie `fetch` (supabase-js: REST, Auth, Storage), każde `new WebSocket(...)` (supabase-js Realtime) i każde połączenie gniazda Node (`net.Socket.prototype.connect` — czyli także `node:http`, `node:https`, `node:tls` i surowe `net`) poza `127.0.0.1` / `localhost` / `::1` kończy się błędem `[test-network-guard]` przed połączeniem. Guard działa tylko w procesie Vitest i nie ma przełącznika.
- **Kodowanie MP3** (`npm run test:media`, `vitest.media.config.ts`) uruchamia wyłącznie `e3-6-c-mp3-encode.test.ts` i `e3-7-c-hq-mp3-encode.test.ts`. Wymaga działających FFmpeg i FFprobe oraz enkodera `libmp3lame` na liście `ffmpeg -encoders`. Ścieżki biorą się z `E3_FFMPEG_PATH` i `E3_FFPROBE_PATH`, a gdy są puste — z nazw `ffmpeg` i `ffprobe` na PATH, tak jak `src/lib/audio/native-ffmpeg.ts`. Brak binarki, awaria narzędzia albo brak `libmp3lame` kończy przebieg błędem, nie pominięciem. Nie ma zatwierdzonego pinu wersji FFmpeg. Nieuruchomiony `test:media` to **NOT RUN**, nie PASS. Samo wykluczenie tych plików z `npm test` też nie jest PASS kodowania. Odrzuty placeholderów, pustego bufora i śmieci zostają w `npm test` (`src/lib/audio/mp3-qc-reject.test.ts`) i nie uruchamiają FFmpeg ani FFprobe.
- **Testy integracyjne** (`vitest.integration.config.ts`) wymagają jawnie: `BRD_INTEGRATION_TESTS=1` oraz `LOCAL_SUPABASE_URL`, `LOCAL_SUPABASE_ANON_KEY`, `LOCAL_SUPABASE_SERVICE_ROLE_KEY` z `supabase status -o env`. Brak konfiguracji, host spoza loopback (np. `*.supabase.co`) lub brak fixture'a → wszystkie pliki failują przed pierwszym zapytaniem. Nie istnieje flaga omijająca blokadę produkcji. Część plików ma dodatkowy własny opt-in (`F1C_LOCAL_DB_TEST=1`, `BEAT_FINALIZE_LOCAL_DB_TEST=1`) i lokalny kontener DB (`docker exec`). Pozostałe ustawienia (np. `E3_RENDER_JOBS_ENABLED`) testy biorą tylko z jawnie ustawionego środowiska powłoki. Lokalny stack: `supabase start` (wymaga działającego Dockera), wartości z `supabase status -o env`.
- Nowy test, który tworzy użytkowników, zapisuje do bazy lub Storage → dopisz go do `src/test/integration-test-files.ts` i bramkuj przez `resolveIntegrationEnv()` z `src/test/integration-env.ts`. Pilnuje tego `src/test/stu-11-production-test-safety.test.ts`.
- **Pominięty ≠ zaliczony.** Wynik `skipped` w testach integracyjnych oznacza, że nie zostały wykonane — raportuj go osobno.
- **Test integracyjny jest samowystarczalny.** Każdy test tworzy własne fixture'y z jawnym `id` (`randomUUID()`), w `finally` sprząta wyłącznie to, co sam utworzył, i przechodzi na świeżo zresetowanej lokalnej bazie (`supabase db reset --local`) — wielokrotnie pod rząd. Nie zakładaj danych z seeda ani z innych testów (np. `community-wave5-live` sam tworzy opublikowany beat PLATFORM). Nie poprawiaj globalnego seeda, żeby ukryć brak fixture'a. Klucz service role wyłącznie lokalny, po walidacji loopback.
- **Czego nigdy nie uruchamiać na produkcji:** `npm run test:integration`, `supabase db reset` (bez `--local`), skryptów zapisujących do bazy lub Storage, czyszczenia obiektów Storage. Produkcyjne MCP/SQL — tylko odczyt.
- **Sprzątanie fixture'ów:** `src/test/integration-fixtures.ts` — `createIntegrationFixtures(admin)` zwraca `trackUser` / `trackBeat` / `trackObject` i `cleanup()` wołane w `afterAll` (także gdy test padł). Kolejność zgodna z FK: obiekty Storage (także take'ów znalezionych po beacie/właścicielu) → take'i → zdarzenia i rezerwacje pobrań, assety → beaty → entitlementy → użytkownicy. Na końcu `cleanup()` sprawdza, że nic ze śledzonych rekordów nie zostało (beaty, profile, take'i, `auth.users`, assety beatów, entitlementy, `creator_experience_events` oraz śledzone obiekty Storage — sprawdzane dokładnym `list(folder, { search })`, bo lokalny Storage zwraca 400 dla `exists()` brakującego obiektu), i failuje z listą pozostawionych `id` / kluczy — bez sekretów. Usuwanie toleruje brak rekordu, a drugie `cleanup()` nic nie robi. Obiekt wysyłany przez test rejestruje się przez `trackObject` **przed** wysyłką, więc sprząta się także wtedy, gdy wiersz take'a nie powstał. `src/lib/takes/p4-live-verify.test.ts` (STU-16, jedyna autoryzowana edycja chronionego pliku) używa już tego helpera — wcześniej zostawiał na przebieg użytkownika `p4v-…`, beat i `creator_experience_events`, bo ignorował błędy usuwania i usuwał beat przed take'ami (`takes.beat_id` `RESTRICT`); po poprawce dwa przebiegi z lockiem nie zostawiają żadnych wierszy ani obiektów. `src/lib/takes/wave1-live.test.ts` (STU-16, edycja za zgodą Ownera) brał dowolny opublikowany beat i nie sprzątał użytkowników — przechodził tylko dzięki beatowi, który zostawiał `p4`; teraz tworzy własny beat, wszystko śledzi `createIntegrationFixtures`, a `cleanup()` biegnie w `onTestFinished` (także po porażce).
- **Blokada przebiegu:** `vitest.integration.config.ts` ma `globalSetup` (`src/test/vitest.integration.global-setup.ts` → `src/test/integration-run-lock.ts`), który przed pierwszym testem atomowo tworzy plik blokady `os.tmpdir()/bitrymdym-integration-<hash adresu stacku>.lock` (`open` z `wx`; w pliku token, PID, czas startu — bez adresu i kluczy). Drugi przebieg na tym samym stacku kończy się od razu `IntegrationRunLockedError`, zanim dotknie bazy. Blokada jest nieaktualna, gdy PID właściciela nie żyje albo ma ponad 2 h (niekompletny plik — po 30 s); przejęcie odbywa się przez `rename` z ponownym sprawdzeniem tokenu, więc stary przebieg nigdy nie usunie blokady nowego, a zwolnienie usuwa plik tylko przy zgodnym tokenie. Skrypt nadrzędny, który sam trzyma blokadę i uruchamia kolejne `vitest`, przekazuje token w `BRD_INTEGRATION_LOCK_TOKEN` (zagnieżdżony przebieg jej wtedy nie bierze ani nie zwalnia). Po czystym zakończeniu pliku blokady nie ma. Testy: `src/test/stu-15-integration-run-lock.test.ts`.
- **Uruchamianie lokalnie:** testy integracyjne idą sekwencyjnie (`fileParallelism: false`); dwa przebiegi naraz na tej samej bazie blokuje blokada przebiegu. Jeśli `npx supabase db reset --local` kończy się błędem seeda realtime (`tenants_external_id_index`), usuń **lokalny** schemat i powtórz reset: `docker exec supabase_db_bitrymdym-local psql -U postgres -d postgres -c "DROP SCHEMA IF EXISTS _realtime CASCADE;"`.
- **Osierocone obiekty Storage na produkcji (30, czekają na decyzję właściciela):** nie usuwać automatycznie. Procedura: (1) inwentaryzacja tylko do odczytu (`begin read only;` — `storage.objects` bez odpowiadającego rekordu w `takes` / `beat_audio_assets`, z bucketem, ścieżką, rozmiarem i datą); (2) lista do akceptacji właściciela; (3) po osobnym GO usunięcie wyłącznie przez Storage API (`storage.from(bucket).remove(paths)`) dokładnie dla zaakceptowanej listy — nigdy `DELETE` na `storage.objects` ani obchodzenie `storage.protect_delete`; (4) ponowna inwentaryzacja jako weryfikacja.

### Nagrywanie — wspólne lokalne zabezpieczenie i odzyskiwanie (Studio i Quick Take, STU-14/15)

Jedna implementacja dla obu powierzchni: logika w `src/lib/takes/take-recording-recovery.ts`, adapter IndexedDB w `src/lib/takes/take-recording-recovery-idb.ts`, baner w `src/components/takes/take-recording-recovery-banner.tsx`. Panel Studio (`studio-recording-panel.tsx`) i Quick Take na stronie beatu (`src/components/takes/recording-panel.tsx`) używają tego samego zapisu, formatu, dzierżawy i banera — żaden z nich nie otwiera IndexedDB sam.

Fazy panelu Studio: `READY` → `RECORDING` → `STOPPING` → `UPLOADING` → `PROCESSING` → `READY_TAKE`. Oś czasu jest zablokowana (`recordingLocked`) od `RECORDING` do `PROCESSING`; wtedy działa jeden guard wyjścia (`src/components/studio/studio-leave-guard.ts`: linki, formularze, `beforeunload`). Auto-stop następuje po limicie z eligibility (`maxRecordingSeconds`, nie więcej niż `RECORDING_GLOBAL_MAX_SECONDS`) i przechodzi zwykłą ścieżką zapisu. Quick Take ma te same limity z eligibility (gość / konto) i po limicie sam wysyła nagranie.

- **Format (wersja 2):** baza `brd-take-recovery`, magazyny `records` i `chunks`. Rekord: `recoveryId`, `formatVersion: 2`, `surface` (`STUDIO` | `QUICK_TAKE`), `beatId`, `projectId` (tylko Studio), `ownerUserId` (`null` = gość), `mimeType`, `startedAt`, `updatedAt`, `status` (`RECORDING` / `COMPLETE` / `INTERRUPTED`), `chunkCount`, `byteSize`, `maxRecordingSeconds`, `claim` (dzierżawa), `upload` (`stage` + serwerowy `takeId`). Rekord innej wersji jest traktowany jako uszkodzony, nie trafia do banera i znika po TTL.
- **Właściciel i zakres:** baner pokazuje tylko kopie bieżącego widza (gość — tylko kopie gościa, zalogowany — tylko swoje) i tylko dla bieżącego projektu (Studio) albo beatu (Quick Take). Jeśli strona zalogowanego nie zna id konta, zapis lokalny jest wyłączony zamiast tworzyć kopię bez właściciela. Kopia gościa wraca przez `/api/takes/anon/*`, kopia konta przez `/api/takes/*`.

- **Tożsamość take'a:** jedyną tożsamością jest serwerowy `takeId` z `POST /api/takes/session`. Lokalny `recoveryId` (UUID na jedno nagranie) nazywa tylko kopię w przeglądarce, zanim sesja istnieje — nie zależy od nazwy projektu ani beatu.
- **Lokalna kopia (przejściowe audio):** w Studio i w Quick Take podczas `RECORDING` każdy fragment z `MediaRecorder` (co 250 ms) trafia do IndexedDB (`brd-take-recovery`) w jednej transakcji z licznikiem fragmentów i rozmiarem — nigdy do `localStorage`. Kopia nie zawiera tokenów, podpisanych URL-i ani danych logowania. Nic nie jest zapisywane dopiero w `pagehide`/unmount; przy `pagehide` i ukryciu karty wymuszany jest tylko zrzut bufora (`requestData`).
- **Kiedy kopia jest odzyskiwalna:** `COMPLETE` — rekorder zatrzymany i wszystkie fragmenty zapisane; `INTERRUPTED` — zamknięty panel, zmiana trasy, Back/Forward lub odłączony mikrofon (zapisany spójny prefiks); kopia `RECORDING` nieaktualizowana od ponad 10 s (awaria przeglądarki, przeładowanie) też jest traktowana jako przerwana — baner pojawia się sam po upływie tych 10 s. Panel od pierwszego fragmentu pokazuje „trwa zabezpieczanie (jeszcze niepotwierdzone)”, a „zabezpieczone lokalnie” dopiero po potwierdzonym zapisie. Luki w fragmentach, zła wersja formatu, nieobsługiwany MIME, przekroczony czas lub rozmiar (`TAKE_AUDIO_MAX_BYTES`) → „Odzyskanie niemożliwe”, tylko odrzucenie. Nigdy fałszywy sukces.
- **Odzyskanie:** po powrocie do projektu (baner nad osią czasu) albo na stronę beatu (baner w panelu Quick Take) użytkownik dostaje „Odzyskaj i zapisz” / „Dokończ zapis” albo świadome „Odrzuć nagranie” (z potwierdzeniem). Nic nie jest wysyłane automatycznie. Jeśli kopia zna już serwerowy `takeId`, najpierw idzie idempotentna finalizacja tego samego take'a (serwer powtarza wynik dla `READY`) — dopiero martwa sesja (wygasła / bez pliku) pozwala na nowy upload. Kopia jest usuwana dopiero po potwierdzeniu zapisu (`READY`) tego samego `takeId`; inny `takeId` z serwera → kopia zostaje. Po sukcesie Quick Take pokazuje odzyskane nagranie do odsłuchu. Przy wymaganej zamianie próbki (`REPLACE_REQUIRED`) kopia i dzierżawa zostają do potwierdzenia albo anulowania zamiany.
- **Wiele kart i dzierżawa:** każda operacja (upload, odzyskanie, odrzucenie) bierze wyłączną dzierżawę w transakcji IndexedDB (serializowanej między kartami). Dzierżawa trwa 120 s, jest odnawiana co 30 s przez jeden łańcuch `setTimeout` i nie dłużej niż 15 min od przejęcia. Każda zmiana rekordu sprawdza właściciela dzierżawy (porównanie i zapis w jednej transakcji): stara karta nie nadpisze ani nie zwolni dzierżawy nowej — dostaje `LEASE_LOST`. Odnowienie i zwolnienie są idempotentne; odnawianie kończy się przy zakończeniu, anulowaniu albo utracie dzierżawy. Przed finalizacją przy odzyskaniu dzierżawa jest odnawiana — jeśli przepadła, nie ma finalizacji, a użytkownik widzi „obsługę przejęła inna karta”. Odnawianie jest lokalne, więc działa też bez sieci; baner odświeża listę po `online`, `focus` i `visibilitychange`. Nagranie trwające w innej karcie nie jest pokazywane. Dzierżawa istnieje tylko w przeglądarce — przed duplikatem po stronie serwera chronią `CONCURRENT_SESSION` i idempotentna finalizacja.
- **`PENDING_UPLOAD` — serwerowe okno wysyłki (STU-16, migracja `supabase/migrations/20261018120000_stu16_pending_upload_window.sql`, tylko lokalnie, niewdrożona):** rezerwacja `PENDING_UPLOAD` blokuje nowe nagrania tego samego aktora (konto albo hash gościa) tylko przez okno wysyłki **900 s liczone zegarem serwera od `created_at`** (`public.take_pending_upload_window_seconds()`, w TS `TAKE_PENDING_UPLOAD_WINDOW_SECONDS`; równe maks. dzierżawie klienta 15 min; wartość potwierdzona przez Ownera 2026-10-18 — `OD-REC-PENDING-UPLOAD-TTL`). Rezerwacja jest „przeterminowana”, gdy okno minęło **i** w `storage.objects` nie ma jej pliku. Wtedy następny claim tego samego aktora (`claim_take_recording_session` / `claim_anon_take_recording_session`, w tej samej transakcji i pod tym samym advisory lockiem co finalize) oznacza ją `FAILED` z `failure_reason = PENDING_UPLOAD_WINDOW_ELAPSED` i tworzy nową; to samo robi janitor przez `release_stale_pending_take_reservations(p_limit)` (tylko `service_role`, blokada per aktor, warunek ponawiany w `UPDATE`). Rezerwacja, której plik już dotarł, nigdy nie jest zwalniana i da się ją sfinalizować do `expires_at`; `READY` i retencja bez zmian; limit dzienny, `REPLACE_REQUIRED` i inne błędy claimu cofają zwolnienie (rollback transakcji). Janitor usuwa też plik wysłany już po zwolnieniu rezerwacji. Stary `takeId` po zwolnieniu dostaje przy finalizacji 403 „not awaiting finalize”, więc odzyskanie robi dokładnie jeden nowy upload (bez duplikatu). **`SESSION_DAY_CAP`:** zwolnienie rezerwacji po oknie (claim albo janitor → `FAILED` / `PENDING_UPLOAD_WINDOW_ELAPSED`) **nie zwraca** dziennej sesji — licznik dnia UTC liczy wszystkie take'i aktora z `created_at` w tym dniu, niezależnie od statusu (także `FAILED`); przejęcie slotu to nowy claim i zużywa kolejną sesję. Ryzyko szczątkowe: upload trwający dłużej niż okno zostaje unieważniony, jeśli w tym czasie ten sam aktor rozpocznie nowe nagranie albo przejdzie janitor — kopia lokalna zostaje do odzyskania, a spóźniony plik usuwa janitor. Przed STU-16 rezerwacja blokowała do pełnego `expires_at` retencji (gość: 2 h), jeśli przeglądarka nie znała `takeId`. Gdy go zna (sprawdzone w Chromium: upload zablokowany po `SESSION_CREATED`), odzyskanie woła finalizację tego take'a, serwer odpowiada 403 i oznacza go `FAILED`, co zwalnia slot — a klient robi dokładnie jeden nowy upload i dostaje jeden `READY`. Klient niczego nie usuwa na podstawie wieku, nie finalizuje w ciemno i nie tworzy duplikatu: kopia ze znanym `takeId` idzie tylko idempotentną finalizacją tego samego take'a, a przy `CONCURRENT_SESSION` kopia zostaje z komunikatem „trwa inna sesja nagrania”, który podaje, po ilu minutach niedokończona rezerwacja przestaje blokować zapis. Testy: `src/lib/takes/stu16-pending-upload-window-live.test.ts` (lokalny Supabase, stan bazy czytany po każdej operacji) i `src/lib/studio/stu-16-pending-upload-window.test.ts`.
- **TTL i sprzątanie:** kopie starsze niż `TAKE_LOCAL_RECOVERY_TTL_SECONDS` (24 h) oraz kopie już potwierdzone są usuwane przy następnym wyświetleniu banera (Studio lub strona beatu), niezależnie od zakresu. „Anuluj” w trakcie nagrywania usuwa kopię od razu.
- **Gdy pamięć jest niedostępna** (tryb prywatny, brak IndexedDB, brak miejsca): nagrywanie działa jak wcześniej, tylko w pamięci karty, a panel pokazuje „Lokalne zabezpieczenie niedostępne”. Przy przekroczeniu quota niepełna kopia jest usuwana, żeby nie udawała zabezpieczonej. Utracone połączenie z bazą (inna karta ją usunęła lub podniosła wersję — `versionchange`, zdarzenie `close`, `InvalidStateError`) adapter otwiera ponownie raz, przy następnej operacji, bez przeładowania strony.
- **Błędy zapisu przy odzyskaniu:** komunikaty są po polsku i bez surowych kodów: brak sieci → „Brak połączenia z serwerem… spróbuj ponownie po odzyskaniu połączenia”, pełny limit aktywnych nagrań (`REPLACE_REQUIRED` / `ACTIVE_READY_CAP`) → prośba o usunięcie lub zastąpienie nagrania, dzienny limit sesji (`SESSION_DAY_CAP`) → osobny komunikat, że kopia zostaje do odnowienia limitu (najdłużej do TTL kopii) albo odrzucenia. We wszystkich tych przypadkach lokalna kopia zostaje.
- **Ograniczenia przeglądarek:** przeglądarka może usunąć dane IndexedDB (czyszczenie danych, presja miejsca, Safari ITP po 7 dniach bez wizyty). Ostatnie ≤ 250 ms przed awarią może przepaść. `popstate` (Back/Forward) nie da się przechwycić — zamiast blokady historia działa normalnie, a przerwane nagranie zostaje do odzyskania. **IndexedDB nie gwarantuje przetrwania danych** — kopia lokalna to zabezpieczenie „best effort”, a jedynym potwierdzeniem zapisu jest `READY` z serwera. Zweryfikowano tylko w Chromium (390×844 i 1440×900; syntetyczne źródło audio lub systemowy „Miks stereo”, nie fizyczny mikrofon): przeładowanie w trakcie, odrzucenie z potwierdzeniem i Escape, brak sieci, `PENDING_UPLOAD`, długi upload z trzykrotnym odnowieniem dzierżawy, druga karta (`BUSY`, bez przycisków), guard wyjścia. Safari i Firefox nie zostały sprawdzone.
- **Diagnostyka:** DevTools → Application → IndexedDB → `brd-take-recovery` (`records`: `status`, `chunkCount`, `byteSize`, `claim`, `upload.stage` — bez treści audio). W DOM: `data-recording-phase`, `data-testid="take-local-safety"` (`data-state`), `take-recovery-banner` (`data-surface`), `take-recovery-item` (`data-kind`), `take-recovery-notice`. Komunikaty błędów nie zawierają tokenów ani podpisanych URL-i; do zgłoszeń nie dołączaj fragmentów audio ani cookies.
- **Komunikaty UI:** aktywne nagrywanie · zabezpieczone lokalnie · wymaga odzyskania · przesyłanie w toku · zapis potwierdzony · błąd zapisu · odzyskanie niemożliwe.
- Testy: `src/lib/studio/stu-14-recording-recovery.test.ts` (scenariusze STU-14 1–25 i kontrakt formatu) oraz `src/lib/studio/stu-15-recovery-lease.test.ts` (Quick Take, dodatkowe scenariusze odzyskiwania 21–25 ze specyfikacji STU-15, dzierżawa 26–36 na fałszywych timerach, sieć / wiele kopii / TTL / odrzucenie / limity 37–43) oraz `src/lib/studio/stu-15-recovery-idb.test.ts` (ponowne łączenie adaptera IndexedDB na deterministycznej atrapie). Wspólny magazyn w pamięci zamiast IndexedDB: `src/test/take-recovery-memory-store.ts`; bez mikrofonu i sieci.

## Zasady rozwoju

1. Nie zmieniać założeń produktu poza procesem aktualizacji SSOT.
2. Nie implementować elementów OPEN w OPEN_DECISIONS bez Owner GO.
3. Krytyczne reguły — zawsze po stronie serwera.
4. Małe etapy + testy + Documentation Continuity.
5. Start: MASTER_HANDOFF → PROJECT_STATE → SSOT → architecture → OPEN_DECISIONS.
6. Next = **OWNER DIRECTION / COLD START AUDIT**, nie auto-epic (Wave 5 = no automatic GO).
7. Documentation ≠ proof of shipped implementation; code/schema = evidence.
