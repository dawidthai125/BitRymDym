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
| 2026-10-28T00:12:00+01:00 (catalog content sniff, pomiar przed commit) | main | `fac551a` | 0 | ~166 | ~332 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | `HEAD`=`origin/main`=`fac551a` (`ls-remote`); allowlista: audio-validation + catalog-originals + backup re-export + copy route + docs; Sacred/Studio PRESERVE |
| 2026-10-28T00:10:00+01:00 (catalog live probe, pomiar przed docs commit) | main | `6f3a728` | 0 | ~166 | ~332 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | `HEAD`=`origin/main`=`6f3a728` (`ls-remote`); porcelain 488 hash `cbc18f20…`; allowlista: probe audit + apply NEXT + CHANGELOG + PS + bridge; Sacred/Studio PRESERVE |
| 2026-10-27T23:57:00+01:00 (catalog prod apply, pomiar przed docs commit) | main | `0af0dc3` | 0 | ~166 | ~332 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | `HEAD`=`origin/main`=`0af0dc3` (`ls-remote`); allowlista: apply audit + CHANGELOG + PS + bridge + gates + kontrakt §13 + REUSE; Sacred/Studio PRESERVE |
| 2026-10-27T23:50:00+01:00 (Gates A/B/C, pomiar przed docs commit) | main | `5a6bc55` | 0 | ~166 | ~332 | catalog already committed; remaining dirty — **nie** przypisuj | path `M` PRESERVE | porcelain hash przed docs `e0f4456f…` (pre-catalog); catalog commit `5a6bc55`; allowlista docs: audit+CHANGELOG+PS+bridge; Sacred/Studio PRESERVE |
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

Kontrola `2026-10-28T00:12+01:00` (`git rev-parse HEAD`; `ls-remote`; **bez** `vercel inspect` / OAuth):

| Źródło | Wartość | Uwaga |
|--------|---------|--------|
| Lokalny `HEAD` (pre-this-commit) | `fac551a` | `docs: record catalog originals controlled live storage probe` = `origin/main` |
| Last independently verified deploy | `5200c6da5813f0a446393b3ce79e9f03478f9bbd` | GitHub Production **`7372230897`** **success** `2026-10-27T22:42:24Z` (pre-this-commit) |
| Living tip / deploy / NEXT | → [PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c) | **SSOT tip/deploy/NEXT = PS** · catalog schema **APPLIED** `20261027225553` · live probe **PASS** · content sniff **SHIPPED in repo** · **≠ PRODUCTION VERIFIED ≠ Product GREEN** |
| Docs continuity (worktree) | Catalog OD-SC-02 content sniff | Ten zapis edytuje most + CHANGELOG + PS + gates + kontrakt §13 |

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
| 2026-10-28 | CAT-SNIFF | Catalog originals OD-SC-02 content sniff | EXECUTED | PASS | Usunięto `CATALOG_CONTENT_GATE_NOT_IMPLEMENTED`. `sniffAudioContainer` + `validateCatalogOriginalContentSniff` w `audio-validation.ts`. Spoof/empty/unsupported → `CATALOG_CONTENT_*` 415. Sniff PASS → `COPY_NOT_IMPLEMENTED` · **zero writes**. Vitest **36/36**. Scratch **OUT**. ≠ Product GREEN. | vitest catalog-originals + audio-validation + backup-manifest · eslint · tsc | _(ten commit)_ | NEXT: copy E2E (test USER) **albo** Scratch |
| 2026-10-28 | CAT-PROBE | Catalog originals live Storage probe | EXECUTED | PASS | service_role upload/list/download/delete `catalog/8c288da2-9017-415e-b715-64e65d4a35e9/original.bin` **PASS** (16044 B WAV). Anon **DENIED**. Cleanup leftover **0** / `catalog_assets` **0**. Copy API **NOT RUN**. Scratch **OUT**. ≠ Product GREEN. | Node probe + host-guard · MCP leftover SELECT · [audit](../audits/CATALOG_ORIGINALS_LIVE_STORAGE_PROBE_2026-10-28.md) | _(ten commit)_ | NEXT: content sniff / copy E2E / Scratch — sniff **done** |
| 2026-10-27 | CAT-APPLY | Catalog originals prod apply | EXECUTED | PASS | MCP `apply_migration` **PASS**. History **`20261027225553` / `catalog_originals_storage_and_entity`** (drift vs repo `20261027220000` — nie repair). Read-back: `catalog_assets` RLS ON+FORCE · 4 Storage `catalog_originals_service_*` · grants SIDU service_role / deny client. Vitest **19/19**. Live probe **BLOCKED**. Scratch **OUT**. ≠ Product GREEN. | MCP list/apply/execute_sql · [audit](../audits/CATALOG_ORIGINALS_PROD_APPLY_2026-10-27.md) · vitest catalog+audio-validation | `6f3a728…` | NEXT: controlled live probe GO — **done** CAT-PROBE |
| 2026-10-27 | GATE-C | Catalog copy fail-closed (repo) | EXECUTED | PASS | Planner: unknown policies/prod → `CATALOG_STORAGE_POLICIES_UNAVAILABLE` · unpublished/unlicensed → `CATALOG_ASSET_NOT_COPYABLE` · content sniff fail-closed · dest key nie wymyślany · zero writes. Route 503/409/501 · `requireUser` · JSON 400. Vitest **19/19**. Prod apply **BLOCKED**. Scratch **OUT**. | `git show 5a6bc55` · vitest catalog-originals + audio-validation | `5a6bc55…` | Owner GO: prod apply `20261027220000` (checklist) **albo** content sniff |
| 2026-10-27 | GATE-B | alias / `dpl_*` @ `5200c6d` (bez OAuth) | EXECUTED | PARTIAL | Tip `5200c6d…` (`ls-remote` then). GitHub Production **`7372230897`** **success** `2026-10-27T22:42:24Z` @ ten SHA · Vercel **success** · unique URL `bitrymdym-j1sp78uxs-…` **302 SSO** · dashboard `…/8KYY2axTYMN4CKzsxEteqy857k5R`. **`dpl_*` NOT VERIFIED**. **ALIAS NOT VERIFIED** (`www` 200, brak SHA bind). | `gh` deployments `7372230897` · commit status success · curl www 200 / unique 302 | `5200c6d…` | Bind alias/`dpl_*` wymaga OAuth/`vercel inspect` |
| 2026-10-27 | GATE-A | Contabo poll journal RO (LEFT RUNNING) | EXECUTED | PASS | Owner: zostaw RUNNING. Status **enabled/active/running** PID **847** since 2026-10-23 20:47 CEST. `journalctl -n 80` = `claims_empty` / `busy=false`. Sekrety brak. **Nie** stop/start/enable. Audit appended. | `systemctl status/show` · `journalctl -n 80` · audit journal section | _(ten commit)_ | Poll zostaje. SHA hosta nadal NOT VERIFIED |
| 2026-10-27 | GO-SB-ARCHIVE-4 | Archiwizacja §4 → CHANGELOG (room for A/B/C) | EXECUTED | PASS | Przeniesiono 5 najstarszych `EXECUTED` (`GO-TEAM-CLOSE` · `GO-SESSION-CLOSE` · `CONTINUITY-RELIABILITY` · `COLD-START-CLOSE` · `GO-SB-ARCHIVE`) → CHANGELOG archive. Living 14→9, po A/B/C + tym wierszu **13**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-27 | GATE-2R | Contabo GO-HOST-RO retry (właściwy klucz) | EXECUTED | PASS | Live SSH **PASS**. Klucz `C:\Users\dawid\.ssh\bitrymdym-contabo-recovery-ed25519` (passphrase). Gate 2 MISSING/`BatchMode` 255 = zła tożsamość. Host `vmi3622761`. Oneshot **disabled/inactive**. Poll **enabled/active/running** PID 847 since 2026-10-23. `HAS_GIT=no`. Always-on **nie** enable. Audit zaktualizowany. | interactive ssh exit 0 · `hostname` · `systemctl` · `sudo -n test -d .git` | `5200c6d…` | Owner GO: co z żywym `bitrymdym-e3-worker-poll` — **done: zostaw + journal RO** |
| 2026-10-27 | GATE-3 | Implementation Catalog (policies+allowlist+skeleton) | EXECUTED | PARTIAL | Repo: OD-SC-02 gates + `catalog/` key w `validateObjectKey` · migracja `20261027220000_…` · copy skeleton 501 · **prod apply BLOCKED** · Scratch **OUT**. Tests vitest allowlist. PS: SHIPPED in repo / NOT in prod | `git show` paths · vitest audio-validation + catalog-originals | _(ten commit)_ | NEXT: prod apply GO **albo** content sniff **albo** Scratch (osobno) |
| 2026-10-27 | GATE-2 | Contabo GO-HOST-RO | EXECUTED | BLOCKED | Live SSH **NOT DONE — blocked on SSH**. Klucz `bitrymdym-e3-contabo` **MISSING**. Recovery name istnieje, `Permission denied (publickey)` exit 255. Always-on **nie** enable. Audit [CONTABO_GO_HOST_RO_2026-10-27.md](../audits/CONTABO_GO_HOST_RO_2026-10-27.md) · PS pointer | `Test-Path` · `ssh` BatchMode 255 | _(ten commit)_ | Owner: restore documented key albo osobny GO. Gate 3 Implementation Catalog |
| 2026-10-27 | GATE-1 | SFM staging/host RO planes | EXECUTED | PARTIAL | Audyt [SFM_PLANES_STAGING_HOST_RO_2026-10-27.md](../audits/SFM_PLANES_STAGING_HOST_RO_2026-10-27.md). (1) code `5212933` ancestor **VERIFIED**. (2–4) staging SHA/schema/worker **NOT VERIFIED** (brak targetu). (6) prod DB A–D+KIND_REJECT **VERIFIED RO** · 0 versions/jobs. Flaga **nie** ON. Host process = Gate 2. PS tylko wiersze SFM RO | `git merge-base` · MCP `list_migrations`/`list_projects`/`list_branches` · SELECT counts | _(ten commit)_ | Gate 2 Contabo GO-HOST-RO |
| 2026-10-27 | GATE-0 | alias / `dpl_*` best-effort (bez OAuth) | EXECUTED | PARTIAL | Living tip `1c34a53…` (`ls-remote`). GitHub Production **`7371927399`** **success** `2026-10-27T22:24:34Z` @ ten SHA · Vercel commit status **success** · unique URL `bitrymdym-jypwmgukh-…vercel.app` · dashboard `…/8N3C7ryXXx2LVaYt3G7ju5q1sirc`. **`dpl_*` NOT VERIFIED** (brak `vercel` CLI · unique URL SSO). **ALIAS NOT VERIFIED** (`www` HTTPS 200, brak bindowania SHA). GitHub last-20 = Production only. PS tip/deploy reconcile + CHANGELOG. Sacred / Studio status-only PRESERVE | `git ls-remote` `1c34a53` · GitHub deployment `7371927399` · `gh` commit status success · curl www 200 | `1c34a53…` (pre-this-row commit) | Gate 1 SFM staging/host RO. Alias/`dpl_*` nadal osobny OAuth jeśli Owner chce bind |
| 2026-10-27 | GO-SB-ARCHIVE-3 | Archiwizacja §4 → CHANGELOG (room for Gates 0–3) | EXECUTED | PASS | Przeniesiono 6 najstarszych `EXECUTED` (`KONTRAKT A–D` · `GO-5G-O` · `GO-5G-M` · `GO-5G-J` · `GO-5G-H` · `GO-5G-G`) → [CHANGELOG.md](../CHANGELOG.md) `### SESSION_BRIDGE archive`. Living `EXECUTED` 14→8, po tym wierszu **9**. `P-NEXT-10` BLOCKED zachowany. `PROJECT_STATE` nietknięty. Path-scoped commit+push allowlisty most+CHANGELOG | `git status` przed `43c60883…` · `HEAD`=`bde3009` (`ls-remote`) | _(ten commit)_ | Gate 0 alias/`dpl_*` best-effort, potem SFM RO · Contabo RO · Implementation Catalog |
| 2026-10-27 | S13-RO | Sample Catalog §13 Storage/allowlist read-only | EXECUTED | PARTIAL | Audyt RO: repo + SELECT prod. §13 policies/runtime allowlista **zostają NOT VERIFIED**. Implementation **NOT AUTHORIZED**. `PROJECT_STATE` NEXT/STOP nietknięty. Commit+push `64e7ff3` audit + CHANGELOG. Host/deploy tego SHA = po pushu | `git show 64e7ff3` (2 paths) · MCP SELECT buckets/policies/prefix counts | `64e7ff3…` | Implementation Catalog = osobne GO. Alias/`dpl_*` = osobne GO |
| 2026-10-27 | P-NEXT-10 | Commit+push allowlisty 06/08 | BLOCKED | BLOCKED | HEAD≠`2cc4cc1` (był już `03d889a`); zła nazwa D02 w briefie | Preflight P-NEXT-10; brak stage | — | Wznów tylko po GO z bazą `03d889a` |

**Licznik `EXECUTED` w tabeli:** 14 (limit 15). Wiersz `P-NEXT-10` ma `execution=BLOCKED` — **nie** liczy się do limitu. Archiwum (fifth batch UNIT-2 + P-NEXT-10B + earlier): [CHANGELOG.md](../CHANGELOG.md) → `### SESSION_BRIDGE archive`.

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

**Last-known deploy / alias (odczyt `2026-10-28T00:12+01:00`; bez `vercel inspect`):**
- Living Git pre-this-commit: **`fac551a…`** = `origin/main` (`ls-remote`)
- Last independently verified GitHub Production **`7372230897`** · **success** · `2026-10-27T22:42:24Z` @ **`5200c6d…`**
- Catalog schema **APPLIED** `20261027225553` · live probe **PASS** · content sniff **SHIPPED in repo**
- `dpl_*` / alias www **NOT VERIFIED** · **DEPLOYMENT success ≠ PRODUCTION VERIFIED ≠ Product GREEN**
- Kanoniczne wiersze tip/deploy/NEXT → [PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c); ten bridge **nie** jest SSOT tipu.

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
