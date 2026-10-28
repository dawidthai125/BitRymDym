# Catalog copy — controlled prod USER E2E (2026-10-28)

| Pole | Wartość |
|------|---------|
| Charakter | **Owner GO** — sesja Dawida w Cursor Browser jako test USER + cleanup |
| Data | 2026-10-28 |
| Living Git | `5b2fcebf79e559f7336d26d3018bddcb6180ed29` = `origin/main` (`ls-remote`) |
| GitHub Production | **`7379526025`** **success** `2026-10-28T07:21:22Z` @ `5b2fceb` · unique `bitrymdym-3lsi0b9do-…` |
| Project | `rzzxrgcdogkybkiidqgw` |
| **`dpl_*` / alias** | **NOT VERIFIED** |
| Produkt | **≠ Product GREEN** · **≠ PRODUCTION VERIFIED** |

**Legenda:** FACT / INFERENCE / NOT VERIFIED / BLOCKED.

---

## Zakres

Owner: „Zalogowałem się w przeglądarce Cursor jako Dawid możesz robić test user” = GO na `POST /api/catalog/copy` + cleanup.

**Robiono:** mały fixture WAV · upload `beat-audio` `catalog/{uuid}/original.bin` · wiersz `catalog_assets` PUBLISHED + `license_allows_copy` · fetch z cookies sesji Dawida · weryfikacja TAKE · cleanup Storage + DB + XP probe.

**Nie robiono:** odtwarzanie masterów / Simple Browser Play · Contabo / SFM · Sacred / Studio chronione · `db push` / repair · ponowne logowanie hasłem.

---

## FACT — pre

| Check | Wynik |
|-------|--------|
| Tip | `5b2fceb` lokalnie = `origin/main` |
| `catalog_assets` | **0** |
| `catalog/` Storage | **0** |
| Sesja przeglądarki | `https://www.bitrymdym.pl/account` · **Menu konta: Dawid** · **Dawid (ID: 1)** · Gold · **0 gotowych** nagrań |
| Live takes Dawida | **0** (cap OK) |
| Projekt Studio (istniejący, nie tworzony) | `178e902d-6ecf-4ef6-910c-d85612bb277c` · `beat_id` `a05b6370-eb60-4dc6-a2b2-f29ea965048c` |

---

## FACT — fixture + copy

| Krok | Wynik |
|------|--------|
| Fixture | cisza PCM 8 kHz / 1 s · **16044** B · `audio/wav` · `RIFF`/`WAVE` |
| Host-guard | `BRD_ALLOW_PROD_STORAGE=1` · `BRD_PROD_STORAGE_SCRIPT=catalog_copy_user_e2e` |
| Upload | `catalog/d9b4f821-4c0a-4587-a95a-a4ae59910a88/original.bin` · list size 16044 |
| `catalog_assets` | PUBLISHED · `license_allows_copy=true` · `byte_size=16044` · `duration_seconds=1` |
| `POST /api/catalog/copy` | **HTTP 200** · `ok:true` · `reusedExisting:false` · `status:READY` |
| take id | `0b46506e-bf35-4e3b-a069-fa18d9f01b58` |
| object_key | `user/fdf04726-e971-42a7-9d46-8b9bdd099c23/takes/0b46506e-bf35-4e3b-a069-fa18d9f01b58/mic.bin` |
| DB take | owner Dawid · `QUICK` · title `catalog:{asset}:{project}` · `byte_size=16044` · `duration_seconds=1` · `deleted_at` null |

Mechanizm copy: `fetch` w karcie `/account` (`credentials: same-origin`). Cookies/JWT **nie** logowane.

---

## FACT — cleanup

| Krok | Wynik |
|------|--------|
| Storage catalog | remove **1** → leftover **0** |
| Storage take-audio | remove **1** → leftover **0** |
| `catalog_assets` probe | DELETE **1** → **0** |
| `takes` probe | DELETE service_role **1** (MCP postgres zablokowany triggerem `prevent_take_privilege_escalation`) → **0** |
| XP `TAKE_READY` probe | DELETE **1** (`amount=10`) → **0** |
| Post leftover SELECT | catalog_assets **0** · catalog Storage **0** · probe take **0** · probe take Storage **0** · probe XP **0** |

Istniejące projekty Studio Dawida **nietknięte**.

---

## Audyt docs ↔ runtime (wycinek)

| Twierdzenie | Dowód | Klasa |
|-------------|-------|--------|
| `POST /api/catalog/copy` → prywatny TAKE READY | HTTP 200 + wiersz take owner Dawid + klucz `user/{owner}/takes/{take}/mic.bin` | **ZGODNE** |
| Planner wymaga PUBLISHED + license | insert z tymi polami; copy nie fail-closed | **ZGODNE** (ścieżka happy) |
| Sniff WAV 1 s przechodzi finalize | `duration_seconds=1` READY | **ZGODNE** |
| Prod copy wcześniej BLOCKED | SESSION_BRIDGE `USER-COPY` BLOCKED | **SUPERSEDED** tym GO |
| Product GREEN | brak | **NIE TWIERDZONE** |

---

## Security (zakres E2E)

- Granica: zalogowany USER (sesja przeglądarki) wywołuje publiczne API; fixture wgrywa service_role tylko na `catalog/{uuid}/original.bin`.
- Client `beatId` / MIME ignorowane — SSOT = `catalog_assets` + `project.beat_id` + bajty serwera.
- TAKE prywatny pod ownerem sesji. Brak logów cookies / JWT / `service_role`.
- **INFERENCE:** `service_role` Storage/DB cleanup omija RLS (to nie jest dowód predykatu polityki).

---

## NOT VERIFIED / OUT

| Item | Status |
|------|--------|
| Scratch place / jog / export bake | **OUT** |
| Alias www ↔ `dpl_*` @ `5b2fceb` | **NOT VERIFIED** |
| UI przycisk „kopiuj z katalogu” | **NOT RUN** (API fetch) |
| Słyszalny odsłuch TAKE | **NOT RUN** (zakaz egress) |

---

## NEXT

**Jeden:** Scratch catalog→clip place **albo** słyszalny STUDIO_EXPORT **albo** LF-normalize dirty editor history wiring — osobne GO.
**STOP** SFM flag / Contabo mutate / OD-15 zostaje.
