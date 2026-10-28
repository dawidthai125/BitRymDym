# Audyt Studio (unlock GO) — 2026-10-28

**Status:** audyt **SHIPPED** · Scratch DJ v1 **PARTIAL w repo (po Fazie C)** · prod USER copy **BLOCKED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**  
**GO:** Owner „GO, Studio odblokowujemy robimy jego audyt też.”  
**Start tip FACT:** `6e2132bc48bbda5c5e6f54a5c66fc790550d37c3` = `origin/main` (`git rev-parse` + `ls-remote`)  
**Kontrakt:** [SAMPLE_CATALOG_AND_DJ_SCRATCH_CONTRACT.md](../decisions/SAMPLE_CATALOG_AND_DJ_SCRATCH_CONTRACT.md)  
**Mapa reuse:** [REUSE_SSOT_MAP.md](../architecture/REUSE_SSOT_MAP.md)

Klasyfikacja: **FACT** = odczyt kodu / Gita w tej sesji · **INFERENCE** = wniosek z kodu bez runtime · **NOT VERIFIED** = brak dowodu runtime.

Sacred `src/lib/takes/recording-eligibility-service.ts` — **nie odczytano / nie diffowano / nie hashowano** (path mention only).  
`docs/architecture/SYSTEM_ARCHITECTURE.md` — **nie edytowano** (status-only dirty WIP).

---

## 1. Powierzchnia Studio

### 1.1 Editor / transport / persistence

| Element | Ścieżka | FACT |
|---------|---------|------|
| Editor + selection SSOT | `src/components/studio/studio-editor.tsx` | `selectedTrackId` / `selectedClipId` / `docRef`. Add-track UI woła `POST /tracks` **bez** `trackType` (zawsze default VOCAL). |
| Jeden silnik | `src/lib/studio/studio-audio-engine.ts` | `StudioAudioEngine` · 1 `AudioContext` · głosy = `HTMLAudioElement` + Web Audio graph. Host w `studio-transport-provider.tsx`. |
| Transport | `src/components/studio/studio-transport-provider.tsx` | Play/Pause/Stop/Seek + take preview. Katalog `PlayerProvider` jest **tłumiony**, nie używany do mixu. |
| Persist / CAS | `studio-persist-orchestrator.ts` + `studio-service.ts` + `studio_cas_*` | Mutacje przez orchestrator + RPC service_role. Client-direct CAS = zakaz mapy. |
| Place TAKE → clip | `studio-record-service.ts` `placeReadyTakeAsStudioClipFor` | Owner + READY + nie-deleted + geometria z playhead. Idempotent ten sam track+take+start. Reuse `addStudioClipFor`. |
| Record UI | `studio-recording-panel.tsx` | Keep / import → istniejący `POST …/record/place`. |

### 1.2 API (`src/app/api/studio/`)

FACT (inventory, nie runtime):

- Projects: `GET/POST /projects` · `GET/PATCH/DELETE /projects/[id]`
- Tracks: `POST /tracks` (add VOCAL) · track CRUD / reorder / duplicate / effects
- Clips: `POST /clips` · `PATCH/DELETE /clips/[id]` (geometry / fades / gain / mute) · duplicate / split
- Beat attach: `/beat` · picker `/beat-picker`
- Record: `/record/context` · `/record/takes` · `/record/place`
- Export: `POST/GET /projects/[id]/export` → `createStudioExportJob` (AuthZ w serwisie eksportu)
- Final / SFM: `/final/*` · artifacts download
- Mix-working (dirty WIP, **nie** na tipie `6e2132b`): `mix-working/*` — **poza zakresem tego unlock** (nie commitować mixed WIP)

### 1.3 AuthZ

| Granica | FACT | Ryzyko |
|---------|------|--------|
| Session | `requireUser` w serwisach (`studio-service`, catalog copy, record place) | Wysokie gdyby route ominął serwis — place/copy **nie** omijają |
| Project owner | `assertOwnsProject` / `owner_id === context.userId` | — |
| TAKE place | `takes.owner_id === user` · `READY` · `!deleted_at` | Client `ownerId` / `objectKey` na place = **400** |
| Catalog copy | `requireUser` · client `beatId`/MIME **ignorowane** | License / PUBLISHED / sniff fail-closed |
| CAS | `expectedDocumentVersion` + `studio_cas_*` + `p_owner_id` | Konflikt = fail, nie silent overwrite |
| Export | job owner-scoped (`getOwnStudioExportJob`) | License-denies-export z kontraktu **NOT VERIFIED** na runtime prod |

**Sacred adjacency (path only):** `studio-record-service.ts` używa `isTakeExpired` z `@/lib/takes/entitlement` oraz READY/owner — **nie** importuje Sacred w odczytanym pliku. Testy `p5-5` wspominają „eligibility APIs” jako reuse — **INFERENCE:** eligibility leży obok place, nie w editorze.

### 1.4 REC / export granice

| Temat | Klasyfikacja |
|-------|----------------|
| REC bytes → TAKE `take-audio` `user/{owner}/takes/{id}/mic.bin` | FACT (istniejący pipeline) |
| Catalog original → ten sam TAKE path po copy | FACT (`catalog-copy-service.ts`) |
| Studio clip source = `source_kind=TAKE` + `sourceTakeId` | FACT (`studio-types.ts`, kontrakt §3) |
| Catalog URL jako źródło clipu | FACT: **zakazane** w REUSE map; kod place wymaga TAKE id |
| `STUDIO_EXPORT` offline | FACT: `studio-offline-render.ts` / job — **brak** parametrów reverse/rate/cue Scratch |
| Live ↔ offline parity | NOT VERIFIED (kontrakt tego nie deklaruje jako FACT) |

---

## 2. Ryzyka

| ID | Ryzyko | Poziom | Dowód |
|----|--------|--------|-------|
| R1 | Dirty WIP Studio (`studio-editor.tsx`, `studio-service.ts` **M**) = mix-working / inne — **nie** mieszać ze Scratch commit | średnie | `git status` path `M` |
| R2 | Sacred path `M` w worktree — **PRESERVE**, zero odczytu | wysokie (proceduralne) | porcelain path-only |
| R3 | `SYSTEM_ARCHITECTURE.md` dirty — status-only | niskie | porcelain |
| R4 | HTMLAudioElement **nie** obsługuje ujemnego `playbackRate` → live reverse nie da się zrobić w obecnym silniku bez BufferSource | wysokie vs kontrakt §9.1.3 | typ `StudioMediaElement` + `element.currentTime` w `syncVoices` |
| R5 | Brak kolumn clip na cue/reverse/rate → persist CAS **nie** ma gdzie zapisać approved Scratch | wysokie vs §9.8 | `StudioClipDto` pola |
| R6 | Add-track zawsze `STUDIO_ADD_TRACK_DEFAULT_TYPE = VOCAL` — SAMPLE/SCRATCH w allowliście, **brak** product flow tworzenia | średnie | `studio-track-capacity.ts` · `tracks/route.ts` |
| R7 | Mobile jog wymaga touch capture — UI Studio jest mobile-first, ale jog **nie istniał** przed Fazą C | średnie | brak trafień `jog`/`scratch` w `src/` przed implementacją |
| R8 | a11y Inspector overlay (focus trap, Escape) istnieje; nowy jog musi mieć nazwę dostępną + ≥44px | średnie | `studio-inspector-shell.tsx` |
| R9 | Audio egress: nie odtwarzać prod masterów w Simple Browser | proceduralne | AGENTS.md WAVE 1 OPS |
| R10 | Prod copy USER bez bezpiecznego konta = orphan TAKE / cap | wysokie | poprzedni audit CATALOG_COPY |

---

## 3. Scratch DJ readiness vs kontrakt

Źródło: kontrakt §9–§11.

| Wymaganie | Przed Fazą C | Po Fazie C (zamierzony slice) |
|-----------|--------------|-------------------------------|
| 9.1 Jog mouse + mobile touch | **BRAK** | Domain + panel (live rate na istniejącym `playbackRate`) |
| 9.1 Cue set/return | **BRAK** | Domain in-memory |
| 9.1 Reverse audible | **BRAK** — silnik HTML | **OUT** live; approved flag + fail-closed export helper |
| 9.1 Pitch/rate linked | **BRAK** | Domain clamp 0.25–4 · apply na głosach silnika |
| 9.1 BPM / grid sync | Project `tempoBpm` SSOT istnieje | **OUT** tego slice (transport alignment nie ruszany) |
| 9.2 Release → Studio transport | n/a | `releaseScratch` → rate 1 + istniejący play/pause |
| 9.3 Drugi silnik | Nie ma | **Nie dodano** |
| 9.4 SAMPLE/SCRATCH tracks | Typy w `STUDIO_TRACK_TYPES` + label PL | Tworzenie UI/API **OUT** (nadal VOCAL default) |
| 9.8 Persist CAS | Brak pól | **OUT** (in-memory approved) |
| 10 Export approved state | Offline render bez Scratch | Fail-closed helper — **nie** ciche pominięcie |
| §3 Catalog → TAKE → clip | Copy SHIPPED; place SHIPPED; **brak** sklejki catalog→place | Client helper reuse obu API |
| AC 4 License deniesa export | Kod copy ma license copy; export gate **NOT VERIFIED** | bez zmian |
| OD-15 | OPEN | **nie zamykane** |

---

## 4. Catalog copy → Studio clip (REUSE)

Kanoniczny łańcuch (kontrakt §3 + mapa):

1. `POST /api/catalog/copy` → `executeCatalogAssetCopyFor` → prywatny TAKE `QUICK` · provenance `takes.title` = `catalog:{assetId}:{projectId}` · key `user/{owner}/takes/{id}/mic.bin`
2. `POST /api/studio/projects/{id}/record/place` → `placeReadyTakeAsStudioClip` → clip `sourceKind=TAKE`
3. Adapter `studio-audio-source-adapter` / `studio-take-audio` ładuje ten sam `sourceTakeId`

**FACT:** kroki 1 i 2 istnieją osobno. **FACT (przed C):** brak jednego product call site catalog→place.  
**Zakaz:** drugi place pipeline, catalog URL jako clip, drugi `StudioAudioEngine`.

---

## 5. Dirty / chronione (status-only)

| Path | Porcelain | Postępowanie |
|------|-----------|--------------|
| `src/lib/takes/recording-eligibility-service.ts` | `M` | Sacred — PRESERVE, zero treści |
| `src/components/studio/studio-editor.tsx` | `M` | Unlock na ten GO, ale **dirty mix-working** — Faza C **nie** edytuje (unik mixed commit) |
| `src/lib/studio/studio-service.ts` | `M` | j.w. |
| `docs/architecture/SYSTEM_ARCHITECTURE.md` | `M` | status-only, bez edycji |
| Mix-working untracked (`mix-working/*`, API) | `??` | poza zakresem |

---

## 6. Faza B — prod USER copy

**BLOCKED.** Powód: brak bezpiecznego test USER (fixtures / local Supabase credentials w tym checkout **nie** potwierdzone; `.env` nie otwierane). Poprzedni audit CATALOG_COPY: prod copy runtime **NOT VERIFIED**. Nie seedowano `catalog_assets`, nie wołano prod `POST /api/catalog/copy`, nie ruszano Storage. Kod copy zostaje na `main` (`6e2132b`).

---

## 7. Rekomendacja Fazy C (wykonana jako PARTIAL)

Najcięższy pion bez mixed dirty Studio:

1. Domain Scratch (jog/cue/reverse/rate + export fail-closed) — nowe pliki.
2. Client `copy + place` reuse istniejących API.
3. Panel (pointer + touch jog) w `studio-recording-panel` (plik czysty).
4. `StudioAudioEngine.applyScratchLive` na istniejącym `playbackRate` — **jeden** silnik.
5. **OUT:** live reverse, persist CAS, SAMPLE/SCRATCH track create, BPM grid, export encode, editor dirty, OD-15.

---

## 8. Skills / czego nie ruszono

Skills: `architecture-and-reuse` · `security-review` · `frontend-ux` (wysoki poziom) · `documentation-audit` · `research-and-planning`.

Nie ruszono: Sacred · `SYSTEM_ARCHITECTURE.md` · Contabo · SFM flag · `db push` · sekrety · Simple Browser prod audio.
