# Prompt startowy — nowy Cursor Agent

Skopiuj poniższy blok do nowego czatu Cursor Agent w repo `bitrymdym`.

---

Jesteś Cursor Agentem w BitRymDym. Wykonujesz kod, testy, Git i standardowy pipeline według lokalnego `AGENTS.md`. Owner = Prezes Dawid.

## Canonical reading order

1. `AGENTS.md` (Next rules · audio egress · autonomia · protokół skills/subagentów)
2. `docs/FINAL_COLD_START_HANDOFF.md` §0
3. `docs/PROJECT_STATE.md` §2 (living tip / deploy / NEXT)
4. `docs/PROJECT_FUNCTIONAL_MAP.md`
5. `docs/MASTER_HANDOFF.md` (tylko continuity — tip zawsze z PROJECT_STATE)
6. `docs/CHANGELOG.md` (najnowsze)
7. Decyzje / audity wskazane przez SSOT dla zadania

**Przed każdym nowym zadaniem** potwierdź aktualny `git rev-parse HEAD` + `git ls-remote origin refs/heads/main` i wiersz PRODUCTION DEPLOYMENT w PROJECT_STATE — **nie ufaj staremu SHA z pamięci czatu**.

## Skills i subagenci (obowiązkowe)

- Przed pracą sprawdź dostępne skillsy i przeczytaj **tylko** pasujące.
- Read-only subagenci: niezależne audyty, bezpieczeństwo, zakres staged, weryfikacja faktów.
- Główny agent edytuje zakres.
- Brakujący skill: wyłącznie oficjalne/curated GitHub + manifest + pinned version; zakaz bootstrapów i przypadkowych binariów; zapisz źródło/wersję w raporcie.
- Sacred WIP `src/lib/takes/recording-eligibility-service.ts`: **nigdy** nie czytaj / nie szukaj / nie diffuj / nie haszuj / nie przekazuj subagentom.
- Dirty WIP: PRESERVE — bez reset/stash/sync niepowiązanego worktree.

## Aktualny model produktu (2026-10-24)

- **Motyw:** dark default · light papier · Motyw przed Zaloguj/UserMenu · `bitrymdym.theme` · OD-15/OD-16 **OPEN**.
- **Studio:** hub `/studio` · editor · takes · R **unarmed** na seed VOCAL (`35543c8`) · REC wymaga PUBLISHED + świadome R.
- **RLS:** `beat_audio_assets_select_own` (`1e75fd3`) — owner SELECT własnych assetów (w tym DRAFT); lokalnie PASS; **prod apply NOT RUN**.
- **Local E2E:** Fake MediaRecorder + fixture webm — nie dowód realnego mic/prod audio.
- **Local env:** Docker + Supabase loopback `:54421` · Next temp `:3460` · `.env.local` bajt w bajt · bez `db reset`/seedów bez GO.
- **Premium Retention:** HOLD (local WIP).

## Dowody (nie zgaduj)

| Obszar | Status |
|--------|--------|
| Commits `1e75fd3` + `35543c8` on `main` | pushed |
| Public deploy @ `35543c8` + public smoke | PASS |
| Admin authenticated visual smoke | PASS |
| Prod USER RLS / audio-REC / migracje | NOT VERIFIED / NOT RUN |

Szczegóły: `docs/audits/_studio_recording_local_e2e_2026-10-24/` · `ADMIN_SESSION_AUTH_VISUAL_SMOKE_2026-10-24.md`.

## Otwarte ryzyka przed kolejnymi zadaniami

1. Produkcyjna migracja owner SELECT — osobna bramka Ownera.
2. Produkcyjny USER RLS / Studio po zalogowaniu USER — NOT VERIFIED.
3. Produkcyjne audio / REC / Play masters — zakaz egress bez GO.
4. Sacred WIP + mixed dirty tree — nie sprzątaj.

## Autonomia

Zwykły cykl (implementacja → testy → commit → push `main` → auto-deploy) wg `AGENTS.md`. Bramki bezpieczeństwa (destrukcyjne migracje, force-push, sekrety, Sacred WIP, prod DB write) wymagają osobnej zgody Ownera.
