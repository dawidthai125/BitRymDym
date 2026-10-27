# Catalog Storage policies + OD-SC-02 gates (2026-10-27)

**Status:** Implementation design **in repo** · Owner GO Implementation Catalog (Gate 3) · **prod schema APPLIED 2026-10-27**  
**Does not close:** OD-SC-01…05 values · OD-15 · OD-16 · Scratch DJ v1 · content sniff · live Storage probe  
**Prod apply:** **APPLIED** — MCP `apply_migration` · history `20261027225553` / `catalog_originals_storage_and_entity` · read-back **PASS** · [audit](../audits/CATALOG_ORIGINALS_PROD_APPLY_2026-10-27.md)

Kontrakt: [SAMPLE_CATALOG_AND_DJ_SCRATCH_CONTRACT.md](./SAMPLE_CATALOG_AND_DJ_SCRATCH_CONTRACT.md) §12–13  
Audyt RO: [SAMPLE_CATALOG_S13_STORAGE_POLICIES_RO_2026-10-27.md](../audits/SAMPLE_CATALOG_S13_STORAGE_POLICIES_RO_2026-10-27.md)

---

## 1. OD-SC-02 vs `beat-audio` (nie zmieniamy OD)

| Warstwa | Limit | Status |
|---------|-------|--------|
| Bucket `beat-audio` (żywy + migracje MASTER) | 50 MiB · MIME **z** `audio/flac` | **ZOSTAJE** — to bramka beat MASTER, nie catalog |
| Catalog original (OD-SC-02) | 20 MiB · **bez FLAC** · ≤ 180 s · MIME mpeg/wav/x-wav/mp4/aac | **Nowe stałe** w `validateCatalogOriginalUploadMeta` |
| TAKE copy (OD-SC-03) | `TAKE_AUDIO_MAX_BYTES` 20 MiB · 180 s | **nietknięte** |

OD-SC-02 **nie** jest cicho przepisane na 50 MiB/FLAC. Rozjazd jest **zaprojektowany:** dwie allowlisty, jedno kanoniczne `validateObjectKey`.

Czwarta bramka (treść pliku) = **fail-closed NOT IMPLEMENTED** (`CATALOG_CONTENT_GATE_NOT_IMPLEMENTED`). Client MIME ≠ content proof.

---

## 2. Storage `catalog/` (fail-closed)

- Bucket: istniejący `beat-audio` · klucz `catalog/{catalogAssetId}/original.bin`
- Encja: `public.catalog_assets` (nie `beat_audio_assets`)
- RLS ON + FORCE · GRANT tylko `service_role` · **brak** polityk `anon`/`authenticated`
- Polityki `storage.objects` TO `service_role` na regex catalog original
- FAR-01 INSERT nadal tylko `user/…/master.bin` — **nie** rozszerzane
- Residual: FAR-01 SELECT jest bucket-wide (`beat-audio`) — może czytać `catalog/` jeśli rola istnieje. **Nie** zmieniane w tym GO (osobna twardość FAR-01)

Orphan KEEP `catalog/*` zostaje straż delete (już w kodzie). Retention catalog ≠ take janitor (OD-SC-01).

---

## 3. Runtime

Kanoniczne miejsce: `src/lib/beats/audio-validation.ts` (`validateObjectKey` + `buildCatalogOriginalObjectKey` + `validateCatalogOriginalUploadMeta`).  
Copy planner: `src/lib/catalog/catalog-originals.ts` · `POST /api/catalog/copy` (sesja wymagana).  
Fail-closed default: brak potwierdzonego prod apply / tabeli / polityk `catalog_originals_service_*` → `CATALOG_STORAGE_POLICIES_UNAVAILABLE` (**503**), **zero zapisu**. Content sniff nadal `CATALOG_CONTENT_GATE_NOT_IMPLEMENTED`. Dest TAKE key **nie** jest wymyślany.

Scratch DJ v1 UI / CAS / Studio chronione = **OUT** (osobny NEXT).

---

## 4. Prod

Migracja `supabase/migrations/20261027220000_catalog_originals_storage_and_entity.sql` = **SHIPPED in repo**.  
**Prod apply = APPLIED** (2026-10-27) via MCP `apply_migration` · remote version **`20261027225553`** (drift vs repo `20261027220000` — **nie** repair) · tabela + 4 polityki Storage + grants read-back **PASS**.  
Live probe upload / content sniff / Scratch DJ = **osobne GO**. **≠ Product GREEN**.
