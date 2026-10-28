# Mix Working restore + Scratch export encode — 2026-10-28

**Status:** A **SHIPPED** · B **PARTIAL** (bake rate/reverse/cue) · C **BLOCKED** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**  
**GO:** Owner „Tak wykonuj wszystko co zaproponowałeś” — tropy A → B → C  
**Start tip FACT:** `41668c00b41acceb022c03f3b914716016ee8f67` = lokalny HEAD = `origin/main` (`git rev-parse` + `ls-remote`)

Sacred `src/lib/takes/recording-eligibility-service.ts` — **nie odczytano**.  
`docs/architecture/SYSTEM_ARCHITECTURE.md` — **nie edytowano**.  
Dirty `studio-editor.tsx` — **nie stage’owano** (mixed Studio WIP).  
`studio-scratch-persist.ts` — **nietknięty**.

---

## A — Mix Working A3.5 na cienki `studio-service`

Hunks A3.5 z `_studio-service.wip.ts` przywrócone **na** aktualny cienki service (persist Scratch zostaje):

| Ścieżka | Rola |
|---------|------|
| `studio-service.ts` | allowlista gain/pan/mute/solo + master mix + track/master FX → `applyStudioMixWorkingOpsFor` (dynamic import) |
| `studio-scratch-persist.ts` | kanon CAS Scratch — **bez** mix-working |
| `mix-working-apply-service.ts` | atomic apply + idempotency |
| `POST …/mix-working/**` | apply / revisions / restore / compare |
| `studio-mix-revision-history-control.tsx` | UI historii (wiring w dirty editor **poza** stage) |
| repo SQL `2026102022/23/24` | A1 + A2 + A3.5 parent-in-TX |

**Prod schema FACT (MCP apply, drift vs repo timestamps):**

| History version | name |
|-----------------|------|
| `20261028070108` | `studio_mix_working_apply` |
| `20261028070125` | `studio_mix_working_apply_rpc` |
| `20261028070133` | `studio_mix_working_revisions` |
| `20261028070155` | `studio_mix_working_parent_in_tx` |

RPC `studio_cas_apply_mix_working_ops` (8-arg + optional revision) **present**. RLS ON na ledger/revisions. EXECUTE **service_role** only.

## B — STUDIO_EXPORT bake approved Scratch

`assertScratchExportEncodable` **nie** fail-closed dla reverse/rate.  
`resolveScratchSourceMs` + `studio-offline-render` stosują **zatwierdzone** CAS fields (`scratchCueMs` / `scratchReverse` / `scratchRate`) w istniejącym offline bake.  
Mapowanie: `studioEngineDocumentFromProject` przenosi pola na `StudioEngineClip`.  
**Jeden** silnik offline — bez drugiego renderera.

PARTIAL: jog automation **OUT**; cue/rate/reverse z CAS **IN**; słyszalny prod WAV **NOT VERIFIED**.

## C — Prod USER catalog copy + cleanup

**BLOCKED.** MCP RO: `auth.users=4`, test-like count `0`. Local Supabase `127.0.0.1:54421` **unreachable**. `.env` **nie otwierane**. Zero `POST /api/catalog/copy`. Zero insert/cleanup. Nie orphanowano.

## Kontrole

| Kontrola | Wynik |
|----------|--------|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| vitest A/B slice (scratch-state/cas + offline-render + mix-working domain/contract/a35 + revision + persist orchestrator) | **160 PASS** / 1 skipped / 0 failed |
| Stage | path-scoped; editor / Sacred / ECC dirty **poza** |

## Explicit non-claim

- Editor history wiring pozostaje w dirty WIP
- Mix-working **prod HTTP/runtime** **NOT VERIFIED**
- Scratch export **słyszalny** **NOT VERIFIED**
- **≠** Scratch GREEN · **≠** PRODUCTION VERIFIED · **≠** Product GREEN
