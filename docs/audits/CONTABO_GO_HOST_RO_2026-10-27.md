# Contabo GO-HOST-RO — 2026-10-27

| Pole | Wartość |
|------|---------|
| Charakter | **Read-only host probe** · **bez** enable / start / stop / sync / canary |
| Data | 2026-10-27 |
| Kontrakt | [CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md](../decisions/CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md) · PROJECT_STATE §2c |
| Host | `vmi3622761` · `ubuntu@161.97.72.197` · path `/opt/bitrymdym-e3-worker` |
| Klucz użyty (path only) | `C:\Users\dawid\.ssh\bitrymdym-contabo-recovery-ed25519` |
| Pub fingerprint (name only) | `SHA256:gTD4UkPftDiDhP5cUjnXsxJCnGxmjb/t8ZNMkxVlsdc` · comment `bitrymdym-contabo-recovery` · ED25519 |

**Werdykt: PASS (RO)** — live SSH **DONE**. Gate 2 „MISSING key” był **błędny** (zła tożsamość + `BatchMode` na kluczu z passphrase). Always-on / sync / canary **nie** ruszane.

---

## Korekta Gate 2 (ta sama doba)

| Check | Wynik |
|-------|--------|
| Dokumentowane `~/.ssh/bitrymdym-e3-contabo` | **ABSENT** na tym koncie Windows — **zamierzone** (CONTABO-RESCUE-15, transkrypt `0e64fd9c` 2026-10-23: „Do not recreate”) |
| Gate 2 `Test-Path` tego pliku = MISSING | **FACT** · **nie** znaczy „brak klucza do hosta” |
| Gate 2 `BatchMode` + recovery key → exit 255 `Permission denied (publickey)` | **FACT** · przyczyna: klucz **wymaga passphrase** (`ssh-keygen -y -P ""` exit 1) · `ssh-add` agent **niedostępny** |
| Właściwa ścieżka (wcześniej użyta w Cursorze) | `C:\Users\dawid\.ssh\bitrymdym-contabo-recovery-ed25519` — **EXISTS** · `~/.ssh/config` **brak** |

---

## FACT — live RO (ta sesja, po passphrase w oknie konsoli)

| Check | Wynik |
|-------|--------|
| SSH interactive (nie BatchMode) · IdentitiesOnly · publickey | **PASS** exit **0** · `whoami=ubuntu` |
| `hostname` | `vmi3622761` |
| `uptime` | `4 days, 3:51` (odczyt `2026-10-27T22:38:47Z`) |
| `bitrymdym-e3-worker.service` | `is-enabled=disabled` · `is-active=inactive` · `ActiveState=inactive` · `SubState=dead` · `MainPID=0` · `UnitFileState=disabled` |
| `bitrymdym-e3-worker-poll.service` | `is-enabled=enabled` · `is-active=active` · `ActiveState=active` · `SubState=running` · `MainPID=847` · `UnitFileState=enabled` · `User=bitrymdym-e3` · `WorkingDirectory=/opt/bitrymdym-e3-worker` · `ExecStart=/usr/bin/npm run e3:worker:poll` · start_time **Fri 2026-10-23 20:47:04 CEST** · `Result=success` |
| `/opt/bitrymdym-e3-worker` | istnieje · `drwxr-x--- root:bitrymdym-e3` · mtime **Oct 13** · `ls` jako `ubuntu` = Permission denied |
| Git w katalogu workera | **`HAS_GIT=no`** (`sudo -n test -d …/.git`) · `rev-parse` / `status` **NOT AVAILABLE** |
| `/etc/bitrymdym-e3-worker` | istnieje · `drwx------ root:root` · `ubuntu` ls denied |
| `sudo -n true` | **yes** |
| Env **names only** (`sudo -n grep` + `sed` redact) | `BITRYMDYM_PRODUCTION_BASE_URL` · `E3_RENDER_WORKER_SECRET` · `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `E3_RENDER_JOBS_ENABLED` · `E3_MIX_ENABLED` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Always-on / persist enable / start / stop / sync | **nie** próbowane |

Wartości `worker.env` **nie** dumpowane.

---

## INFERENCE

- Drzewo workera **nie** jest checkoutem gita w last-known path (brak `.git` nawet przez sudo). SHA hosta z `git rev-parse` = **nie do odczytania tą ścieżką**.
- `bitrymdym-e3-worker-poll` działa od **2026-10-23 20:47 CEST** (dzień rescue) — **nie** uruchomione w tej sesji. To **nie** jest Owner GO „enable always-on” z tej sesji; to jest **żywy stan** unitu poll.
- Persistent oneshot `bitrymdym-e3-worker.service` pozostaje **disabled/inactive** — zgodne z last-known freeze dla tego unitu.

---

## NOT VERIFIED

- SHA drzewa workera (brak `.git`; markerów I.45CF **nie** czytano)
- Wartość flag `E3_RENDER_JOBS_ENABLED` / `E3_MIX_ENABLED` (tylko nazwy)
- Czy poll faktycznie claimuje joby
- Alias / `dpl_*` / Product GREEN

---

## Zakazy (dotrzymane)

Nie enable always-on · nie sync mutate · nie canary · nie dump `worker.env` / kluczy · nie recreate `bitrymdym-e3-contabo`.

---

## Journal RO (2026-10-27T23:49+01:00) — poll LEFT RUNNING

Owner decyzja: **zostaw RUNNING** + journal RO. **Nie** `systemctl stop/start/enable/disable`. **Nie** always-on oneshot. **Nie** sync mutate.

| Check | Wynik |
|-------|--------|
| SSH interactive (nie BatchMode) · IdentitiesOnly · recovery key | **PASS** · RO only |
| `systemctl status bitrymdym-e3-worker-poll.service` | **enabled** · **active (running)** · **Main PID 847** (`npm run e3:worker:poll`) since **Fri 2026-10-23 20:47:04 CEST** (~4 days) |
| `systemctl show` | `ActiveState=active` · `SubState=running` · `UnitFileState=enabled` · `User=bitrymdym-e3` · `WorkingDirectory=/opt/bitrymdym-e3-worker` · `Result=success` · `stop_time=n/a` |
| Memory / CPU (status) | 161.1M (peak 212.0M · avail 5.8G) · CPU 28min 58.4s across ~4 days |
| Child (status) | PID 917 = `tsx … scripts/e3-render-worker-poll.ts` |
| `journalctl -u … -n 80` | **80/80** linii `claims_empty` · `workerRef=contabo-poll-1` · `busy=false` · interwał ~2 s · okno **23:45:42–23:48:24 CEST** na hoście (linie `vmi3622761`) |
| Sekrety / URL z tokenem w 80 liniach | **brak** (skan `https?://` · token · secret · Bearer · apikey · service_role · supabase · JWT) |
| Mutacja unitu | **nie** — poll **zostawiony RUNNING** |

**Artefakt lokalny (odrzucony):** `echo HOST=$(hostname)` / `WHO=$(whoami)` w skrypcie PowerShell rozwinęło się **lokalnie** przed SSH. Te dwie wartości **nie** są hostname/user hosta. Hostname hosta z journala systemd: **`vmi3622761`**.

### INFERENCE (journal)

- Pętla pollera jest żywa i idle: puste claimy, bez linii błędu w 80 rekordach.
- To **nie** dowodzi, że kolejka produkcyjna jest pusta vs że claim zwraca empty — tylko że worker loguje `claims_empty` i `busy=false`.

### Nadal NOT VERIFIED

- SHA drzewa workera (`HAS_GIT=no` last-known)
- Czy `claims_empty` = brak jobów vs błąd RPC
- Alias / `dpl_*` / Product GREEN

