# STUDIO PROJECT CHECKBOX UX POLISH

**Date:** 2026-10-07  
**Owner:** Prezes Dawid  
**Executor:** Cursor Agent  
**Status:** **IMPLEMENTATION COMPLETE** · **NOT DEPLOYED**

---

## 1. Problem

Na `/studio` checkboxy zaznaczania projektów renderowały się jako natywne systemowe (białe / Windows blue accent) i nie pasowały do cream + bottle green BitRymDym.

---

## 2. Existing checkbox

Brak istniejącego `Checkbox` / shadcn checkbox w repo.

Poprzednio w `studio-project-list.tsx`:

```text
<input type="checkbox" className="size-5 accent-[var(--brd-green)]" />
```

`accent-*` nie usuwa natywnego chrome w praktyce (Windows / Chrome).

Logika select / select-all / bulk delete — **bez zmian**.

---

## 3. New visual design

Nowy komponent: `src/components/brand/brd-checkbox.tsx`

| State | Look |
|-------|------|
| Normal | paper fill · green border · `brd-r-xs` |
| Hover | green-wash fill · soft green border |
| Checked | green fill · cream SVG check |
| Indeterminate | green fill · cream dash |
| Focus | green-soft ring + paper offset |
| Hit area | **44×44** wrapper · visual box **18px** |

Native `<input type="checkbox">` remains (opacity 0) for a11y / keyboard.

---

## 4. Design tokens reused

| Token | Use |
|-------|-----|
| `--brd-paper` | unchecked fill · checkmark color |
| `--brd-green` | border · checked fill |
| `--brd-green-soft` | hover / focus ring |
| `--brd-green-wash` | hover wash |
| `--brd-r-xs` | corner radius |

No new hex colors. No red (destructive reserved for Usuń).

---

## 5. Accessibility

- Native checkbox semantics preserved
- `aria-label` on row + select-all unchanged
- `htmlFor` / `id` label association unchanged
- Keyboard: Tab + Space via native input
- `focus-visible` ring on custom chrome
- `indeterminate` set on DOM input via prop

---

## 6. Select-all behavior

Unchanged:

- page-scoped select all / deselect
- partial → **indeterminate** (dash)
- bulk **Usuń zaznaczone** path untouched

Same `BrdCheckbox` for rows and select-all.

---

## 7. Mobile

- 44px hit area
- checkbox column does not force horizontal overflow
- title still truncates; actions wrap

---

## 8. Tests

| Suite | Result |
|-------|--------|
| `studio-project-list-ux.test.ts` | **PASS** (incl. BrdCheckbox guards) |
| `tsc --noEmit` | **PASS** |

Delete / ownership / CAS / audio — **not modified**.

---

## 9. Commit

See git tip after this change (message: checkbox UX polish).

---

## 10. Production

```text
NOT DEPLOYED
```

P6.7 / Post-Recording V1 / Project List Delete gates — **not reopened**.

**NEXT:** WAITING FOR OWNER DECISION
