# Sample Catalog §13 — Storage policies / runtime allowlist (read-only)

| Pole | Wartość |
|------|---------|
| Charakter | **Audyt read-only** — repo + SELECT na prod · **bez** Implementation · **bez** mutacji Storage/DB |
| Data | 2026-10-27 |
| Kontrakt | [SAMPLE_CATALOG_AND_DJ_SCRATCH_CONTRACT.md](../decisions/SAMPLE_CATALOG_AND_DJ_SCRATCH_CONTRACT.md) §12–13 |
| Project | `rzzxrgcdogkybkiidqgw` |
| Living SSOT | [PROJECT_STATE.md](../PROJECT_STATE.md) §2 — Sample Catalog **Implementation NOT AUTHORIZED** · **STOP** zachowany |

**Legenda:** FACT / INFERENCE / NOT VERIFIED / BLOCKED.  
**Produkt:** **≠ Product GREEN** · **≠ Implementation GO** · **≠ SHIPPED**.

---

## Decyzja zakresu

Gate produktowy: **Sample Catalog §13 read-only** (najbezpieczniejszy z kanonu NEXT).  
**Nie** robiono: Implementation Catalog/Scratch, Contabo SSH, SFM flag/`db push`, Premium Retention, Sacred/Studio.

Powód CREATE tego pliku: w `docs/audits/` nie ma istniejącego audytu §13. Zamknięte GREEN (P1 Sample Policy, Storage orphan `user/*`, beat catalog fixture) mają **inny** zakres — nie dopisywać tu.

---

## Metoda

1. Mapa repo (migracje Storage, `validateObjectKey`, orphan KEEP `catalog/*`, kontrakt).
2. SELECT-only MCP SQL na produkcji (2026-10-27). **Zero** `apply_migration` / INSERT / UPDATE / DELETE / Storage write.
3. Nie otwierano Sacred WIP, `studio-editor.tsx`, `studio-service.ts`, `SYSTEM_ARCHITECTURE.md`.
4. Nie odtwarzano masterów audio.

---

## FACT — produkcja (SELECT)

| Check | Wynik |
|-------|--------|
| Buckety | **3:** `beat-audio` · `take-audio` · `audio-artifacts` · **brak czwartego** |
| `beat-audio` | `public=false` · `file_size_limit=52428800` (50 MiB) · MIME: `audio/mpeg`, `audio/wav`, `audio/x-wav`, **`audio/flac`**, `audio/mp4`, `audio/aac` |
| `take-audio` | `public=false` · `file_size_limit=20971520` (20 MiB) · MIME: `audio/webm`, `audio/mp4`, `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/aac` |
| `storage.objects` RLS | `relrowsecurity=true` · `relforcerowsecurity=false` |
| Polityki `storage.objects` | **3**, wszystkie FAR-01: `far01_dryrun_readonly` SELECT `bucket_id='beat-audio'`; `far01_live_mutator` SELECT ten sam bucket; `far01_live_mutator` INSERT tylko `user/{uuid}/{uuid}/{uuid}/master.bin` |
| Polityka `catalog/` | **brak** |
| Polityki `anon` / `authenticated` na `storage.objects` | **brak** w tym odczycie |
| GRANT `anon`/`authenticated` na `storage.objects` | SELECT/INSERT/UPDATE/DELETE **są** (typowe default Supabase) — **bez** polityki RLS = deny dla klienta |
| Prefixy obiektów `beat-audio` | `platform` **23** · `user` **1** · `catalog/` **0** |
| Tabele `public` z `catalog`/`sample` w nazwie | tylko `sample_policy_settings` (P1 recording — **nie** encja catalog original) |

`dpl_*` / alias www / runtime SHA aplikacji **nie** są przedmiotem tego audytu.

---

## FACT — repo (bez Sacred / Studio)

| Miejsce | Obserwacja |
|---------|------------|
| Kontrakt §12 OD-SC-01 | Kierunek: istniejący `beat-audio` + prefix + osobna encja. Klucz **DESIGN DIRECTION ONLY:** `catalog/{catalogAssetId}/original.bin`. **No fourth bucket.** |
| Kontrakt §12 OD-SC-02…04 | Allowlista oryginału: mpeg/wav/x-wav/mp4/aac · **20 MiB** · **180 s** · **FLAC off** · MIME + treść + bajty + czas = osobne fail-closed. |
| Kontrakt §13 | Access/list/delete/retention/orphan + runtime allowlista + AuthZ browse = **NOT VERIFIED**. Implementation **NOT AUTHORIZED**. |
| `src/lib/beats/audio-validation.ts` | `validateObjectKey` akceptuje **tylko** `platform/` i `user/`. Inny prefix (w tym `catalog/`) → błąd. `BEAT_AUDIO_MAX_BYTES` = **50 MiB**. Allowlista interimo **zawiera `audio/flac`**. |
| `src/config/recording.ts` | `TAKE_AUDIO_MAX_BYTES` = **20 MiB** (OD-SC-03: nie zmieniać). To limit **TAKE**, nie bramka oryginału katalogu. |
| Migracje `storage.buckets` | Zgodne z live MIME/limit (INFERENCE: SQL live = ten sam kształt co pliki migracji). W `supabase/migrations` **0** stringów `catalog/`. |
| Orphan cleanup | `catalog/*` → **KEEP** (straż delete). **Nie** jest polityką access/list/write/retention catalog originals. |
| Kod `catalogAssetId` / builder `catalog/…/original.bin` | **brak** w `src/` (search RO). |

---

## §13 — status po tym audycie

| Bloker | Status po RO |
|--------|----------------|
| Catalog original Storage direction (OD-SC-01) | Direction = **docs FACT**. Live policies access/list/delete/retention dla `catalog/` = **NOT VERIFIED** (w repo i w live **nie istnieją**). Obiekty `catalog/` = **0**. |
| Audio format allowlist + max bytes (OD-SC-02…04) | Wartości kontraktu = **docs FACT**. Runtime catalog gate = **NOT VERIFIED** (implementacji **nie ma**). Istniejąca allowlista `beat-audio` (**FLAC + 50 MiB**) **nie** jest OD-SC-02. |
| AuthZ browse matrix | **NOT VERIFIED** (poza tym gate). |
| `studio_cas_add_track` | **BLOCKED / NOT RE-VERIFIED** (Studio chronione). |
| Storage↔DB copy protocol | **NOT VERIFIED** (brak ścieżki `catalog/` → `take-audio`). |
| Scratch DSP / Quantize | **NOT VERIFIED** (poza Storage). |
| Sacred WIP eligibility | **BLOCKED** (nie czytany). |
| Implementation GO | **Nadal nie przyznane**. |

---

## Wnioski (nie Implementation)

1. §13 **nie zamyka się** tym audytem. Storage policies i runtime allowlista catalog originals **pozostają NOT VERIFIED**.
2. Brak obiektów `catalog/` + default-deny RLS klienta to stan **niezaimplementowanej** funkcji — **nie** dowód gotowego modelu dostępu.
3. Przed osobnym **Implementation GO** trzeba osobno zaprojektować: polityki `catalog/` (w tym czy SELECT FAR-01 cały bucket jest zbyt szeroki), bramki OD-SC-02 (nie reuse 50 MiB / FLAC / 210 s beatów), encję metadanych, oraz czy `validateObjectKey` w ogóle ma przyjąć `catalog/`.
4. **STORAGE GREEN** / **P1 Sample Policy GREEN** w PROJECT_STATE dotyczą **innych** płaszczyzn (publiczne bity / duration-TTL nagrań) — **nie** Sample Catalog originals.

**≠ PRODUCTION VERIFIED ≠ Product GREEN ≠ Implementation AUTHORIZED.**

---

## Czego nie ruszano

Sacred WIP · Studio chronione · `SYSTEM_ARCHITECTURE.md` · `PROJECT_STATE` NEXT/STOP · flagi SFM · Contabo · Premium Retention · mutacje Storage · `db push`.
