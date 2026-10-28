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
| 2026-10-28T07:50:00+01:00 (Scratch persist isolation, po kodzie) | main | `6014556` | 0 | ~170 | ~334 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | code SHA `6014556` parent `ba18150`; allowlista docs: audit+CHANGELOG+PS+bridge; Sacred / dirty editor / mix-working PRESERVE · service **bez** mix-working-apply |
| 2026-10-28T06:55:00+01:00 (Scratch reverse+CAS, pomiar lokalny) | main | `bb4857d` | 0 | ~170 | ~334 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | `HEAD`=`origin/main`=`bb4857d` (`ls-remote`); allowlista: engine/scratch/CAS/service izolowane + docs; Sacred / dirty editor PRESERVE · studio-service mix-working na końcu nietknięte |
| 2026-10-28T06:16:00+01:00 (catalog copy E2E, pomiar przed commit) | main | `3b8214b` | 0 | ~166 | ~332 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | `HEAD`=`origin/main`=`3b8214b` (`ls-remote`); allowlista: catalog-originals + catalog-copy-service + copy route + docs; Sacred/Studio PRESERVE |
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

Kontrola `2026-10-28T07:50+01:00` (`git rev-parse HEAD`; `ls-remote`; **bez** `vercel inspect` / OAuth):

| Źródło | Wartość | Uwaga |
|--------|---------|--------|
| Lokalny `HEAD` | `6014556` | code persist isolation · parent `ba18150` = last `origin/main` przed tym unitem |
| Last independently verified deploy | `ba181500943621a99233a8ce1974f25b2974fbe0` | GitHub Production last-known **`7377291086`** **success** @ `bb4857d…` (HISTORY); ten unit = do push |
| Living tip / deploy / NEXT | → [PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c) | **SSOT tip/deploy/NEXT = PS** · persist isolated · scratch CAS **APPLIED** `20261028050115` · catalog **`20261027225553`** · prod copy **BLOCKED** · mix-working restore = Owner GO · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ PRODUCTION VERIFIED ≠ Product GREEN** |
| Docs continuity (worktree) | Scratch persist isolation | Ten zapis edytuje most + CHANGELOG + PS + audit |

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
| 2026-10-28 | SCRATCH-PERSIST | Isolate Scratch CAS persist from mix-working | EXECUTED | PASS | `studio-scratch-persist.ts` kanon CAS. `studio-service` cienki, **0** importów mix-working. Stage 7 ścieżek. Vitest scratch-cas **6/6**. `tsc --noEmit` PASS. Editor/Sacred/mix-working **poza** stage. ≠ Product GREEN. | `git show 6014556` · vitest · tsc · [audit](../audits/SCRATCH_PERSIST_ISOLATION_2026-10-28.md) | `6014556…` | NEXT: Owner GO restore mix-working **albo** USER copy **albo** export encode |
| 2026-10-28 | GO-SB-ARCHIVE-8 | Archiwizacja §4 → CHANGELOG (room for persist isolation) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`GATE-A` · `GO-SB-ARCHIVE-4` · `GATE-2R`) → CHANGELOG archive. Living 15→12, po SCRATCH-PERSIST + tym wierszu **14**. `P-NEXT-10` + `USER-COPY` BLOCKED zachowane. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | SCRATCH-CAS-REV | Live reverse + SAMPLE/SCRATCH create + CAS | EXECUTED | PARTIAL | BufferSource reverse w istniejącym `StudioAudioEngine` (jeden ctx). `POST /tracks` VOCAL\|SAMPLE\|SCRATCH. `op=set_scratch` → `studio_cas_apply_clip_scratch`. MCP apply history **`20261028050115`**. Vitest slice **138/138**. Dirty editor nietknięty. Export encode **OUT**. ≠ Product GREEN. | vitest scratch-engine/state/cas + p5/p7 (bez dirty editor) · [audit](../audits/SCRATCH_REVERSE_CAS_2026-10-28.md) | _(lokalnie, pre-commit)_ | NEXT: path-scoped commit+push **albo** export encode |
| 2026-10-28 | ALIAS-DPL | alias / `dpl_*` @ `bb4857d` (bez OAuth) | EXECUTED | PARTIAL | Tip `bb4857d…` (`ls-remote`). GitHub Production **`7377291086`** **success** `2026-10-28T04:37:56Z` @ ten SHA · Vercel **success** · unique URL `bitrymdym-gef23don8-…` **302 SSO**. **`dpl_*` NOT VERIFIED**. **ALIAS NOT VERIFIED** (`www` 200, brak SHA bind). | `gh` deployments `7377291086` · commit status success · curl www 200 / unique 302 | `bb4857d…` | Bind alias/`dpl_*` wymaga OAuth/`vercel inspect` |
| 2026-10-28 | USER-COPY | Prod USER catalog copy + cleanup | BLOCKED | BLOCKED | Brak bezpiecznego test USER. MCP counts `auth.users=4` · `profiles=4` · `studio_projects=6`. Zero `POST /api/catalog/copy`. Zero insert/cleanup. ≠ PASS. | MCP SELECT counts · [audit](../audits/SCRATCH_REVERSE_CAS_2026-10-28.md) §3 | — | Owner wskazuje dedykowany QA USER + sesję |
| 2026-10-28 | GO-SB-ARCHIVE-7 | Archiwizacja §4 → CHANGELOG (room for reverse/CAS) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`GATE-3` · `GATE-2` · `GATE-1`) → CHANGELOG archive. Living 15→12, po SCRATCH-CAS-REV + ALIAS-DPL + tym wierszu **15**. `P-NEXT-10` + USER-COPY BLOCKED zachowane. | Diff most + CHANGELOG archive table | _(lokalnie, pre-commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | STUDIO-C | Scratch DJ v1 PARTIAL vertical | EXECUTED | PARTIAL | Domain jog/cue/reverse/rate + export fail-closed. Catalog→TAKE→clip reuse `POST /api/catalog/copy` + `…/record/place`. Panel w recording Inspector (pointer+touch). `applyScratchLive` na istniejącym `StudioAudioEngine.playbackRate`. Vitest **131/131**. Live reverse / CAS persist / SAMPLE-SCRATCH create / export encode **OUT**. Dirty editor/service **nietknięte**. ≠ Product GREEN. | vitest scratch-* + p5/p7 guards · eslint · tsc · [audit](../audits/STUDIO_UNLOCK_AUDIT_2026-10-28.md) | _(ten commit)_ | NEXT: Scratch persist/create track **albo** BufferSource reverse **albo** prod USER copy |
| 2026-10-28 | STUDIO-A | Audyt Studio unlock | EXECUTED | PASS | Powierzchnia editor/service/API/CAS/REC/export/AuthZ. Sacred path-only. SAMPLE/SCRATCH typy bez create. Silnik HTMLAudio = brak native reverse. Place TAKE już istnieje. Prod USER copy **BLOCKED**. | [STUDIO_UNLOCK_AUDIT_2026-10-28.md](../audits/STUDIO_UNLOCK_AUDIT_2026-10-28.md) | _(ten commit)_ | Faza C PARTIAL done |
| 2026-10-28 | GO-SB-ARCHIVE-6 | Archiwizacja §4 → CHANGELOG (room for Studio unlock) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`GATE-0` · `GO-SB-ARCHIVE-3` · `S13-RO`) → CHANGELOG archive. Living 15→12, po A/C + tym wierszu **15**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | CAT-COPY | Catalog copy private TAKE | EXECUTED | PARTIAL | `POST /api/catalog/copy` zapisuje prywatny TAKE z `catalog/{uuid}/original.bin` po sniff + PUBLISHED+license + project.beat_id. Fail-closed bez zapisu. Provenance `takes.title`. Vitest **39/39**. Prod USER copy **NOT VERIFIED**. Scratch **OUT**. ≠ Product GREEN. | vitest catalog-originals + catalog-copy-service + copy route + audio-validation · eslint · tsc · [audit](../audits/CATALOG_COPY_E2E_2026-10-28.md) | _(ten commit)_ | NEXT: Scratch **albo** prod USER copy+cleanup |
| 2026-10-28 | CAT-SNIFF | Catalog originals OD-SC-02 content sniff | EXECUTED | PASS | Usunięto `CATALOG_CONTENT_GATE_NOT_IMPLEMENTED`. `sniffAudioContainer` + `validateCatalogOriginalContentSniff` w `audio-validation.ts`. Spoof/empty/unsupported → `CATALOG_CONTENT_*` 415. Sniff PASS → `COPY_NOT_IMPLEMENTED` · **zero writes**. Vitest **36/36**. Scratch **OUT**. ≠ Product GREEN. | vitest catalog-originals + audio-validation + backup-manifest · eslint · tsc | _(ten commit)_ | NEXT: copy E2E (test USER) **albo** Scratch |
| 2026-10-28 | CAT-PROBE | Catalog originals live Storage probe | EXECUTED | PASS | service_role upload/list/download/delete `catalog/8c288da2-9017-415e-b715-64e65d4a35e9/original.bin` **PASS** (16044 B WAV). Anon **DENIED**. Cleanup leftover **0** / `catalog_assets` **0**. Copy API **NOT RUN**. Scratch **OUT**. ≠ Product GREEN. | Node probe + host-guard · MCP leftover SELECT · [audit](../audits/CATALOG_ORIGINALS_LIVE_STORAGE_PROBE_2026-10-28.md) | _(ten commit)_ | NEXT: content sniff / copy E2E / Scratch — sniff **done** |
| 2026-10-27 | CAT-APPLY | Catalog originals prod apply | EXECUTED | PASS | MCP `apply_migration` **PASS**. History **`20261027225553` / `catalog_originals_storage_and_entity`** (drift vs repo `20261027220000` — nie repair). Read-back: `catalog_assets` RLS ON+FORCE · 4 Storage `catalog_originals_service_*` · grants SIDU service_role / deny client. Vitest **19/19**. Live probe **BLOCKED**. Scratch **OUT**. ≠ Product GREEN. | MCP list/apply/execute_sql · [audit](../audits/CATALOG_ORIGINALS_PROD_APPLY_2026-10-27.md) · vitest catalog+audio-validation | `6f3a728…` | NEXT: controlled live probe GO — **done** CAT-PROBE |
| 2026-10-27 | GATE-C | Catalog copy fail-closed (repo) | EXECUTED | PASS | Planner: unknown policies/prod → `CATALOG_STORAGE_POLICIES_UNAVAILABLE` · unpublished/unlicensed → `CATALOG_ASSET_NOT_COPYABLE` · content sniff fail-closed · dest key nie wymyślany · zero writes. Route 503/409/501 · `requireUser` · JSON 400. Vitest **19/19**. Prod apply **BLOCKED**. Scratch **OUT**. | `git show 5a6bc55` · vitest catalog-originals + audio-validation | `5a6bc55…` | Owner GO: prod apply `20261027220000` (checklist) **albo** content sniff |
| 2026-10-27 | GATE-B | alias / `dpl_*` @ `5200c6d` (bez OAuth) | EXECUTED | PARTIAL | Tip `5200c6d…` (`ls-remote` then). GitHub Production **`7372230897`** **success** `2026-10-27T22:42:24Z` @ ten SHA · Vercel **success** · unique URL `bitrymdym-j1sp78uxs-…` **302 SSO** · dashboard `…/8KYY2axTYMN4CKzsxEteqy857k5R`. **`dpl_*` NOT VERIFIED**. **ALIAS NOT VERIFIED** (`www` 200, brak SHA bind). | `gh` deployments `7372230897` · commit status success · curl www 200 / unique 302 | `5200c6d…` | Bind alias/`dpl_*` wymaga OAuth/`vercel inspect` |
| 2026-10-27 | P-NEXT-10 | Commit+push allowlisty 06/08 | BLOCKED | BLOCKED | HEAD≠`2cc4cc1` (był już `03d889a`); zła nazwa D02 w briefie | Preflight P-NEXT-10; brak stage | — | Wznów tylko po GO z bazą `03d889a` |

**Licznik `EXECUTED` w tabeli:** 14 (limit 15). Wiersze `P-NEXT-10` i `USER-COPY` mają `execution=BLOCKED` — **nie** liczą się do limitu. Archiwum (eighth batch GATE-A + GO-SB-ARCHIVE-4 + GATE-2R + earlier): [CHANGELOG.md](../CHANGELOG.md) → `### SESSION_BRIDGE archive`.

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

**Last-known deploy / alias (odczyt `2026-10-28T07:50+01:00`; bez `vercel inspect`):**
- Living Git (lokalnie): **`6014556…`** persist isolation · parent **`ba18150…`** = last `origin/main` przed tym unitem
- Last independently verified GitHub Production **`7377291086`** · **success** · `2026-10-28T04:37:56Z` @ **`bb4857d…`** (HISTORY)
- Scratch persist isolated · CAS **APPLIED** `20261028050115` · catalog **`20261027225553`** · prod copy **BLOCKED**
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
