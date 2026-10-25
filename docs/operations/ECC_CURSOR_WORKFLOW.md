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

## Uwagi po review

- Reguły językowe ECC używają często `paths:` (format Claude); w Cursor standardem bywa `globs:` — scoping może być martwy (**NOT VERIFIED**).
- Lokalny patch BitRymDym: `alwaysApply: false` na trzech common workflow/testing — **przywrócić po update ECC**, jeśli instalator nadpisze frontmatter.
- Bundled skills są pod `.cursor/.agents/skills/`, nie pod `.cursor/skills/`.

## Aktualizacja ECC

1. Sklonuj oficjalne repo do katalogu TEMP (nie do worktree BitRymDym).
2. `node …/install-apply.js --modules rules-core,agents-core,commands-core --target cursor --no-hooks --dry-run`
3. Sprawdź kolizje z `mcp.json`, `settings.json`, overlay BitRymDym oraz czy frontmatter `alwaysApply: false` na common git/dev/testing przetrwał.
4. Zastosuj dopiero po przeglądzie planu.
