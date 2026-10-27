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
| 2026-10-27T22:21:09+01:00 (session close, pomiar przed tym zapisem) | main | `92a1262` | 0 | 168 | 332 | pozostałe dirty — **nie** przypisuj do tego GO | path `M` PRESERVE | porcelain=500 hash `18b4bc34…` przed zapisem; po zapisie ten plik `M` → porcelain=501 / unstaged 169; indeks pusty; reguła zespołu czysta (jest w `92a1262`); `HEAD`=`origin/main`=`92a1262` (`ls-remote`); dirty mixed: `PROJECT_STATE` · `CHANGELOG` · Studio/`SYSTEM_ARCHITECTURE` status-only; tip SSOT = PROJECT_STATE (nie edytowany) |
| 2026-10-27T21:25:48+01:00 (HISTORY · session close) | main | `7897037` | 0 | 169 | 332 | docs≈188 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `92a1262` (łańcuch: `2d872e5` · `92a1262`) |
| 2026-10-27T20:12:12+01:00 (HISTORY · reliability pass) | main | `8b4235a` | 0 | 170 | 332 | docs≈188 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `7897037` |
| 2026-10-27T14:17:35+01:00 (HISTORY · post A–D snapshot) | main | `fa5b7ca` | 0 | ~168 | ~332 | docs≈186 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `8b4235a` (już na `main`: `1c2abd2` · `c7fbaf3` · `8b4235a`) |
| 2026-10-27T13:57:00+01:00 (HISTORY · kontrakt A–D pre-commit) | main | `db435ed` | 0 | ~168 | ~332 | docs≈186 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `fa5b7ca` (A–D commit); tip then GO-5G-Q/R |
| 2026-10-27T11:20:30+01:00 (HISTORY · GO-5G-O tip reconcile) | main | `d05aa4e` | 0 | ~168 | ~332 | docs≈186 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `db435ed` (commit Q / push R) |
| 2026-10-27T10:45:56+01:00 (HISTORY · GO-5G-H refresh) | main | `d462b22` | 0 | ~168 | ~332 | docs≈186 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `d05aa4e` (parent bridge commit `d462b22`) |
| 2026-10-27T09:49:43+01:00 (HISTORY · gap fill) | main | `03d889a` | 0 | ~169 | ~332 | docs≈187 · … | path `M` PRESERVE | HISTORY snapshot przed pushem tipu `d462b22` |

**Sacred WIP (path-only):** `src/lib/takes/recording-eligibility-service.ts`
— nigdy nie czytaj / nie wyszukuj / nie diffuj / nie haszuj / nie przekazuj subagentom (`AGENTS.md`). W tabeli: tylko obecność w `git status`, bez treści.

### 2.1 Tip / deploy — ostatni znany stan (datowany; tip SSOT = PROJECT_STATE)

Kontrola `2026-10-27T22:21+01:00` (`git ls-remote origin refs/heads/main`; **bez** `vercel inspect`):

| Źródło | Wartość | Uwaga |
|--------|---------|--------|
| Lokalny `HEAD` | `92a12622fc2b756a5f97137f8ffa91bb32b3e252` | `chore(cursor): establish autonomous team workflow`; parent **`2d872e5…`** |
| Lokalny `origin/main` | `92a12622fc2b756a5f97137f8ffa91bb32b3e252` | `0/0` vs `HEAD` · serwer potwierdzony `ls-remote` w tym handoffie |
| Opublikowany tip `main` | `92a1262…` | reguła zespołu Cursor · **≠** SSOT tip (→ PROJECT_STATE) · **≠** PRODUCTION VERIFIED |
| Living tip / deploy / NEXT | → [PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c) | **SSOT tip/deploy/NEXT = PS** (ten bridge **nie** zastępuje) · living zapis w PS nadal **`d462b22…`** (plik dirty, **nie** edytowany tutaj) · GitHub Production deployment **`7370676473`** **success** `2026-10-27T21:18:30Z` @ **`92a1262…`** · status commita Vercel **success** · host `bitrymdym-flq2dmvom-…vercel.app` · `dpl_*` tego SHA **NOT READ** · alias `www` → ten deployment **NOT VERIFIED** · runtime SHA **NOT VERIFIED** · historyczny `dpl_7XwqfE4jjXyTpPa3ozYMB4v4tro1` @ **`d462b22…`** **nie** przenoszony na `92a1262` · **≠ PRODUCTION VERIFIED ≠ Product GREEN** |
| Docs continuity (worktree) | GO-5G-C / F / G dirty | PS + CHANGELOG nadal dirty (mixed); commit tych plików = **osobne GO**; ten handoff edytuje tylko `SESSION_BRIDGE.md` |

**HISTORY (bridge tip table, `2026-10-27T21:25+01:00`):** HEAD/`origin` last-known `7897037…` · GitHub Production **`7369350599`** success @ ten SHA · alias wtedy **NOT VERIFIED** — **superseded** tipem `92a1262…` (po drodze `2d872e5`, deployment **`7369738523`** success, alias też **NOT VERIFIED**).

**HISTORY (bridge tip table, `2026-10-27T14:17+01:00`):** HEAD/`origin` last-known `fa5b7ca…` — **superseded** tipem `8b4235a…` (łańcuch już na `main`: `1c2abd2` · `c7fbaf3` · `8b4235a`).  
**HISTORY (kontrakt A–D tip table, `2026-10-27T13:57+01:00`):** HEAD/`origin` = `db435ed…` — **superseded** tipem `fa5b7ca…` (A–D), potem `8b4235a…`.  
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
| 2026-10-27 | GO-TEAM-CLOSE | Audyt zespołu, smoke RO, reguła, commit, handoff | EXECUTED | PARTIAL | Faza 0 bez edycji. Etap 1: `security-auditor`, hash porcelain przed=po `18b4bc34…`, indeks pusty; read-only jest prośbą, blokada zapisu **NOT VERIFIED**. Etap 2: sekcja Zespół Cursor w `.cursor/rules/bitrymdym-ssot-over-ecc.mdc`. Commit+push jednego pliku `92a1262` `chore(cursor): establish autonomous team workflow`, rodzic `2d872e5`, `ls-remote` zgodny. GitHub Production `7370676473` success @ ten SHA; status Vercel success; `dpl_*` NOT READ; alias www i runtime SHA **NOT VERIFIED**. `PROJECT_STATE` / `CHANGELOG` / Sacred / Studio nietknięte. Ten zapis mostu bez kolejnego commit/push | `git show 92a1262` (1 ścieżka) · `ls-remote` `92a1262` · GitHub deployment `7370676473` · hash porcelain `18b4bc34…` | `92a1262…` | Commit tego pliku = osobne GO. Alias / `dpl_*` = osobne GO. Produkt = STOP |
| 2026-10-27 | GO-SESSION-CLOSE | Commit ciągłości, odczyt produkcji, handoff | EXECUTED | PARTIAL | Path-scoped commit+push `7897037` `fix(docs): harden session continuity`: reguła fraz sesji oraz dwie linijki §6 (bramka `HANDOFF BLOCKED`, checklist tip/deploy). Reszta tego pliku została poza commitem. Odczyt produkcji: GitHub Deployment `7369350599` Production `success` @ ten SHA; status Vercel `success`; www HTTPS 200 tytuł BitRymDym. Alias www i runtime SHA **NOT VERIFIED**. Bez edycji `PROJECT_STATE` / `CHANGELOG` / Sacred / Studio. Ten zapis handoffu bez kolejnego commit/push/deploy | `git ls-remote` `7897037` · `git show 7897037` (2 ścieżki) · GitHub API deployment `7369350599` · curl www 200 | `7897037…` | Commit pozostałego dirty mostu = osobne GO. Alias / `dpl_*` = osobne GO. Produkt = STOP |
| 2026-10-27 | CONTINUITY-RELIABILITY | Straż cyklu sesji: reguła = triggery, procedura = most | EXECUTED | PARTIAL | Skrócono frazy w `.cursor/rules/bitrymdym-ssot-over-ecc.mdc` do triggerów i straż `HANDOFF BLOCKED` (bez edycji CHANGELOG/PROJECT_STATE; §2 mostu nadal wolno). W §6 tego pliku usunięto nakaz aktualizacji PROJECT_STATE przy każdym handoffie. Testy: T1 PASS (subagent bez historii czatu) · T2 PASS · T3 PASS · T4 PASS na fixturze 15→`HANDOFF BLOCKED` (living tabela nienaruszona, licznik 12 po tym wierszu) · T5 PASS po korekcie snapshotu 502/170 · T6 NOT RUN (brak nowej rozmowy Ownera) · T7 PASS na tym samym subagencie (jeden krok: GO; implementacji nie zaczął). Bez commit/push/deploy | `git status` porcelain=502 staged=0 · `git rev-parse` `8b4235a` · `git ls-remote` ten sam SHA · parser §4 | _(brak commita)_ | Path-scoped commit reguły da się odseparować. Ten plik łączy COLD-START-CLOSE i ten pass — bez `git add -p`. Produkt = STOP |
| 2026-10-27 | COLD-START-CLOSE | Cold-start „Kontynuuj projekt” + handoff sesji | EXECUTED | PARTIAL | Cold-start bez nowego zadania. `HEAD`=`origin/main`=`8b4235a…` (`ls-remote`). Odświeżono §2/§2.1/§4/§5 tego pliku. Pomiar przed zapisem: porcelain=500 / unstaged 168. Po zapisie ten plik jest `M`, więc porcelain=501 / unstaged 169. `PROJECT_STATE` / `CHANGELOG` / Sacred / Studio / `SYSTEM_ARCHITECTURE` nietknięte. Bez commit/push/deploy. Deploy po `d462b22` **NOT VERIFIED** | `git rev-parse` · `git ls-remote` · `git status` | _(brak commita)_ | Zapis jest lokalny dirty. Path-scoped commit tego pliku = osobne GO. Produkt = STOP |
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

**Licznik `EXECUTED` w tabeli:** 14 (limit 15). Wiersz `P-NEXT-10` ma `execution=BLOCKED` — **nie** liczy się do limitu. Archiwum starszych `EXECUTED`: [CHANGELOG.md](../CHANGELOG.md) → `### SESSION_BRIDGE archive`.

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

**Last-known deploy / alias (odczyt `2026-10-27T22:21+01:00`; bez `vercel inspect`):**
- GitHub Production deployment **`7370676473`** · **success** · `2026-10-27T21:18:30Z` @ **`92a1262…`** · status commita Vercel **success** · host deploymentu `bitrymdym-flq2dmvom-…vercel.app`
- `dpl_*` dla `92a1262` **NOT READ** · alias **`www.bitrymdym.pl`** → ten deployment **NOT VERIFIED** · runtime SHA **NOT VERIFIED**
- Historyczny `dpl_7XwqfE4jjXyTpPa3ozYMB4v4tro1` @ **`d462b22…`** (GO-5G-B) **nie** jest dowodem aliasu dla `92a1262`
- **DEPLOYMENT success ≠ PRODUCTION VERIFIED ≠ Product GREEN**
- Kanoniczne wiersze tip/deploy/NEXT → [PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c); ten bridge **nie** jest SSOT tipu.
- Lokalny tip operacyjny Git (ten bridge): **`92a1262…`** (parent **`2d872e5…`**) — `ls-remote` zgodny · **≠** living tip SSOT (PROJECT_STATE nadal `d462b22…`, plik nieedytowany)

**Lokalne GO oczekujące (uzupełniaj ręcznie):**
- Path-scoped commit dirty docs (osobne GO / allowlista): `PROJECT_STATE` (P-NEXT-06+GO-5G-C+F) · pozostały WIP `CHANGELOG` (P-NEXT-06+GO-5G-G + whitespace; **≠** już wypchnięte archiwum `c7fbaf3`) — **bez** Sacred / reszty WIP.
- Path-scoped commit tego pliku (snapshot §2/§2.1, wiersz `GO-TEAM-CLOSE`, §5) — osobne GO · **bez** `git add -A`. Reguła zespołu jest już na `main` @ **`92a1262`**.
- P-NEXT-10B (lub równoważne): allowlista 12 ścieżek 06/08 z D02 = `docs/phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md`; baza HEAD = aktualny tip (ancestor obejmuje **`92a1262`** / `2d872e5` / `8b4235a` / `c7fbaf3` / `fa5b7ca` / …).
- **HISTORY (done):** push tipu `03d889a`→`d462b22` · reconcile tip/deploy/alias w PROJECT_STATE (GO-5G-C) · §5→§2 (GO-5G-F) · wpis CHANGELOG GO-5G-C (GO-5G-G, lokalny dirty) · commit+push SESSION_BRIDGE (J/M @ `d05aa4e`; Q/R @ `db435ed`) · kontrakt A–D @ **`fa5b7ca`** · reconcile mostu @ **`1c2abd2`** · **GO-SB-ARCHIVE** commit+push @ **`c7fbaf3`** · continuity hardening reguły @ **`8b4235a`** · procedura §6 + reguła fraz commit+push @ **`7897037`** · domknięcie mostu @ **`2d872e5`** · reguła zespołu Cursor commit+push @ **`92a1262`**.
- P-NEXT-06 tip/deploy era = HISTORY w PS/CHANGELOG — **≠** zamknięcie toru produktowego QT / OD-SC / Sample Catalog (**Implementation NOT AUTHORIZED**).
- NEXT UNIT produktu → PROJECT_STATE (**STOP — OWNER DECISION REQUIRED**); Implementation **nie** autoryzowana; nie mylić z GO dokumentacyjnymi powyżej.

---

## 6. Checklist po zadaniu / handoff sesji

**Trigger Cursor:** polecenie Ownera **„Kończymy sesję — przygotuj przekazanie pracy”** (lub równoważne zamknięcie) → wykonaj ten checklist i zaktualizuj ten plik zgodnie z rzeczywistym stanem (bez fikcji commit/push/test/deploy). Szczegóły fraz: reguła `.cursor/rules/bitrymdym-ssot-over-ecc.mdc` (Frazy sesji Cursor).

**Gate przed zapisem:** policz living `EXECUTED` (§4.1). Jeśli dopisanie wiersza nie jest możliwe → **`HANDOFF BLOCKED`** (patrz §4.1) i **STOP** dalszego zapisu §4. Nie edytuj wtedy `CHANGELOG.md` ani `PROJECT_STATE.md`. To koniec frazy, nie pętla: raport w czacie nie jest sukcesem zapisu, a następna sesja czyta ten sam licznik. Nadal wolno zaktualizować §2 snapshot (status-only), o ile ten plik nie niesie obcego WIP i zapis nie rusza chronionego/mixed WIP. Nie obchodź limitu nowym plikiem handoffu.

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
- [ ] Tip/deploy: **nie** edytuj `PROJECT_STATE` ani `CHANGELOG` bez osobnego GO (mixed = cały plik). Living tip/deploy/NEXT zostaje w PROJECT_STATE §2. Operacyjny SHA Gita wolno zapisać w §2.1/§5 tego pliku, bez uznania tego za SSOT tipu i bez claimu nowego `dpl_*`
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
