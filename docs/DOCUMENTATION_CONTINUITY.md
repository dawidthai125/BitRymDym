# Documentation Continuity Rule

**Status:** STAŁA ZASADA PROJEKTU  
**Data ustanowienia:** 2026-09-25  
**Owner:** Prezes Dawid  
**Architekt:** ChatGPT (Chief Product / Technical / UX Architect)

---

## Treść

KAŻDA NOWA:

- decyzja,
- funkcja,
- implementacja,
- zmiana architektury,
- zmiana reguły biznesowej,
- zmiana statusu,
- zamknięcie decyzji,
- otwarcie nowego blokera,
- istotna zmiana UX,

**MUSI** zostać odzwierciedlona w odpowiednim dokumencie.

Nie wolno kończyć zadania z kodem / decyzją, której stan nie jest opisany w dokumentacji.

Dokumentacja nie jest dodatkiem.  
Dokumentacja jest częścią ukończenia zadania.

---

## Evidence vs documentation

| Warstwa | Rola |
|---------|------|
| Dokumentacja | Opisuje intended / product / design / continuity state |
| Kod + remote schema | **Evidence** implementation state |
| Production verification | Osobny etap (deploy + verify) — nie mylić z samym wpisem docs |

**Decision CLOSED ≠ feature SHIPPED.**  
Dokumentacja sama w sobie **nie** jest dowodem, że feature jest shipped.  
Implementację potwierdza code/schema (+ production verify, gdy dotyczy).

---

## Minimalny proces

```text
IMPLEMENTATION
→ TEST
→ DOCUMENTATION UPDATE
→ PRZEGLĄD DIFFU
→ COMMIT
→ PUSH na main
→ DEPLOY / VERIFY
```

Zwykłe zlecenie nie czeka na osobną zgodę przed commitem, pushem ani standardowym deploymentem. Kolejność i bramki bezpieczeństwa: [AGENTS.md](../AGENTS.md), polityka autonomii. Dokumentacja nadal jest częścią ukończenia, nie dowodem wdrożenia.

(Dla sesji wyłącznie dokumentacyjnej: pomiń IMPLEMENTATION i test kodu aplikacji. Zostaw aktualizację dokumentów, przegląd diffu i — gdy zakres na to pozwala — commit, push i wynik auto-deployu.)

---

## Ownership dokumentów

| Dokument | Odpowiedzialność |
|----------|------------------|
| FINAL COLD START HANDOFF | **START HERE** — new GPT + Cursor ultra entry · HOW TO START · Sacred WIP |
| MASTER HANDOFF | Full continuity / architecture handoff (detail after cold start) |
| MASTER SSOT | WHAT / PRODUCT TRUTH |
| SYSTEM ARCHITECTURE | HOW / TECHNICAL ARCHITECTURE |
| REUSE / SSOT MAP | Domain → SSOT → owner → location · **DO NOT DUPLICATE** · **MODIFY BEFORE CREATE** / **ONE CANONICAL** ([architecture/REUSE_SSOT_MAP.md](./architecture/REUSE_SSOT_MAP.md) · zasady w [AGENTS.md](../AGENTS.md)) — **nie** jest handoffem tipu/sesji |
| DECISION LOG | WHY / DECISION HISTORY |
| OPEN DECISIONS | WHAT IS STILL UNDECIDED |
| PROJECT STATE | WHERE ARE WE NOW (living tip / dual-plane) |
| SESSION BRIDGE | **Wykonawcze przekazanie sesji** (cold-start checklist, WIP snapshot status-only, rejestr `EXECUTED`, handoff po zadaniu) — **nie** living tip / deploy / NEXT / produkcja · **nie** mapa reuse ([operations/SESSION_BRIDGE.md](./operations/SESSION_BRIDGE.md)) |
| PHASE DOCUMENTS | WHAT PHASE / SCOPE |
| FEATURE DOCUMENTATION / AUDITS | HOW A FEATURE WORKS · evidence |
| CHANGELOG | WHAT CHANGED OVER TIME |

**Podział ról (anti-dupe dokumentów):** `SESSION_BRIDGE` = ciągłość **wykonawcza** między sesjami agenta. `REUSE_SSOT_MAP` = kanoniczna mapa **ponownego użycia** i zapobiegania drugiej implementacji. Living tip/deploy/NEXT = wyłącznie `PROJECT_STATE`. Nie tworzyć trzeciego konkurencyjnego mechanizmu handoffu (np. nowego „master contract” dokumentu).

Nie duplikować całych treści — stosować linki / referencje.
Nie tworzyć drugiego „master” handoffu.

---

## Wymaganie wobec nowego agenta

Nowy Cursor Agent lub nowy ChatGPT musi móc z dokumentacji ustalić:

- czym jest projekt,
- aktualny stan,
- architektura,
- decyzje zamknięte / otwarte,
- co zaimplementowano (weryfikując code/schema),
- co następne (**Owner direction** — bez auto-epic),
- blokery,
- gdzie jest SSOT,
- aktualna wersja / branch / HEAD vs production SHA,
- co zrobiono w ostatnim etapie.

**Nie wolno** wymagać czytania całej historii rozmów.

**Canonical entry (cold start):** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) → [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) → [PROJECT_STATE.md](./PROJECT_STATE.md) → [operations/SESSION_BRIDGE.md](./operations/SESSION_BRIDGE.md) (kontekst wykonawczy sesji; **≠** tip/deploy) → kolejność w [README.md](./README.md). Living tip/deploy/NEXT = **PROJECT_STATE only**. MASTER_HANDOFF = szczegółowa ciągłość / historia — nie konkuruje z tipem.
