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
→ AUDIT
→ OWNER REVIEW
→ COMMIT
→ PUSH
→ DEPLOY / VERIFY
```

(Dla sesji wyłącznie dokumentacyjnych: pomiń IMPLEMENTATION / TEST kodu aplikacji, zachowaj DOCUMENTATION UPDATE → AUDIT → OWNER REVIEW.)

---

## Ownership dokumentów

| Dokument | Odpowiedzialność |
|----------|------------------|
| MASTER HANDOFF | COLD-START CONTINUITY (new GPT + Cursor) — **canonical entry** |
| MASTER SSOT | WHAT / PRODUCT TRUTH |
| SYSTEM ARCHITECTURE | HOW / TECHNICAL ARCHITECTURE |
| DECISION LOG | WHY / DECISION HISTORY |
| OPEN DECISIONS | WHAT IS STILL UNDECIDED |
| PROJECT STATE | WHERE ARE WE NOW |
| PHASE DOCUMENTS | WHAT PHASE / SCOPE |
| FEATURE DOCUMENTATION | HOW A FEATURE WORKS |
| CHANGELOG | WHAT CHANGED OVER TIME |

Nie duplikować całych treści — stosować linki / referencje.

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

**Canonical entry:** [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) → [PROJECT_STATE.md](./PROJECT_STATE.md) → kolejność w [README.md](./README.md).
