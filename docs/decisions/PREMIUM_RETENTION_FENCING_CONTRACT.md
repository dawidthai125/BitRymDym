# Premium Retention — kontrakt fencingu logicznego usuwania (G3-TCB / G4-L / D-LEASE)

**Status:** DOCUMENTED / implementacja **IMPLEMENTED lokalnie (niezacommitowana, migracje niezastosowane zdalnie)**. Warstwa bazy **VERIFIED na lokalnym, jednorazowym PostgreSQL 17.10** z shimem platformy Supabase (§12: 35/35, kontrola negatywna wykrywa celowe dziury). **NOT VERIFIED:** PostgREST, GoTrue/podpis JWT, Storage API, projekt Supabase (§12.4). Decyzje Ownera D-TCB, D-ADMIN, D-G3-NAME, D-G4P, D-PAYLOAD i D-LEASE są **OWNER-ACCEPTED** (2026-10-24, polecenie Ownera „REQ-CHANGE CLOSEOUT → IMPLEMENTATION”). OD-PRET-01/02/04 rozstrzygnięte przez Ownera 2026-10-24 (§9). Wpis w rejestrach jest odroczony (§10.6). Premium Retention **HOLD**.
**Data:** 2026-10-24
**Zakres:** wymagania bezpieczeństwa i współbieżności dla executora Premium Retention (cleanup / mark EXPIRED). Dokument inżynierski.
**Podporządkowanie:** polityka produktowa retencji (`retention_expires_at`, `WORK_READY`, D-2/D-3) pozostaje wyłącznie w [`PREMIUM_EXPORT_AND_DOWNLOAD_CONTRACT.md`](PREMIUM_EXPORT_AND_DOWNLOAD_CONTRACT.md). Ten plik niczego tam nie nadpisuje. Definiuje tylko, *jak* wolno wykonać logiczne usunięcie. W razie sprzeczności rozstrzyga `PREMIUM_EXPORT_AND_DOWNLOAD_CONTRACT.md`.
**Non-authorization:** dokument nie autoryzuje: zastosowania migracji, zmian ról/IAM/Storage/cronów w produkcji, aktywacji Premium Retention, fizycznego usuwania danych, zmian sekretów ani deployu.

---

## 1. Glosariusz (rozróżnienie identyfikatorów)

Identyfikatory G3/G4 w tym pliku **nie** są bramkami SFM (`SFM_KIND_REJECT_*`) ani BPM. Zawsze używaj pełnych nazw: **G3-TCB**, **G4-L**, **G4-P**, **D-LEASE**.

| Termin | Znaczenie |
|---|---|
| TCB T1 | Minimalna zaufana baza: jeden autorytatywny PostgreSQL (silnik + funkcje fencingu + katalog uprawnień). |
| Aktor w zakresie | Role aplikacyjne, workery, executory, API, kolejki/replay. |
| Aktor poza zakresem | Superuser PostgreSQL, administratorzy infrastruktury, IAM / control plane chmury (D-ADMIN). |
| Logiczne usunięcie | Każda zmiana stanu w Postgresie, po której zasób przestaje istnieć dla produktu: `premium_works.status → EXPIRED`, `audio_artifacts.deleted_at/status='DELETED'`, `DELETE` wiersza. |
| Fizyczne usunięcie | Usunięcie bajtów (Storage `remove`, VACUUM, reclaim, backup). Poza zakresem fencingu (G4-P, D-G4P). |
| Epoch / fencing token | `premium_retention_scheduler_lease.fencing_token` (bigint, monotoniczny w obrębie jednej historii bazy). |

## 2. Decyzje Ownera (OWNER-ACCEPTED, 2026-10-24)

| ID | Decyzja |
|---|---|
| D-TCB | TCB = **T1**. Nie rozszerzać do T2/T3. |
| D-ADMIN | Superuser, admini infrastruktury i IAM są poza TCB. G3-TCB nie chroni przed nimi. |
| D-G3-NAME | Nazwa wymagania: **G3-TCB** (nie „G3 absolute”). |
| D-G4P | G4-P jest wyłączone z fencingu. Lifecycle fizyczny opisywany osobno. |
| D-PAYLOAD | Postgres jest autorytetem logicznym. Lokalizacja bajtów audio pozostaje OPEN (OD-PRET-05). |
| D-LEASE | Lease, epoch i logiczny DELETE w **jednym** autorytatywnym Postgresie. Zakaz split check-then-act. |

Domyślne zachowanie przy każdej nierozstrzygniętej decyzji: **fail-closed**, czyli brak logicznego usunięcia.

## 3. Definicje formalne

**G3-TCB.** Dla każdego aktora w zakresie każda ścieżka logicznego usunięcia albo (a) wykonuje atomową kontrolę aktualnego epoch w tej samej transakcji co efekt, albo (b) jest technicznie niedostępna. Niedostępność oznacza brak uprawnień w katalogu PostgreSQL (`has_table_privilege` = false), a nie konwencję w kodzie ani trigger oparty na `auth.role()`. `auth.role()` czyta claim `request.jwt.claims`, który sesja może ustawić sama, więc nie jest tożsamością.

**G4-L.** Niech generacja `(r, t)` oznacza run `r` z tokenem `t`. Jeśli generacja `(r', t')` z `t' > t` skutecznie przejęła lease, to żadne logiczne usunięcie wykonane przez `(r, t)` nie może zostać zatwierdzone (COMMIT) później w porządku serializacji. Wymagania:
- kontrola i efekt są atomowe względem autorytatywnego wiersza lease;
- nie ma wzorca SELECT, a potem niefencowany UPDATE/DELETE;
- retry ani replay nie przywraca praw starej generacji;
- epoch dostarczony przez klienta nie wystarcza sam: porównywana jest para `(holder_run_id, fencing_token)` z wierszem w bazie, plus nieprzeterminowanie.

**D-LEASE.** Utrata własności i ustanowienie nowego epoch są atomowe. Nie istnieje okno, w którym stary właściciel utracił własność, nowy epoch nie jest ustanowiony, a stary właściciel nadal może zatwierdzić logiczne usunięcie.

**Definicja własności (PROPOSED — wymaga akceptacji Ownera, OD-PRET-07).** Własność jest tracona w pierwszej pozycji porządku blokad wiersza lease, w której `clock_timestamp()` ≥ `lease_expires_at`, albo przy udanym `release` lub przejęciu. Przy tej definicji D-LEASE dla przejścia EXPIRED jest spełnione z konstrukcji. Przy definicji „zegar ścienny” nie jest udowodnione: commit starej generacji może nastąpić po `lease_expires_at` o czas oczekiwania na blokadę (zob. F5).

**G4-P (wyłączone).** Testy i dokumenty G4-L nie mogą sugerować gwarancji fizycznych: braku bajtów, VACUUM, backupów, Storage.

## 4. Inwentaryzacja ścieżek logicznego usuwania (stan przed implementacją, 2026-10-24)

Stan po implementacji: §4a.

| # | Ścieżka | Efekt | Fencing | Aktor | G3-TCB / G4-L |
|---|---|---|---|---|---|
| P1 | `premium_retention_mark_expired_if_lease` (`supabase/migrations/20261029130100_*`) | `premium_works` WORK_READY→EXPIRED + event `EXPIRE_WORK` | Tak: lease FOR UPDATE → holder/token/expiry → work FOR UPDATE → CAS | worker (`service_role`) | G4-L: **PROVEN by design analysis warunkowo** (zakłada brak fałszowania wiersza lease, czyli G3-TCB, i brak PITR/failover); NOT VERIFIED na żywej bazie |
| P2 | `premium-retention-cleanup-service.ts` ~L415–419 (PostgREST `update`) | `audio_artifacts.deleted_at`, `status='DELETED'` | **Brak** | worker (`service_role`) | **FAIL** |
| P3 | Bezpośredni DML `service_role` na `premium_works` (`GRANT ALL`, `20261021115453_*` L83; trigger przepuszcza `service_role`) | dowolny status / DELETE | Brak | każdy kod z kluczem service | **FAIL** (bypass przez uprawnienia) |
| P4 | Bezpośredni DML `service_role` na `premium_retention_scheduler_lease` (`GRANT ALL`, `20261029130000_*` L67) | fałszowanie `fencing_token` / `holder_run_id` | Brak | jw. | **FAIL** (fence fałszowalny przez aktora, którego ma ograniczać) |
| P5 | Bezpośredni DML `service_role` na `audio_artifacts` (`20260928200000_e3_1_audio_foundation.sql`: trigger L299–332 sprawdza tylko `auth.role()`, jedyny jawny GRANT to SELECT dla `authenticated` L345; DML `service_role` wynika z domyślnych uprawnień Supabase + BYPASSRLS — inferencja, niezweryfikowane w katalogu) | soft/hard delete | Brak | jw. | **FAIL** (do potwierdzenia katalogiem) |
| P6 | Render rollback: `src/lib/audio/render-worker-pipeline.ts`, `src/lib/audio/render-job-service.ts`, `src/lib/sfm/sfm-artifact-service.ts` | hard DELETE świeżo wstawionego `audio_artifacts` | Brak | `service_role` | poza retention; zakres → OD-PRET-03 |
| P7 | `src/lib/auth/delete-account.ts` (L318, L321) | hard DELETE `audio_artifacts` po `owner_id`; kaskada `auth.users → profiles → premium_works` NIE POTWIERDZONA (trigger `BEFORE DELETE` na `premium_works` może ją zablokować, jeśli sesja GoTrue nie ma claimu `service_role` — osobne ryzyko poza tym kontraktem) | Brak | `service_role` | zakres → OD-PRET-03 |
| P9 | `src/app/api/cron/premium-retention/route.ts` → `runPremiumRetentionCleanupBatch` | wejście do P1/P2 | aktywny tryb fail-closed (`LEASE_TTL_REQUIRED`, OD-62-06 HOLD); trasy nie ma w `vercel.json` | cron | dziedziczy FAIL z P2 |
| P8 | `sfm_expire_versions` (`20261014180000_*`) | `audio_artifacts.status='EXPIRED'` | Brak | `service_role` | zakres → OD-PRET-03 |

Pozycja G4-P (informacyjnie): Storage `remove` (cleanup-service ~L401) wykonuje się **przed** kontrolą obecności fence (~L546) i przed P1. Przy `STALE_TOKEN` / `RETENTION_NOT_DUE` utwór może zostać `WORK_READY` bez bajtów.

## 4a. Stan po implementacji (lokalnie, niezacommitowane, migracje niezastosowane zdalnie)

Nowa migracja: `supabase/migrations/20261029130200_premium_retention_worker_role_fenced_soft_delete.sql` (nagłówek: nie stosować bez OD-62-08). Poprawione migracje WIP: `20261029130000_*` (lease), `20261029130100_*` (L2). „VERIFIED PG” w tej tabeli oznacza: potwierdzone na lokalnym PostgreSQL 17.10 przez bramkę §12, na poziomie bazy (katalog, RLS, triggery, blokady), bez PostgREST, GoTrue i Storage API.

| # | Stan po zmianie | Ocena |
|---|---|---|
| Rola | `premium_retention_worker`: NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOINHERIT, NOCREATEROLE, NOCREATEDB, NOREPLICATION; członkiem jest wyłącznie `authenticator`; dostęp przez JWT z claimem `role` (wzorzec `far01_live_mutator`). Na PG16+ `postgres` (bez superusera na Supabase) nie może zmienić SUPERUSER/REPLICATION/BYPASSRLS, więc migracja je asercjonuje (fail-closed `RAISE`), a resztę resetuje `ALTER ROLE`. Uprawnienia: SELECT na `premium_works` i `audio_artifacts` (RLS: tylko artefakty powiązane z Premium); EXECUTE na lease (acquire/renew/release/get), L2, soft-delete oraz helperach polityk `premium_retention_artifact_is_linked` i `premium_retention_object_is_purgeable`; Storage SELECT/DELETE tylko dla obiektów zaległych utworów `WORK_READY`. Zero DML na tabelach `public`. `service_role` nie ma EXECUTE na mutujących RPC (acquire/renew/release, L2, soft-delete); zachowuje `lease_get` i SELECT na lease. Kod aplikacji wywołuje je wyłącznie klientem workera. | IMPLEMENTED; VERIFIED PG |
| Klient | `src/lib/supabase/premium-retention-worker-client.ts`: `PREMIUM_RETENTION_WORKER_JWT` + klucz anon; odrzuca brak JWT, klucz service jako JWT/apikey, `sb_secret_` i JWT z inną rolą. Executor, scheduler (także dry-run) i klient lease używają wyłącznie tego klienta. | IMPLEMENTED; testy jednostkowe (mock) |
| P1 | L2: `search_path = pg_catalog, public, pg_temp`, `v_now` po blokadzie lease (F5), EXECUTE dla workera. Jedno `EXPIRE_WORK`, potem `ALREADY_EXPIRED`. | IMPLEMENTED; VERIFIED PG (idempotencja, fencing przez wspólną blokadę lease) |
| P2 | Zastąpione przez `premium_retention_soft_delete_artifact_if_lease(p_work_id, p_artifact_id, p_run_id, p_fencing_token)`: blokady lease → work → artifact (FOR UPDATE), holder/token/expiry, `WORK_READY` + retencja należna wg czasu bazy, powiązanie artefaktu z utworem, `deleted_at IS NULL`; zwraca przyczynę (`SOFT_DELETED`, `ALREADY_DELETED`, `STALE_TOKEN`, `LEASE_*`, `RETENTION_NOT_DUE`, `CAS_CONFLICT`, …). Kod executora nie wywołuje `.update`/`.delete`. | IMPLEMENTED; VERIFIED PG (dwie sesje, obie kolejności, rollback, zerwane połączenie, replay, REPEATABLE READ → `40001`) |
| P3 | `REVOKE ALL` na `premium_works` i `premium_unlock_events` FROM `service_role`, potem `GRANT SELECT`. Usuwa też REFERENCES / TRIGGER / MAINTAIN z domyślnych uprawnień Supabase. Zapisy aplikacji idą przez funkcje SECURITY DEFINER (w `src` brak bezpośredniego DML na tych tabelach). | IMPLEMENTED; VERIFIED PG |
| P4 | Lease: `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role; GRANT SELECT … TO service_role`. Bezpośredni DML blokują uprawnienia (`42501`); trigger (`auth.role()`) jest tylko drugą warstwą. | IMPLEMENTED; VERIFIED PG |
| P5 | `audio_artifacts`: REVOKE UPDATE/DELETE `service_role` niemożliwy bez decyzji (render, usuwanie konta). `REVOKE TRUNCATE` FROM `service_role`, anon, authenticated (triggery wierszowe nie działają przy TRUNCATE). Trigger dla artefaktu powiązanego z Premium: (a) powiązanie (`owner_id`, `take_id`, `project_id`) niezmienne, także przy wpięciu obcego artefaktu w utwór Premium; (b) `object_key` i `storage_bucket` niezmienne; (c) przejście do `deleted_at` NOT NULL albo `status='DELETED'` wymaga transakcyjnego GUC `brd.premium_retention_fenced_artifact` = id artefaktu, ustawianego w migracjach wyłącznie przez fenced RPC; (d) soft-delete jest nieodwracalny (`deleted_at` i `status='DELETED'` nie wracają). | IMPLEMENTED częściowo; VERIFIED PG dla (a)–(d); hard DELETE i `status='EXPIRED'` nadal otwarte → OD-PRET-03 |
| P6–P8 | Bez zmian. Na PG potwierdzono, że `service_role` nadal może wykonać hard DELETE i ustawić `status='EXPIRED'` na artefakcie powiązanym (test RESIDUAL). | BLOCKED (OD-PRET-03) |
| P9 | Cron → scheduler → executor jako worker; bez `PREMIUM_RETENTION_WORKER_JWT` klient rzuca błąd przed pierwszym efektem (także w dry-run: `BATCH_ABORT`, a trasa nadal odpowiada 200 `success:true` — monitoring nie może opierać się na samym kodzie HTTP). Fence walidowany przed pierwszym efektem (F8). | IMPLEMENTED; testy jednostkowe (mock) |

**Ryzyka rezydualne (nie zamknięte implementacją):**
- Proces aplikacji nadal ma `SUPABASE_SERVICE_ROLE_KEY`. `service_role` może wykonać hard `DELETE` na `audio_artifacts` (P6/P7, kaskada `take_id ON DELETE CASCADE`) i ustawić `status='EXPIRED'` (P8). Potwierdzone na PG. Proponowane zamknięcie: DELETE i EXPIRED artefaktów powiązanych tylko przez dedykowane RPC, potem `REVOKE DELETE` dla `service_role`. Wymaga decyzji OD-PRET-03, bo zmienia render rollback, usuwanie konta i `sfm_expire_versions`. **BLOCKED.**
- Guard triggera i fence GUC opierają się na `auth.role()` i ustawieniu sesji. Każda surowa sesja SQL z prawem UPDATE (np. `postgres`) może ustawić oba (test RESIDUAL na PG). To aktor poza TCB (D-ADMIN). To, że PostgREST nie pozwala ustawić tego GUC, **NIE jest zweryfikowane** testem — wynika z braku publicznej funkcji opakowującej `set_config`.
- G4-P: Storage `remove` następuje przed fencowanym soft-delete (dozwolone przez D-G4P). Stara generacja może usunąć bajty jednego obiektu, ale nie może zatwierdzić logicznego usunięcia. Polityka Storage wymaga zaległego `WORK_READY`, więc utwór z przedłużoną retencją jest chroniony. Kolejności nie odwrócono (zależy od OD-PRET-05).
- Nie zweryfikowano, że Storage API akceptuje custom rolę z JWT oraz że podpis HS256 sekretem projektu jest akceptowany przy nowych kluczach asymetrycznych Supabase.
- `premium_unlock_work` i `premium_mark_work_ready` przyjmują `p_now` od wywołującego. Przeszła wartość czyni utwór „należnym” od razu, a spóźniona może odblokować utwór po fencowanym soft-delete (utwór `WORK_READY` bez artefaktów). Funkcje sprzed tej zmiany; decyzja Ownera: czas z bazy albo odmowa unlocku przy usuniętych artefaktach. **BLOCKED.**
- L2 (mark EXPIRED) nie sprawdza pod blokadą utworu, czy nie istnieją żywe powiązane artefakty (TOCTOU: render może wstawić artefakt po policzeniu w aplikacji). Proponowane: guard `NOT EXISTS` z nowym powodem. Nie wdrożone — zmienia kontrakt L2.
- Zamknięte w tej bramce: `service_role` miał EXECUTE na acquire/renew/release, L2 i soft-delete. Mógł więc przejąć lease (zablokować workera) i — razem z `premium_mark_work_ready` z przeszłym `p_now` — wykonać fencowany soft-delete dowolnego artefaktu. EXECUTE odebrany (PG PASS).
- Nadal otwarte (powiązanie od strony utworu): `service_role` może wywołać `premium_mark_work_ready` z przeszłym `p_now` dla dowolnego `domain_ref` (funkcja nie sprawdza istnienia ani właściciela). Istniejące artefakty stają się wtedy „powiązane i należne”, a prawowity worker je usunie. Zamknięcie: czas z bazy i walidacja `domain_ref` — decyzja Ownera razem z `p_now`. **BLOCKED.**
- `service_role` może zmienić `status` na inny niż `DELETED` (np. `FAILED`, `EXPIRED`), `expires_at` i `byte_size` artefaktu powiązanego. Trigger tego nie blokuje; czy produkt traktuje te stany jak usunięcie — niezweryfikowane. Zakres → OD-PRET-03.
- `premium_unlock_work` i `premium_mark_work_ready` (funkcje sprzed tej zmiany) mają `search_path = public` zamiast `pg_catalog, public, pg_temp` (test PG wypisuje je jako RESIDUAL). Wykorzystanie wymaga surowej sesji SQL z prawem tworzenia tabel tymczasowych.
- Renew lease odbywa się tylko między utworami, nie przed każdą partią artefaktów (§10 krok 4). Utrata lease w trakcie utworu kończy go przy następnym fencowanym wywołaniu; bezpieczeństwo logiczne zapewnia fence, ale okno G4-P to jeden obiekt.
- Worker dziedziczy domyślne EXECUTE od PUBLIC na funkcjach spoza `premium_retention%`; nie zostały wyliczone.
- Usuwanie konta z utworem Premium jest **zablokowane** (potwierdzone na PG): `premium_unlock_events.work_id ON DELETE SET NULL` zderza się z triggerem append-only (`P0001`), a usunięcie przez GoTrue bez claimu `service_role` odrzuca wcześniejszy trigger. Konflikt wymagań (prawo do usunięcia konta vs append-only), stan sprzed tej zmiany. Zabezpieczenia nie osłabiono.
- Migracje nie ustawiają `lock_timeout` ani `statement_timeout`; rola workera nie ma `ALTER ROLE … SET` (potwierdzone na PG). Fencowany soft-delete czekający na artefakt trzyma blokadę lease, więc renew/acquire/L2 czekają za nim. Wait jest ograniczalny przez `lock_timeout` (`55P03`, test PG); czy limit platformy dotyczy workera przez PostgREST — NOT VERIFIED.
- Wywołujący w REPEATABLE READ dostaje przy współbieżnym przejęciu `40001` bez efektu; klient musi traktować to jako wynik niejednoznaczny (PostgREST używa READ COMMITTED).
- Mint i konfiguracja `PREMIUM_RETENTION_WORKER_JWT` w produkcji to bramka (sekret). Skrypt mint (wzór: `scripts/far01-mint-role-jwt.ts`) nie został utworzony ani uruchomiony. Zmienna jest opisana (bez wartości) w `.env.example`.
- `premium_credit_periods` i `premium_track_unlocks` zachowują `GRANT ALL` dla `service_role`. Nie są ścieżkami logicznego usunięcia retention; zakres do decyzji.
- PITR / restore cofa `fencing_token` (F4, OD-PRET-06). NOT PROVEN.

## 5. Ustalenia audytu (2026-10-24)

| ID | Waga | Ustalenie |
|---|---|---|
| F1 | High | P2: soft-delete `audio_artifacts` bez fence; lease odnawiany tylko między utworami, więc stara generacja może kasować po przejęciu. |
| F2 | Critical | P3/P4: tożsamość workera (`service_role`) ma `GRANT ALL` na `premium_works` i na tabeli lease. Brak uprawnień nie jest realnym ograniczeniem. |
| F3 | Medium (hipoteza) | Check-then-act: decyzja o usunięciu artefaktów opiera się na odczycie `premium_works` z czasem `nowMs` aplikacji. `premium_unlock_work` może w międzyczasie przedłużyć retencję. |
| F4 | Medium (OPEN) | PITR / restore / failover asynchroniczny cofa `fencing_token`; token może zostać wydany ponownie. Ochrona w bazie zależy wtedy od unikalności `run_id`. Split-brain nie jest pokryty. |
| F5 | Low | `v_now := clock_timestamp()` jest przypisywany przed oczekiwaniem na blokadę wiersza lease. W L2 (L24) i acquire (L91) dzieje się to przed `SELECT … FOR UPDATE`. W renew (L193) dzieje się to przed pojedynczym `UPDATE … WHERE lease_expires_at > v_now` (L212–221), który czeka na blokadę. Nie łamie G4-L, ale przesuwa granicę czasu rzeczywistego. |
| F6 | Low | Filtr soft-delete bez `storage_bucket` i bez `deleted_at IS NULL`; czas z aplikacji, nie z bazy. |
| F7 | Low (hipoteza) | Możliwy deadlock: kaskada DELETE `profiles` vs L2. L2 trzyma blokadę work, a potem kontrola FK przy `INSERT premium_unlock_events.user_id` (`20261029130100` L149) bierze key-share na profilu. Skutek: abort, tylko żywotność. |
| F8 | Medium | Fence sprawdzany (`LEASE_FENCE_REQUIRED`) dopiero po usunięciach. Wywołanie bez fence najpierw usuwa, potem zwraca błąd. To nie jest fail-closed. |
| F9 | Medium | Test live `premium-retention-cleanup.d2-d6.live.test.ts` wywołuje executor bez `leaseFence` (nieaktualny). Po uruchomieniu nie przeszedłby i wykonałby niefencowane usunięcia na lokalnej bazie. |

Stan po implementacji (§4a): F1, F2, F5, F6, F8 i F9 zaadresowane w kodzie. Test live `d2-d6` wymaga `LOCAL_SUPABASE_JWT_SECRET`, bierze lease i oczekuje odrzucenia niefencowanego soft-delete; uruchamia SQL jako superuser z podstawionym claimem, więc sprawdza komunikat triggera, a nie katalog uprawnień — nieuruchomiony. Dowód katalogowy (`42501` jako rola workera) daje bramka §12. F3: decyzja o logicznym usunięciu zapada w bazie pod blokadą utworu; decyzja o Storage `remove` nadal opiera się na odczycie aplikacji (G4-P). F4 i F7 bez zmian (OPEN).

## 6. Kryteria akceptacji (PASS)

1. Worker łączy się jako dedykowana rola X (nie `service_role`, NOBYPASSRLS). `has_table_privilege(X, t, 'INSERT'|'UPDATE'|'DELETE'|'TRUNCATE')` = false dla `premium_works`, `audio_artifacts`, `premium_retention_scheduler_lease`, `premium_unlock_events`.
2. X ma EXECUTE wyłącznie na funkcjach lease, P1 i nowej fenced funkcji soft-delete artefaktu (oraz na helperach polityk RLS/Storage, które tylko czytają — §4a). Każda blokuje najpierw wiersz lease, potem obiekt, i sprawdza holder + token + expiry w jednej transakcji.
3. Kod retention nie wywołuje `.update` / `.delete` na tych tabelach. Test live jako X: bezpośredni UPDATE kończy się `42501`.
4. Fence jest wymagany przed pierwszym efektem. Brak autorytetu (brak wiersza, błąd, wynik niejednoznaczny) oznacza zero mutacji.
5. Ścieżki P5–P8 są fencowane, niedostępne dla X albo formalnie wyłączone decyzją OD-PRET-03.
6. Funkcje mają ustalonego właściciela, `search_path = ''` (lub `pg_catalog, public, pg_temp`), `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` potwierdzone katalogiem (`has_function_privilege`).
7. Testy na prawdziwym Postgresie (§7) przechodzą. Testy jednostkowe z mockami nie są dowodem współbieżności.

## 7. Wymagane testy (real Postgres, lokalny Supabase)

| # | Wymaganie | Stan pokrycia (2026-10-24) |
|---|---|---|
| 1 | Bieżąca generacja wykonuje dozwoloną operację | tylko mock |
| 2 | Stara generacja po przejęciu nie zatwierdza logicznego usunięcia | mock dla P1; P2 nieobjęte (fałszywe poczucie bezpieczeństwa) |
| 3 | Współbieżny bump vs delete zachowuje linearyzację (dwie sesje, obie kolejności) | brak (testy „parallel” są sekwencyjne) |
| 4 | Crash przed COMMIT — brak częściowego efektu | brak |
| 5 | Crash po COMMIT przed ACK — brak niebezpiecznego powtórzenia | tylko mock |
| 6 | Idempotentne powtórzenie (jedno `EXPIRE_WORK`) | tylko mock / model |
| 7 | Replay starej intencji nie omija epoch | tylko mock |
| 8 | Postgres niedostępny — brak best-effort delete | częściowo mock; F8 przeczy |
| 9 | Rola aplikacyjna nie omija fenced RPC bezpośrednim SQL | brak; obecnie FAIL z konstrukcji (F2) |
| 10 | Brak niezamierzonego PUBLIC EXECUTE | tylko regex na tekście SQL |
| 11 | Ścieżki admin/superuser opisane jako poza G3-TCB | ten dokument (§1–2); brak testu |
| 12 | Testy nie sugerują G4-P | częściowo; nazwy testów „parallel”/„concurrent”/„CAS update” do poprawy |

Dodatkowo: symulacja restore (token N+1 wydany ponownie innemu runowi), test F5 (kolejka L2 za blokadą po expiry), test F7 (deadlock).

Stan po implementacji: dodano mock/tekstowe testy fencingu (`premium-retention-fenced-soft-delete.test.ts`, describe „G3-TCB / G4-L fencing” w `premium-retention-cleanup-service.fail-closed.test.ts`, test F5 w `premium-retention-mark-expired-l2.test.ts`). Pokrywają mapowanie przyczyn, zatrzymanie po utracie lease, brak efektów bez fence, odrzucanie poświadczeń i kontrakt tekstowy SQL (kolejność blokad, REVOKE, `search_path`). Same w sobie **nie** są dowodem dla #3, #4, #9, #10. Test live D2–D6 zaktualizowany, nieuruchomiony.

Stan po bramce §12 (prawdziwy PostgreSQL 17.10, warstwa bazy):

| # | Pokrycie | Rodzaj dowodu |
|---|---|---|
| 1 | D3 happy path, `ALREADY_DELETED` | PG |
| 2 | D3 `STALE_TOKEN`/`LEASE_MISMATCH`/`LEASE_EXPIRED`; D4 replay po przejęciu | PG |
| 3 | D4: przejęcie vs delete w obu kolejnościach, rollback przejęcia, release vs delete, dwie sesje tej samej generacji, REPEATABLE READ | PG, dwie sesje, wykrycie czekania przez `pg_locks` |
| 4 | D3 zerwane połączenie przed COMMIT; rollback po sukcesie | PG |
| 5 | D3 ponowienie po COMMIT → `ALREADY_DELETED` | PG (bez warstwy HTTP/ACK) |
| 6 | D3 L2: jedno `EXPIRE_WORK`, potem `ALREADY_EXPIRED` | PG |
| 7 | D4 replay dokładnego wywołania starej generacji | PG |
| 8 | Postgres niedostępny | tylko mock (aplikacja) |
| 9 | D2: worker i `service_role` → `42501`; niefencowane zmiany `service_role` → `P0001` | PG; hard DELETE / `EXPIRED` = RESIDUAL |
| 10 | D1: `has_function_privilege` dla anon/authenticated/workera | PG |
| 11 | D2 RESIDUAL: surowa sesja SQL fałszuje GUC | PG (opis granicy) |
| 12 | D5 G4-P zapisany jako ograniczenie | PG |

Nieobjęte: symulacja restore (OD-PRET-06), F7 (deadlock kaskady konta — usuwanie konta i tak jest zablokowane), warstwa PostgREST/GoTrue/Storage API.

## 8. Blokery implementacji

| Bloker | Powód | Stan |
|---|---|---|
| B1 | WIP lease / L2 / scheduler / cron / testy o niejasnej własności. | ROZWIĄZANY: Owner zgodził się na przejęcie WIP lokalnie, bez commit/push (2026-10-24). |
| B2 | Dedykowana rola workera i odebranie DML `service_role`. | ROZWIĄZANY decyzją (OD-PRET-01/02); wdrożenie roli, JWT i migracji pozostaje bramką. |
| B3 | Soft vs hard delete artefaktu. | ROZWIĄZANY decyzją (OD-PRET-04 = soft). |
| B4 | Brak docker / lokalnego Postgresa w środowisku agenta. Testy §7 nie mogą zostać uruchomione. | ROZWIĄZANY dla warstwy bazy (§12, embedded PostgreSQL 17.10 za zgodą Ownera). Pełny stos Supabase nadal niedostępny. |

## 9. Otwarte decyzje (nie rozstrzygać bez Ownera)

| ID | Pytanie | Domyślnie |
|---|---|---|
| OD-PRET-01 | Tożsamość DB workera: dedykowana rola NOLOGIN przez JWT z claimem roli (wzorzec `far01_live_mutator`, `20261003012453_far01_live_mutator_role.sql`; wymaga podpisu sekretem JWT projektu — inferencja) czy rola LOGIN przez bezpośrednie połączenie | fail-closed (Retention HOLD) |
| OD-PRET-02 | Odebranie DML `service_role` na `premium_works` / lease / `audio_artifacts` vs uznanie `service_role` za „admin poza TCB” i wyłączenie go z workera | fail-closed |
| OD-PRET-03 | Czy G3-TCB obejmuje P6–P8 (render rollback, usuwanie konta, `sfm_expire_versions`), czy tylko retention | tylko retention w tym kontrakcie; P6–P8 nieobjęte gwarancją |
| OD-PRET-04 | Soft-delete vs hard logical DELETE dla `audio_artifacts` | fail-closed |

Rozstrzygnięcia Ownera (2026-10-24, AskQuestion w zadaniu „REQ-CHANGE CLOSEOUT → IMPLEMENTATION”):
- OD-PRET-01 → dedykowana rola NOLOGIN przez JWT (wzorzec `far01_live_mutator`).
- OD-PRET-02 → REVOKE DML `service_role` na tabelach Premium i lease; dla `audio_artifacts` zamiast REVOKE guard w triggerze (§4a P5).
- OD-PRET-04 → soft-delete (`deleted_at` + `status='DELETED'`) przez fencowany RPC.

OD-PRET-03 i OD-PRET-04 są podpytaniami `OD-EXPORT-OPEN-DELETE-SCOPE` (`PREMIUM_EXPORT_AND_DOWNLOAD_CONTRACT.md` §13). Formalnie zamykane są wyłącznie przez tamten rejestr. Rozstrzygnięcie OD-PRET-04 powyżej jest decyzją Ownera dla tego kontraktu; wpis w rejestrze nadrzędnym jest odroczony (§10.6).

| ID | Pytanie | Domyślnie |
|---|---|---|
| OD-PRET-05 | Lokalizacja bajtów audio i lifecycle fizyczny (G4-P) | OPEN |
| OD-PRET-06 | Semantyka epoch po PITR / restore / failover (np. generacja timeline w epoch, blokada po restore do ręcznego uzbrojenia) | fail-closed po restore |
| OD-PRET-07 | Akceptacja definicji własności „porządek serializacji” (§3) | PROPOSED |
| OD-PRET-08 | Polityka reclaim / VACUUM / backupów / retencji kopii | OPEN |

Powiązane w kodzie WIP (nie zarejestrowane w rejestrach docs): OD-62-02, OD-62-03, OD-62-06 (TTL — HOLD), OD-62-08 (GO migracji lease / L2).

## 10. Plan implementacji (bez autoryzacji wdrożenia)

Stan: kroki 1 i 2 wykonane. Krok 3 wykonany częściowo: rola i REVOKE są, ale RPC i triggery nadal sprawdzają `auth.role()`, a nie członkostwo roli; granicę wyznaczają uprawnienia katalogu. Krok 4 wykonany częściowo: fence przed pierwszym efektem i brak `.update`, ale renew tylko między utworami, nie przed każdą partią artefaktów. Krok 5: testy §7 na PostgreSQL wykonane (§12); test live na lokalnym Supabase nieuruchomiony. Krok 6 odroczony.

1. Migracja (nowy plik, bez zastosowania zdalnie): `premium_retention_soft_delete_artifact_if_lease(p_artifact_id, p_work_id, p_run_id, p_fencing_token)`. Kolejność blokad: lease → work → artifact; sprawdzenie holder/token/expiry oraz `WORK_READY` + retention due; `deleted_at IS NULL`; czas z bazy.
2. Poprawka F5: `v_now := clock_timestamp()` po `SELECT … FOR UPDATE` w L2 i acquire. W renew trzeba dodać `SELECT … FOR UPDATE` przed sprawdzeniem albo użyć `clock_timestamp()` bezpośrednio w `WHERE`.
3. Rola workera X + `REVOKE` DML (zależnie od OD-PRET-01/02), `search_path = ''`, sprawdzenie członkostwa roli zamiast samego `auth.role()`.
4. Executor: fence wymagany przed pierwszym efektem (F8); usunięcie bezpośrednich `.update` (P2); renew przed każdą partią artefaktów.
5. Aktualizacja testu live (F9) i testy §7 na lokalnym Supabase.
6. Synchronizacja rejestrów (`OPEN_DECISIONS` z OD-PRET-* i OD-62-*, `DECISION_LOG` z D-TCB…D-LEASE, `CHANGELOG`, `PROJECT_STATE`, `architecture/REUSE_SSOT_MAP.md`) — obecnie dirty, więc **odroczona**, tak jak w `PREMIUM_EXPORT_AND_DOWNLOAD_CONTRACT.md` §14.

## 11. Statusy

| Element | Status |
|---|---|
| Formalizacja G3-TCB / G4-L / D-LEASE / G4-P | DOCUMENTED (ten dokument) |
| P1 fencing EXPIRED | IMPLEMENTED (lokalnie); analiza projektowa (warunkowo, §4) + testy PG §12 |
| Fenced soft-delete artefaktu (P2) | IMPLEMENTED (lokalnie, migracja jako plik); testy PG §12 PASS |
| G3-TCB dla executora retention (rola workera) | IMPLEMENTED; katalog potwierdzony na PG §12 |
| G3-TCB dla `service_role` na `premium_works` / `premium_unlock_events` / lease | IMPLEMENTED; PG PASS |
| G3-TCB dla `service_role` na `audio_artifacts` | częściowo: bezpośredni soft-delete/`DELETED`/cofnięcie/powiązanie od strony artefaktu/lokalizacja/TRUNCATE oraz EXECUTE na mutujących RPC zamknięte (PG PASS); hard DELETE, `EXPIRED`/`FAILED` i powiązanie od strony utworu (`premium_mark_work_ready` z `p_now`) **BLOCKED** (OD-PRET-03, decyzja `p_now`) |
| G3-TCB dla całej aplikacji | NOT PROVEN: jw. oraz klucz service w procesie |
| G4-L dla logicznych usunięć retention | IMPLEMENTED; PG PASS (warstwa bazy, READ COMMITTED); PostgREST NOT VERIFIED |
| D-LEASE po PITR / failover | NOT PROVEN (OD-PRET-06) |
| Testy §7 na prawdziwym Postgresie | PASS dla warstwy bazy (§12); pełny stos Supabase NOT VERIFIED |
| Premium Retention | HOLD |

## 12. Bramka pre-deploy na prawdziwym PostgreSQL (2026-10-24)

### 12.1 Środowisko

- Silnik: **PostgreSQL 17.10** (oficjalne binaria z pakietu npm `embedded-postgres`, wersja zgodna z `supabase/config.toml` `major_version = 17`). Zależności poza repo: `%TEMP%\brd-pg-gate` (`BRD_PG_GATE_DEPS`); `package.json` bez zmian. Bez instalacji globalnej, usługi Windows ani uprawnień admina.
- Klaster jednorazowy: świeży `initdb` w `%TEMP%\brd-pg-gate-data-*` przy każdym przebiegu, `listen_addresses=127.0.0.1`, port 55432, tylko dane syntetyczne. Po przebiegu `pg_ctl stop` i usunięcie katalogu. Test asercjonuje `inet_server_addr()` = 127.0.0.1 i bazę `brd_gate`.
- Shim platformy (`scripts/premium-retention-pg-gate/supabase-platform-shim.sql`): `postgres` jako NOSUPERUSER z CREATEROLE/BYPASSRLS (jak w Supabase), role `anon`/`authenticated`/`service_role`/`authenticator`, domyślne uprawnienia Supabase w `public`, `auth.uid()`/`auth.role()`/`auth.jwt()` z `request.jwt.claim(s)`, minimalne `auth.users`, `storage.buckets`/`storage.objects` z RLS. Shim jest przybliżeniem; definicje Supabase mogą się różnić (§12.4).
- Wszystkie **71** migracje z `supabase/migrations` stosowane jako `postgres`, każda w osobnej transakcji.
- Emulacja PostgREST na granicy bazy: połączenie jako `authenticator`, w transakcji `SET LOCAL ROLE <rola>` + `request.jwt.claims`.

### 12.2 Uruchomienie

```
node --test --test-reporter=spec --test-timeout=240000 scripts/premium-retention-pg-gate/premium-retention-pg-gate.test.mjs
```

Kontrola negatywna (`BRD_PG_GATE_NEGATIVE_CONTROL=1`): po migracjach `negative-control.sql` celowo przywraca UPDATE `service_role` na `premium_works`, nadaje workerowi BYPASSRLS, wyłącza trigger ochronny `audio_artifacts`, cofa poprawkę `COALESCE` w `premium_retention_links` i usuwa `FOR UPDATE` z blokady lease w fencowanym RPC (mutant współbieżności). Przebieg **musi** się nie udać.

### 12.3 Wyniki

| Przebieg | Wynik |
|---|---|
| Normalny | **35/35 PASS** (D1 7, D2 10, D3 8, D4 8, D5 2), ok. 25 s. Z tego **30 testów egzekwujących** zabezpieczenia i **5 zapisujących stan** (RESIDUAL/CONFLICT/G4-P) — te 5 nie są dowodem bezpieczeństwa. |
| Kontrola negatywna | **16/35 FAIL** — atrybuty roli, uprawnienia `service_role` (katalog i DML), RLS workera, guard triggera (soft-delete, wpięcie, lokalizacja, nieodwracalność, wyciek GUC), NULL linkage, polityki Storage oraz 6 testów współbieżności D4 (bez blokady lease). Test „ta sama generacja, ten sam artefakt” przechodzi, bo serializuje go blokada artefaktu. |

Wykrywanie czekania w D4: `pg_blocking_pids(pid)` musi zawierać PID konkretnej sesji trzymającej blokadę.

Defekty znalezione wyłącznie na prawdziwym PG i naprawione w migracji `20261029130200`:
- `ALTER ROLE … NOSUPERUSER NOREPLICATION NOBYPASSRLS` przerywał migrację (`permission denied to alter role`, PG16+ bez superusera) — zastąpione asercją fail-closed;
- trigger nie blokował `status='DELETED'` bez fence, cofnięcia soft-delete, wpięcia obcego artefaktu ani zmiany `object_key`/`storage_bucket`;
- `service_role` miał TRUNCATE na `audio_artifacts` (omija triggery wierszowe) oraz REFERENCES/TRIGGER/MAINTAIN na `premium_works`/`premium_unlock_events`;
- `service_role` miał EXECUTE na mutujących RPC lease/L2/soft-delete (znalezione w końcowym audycie, potwierdzone katalogiem).

Testy zapisane jako RESIDUAL/CONFLICT (przechodzą, bo dokumentują stan, a nie bezpieczeństwo): hard DELETE i `EXPIRED` przez `service_role`; fałszowanie GUC z surowej sesji SQL; zablokowane usuwanie konta z utworem Premium; G4-P (DELETE obiektu bez fence).

### 12.4 Granice dowodu

NOT VERIFIED w tej bramce: PostgREST (cache schematu, mapowanie błędów, ekspozycja `set_config`), GoTrue i weryfikacja podpisu JWT (HS256 vs klucze asymetryczne), Storage API (usuwanie bajtów, akceptacja custom roli), dokładne definicje `auth.*` i `storage.*` w projekcie Supabase, limity `statement_timeout` platformy dla workera, PITR/restore (OD-PRET-06), pętla aplikacji (tylko mock). Harness nie łączy się z żadną zdalną bazą.
