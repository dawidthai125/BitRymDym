# SFM planes — staging / host read-only (2026-10-27)

| Pole | Wartość |
|------|---------|
| Charakter | **Audyt read-only** — Git + GitHub Deployments + MCP SELECT prod · **bez** flagi ON · **bez** bake · **bez** migracji apply |
| Data | 2026-10-27 |
| Living SSOT | [PROJECT_STATE.md](../PROJECT_STATE.md) §2 **SFM PLANES** / **SFM CODE STATUS** |
| Prod project | `rzzxrgcdogkybkiidqgw` (jedyny projekt BitRymDym; **ACTIVE_HEALTHY**) |
| Tip at write | living Git then `3b7d2e6…` (Gate 0 docs) · SFM code ancestor **`5212933`** |

**Legenda:** FACT / INFERENCE / NOT VERIFIED / BLOCKED.  
**Produkt:** **≠ SFM Production GREEN** · **≠** `SFM_VERSIONS_V1` ON · **≠** staging E2E.

---

## Decyzja zakresu (MODIFY BEFORE CREATE)

Istniejące audyty `SFM_KIND_REJECT_*` (2026-10-16) mają **inny** zakres (KIND_REJECT fixture / live GO). Ten plik = nowy dated RO planes, nie dopisek do continuum KIND_REJECT.

**Nie** robiono: flip `SFM_VERSIONS_V1` · worker always-on · bake jobów · `db push` / `apply_migration` · SSH mutate · Contabo enable (Gate 2 osobno).

---

## Planes

| # | Plane | Status | Dowód |
|---|-------|--------|-------|
| 1 | Code on `main` | **VERIFIED** | `git merge-base --is-ancestor 5212933 HEAD` exit 0 · HTTP `2f7050e` · poller `d3c99e3` · KIND_REJECT `69e50d0` w ancestry living tip |
| 2 | Staging deployment SHA | **NOT VERIFIED** | GitHub Deployments last-20 = **Production only** (brak env Preview/Staging). Brak osobnego staging deploy id. |
| 3 | Staging schema | **NOT VERIFIED** | MCP `list_projects`: jeden projekt BitRymDym = prod. `list_branches` **[]**. **Nie** założono staging = prod. |
| 4 | Staging SFM worker activity | **NOT VERIFIED** | Brak staging hosta / Preview deploy / branch DB. |
| 5 | Prod app bundle | **VERIFIED (ancestry)** | SFM code w produkcji przez auto-deploy ancestry `5212933`. Runtime HTTP SFM / flaga **NOT VERIFIED**. `dpl_*` / alias bind → Gate 0 **NOT VERIFIED**. |
| 6 | Prod DB schema | **VERIFIED (this session, RO)** | Historia MCP: `20261015072911` foundation · `…72956` B1 · `…73145` C · `…73249` D · `20261016040822` KIND_REJECT. Repo files `20261014…` / `20261016120000` **≠** remote version ids (znany drift). Tabele `studio_final_versions` / `_stages` / `_version_grants` **istnieją**. RPC `claim_next_sfm_job(text)` · `reject_sfm_executor_job_kind(uuid,text)` · `sfm_start_stage` · `sfm_complete_stage` **istnieją** (`SECURITY DEFINER`). |
| 7 | Prod SFM worker / queue activity | **VERIFIED empty (DB only)** | `studio_final_versions/stages/grants` counts **0**. `render_jobs` z `sfm_version_id` **0**. Kinds `SFM_MIX_PREPARE` / `SFM_MASTER_BAKE` / `SFM_QUALITY_ENCODE` **0** wierszy. To **nie** jest odczyt procesu na hoście (Gate 2). |
| 8 | `SFM_VERSIONS_V1` runtime | **NOT VERIFIED** | Kod fail-closed: `isSfmVersionsV1Enabled` default **false** (`src/config/audio-render.ts`). Wartość env Production **nie** odczytywana (brak `vercel env` / OAuth). **Nie** włączano flagi. |

---

## Werdykt

**PARTIAL.** Code-on-main + prod schema/RPC + pusta kolejka SFM = FACT. Staging planes **nie istnieją jako osobny target** w tej sesji → **NOT VERIFIED** (nie BLOCKED na SSH — brak obiektu). Host process = Gate 2. **SFM Production GREEN NOT CLAIMED.**

---

## Zakazy potwierdzone

- Flaga **nie** włączona.
- Worker always-on **nie** włączony.
- Migracje **nie** apply.
- Staging **nie** utożsamiony z prod.
