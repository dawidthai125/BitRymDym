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
| 2026-10-27T23:25:00+01:00 (Gates 0–3 archive, pomiar przed tym zapisem) | main | `bde3009` | 0 | ~166 | ~332 | pozostałe dirty — **nie** przypisuj do tego GO | path `M` PRESERVE | porcelain hash przed edycją `43c60883…`; `HEAD`=`origin/main`=`bde3009` (`ls-remote`); allowlista tego unitu: `SESSION_BRIDGE.md` + `CHANGELOG.md`; `PROJECT_STATE` nietknięty w micro-commit archiwum; tip SSOT = PROJECT_STATE |
| 2026-10-27T22:50:51+01:00 (Unit 2 closeout, pomiar przed tym zapisem) | main | `0449410` | 0 | 166 | 332 | pozostałe dirty — **nie** przypisuj do tego GO | path `M` PRESERVE | porcelain=498 poza allowlistą hash `bbd0660c…`; po zapisie ten plik + `CHANGELOG` `M` → porcelain=500 / unstaged 168; indeks pusty; `HEAD`=`origin/main`=`0449410` (`ls-remote`); `PROJECT_STATE` czysty (Unit 1 @ `0449410`, nie edytowany); tip SSOT = PROJECT_STATE |
| 2026-10-27T22:21:09+01:00 (HISTORY · session close) | main | `92a1262` | 0 | 168 | 332 | pozostałe dirty — **nie** przypisuj do tego GO | path `M` PRESERVE | HISTORY snapshot przed tipem `0449410` (łańcuch: `92a1262` · `332336c` · `a1b84f6` · `0449410`) |
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

Kontrola `2026-10-27T23:05+01:00` (`git rev-parse HEAD`; `git ls-remote origin refs/heads/main`; GitHub Deployments API; **bez** `vercel inspect`):

| Źródło | Wartość | Uwaga |
|--------|---------|--------|
| Lokalny `HEAD` | `77343b6151fbc87bd113b369abb8564e223f897f` | `docs: publish P-NEXT-06/08 QT labels and OD-SC pointers`; parent **`f5b3515…`** |
| Lokalny `origin/main` | `77343b6151fbc87bd113b369abb8564e223f897f` | `0/0` vs `HEAD` · serwer potwierdzony `ls-remote` w P-NEXT-10B |
| Opublikowany tip `main` | `77343b6…` | P-NEXT-10B 06/08 · **≠** SSOT tip (→ PROJECT_STATE) · **≠** PRODUCTION VERIFIED |
| Living tip / deploy / NEXT | → [PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c) | **SSOT tip/deploy/NEXT = PS** (ten bridge **nie** zastępuje) · living zapis w PS = Unit 1 (`a1b84f6…` / `7371104561`; plik **nie** edytowany tutaj — unik pętli tip=ten commit) · **żywy Git wygrywa:** `77343b6…` · GitHub Production **`7371560902`** **success** `2026-10-27T22:05:04Z` @ **`77343b6…`** · status commita Vercel **success** · host `bitrymdym-r3m22qy0g-…vercel.app` · `dpl_*` tego SHA **NOT VERIFIED** · alias `www` → ten deployment **NOT VERIFIED** · runtime SHA **NOT VERIFIED** · historyczny `dpl_7XwqfE4jjXyTpPa3ozYMB4v4tro1` @ **`d462b22…`** **nie** przenoszony · **≠ PRODUCTION VERIFIED ≠ Product GREEN** |
| Docs continuity (worktree) | P-NEXT-10B closeout | Ten zapis edytuje `SESSION_BRIDGE.md` (§4 wiersz + §2.1/§5) · `PROJECT_STATE` / `CHANGELOG` nietknięte |

**HISTORY (bridge tip table, `2026-10-27T22:21+01:00`):** HEAD/`origin` last-known `92a1262…` · GitHub Production **`7370676473`** success @ ten SHA · alias wtedy **NOT VERIFIED** — **superseded** tipem `0449410…` (po drodze `332336c` · `a1b84f6` / `7371104561`).
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
| 2026-10-27 | GO-SB-ARCHIVE-3 | Archiwizacja §4 → CHANGELOG (room for Gates 0–3) | EXECUTED | PASS | Przeniesiono 6 najstarszych `EXECUTED` (`KONTRAKT A–D` · `GO-5G-O` · `GO-5G-M` · `GO-5G-J` · `GO-5G-H` · `GO-5G-G`) → [CHANGELOG.md](../CHANGELOG.md) `### SESSION_BRIDGE archive`. Living `EXECUTED` 14→8, po tym wierszu **9**. `P-NEXT-10` BLOCKED zachowany. `PROJECT_STATE` nietknięty. Path-scoped commit+push allowlisty most+CHANGELOG | `git status` przed `43c60883…` · `HEAD`=`bde3009` (`ls-remote`) | _(ten commit)_ | Gate 0 alias/`dpl_*` best-effort, potem SFM RO · Contabo RO · Implementation Catalog |
| 2026-10-27 | S13-RO | Sample Catalog §13 Storage/allowlist read-only | EXECUTED | PARTIAL | Audyt RO: repo + SELECT prod. §13 policies/runtime allowlista **zostają NOT VERIFIED**. Implementation **NOT AUTHORIZED**. `PROJECT_STATE` NEXT/STOP nietknięty. Commit+push `64e7ff3` audit + CHANGELOG. Host/deploy tego SHA = po pushu | `git show 64e7ff3` (2 paths) · MCP SELECT buckets/policies/prefix counts | `64e7ff3…` | Implementation Catalog = osobne GO. Alias/`dpl_*` = osobne GO |
| 2026-10-27 | P-NEXT-10B | Commit+push allowlisty 06/08 (D02 kanoniczna) | EXECUTED | PARTIAL | Path-scoped commit+push 10 dirty ścieżek 06/08 (z 12). `PROJECT_STATE` + `CHANGELOG` już CLEAN na `main` (Unit 1 / archiwum). D02 = `docs/phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md`. HEAD/`origin/main` = `77343b6…` (`ls-remote`). GitHub Production `7371560902` success `2026-10-27T22:05:04Z` @ ten SHA; Vercel commit status success; host `bitrymdym-r3m22qy0g-…vercel.app`. `dpl_*` / alias www / runtime SHA **NOT VERIFIED**. `PROJECT_STATE` nietknięty. Sacred / Studio / `SYSTEM_ARCHITECTURE` status-only PRESERVE. P-NEXT-10 BLOCKED zachowany jako historia | `git show 77343b6` (10 paths) · `ls-remote` `77343b6` · GitHub deployment `7371560902` | `77343b6…` | Alias / `dpl_*` = osobne GO. Produkt NEXT = osobny gate (nie Implementation Catalog) |
| 2026-10-27 | UNIT-2 | Closeout SESSION_BRIDGE: archiwum §4 + tip snapshot | EXECUTED | PARTIAL | Zarchiwizowano 3 najstarsze `EXECUTED` (`GO-5G-F` · `GO-5G-C` · `P-NEXT-10A`) → [CHANGELOG.md](../CHANGELOG.md) `### SESSION_BRIDGE archive`. Living `EXECUTED` 14→11, po tym wierszu **12**. `P-NEXT-10` BLOCKED zachowany. §2/§2.1/§5 → living Git `0449410…` (`ls-remote` zgodny). GitHub Production `7371268857` success `2026-10-27T21:49:06Z` @ ten SHA; Vercel commit status success; host `bitrymdym-absxk3egj-…vercel.app`. `dpl_*` / alias www / runtime SHA **NOT VERIFIED**. `PROJECT_STATE` nietknięty (Unit 1). Path-scoped commit+push allowlisty w tym unicie | `git rev-parse`/`ls-remote` `0449410` · GitHub deployment `7371268857` · hash porcelain poza allowlistą `bbd0660c…` | `0449410…` (tip przed tym commitem) | Po pushu nowy SHA ≠ SSOT PS. Alias / `dpl_*` = osobne GO. Produkt = STOP |
| 2026-10-27 | GO-TEAM-CLOSE | Audyt zespołu, smoke RO, reguła, commit, handoff | EXECUTED | PARTIAL | Faza 0 bez edycji. Etap 1: `security-auditor`, hash porcelain przed=po `18b4bc34…`, indeks pusty; read-only jest prośbą, blokada zapisu **NOT VERIFIED**. Etap 2: sekcja Zespół Cursor w `.cursor/rules/bitrymdym-ssot-over-ecc.mdc`. Commit+push jednego pliku `92a1262` `chore(cursor): establish autonomous team workflow`, rodzic `2d872e5`, `ls-remote` zgodny. GitHub Production `7370676473` success @ ten SHA; Vercel commit status success; `dpl_*` NOT READ; alias www i runtime SHA **NOT VERIFIED**. `PROJECT_STATE` / `CHANGELOG` / Sacred / Studio nietknięte. Ten zapis mostu bez kolejnego commit/push | `git show 92a1262` (1 ścieżka) · `ls-remote` `92a1262` · GitHub deployment `7370676473` · hash porcelain `18b4bc34…` | `92a1262…` | Commit tego pliku = osobne GO. Alias / `dpl_*` = osobne GO. Produkt = STOP |
| 2026-10-27 | GO-SESSION-CLOSE | Commit ciągłości, odczyt produkcji, handoff | EXECUTED | PARTIAL | Path-scoped commit+push `7897037` `fix(docs): harden session continuity`: reguła fraz sesji oraz dwie linijki §6 (bramka `HANDOFF BLOCKED`, checklist tip/deploy). Reszta tego pliku została poza commitem. Odczyt produkcji: GitHub Deployment `7369350599` Production `success` @ ten SHA; status Vercel `success`; www HTTPS 200 tytuł BitRymDym. Alias www i runtime SHA **NOT VERIFIED**. Bez edycji `PROJECT_STATE` / `CHANGELOG` / Sacred / Studio. Ten zapis handoffu bez kolejnego commit/push/deploy | `git ls-remote` `7897037` · `git show 7897037` (2 ścieżki) · GitHub API deployment `7369350599` · curl www 200 | `7897037…` | Commit pozostałego dirty mostu = osobne GO. Alias / `dpl_*` = osobne GO. Produkt = STOP |
| 2026-10-27 | CONTINUITY-RELIABILITY | Straż cyklu sesji: reguła = triggery, procedura = most | EXECUTED | PARTIAL | Skrócono frazy w `.cursor/rules/bitrymdym-ssot-over-ecc.mdc` do triggerów i straż `HANDOFF BLOCKED` (bez edycji CHANGELOG/PROJECT_STATE; §2 mostu nadal wolno). W §6 tego pliku usunięto nakaz aktualizacji PROJECT_STATE przy każdym handoffie. Testy: T1 PASS (subagent bez historii czatu) · T2 PASS · T3 PASS · T4 PASS na fixturze 15→`HANDOFF BLOCKED` (living tabela nienaruszona, licznik 12 po tym wierszu) · T5 PASS po korekcie snapshotu 502/170 · T6 NOT RUN (brak nowej rozmowy Ownera) · T7 PASS na tym samym subagencie (jeden krok: GO; implementacji nie zaczął). Bez commit/push/deploy | `git status` porcelain=502 staged=0 · `git rev-parse` `8b4235a` · `git ls-remote` ten sam SHA · parser §4 | _(brak commita)_ | Path-scoped commit reguły da się odseparować. Ten plik łączy COLD-START-CLOSE i ten pass — bez `git add -p`. Produkt = STOP |
| 2026-10-27 | COLD-START-CLOSE | Cold-start „Kontynuuj projekt” + handoff sesji | EXECUTED | PARTIAL | Cold-start bez nowego zadania. `HEAD`=`origin/main`=`8b4235a…` (`ls-remote`). Odświeżono §2/§2.1/§4/§5 tego pliku. Pomiar przed zapisem: porcelain=500 / unstaged 168. Po zapisie ten plik jest `M`, więc porcelain=501 / unstaged 169. `PROJECT_STATE` / `CHANGELOG` / Sacred / Studio / `SYSTEM_ARCHITECTURE` nietknięte. Bez commit/push/deploy. Deploy po `d462b22` **NOT VERIFIED** | `git rev-parse` · `git ls-remote` · `git status` | _(brak commita)_ | Zapis jest lokalny dirty. Path-scoped commit tego pliku = osobne GO. Produkt = STOP |
| 2026-10-27 | GO-SB-ARCHIVE | Archiwizacja §4 → CHANGELOG `### SESSION_BRIDGE archive` | EXECUTED | PASS | Przeniesiono 6 najstarszych `EXECUTED` (SESSION_BRIDGE gap audit · AUTONOMY READINESS · GO-3b · GO-3 · GO-2 · GO-1) do [CHANGELOG.md](../CHANGELOG.md) `### SESSION_BRIDGE archive` · `BLOCKED` `P-NEXT-10` zachowany w living · **bez** commit/push | Diff allowlista: `SESSION_BRIDGE.md` + `CHANGELOG.md` | _(brak commita)_ | Path-scoped commit obu plików = osobne GO |
| 2026-10-27 | P-NEXT-10 | Commit+push allowlisty 06/08 | BLOCKED | BLOCKED | HEAD≠`2cc4cc1` (był już `03d889a`); zła nazwa D02 w briefie | Preflight P-NEXT-10; brak stage | — | Wznów tylko po GO z bazą `03d889a` |

**Licznik `EXECUTED` w tabeli:** 9 (limit 15). Wiersz `P-NEXT-10` ma `execution=BLOCKED` — **nie** liczy się do limitu. Archiwum starszych `EXECUTED` (Unit 2: `GO-5G-F` · `GO-5G-C` · `P-NEXT-10A`; third batch: `KONTRAKT A–D` · `GO-5G-O` · `GO-5G-M` · `GO-5G-J` · `GO-5G-H` · `GO-5G-G`): [CHANGELOG.md](../CHANGELOG.md) → `### SESSION_BRIDGE archive`.

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

**Last-known deploy / alias (odczyt `2026-10-27T23:05+01:00`; bez `vercel inspect`):**
- GitHub Production deployment **`7371560902`** · **success** · `2026-10-27T22:05:04Z` @ **`77343b6…`** · status commita Vercel **success** · host deploymentu `bitrymdym-r3m22qy0g-…vercel.app`
- `dpl_*` dla `77343b6` **NOT VERIFIED** · alias **`www.bitrymdym.pl`** → ten deployment **NOT VERIFIED** · runtime SHA **NOT VERIFIED**
- Historyczny `dpl_7XwqfE4jjXyTpPa3ozYMB4v4tro1` @ **`d462b22…`** (GO-5G-B) **nie** jest dowodem aliasu dla `77343b6`
- HISTORY deploy `7371268857` @ `0449410…` · `7371355221` @ `f5b3515…` · `7371104561` @ `a1b84f6…` — **superseded** living Git `77343b6…`
- **DEPLOYMENT success ≠ PRODUCTION VERIFIED ≠ Product GREEN**
- Kanoniczne wiersze tip/deploy/NEXT → [PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c); ten bridge **nie** jest SSOT tipu.
- Lokalny tip operacyjny Git (ten bridge): **`77343b6…`** (parent **`f5b3515…`**) — `ls-remote` zgodny · **≠** living tip SSOT (PROJECT_STATE Unit 1 nadal `a1b84f6…` / `7371104561`, plik nieedytowany)

**Lokalne GO oczekujące (uzupełniaj ręcznie):**
- Path-scoped commit dirty docs poza P-NEXT-10B — **bez** Sacred / reszty WIP. `PROJECT_STATE` nietknięty (pętla tip).
- **HISTORY (done):** P-NEXT-10B allowlista 06/08 @ **`77343b6`** (10 dirty + 2 już CLEAN: PS/CHANGELOG; D02 kanoniczna). Push tipu `03d889a`→`d462b22` · reconcile tip/deploy/alias w PROJECT_STATE (GO-5G-C) · §5→§2 (GO-5G-F) · wpis CHANGELOG GO-5G-C (GO-5G-G) · commit+push SESSION_BRIDGE (J/M @ `d05aa4e`; Q/R @ `db435ed`) · kontrakt A–D @ **`fa5b7ca`** · reconcile mostu @ **`1c2abd2`** · **GO-SB-ARCHIVE** commit+push @ **`c7fbaf3`** · continuity hardening reguły @ **`8b4235a`** · procedura §6 + reguła fraz commit+push @ **`7897037`** · domknięcie mostu @ **`2d872e5`** · reguła zespołu Cursor @ **`92a1262`** · Unit 1 tip/deploy reconcile @ **`0449410`** · Unit 2 closeout @ **`f5b3515`**.
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
