# Runbook: worker filtra uploadu (E3 Contabo)

Repo nie zmienia hosta. Kroki wykonuje właściciel po osobnym GO.

## 0. Sprawdź zasoby hosta
```
nproc; free -h; df -h /opt /tmp
```
Wymagane wolne: ~3–4 GB RAM (Demucs htdemucs na CPU + STUDIO poller), ~5 GB dysku (venv + torch CPU ~2 GB, wagi ~80 MB, pliki tymczasowe). Czas: ok. 1–1,5× długości utworu na 4 vCPU (4–10 min/bit).

## 1. Pakiety
```
sudo apt-get install -y ffmpeg libchromaprint-tools python3-venv
fpcalc -version
```

## 2. Demucs (CPU)
```
sudo -u bitrymdym-e3 python3 -m venv /opt/bitrymdym-e3-worker/.venv-demucs
sudo -u bitrymdym-e3 /opt/bitrymdym-e3-worker/.venv-demucs/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch torchaudio
sudo -u bitrymdym-e3 /opt/bitrymdym-e3-worker/.venv-demucs/bin/pip install demucs numpy
# pobranie wag htdemucs (~80 MB) do cache użytkownika:
sudo -u bitrymdym-e3 /opt/bitrymdym-e3-worker/.venv-demucs/bin/python -c "from demucs.pretrained import get_model; get_model('htdemucs')"
```

## 3. Migracja
`supabase/migrations/20261029130000_beat_auto_checks.sql` — wgrać standardową ścieżką po review (repo nie wgrywa na prod).

## 4. Env `/etc/bitrymdym-e3-worker/autocheck.env` (root:bitrymdym-e3 0640)
```
BEAT_AUTO_CHECK_ENABLED=true
BEAT_AUTO_CHECK_WORKER_REF=contabo-e3-autocheck-1
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
BEAT_AUTO_CHECK_PYTHON=/opt/bitrymdym-e3-worker/.venv-demucs/bin/python
BEAT_AUTO_CHECK_VOCAL_SCRIPT=/opt/bitrymdym-e3-worker/scripts/auto-check/vocal_ratio.py
ACOUSTID_CLIENT_KEY=   # opcjonalnie; pusty = tylko własny katalog
```

## 5. Unit
```
sudo cp deploy/systemd/bitrymdym-autocheck-worker-poll.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start bitrymdym-autocheck-worker-poll   # najpierw ręcznie, obserwuj journalctl
```
Kill switch: `BEAT_AUTO_CHECK_ENABLED=false` + restart → exit 0 bez claimu.

## 6. Smoke
Wyślij testowy bit instrumentalny i z wokalem; sprawdź `beat_auto_checks.status` i kartę w `/admin/moderation/<id>`.
