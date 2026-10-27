# Catalog originals — prod apply + read-back (2026-10-27)

| Pole | Wartość |
|------|---------|
| Charakter | **Owner GO prod apply** — MCP `apply_migration` + SELECT read-back · **bez** live Storage probe / upload |
| Data | 2026-10-27 |
| Project | `rzzxrgcdogkybkiidqgw` |
| Repo SQL | `supabase/migrations/20261027220000_catalog_originals_storage_and_entity.sql` |
| MCP name | `catalog_originals_storage_and_entity` |
| Living SSOT | [PROJECT_STATE.md](../PROJECT_STATE.md) §2 — Sample Catalog **schema APPLIED** · Implementation **≠** Scratch DJ · **≠ Product GREEN** |

**Legenda:** FACT / INFERENCE / NOT VERIFIED / BLOCKED.
**Produkt:** **≠ Product GREEN** · **≠ PRODUCTION VERIFIED** · **≠ Scratch DJ v1**.

---

## Zakres

Owner GO: „GO działajcie skutecznie i szybko!” = **prod apply** migracji catalog + checklista docs.

**Nie robiono:** `db push` · `migration repair` · re-apply · Contabo stop/start · SFM flag · Scratch UI · live probe upload na prod Storage · dump `service_role` / sekretów.

---

## FACT — pre-apply

| Check | Wynik |
|-------|--------|
| Żywy Git tip start | `0af0dc3431c3a137bfe397acc2306e98a9e1af24` = `origin/main` (`ls-remote`) |
| `list_migrations` przed apply | **brak** `catalog_originals_storage_and_entity` · ostatnia `20261025152524` / `beat_audio_assets_owner_select` |
| Re-apply | **nie** — pierwsza aplikacja |

---

## FACT — apply

| Check | Wynik |
|-------|--------|
| Mechanizm | MCP `apply_migration` · project `rzzxrgcdogkybkiidqgw` · name `catalog_originals_storage_and_entity` |
| SQL | **identyczna** z plikiem repo (komentarze historyczne „Prod apply = BLOCKED” zostają w pliku Git; nie zmieniają DDL) |
| Wynik MCP | `{ "success": true }` |
| Historia po apply | **`20261027225553` / `catalog_originals_storage_and_entity`** |
| Version drift | **oczekiwany** (jak F1-C / STU-16): repo file `20261027220000` ≠ remote version `20261027225553` · **nie** repair |

---

## FACT — read-back RO (`execute_sql`)

### `public.catalog_assets`

| Check | Wynik |
|-------|--------|
| Tabela | obecna |
| RLS | `relrowsecurity=true` · `relforcerowsecurity=true` |
| Kolumny | `id uuid` · `publish_state text` · `license_allows_copy bool` · `license_allows_export bool` · `object_key text` · `content_type text` · `byte_size bigint` · `duration_seconds int` · `created_at timestamptz` · `updated_at timestamptz` — wszystkie NOT NULL |
| CHECK | `publish_state` ∈ DRAFT/PUBLISHED/WITHDRAWN · MIME mpeg/wav/x-wav/mp4/aac · `byte_size` 1…20971520 · `duration_seconds` 1…180 · `object_key = catalog/{id}/original.bin` |
| PK | `catalog_assets_pkey` on `id` |
| Polityka tabeli | **1:** `catalog_assets_service_all` FOR ALL TO `service_role` USING true / WITH CHECK true |
| Privileges | `anon` SELECT/INSERT **false** · `authenticated` SELECT/INSERT **false** · `service_role` SELECT/INSERT/UPDATE/DELETE **true** |

### Storage `catalog_originals_service_*`

**4/4** na `storage.objects`, wszystkie TO `service_role`, regex `^catalog/[uuid]/original.bin$` na `bucket_id='beat-audio'`:

| Policy | Command | USING | WITH CHECK |
|--------|---------|-------|------------|
| `catalog_originals_service_select` | SELECT | path | — |
| `catalog_originals_service_insert` | INSERT | — | path |
| `catalog_originals_service_update` | UPDATE | path | path |
| `catalog_originals_service_delete` | DELETE | path | — |

**Read-back:** **PASS**.

---

## FACT — advisors (security, po DDL)

`get_advisors` type=security. `catalog_assets` **nie** jest na liście `rls_enabled_no_policy` (ma politykę).

Ostrzeżenia **pre-existing** (poza tym GO; nie naprawiane): `admin_audit_events` / `beat_access_grants` / `beat_download_reservations` / `sample_policy_settings` RLS bez polityk · `sfm_executor_kind_for_stage` mutable search_path · DEFINER EXECUTE (`prevent_user_number_mutation`, `public_author_display_names`, `is_admin`/`is_moderator`/`is_staff`) · leaked-password protection disabled.

---

## Fail-closed copy (kod)

Planner `evaluateCatalogStorageReadiness` wymaga snapshotu: `prodApplyConfirmed` + `catalog_assets` + **4** nazwy `catalog_originals_service_*`. Brak którejkolwiek → `CATALOG_STORAGE_POLICIES_UNAVAILABLE`. **Zero zapisów.** Content sniff nadal `CATALOG_CONTENT_GATE_NOT_IMPLEMENTED`.

Ten GO **nie** podpina runtime probe Storage i **nie** zmienia API. Runtime copy nadal fail-closed, dopóki caller nie potwierdzi snapshotu.

---

## NOT VERIFIED / BLOCKED

| Item | Status |
|------|--------|
| Live probe upload na prod Storage | **BLOCKED** — wymaga osobnego zdania Ownera |
| Content sniff (OD-SC-02 plik) | **NOT IMPLEMENTED** |
| Scratch DJ v1 | **NOT SHIPPED** |
| Alias / `dpl_*` tego commita docs | po pushu — GitHub Production success ≠ Product GREEN |
| Byte-for-byte SQL vs Git | **NOT VERIFIED** (semantyka obiektów PASS; treść historii MCP ≠ plik timestamp) |

---

## NEXT

**Jeden:** Owner GO **controlled live probe** (Storage `catalog/{uuid}/original.bin`) — nie ten dokument.
