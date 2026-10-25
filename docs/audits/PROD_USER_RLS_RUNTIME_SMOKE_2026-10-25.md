# Prod USER RLS runtime smoke — `beat_audio_assets` (2026-10-25)

| Pole | Wartość |
|------|---------|
| Charakter | **Dokumentacja wyniku** — bez ponownego smoke w tym zadaniu docs |
| Źródło dowodu | **Owner-reported** (raport Ownera po smoke produkcyjnym) |
| Zakres | Runtime RLS na prywatnym DRAFT+MASTER USER · polityka `beat_audio_assets_select_own` |
| Project | `rzzxrgcdogkybkiidqgw` |
| Migracja (osobny claim) | Apply + catalog read-back **PASS** 2026-10-25 · history `20261025152524` / `beat_audio_assets_owner_select` · **nie** re-apply |
| Living SSOT | [PROJECT_STATE.md](../PROJECT_STATE.md) §2 · [PROJECT_FUNCTIONAL_MAP.md](../PROJECT_FUNCTIONAL_MAP.md) |

**Legenda:** PASS / FAIL / BLOCKED / NOT RUN / NOT VERIFIED.  
**Produkt:** **≠ Product GREEN** (nawet przy PASS poniżej).

---

## Claimy rozdzielone

| Claim | Status | Uwaga |
|-------|--------|--------|
| Migracja owner SELECT (apply + catalog) | **PASS** | Earlier GO 2026-10-25; SQL unchanged from repo |
| Owner SELECT (runtime JWT zwykły USER) | **PASS** | Owner-reported · earlier smoke |
| Anon isolation (prywatny DRAFT) | **PASS** | Owner-reported · earlier smoke |
| Peer isolation (drugi USER) | **PASS** | Owner-reported · ten closeout |
| Product GREEN | **nie** | Nie deklarować |

---

## Peer isolation — zakres (Owner-reported)

- Osobna sesja zwykłego USER (peer) vs owner; porównanie JWT `sub` wyłącznie **w pamięci procesu** — bez zapisu / ujawniania ID ani hashy.
- Peer: PostgREST z własnym JWT roli **`authenticated`** — **bez** `service_role`, bez admina, bez MCP jako peera.
- Wynik peera na fixture prywatnego DRAFT+MASTER ownera: `beat_audio_assets` count **0** · `beats` count **0** · dopasowań tytułu fixture **0**.
- UI peera: pusta lista „Moje bity”; trasa uploadu z id cudzego DRAFT → redirect na pustą listę; `/beat/[id]` nie udostępnia prywatnego bitu.
- Bez mutacji fixture’a, Auth/DB/Storage cleanupu, ani zmian policy w tym smoke.

**Ten dokument nie jest niezależnym re-runem smoke’u.** Nie zawiera PII, tokenów, cookies, ścieżek Storage ani identyfikatorów użytkowników.

---

## Historia

| Moment | Status runtime |
|--------|----------------|
| 2026-10-25 SESSION VERIFY (apply) | owner / peer / anon runtime **BLOCKED** (brak sesji USER + DRAFT) — **HISTORY** |
| 2026-10-25 Owner-reported smoke (ten plik) | owner **PASS** · anon **PASS** · peer **PASS** · **≠ GREEN** |

Audyt [FULL_PRODUCT_FUNCTIONAL_AUDIT_2026-10-25.md](./FULL_PRODUCT_FUNCTIONAL_AUDIT_2026-10-25.md) zachowuje snapshot sprzed runtime PASS; living status = PROJECT_STATE + ten closeout.
