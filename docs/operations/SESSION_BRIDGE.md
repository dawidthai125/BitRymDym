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

**Trigger Cursor:** polecenie Ownera **„Kontynuuj projekt”** (lub równoważne wznowienie) → wykonaj tę sekcję od razu, bez pytania o osobny audyt startowy. Szczegóły fraz: reguła `.cursor/rules/bitrymdym-ssot-over-ecc.mdc` (Frazy sesji Cursor).

1. Odczytaj `AGENTS.md` i obowiązujące instrukcje repozytorium (autonomia, Sacred WIP, zasady architektury).
2. Odczytaj [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md).
3. Odczytaj [PROJECT_STATE.md](../PROJECT_STATE.md), w szczególności **§2** (living tip / deploy / NEXT).
4. Odczytaj **ten** plik (`SESSION_BRIDGE.md`) — §4 (ostatnie `EXECUTED` / `BLOCKED`), §5 (open GO / STOP), §2 (snapshot = **wskazówka**, nie SSOT).
5. Sprawdź świeży `git status` + `git rev-parse HEAD` / `origin/main` + staging — **zachowaj** istniejący dirty WIP. **Nie** czyść / stash / reset / restore niepowiązanego WIP.
6. Ścieżki chronione = **status-only** (bez odczytu treści / diff / wyszukiwania / hasha / historii): Sacred `src/lib/takes/recording-eligibility-service.ts` · `src/components/studio/studio-editor.tsx` · `src/lib/studio/studio-service.ts` · `docs/architecture/SYSTEM_ARCHITECTURE.md`.
7. Przed planowaniem nowych zmian: [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md) · [architecture/REUSE_SSOT_MAP.md](../architecture/REUSE_SSOT_MAP.md) · skill **`architecture-and-reuse`** (gdy dostępny) — MODIFY BEFORE CREATE / ONE CANONICAL.
8. Ustal warstwy osobno: **FACT** (Git / dowód w repo) · **INFERENCE** · **NOT VERIFIED** · **BLOCKED**. Tip/deploy/NEXT wyłącznie z PROJECT_STATE §2 — **żywy Git wygrywa** nad przestarzłym wierszem §2.1/§5 tego pliku.
9. Rozróżnij zadania: ukończone (dowód) · częściowe (`PARTIAL` / dirty bez commita) · nieuruchomione · zablokowane (`BLOCKED` / brak GO). **Nie** uznawaj ukończenia wyłącznie na podstawie starego raportu czatu lub samego wiersza `EXECUTED` bez zgodności z Git/dowodem w `outcome` / `evidence`.
10. Ustal **jeden** konkretny, dozwolony następny krok. Zatrzymaj się przed implementacją, jeśli wymaga osobnego GO (chroniony / mixed WIP, destrukcja, produkcja, archiwizacja §4, tip w PROJECT_STATE).
11. Zwróć krótki raport cold-startu (HEAD · dirty/Sacred status-only · NEXT/STOP · jeden następny krok · otwarte GO). Bez nowego szerokiego audytu produktu.

Opcjonalnie (po powyższym):
[handoffs/MASTER_START_PROMPT_CURSOR_PL.md](../handoffs/MASTER_START_PROMPT_CURSOR_PL.md) ·
[handoffs/MASTER_START_PROMPT_CHATGPT_PL.md](../handoffs/MASTER_START_PROMPT_CHATGPT_PL.md)

---

## 2. Snapshot WIP (bez diffów / sekretów)

Aktualizuj po `git status`, przed nowym zadaniem. **Nie** wklejaj treści diffów, `.env`, tokenów ani PII.

Snapshot poniżej = stan z **jednej** kontroli odczytowej. **Nie** jest trwałym SSOT WIP — przed każdym zadaniem **ponów** `git status`. Całego dirty WIP **nie** przypisuj do jednego GO.

| when (ISO) | branch | HEAD (short) | staged | unstaged (tracked) | untracked | areas (high level) | sacred | notes |
|------------|--------|--------------|--------|--------------------|-----------|--------------------|--------|-------|
| 2026-10-27T14:17:35+01:00 (GO bridge tip · post A–D) | main | `fa5b7ca` | 0 | ~168 | ~332 | docs≈186 · pozostałe dirty — **nie** przypisuj do tego GO | path `M` PRESERVE | porcelain≈500; indeks pusty; dirty: `PROJECT_STATE` · `CHANGELOG` · cold-start/MASTER (mixed); lokalny tip operacyjny = commit A–D `fa5b7ca` · tip SSOT = PROJECT_STATE (nie edytowany) |
| 2026-10-27T13:57:00+01:00 (HISTORY · kontrakt A–D pre-commit) | main | `db435ed` | 0 | ~168 | ~332 | docs≈186 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `fa5b7ca` (A–D commit); tip then GO-5G-Q/R |
| 2026-10-27T11:20:30+01:00 (HISTORY · GO-5G-O tip reconcile) | main | `d05aa4e` | 0 | ~168 | ~332 | docs≈186 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `db435ed` (commit Q / push R) |
| 2026-10-27T10:45:56+01:00 (HISTORY · GO-5G-H refresh) | main | `d462b22` | 0 | ~168 | ~332 | docs≈186 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `d05aa4e` (parent bridge commit `d462b22`) |
| 2026-10-27T09:49:43+01:00 (HISTORY · gap fill) | main | `03d889a` | 0 | ~169 | ~332 | docs≈187 · … | path `M` PRESERVE | HISTORY snapshot przed pushem tipu `d462b22` |

**Sacred WIP (path-only):** `src/lib/takes/recording-eligibility-service.ts`
— nigdy nie czytaj / nie wyszukuj / nie diffuj / nie haszuj / nie przekazuj subagentom (`AGENTS.md`). W tabeli: tylko obecność w `git status`, bez treści.

### 2.1 Tip / deploy — ostatni znany stan (datowany; tip SSOT = PROJECT_STATE)

Kontrola lokalna `2026-10-27T14:17+01:00` (**bez** nowego `fetch` w tym GO; lokalny ref `origin/main` = `fa5b7ca…` last-known lokalnie; **bez** nowego `vercel inspect`):

| Źródło | Wartość | Uwaga |
|--------|---------|--------|
| Lokalny `HEAD` | `fa5b7ca9ca0a3b7d3ffb606d1f9c838bf7e5b169` | tip operacyjny `docs: encode BitRymDym autonomy and session handoff contract` (kontrakt A–D); parent **`db435ed…`** |
| Lokalny `origin/main` | `fa5b7ca9ca0a3b7d3ffb606d1f9c838bf7e5b169` | lokalny ref · `0/0` vs `HEAD` · świeżość serwera **nie** re-weryfikowana fetch w tym GO |
| Opublikowany tip `main` (last-known lokalnie) | `fa5b7ca…` | docs-only A–D · **≠** nowy deploy claim · **≠** SSOT tip (→ PROJECT_STATE) |
| Living tip / deploy / NEXT | → [PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c) | **SSOT tip/deploy/NEXT = PS** (ten bridge **nie** zastępuje) · living Git tip w PS może nadal lagować (`d462b22…` / wcześniejsze) · **Deploy last-known:** `dpl_7XwqfE4jjXyTpPa3ozYMB4v4tro1` Ready @ **`d462b22…`** · **DEPLOYMENT VERIFIED** · **ALIAS VERIFIED** · **≠ PRODUCTION VERIFIED ≠ Product GREEN** (GO-5G-B; push docs **≠** dowód nowego `dpl_*`) |
| Docs continuity (worktree) | GO-5G-C / F / G dirty | PS + CHANGELOG nadal dirty (mixed); commit = **osobne GO**; cold-start/MASTER dirty — poza tym GO bridge |

**HISTORY (kontrakt A–D tip table, `2026-10-27T13:57+01:00`):** HEAD/`origin` = `db435ed…` — **superseded** lokalnym tipem operacyjnym `fa5b7ca…` (A–D).  
**HISTORY (GO-5G-O tip table, `2026-10-27T11:20+01:00`):** HEAD/`origin` = `d05aa4e…` — **superseded** tipem `db435ed…` (Q/R).  
**HISTORY (GO-5G-H tip table, `2026-10-27T10:45+01:00`):** HEAD/`origin` = `d462b22…` — **superseded** tipem `d05aa4e…` (J/M).  
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
| 2026-10-27 | GO-SB-ARCHIVE | Archiwizacja §4 → CHANGELOG `### SESSION_BRIDGE archive` | EXECUTED | PASS | Przeniesiono 6 najstarszych `EXECUTED` (SESSION_BRIDGE gap audit · AUTONOMY READINESS · GO-3b · GO-3 · GO-2 · GO-1) do [CHANGELOG.md](../CHANGELOG.md) `### SESSION_BRIDGE archive` · `BLOCKED` `P-NEXT-10` zachowany w living · **bez** commit/push | Diff allowlista: `SESSION_BRIDGE.md` + `CHANGELOG.md` | _(brak commita)_ | Path-scoped commit obu plików = osobne GO |
| 2026-10-27 | KONTRAKT A–D | Autonomia / reuse / handoff (AGENTS+bridge+continuity+REUSE map) | EXECUTED | PARTIAL | Commit+push allowlisty 4 ścieżek: `AGENTS.md` · `docs/operations/SESSION_BRIDGE.md` · `docs/DOCUMENTATION_CONTINUITY.md` · `docs/architecture/REUSE_SSOT_MAP.md` · message `docs: encode BitRymDym autonomy and session handoff contract` · lokalny `HEAD`/`origin/main` = `fa5b7ca…` · **≠** nowy deploy claim | `git show fa5b7ca` · paths only | `fa5b7ca…` | Tip SSOT / deploy / NEXT → PROJECT_STATE (lag możliwy) · commit bridge refresh = osobne GO |
| 2026-10-27 | GO-5G-O | SESSION_BRIDGE tip reconcile → `d05aa4e` | EXECUTED | PARTIAL | Living snapshot O: tip `d05aa4e`; deploy `@ d462b22`; **HISTORY:** commit Q + push R → tip `db435ed` | Raporty O/Q/R · `git show db435ed` | `db435ed…` (Q) | Mixed WIP PS/CL = osobne GO |
| 2026-10-27 | GO-5G-M | Push jednego commita `d05aa4e` | EXECUTED | PASS | Push `origin/main` bez force; remote SHA potwierdzony (raport M) | Raport GO-5G-M · `ls-remote` / GitHub API w M | `d05aa4e…` | Deploy/alias re-verify = osobne GO |
| 2026-10-27 | GO-5G-J | Commit wyłącznie SESSION_BRIDGE | EXECUTED | PASS | Lokalny commit 1 pliku; message `docs: refresh session bridge snapshot` | `git show d05aa4e` · path only bridge | `d05aa4e…` | Push = GO-5G-M (done) |
| 2026-10-27 | GO-5G-H | SESSION_BRIDGE snapshot refresh §2/§2.1/§5 | EXECUTED | PARTIAL | HEAD/origin lokalnie `d462b22`; tip/deploy pointer → PROJECT_STATE; bez stage/commit/push then | Diff lokalny tylko `docs/operations/SESSION_BRIDGE.md`; raport GO-5G-H | later `d05aa4e…` (J) | Commit/push bridge = J/M (done) |
| 2026-10-27 | GO-5G-G | CHANGELOG wpis GO-5G-C | EXECUTED | PARTIAL | Dodano wpis tip `d462b22` / `dpl_7Xwqf…` / ALIAS VERIFIED; P-NEXT-06 zachowany; ≠ Product GREEN | Dirty `docs/CHANGELOG.md` + raport GO-5G-G | _(brak commita)_ | Commit CHANGELOG = osobne GO |
| 2026-10-27 | GO-5G-F | PROJECT_STATE §5 → §2 NEXT UNIT | EXECUTED | PASS | §5 zredukowany do pointera; STOP Owner; P-NEXT-06 ≠ product CLOSED | Dirty `docs/PROJECT_STATE.md` + raport GO-5G-F | _(brak commita)_ | Commit PROJECT_STATE = osobne GO |
| 2026-10-27 | GO-5G-C | PROJECT_STATE tip/deploy/alias reconcile | EXECUTED | PARTIAL | Living tip `d462b22` · `dpl_7Xwqf…` · DEPLOYMENT/ALIAS VERIFIED · ≠ PRODUCTION VERIFIED ≠ Product GREEN | Dirty `docs/PROJECT_STATE.md` + raporty GO-5G-B/C | _(brak commita)_ | Commit PROJECT_STATE = osobne GO |
| 2026-10-27 | P-NEXT-10A | Audyt blokera przed publikacją 06/08 | EXECUTED | PASS | Baza `03d889a` SAFE; D02 path potwierdzona | Raport 10A; `git show` triad; 1× plik D02 w `docs/phases/` | N/A (RO) | Czeka GO na P-NEXT-10B / push |
| 2026-10-27 | P-NEXT-10 | Commit+push allowlisty 06/08 | BLOCKED | BLOCKED | HEAD≠`2cc4cc1` (był już `03d889a`); zła nazwa D02 w briefie | Preflight P-NEXT-10; brak stage | — | Wznów tylko po GO z bazą `03d889a` |

**Licznik `EXECUTED` w tabeli:** 10 (limit 15). Wiersz `P-NEXT-10` ma `execution=BLOCKED` — **nie** liczy się do limitu. Archiwum starszych `EXECUTED`: [CHANGELOG.md](../CHANGELOG.md) → `### SESSION_BRIDGE archive`.

### 4.1 Limit i archiwizacja

- Maksymalnie **15** najnowszych wpisów `EXECUTED` w tabeli powyżej.
- Docelowe archiwum starszych wpisów: [CHANGELOG.md](../CHANGELOG.md) → sekcja `### SESSION_BRIDGE archive`.
- **GO-1 i bieżąca polityka:** `docs/CHANGELOG.md` jest poza zakresem wielu GO dokumentacyjnych i może mieć dirty WIP. **Nie edytuj CHANGELOG** w ramach GO-1 ani „przy okazji” rotacji bez **osobnego GO Ownera**.
- **Zakaz:** ciche usuwanie starszych wpisów `EXECUTED` bez zatwierdzonej procedury archiwizacji (osobne GO).
- **Przed** dopisaniem kolejnego `EXECUTED`: policz living `EXECUTED` w §4. Jeśli wynik ≥ 15 albo dopisanie przekroczyłoby 15 → **nie zapisuj** wiersza i **nie** kasuj historii.
- Wówczas obowiązkowy wynik dla agenta: **`HANDOFF BLOCKED`** — podaj: aktualny licznik, że limit = 15, że wymagane jest **osobne GO Ownera** na archiwizację §4 → CHANGELOG `### SESSION_BRIDGE archive`, oraz że **nie** wolno tworzyć alternatywnego handoffu / drugiego mastera / cichej rotacji.
- **Zakaz fałszywego sukcesu:** przy `HANDOFF BLOCKED` nie deklaruj „przekazanie sesji zakończone” / „handoff PASS”. Dozwolony jest raport w czacie ze statusem `HANDOFF BLOCKED` + faktami Git (status-only).

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

**Last-known deploy / alias (GO-5G-B; nie re-weryfikowane w A–D ani w tym GO bridge):**
- Vercel Production **`dpl_7XwqfE4jjXyTpPa3ozYMB4v4tro1`** · target **production** · **Ready** @ SHA **`d462b22…`** (nie aktualizuj do `fa5b7ca` / `db435ed` / `d05aa4e` bez dowodu nowego `dpl_*`)
- Aliasy: **`www.bitrymdym.pl`** · **`bitrymdym.pl`** · **`bitrymdym.vercel.app`** → that `dpl_*`
- **DEPLOYMENT VERIFIED** · **ALIAS VERIFIED** · **≠ PRODUCTION VERIFIED** · **≠ Product GREEN**
- Kanoniczne wiersze tip/deploy/NEXT → [PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c); ten bridge **nie** jest SSOT tipu.
- Lokalny tip operacyjny Git (ten bridge): **`fa5b7ca…`** (parent **`db435ed…`**) — docs-only A–D; push ≠ Product GREEN · **≠** living tip SSOT (→ PROJECT_STATE).

**Lokalne GO oczekujące (uzupełniaj ręcznie):**
- Path-scoped commit dirty docs (osobne GO / allowlista): `PROJECT_STATE` (P-NEXT-06+GO-5G-C+F) · pozostały WIP `CHANGELOG` (P-NEXT-06+GO-5G-G + whitespace; **≠** już wypchnięte archiwum `c7fbaf3`) — **bez** Sacred / reszty WIP.
- Path-scoped commit tego pliku (`SESSION_BRIDGE` tip refresh / continuity hardening / §2 snapshot ↔ HEAD) — osobne GO · **bez** `git add -A` · zachowaj dirty triggery §1/§6 jeśli nadal lokalne.
- Path-scoped commit reguły `.cursor/rules/bitrymdym-ssot-over-ecc.mdc` (frazy sesji + hardening) — osobne GO / allowlista; **nie** łączyć z Sacred.
- P-NEXT-10B (lub równoważne): allowlista 12 ścieżek 06/08 z D02 = `docs/phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md`; baza HEAD = aktualny tip (ancestor obejmuje **`c7fbaf3`** / `fa5b7ca` / …).
- **HISTORY (done):** push tipu `03d889a`→`d462b22` · reconcile tip/deploy/alias w PROJECT_STATE (GO-5G-C) · §5→§2 (GO-5G-F) · wpis CHANGELOG GO-5G-C (GO-5G-G, lokalny dirty) · commit+push SESSION_BRIDGE (J/M @ `d05aa4e`; Q/R @ `db435ed`) · kontrakt A–D @ **`fa5b7ca`** · **GO-SB-ARCHIVE** commit+push @ **`c7fbaf3`** (6× `EXECUTED` → CHANGELOG archive; living wtedy 10 `EXECUTED` + 1 `BLOCKED`).
- P-NEXT-06 tip/deploy era = HISTORY w PS/CHANGELOG — **≠** zamknięcie toru produktowego QT / OD-SC / Sample Catalog (**Implementation NOT AUTHORIZED**).
- NEXT UNIT produktu → PROJECT_STATE (**STOP — OWNER DECISION REQUIRED**); Implementation **nie** autoryzowana; nie mylić z GO dokumentacyjnymi powyżej.

---

## 6. Checklist po zadaniu / handoff sesji

**Trigger Cursor:** polecenie Ownera **„Kończymy sesję — przygotuj przekazanie pracy”** (lub równoważne zamknięcie) → wykonaj ten checklist i zaktualizuj ten plik zgodnie z rzeczywistym stanem (bez fikcji commit/push/test/deploy). Szczegóły fraz: reguła `.cursor/rules/bitrymdym-ssot-over-ecc.mdc` (Frazy sesji Cursor).

**Gate przed zapisem:** policz living `EXECUTED` (§4.1). Jeśli dopisanie wiersza nie jest możliwe → **`HANDOFF BLOCKED`** (patrz §4.1) i **STOP** dalszego zapisu §4. Nadal wolno zaktualizować §2 snapshot (status-only), o ile nie wymaga to naruszenia chronionego/mixed WIP poza allowlistą tego GO. Nie obchodź limitu nowym plikiem handoffu.

**Po istotnej jednostce pracy** (zanim nowa sesja przejmie zadanie) uzupełnij istniejące źródła — **nie** twórz drugiego master handoffu:

1. Cel i zakres zadania (ten GO / wiersz §4) — albo powód `HANDOFF BLOCKED`.
2. Stan początkowy vs aktualny (HEAD, staged, dirty obszary — status only; §2). Osobno: ukończone / częściowe / nieuruchomione / zablokowane.
3. Kluczowe decyzje i uzasadnienie (link do OD / DECISION_LOG, nie kopiuj).
4. Kanoniczne pliki / mechanizmy (link REUSE_SSOT_MAP + ścieżki).
5. Zmienione pliki + krótki opis (**tylko** diff allowlisty / ścieżki dozwolone do odczytu — Sacred/Studio chronione = status-only).
6. Testy: wykonane / wyniki / niewykonane — bez fikcji.
7. Ryzyka, regresje, otwarte pytania; niezacommitowany WIP = **PRESERVE** (nie czyść).
8. Potwierdzony Git: branch · HEAD · `origin/main` (last-known) · staging · ochrona WIP (Sacred + Studio chronione = status-only).
9. Następny krok + kryteria akceptacji + ograniczenia (**jeden** konkretny krok).
10. Operacje nadal wymagające osobnego GO Ownera.

**Weryfikacja własnego przekazania (obowiązkowa przed deklaracją sukcesu):**

1. Ponów `git status` / `git rev-parse HEAD` — porównaj z twierdzeniami w raporcie i w §2/§4.
2. Jeśli twierdzisz, że zapisano §4 / §2 — potwierdź, że diff allowlisty rzeczywiście zawiera te zmiany; inaczej **nie** deklaruj zapisu.
3. Lokalna edycja ≠ commit ≠ push ≠ deploy. Brak dowodu → `NOT VERIFIED` / nie rość PASS.
4. Przy `HANDOFF BLOCKED` raport czatu musi zawierać tę frazę + wymagane GO; to **nie** jest sukces handoffu plikowego.

**Skrót kontrolny:**

- [ ] Zakres = GO
- [ ] Gate limitu §4 wykonany (licznik znany)
- [ ] Dopisano wiersz §4 (`execution` + `verification` rozdzielone; bez fikcji) — **tylko jeśli limit < 15** albo po GO archiwizacji; inaczej status **`HANDOFF BLOCKED`**
- [ ] `git_sha` / `prod` tylko z dowodem
- [ ] Zaktualizowano §2 WIP snapshot (status only) **albo** udokumentowano dlaczego nie (np. brak GO / konflikt WIP)
- [ ] Jeśli dodanie kolejnego `EXECUTED` przekroczyłoby 15 → **nie kasuj**; **`HANDOFF BLOCKED`** + GO archiwizacji CHANGELOG
- [ ] Tip/deploy: aktualizuj **PROJECT_STATE**, nie ten plik (osobny zakres/GO); living Git tip w §2.1/§5 może być odświeżony w bridge bez kopiowania SSOT tipu
- [ ] Sacred / Studio chronione / dirty poza zakresem: nietknięte
- [ ] Raport uzgodniony z Git (weryfikacja powyżej)
- [ ] Commit / push — wg `AGENTS.md` (path-scoped); **ten plik sam nie jest zgodą**; deploy claim ≠ push docs

---

## 7. Related

- [DOCUMENTATION_CONTINUITY.md](../DOCUMENTATION_CONTINUITY.md)
- [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md)
- [PROJECT_STATE.md](../PROJECT_STATE.md)
- [CHANGELOG.md](../CHANGELOG.md) _(archiwum — edycja tylko po osobnym GO)_
- [ECC_CURSOR_WORKFLOW.md](./ECC_CURSOR_WORKFLOW.md)
