# Scratch persist isolation from mix-working — 2026-10-28

**Status:** kod **SHIPPED** @ `6014556…` · `studio-service` **bez** `mix-working-apply` · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**  
**GO:** Orchestrator — path-scoped commit+push izolacji Scratch persist  
**Start tip FACT:** `ba181500943621a99233a8ce1974f25b2974fbe0` = `origin/main` (`git rev-parse` + `ls-remote`)  
**Code SHA FACT:** `6014556` `feat(studio): isolate Scratch CAS persist from mix-working`

Sacred `src/lib/takes/recording-eligibility-service.ts` — **nie odczytano**.  
`docs/architecture/SYSTEM_ARCHITECTURE.md` — **nie edytowano**.  
Dirty `studio-editor.tsx` — **nie stage’owano**.  
`mix-working-apply-service.ts` / `mix-working/_studio-service.wip.ts` — **nie stage’owano**.

---

## Zakres

Wydzielono zapis Scratch CAS do `src/lib/studio/studio-scratch-persist.ts`.  
`studio-service.ts` jest cienką warstwą (mapClip + `updateStudioClipScratchFor` + add-track type) i **nie** importuje mix-working.

| Ścieżka | Rola |
|---------|------|
| `studio-scratch-persist.ts` | parse + RPC `studio_cas_apply_clip_scratch` + nazwy SAMPLE/SCRATCH |
| `studio-service.ts` | reuse persist; brak `mix-working-apply-service` |
| `POST …/tracks` | `trackType` VOCAL\|SAMPLE\|SCRATCH |
| `PATCH …/clips` | `op=set_scratch` |
| `studio-scratch-panel.tsx` | `onApprove` + live reverse w `onLiveRate` |
| `studio-recording-panel.tsx` | persist approve + create SAMPLE/SCRATCH |

---

## Kontrole

| Kontrola | Wynik |
|----------|--------|
| `git grep` mix-working w persist + service | **0** trafień |
| `npx vitest run src/lib/studio/studio-scratch-cas.test.ts` | **6/6 PASS** (exit 0) |
| `npx tsc --noEmit` | **PASS** (exit 0) |
| Stage | **7** ścieżek allowlisty; editor / Sacred / mix-working **poza** |

---

## Explicit non-claim

- mix-working **nie** przywrócone na cienki service — wymaga osobnego GO
- prod USER copy **BLOCKED**
- słyszalny reverse / export encode **NOT VERIFIED**
- **≠** Scratch GREEN · **≠** PRODUCTION VERIFIED · **≠** Product GREEN
