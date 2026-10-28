# Scratch reverse + CAS + SAMPLE/SCRATCH create — 2026-10-28

**Status:** kod **SHIPPED in repo** · prod schema CAS **APPLIED** · prod USER copy **BLOCKED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**  
**GO:** Owner GO na 4 propozycje (reverse · CAS/SAMPLE/SCRATCH · USER copy · alias/`dpl_*`)  
**Start tip FACT:** `bb4857de5e0eb6b61761dbf74e70b48dfc5aae7f` = `origin/main` (`git rev-parse` + `ls-remote`)

Sacred `src/lib/takes/recording-eligibility-service.ts` — **nie odczytano**.  
`docs/architecture/SYSTEM_ARCHITECTURE.md` — **nie edytowano**.  
Dirty `studio-editor.tsx` — **nie edytowano** (mix-working).  
`studio-service.ts` — edycje **izolowane** (add-track type + mapClip scratch + `updateStudioClipScratchFor`); mix-working na końcu pliku **nietknięte**.

---

## 1. Live reverse (cel 1) — PASS (lokalnie)

**FACT:** `StudioAudioEngine.applyScratchLive({ rate, reverse })` zostaje w **jednym** silniku / jednym `AudioContext`.  
Reverse: `AudioBufferSourceNode` na istniejącym `clipGain` (BufferSource). HTML `playbackRate` nadal dla kierunku do przodu.  
Decode: `host.decodeSource` (testy) albo `ctx.decodeAudioData` po `fetch` URL głosu — **bez** drugiego AudioContext.

**Tests:** `studio-scratch-engine.test.ts` + `studio-scratch-state.test.ts` **PASS** (wycinek łącznie **138/138**).

**NOT VERIFIED:** słyszalny reverse na urządzeniu / w przeglądarce Ownera (audio egress masterów nie uruchamiano).

---

## 2. SAMPLE/SCRATCH create + CAS (cel 2) — PASS (repo + prod schema)

**Repo:** `20261028120000_studio_scratch_cas_sample_scratch.sql`  
**Prod apply:** MCP `apply_migration` **PASS** · history **`20261028050115` / `studio_scratch_cas_sample_scratch`** (drift vs plik `20261028120000` — **nie** repair).

Read-back FACT:

| Obiekt | Wynik |
|--------|--------|
| `studio_clips.scratch_cue_ms` | integer NOT NULL default 0 |
| `studio_clips.scratch_reverse` | boolean NOT NULL default false |
| `studio_clips.scratch_rate` | double precision NOT NULL default 1 |
| `studio_cas_add_track` | SECURITY DEFINER · anon/auth **EXECUTE false** · service_role **true** |
| `studio_cas_apply_clip_scratch` | j.w. |

**Create:** `POST /tracks` przyjmuje `trackType` VOCAL\|SAMPLE\|SCRATCH. RPC INSERT używa `p_track_type` (nie hardcode VOCAL). UI: przyciski w recording Inspector (`Dodaj Sample` / `Dodaj Scratch`) — **bez** edycji dirty editora.

**Persist:** `PATCH …/clips/[id]` `op=set_scratch` → `updateStudioClipScratch` → `studio_cas_apply_clip_scratch` + `expectedDocumentVersion`. Panel „Zatwierdź stan”.

**Tests:** `studio-scratch-cas.test.ts` **PASS** · wycinek łącznie **138/138** (bez dirty `p5-track-crud`).  
**eslint** changed files poza pre-existing `prefer-const` w dirty `studio-service.ts` L932 **PASS**.

---

## 3. Prod USER catalog copy + cleanup (cel 3) — BLOCKED

**Dowód:** MCP SELECT counts (bez tożsamości / bez `.env`): `auth.users=4` · `profiles=4` · `studio_projects=6`.  
Brak dedykowanego, potwierdzonego test USER + sesji w tym checkout. Poprzednie audyty copy: **NOT VERIFIED / BLOCKED**.  
Nie wołano prod `POST /api/catalog/copy`. Nie insertowano `catalog_assets`. Nie ruszano Storage. Cleanup **NOT RUN** (nie było zapisu).

Użycie konta Ownera / nieoznaczonego z 4 users = ryzyko TAKE cap / orphan — **odmowa udawania PASS**.

---

## 4. Alias / `dpl_*` (cel 4) — PARTIAL (best-effort, bez OAuth)

Start tip `bb4857d`:

| Źródło | FACT |
|--------|------|
| GitHub Production | **`7377291086`** **success** `2026-10-28T04:37:56Z` @ `bb4857d` |
| Vercel commit status | **success** · dashboard `…/6UtLmn8PdRPT7M59JVqjQZiXvJGa` |
| Unique URL | `https://bitrymdym-gef23don8-dawidthai125s-projects.vercel.app` **302 SSO** |
| `www.bitrymdym.pl` | HTTPS **200** · brak `dpl_*` / SHA w nagłówkach |
| `bitrymdym.pl` | **308** → `https://www.bitrymdym.pl/` |
| `bitrymdym.vercel.app` | HTTPS **200** |

**`dpl_*` NOT VERIFIED** (brak `vercel inspect` / OAuth).  
**ALIAS NOT VERIFIED** (www 200 bez bindowania SHA).  
**DEPLOYMENT success ≠ PRODUCTION VERIFIED ≠ Product GREEN**.

---

## 5. Instalacje

Nic. Agenci/skills ECC i user skills pokrywały zakres. **Nie** instalowano gstack / Superpowers / `frontend-design`.

---

## 6. OUT / nie ruszane

Export encode Scratch · BPM grid · OD-15 · SFM flag · Contabo stop · audio egress masterów · Sacred · dirty editor · `SYSTEM_ARCHITECTURE.md`.
