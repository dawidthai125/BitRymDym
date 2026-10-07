# STUDIO PROJECT LIST UX + DELETE PROJECT

**Date:** 2026-10-07  
**Owner:** Prezes Dawid  
**Executor:** Cursor Agent  
**Status:** **PRODUCTION VERIFIED — GREEN · CLOSED** @ `2c4b416` · dpl `dpl_HuodywHaeJAh7n4BvFnCFo89pCmB`  
See [PRODUCTION_GATE.md](./STUDIO_PROJECT_LIST_UX_DELETE_PRODUCTION_GATE.md).

---

## 1. Problem

Ekran `/studio` pokazywał płaską listę tytułów + BPM/czas bez dat, bez jawnego „Otwórz”, bez usuwania. Projekty testowe (np. „Projekt z bitem”, „P5.2 verify…”) były trudne do rozpoznania i niemożliwe do skasowania z UI.

---

## 2. Existing architecture

| Element | Status |
|---------|--------|
| List | `listStudioProjects` / `listStudioProjectsFor` — `owner_id` + `updated_at DESC` |
| Summary DTO | `StudioProjectSummary` — `createdAt`, `updatedAt`, `tempoBpm`, `timelineLengthMs`, `beatId` |
| Mutations | service_role only (`prevent_studio_project_privilege_escalation`) |
| Ownership | `assertOwnsProject` |
| Cascade | `studio_tracks` → project **ON DELETE CASCADE**; `studio_clips` → track **ON DELETE CASCADE** |
| Take FK | `studio_clips.source_take_id` → takes **ON DELETE SET NULL** |
| Prior delete project | **nie istniało** — tylko `deleteStudioClip` (CAS) |

**Reuse:** auth session, admin client, `AuthError`, `studioApiErrorResponse`, `BrdButton`/`BrdLink`, istniejący Dialog pattern (admin delete).

**Nie zmieniono:** StudioAudioEngine, Transport, Clip edit V1, P6.7, CAS RPCs.

---

## 3. Changes

| Area | Change |
|------|--------|
| UI | `studio-project-list.tsx` — project row: title, Utworzono/Edytowano, BPM · duration · beat, **Otwórz**, **Usuń**, empty state |
| Duration | `formatStudioListDurationMs` — compact `mm:ss` / `h:mm:ss` (bez milisekund) |
| Service | `deleteStudioProjectFor` / `deleteStudioProject` |
| API | `DELETE /api/studio/projects/[projectId]` |
| Page copy | lekka aktualizacja `/studio` header |
| Tests | `studio-project-list-ux.test.ts` |

---

## 4. Delete flow

```text
UI „Usuń”
  → confirmation dialog (role=dialog, aria-modal)
  → DELETE /api/studio/projects/:projectId
  → requireUser (via deleteStudioProject)
  → assertOwnsProject
  → admin.delete studio_projects WHERE id + owner_id
  → DB CASCADE tracks + clips
  → UI removes row + router.refresh()
```

Brak `window.confirm`. Potwierdzenie: „Usuń projekt?” + nazwa + informacja o Takes/bitach.

---

## 5. Ownership / security

| Check | Result |
|-------|--------|
| Unauthenticated | `requireUser` → 401 via `studioApiErrorResponse` |
| Non-owner | `assertOwnsProject` → 403 FORBIDDEN |
| Missing project | 404 NOT_FOUND |
| Client cannot mutate table | RLS + privilege trigger; only service_role delete through API |
| Double owner filter | `.eq("id")` + `.eq("owner_id", context.userId)` |

---

## 6. Related data handling

| Data | On project delete |
|------|-------------------|
| `studio_projects` row | DELETE |
| `studio_tracks` | CASCADE |
| `studio_clips` | CASCADE (via tracks) |
| `takes` | **unchanged** (SET NULL on clip FK) |
| `beats` | **unchanged** (`beat_id` SET NULL on project; clip beat refs SET NULL) |
| `audio_artifacts` | **unchanged** |

---

## 7. Take immutability

**PASS** — delete path does not query/mutate `takes`, storage, or artifacts. Schema enforces SET NULL on `source_take_id`.

`DELETE PROJECT ≠ DELETE TAKE`.

---

## 8. Mobile UX

- Column stack on narrow viewports (`flex-col` → `sm:flex-row`)
- Title `truncate` / `min-w-0`
- Actions wrap; `BrdButton`/`BrdLink` use `min-h-11` (~44px)
- No horizontal table scroll
- Dialog: bottom sheet on mobile (`items-end`), centered on `sm+`

---

## 9. Tests

| Suite | Result |
|-------|--------|
| `studio-project-list-ux.test.ts` | **13 PASS** (incl. multi-select / pagination) |
| `tsc --noEmit` | **PASS** |
| V1 / P6.7 architecture guards | **PASS** (unchanged) |

---

## 9a. Follow-up — multi-select + pagination

Owner request after GREEN: select many projects when list is large.

| Feature | Behavior |
|---------|----------|
| Checkbox per row | select / deselect |
| **Zaznacz wszystko na stronie** | page-scoped; indeterminate when partial |
| **Odznacz** | clears selection |
| **Usuń zaznaczone** | confirmation dialog → sequential owned `DELETE` |
| Pagination | **15** / page (`STUDIO_PROJECT_LIST_PAGE_SIZE`) · Poprzednia / Następna |

Security: same per-project `assertOwnsProject` path. No new bulk RPC.

---

## 10. Known limitations

- Soft delete / kosz / undo — **out of scope**
- Search / filters / folders — **out of scope**
- Select-all across **all** pages — page-scoped only
- Select-all across **all** pages — page-scoped only

---

## Final

```text
LIST UX + DELETE = PRODUCTION VERIFIED GREEN @ 2c4b416
MULTI-SELECT + PAGINATION = PRODUCTION DEPLOYED @ 0f2169a
  dpl = dpl_EwamhoSBMLpGYNvmHrciL8ULQy1Y
V1 / P6.7: unchanged CLOSED / GREEN
NEXT: WAITING FOR OWNER DECISION
```
