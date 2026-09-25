# Dokumentacja BitRymDym

## NEW AGENT ENTRY POINT

**Zacznij tutaj:** [PROJECT_STATE.md](./PROJECT_STATE.md)

### Kolejność czytania

1. [PROJECT_STATE.md](./PROJECT_STATE.md) — gdzie jesteśmy teraz
2. [ssot/MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md) — prawda produktowa
3. [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md) — architektura techniczna
4. [decisions/OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md) — co nadal OPEN
5. [decisions/DECISION_LOG.md](./decisions/DECISION_LOG.md) — decyzje zamknięte
6. [phases/PHASE_1_FOUNDATION.md](./phases/PHASE_1_FOUNDATION.md) — zakres Fazy 1
7. Dokumentacja konkretnego feature’a — jeżeli agent wykonuje feature

**Nie zaczynaj implementacji** przed sprawdzeniem: PROJECT_STATE + SSOT + relevant architecture + OPEN_DECISIONS.

Stała zasada: [DOCUMENTATION_CONTINUITY.md](./DOCUMENTATION_CONTINUITY.md).

---

## Ownership dokumentów

| Dokument | Rola |
|----------|------|
| MASTER SSOT | WHAT / PRODUCT TRUTH |
| SYSTEM ARCHITECTURE | HOW / TECHNICAL ARCHITECTURE |
| DECISION LOG | WHY / DECISION HISTORY |
| OPEN DECISIONS | WHAT IS STILL UNDECIDED |
| PROJECT STATE | WHERE ARE WE NOW |
| PHASE DOCUMENTS | WHAT PHASE / SCOPE |
| FEATURE DOCUMENTATION | HOW A FEATURE WORKS |
| CHANGELOG | WHAT CHANGED OVER TIME |

Nie duplikować całych treści — stosować linki.

---

## Hierarchia źródła prawdy

1. Najnowszy zatwierdzony SSOT
2. Dokumentacja architektury
3. Zatwierdzona specyfikacja funkcji
4. Zatwierdzony kod
5. Rozmowy i pomysły robocze

---

## Indeks

| Dokument | Opis |
|----------|------|
| [PROJECT_STATE.md](./PROJECT_STATE.md) | Aktualny stan projektu / handoff |
| [ssot/MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md) | Konstytucja produktu (v0.1) |
| [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md) | Baseline architektury (OD-01–03) |
| [architecture/AUTHORIZATION.md](./architecture/AUTHORIZATION.md) | Phase 1.3 AuthZ (+ 1.4 beats AuthZ notes) |
| [architecture/BEATS.md](./architecture/BEATS.md) | Phase 1.4 beats domain |
| [architecture/APPLICATION_SCAFFOLD.md](./architecture/APPLICATION_SCAFFOLD.md) | Phase 1.2 scaffold notes |
| [architecture/README.md](./architecture/README.md) | Status architektury (skrót) |
| [decisions/OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md) | Decyzje OPEN / CLOSED |
| [decisions/DECISION_LOG.md](./decisions/DECISION_LOG.md) | Historia zatwierdzonych decyzji |
| [phases/PHASE_1_FOUNDATION.md](./phases/PHASE_1_FOUNDATION.md) | Faza 1 — Fundament |
| [phases/PHASE_1_5_DESIGN_FREEZE.md](./phases/PHASE_1_5_DESIGN_FREEZE.md) | Phase 1.5 Design Freeze (LOCKED) |
| [phases/PHASE_1_6_DESIGN_FREEZE.md](./phases/PHASE_1_6_DESIGN_FREEZE.md) | Phase 1.6 Design Freeze (APPROVED / LOCKED) |
| [DOCUMENTATION_CONTINUITY.md](./DOCUMENTATION_CONTINUITY.md) | Stała zasada ciągłości docs |
| [CHANGELOG.md](./CHANGELOG.md) | Historia zmian dokumentacji |

---

## Zasada dla Cursor Agent

Patrz SSOT §51–§52. Instrukcje po polsku; nazwy techniczne po angielsku, gdy wymaga tego standard.

**APPLICATION:** Auth (1.3) + Beats metadata (1.4) + Private audio Access Gate (1.5 LOCKED) + Published Beats Surface / Playback Shell (1.6 local).
**Canonical pushed baseline:** `main` @ `7de20a3`.
**Next:** Phase 1.6 Implementation Audit → commit / push.
