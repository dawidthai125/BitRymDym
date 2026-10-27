# Catalog originals — controlled live Storage probe (2026-10-28)

| Pole | Wartość |
|------|---------|
| Charakter | **Owner GO** controlled live probe — upload / list / small GET / delete na prod Storage |
| Data | 2026-10-28 |
| Project | `rzzxrgcdogkybkiidqgw` |
| Bucket | `beat-audio` |
| Klucz | `catalog/8c288da2-9017-415e-b715-64e65d4a35e9/original.bin` |
| Living SSOT | [PROJECT_STATE.md](../PROJECT_STATE.md) §2 — Sample Catalog schema **APPLIED** · live probe **PASS** · Implementation **≠** Scratch DJ · **≠ Product GREEN** |
| Poprzedni apply | [CATALOG_ORIGINALS_PROD_APPLY_2026-10-27.md](./CATALOG_ORIGINALS_PROD_APPLY_2026-10-27.md) · history **`20261027225553`** |

**Legenda:** FACT / INFERENCE / NOT VERIFIED / BLOCKED.
**Produkt:** **≠ Product GREEN** · **≠ PRODUCTION VERIFIED** · **≠ Scratch DJ v1**.

---

## Zakres

Owner GO: „GO” = controlled live probe Storage catalog po apply `20261027225553`. Tip last-known **`6f3a728`** zweryfikowany (`git rev-parse` = `git ls-remote origin HEAD`).

**Robiono:** świeży UUID · lokalny WAV (16 044 B, 1 s, `audio/wav`) · upload service_role · list · download tego samego obiektu · anon deny · delete · SQL leftover **0**.

**Nie robiono:** `POST /api/catalog/copy` (brak bezpiecznego test USER / ryzyko orphan TAKE) · insert `catalog_assets` · content sniff · playback masterów · Simple Browser prod · Contabo mutate · `db push` / repair · orphan cleanup `--execute` · Sacred / Studio.

---

## FACT — pre-probe (MCP `execute_sql`)

| Check | Wynik |
|-------|--------|
| Żywy Git tip | `6f3a728f84261d17011e139a0abb792ed1227714` = `origin/main` |
| `catalog/` objects | **0** |
| `catalog_assets` rows | **0** |
| Storage policies `catalog_originals_service_*` | **4** |

---

## FACT — probe

Mechanizm: jednorazowy skrypt Node + `@supabase/supabase-js` + host-guard (`BRD_ALLOW_PROD_STORAGE=1` · `BRD_PROD_STORAGE_SCRIPT=catalog_originals_live_probe`). Fixture wygenerowany lokalnie (cisza PCM 8 kHz / 1 s). **Nie** commituj skryptu. Klucz `service_role` **nie** logowany.

| Krok | Wynik |
|------|--------|
| Host | `rzzxrgcdogkybkiidqgw.supabase.co` |
| UUID | `8c288da2-9017-415e-b715-64e65d4a35e9` (świeży; nie user path) |
| MIME / rozmiar | `audio/wav` · **16044** B · ≤20 MiB · nie FLAC |
| Upload service_role | **PASS** · path = `catalog/{uuid}/original.bin` |
| List `catalog/{uuid}` | **PASS** · `original.bin` · size 16044 |
| Download (ten sam obiekt) | **PASS** · 16044 B · `RIFF`/`WAVE` · byte match |
| Anon download | **DENIED** (`Object not found` — RLS ukrywa istnienie) |
| Delete service_role | **PASS** |
| Admin list leftover | **[]** |

`POST /api/catalog/copy` — **pominięte** (Storage-only).

---

## FACT — post-probe leftover (MCP `execute_sql`)

| Check | Wynik |
|-------|--------|
| `catalog/%` objects | **0** |
| Probe object row | **0** |
| `catalog_assets` all / probe id | **0** / **0** |

Cleanup **done**. Prod prefix `catalog/` znowu pusty.

---

## Security (zakres probe)

- Granica: service_role Storage API vs anon publishable. Brak user JWT / copy API.
- Ścieżka tylko `catalog/{uuid}/original.bin` — nie `user/` ani cudze mastery.
- Anon nie odczytał obiektu (deny).
- `service_role` key nie wypisany. Host-guard wymagał jawnego script id.
- **INFERENCE:** `service_role` w Supabase zwykle ma `bypassrls`; ten probe **dowodzi** runtime upload/list/get/delete na kontrakcie OD-SC-01 oraz deny klienta, **nie** izolowanej ewaluacji predykatu polityki bez bypass.

---

## NOT VERIFIED / OUT

| Item | Status |
|------|--------|
| Content sniff (OD-SC-02 plik) | **NOT IMPLEMENTED** |
| `POST /api/catalog/copy` E2E | **NOT RUN** (brak bezpiecznego test USER) |
| Scratch DJ v1 | **NOT SHIPPED** |
| Alias / `dpl_*` tego commita docs | po pushu — GitHub Production success ≠ Product GREEN |

---

## NEXT

**Jeden (Catalog):** content sniff **albo** copy E2E z test USER **albo** Scratch — osobne GO.
**Produkt STOP** (SFM / Scratch / flag) zostaje.
