# BITEK — model czatu na E3 (runbook)

**Status:** kolejka w bazie (bez tunelu). Instalacja na E3 — zgoda Ownera 2026-10-29.

## Gdzie E3 jest w łańcuchu

`/api/studio/bitek/chat` (Vercel, Node) → Groq → Gemini Flash → **E3** → reguły (BITEK v1).
E3 jest trzecim stopniem — używany tylko, gdy oba darmowe API odmówią (429/5xx/timeout).

## Połączenie Vercel ↔ E3: kolejka w bazie (decyzja Ownera 2026-10-29)

E3 nie ma publicznego endpointu i **żaden port nie jest otwierany**. Ruch tylko wychodzący z E3 do Supabase.

1. Route (service_role) wstawia wiersz do `bitek_llm_jobs` (`messages` = prompt + tury, bez user id/e-maila; `expires_at` = teraz + 20 s) i polluje co 300 ms do 20 s; po czasie oznacza `expired` i łańcuch spada na reguły.
2. `bitrymdym-bitek-llm-worker` na E3 (`npm run bitek:llm:worker`) woła RPC `claim_next_bitek_llm_job` (FOR UPDATE SKIP LOCKED), POST do `http://127.0.0.1:8091/v1/chat/completions` z Bearer z `api-key`, potem `complete_bitek_llm_job`.
3. Co 10 min `purge_bitek_llm_jobs(60)` usuwa wiersze starsze niż 1 h (i `bitek_chat_usage` starsze niż 30 dni).
4. Tabela i RPC: RLS bez polityk, uprawnienia tylko `service_role`.

Vercel env: `BITEK_E3_QUEUE_ENABLED=true` (nie jest sekretem; wyłącza/włącza stopień E3). Wymaga `SUPABASE_SERVICE_ROLE_KEY` (już jest).
Logi workera: tylko `outcome`, `ms`, `tokens` — bez treści.

## Dobór modelu (4 vCPU / 7.8 GB RAM obok Demucsa)

Liczby to szacunki (llama.cpp, Q4_K_M, 2 wątki). Do zmierzenia na E3 po zgodzie — patrz „Pomiar”.

| Model (Apache-2.0) | Plik | RAM (ctx 4k) | Prefill ~1k tok prompt | Generacja | Uwagi |
|---|---|---|---|---|---|
| **Qwen2.5-1.5B-Instruct Q4_K_M** (rekomendacja) | ~1.1 GB | ~1.4–1.8 GB | ~8–15 s | ~10–18 tok/s | mieści się obok Demucsa (htdemucs CPU 3–5 GB) |
| Qwen2.5-3B-Instruct Q4_K_M | ~1.9 GB | ~2.4–3 GB | ~20–35 s | ~5–9 tok/s | lepszy PL, ale przy Demucsie ryzyko OOM/swapu i timeoutu 20 s |

Ograniczenia w unicie: `--threads 2`, `Nice=10`, `CPUWeight=20`, `MemoryMax=2.5G`, `--parallel 1`. Render/Demucs ma pierwszeństwo.

## Instalacja

1. `useradd --system --no-create-home --shell /usr/sbin/nologin bitrymdym-llm`
2. Zbuduj llama.cpp (tag release, `cmake -B build -DGGML_NATIVE=ON -DLLAMA_CURL=OFF && cmake --build build -j2 --target llama-server llama-bench`), skopiuj `llama-server` (+ biblioteki `lib*.so`) do `/opt/bitrymdym-bitek-llm/bin/`.
3. GGUF z `Qwen/Qwen2.5-1.5B-Instruct-GGUF` → `qwen2.5-1.5b-instruct-q4_k_m.gguf` w `/opt/bitrymdym-bitek-llm/models/`, sprawdź sha256 z HF.
4. `openssl rand -hex 32 > /etc/bitrymdym-bitek-llm/api-key`; `chown root:bitrymdym-llm`, `chmod 0640`.
5. `/etc/bitrymdym-e3-worker/bitek-llm.env` (`root:bitrymdym-e3`, `0640`): `BITEK_LLM_WORKER_ENABLED=true`, `BITEK_LLM_TOKEN=<api-key>`.
6. Units: `bitrymdym-bitek-llm.service` i `bitrymdym-bitek-llm-worker.service` → `/etc/systemd/system/`, `daemon-reload`, `enable --now` (tylko te dwa — **nie restartuj** istniejących pollerów).
7. Kod workera: zaktualizuj checkout `/opt/bitrymdym-e3-worker` (pliki workera BITEK + `package.json`) z backupem, jak przy upload filtrze.
8. Test lokalny: `curl -s -H "Authorization: Bearer $(cat /etc/bitrymdym-bitek-llm/api-key)" http://127.0.0.1:8091/v1/models`
9. Vercel: `BITEK_E3_QUEUE_ENABLED=true` (Production), redeploy.

## Pomiar (po instalacji)

`llama-bench -m <gguf> -t 2 -p 1024 -n 128` przy bezczynnym i przy pracującym Demucsie. Zanotuj pp/tg tok/s i RSS (`systemctl status`). Jeśli prefill > 20 s — zostań przy 1.5B albo skróć prompt.

## Wycofanie

`BITEK_E3_QUEUE_ENABLED=false` w Vercel (łańcuch pomija E3), potem `systemctl disable --now bitrymdym-bitek-llm-worker bitrymdym-bitek-llm`.
