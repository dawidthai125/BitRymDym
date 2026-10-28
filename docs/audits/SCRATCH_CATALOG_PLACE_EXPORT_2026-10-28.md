# Scratch catalog→place + STUDIO_EXPORT fixture (2026-10-28)

| Pole | Wartość |
|------|---------|
| Charakter | **Owner GO** — kolejność: (1) catalog→clip place E2E · (2) słyszalny STUDIO_EXPORT na fixture |
| Data | 2026-10-28 |
| Living Git | `d9739578d4f101dbb7d3d157a26f93127da88cb6` = lokalny HEAD = `origin/main` (`rev-parse` + `ls-remote`) |
| GitHub Production | **`7379647890`** **success** `2026-10-28T07:29:08Z` @ `d973957` (docs tip sprzed tego unitu) |
| Project | `rzzxrgcdogkybkiidqgw` |
| **`dpl_*` / alias** | **NOT VERIFIED** |
| Produkt | **≠ Product GREEN** · **≠ PRODUCTION VERIFIED** |

**Legenda:** FACT / INFERENCE / NOT VERIFIED / BLOCKED.

Sacred `src/lib/takes/recording-eligibility-service.ts` — **nie odczytano**.  
`studio-editor.tsx` / `studio-service.ts` / `SYSTEM_ARCHITECTURE.md` — **nie edytowano**.

---

## Zakres

Owner: „Pracujcie dalej w kolejności którą podałeś.” = (1) catalog→place, potem (2) STUDIO_EXPORT fixture.

**Robiono:** mały fixture catalog → `POST /api/catalog/copy` (sesja Dawida) → `POST …/record/place` na istniejącym projekcie → dowód clip/track/version → cleanup Storage+DB · lokalny bake cue/reverse/rate → `encodeWavFromBake` RIFF/WAVE/duration.

**Nie robiono:** Play masterów / Simple Browser prod audio · Contabo mutate · SFM flag · Sacred / Studio chronione · `db push` / repair · Owner device listen.

---

## Tip vs snapshot

| Źródło | SHA | Klasa |
|--------|-----|--------|
| Żywy Git HEAD / `origin/main` | `d973957` | **FACT** |
| Owner last-known start | `d973957` | **ZGODNE** z żywym Gitem |
| PROJECT_STATE §2 snapshot (przed tym unitem) | `5b2fceb` | **PRZESTARZAŁE** — Git wygrywa |

---

## 1 — Catalog → clip place

### FACT — pre

| Check | Wynik |
|-------|--------|
| Sesja Cursor Browser | `https://www.bitrymdym.pl/account` · **Menu konta: Dawid** · **Dawid (ID: 1)** · Gold · **0 gotowych** |
| `catalog_assets` | **0** |
| `catalog/` Storage | **0** |
| Projekt (istniejący, nie tworzony) | `178e902d-6ecf-4ef6-910c-d85612bb277c` · title `Projekt z bitem` · `document_version=1` · `beat_id` `a05b6370-eb60-4dc6-a2b2-f29ea965048c` |
| Tory | Bit `be2dc465-…` · Wokal `bb80c14e-…` |
| Istniejący clip | BEAT_REF `2f06a6b2-…` 60 s na Bit — **nietknięty** |
| Live takes Dawida | **0** (obcy EXPIRED QA `146f9e96-…` **nie ruszany**) |

### FACT — fixture + copy + place

REUSE: `copyCatalogAndPlaceStudioClip` kontrakt = `POST /api/catalog/copy` + `POST /api/studio/projects/{id}/record/place` (`placeReadyTakeAsStudioClip`). Bez drugiej pipeline. Wywołanie z karty `/account` (`credentials: same-origin`). Cookies/JWT **nie** logowane.

| Krok | Wynik |
|------|--------|
| Fixture | cisza PCM 8 kHz / 1 s · **16044** B · `audio/wav` · `RIFF`/`WAVE` |
| Host-guard | `BRD_ALLOW_PROD_STORAGE=1` · `BRD_PROD_STORAGE_SCRIPT=catalog_place_user_e2e` |
| Upload | `catalog/bc048a6b-7d9d-461f-a9d4-ecdbf5d9116b/original.bin` · list size 16044 |
| `catalog_assets` | PUBLISHED · `license_allows_copy=true` · `byte_size=16044` · `duration_seconds=1` |
| Copy | **HTTP 200** · `reusedExisting:false` · take `d5b57851-d92a-42b5-84d7-6db30ee6b132` READY |
| object_key | `user/fdf04726-e971-42a7-9d46-8b9bdd099c23/takes/d5b57851-…/mic.bin` |
| Place (Wokal, playhead 0, CAS v1) | **HTTP 201** · clip `5af7df51-c6f2-40ad-a593-7d8b771ba835` |
| Clip | `sourceKind=TAKE` · track `bb80c14e-…` (Wokal) · `timelineStartMs=0` · `durationMs=1000` · `documentVersion=2` |
| XP probe | `TAKE_READY` amount **10** |

Istniejący BEAT_REF **pozostał**. Place na pustym Wokal — nie nadpisano bitu.

### FACT — cleanup

| Krok | Wynik |
|------|--------|
| DELETE clip (sesja USER, CAS v2) | **HTTP 200** · `deletedClipId=5af7df51-…` · `documentVersion=3` |
| Storage catalog | remove **1** |
| Storage take-audio | remove **1** |
| `catalog_assets` probe | DELETE **1** |
| `takes` probe (service_role, owner pin Dawid) | DELETE **1** |
| XP `TAKE_READY` probe | DELETE **1** |
| Post leftover | catalog_assets **0** · catalog Storage **0** · probe take **0** · probe clip **0** · probe XP **0** · probe take Storage **0** |

Projekt Dawida **zachowany**: BEAT_REF `2f06a6b2-…` 60 s · `document_version=3` (CAS place+delete; treść poza probe nietknięta).

Jednorazowy skrypt `scripts/_catalog-place-user-e2e.mjs` — **nie commitować**.

**Wynik 1:** **PASS** (controlled E2E + leftover 0).

---

## 2 — STUDIO_EXPORT fixture (local / muted)

### FACT

Zatwierdzone pola Scratch (`scratchCueMs` / `scratchReverse` / `scratchRate`) już stosowane w `renderStudioDocumentOffline` (ancestry `c58b090`). Ten unit dodał encode tej samej bake do WAV przez istniejące `encodeWavFromBake` (REUSE, bez drugiego encodera).

| Kontrola | Wynik |
|----------|--------|
| `node node_modules/vitest/vitest.mjs run` offline-render + scratch-place + scratch-state | **46 PASS** / 0 failed · 3 files · 1.66 s |
| Nowy test | `encodes approved Scratch bake to WAV with RIFF/WAVE duration` |
| Asercje | `RIFF` · `WAVE` · `audio/wav` · 44100 Hz · 16-bit · `durationMs=200` · `byteSize>44` |
| Owner device listen | **NOT VERIFIED** (zakaz egress masterów; fixture syntetyczny, nie prod) |
| Prod STUDIO_EXPORT job / Contabo bake | **NOT RUN** |

**Wynik 2:** **PASS** (najlepszy bezpieczny dowód „słyszalny” = WAV header + duration). Owner listen pozostaje **NOT VERIFIED**.

---

## Audyt docs ↔ runtime (wycinek)

| Twierdzenie | Dowód | Klasa |
|-------------|-------|--------|
| Kontrakt: copy bytes → clip `source_kind=TAKE` | HTTP 201 + SQL clip TAKE + `source_take_id` = copy | **ZGODNE** |
| REUSE_SSOT_MAP: place tylko `placeReadyTakeAsStudioClip*` | route `…/record/place` · helper copy+place · brak nowej pipeline | **ZGODNE** |
| Kontrakt banner „implementation NOT authorized” | copy+place **SHIPPED** + ten E2E PASS | **DOKUMENT PRZESTARZAŁY** (banner 2026-10-25; nie zamyka OD-15) |
| PROJECT_STATE living tip `5b2fceb` | żywy Git `d973957` | **SPRZECZNE / snapshot stale** |
| Scratch bake cue/reverse/rate PARTIAL | vitest PCM + nowy WAV header | **ZGODNE** (PARTIAL bez Owner listen / prod job) |
| Product GREEN | brak | **NIE TWIERDZONE** |

---

## Security (zakres)

- Granica copy/place: zalogowany USER (sesja przeglądarki) → publiczne API. Fixture catalog wgrywa service_role tylko na `catalog/{uuid}/original.bin`.
- Place na **własnym** projekcie Dawida, pusty track Wokal. Istniejący BEAT_REF nie usuwany.
- Cleanup take pin `owner_id=Dawid`. Obcy EXPIRED QA **nie** ruszany.
- Brak logów cookies / JWT / `service_role`.
- **INFERENCE:** service_role Storage/DB cleanup omija RLS — to nie jest dowód predykatu polityki.

---

## Deploy

| Check | Wynik | Klasa |
|-------|--------|--------|
| GitHub Production `7379647890` @ `d973957` | **success** `2026-10-28T07:29:08Z` · „Deployment has completed” | **FACT** |
| Ten unit (test + audit) | test **`da2a48f`** · docs = ten Git closeout | |
| `dpl_*` / alias www | **NOT VERIFIED** | |
| Ten unit push | path-scoped test + docs (ten closeout) | probe `scripts/_catalog-place-user-e2e.mjs` **poza** stage |

---

## NOT VERIFIED / OUT

| Item | Status |
|------|--------|
| UI przycisk „kopiuj z katalogu” / Scratch panel click | **NOT RUN** (API fetch = ta sama ścieżka helpera) |
| SAMPLE/SCRATCH track type v1 | **OUT** (place na istniejącym Wokal) |
| Jog automation bake | **OUT** |
| Prod STUDIO_EXPORT enqueue / worker WAV | **NOT RUN** |
| Alias / `dpl_*` | **NOT VERIFIED** |
| OD-15 / OD-16 | **OPEN** |

---

## NEXT

Living NEXT rozstrzyga PROJECT_STATE §2 po zapisie orchestratora. Kandydat: LF-normalize dirty editor history wiring **albo** UI catalog place **albo** Owner listen lokalnego WAV.  
**STOP** SFM flag / Contabo mutate / OD-15 zostaje.
