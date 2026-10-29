# Bezpieczeństwo praw przy publikacji bitów

Lokalna implementacja P0. To nie jest produkcyjny GREEN i nie jest dowodem praw do nagrania.

## Co egzekwuje baza

Migracje `20261029034653_beat_rights_safety_p0.sql`, `20261029034706_beat_rights_safety_p0_fix.sql`, `20261029034711_beat_rights_safety_p0_remediation.sql` oraz `20261029034718_beat_rights_safety_p0_master_mutation_guard.sql` dodają:

- `beat_rights_basis` — oświadczenie użytkownika, licencja platformy i osobne zdarzenie unieważnienia wskazujące `revokes_basis_id`;
- `beat_blocked_audio_hashes` — wiele zdarzeń `block` i `lift` dla jednego hasha, z osobnym `id` i monotonicznym `event_seq`;
- `beat_rights_reviews` — sprawy, które wolno tylko zamknąć;
- `beat_moderation_decisions` — dopisywana historia;
- `beat_rights_hash_locks` — blokada wiersza po pełnym SHA-256, wspólna dla publikacji i rejestru.

`UPDATE` i `DELETE` podstaw, zdarzeń hasha i decyzji są odrzucane triggerem, także dla `service_role`. Review można zmienić tylko z otwartego na zamknięte, po wcześniejszym wpisie decyzji i tylko przez staff, który nie jest właścicielem bitu USER. Zamknięcie nie zmienia statusu bitu. Wyniki `still_blocked` i `needs_new_master` nadal blokują publikację tego samego beatu i hasha. `dismissed_no_publish` nie blokuje. Nowy hash Mastera jest oceniany osobno. Właściciel USER może otworzyć otwartą sprawę dla własnego beatu; zamknięcie i wynik zostają tylko dla staff.

### Ochrona publikacji

`assert_beat_publish_rights` uruchamia się przy `INSERT` ze statusem `PUBLISHED` i przy każdym `UPDATE` do `PUBLISHED`. `INSERT` nie ma poprzedniego statusu i jest odrzucany. `service_role` nie publikuje przez sam identyfikator staffu: aktorem musi być zalogowany staff.

### Ochrona finalizacji

Finalizacja Mastera (`finalize_beat_master_asset`) dla bitu `PUBLISHED` ponownie sprawdza bramkę dla nowego hasha w tej samej transakcji; bez ważnej podstawy poprzedni Master pozostaje aktywny.

### Ochrona bezpośredniej mutacji assetów

Sam gate w `finalize_beat_master_asset` nie wystarcza: `prevent_beat_audio_privilege_escalation` nadal pozwala `service_role` i adminowi mutować `beat_audio_assets` (w tym `checksum_sha256`, `is_active`, `purpose`, `status`, `beat_id`). Migracja `20261029034718_beat_rights_safety_p0_master_mutation_guard.sql` dodaje odroczony CONSTRAINT TRIGGER `beat_audio_assets_published_master_rights`. Przy commitcie transakcji, która zmienia aktywny READY MASTER opublikowanego beatu (lub pozostawia inną liczbę aktywnych Masterów niż jeden), baza wymaga dokładnie jednego aktywnego READY MASTER i ponownie wywołuje `assert_beat_checksum_rights`. Dzięki odroczeniu finalizacja (dezaktywacja + aktywacja w jednej transakcji) nadal działa, a bezpośredni uprzywilejowany UPDATE nie może zatwierdzić nielegalnego Mastera. Mutacje, które nie zmieniają aktywnego Mastera (np. wstawienie pending), nie otwierają ponownie bramki dla istniejącego hasha — zgodnie z regułą, że blokada po publikacji nie zdejmuje bitu z katalogu.

### Ograniczenia `service_role`

`service_role` nie omija gate'u publikacji ani odroczonej ochrony Mastera. Nie ma GUC sesji, którą klient może sam ustawić, by podrobić zaufany kontekst finalizacji. EXECUTE na funkcji egzekwującej jest odebrane rolom aplikacyjnym; trigger wywołuje ją jako DEFINER.

### Kolejność blokad

Kolejność blokad publikacji, spraw, finalizacji i odroczonej ochrony Mastera: wiersz bitu, wiersz hasha, potem asset. Zdarzenie `block` lub `lift` bierze tylko wiersz hasha i dostaje `event_seq` dopiero po tej blokadzie. Większy numer jest późniejszym zatwierdzonym zdarzeniem.

## Czego to nie robi

Brak sygnału z rozpoznawania nie oznacza legalności. Hash nie wykrywa przekodowanego audio. Publikacja zatwierdzona zanim powstanie blokada pozostaje publiczna do osobnego takedownu. Superuser PostgreSQL oraz `session_replication_role` mogą wyłączyć triggery — to ograniczenie administracji infrastruktury, nie roli aplikacyjnej. Istniejące publiczne bity nie zostały oznaczone jako zweryfikowane. Konto USER z `owner_id` NULL nie składa oświadczenia i nie wraca do katalogu tą ścieżką.

## Kolejność wdrożenia

Migracja i aplikacja są fail-closed: nowa publikacja bez podstawy nie przejdzie. Nie ma okna, w którym publikacja omija gate. Produkcja wymaga osobnej decyzji. Nie stosować tej migracji na produkcji z tego etapu.
