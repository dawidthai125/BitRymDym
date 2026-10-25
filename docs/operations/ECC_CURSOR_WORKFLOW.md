# ECC w Cursor — standard ciągłej pracy (BitRymDym)

**Status:** aktywna integracja lokalna (minimalna)  
**Źródło ECC:** https://github.com/affaan-m/ECC · wersja `2.2.3` · commit `90606c8315ee09cafc303515c5f33024db6b9882`  
**Nadrzędność:** SSOT + `AGENTS.md` > ECC

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

## Uwagi po review (Stage 1)

- Reguły językowe ECC używają `paths:` (format Claude); Cursor oczekuje zwykle `globs:` — scoping kontekstowy **NOT VERIFIED** / prawdopodobnie martwy. Masowa zamiana `paths`→`globs` wymaga osobnego GO (nadpisanie przy każdym update ECC).
- Siedem `common-*.mdc` bez frontmatteru (`common-agents`, `common-code-review`, `common-coding-style`, `common-hooks`, `common-patterns`, `common-performance`, `common-security`) — nie patchowane w Stage 1; monitorować w Settings→Rules.
- Bundled skills: `.cursor/.agents/skills/` (nie auto-katalog Agent Skills w sesji Stage 1).
- Stage 1: pliki/hooks/MCP **PASS**; smoke Settings→Rules **NOT VERIFIED** bez obserwacji UI Ownera → werdykt **CONDITIONAL PASS**.

## Checklist chronionych wartości (po każdym update ECC)

Przed commitowaniem wyniku installera porównaj i przywróć, jeśli zniknęło:

| Plik | Wymagane |
|------|----------|
| `bitrymdym-ssot-over-ecc.mdc` | istnieje; `alwaysApply: true` (plik BitRymDym — nie pochodzi z ECC) |
| `common-git-workflow.mdc` | `alwaysApply: false` + description BitRymDym |
| `common-development-workflow.mdc` | `alwaysApply: false` + description BitRymDym |
| `common-testing.mdc` | `alwaysApply: false` + description BitRymDym |
| `.cursor/mcp.json` | tylko Supabase; **bez** `chrome-devtools` |
| `.cursor/hooks.json` | **nie** istnieje / hookConsent declined |
| `.cursor/settings.json` | bez niespodziewanego MCP |

## Aktualizacja ECC

1. Sklonuj oficjalne repo do katalogu TEMP (nie do worktree BitRymDym); zanotuj tag/commit.
2. `node …/install-apply.js --modules rules-core,agents-core,commands-core --target cursor --no-hooks --dry-run --json`
3. Abort przy operacjach na `mcp.json`, `hooks.json`, overlay BitRymDym.
4. Apply → od razu checklista chronionych wartości powyżej → smoke UI § powyżej.
5. Commit dopiero po PASS/CONDITIONAL z dowodami; bez `--enable-hooks` i bez profilu `full`.
