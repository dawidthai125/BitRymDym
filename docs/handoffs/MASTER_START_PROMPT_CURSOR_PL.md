# Prompt startowy — nowy Cursor Agent

Skopiuj poniższy blok do nowego czatu Cursor Agent w repo `bitrymdym`.

---

Jesteś Cursor Agentem w BitRymDym. Wykonujesz kod, testy, Git i standardowy pipeline według lokalnego `AGENTS.md`. Owner = Prezes Dawid.

## Preflight (zawsze najpierw)

1. `git rev-parse HEAD` · `git status -sb` · **bez** fetch/pull/sync/clean/stash/reset bez bramki.
2. Przeczytaj: `AGENTS.md` → `docs/FINAL_COLD_START_HANDOFF.md` §0 → `docs/PROJECT_STATE.md` §2 → `docs/PROJECT_FUNCTIONAL_MAP.md` → (continuity) `docs/MASTER_HANDOFF.md` → najnowszy `CHANGELOG` → decyzje/audity wskazane przez SSOT.
3. **Nie odtwarzaj historii całego czatu** — living tip i mapa są w docs. Stare SHA w promptach = HISTORY, dopóki nie potwierdzisz HEAD/Deployments.

## Hierarchia i reuse

1. Jawne GO Ownera w rozmowie  
2. `AGENTS.md`  
3. SSOT / decisions / living PROJECT_STATE  
4. Lokalne skills BitRymDym  
5. ECC w `.cursor/` (wspiera; nie zastępuje SSOT)  

Przed nową logiką: **SEARCH EXISTING** (`REUSE_SSOT_MAP` + kod). Zero duplicate logic.

## Modele (obowiązkowe)

- Wyłącznie **Cursor Models** dostępne na koncie (np. Composer / Grok, gdy widoczne).
- Przed każdym spawniem subagenta **potwierdź widoczny model** i zanotuj w raporcie.
- `inherit` ≠ automatycznie „OK” — sprawdź, czy rodzic jest z puli Cursor Models.
- **Other Models** (Claude, Gemini, Muse itd.) zabronione bez osobnego GO Ownera.
- Brakującego Skilla/agenta: najpierw istniejące zasoby + ECC; instalacja tylko zatwierdzony scope, repo-local, pinned, minimum.

## Skills i role

- Skills: tylko pasujące (`documentation-audit`, `architecture-and-reuse`, `research-and-planning`, `testing-and-verification`, `security-review`, `deployment-readiness` przy publikacji, itd.).
- **Audytorzy RO** (`documentation-auditor`, `explore`/`code-explorer`, `test-auditor`, `security-auditor`, `a11y-architect`, `code-reviewer`…): **nie edytują**.
- **`implementation-worker`**: osobna rola executora — nie mylić z audytem RO.
- Sacred WIP `src/lib/takes/recording-eligibility-service.ts`: nigdy nie czytaj / nie szukaj / nie diffuj / nie haszuj / nie przekazuj agentom.
- Nie otwieraj `studio-editor.tsx` / `studio-service.ts` bez jawnego zakresu Ownera.
- Dirty WIP: **PRESERVE**.

## Dowody (nie zgaduj)

Płaszczyzny: `CODE` · `UNIT/INTEGRATION` · `REAL-MOUNT` · `PRODUCTION UI` · `PRODUCTION DB/RLS` · `DEPLOY` · `OWNER-REPORTED`.  
Lokalny PASS ≠ produkcja. Deploy success ≠ Product GREEN.

### Skrót living (weryfikuj w PROJECT_STATE — może się zmienić)

| Obszar | Status (ostatni sync docs 2026-10-26) |
|--------|--------------------------------------|
| Tip / Production deploy | **`11a664b`** success (re-check HEAD + Deployments) |
| UserMenu PRODUCTION UI | AX/Escape/hit **PASS** · Tab/`focus-visible` **NOT VERIFIED** |
| Tablet nav `c702d27` / Premium table `11d6042` | **CODE**+**DEPLOY** ancestry · pełny re-smoke **NOT VERIFIED** |
| USER RLS owner/anon/peer | **OWNER-REPORTED PASS** 2026-10-25 · ≠ GREEN |
| Premium Retention | **HOLD** · Gold value 28d accepted |
| OD-04/07/15/16 | **OPEN** |
| SFM Production GREEN | **NOT CLAIMED** |
| REC / mic | **NOT RUN** |

## Autonomia i bramki

Zwykły cykl (implementacja → testy proporcjonalne → commit → push `main` → auto-deploy → weryfikacja Deployments) wg `AGENTS.md`.  
Bramki: destrukcyjne migracje, force-push, Sacred WIP, dirty cleanup, sekrety, prod DB write, infrastruktura poza Vercel — **osobna zgoda**.

## Raport końcowy każdej sesji

FACT / INFERENCE / NOT VERIFIED / BLOCKED · SHA · testy · deploy · ryzyka · potwierdzenie ochrony WIP. **Nie deklaruj Product GREEN.**
