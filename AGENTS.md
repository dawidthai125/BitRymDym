<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:bitrymdym-egress-dev-rules -->

# Audio egress — development practice (WAVE 1 OPS)

Process control (not a network firewall):

- Develop player and Studio against **local** Supabase / fixtures / mocks.
- Do **not** play full production masters during ordinary Cursor work.
- Do **not** use Simple Browser (or embedded Cursor browser) to repeatedly exercise production playback or Studio audio.
- UI layout checks must use fixtures or muted/mocked audio — never “open prod and press Play” just to verify a component.
- A production smoke test requires an explicit Owner reason, a minimal scope, and must avoid bulk full-file downloads of large masters.
- Prefer `BRD_INTEGRATION_TESTS=1` + `LOCAL_SUPABASE_*` for live-shaped tests; never point Vitest at production Storage.

<!-- END:bitrymdym-egress-dev-rules -->

<!-- BEGIN:bitrymdym-autonomy-policy -->

# Autonomia wykonawcza

To jest polityka zachowania agenta w BitRymDym. Nie nadaje uprawnień GitHuba, Vercela, Supabase ani trybu narzędzi. Odmowa platformy jest faktem. Nie obchodź jej.

Zwykłe zlecenie obejmuje analizę, implementację, testy, commit, push na `main` i standardowy deployment. Nie pytaj o zgodę na każdy z tych kroków. Pull request nie jest obowiązkowy.

## Kolejność

1. Ustal zakres i kryteria akceptacji.
2. Sprawdź `git status`. Zostaw niepowiązane zmiany i Sacred WIP: `src/lib/takes/recording-eligibility-service.ts`.
3. Przeczytaj SSOT i decyzje właściwe dla zmiany. Nie zamykaj decyzji OPEN, w tym OD-15, bez procesu decyzji.
4. Zaimplementuj zakres. Refaktoryzacja tylko taka, jakiej ten zakres wymaga.
5. Uruchom testy, lint, typecheck, build i kontrole dobrane do ryzyka. Popraw błędy znalezione w tych kontrolach.
6. Przejrzyj diff. Nie commituj `.env`, tokenów, kluczy, logów z danymi poufnymi ani przypadkowych artefaktów. Nie używaj `git add -A`, `-u` ani `.`.
7. Zrób commit zakresu.
8. Push na `main`, gdy kontrole przeszły i push nie nadpisuje cudzej pracy ani niepowiązanego lokalnego WIP.
9. Poczekaj na wynik istniejącego pipeline. Push na `main` uruchamia auto-deploy Vercel, także dla commitów samych dokumentów. Model: `docs/PROJECT_STATE.md`, sekcja PRODUCTION DEPLOYMENT. Przed twierdzeniem o produkcji sprawdź aktualny deployment właściwego projektu, brancha i commita.
10. Sprawdź status, log builda i podstawowe działanie. Nie odtwarzaj produkcyjnych masterów i nie zmieniaj danych ani nagrań użytkowników. Obowiązuje blok audio egress powyżej.
11. Bezpieczną, ograniczoną poprawkę w tym samym zakresie przeprowadź ponownie przez kroki 5–10.
12. Zgłoś commit, testy, deployment i ryzyka. Sam commit nie jest wdrożeniem. Status wdrożenia nie potwierdza wszystkich funkcji.

## Bramki — osobna zgoda

- destrukcyjna migracja albo migracja z istotnym ryzykiem utraty danych;
- masowe usuwanie danych, kont albo zasobów produkcyjnych;
- `git reset --hard`, force-push, usuwanie cudzych commitów, nadpisanie Sacred WIP;
- czyszczenie, stash, reset albo synchronizacja niepowiązanego dirty worktree;
- zmiana uprawnień administracyjnych, rotacja sekretów, osłabienie zabezpieczeń;
- infrastruktura, rozliczenia i zasoby chmurowe poza standardowym pipeline Vercel;
- zapis albo inna niezatwierdzona operacja na produkcyjnej bazie;
- obejście zabezpieczeń platformy albo cudzych uprawnień;
- instalacja gstack, Superpowers albo `frontend-design`.

Gdy kontrola nie przejdzie, pojawi się konflikt, ryzyko utraty danych albo niepewność środowiska, zatrzymaj ryzykowny krok. Bezpieczną przyczynę w zakresie zadania diagnozuj i napraw. O decyzję proś przy bramce albo gdy nie ma bezpiecznego dalszego kroku.

Rollback może iść autonomicznie tylko wtedy, gdy procedura jest wcześniej zatwierdzona, odwracalna, nie grozi utratą danych i wiadomo, do jakiego stanu wrócić. W przeciwnym razie zatrzymaj się, podaj dowody i opcje.

## Design

Istniejący wygląd jest punktem odniesienia. Zwykłe zadanie funkcjonalne nie przebudowuje design systemu. Wyraźne zlecenie redesignu obejmuje nowe koncepcje wizualne, typografię, paletę, układ i język artystyczny w tym zakresie. Historyczny Design Freeze zamyka dawny zakres. Nie traktuj go jako zakazu zleconego redesignu i nie oznaczaj OD-15 jako CLOSED przy okazji wyglądu.

<!-- END:bitrymdym-autonomy-policy -->

<!-- BEGIN:bitrymdym-cursor-skills-protocol -->

# Protokół skills i subagentów (Cursor)

Trwały protokół pracy agenta Cursor w BitRymDym (nie zastępuje autonomii ani bramek powyżej).

1. **Przed zadaniem** sprawdź dostępne Agent Skills i przeczytaj instrukcje **tylko** pasujących skillsów (np. research-and-planning, documentation-audit, security-review, testing-and-verification, deployment-readiness, frontend-ux).
2. **Read-only subagenci** — używaj ich do niezależnych analiz, audytów bezpieczeństwa, kontroli zakresu staged i weryfikacji faktów. Subagent nie edytuje plików, nie dostaje sekretów / env / cookies i **nigdy** nie dostaje Sacred WIP.
3. **Główny Cursor** wykonuje edycje w zakresie zlecenia.
4. **Brakujący skill** — wolno doinstalować wyłącznie z oficjalnego lub curated źródła GitHub po odczycie manifestu/instrukcji i przypięciu wersji albo commita. Zakaz niezweryfikowanych bootstrap scriptów, przypadkowych promptów i binariów. W raporcie podaj nazwę, źródło i wersję.
5. **Sacred WIP** `src/lib/takes/recording-eligibility-service.ts` — nigdy nie czytaj, nie wyszukuj, nie diffuj, nie haszuj i nie przekazuj agentom.
6. **Dirty WIP** — zachowuj; nie czyść, nie stashuj, nie resetuj i nie synchronizuj niepowiązanego worktree bez bramki Ownera.
7. **Dokumentacja vs produkcja** — lokalny PASS ≠ produkcja; Ready deploy ≠ funkcjonalne GREEN. Aktualny tip i deploy → `docs/PROJECT_STATE.md`.

<!-- END:bitrymdym-cursor-skills-protocol -->

