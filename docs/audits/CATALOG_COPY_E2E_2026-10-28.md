# Catalog copy — private TAKE path (2026-10-28)

**Status:** **SHIPPED in repo** · prod copy runtime **NOT VERIFIED** · Scratch **OUT** · **≠ Product GREEN**  
**GO:** Owner GO 2 = Catalog copy E2E  
**Start tip:** `3b8214b784e657b7ea45599a60335ea9ee5a8846` = `origin/main` (`ls-remote`)

## Scope

- `POST /api/catalog/copy`: auth → server-held original `beat-audio` `catalog/{uuid}/original.bin` → OD-SC-02 sniff → private USER TAKE (`take-audio` `user/{owner}/takes/{takeId}/mic.bin`).
- Fail-closed: brak tabeli/polityk, brak PUBLISHED+license, sniff fail, brak `project.beat_id` → **zero zapisu**.
- Reuse: planner `catalog-originals.ts` · claim/finalize `take-transport` · `validateObjectKey` / sniff · `requireUser`.

**Out:** Scratch DJ UI / jog · Contabo mutate / SFM flag · `db push` / repair · Sacred / Studio chronione / `SYSTEM_ARCHITECTURE.md` · prod Storage hurtowo · Simple Browser prod playback.

## Implementation

| Krok | Wynik |
|------|--------|
| Auth | `requireUser` · 401 bez sesji |
| Client `beatId` / MIME / size | **ignorowane** — SSOT = `catalog_assets` + project.beat_id + server bytes |
| Storage readiness | tabela `catalog_assets` czytelna ⇒ ten sam apply co 4 polityki (`20261027225553`) — **INFERENCE** (brak PostgREST na `pg_policies`) |
| Asset | brak wiersza → `CATALOG_NOT_FOUND` **404** · nie PUBLISHED / brak license → `CATALOG_ASSET_NOT_COPYABLE` **409** |
| Original | download `catalog/{id}/original.bin` · mismatch size → 400 · brak obiektu → `SOURCE_UNAVAILABLE` **409** |
| Sniff | `validateCatalogOriginalContentSniff` · fail → `CATALOG_CONTENT_*` **415** · bez claim |
| Project | owner + `beat_id` · brak bitu → `PROJECT_NO_BEAT` **409** |
| Idempotency | READY o tytule `catalog:{assetId}:{projectId}` + ten sam `beat_id` → reuse |
| Write | `createTakeRecordingSessionFor` (cap/TTL) · stamp `QUICK` + provenance title · upload `take-audio` · `finalizeTakeRecordingFor` |
| Failure after claim | `FAILED` + `storage.remove` — zero orphanów READY/obiekt |
| Provenance | istniejące `takes.title` (bez nowej kolumny / apply) |

## Tests

```text
npm test -- --run src/lib/catalog/catalog-originals.test.ts src/lib/catalog/catalog-copy-service.test.ts src/app/api/catalog/copy/route.test.ts src/lib/beats/audio-validation.test.ts
→ 39/39 PASS
eslint (changed files) PASS
tsc --noEmit PASS
```

Mocked executor: happy path · reuse READY · sniff/policies/license/no-beat fail-closed · upload fail cleanup · TAKE_CAP z claim RPC.

## Prod copy runtime

**NOT VERIFIED.** Powód: brak bezpiecznego test USER na prod (ryzyko orphan TAKE / cap). Nie insertowano `catalog_assets`. Nie celowano Vitest w prod Storage.  
Kod + lokalne/mocked dowody **nie** blokują shipu repo.

## Residual

- Scratch DJ v1 = **OUT** (osobne GO)
- Prod USER E2E copy + cleanup = osobne GO
- Dedykowana kolumna `catalog_asset_id` = osobne GO (v1 = title)
- Name-by-name probe 4 polityk Storage z apki = **NOT VERIFIED** (proxy tabela)
