# ECC w Cursor — standard ciągłej pracy (BitRymDym)

**Status:** aktywna integracja lokalna (minimalna)  
**Źródło ECC:** https://github.com/affaan-m/ECC · wersja `2.2.3` · commit `90606c8315ee09cafc303515c5f33024db6b9882`  
**Nadrzędność (hierarchia):** zgody Ownera i bezpieczeństwo → `AGENTS.md` + SSOT projektu → reguły projektowe (w tym Always overlay) → neutralne narzędzia globalne → ECC jako warstwa pomocnicza. ECC nie zastępuje SSOT ani nie rozszerza uprawnień.

## Model operacyjny Cursor Agent + ECC (Stage 5, GO-0)

Trwały standard doboru narzędzi w BitRymDym. Nie zastępuje `AGENTS.md` (autonomia, bramki, Sacred WIP, dirty worktree, egress audio). Uzupełnia protokół skills/subagentów.

### Role

| Rola | Odpowiedzialność |
|------|------------------|
| Główny Cursor Agent | Implementacja w zakresie, orchestracja, testy adekwatne do ryzyka, raport końcowy po polsku |
| Subagent | Opcjonalnie: niezależna analiza lub review; nie domyślny drugi implementer |
| Skills | Procedury do zadania — czytać tylko pasujące; nie ładować hurtowo |
| Commands | Świadomie wywoływane procedury; **nie** auto-start, instalatory ani update bez osobnego GO |
| Rules / `AGENTS.md` | Źródła prawdy i ograniczenia sesji |

### Zasady doboru

- **Minimalny wystarczający zestaw** — nie uruchamiaj całej biblioteki agentów ECC (~71) ani bundled skills (~46) przy każdym zadaniu.
- Subagent tylko gdy rola jest jednoznaczna, a koszt i ryzyko delegacji są uzasadnione. Obecność typu na liście ≠ dowód bezpiecznego spawnu ani egzekucji ograniczeń.
- Identyfikator runtime subagenta to pole frontmatter `name`, nie prefiks pliku `ecc-`. Przy kolizji nazw Cursor daje pierwszeństwo definicji projektowej (docs Cursor).
- W BitRymDym przy obecnej kolizji identyfikatory `architect` i `code-reviewer` traktuj jako **projektowe definicje ECC** (nie jako globalnych audytorów PL o tych samych `name`). **Nie zmieniaj nazw agentów** bez osobnego GO Ownera.
- Nie zakładaj, że deklaracje `readonly` i `tools` w frontmatter są w pełni egzekwowane przez runtime bez osobnych dowodów (`NOT VERIFIED`, dopóki brak weryfikacji).
- Do niezależnego review preferuj typy bez kolizji z ECC (np. globalne `debugger`, `security-auditor`, `test-auditor`, `documentation-auditor`, `researcher`) oraz user skills — zamiast polegać na przysłoniętych globalnych `architect` / `code-reviewer`.
- Skills: dobór do zadania. User skills (`~\.cursor\skills`) i projektowe `.agents/skills/` (Supabase) mają pierwszeństwo w codziennym flow. Bundled ECC w `.cursor/.agents/skills/` to biblioteka na dysku — **nie** przenoś ani nie kopiuj hurtowo 46 skills; auto-wykrywanie tej ścieżki pozostaje do potwierdzenia (`NOT VERIFIED` / Stage 3–4).
- Przy duplikacie nazwy `security-review` używaj **user** skill, nie zakładaj bundled ECC.
- Hooks ECC: **wyłączone**. Nie włączaj bez osobnego audytu i GO. Nie rozszerzaj MCP o serwery ECC.
- Nie uruchamiaj automatycznie Commands, `/auto-update`, `/project-init`, `/hookify*`, `/prune`, `/promote`, `/setup-pm` ani innych procesów instalacji/aktualizacji bez GO.

### Weryfikacja i statusy

- Wymagaj **rzeczywistych** wyników testów i kontroli — nie deklaruj PASS na podstawie samego zapewnienia agenta ani samej obecności konfiguracji.
- Rozróżniaj w raportach: `FACT` · `INFERENCE` · `NOT VERIFIED` · `BLOCKED` (oraz informacje z innych agentów jako osobną kategorię, gdy dotyczy).
- Status zadania / kontroli: `PASS` · `CONDITIONAL PASS` · `FAIL` · `BLOCKED` · `NOT VERIFIED`.
- Lokalny PASS ≠ produkcja; tip deploy → `docs/PROJECT_STATE.md`. Obowiązuje blok audio egress z `AGENTS.md`.

### Osobna zgoda Ownera (poza zwykłą autonomią BitRymDym)

Oprócz bramek w `AGENTS.md` osobnego GO wymagają m.in.:

- zmiana nazw / pól `name` agentów (rozstrzygnięcie kolizji);
- przenoszenie lub instalacja skills (w tym z bundled ECC na oficjalne ścieżki);
- aktywacja hooks; rozszerzanie MCP; profil ECC `full` / reinstall / update z ryzykiem nadpisania;
- operacje produkcyjne, migracje z ryzykiem danych, działania destrukcyjne;
- czyszczenie dirty worktree, nadpisanie Sacred WIP, nieautoryzowane operacje Git (force-push, `reset --hard` itd.).

Sacred WIP (`src/lib/takes/recording-eligibility-service.ts`), dirty worktree i SSOT FIRST / REUSE FIRST / ZERO DUPLICATE LOGIC / MOBILE FIRST — bez zmian względem `AGENTS.md` i reguły `bitrymdym-ssot-over-ecc.mdc`.

## Co jest zainstalowane

| Składnik | Lokalizacja | Uwagi |
|----------|-------------|--------|
| Rules | `.cursor/rules/*.mdc` | w tym common + TypeScript/React; overlay `bitrymdym-ssot-over-ecc.mdc` |
| Agents | `.cursor/agents/ecc-*.md` | prefiks `ecc-`; ładowanie zależy od wersji Cursor |
| Commands | `.cursor/commands/` | dokumentacja komend ECC |
| Scripts | `.cursor/scripts/` | narzędzia install/shared; **bez** aktywnego hook runtime |
| Hooki | — | **nieaktywne** (`hookConsent: declined`, brak `hooks.json`) |
| MCP ECC | — | **nie** dodawano; zachowano istniejący `.cursor/mcp.json` (Supabase) |
| Skills ECC (bundled) | `.cursor/.agents/skills/` | pakiet z `agents-core`; **nie** mylić z user skills ani `.agents/skills/` BitRymDym — dobieraj świadomie, nie ładuj hurtowo |
| Skills ECC (Cursor path) | `.cursor/skills/` | puste w tej instalacji |

Stan instalatora (ścieżki lokalne): `.cursor/ecc-install-state.json` — lokalny, nie traktować jako SSOT.

## Przepływ sesji

1. Zrozum zadanie i ryzyko.
2. Odczytaj SSOT / decyzje właściwe dla zakresu.
3. Dobierz **tylko** potrzebne skills i subagentów.
4. Zaplanuj testy adekwatne do ryzyka.
5. Implementuj w zakresie; bez równoległego SSOT ECC.
6. Przy zmianach krytycznych: niezależny review (security / code / tests).
7. Zweryfikuj prawdziwymi komendami; raport po polsku.

## Czego nie robić

- Nie włączać hooków ECC bez osobnego audytu i GO
- Nie merge’ować MCP ECC (`chrome-devtools` itd.) do `.cursor/mcp.json`
- Nie zastępować `AGENTS.md` treścią z repo ECC
- Nie instalować profilu `full` / globalnego setupu „na wszelki wypadek”
- Nie traktować obecności plików `ecc-*` jako dowodu, że Cursor zawsze je spawn’uje automatycznie

## Smoke UI (nowa sesja Cursor) — zamyka lukę runtime

Bez tego ładowanie `ecc-*` i skuteczność `alwaysApply` pozostają **NOT VERIFIED**:

1. Nowa rozmowa w workspace `bitrymdym`.
2. Sprawdź, że agent respektuje overlay (Sacred WIP, bez PR jako default, PL).
3. Rules: widoczny `bitrymdym-ssot-over-ecc`; `common-git-workflow` / `common-development-workflow` / `common-testing` **nie** jako Always.
4. Agents/commands: obecność `ecc-*` / `/ecc-guide` (FACT: widoczne / nie).
5. Negatywny: brak Hooks; `mcp.json` tylko Supabase.

## Uwagi po review (Stage 1–2)

- **Stage 2 (GO):** 110 reguł ECC: `paths:` → `globs: "…"` + `alwaysApply: false` (format [Cursor Rules](https://cursor.com/docs/rules)). `angular-testing.mdc` zostawione na `paths:` (CONFLICT: same test globs co Vitest). ArkTS/Vue/Angular-hooks: usunięto zbyt szerokie `**/*.ts` / `**/*.spec.ts`. **React Native:** wszystkie `react-native-*.mdc` zawężone do `app.config.*` / `app.json` / `expo-env.d.ts` / `android/**` / `ios/**` (nie `**/*.ts`) — brak auto-attach na Next/TS BitRymDym.
- Siedem `common-*.mdc` bez frontmatteru — bez zmian (AMBIGUOUS).
- Bundled skills: `.cursor/.agents/skills/`.
- Runtime attach `globs` w sesji Agent: **NOT VERIFIED** (wymaga smoke UI / odczytu pliku `.ts` w czacie).
- Po **update ECC**: installer może przywrócić `paths:` — ponów Stage 2 albo checklistę poniżej.

## Checklist chronionych wartości (po każdym update ECC)

Przed commitowaniem wyniku installera porównaj i przywróć, jeśli zniknęło:

| Plik | Wymagane |
|------|----------|
| `bitrymdym-ssot-over-ecc.mdc` | istnieje; `alwaysApply: true` (plik BitRymDym — nie pochodzi z ECC) |
| `common-git-workflow.mdc` | `alwaysApply: false` + description BitRymDym |
| `common-development-workflow.mdc` | `alwaysApply: false` + description BitRymDym |
| `common-testing.mdc` | `alwaysApply: false` + description BitRymDym |
| reguły językowe `*.mdc` | preferuj `globs:` (nie `paths:`); po update ECC ponów Stage 2 jeśli wróci `paths:` |
| `angular-testing.mdc` | wyjątek: może zostać na `paths:` (unikaj attach do Vitest) albo osobne GO |
| `.cursor/mcp.json` | tylko Supabase; **bez** `chrome-devtools` |
| `.cursor/hooks.json` | **nie** istnieje / hookConsent declined |
| `.cursor/settings.json` | bez niespodziewanego MCP |

## BitRymDym — praktyczny zestaw równoległy (Stage 6)

Minimalny zestaw ról do pracy nad kodem strony i funkcjami. **Nie** ładuj całej biblioteki ECC.

| Rola | Identyfikator runtime | Tryb (deklarowany) | Uwagi |
|------|----------------------|--------------------|--------|
| Explorer / mapowanie | `explore` lub `code-explorer` | read-only (deklaracja) | SSOT + istniejące rozwiązania + zakres plików |
| Test auditor | `test-auditor` | read-only (deklaracja) | pokrycie i adekwatność weryfikacji |
| Security auditor | `security-auditor` | read-only (deklaracja) | Auth, RLS, sekrety, granice zaufania |
| Code review | `code-reviewer` (projektowy ECC) albo globalny review bez kolizji | read-only (deklaracja) | konkretny diff; egzekwowanie tools = **NOT VERIFIED** bez dowodu |
| Implementation worker | `implementation-worker` | write-capable, **tylko przypisane ścieżki** | plik `.cursor/agents/bitrymdym-implementation-worker.md`; bez commit/push/deploy; **Task spawn** wymaga, by typ pojawił się w enum sesji (nowa rozmowa / reload Customizations) — dopóki enum go nie ma: **NOT VERIFIED** / użyj orchestratora z jawną listą ścieżek |

### Mapa ról zespołu (Owner)

Pełny zespół programistyczny mapuje się na **istniejące** agenty i skills. Nie twórz drugiego agenta ani skilla o tej samej odpowiedzialności. Commit i push zostają przy orchestratorze (`AGENTS.md`) — nie spawnuj commitera/pushera.

| Rola | Kanoniczny agent / skill | Status | Uwagi |
|------|--------------------------|--------|-------|
| Koordynator | Główny Cursor Agent + reguła Zespół Cursor | READY | Jeden aktywny writer w checkout |
| Analiza | `research-and-planning` · `architecture-and-reuse` · `explore` / `code-explorer` / `researcher` | READY | User skills przed ECC |
| Pomysły / plan | `planner` · `research-and-planning` | READY | Opcjonalnie bundled `product-capability` / `gan-planner`. Pin Cursor Model — frontmatter ECC (`opus`/`sonnet`) nie jest modelem runtime |
| Grafik / UX | `frontend-ux` · `a11y-architect` | READY | Zwykłe zadanie = istniejący design. `frontend-design` tylko po osobnym GO |
| Searching | `explore` / `code-explorer` / `researcher` / `docs-lookup` | READY | Nie instaluj MCP pod bundled `deep-research` bez GO |
| Pisanie kodu | `implementation-worker` + orchestrator | READY | Tylko allowlista; bez commit/push/deploy |
| Weryfikacja kodu | user `code-review` · `typescript-reviewer` / `react-reviewer` · `security-auditor` · `test-auditor` | READY | Przy kolizji `code-reviewer` preferuj review bez kolizji + user skill |
| Debugger | Task `debugger` · `systematic-debugging` | READY | Brak `ecc-debugger.md` jest OK |
| Tester | `testing-and-verification` · `test-auditor` · `e2e-runner` | READY | Proporcjonalnie do ryzyka |
| Commiter | Orchestrator; `commit-reviewer` tylko message | READY | `commit-reviewer` nie woła `git commit` |
| Pusher | Orchestrator · `deployment-readiness` | READY | Lokalny PASS ≠ produkcja |
| Security | user `security-review` · `security-auditor` · `.agents/skills/supabase*` | READY | User skill wygrywa z bundled `security-review` |
| Dokumentacja | `documentation-audit` · `documentation-auditor` | READY | Nie drugi handoff / SESSION_BRIDGE |
| Baza | `database-review` · `database-reviewer` · supabase skills | READY | Nie reinstalować |
| Performance UI | `.agents/skills/react-best-practices` | READY | Pin w tabeli Skill React/Next |

Instalacje zewnętrzne i nowe `bitrymdym-*.md` tylko gdy ta tabela pokaże **GAP** zdolności — obecnie brak. Biblioteka ECC (~70 agentów, 46 bundled skills) zostaje na dysku; ładuj wyłącznie wiersz z tej mapy albo tabeli spawn powyżej.

### Modele subagentów (twarde)

- Dozwolone wyłącznie modele z puli **Cursor Models** na koncie (Composer / Grok / Cursor Auto).
- Zabronione: **Other Models** (Claude, Gemini, Muse) oraz automatyczny fallback do nich.
- Przy spawn: jawnie przypnij model (np. `composer-2.5-fast`). Sam `inherit`/`Default` bez potwierdzenia z puli **nie wystarczy**.
- Pliki ECC z `model: sonnet` (i podobne) **nie** są dowodem, że runtime użyje Claude — orchestrator i tak musi przypiąć Cursor Model; nie edytuj masowo nazw/modeli ECC bez GO Ownera.

### Skill React/Next (przypięty)

| Skill | Lokalizacja | Pin | Status pliku |
|-------|-------------|-----|--------------|
| `vercel-react-best-practices` | `.agents/skills/react-best-practices/` | `vercel-labs/agent-skills@063bee94c3f4df8453406c830b0a7df0f2860278` | skopiowany ręcznie (markdown/JSON); atrybucja `ATTRIBUTION.md`; lock `skills-lock.json` |

- Równoważny bundled ECC `frontend-patterns` w `.cursor/.agents/skills/` pozostaje na dysku; **nie** kopiować hurtowo. Dla React/Next performance preferuj skill Vercel w `.agents/skills/` (ta sama ścieżka co Supabase).
- Supabase: istniejące `.agents/skills/supabase*` — **nie** reinstalować bez luki.
- obra/superpowers: przegląd informacyjny tylko; zawiera `hooks/` — **nie instalować** w tym projekcie bez osobnego GO.

### Równoległość

- Audytorzy RO mogą biec równolegle.
- Wiele `implementation-worker`: **rozłączne listy plików** (lub osobne worktree, jeśli Cursor je zapewnia). Bez koordynacji — nie edytować tych samych ścieżek równocześnie.
- Deklaracja `tools` / readonly w frontmatter ≠ gwarancja egzekwowania przez Cursor — raportuj `NOT VERIFIED`, dopóki brak smoke UI.

## Aktualizacja ECC

1. Sklonuj oficjalne repo do katalogu TEMP (nie do worktree BitRymDym); zanotuj tag/commit.
2. `node …/install-apply.js --modules rules-core,agents-core,commands-core --target cursor --no-hooks --dry-run --json`
3. Abort przy operacjach na `mcp.json`, `hooks.json`, overlay BitRymDym.
4. Apply → od razu checklista chronionych wartości powyżej → smoke UI § powyżej.
5. Commit dopiero po PASS/CONDITIONAL z dowodami; bez `--enable-hooks` i bez profilu `full`.
