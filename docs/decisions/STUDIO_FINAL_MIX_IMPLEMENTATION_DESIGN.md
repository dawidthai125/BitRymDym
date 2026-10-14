# Studio Final Mix — Implementation Design

**Status:** `OWNER ACCEPTED (design docs)` — reconciled 2026-10-14 — **NOT IMPLEMENTED**
**Date:** 2026-10-14 (reconciliation GO)
**Type:** IMPLEMENTATION DESIGN — living technical project for future Implementation GO
**Analyzed tip:** `fdcca3b42a00d7039facc5eff40259f9799bf779` (`origin/main`)
**Product contract:** [STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md](./STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md)
**Stages freeze:** [STUDIO_FINAL_MIX_VERSION_STAGES_DESIGN_FREEZE_PROPOSAL.md](./STUDIO_FINAL_MIX_VERSION_STAGES_DESIGN_FREEZE_PROPOSAL.md)
**F-addendum:** [STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md](./STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md)
**Companion docs:** [DATA_MODEL](./STUDIO_FINAL_MIX_DATA_MODEL.md) · [RPC_SECURITY](./STUDIO_FINAL_MIX_RPC_SECURITY_CONTRACT.md) · [TEST_MATRIX](./STUDIO_FINAL_MIX_TEST_MATRIX.md)

```text
IMPLEMENTATION = NOT AUTHORIZED BY THIS DOCUMENT
OD-04 PAYMENT PROVIDER = OPEN
OWNER DESIGN DECISIONS 1–4 = ACCEPTED (docs) — see §0
≠ E3 render_jobs.kind = 'MIX' · ≠ mix_sessions · ≠ TAKE_EXPORT · ≠ RAW
REUSE FIRST · SSOT FIRST · ZERO DUPLICATE BUSINESS LOGIC
READY / object_key / URL ALONE ≠ DOWNLOAD RIGHT
```

---

## 0. Owner design decisions (2026-10-14) — ACCEPTED docs

| ID | Temat | Status |
|----|--------|--------|
| **OD-SFM-ID-01** | Osobna trasa SFM + deny SFM na `/api/mix/artifacts/…` po cutover | **ACCEPTED** |
| **OD-SFM-ID-02** | Grant wersji + historyczny zakres jakości (≠ unlimited future qualities) | **ACCEPTED Z DOPRECYZOWANIEM** |
| **OD-SFM-ID-03** | Wiele slotów `AVAILABLE` / dzień | **ACCEPTED** |
| **OD-SFM-ID-04** | `SFM_MIX` = osobne zadanie wykonawcze (≠ E3 `kind=MIX`) | **ACCEPTED** |

Szczegóły poniżej (§4, §5, §7, §10). Nadal OPEN: §12 + `OPEN_DECISIONS.md`.
---

## 1. Cel i granice

### 1.1 Cel biznesowy (docelowy)

1. Użytkownik tworzy utwór w Studio (bit, wokal, scratch, edycje).
2. Zapis i odsłuch **nie** są finalizacją.
3. Jawne **„Zatwierdź do finalizacji”** tworzy niezmienną wersję.
4. Domenowe etapy **`SFM_MIX`** → **`SFM_MASTER`**.
5. Po `EXPORTS_ELIGIBLE`: grant wersji, limity, slot 7,99 PLN, lazy jakości.
6. Historia wcześniej uprawnionych wersji pozostaje dostępna w granicach kontraktu; nie mylić z aktualnym finalem.

### 1.2 Poza zakresem tego dokumentu

- Kod, migracje, Contabo, deploy, checkout płatności.
- Zamknięcie **OD-04**.
- Zmiana semantyki E3 / TAKE / RAW / beat downloads.

---

## 2. Inwentaryzacja FACT (EXISTS / PARTIAL / MISSING)

Źródła: kod @ `fdcca3b`, migracje lokalne, SSOT ACCEPTED, inwentaryzacja READ-ONLY `5a6a9eab-1b87-4f08-b96d-2d6070cad162`.

| Obszar | Status | Dowód |
|--------|--------|-------|
| Enqueue `STUDIO_EXPORT` | EXISTS | `src/lib/audio/studio-export-service.ts` → `createStudioExportJobFor` |
| API export | EXISTS | `src/app/api/studio/projects/[projectId]/export/route.ts` |
| UI „Eksportuj WAV” | EXISTS | `src/components/studio/studio-export-control.tsx` |
| Snapshot na jobie | EXISTS | `document_snapshot` · migracja `20261010185020_…` |
| Bake WAV stereo 44.1/16 | EXISTS | `render-worker-pipeline.ts` · `AUDIO_CODEC` · `wav-encode.ts` |
| Klucz F02 WAV-only | EXISTS | `buildStudioExportArtifactObjectKey` — non-WAV throws |
| `audio_artifacts.project_id` | EXISTS | migracja `20261010185034_…` |
| Download shared route | EXISTS | `GET /api/mix/artifacts/[id]/download` · `artifact-download.ts` |
| AuthZ download: owner+READY+SUCCEEDED+capability | PARTIAL | brak grantu wersji / current vs historical |
| Cap / quota enqueue z Premium | EXISTS | `assertUnderDailyCap` / `quotaBytesForTier` |
| Bramka `EXPORT_WAV` (GOLD-only matrix) | EXISTS | `PREMIUM_TIER_MATRIX` + `assertAudioCapability` — **≠** macierz SFM |
| Retencja z `artifactRetentionSeconds` | EXISTS | complete path w workerze (FREE 48h…GOLD **30d** prod) |
| F02b / F03b / stages / grants / slots | MISSING | tylko docs ACCEPTED |
| Tabele `studio_final_*` | MISSING | brak w migracjach / inventory SQL |
| Osobny resolver jakości SFM | MISSING | — |
| Limit dzienny `Europe/Warsaw` | MISSING | beaty używają `utcDayWindowStart` (`src/lib/downloads/limits.ts`) |
| OD-04 provider | OPEN | `OPEN_DECISIONS.md` |

**WAV parametry (EXISTS w kodzie):** `AUDIO_CODEC.WAV_SAMPLE_RATE=44100`, `WAV_BIT_DEPTH=16`, `CHANNELS=2` (`src/config/audio-render.ts`, `render-worker-pipeline.ts`, `wav-encode.ts`). Product copy: PCM 44,1 kHz / 16-bit; kanały = **stereo (2)** na podstawie tego dowodu — nie domysł.

---

## 3. Macierz planów SFM (SSOT — nie zmieniać)

| Plan | Odsłuch | MP3 128 | MP3 192 | MP3 320 | WAV | Pierwsze pobrania/dzień |
|------|---------|---------|---------|---------|-----|------------------------:|
| FREE | Tak | Nie | Nie | Nie | Nie | 0 |
| BRONZE | Tak | Tak | Nie | Nie | Nie | 1 |
| SILVER | Tak | Tak | Tak | Nie | Nie | 2 |
| GOLD | Tak | Tak | Tak | Tak | Tak | 5 |

**SILVER = MP3 128 + MP3 192** (Product Contract OD-SFM-07).

**Izolacja:** ≠ `canExportOwnTake` (TAKE: BRONZE ma 192), ≠ `PREMIUM_TIER_MATRIX.downloadsDaily`, ≠ beat download limits.

---

## 4. Trasa pobierania — **OD-SFM-ID-01 ACCEPTED**

### 4.1 Stan FACT

- Jedyna trasa signed download artefaktów audio dziś:
  `GET /api/mix/artifacts/[id]/download`
  → `createOwnArtifactDownloadSignedUrl` / `For`
  (`src/app/api/mix/artifacts/[id]/download/route.ts`, `src/lib/audio/artifact-download.ts`).
- UI Studio używa tej ścieżki (`studioExportArtifactDownloadUrl`) — wygoda, **nie** wspólna domena.
- AuthZ dziś: owner, READY, not deleted, not expired, bucket, capability z DB `quality_tier`, job SUCCEEDED.
- **Brak:** grant wersji, SFM quality resolver, `sfm_version_id`.

### 4.2 Decyzja Ownera (ACCEPTED)

1. Docelowo Studio Final Mix używa **osobnej** trasy pobierania SFM.
2. Po cutover stara trasa **`GET /api/mix/artifacts/[id]/download` odmawia** obsługi artefaktów SFM.
3. Semantyka E3 MIX / TAKE / RAW **bez zmian**.
4. Domenę artefaktu ustala **wiarygodne powiązanie w DB** (`sfm_version_id` / XOR źródła) — **nie** client claims.
5. Download wymaga serwerowej AuthZ: użytkownik, projekt, wersja, grant, jakość, stan artefaktu.
6. `object_key` / URL / READY **same** ≠ prawo do pobrania.
7. Kontrolowana kompatybilność pozostałych domen i historycznych ścieżek obiektów Storage.

Propozycja URL (Implementation GO może doprecyzować path):

```text
GET /api/studio/artifacts/[artifactId]/download
```

Serwis: `createOwnSfmArtifactDownloadSignedUrlFor` — SFM AuthZ only (nie `EXPORT_WAV` jako bramka produktu).

### 4.3 Cutover (procedura docs)

| Faza | Zachowanie | Testy |
|------|------------|-------|
| Pre-flag | Legacy WAV MVP nadal mix route + capability AuthZ (FACT) | R01 |
| Flag ON — nowe Accept/SFM rows | UI SFM → nowa trasa; wymaga grant+resolver | DL01–DL03 |
| Cutover | Mix route: jeśli `sfm_version_id IS NOT NULL` → **403/404 DENY** (fail-closed) | DL05 |
| E3 MIX / TAKE | Mix route bez zmian AuthZ dla `mix_session_id` / `take_id` | DL06–DL07 R04–R05 |
| Pre-SFM WAV (`project_id` set, `sfm_version_id` NULL) | Polityka grandfather vs deny — **OPEN** §12.1 / OD-SFM-ID-06 | A09 |

Próba pobrania SFM starą trasą po cutover: **zawsze DENY** (nawet owner + READY).

**Nigdy:** client `object_key` / prior URL jako AuthZ.

---

## 5. Resolver jakości + grant wersji — **OD-SFM-ID-02 ACCEPTED Z DOPRECYZOWANIEM**

### 5.1 Problem FACT

Enqueue WAV używa `STUDIO_EXPORT_MVP_TIER="WAV"` + `assertAudioCapability(..., capabilityForRenderTier("WAV"))` → **`EXPORT_WAV`** (GOLD-only w `PREMIUM_TIER_MATRIX`). To bramka techniczna MVP, **nie** macierz OD-SFM-07.

### 5.2 Cztery warstwy (obowiązkowy rozdział)

| # | Warstwa | Znaczenie |
|---|---------|-----------|
| 1 | **Grant wersji** | Wiersz `(user_id, version_id)` — prawo do „pierwszego pobrania wersji” / re-download bez nowego daily/slot |
| 2 | **Historyczny zakres jakości** | `granted_qualities[]` — jakości **już uprawnione** dla tej wersji |
| 3 | **Plan bieżący** | `SFM_PLAN_MATRIX[premiumTier]` — jakości, do których użytkownik **może** uzyskać nowe uprawnienie |
| 4 | **Artefakt** | READY / current / not expired / exists — niezależnie od grantu |

**Zakaz interpretacji:** grant wersji **nie** jest nieograniczonym prawem do dowolnej jakości dodanej w przyszłości ani do pliku po TTL.

### 5.3 Chwila zapisu `granted_qualities` (rekomendacja techniczna)

**REKOMENDACJA (domyślna dla Implementation Design):** przy **pierwszym** udanym `sfm_claim_version_grant`:

```text
granted_qualities := SFM_PLAN_MATRIX[premiumTier_at_grant_time]
```

- Snapshot jest **zamrożony** w chwili FIRST_GRANT (źródło planu: `resolveProductEntitlement*`).
- Re-download jakości ∈ `granted_qualities`: **bez** consume daily/slot (OD-SFM-15).
- Downgrade: jakości ∈ `granted_qualities` pozostają re-downloadowalnie; jakości **∉** `granted_qualities` → tylko jeśli current plan pozwala **i** nastąpi osobne, jawne rozszerzenie (patrz OPEN).
- Nowa wersja: **nowy** grant; brak dziedziczenia.

**OPEN — wymaga potwierdzenia Ownera (OD-SFM-ID-05):** po **upgrade** planu, czy jakość spoza snapshotu (np. grant przy BRONZE `{MP3_128}`, potem GOLD) może zostać **dopisana** do `granted_qualities` bez nowego daily/slot przy pierwszym sięgnięciu do tej jakości, czy wymaga nowego FIRST_GRANT / osobnej reguły?

Do potwierdzenia Ownera **nie** wolno zakładać auto-expand. Do czasu decyzji: **strict snapshot** (tylko `granted_qualities` + deny new).

### 5.4 Kontrakt resolvera

```text
resolveSfmQualityEntitlement({
  premiumTier,          // resolveProductEntitlement — plan
  quality,              // MP3_128 | MP3_192 | MP3_320 | WAV
  versionGrant,         // null | { granted_qualities, granted_at, ... }
  accessMode,           // CLAIM_GRANT | RE_DOWNLOAD | ENQUEUE | DOWNLOAD
}): SfmQualityDecision
```

| Mode | Reguła (strict snapshot) |
|------|--------------------------|
| CLAIM_GRANT | daily/slot; insert grant + snapshot |
| RE_DOWNLOAD / DOWNLOAD / ENQUEUE | grant must exist; `quality ∈ granted_qualities`; else DENY (aż OD-SFM-ID-05) |
| Artifact check | osobno po allow jakości |

**Zakaz:** `EXPORT_WAV` / `capabilityForRenderTier` / `canExportOwnTake` jako bramka produktowa SFM.

### 5.5 Testy negatywne (skrót)

FREE deny-all; BRONZE deny 192/320/WAV; SILVER deny 320/WAV; downgrade GOLD→BRONZE z snapshot all → historyczne OK; quality nigdy w snapshot → DENY; READY bez grant → DENY.

Szczegóły: [TEST_MATRIX](./STUDIO_FINAL_MIX_TEST_MATRIX.md).
---

## 6. Architektura docelowa (warstwy)

```text
UI Studio
  → Accept API / RPC
  → Stage transitions (SFM_MIX → SFM_MASTER)
  → Grant claim (daily | paid slot)
  → Enqueue quality encode (lazy)
  → SFM download route (OD-SFM-ID-01)

Domain DB: versions · stages · grants · paid slots (many AVAILABLE)
Execution: render_jobs — SFM_MIX job + SFM_MASTER job + quality encode (≠ kind=MIX)
Storage: audio-artifacts bucket (istniejący)
AuthZ: SFM resolver + grant ≠ artifact READY
Retention: F03b 90d from MASTER_SUCCEEDED (≠ Premium matrix)
```

### 6.1 Reuse vs new

| Element | Decyzja |
|---------|---------|
| `studio_projects` | ROZSZERZYĆ: `current_final_version_id` |
| `render_jobs` / worker claim | REUSE infrastruktury; **osobne** job kinds/metadata SFM — nazwy exact OPEN §12.3 |
| `audio_artifacts` + bucket | ROZSZERZYĆ kolumnami SFM; bez nowego bucketa |
| `premium_entitlements` | REUSE jako źródło **planu** |
| Beat `reserve_beat_download_slot` | WZORZEC atomowości; **nie** współdzielić limitu; **nie** UTC day |
| `utcDayWindowStart` | **NIE** dla SFM — nowy `warsawDayBucket` |
| `canExportOwnTake` / TAKE ladder | **NIE** reuse semantyki |
| E3 `kind=MIX` / `mix_sessions` | **ZAKAZ** utożsamiania |

---

## 7. Przepływy (happy path)

### 7.1 Finalizacja + **SFM_MIX jako job (OD-SFM-ID-04 ACCEPTED)**

```text
Edit project (document_version++)
→ [Zatwierdź do finalizacji] + expectedDocumentVersion
→ insert studio_final_versions (immutable snapshot) + stages PENDING
→ enqueue SFM_MIX executor job bound to (version_id, stage SFM_MIX)
→ worker: validate/prepare against frozen snapshot → QC
→ sfm_complete_stage(SFM_MIX, SUCCEEDED)  // job SUCCEEDED alone ≠ stage
→ enqueue SFM_MASTER executor (only if SFM_MIX SUCCEEDED)
→ worker: offline bake → QC
→ sfm_complete_stage(SFM_MASTER, SUCCEEDED)
→ retention_anchor_at = now; expires_at = anchor+90d
→ version EXPORTS_ELIGIBLE; set current_final_version_id
```

**Kontrakt zadania `SFM_MIX` (docs):**

| Element | Wymaganie |
|---------|-----------|
| Binding | `version_id` + stage `SFM_MIX` + optional `job_id` |
| Wejście | wyłącznie snapshot wersji (immutable); nie żywy `document_version` projektu |
| Stany joba | zgodne z istniejącym workerem (QUEUED/RUNNING/SUCCEEDED/FAILED) — **bez** auto-retry do QUEUED wbrew polityce Contabo |
| Idempotencja | UNIQUE owner+idempotency_key; claim SKIP LOCKED / CAS |
| Konkurencja | jeden aktywny sensible job na stage; przegrany CONFLICT |
| Walidacja wyniku | fail-closed przed `sfm_complete_stage(SUCCEEDED)` |
| Audyt | `SFM_MIX_JOB_*` + stage transition events |
| Retry | bezpieczny: nowy attempt / nowy job wg policy; nie ciche nadpisanie |
| Wejście do MASTER | **tylko** gdy domain stage `SFM_MIX=SUCCEEDED` |

**Zakończenie `SFM_MIX` ≠ mastering.** `SFM_MASTER` = osobny etap + osobne zadanie.

### 7.2 Pierwsze pobranie jakości

```text
User picks QUALITY
→ sfm_claim_version_grant(versionId)   // daily OR one AVAILABLE slot (many allowed)
→ resolveSfmQualityEntitlement (strict snapshot)
→ if no current READY: enqueue quality encode
→ wait SUCCEEDED + is_current
→ SFM download route → signed URL (no extra grant consume)
```

### 7.3 Re-download

```text
grant exists → skip daily/slot
→ quality ∈ granted_qualities (strict)
→ artifact valid
→ signed URL
```

---

## 8. State machine (skrót)

Pełne kontrakty: [RPC_SECURITY](./STUDIO_FINAL_MIX_RPC_SECURITY_CONTRACT.md) · encje: [DATA_MODEL](./STUDIO_FINAL_MIX_DATA_MODEL.md).

| Maszyna | Stany / reguły |
|---------|----------------|
| Version | ACCEPTED → (via stages) EXPORTS_ELIGIBLE → SUPERSEDED \| EXPIRED |
| Stage | UNIQUE (version, SFM_MIX\|SFM_MASTER); MASTER dopiero po MIX SUCCEEDED; job status ≠ domain status |
| SFM_MIX job | osobny executor; SUCCEEDED → complete stage; ≠ E3 MIX |
| Grant | 1 na (user, version); `granted_qualities` snapshot; re-download bez consume |
| Slot | wiele AVAILABLE / user / day; AVAILABLE → CONSUMED (bind) \| EXPIRED (Warsaw midnight) \| REVOKED |
| Artifact | ≤1 `is_current` READY per (versionId, QUALITY); promote po QC |

**Zakaz:** automatyczny retry do QUEUED sprzeczny z istniejącymi zasadami workerów.
---

## 9. Artefakty, klucze, retencja

### 9.1 Klucze (F02b)

```text
user/{ownerId}/studio-export/{projectId}/versions/{versionId}/qualities/{QUALITY}/{jobId}.{ext}
```

Legacy (F02 history, read-compatible):

```text
user/{ownerId}/studio-export/{projectId}/jobs/{jobId}/WAV.wav
```

SSOT ścieżki = stored `audio_artifacts.object_key` (nigdy client).

### 9.2 Promote (Correction B)

1. Encode + upload pod **unikalnym** `jobId`.
2. Walidacja format/bitrate/sample rate/bit depth/channels/duration/size/hash.
3. Transakcja: poprzedni current → `is_current=false`; nowy → `is_current=true` **tylko** po QC.
4. Concurrent jobs: jeden zwycięzca (partial UNIQUE).
5. Retry **tego samego** joba: idempotentny (ten sam object identity).

### 9.3 Retencja (F03b)

- Start: `MASTER_SUCCEEDED` / `retention_anchor_at`.
- Wszystkie jakości wersji dzielą `expires_at`.
- Po TTL: clear `current_final_version_id` jeśli wskazuje wygasłą; artifact EXPIRED/tombstone; grant logiczny ≠ plik.
- **Nie** używać `limitsForPremiumTier().artifactRetentionSeconds` dla SFM finals po Implementation GO.
- Slot płatny **nie** przedłuża retencji.
- TAKE / E3 / RAW — bez zmian.

---

## 10. Płatny slot 7,99 PLN — **OD-SFM-ID-03 ACCEPTED (wiele AVAILABLE)**

- Po potwierdzeniu płatności (provider **OD-04 OPEN**): nowy wiersz slotu `AVAILABLE` dla `day_bucket` Warsaw.
- **Wiele** niewykorzystanych slotów `AVAILABLE` tego samego dnia jest **dozwolone** (brak limitu 1/user/day).
- Każdy slot: własna tożsamość (`id`), `payment_ref` (UNIQUE), status, `day_bucket`, historia (consumed_at / revoked).
- Bind do `version_id` **atomowo przy grant claim** (wybór jednego AVAILABLE, np. oldest-first `FOR UPDATE SKIP LOCKED`).
- Ten sam slot **nie** może być wykorzystany dwukrotnie (`AVAILABLE` → `CONSUMED` CAS).
- Midnight Warsaw (+DST): unused → `EXPIRED` (no rollover).
- Refund przed use → `REVOKED`.
- Refund po use → grant **zostaje**; daily **nie** wraca.
- Webhooki: idempotentne po `payment_ref`; **bez** konkretnego dostawcy.
---

## 11. Rollout (kolejność — bez wykonania)

| Etap | Zakres | PASS | STOP |
|------|--------|------|------|
| D0 | Te dokumenty + Owner ACCEPT design | Spójność SSOT | Sprzeczna macierz |
| D1 | Migracje lokalne data model | Testy DB | RLS fail |
| D2 | RPC grant + Warsaw | Concurrency PASS | Double grant |
| D3 | Accept + stages | Illegal transition DENY | E3 MIX pisze stage |
| D4 | Quality encode F02b + promote | QC + unique current | Silent overwrite |
| D5 | SFM download route + resolver | IDOR neg | E3 regresja |
| D6 | Janitor 90d (staging) | Dry-run | Cross-domain delete |
| D7 | Paid slot shell (mock provider) | Idempotent webhook | Real checkout bez OD-04 |
| D8 | Contabo/prod | Osobne GO | — |

Feature flag: `SFM_VERSIONS_V1` (nazwa robocza). Legacy WAV path aż do cutover GO.

---

## 12. Otwarte decyzje (po reconciliation)

| ID | Temat | Status |
|----|--------|--------|
| OD-SFM-ID-05 | Expand `granted_qualities` po upgrade bez nowego daily/slot? | **OPEN** (do czasu: strict snapshot) |
| OD-SFM-ID-06 | Legacy WAV `project_id` bez `sfm_version_id` po cutover | **OPEN** |
| OD-SFM-ID-07 | Exact `render_jobs.kind` strings dla SFM_MIX / MASTER / quality | **OPEN** |
| OD-04 | Operator płatności | **OPEN** |
| Contabo/poller | Ops GOs | **OPEN** (osobne) |

**Zamknięte w tym GO (docs):** OD-SFM-ID-01…04.

---

## 13. Kryteria jakości designu

- Zgodność z kodem FACT, nie z domniemaniami.
- Grant ≠ artifact; historyczne jakości ≠ unlimited future.
- Macierz SFM zachowana (SILVER = 128+192).
- `Europe/Warsaw` + DST; wiele slotów AVAILABLE.
- 90d F03b; SFM_MIX = osobny job.
- Semantyczna izolacja E3/TAKE/RAW.
- Osobna trasa download SFM + deny na mix route po cutover.
- Resolver SFM **osobny** od `EXPORT_WAV`.

---

## 14. Następny krok

1. Docs-publish GO (osobne) — te pliki + living SSOT.
2. Odpowiedzi Ownera na OD-SFM-ID-05…07 (opcjonalnie przed impl).
3. Osobne **Implementation GO** (schema → RPC → app → staging → Contabo).
4. Checkout slotów dopiero po CLOSED OD-04.

**Ten dokument nie upoważnia do implementacji.**
