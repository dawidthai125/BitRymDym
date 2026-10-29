# BITEK — model czatu na E3 (runbook)

**Status:** przygotowane w repo, **NIC NIE ZAINSTALOWANE na E3**. Instalacja wymaga zgody Ownera.

## Gdzie E3 jest w łańcuchu

`/api/studio/bitek/chat` (Vercel, Node) → Groq → Gemini Flash → **E3** → reguły (BITEK v1).
E3 jest trzecim stopniem — używany tylko, gdy oba darmowe API odmówią (429/5xx/timeout).

## Jak dziś Vercel rozmawia z E3

Nijak bezpośrednio: worker E3 (`bitrymdym-e3-worker-poll`) **sam pobiera zadania z bazy** (claim-next w Supabase).
E3 nie ma publicznego endpointu i tak ma zostać.

## Rekomendowane połączenie: Cloudflare Tunnel (wychodzące) + token

- `llama-server` słucha **tylko na 127.0.0.1:8091** (unit `deploy/systemd/bitrymdym-bitek-llm.service`).
- `cloudflared` na E3 zestawia **wychodzący** tunel do Cloudflare. **Żaden port przychodzący na E3 nie jest otwierany**; TLS kończy Cloudflare.
- Hostname, np. `bitek-e3.<domena>` → `http://127.0.0.1:8091`.
- Autoryzacja:
  - (1) `--api-key-file` w llama-server (Bearer = `BITEK_E3_TOKEN` w Vercel);
  - opcjonalnie (2) Cloudflare Access service token (nagłówki `CF-Access-Client-Id/Secret`). To wymaga małej zmiany w providerze — dopisać, jeśli Owner wybierze Access.
- Vercel env: `BITEK_E3_URL=https://bitek-e3.<domena>/v1`, `BITEK_E3_TOKEN=<token>`.

Przykładowy `/etc/cloudflared/config.yml` (poza repo):

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /etc/cloudflared/<TUNNEL_UUID>.json
ingress:
  - hostname: bitek-e3.<domena>
    service: http://127.0.0.1:8091
  - service: http_status:404
```

### Alternatywy

| Opcja | Plusy | Minusy |
|---|---|---|
| **Kolejka w bazie** (jak worker): tabela `bitek_chat_jobs`, E3 polluje lub używa Realtime | zero nowych ingressów, spójne z obecną architekturą | +1–3 s opóźnienia, więcej kodu (migracja, poller, sprzątanie), ruch w bazie |
| Reverse proxy (Caddy/nginx) z TLS + token | prosty | **wymaga otwarcia portu 443 na E3** — odradzane |
| Tailscale Funnel | prosty | kolejny dostawca/konto |

## Dobór modelu (4 vCPU / 7.8 GB RAM obok Demucsa)

Liczby to szacunki (llama.cpp, Q4_K_M, 2 wątki). Do zmierzenia na E3 po zgodzie — patrz „Pomiar”.

| Model (Apache-2.0) | Plik | RAM (ctx 4k) | Prefill ~1k tok prompt | Generacja | Uwagi |
|---|---|---|---|---|---|
| **Qwen2.5-1.5B-Instruct Q4_K_M** (rekomendacja) | ~1.1 GB | ~1.4–1.8 GB | ~8–15 s | ~10–18 tok/s | mieści się obok Demucsa (htdemucs CPU 3–5 GB) |
| Qwen2.5-3B-Instruct Q4_K_M | ~1.9 GB | ~2.4–3 GB | ~20–35 s | ~5–9 tok/s | lepszy PL, ale przy Demucsie ryzyko OOM/swapu i timeoutu 25 s |

Ograniczenia w unicie: `--threads 2`, `Nice=10`, `CPUWeight=20`, `MemoryMax=2.5G`, `--parallel 1`. Render/Demucs ma pierwszeństwo.

## Instalacja (po GO Ownera)

1. `useradd --system --no-create-home bitrymdym-llm`
2. Zbuduj llama.cpp (tag release, `cmake -B build && cmake --build build -j2 --target llama-server`) i skopiuj binarkę do `/opt/bitrymdym-bitek-llm/bin/`.
3. Pobierz GGUF `Qwen/Qwen2.5-1.5B-Instruct-GGUF` → `qwen2.5-1.5b-instruct-q4_k_m.gguf` do `/opt/bitrymdym-bitek-llm/models/` i sprawdź sha256.
4. `openssl rand -hex 32 > /etc/bitrymdym-bitek-llm/api-key`; `chown root:bitrymdym-llm`, `chmod 0640`.
5. `cp deploy/systemd/bitrymdym-bitek-llm.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now bitrymdym-bitek-llm`
6. Test lokalny: `curl -s -H "Authorization: Bearer $(cat /etc/bitrymdym-bitek-llm/api-key)" http://127.0.0.1:8091/v1/models`
7. Tunel: `cloudflared tunnel create bitek-e3`, DNS route, config jak wyżej, `systemctl enable --now cloudflared`.
8. Vercel: ustaw `BITEK_E3_URL`, `BITEK_E3_TOKEN` (Production), redeploy.

## Pomiar (po instalacji)

`llama-bench -m <gguf> -t 2 -p 1024 -n 128` przy bezczynnym i przy pracującym Demucsie. Zanotuj pp/tg tok/s i RSS (`systemctl status`). Jeśli prefill > 20 s — zostań przy 1.5B albo skróć prompt.

## Wycofanie

`systemctl disable --now bitrymdym-bitek-llm cloudflared`, usuń `BITEK_E3_*` z Vercel — łańcuch automatycznie pomija E3.
