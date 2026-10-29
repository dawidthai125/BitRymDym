# Studio Mastering worker (E3) — runbook

Status: **przygotowane, NIE zainstalowane**. Migracja `20261029180000_studio_master_and_downloads.sql` musi być najpierw zastosowana (ręcznie, przez właściciela).

## Co robi
Kolejka `studio_master_jobs` (claim/complete RPC, service_role, SKIP LOCKED, max 3 próby).
Rodzaje: `master` (pedalboard EQ + 3-pasmowa kompresja + limiter, pyloudnorm LUFS, TP trim 4×),
`raw_sum` / `transcode` (tylko ffmpeg), `project_zip` (zip ścieżek). Wejścia wgrywa przeglądarka do
`audio-artifacts/studio-master/{owner}/{project}/{job}/in/…`, wynik: `…/out/{kind}.{ext}`.

## Licencje
- pedalboard — **GPL-3**: używany wyłącznie jako osobny proces (`scripts/master/master.py`), bez linkowania z aplikacją; kod skryptu jest w repo.
- pyloudnorm — MIT; numpy/scipy — BSD; soundfile — BSD (libsndfile LGPL).
- ffmpeg z libmp3lame (LGPL/GPL zależnie od buildu Debiana) — osobny binarny proces.
- matchering (GPL-3) — tylko interfejs `--reference` (exit 3 `reference_not_available`), backlog.

## Instalacja (na E3, ręcznie)
```bash
sudo apt-get install -y ffmpeg libsndfile1 python3-venv
ffmpeg -hide_banner -encoders | grep libmp3lame   # musi być
sudo -u bitrymdym-e3 python3 -m venv /var/lib/bitrymdym-e3-worker/master-venv
sudo -u bitrymdym-e3 /var/lib/bitrymdym-e3-worker/master-venv/bin/pip install -r /opt/bitrymdym-e3-worker/scripts/master/requirements.txt
# test syntetyczny (LUFS ±0.5, TP ≤ cel):
sudo -u bitrymdym-e3 /var/lib/bitrymdym-e3-worker/master-venv/bin/pip install pytest
cd /opt/bitrymdym-e3-worker && sudo -u bitrymdym-e3 /var/lib/bitrymdym-e3-worker/master-venv/bin/python -m pytest -q scripts/master
```

`/etc/bitrymdym-e3-worker/master.env` (bez sekretów — klucze Supabase są już w `worker.env`):
```
STUDIO_MASTER_ENABLED=false
STUDIO_MASTER_PYTHON=/var/lib/bitrymdym-e3-worker/master-venv/bin/python
STUDIO_MASTER_SCRIPT=scripts/master/master.py
STUDIO_MASTER_POLL_MS=4000
STUDIO_MASTER_TIMEOUT_MS=600000
```

```bash
sudo cp deploy/systemd/bitrymdym-master-worker-poll.service /etc/systemd/system/
sudo systemctl daemon-reload
# włączenie: STUDIO_MASTER_ENABLED=true w master.env, potem
sudo systemctl enable --now bitrymdym-master-worker-poll
journalctl -u bitrymdym-master-worker-poll -f   # studio_master_started / studio_master_done
```
Nie restartuje istniejących workerów; nie otwiera portów (tylko wychodzące do Supabase).

## Wyłączenie
`STUDIO_MASTER_ENABLED=false` + `systemctl restart bitrymdym-master-worker-poll` (proces kończy się bez claimu).
Zadania w `running` po awarii: `update studio_master_jobs set status='queued' where status='running' and started_at < now()-interval '30 min';`
