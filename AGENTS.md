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

**Polityka Git (zatwierdzona):** zwykłe, bezpieczne, path-scoped commit i push są dozwolone według tej autonomii. **Osobnego GO** nadal wymagają: chroniony / mixed WIP (Sacred, Studio chronione, `SYSTEM_ARCHITECTURE.md`, oraz dirty `PROJECT_STATE.md` / `CHANGELOG.md` bez izolacji lub jawnego GO na cały plik), operacje destrukcyjne (`reset --hard`, force-push, stash/clean niepowiązanego WIP), migracje i zapisy produkcyjne poza zatwierdzonym procesem, oraz twierdzenia `PRODUCTION VERIFIED` / Product GREEN bez niezależnych dowodów. Jawne GO Ownera w bieżącej rozmowie może zawęzić commit/push dla konkretnej fazy — wtedy obowiązuje to GO.

## Zasady architektury (obowiązkowe)

- **SSOT FIRST** · **REUSE FIRST** · **ZERO DUPLICATE LOGIC** · **MOBILE FIRST**
- **MODIFY BEFORE CREATE** — jeśli istniejący komponent, serwis, hook, helper, endpoint lub dokument spełnia tę samą odpowiedzialność, najpierw oceń rozbudowę lub refaktoryzację; nowy element tylko gdy istniejący nie wystarcza albo rozdzielenie jest architektonicznie uzasadnione (powód w raporcie).
- **ONE CANONICAL IMPLEMENTATION** — jedna odpowiedzialność ma jedno kanoniczne miejsce (mapa: `docs/architecture/REUSE_SSOT_MAP.md`), chyba że architektura uzasadnia inaczej.
- **VERIFY BEFORE CLAIMING** — nie zgłaszaj ukończenia, PASS, deploy ani produkcji bez dowodów; rozróżniaj FACT / INFERENCE / NOT VERIFIED / BLOCKED.
- **CONTINUITY FIRST** — po istotnej jednostce pracy zostaw stan do przejęcia: aktualizuj właściwe istniejące dokumenty (nie twórz drugiego master handoffu); handoff wykonawczy → `docs/operations/SESSION_BRIDGE.md`; tip/deploy/NEXT → `docs/PROJECT_STATE.md`.

## Kolejność

1. Ustal zakres i kryteria akceptacji.
2. Sprawdź `git status`. Zostaw niepowiązane zmiany i Sacred WIP: `src/lib/takes/recording-eligibility-service.ts`.
3. Przeczytaj SSOT i decyzje właściwe dla zmiany. Przed nowym kodem: `docs/architecture/REUSE_SSOT_MAP.md` + skill `architecture-and-reuse` (gdy dostępny). Nie zamykaj decyzji OPEN, w tym OD-15, bez procesu decyzji.
4. Zaimplementuj zakres. Refaktoryzacja tylko taka, jakiej ten zakres wymaga.
5. Uruchom testy, lint, typecheck, build i kontrole dobrane do ryzyka. Popraw błędy znalezione w tych kontrolach.
6. Przejrzyj diff. Nie commituj `.env`, tokenów, kluczy, logów z danymi poufnymi ani przypadkowych artefaktów. Nie używaj `git add -A`, `-u` ani `.`.
7. Zrób commit zakresu.
8. Push na `main`, gdy kontrole przeszły i push nie nadpisuje cudzej pracy ani niepowiązanego lokalnego WIP. Powiązane drobne poprawki zbierz w jeden push albo jeden PR — patrz „Budżet wdrożeń Vercel”.
9. Poczekaj na wynik istniejącego pipeline tylko wtedy, gdy push na `main` zmienia wdrożoną aplikację: to jeden produkcyjny build Vercel ze wspólnego limitu 100/dzień (patrz „Budżet wdrożeń Vercel”). Model: `docs/PROJECT_STATE.md`, sekcja PRODUCTION DEPLOYMENT. Przed twierdzeniem o produkcji sprawdź aktualny deployment właściwego projektu, brancha i commita.
10. Sprawdź status, log builda i podstawowe działanie. Nie odtwarzaj produkcyjnych masterów i nie zmieniaj danych ani nagrań użytkowników. Obowiązuje blok audio egress powyżej.
11. Bezpieczną, ograniczoną poprawkę w tym samym zakresie przeprowadź ponownie przez kroki 5–10. Zanim wypchniesz ją osobno na `main`, dołącz ją do jeszcze niewysłanej zmiany — każdy taki push to osobny produkcyjny build.
12. Zgłoś commit, testy, deployment i ryzyka. Sam commit nie jest wdrożeniem. Status wdrożenia nie potwierdza wszystkich funkcji.

## Budżet wdrożeń Vercel

Plan Hobby ma **100 wdrożeń na dobę** wspólnie dla wgdom, KosztownyTajski i BitRymDym. `git.deploymentEnabled` nie tworzy wdrożenia dla żadnej gałęzi poza `main` (także `cursor/*`, `feat/*`, `fix/*`, `perf/*`). Każdy push na `main`, który zmienia wdrożoną aplikację, zużywa jeden produkcyjny build.

- Łącz powiązane drobne poprawki w jeden PR. Nie pushuj follow-upów na `main` pojedynczo.
- Nie otwieraj jednorazowych PR-ów.
- Testuj lokalnie, zanim cokolwiek trafi na `main`.
- Commit wyłącznie z docs, markdown, `.github`, `.cursor`, testami albo dokumentacją agentów pomija build (`ignoreCommand`). Brak `HEAD^` albo jakakolwiek zmiana aplikacji wymusza build.

## Bramki — osobna zgoda

- destrukcyjna migracja albo migracja z istotnym ryzykiem utraty danych;
- masowe usuwanie danych, kont albo zasobów produkcyjnych;
- `git reset --hard`, force-push, usuwanie cudzych commitów, nadpisanie Sacred WIP;
- czyszczenie, stash, reset albo synchronizacja niepowiązanego dirty worktree;
- zmiana uprawnień administracyjnych, rotacja sekretów, osłabienie zabezpieczeń;
- infrastruktura, rozliczenia i zasoby chmurowe poza standardowym pipeline Vercel;
- zapis albo inna niezatwierdzona operacja na produkcyjnej bazie;
- obejście zabezpieczeń platformy albo cudzych uprawnień;
- instalacja gstack, Superpowers albo `frontend-design`;
- ingerencja w pliki chronione (Sacred WIP; `studio-editor.tsx`; `studio-service.ts`; `docs/architecture/SYSTEM_ARCHITECTURE.md`) oraz commit mixed WIP `PROJECT_STATE.md` / `CHANGELOG.md` bez izolacji lub jawnego GO na cały plik.

Gdy kontrola nie przejdzie, pojawi się konflikt, ryzyko utraty danych albo niepewność środowiska, zatrzymaj ryzykowny krok. Bezpieczną przyczynę w zakresie zadania diagnozuj i napraw. O decyzję proś przy bramce albo gdy nie ma bezpiecznego dalszego kroku.

Rollback może iść autonomicznie tylko wtedy, gdy procedura jest wcześniej zatwierdzona, odwracalna, nie grozi utratą danych i wiadomo, do jakiego stanu wrócić. W przeciwnym razie zatrzymaj się, podaj dowody i opcje.

## Design

Istniejący wygląd jest punktem odniesienia. Zwykłe zadanie funkcjonalne nie przebudowuje design systemu. Wyraźne zlecenie redesignu obejmuje nowe koncepcje wizualne, typografię, paletę, układ i język artystyczny w tym zakresie. Historyczny Design Freeze zamyka dawny zakres. Nie traktuj go jako zakazu zleconego redesignu i nie oznaczaj OD-15 jako CLOSED przy okazji wyglądu.

<!-- END:bitrymdym-autonomy-policy -->

<!-- BEGIN:bitrymdym-cursor-skills-protocol -->

# Protokół skills i subagentów (Cursor)

Trwały protokół pracy agenta Cursor w BitRymDym (nie zastępuje autonomii ani bramek powyżej).

1. **Przed zadaniem** sprawdź dostępne Agent Skills i przeczytaj instrukcje **tylko** pasujących skillsów (np. research-and-planning, architecture-and-reuse, documentation-audit, security-review, testing-and-verification, deployment-readiness, frontend-ux).
2. **Read-only subagenci** — używaj ich do niezależnych analiz, audytów bezpieczeństwa, kontroli zakresu staged i weryfikacji faktów. Subagent nie edytuje plików, nie dostaje sekretów / env / cookies i **nigdy** nie dostaje Sacred WIP.
3. **Brief podagenta (obowiązkowy)** — cel i kryteria akceptacji; zasady architektury z tej polityki; konkretne pliki w zakresie; zakaz duplikatów / MODIFY BEFORE CREATE; lista chronionych ścieżek; bezpieczny skrót stanu Git/WIP (bez treści Sacred); wymóg raportu: zmienione pliki, testy, ryzyka, otwarte problemy. Podagent **nie** rozszerza zakresu samodzielnie. Przy równoległych edycjach zakresy muszą być rozłączne albo scalenie kontrolowane przez głównego agenta.
4. **Główny Cursor** wykonuje edycje w zakresie zlecenia.
5. **Brakujący skill** — wolno doinstalować wyłącznie z oficjalnego lub curated źródła GitHub po odczycie manifestu/instrukcji i przypięciu wersji albo commita. Zakaz niezweryfikowanych bootstrap scriptów, przypadkowych promptów i binariów. W raporcie podaj nazwę, źródło i wersję. Instalacja bez osobnego GO Ownera jest zabroniona, gdy zmienia środowisko poza bieżącym zadaniem.
6. **Sacred WIP** `src/lib/takes/recording-eligibility-service.ts` — nigdy nie czytaj, nie wyszukuj, nie diffuj, nie haszuj i nie przekazuj agentom.
7. **Dirty WIP** — zachowuj; nie czyść, nie stashuj, nie resetuj i nie synchronizuj niepowiązanego worktree bez bramki Ownera.
8. **Dokumentacja vs produkcja** — lokalny PASS ≠ produkcja; Ready deploy ≠ funkcjonalne GREEN. Aktualny tip i deploy → `docs/PROJECT_STATE.md`.
9. **ECC (Cursor)** — lokalna instalacja w `.cursor/` wspiera planowanie/review; **nie** zastępuje tego protokołu ani SSOT. Hierarchia i ograniczenia: reguła `bitrymdym-ssot-over-ecc.mdc` oraz `docs/operations/ECC_CURSOR_WORKFLOW.md`. Hooki ECC domyślnie wyłączone. ECC `save-session` / `resume-session` **nie** są kanoniczną ciągłością — kanon: PROJECT_STATE + SESSION_BRIDGE.

<!-- END:bitrymdym-cursor-skills-protocol -->

