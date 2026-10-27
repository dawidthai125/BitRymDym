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

1. Odczytaj `AGENTS.md` i obowiązujące instrukcje repozytorium.
2. Odczytaj [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md).
3. Odczytaj [PROJECT_STATE.md](../PROJECT_STATE.md), w szczególności **§2** (living tip / deploy / NEXT).
4. Odczytaj **ten** plik (`SESSION_BRIDGE.md`).
5. Sprawdź świeży `git status` — **zachowaj** istniejący dirty WIP.
6. Odczytaj [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md) oraz [architecture/REUSE_SSOT_MAP.md](../architecture/REUSE_SSOT_MAP.md) przed planowaniem nowych zmian.
7. Ustal: FACT / NOT VERIFIED / plan — nie myl warstw.
8. Ustal zakres następnego zadania; zatrzymaj się przed zmianami wymagającymi osobnego GO Ownera.

Opcjonalnie (po powyższym):
[handoffs/MASTER_START_PROMPT_CURSOR_PL.md](../handoffs/MASTER_START_PROMPT_CURSOR_PL.md) ·
[handoffs/MASTER_START_PROMPT_CHATGPT_PL.md](../handoffs/MASTER_START_PROMPT_CHATGPT_PL.md)

---

## 2. Snapshot WIP (bez diffów / sekretów)

Aktualizuj po `git status`, przed nowym zadaniem. **Nie** wklejaj treści diffów, `.env`, tokenów ani PII.

Snapshot poniżej = stan z **jednej** kontroli odczytowej. **Nie** jest trwałym SSOT WIP — przed każdym zadaniem **ponów** `git status`. Całego dirty WIP **nie** przypisuj do jednego GO.

| when (ISO) | branch | HEAD (short) | staged | unstaged (tracked) | untracked | areas (high level) | sacred | notes |
|------------|--------|--------------|--------|--------------------|-----------|--------------------|--------|-------|
| 2026-10-27T09:49:43+01:00 (odświeżono po gap fill) | main | `03d889a` | 0 | ~169 | ~332 | docs≈187 · `.cursor`≈112 · `src`≈77 · `.agents`≈62 · scripts≈42 · supabase≈13 · inne | path `M` PRESERVE | porcelain≈501; indeks pusty; w tym `M` ten plik (gap fill, **nie** staged); **nie** cały WIP = SESSION_BRIDGE |

**Sacred WIP (path-only):** `src/lib/takes/recording-eligibility-service.ts`
— nigdy nie czytaj / nie wyszukuj / nie diffuj / nie haszuj / nie przekazuj subagentom (`AGENTS.md`). W tabeli: tylko obecność w `git status`, bez treści.

### 2.1 Tip / deploy — konflikt źródeł (datowany; nie rozstrzygaj tu)

Kontrola `2026-10-27T09:49+01:00` (bez `fetch`):

| Źródło | Wartość | Uwaga |
|--------|---------|--------|
| Lokalny `HEAD` | `03d889a3667058c9355d85c640fe49b4dc9f8b91` | commit lokalny GO-3b; **nie** = produkcja |
| Lokalny `origin/main` | `2cc4cc1c3e3a3536e7bf8fbae48dca3485700d5b` | **bez fetch** — świeżość remote **NOT VERIFIED** |
| Living tip w [PROJECT_STATE.md](../PROJECT_STATE.md) §2 | `2cc4cc1…` | kanoniczny tip/deploy/NEXT — **nie zmieniaj** w tym pliku |
| Push `03d889a` | **nie wykonany** (lokalnie ahead 1) | deploy / www alias → **nie deklaruj** |

**Rozstrzygnięcie tip/push/PROJECT_STATE = osobne GO Ownera.** Ten bridge tylko sygnalizuje konflikt.

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
| 2026-10-27 | SESSION_BRIDGE gap audit | Uzupełnienie §2/§4 bridge (ten wpis) | EXECUTED | PARTIAL | Minimalna edycja tylko tego pliku; bez stage/commit/push | Diff lokalny `docs/operations/SESSION_BRIDGE.md` (po kontroli); raport agenta w czacie | _(brak commita)_ | Stage/commit tego pliku = osobne GO |
| 2026-10-27 | AUTONOMY READINESS | Audyt gotowości Cursor+ECC (×2 raporty) | EXECUTED | PARTIAL | A spełniony · B częściowy · C nie; `PARTIALLY READY` | Raporty w sesji Cursor (bez zapisu do repo); Task A–D + review | N/A | Bridge/tip/NEXT Owner; ≠ Product GREEN |
| 2026-10-27 | P-NEXT-10A | Audyt blokera przed publikacją 06/08 | EXECUTED | PASS | Baza `03d889a` SAFE; D02 path potwierdzona | Raport 10A; `git show` triad; 1× plik D02 w `docs/phases/` | N/A (RO) | Czeka GO na P-NEXT-10B / push |
| 2026-10-27 | P-NEXT-10 | Commit+push allowlisty 06/08 | BLOCKED | BLOCKED | HEAD≠`2cc4cc1` (był już `03d889a`); zła nazwa D02 w briefie | Preflight P-NEXT-10; brak stage | — | Wznów tylko po GO z bazą `03d889a` |
| 2026-10-27 | GO-3b | Strip trailing WS + commit triad bridge | EXECUTED | PASS | Commit lokalny 3 ścieżek; `--check` exit 0; **push nie** | `git show 03d889a` · paths: SESSION_BRIDGE, CONTINUITY, README | `03d889a…` | Push / tip PROJECT_STATE = osobne GO |
| 2026-10-27 | GO-3 | Path-scoped commit triad | EXECUTED | FAIL | `git diff --cached --check` trailing WS w SESSION_BRIDGE | Raport GO-3 BLOCKED | — | Naprawione w GO-3b |
| 2026-10-27 | GO-2 | RO audit zakresu GO-1 | EXECUTED | PASS | Zakres triad OK; bez Sacred/Studio | Raport GO-2 w sesji | N/A (RO) | — |
| 2026-10-27 | GO-1 | Utworzenie SESSION_BRIDGE + wskaźniki | EXECUTED | PASS | Szablon ACTIVE; CONTINUITY/README pointers | Treść w commitcie `03d889a` (dostarczona przez GO-3b) | `03d889a…` | — |

**Licznik `EXECUTED` w tabeli:** 7 (limit 15). Wiersz `P-NEXT-10` ma `execution=BLOCKED` — **nie** liczy się do limitu.

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

**Lokalne GO oczekujące (uzupełniaj ręcznie):**
- Push lokalnego `03d889a` na `origin/main` **albo** świadome dalsze lokalne commity na tej bazie — **bez** force / fetch/pull bez GO.
- Reconcile living tip / deploy w [PROJECT_STATE.md](../PROJECT_STATE.md) po decyzji o push (ten plik **nie** aktualizuje tipa).
- P-NEXT-10B (lub równoważne): allowlista 12 ścieżek 06/08 z D02 = `docs/phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md`; baza HEAD = `03d889a` (nie `2cc4cc1`).
- Stage/commit **tej** aktualizacji SESSION_BRIDGE (§2/§4) — osobne GO dokumentacyjne.
- NEXT UNIT produktu nadal → PROJECT_STATE (**STOP — OWNER DECISION REQUIRED**); nie mylić z GO dokumentacyjnymi powyżej.

---

## 6. Checklist po zadaniu

- [ ] Zakres = GO
- [ ] Dopisano wiersz §4 (`execution` + `verification` rozdzielone; bez fikcji)
- [ ] `git_sha` / `prod` tylko z dowodem
- [ ] Zaktualizowano §2 WIP snapshot (status only)
- [ ] Jeśli dodanie kolejnego `EXECUTED` przekroczyłoby 15 → **nie kasuj**; zgłoś potrzebę GO archiwizacji CHANGELOG
- [ ] Tip/deploy: aktualizuj **PROJECT_STATE**, nie ten plik (osobny zakres/GO)
- [ ] Sacred / dirty: nietknięte poza zakresem
- [ ] Commit / push / deploy — tylko wg `AGENTS.md` + GO; **ten plik sam nie jest zgodą**

---

## 7. Related

- [DOCUMENTATION_CONTINUITY.md](../DOCUMENTATION_CONTINUITY.md)
- [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md)
- [PROJECT_STATE.md](../PROJECT_STATE.md)
- [CHANGELOG.md](../CHANGELOG.md) _(archiwum — edycja tylko po osobnym GO)_
- [ECC_CURSOR_WORKFLOW.md](./ECC_CURSOR_WORKFLOW.md)
