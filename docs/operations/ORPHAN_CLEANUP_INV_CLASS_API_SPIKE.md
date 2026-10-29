# Orphan Cleanup — API pagination spike (phases 2–3)

**Status:** documentation spike only — **no production connection**  
**Date:** 2026-10-25  
**Does not authorize:** phase 4 production read-only, `--classify` against prod, or `--execute`

Sources: public Supabase / PostgREST documentation (web), not this project’s live settings.

---

## Storage list pagination

| Claim | Tag |
|-------|-----|
| JS client `storage.from(bucket).list(path, { limit, offset, sortBy })` is documented | **FACT** (Supabase JS reference) |
| Documented default `limit` for list is **100** | **FACT** (docs snippet) |
| Offset + stable `sortBy` is the documented pagination style for JS list | **FACT** |
| Folder entries may have null metadata/`id`; files populate metadata (e.g. size) | **FACT** (docs) |
| Large buckets may need custom SQL `list_objects` RPC for performance | **FACT** (Storage scaling guide) |
| Flutter `listPaginated` uses cursor/`nextCursor` (different from JS limit/offset) | **FACT** |
| Exact page-size ceilings, correctness of offset under concurrent writes, and whether this BitRymDym project’s bucket needs RPC | **NOT VERIFIED** (no prod probe) |
| Exporter’s `pagination_mechanism` string must declare the injected mechanism; completeness claims require Owner-verified live behavior | **INFERENCE** / **DESIGN** |

**Impact on mechanism:** Phase 2 exporter uses injected `listPage({ prefix, limit, offset })` and ends a prefix when a short/empty page returns. Recursive folder walk is implemented locally. **Prod listing remains unauthorized.**

---

## PostgREST / Supabase select pagination

| Claim | Tag |
|-------|-----|
| Supabase docs: projects return max **1000** rows by default; changeable in Project API settings | **FACT** (public docs) |
| Example `supabase/config.toml` uses `max_rows = 1000` | **FACT** (public config example — not this project’s live value) |
| `.range(from, to)` is inclusive and maps to offset/limit | **FACT** (postgrest-js) |
| `select('*', { count: 'exact', head: true })` can return exact counts | **FACT** (docs) |
| Exact count can be expensive on large tables | **FACT** (PostgREST docs) |
| This project’s hosted `max_rows` / `db-max-rows` value | **NOT VERIFIED** |
| Whether classify context tables exceed one page in production | **NOT VERIFIED** |

**Impact on mechanism:** Phase 3 `fetchCompleteTable` pages with `.range` via injected deps and **requires** `fetched_row_count === exact count`. Mismatch or missing count ⇒ `db_read_complete=false` ⇒ SAFE_DELETE suppressed. Production CLI wiring uses page size **500** (below commonly documented 1000) — still **NOT VERIFIED** against this project’s API settings.

---

## Completeness confirmation

| Approach | Tag |
|----------|-----|
| Compare paginated fetch length to `count=exact` | **DESIGN** implemented locally |
| Rely on single unbounded `.select()` | **Rejected** by Design Freeze (**FACT** of prior audit) |
| Trust planned/estimated counts for delete decisions | **NOT** used — exact only; if exact unavailable ⇒ incomplete |

---

## Gate before phase 4

Phase 4 (authorized production read-only) still requires a **separate Owner GO** and should include verifying:

1. Live Storage list page size / need for RPC.  
2. Live PostgREST `max_rows` for the production project.  
3. Exact-count cost/feasibility on classify tables.

This spike alone is **not** that verification.
