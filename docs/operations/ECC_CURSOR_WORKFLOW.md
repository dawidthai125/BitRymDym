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
| Skills ECC | `.cursor/skills/` | puste w tej instalacji — skills projektowe pozostają w `.agents/skills/` i user skills |

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

## Aktualizacja ECC

1. Sklonuj oficjalne repo do katalogu TEMP (nie do worktree BitRymDym).
2. `node …/install-apply.js --modules rules-core,agents-core,commands-core --target cursor --no-hooks --dry-run`
3. Sprawdź kolizje z `mcp.json`, `settings.json`, overlay BitRymDym.
4. Zastosuj dopiero po przeglądzie planu.
