# SESSION_BRIDGE — skrót ciągłości sesji (BitRymDym)

**Status:** ACTIVE (GO-1)
**Rola:** operacyjny rejestr przekazywania kontekstu wykonawczego między sesjami Cursor / ChatGPT.
**Owner:** Prezes Dawid

## Ważne ograniczenie

**SESSION_BRIDGE nie jest SSOT** dla living tip, stanu wdrożenia (deploy), NEXT UNIT ani stanu produkcji.
Kanoniczne źródło tip / deploy / NEXT / SESSION VERIFY / connections: **[PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c)**.

Nie kopiuj tu całych raportów, architektury ani decyzji produktowych, które mają własne kanoniczne źródła. Przy sprzeczności: wskaż konflikt i źródło weryfikacji — nie rozstrzygaj domysłem.

ECC `save-session` / magazyn poza repozytorium / pamięć czatu **nie** są kanonicznym źródłem ciągłości wiedzy.

---

## 0. Hierarchia (skrót)

1. Jawne GO Ownera
2. [AGENTS.md](../../AGENTS.md)
3. Living tip / deploy / NEXT → [PROJECT_STATE.md](../PROJECT_STATE.md) §2
4. Decyzje → [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md) · [DECISION_LOG.md](../decisions/DECISION_LOG.md)
5. Cold-start → [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) · [DOCUMENTATION_CONTINUITY.md](../DOCUMENTATION_CONTINUITY.md)
6. Ten plik — skrót ≤15 `EXECUTED` + snapshot WIP + open GO sesji
7. ECC → [ECC_CURSOR_WORKFLOW.md](./ECC_CURSOR_WORKFLOW.md) (pomocnicze)

---

## 1. Cold-start (nowa sesja)

1. Odczytaj `AGENTS.md` i obowiązujące instrukcje repozytorium (autonomia, Sacred WIP, zasady architektury).
2. Odczytaj [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md).
3. Odczytaj [PROJECT_STATE.md](../PROJECT_STATE.md), w szczególności **§2** (living tip / deploy / NEXT).
4. Odczytaj **ten** plik (`SESSION_BRIDGE.md`).
5. Sprawdź świeży `git status` — **zachowaj** istniejący dirty WIP.
6. Przed planowaniem nowych zmian: [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md) · [architecture/REUSE_SSOT_MAP.md](../architecture/REUSE_SSOT_MAP.md) (kanoniczna mapa reuse / anti-dupe) · skill **`architecture-and-reuse`** (gdy dostępny) — MODIFY BEFORE CREATE / ONE CANONICAL.
7. Ustal: FACT / NOT VERIFIED / plan — nie myl warstw; tip/deploy/NEXT wyłącznie z PROJECT_STATE.
8. Ustal zakres następnego zadania; zatrzymaj się przed zmianami wymagającymi osobnego GO Ownera (chroniony WIP, destrukcja, produkcja).

Opcjonalnie (po powyższym):
[handoffs/MASTER_START_PROMPT_CURSOR_PL.md](../handoffs/MASTER_START_PROMPT_CURSOR_PL.md) ·
[handoffs/MASTER_START_PROMPT_CHATGPT_PL.md](../handoffs/MASTER_START_PROMPT_CHATGPT_PL.md)

---

## 2. Snapshot WIP (bez diffów / sekretów)

Aktualizuj po `git status`, przed nowym zadaniem. **Nie** wklejaj treści diffów, `.env`, tokenów ani PII.

Snapshot poniżej = stan z **jednej** kontroli odczytowej. **Nie** jest trwałym SSOT WIP — przed każdym zadaniem **ponów** `git status`. Całego dirty WIP **nie** przypisuj do jednego GO.

| when (ISO) | branch | HEAD (short) | staged | unstaged (tracked) | untracked | areas (high level) | sacred | notes |
|------------|--------|--------------|--------|--------------------|-----------|--------------------|--------|-------|
| 2026-10-27T13:57:00+01:00 (kontrakt A–D) | main | `db435ed` | 0 | ~168 | ~332 | docs≈186 · pozostałe dirty — **nie** przypisuj do kontraktu A–D | path `M` PRESERVE | porcelain≈500; indeks pusty; dirty: `PROJECT_STATE` · `CHANGELOG` · cold-start/MASTER (mixed) — poza zakresem; tip opublikowany GO-5G-Q/R |
| 2026-10-27T11:20:30+01:00 (HISTORY · GO-5G-O tip reconcile) | main | `d05aa4e` | 0 | ~168 | ~332 | docs≈186 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `db435ed` (commit Q / push R) |
| 2026-10-27T10:45:56+01:00 (HISTORY · GO-5G-H refresh) | main | `d462b22` | 0 | ~168 | ~332 | docs≈186 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `d05aa4e` (parent bridge commit `d462b22`) |
| 2026-10-27T09:49:43+01:00 (HISTORY · gap fill) | main | `03d889a` | 0 | ~169 | ~332 | docs≈187 · … | path `M` PRESERVE | HISTORY snapshot przed pushem tipu `d462b22` |

**Sacred WIP (path-only):** `src/lib/takes/recording-eligibility-service.ts`
— nigdy nie czytaj / nie wyszukuj / nie diffuj / nie haszuj / nie przekazuj subagentom (`AGENTS.md`). W tabeli: tylko obecność w `git status`, bez treści.

### 2.1 Tip / deploy — ostatni znany stan (datowany; tip SSOT = PROJECT_STATE)

Kontrola lokalna `2026-10-27T13:57+01:00` (**bez** nowego `fetch` w fazie edycji kontraktu A–D; lokalny ref `origin/main` = last-known po GO-5G-R; **bez** nowego `vercel inspect`):

| Źródło | Wartość | Uwaga |
|--------|---------|--------|
| Lokalny `HEAD` | `db435edea9a6406052212736e00712607b0ca769` | tip `docs: reconcile session bridge tip` (GO-5G-Q); parent **`d05aa4e…`** |
| Lokalny `origin/main` | `db435edea9a6406052212736e00712607b0ca769` | lokalny ref po push GO-5G-R · świeżość serwera w A–D **nie** re-weryfikowana fetch |
| Opublikowany tip `main` (last-known GO-5G-R) | `db435ed…` | push potwierdzony raportem R (`ls-remote` + GitHub API); docs-only · **≠** nowy deploy claim |
| Living tip / deploy / NEXT | → [PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c) | **Git tip** living w PS może nadal lagować (`d462b22…` / wcześniejsze) — SSOT tip = PS · **Deploy last-known:** `dpl_7XwqfE4jjXyTpPa3ozYMB4v4tro1` Ready @ **`d462b22…`** · **DEPLOYMENT VERIFIED** · **ALIAS VERIFIED** · **≠ PRODUCTION VERIFIED ≠ Product GREEN** (GO-5G-B; push docs **≠** dowód nowego `dpl_*`) |
| Docs continuity (worktree) | GO-5G-C / F / G dirty | PS + CHANGELOG nadal dirty (mixed); commit = **osobne GO**; cold-start/MASTER dirty — poza A–D |

**HISTORY (GO-5G-O tip table, `2026-10-27T11:20+01:00`):** HEAD/`origin` = `d05aa4e…` — **superseded** living Git tipem `db435ed…` (Q/R).  
**HISTORY (GO-5G-H tip table, `2026-10-27T10:45+01:00`):** HEAD/`origin` = `d462b22…` — **superseded** living Git tipem `d05aa4e…` (J/M).  
**HISTORY (konflikt tip/push, `2026-10-27T09:49+01:00`):** HEAD=`03d889a` · `origin`=`2cc4cc1` · push then **nie** — **superseded** po pushu `d462b22` (GO-5D).

**Zakazy (ten dokument nie upoważnia do):**
`git stash` · `clean` · `reset` · `restore` · `checkout` wpływający na WIP · `git add -A` / `-u` / `.` · commit / push / deploy / instalacje bez odpowiedniego GO · automatyczne „porządki” dirty tree.

Przed **każdym** nowym zadaniem: **ponów** `git status`.

---

## 3. Statusy (pola niezależne)

### `execution`
| Wartość | Znaczenie |
|---------|-----------|
| `PLANNED` | Zaplanowane — **nie** liczy się do limitu 15 |
| `EXECUTED` | Zakres wykonano w sesji (edycje / testy / raport) |
| `CANCELLED` | Anulowane przed EXECUTED — **nie** liczy się do limitu 15 |

### `verification`
| Wartość | Znaczenie |
|---------|-----------|
| `PASS` | Jest wskazany **rzeczywisty** dowód weryfikacji w zakresie |
| `FAIL` | Weryfikacja wykazała błąd |
| `PARTIAL` | Część dowodów OK, część brak |
| `NOT VERIFIED` | Brak wystarczającego dowodu |
| `BLOCKED` | Zatrzymane (bramka, brak GO, konflikt SSOT, ochrona WIP) |

**Reguły:** `EXECUTED` ≠ `PASS`. Nie deklaruj `PASS` na podstawie samego planu, zgody albo opisu bez dowodu.
`git_sha` — tylko gdy commit istnieje i został odczytany.
`prod` — tylko po niezależnej weryfikacji; inaczej `N/A` lub `UNVERIFIED`.

---

## 4. Rejestr (max 15 × `execution=EXECUTED`)

Najnowsze na górze. **Licznik limitu:** wyłącznie wiersze `EXECUTED`.
`PLANNED` / `CANCELLED` poza limitem.

| date | prompt_id | topic | execution | verification | outcome | evidence / source | git_sha | next / block |
|------|-----------|-------|-----------|--------------|---------|-------------------|---------|--------------|
| 2026-10-27 | KONTRAKT A–D | Autonomia / reuse / handoff (AGENTS+bridge+continuity+REUSE map) | EXECUTED | PARTIAL | Edycja 4 plików allowlisty; tip bridge → `db435ed`; bez stage/commit/push w tej fazie | Diff A–D; raport implementacji | _(brak commita)_ | Path-scoped commit allowlisty = osobne GO · limit 15 pełny |
| 2026-10-27 | GO-5G-O | SESSION_BRIDGE tip reconcile → `d05aa4e` | EXECUTED | PARTIAL | Living snapshot O: tip `d05aa4e`; deploy `@ d462b22`; **HISTORY:** commit Q + push R → tip `db435ed` | Raporty O/Q/R · `git show db435ed` | `db435ed…` (Q) | Mixed WIP PS/CL = osobne GO |
| 2026-10-27 | GO-5G-M | Push jednego commita `d05aa4e` | EXECUTED | PASS | Push `origin/main` bez force; remote SHA potwierdzony (raport M) | Raport GO-5G-M · `ls-remote` / GitHub API w M | `d05aa4e…` | Deploy/alias re-verify = osobne GO |
| 2026-10-27 | GO-5G-J | Commit wyłącznie SESSION_BRIDGE | EXECUTED | PASS | Lokalny commit 1 pliku; message `docs: refresh session bridge snapshot` | `git show d05aa4e` · path only bridge | `d05aa4e…` | Push = GO-5G-M (done) |
| 2026-10-27 | GO-5G-H | SESSION_BRIDGE snapshot refresh §2/§2.1/§5 | EXECUTED | PARTIAL | HEAD/origin lokalnie `d462b22`; tip/deploy pointer → PROJECT_STATE; bez stage/commit/push then | Diff lokalny tylko `docs/operations/SESSION_BRIDGE.md`; raport GO-5G-H | later `d05aa4e…` (J) | Commit/push bridge = J/M (done) |
| 2026-10-27 | GO-5G-G | CHANGELOG wpis GO-5G-C | EXECUTED | PARTIAL | Dodano wpis tip `d462b22` / `dpl_7Xwqf…` / ALIAS VERIFIED; P-NEXT-06 zachowany; ≠ Product GREEN | Dirty `docs/CHANGELOG.md` + raport GO-5G-G | _(brak commita)_ | Commit CHANGELOG = osobne GO |
| 2026-10-27 | GO-5G-F | PROJECT_STATE §5 → §2 NEXT UNIT | EXECUTED | PASS | §5 zredukowany do pointera; STOP Owner; P-NEXT-06 ≠ product CLOSED | Dirty `docs/PROJECT_STATE.md` + raport GO-5G-F | _(brak commita)_ | Commit PROJECT_STATE = osobne GO |
| 2026-10-27 | GO-5G-C | PROJECT_STATE tip/deploy/alias reconcile | EXECUTED | PARTIAL | Living tip `d462b22` · `dpl_7Xwqf…` · DEPLOYMENT/ALIAS VERIFIED · ≠ PRODUCTION VERIFIED ≠ Product GREEN | Dirty `docs/PROJECT_STATE.md` + raporty GO-5G-B/C | _(brak commita)_ | Commit PROJECT_STATE = osobne GO |
| 2026-10-27 | SESSION_BRIDGE gap audit | Uzupełnienie §2/§4 bridge (ten wpis) | EXECUTED | PARTIAL | Minimalna edycja tylko tego pliku; bez stage/commit/push | Diff lokalny `docs/operations/SESSION_BRIDGE.md` (po kontroli); raport agenta w czacie | _(brak commita)_ | Stage/commit tego pliku = osobne GO |
| 2026-10-27 | AUTONOMY READINESS | Audyt gotowości Cursor+ECC (×2 raporty) | EXECUTED | PARTIAL | A spełniony · B częściowy · C nie; `PARTIALLY READY` | Raporty w sesji Cursor (bez zapisu do repo); Task A–D + review | N/A | Bridge/tip/NEXT Owner; ≠ Product GREEN |
| 2026-10-27 | P-NEXT-10A | Audyt blokera przed publikacją 06/08 | EXECUTED | PASS | Baza `03d889a` SAFE; D02 path potwierdzona | Raport 10A; `git show` triad; 1× plik D02 w `docs/phases/` | N/A (RO) | Czeka GO na P-NEXT-10B / push |
| 2026-10-27 | P-NEXT-10 | Commit+push allowlisty 06/08 | BLOCKED | BLOCKED | HEAD≠`2cc4cc1` (był już `03d889a`); zła nazwa D02 w briefie | Preflight P-NEXT-10; brak stage | — | Wznów tylko po GO z bazą `03d889a` |
| 2026-10-27 | GO-3b | Strip trailing WS + commit triad bridge | EXECUTED | PASS | Commit lokalny 3 ścieżek; `--check` exit 0; **push nie** | `git show 03d889a` · paths: SESSION_BRIDGE, CONTINUITY, README | `03d889a…` | Push / tip PROJECT_STATE = osobne GO |
| 2026-10-27 | GO-3 | Path-scoped commit triad | EXECUTED | FAIL | `git diff --cached --check` trailing WS w SESSION_BRIDGE | Raport GO-3 BLOCKED | — | Naprawione w GO-3b |
| 2026-10-27 | GO-2 | RO audit zakresu GO-1 | EXECUTED | PASS | Zakres triad OK; bez Sacred/Studio | Raport GO-2 w sesji | N/A (RO) | — |
| 2026-10-27 | GO-1 | Utworzenie SESSION_BRIDGE + wskaźniki | EXECUTED | PASS | Szablon ACTIVE; CONTINUITY/README pointers | Treść w commitcie `03d889a` (dostarczona przez GO-3b) | `03d889a…` | — |

**Licznik `EXECUTED` w tabeli:** 15 (limit 15). Wiersz `P-NEXT-10` ma `execution=BLOCKED` — **nie** liczy się do limitu. **STOP** przed kolejnym `EXECUTED` bez GO archiwizacji → CHANGELOG.

### 4.1 Limit i archiwizacja

- Maksymalnie **15** najnowszych wpisów `EXECUTED` w tabeli powyżej.
- Docelowe archiwum starszych wpisów: [CHANGELOG.md](../CHANGELOG.md) → sekcja `### SESSION_BRIDGE archive`.
- **GO-1 i bieżąca polityka:** `docs/CHANGELOG.md` jest poza zakresem wielu GO dokumentacyjnych i może mieć dirty WIP. **Nie edytuj CHANGELOG** w ramach GO-1 ani „przy okazji” rotacji bez **osobnego GO Ownera**.
- **Zakaz:** ciche usuwanie starszych wpisów `EXECUTED` bez zatwierdzonej procedury archiwizacji (osobne GO).
- Gdy tabela osiągnie 15 `EXECUTED` i potrzeba dodać kolejny: **STOP** → Owner GO na archiwizację / CHANGELOG; nie kasuj wierszy samodzielnie.

### 4.2 Przerwane / FAIL / brak commita

| Sytuacja | Wpis |
|----------|------|
| Sesja urwała się po pracy | `EXECUTED` + `NOT VERIFIED` lub `PARTIAL`; `git_sha` puste jeśli brak commit |
| Kontrola fail | `EXECUTED` + `FAIL` |
| Bramka / brak GO | `BLOCKED` (execution wg faktu) |
| Anulowano przed startem | `CANCELLED` |
| Brak commita | nie zmyślaj `git_sha` |

---

## 5. Open / STOP (skrót)

Linkuj, nie duplikuj:

- NEXT / STOP → [PROJECT_STATE.md](../PROJECT_STATE.md) (NEXT UNIT)
- OPEN → [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md)

**Last-known deploy / alias (GO-5G-B; nie re-weryfikowane w A–D):**
- Vercel Production **`dpl_7XwqfE4jjXyTpPa3ozYMB4v4tro1`** · target **production** · **Ready** @ SHA **`d462b22…`** (nie aktualizuj do `db435ed` / `d05aa4e` bez dowodu nowego `dpl_*`)
- Aliasy: **`www.bitrymdym.pl`** · **`bitrymdym.pl`** · **`bitrymdym.vercel.app`** → that `dpl_*`
- **DEPLOYMENT VERIFIED** · **ALIAS VERIFIED** · **≠ PRODUCTION VERIFIED** · **≠ Product GREEN**
- Kanoniczne wiersze tip/deploy/NEXT → [PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c); ten bridge **nie** jest SSOT tipu.
- Living **Git** tip (lokalny + last-known published): **`db435ed…`** (parent **`d05aa4e…`**) — docs-only; push ≠ Product GREEN.

**Lokalne GO oczekujące (uzupełniaj ręcznie):**
- Path-scoped commit allowlisty kontraktu A–D (ten bridge + `AGENTS.md` + CONTINUITY + REUSE map) — **bez** `git add -A`.
- Path-scoped commit dirty docs (osobne GO / allowlista): `PROJECT_STATE` (P-NEXT-06+GO-5G-C+F) · `CHANGELOG` (P-NEXT-06+GO-5G-G) — **bez** Sacred / reszty WIP.
- Archiwizacja SESSION_BRIDGE §4 → CHANGELOG (limit 15 `EXECUTED` **pełny**) — osobne GO.
- P-NEXT-10B (lub równoważne): allowlista 12 ścieżek 06/08 z D02 = `docs/phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md`; baza HEAD = **`db435ed`** (ancestor: `d05aa4e` / `d462b22` / `03d889a`).
- **HISTORY (done):** push tipu `03d889a`→`d462b22` · reconcile tip/deploy/alias w PROJECT_STATE (GO-5G-C) · §5→§2 (GO-5G-F) · wpis CHANGELOG GO-5G-C (GO-5G-G) · commit+push SESSION_BRIDGE (J/M @ `d05aa4e`; Q/R tip reconcile @ `db435ed`).
- P-NEXT-06 tip/deploy era = HISTORY w PS/CHANGELOG — **≠** zamknięcie toru produktowego QT / OD-SC / Sample Catalog (**Implementation NOT AUTHORIZED**).
- NEXT UNIT produktu → PROJECT_STATE (**STOP — OWNER DECISION REQUIRED**); Implementation **nie** autoryzowana; nie mylić z GO dokumentacyjnymi powyżej.

---

## 6. Checklist po zadaniu / handoff sesji

**Po istotnej jednostce pracy** (zanim nowa sesja przejmie zadanie) uzupełnij istniejące źródła — **nie** twórz drugiego master handoffu:

1. Cel i zakres zadania (ten GO / wiersz §4).
2. Stan początkowy vs aktualny (HEAD, staged, dirty obszary — status only; §2).
3. Kluczowe decyzje i uzasadnienie (link do OD / DECISION_LOG, nie kopiuj).
4. Kanoniczne pliki / mechanizmy (link REUSE_SSOT_MAP + ścieżki).
5. Zmienione pliki + krótki opis (diff allowlisty).
6. Testy: wykonane / wyniki / niewykonane.
7. Ryzyka, regresje, otwarte pytania.
8. Potwierdzony Git: branch · HEAD · staging · ochrona WIP (Sacred status only).
9. Następny krok + kryteria akceptacji + ograniczenia.
10. Operacje nadal wymagające osobnego GO Ownera.

**Skrót kontrolny:**

- [ ] Zakres = GO
- [ ] Dopisano wiersz §4 (`execution` + `verification` rozdzielone; bez fikcji) — **tylko jeśli limit < 15** albo po GO archiwizacji
- [ ] `git_sha` / `prod` tylko z dowodem
- [ ] Zaktualizowano §2 WIP snapshot (status only)
- [ ] Jeśli dodanie kolejnego `EXECUTED` przekroczyłoby 15 → **nie kasuj**; zgłoś potrzebę GO archiwizacji CHANGELOG
- [ ] Tip/deploy: aktualizuj **PROJECT_STATE**, nie ten plik (osobny zakres/GO); living Git tip w §2.1/§5 może być odświeżony w bridge bez kopiowania SSOT tipu
- [ ] Sacred / dirty: nietknięte poza zakresem
- [ ] Commit / push — wg `AGENTS.md` (path-scoped); **ten plik sam nie jest zgodą**; deploy claim ≠ push docs

---

## 7. Related

- [DOCUMENTATION_CONTINUITY.md](../DOCUMENTATION_CONTINUITY.md)
- [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md)
- [PROJECT_STATE.md](../PROJECT_STATE.md)
- [CHANGELOG.md](../CHANGELOG.md) _(archiwum — edycja tylko po osobnym GO)_
- [ECC_CURSOR_WORKFLOW.md](./ECC_CURSOR_WORKFLOW.md)
