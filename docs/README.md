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
8. [phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md) — Community Upload + Moderation **EPIC COMPLETE / LOCKED**
9. [phases/PHASE_RECORDING_DESIGN_FREEZE.md](./phases/PHASE_RECORDING_DESIGN_FREEZE.md) — Recording / Quick Take **DESIGN FREEZE LOCKED** (implementation awaits Wave 1 GO)

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
| [architecture/RECORDING.md](./architecture/RECORDING.md) | Recording / Quick Take architecture index (freeze LOCKED) |
| [architecture/APPLICATION_SCAFFOLD.md](./architecture/APPLICATION_SCAFFOLD.md) | Phase 1.2 scaffold notes |
| [architecture/README.md](./architecture/README.md) | Status architektury (skrót) |
| [decisions/OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md) | Decyzje OPEN / CLOSED |
| [decisions/DECISION_LOG.md](./decisions/DECISION_LOG.md) | Historia zatwierdzonych decyzji |
| [phases/PHASE_1_FOUNDATION.md](./phases/PHASE_1_FOUNDATION.md) | Faza 1 — Fundament |
| [phases/PHASE_1_5_DESIGN_FREEZE.md](./phases/PHASE_1_5_DESIGN_FREEZE.md) | Phase 1.5 Design Freeze (LOCKED) |
| [phases/PHASE_1_6_DESIGN_FREEZE.md](./phases/PHASE_1_6_DESIGN_FREEZE.md) | Phase 1.6 Design Freeze (APPROVED / LOCKED) |
| [phases/PHASE_1_7_DESIGN_FREEZE.md](./phases/PHASE_1_7_DESIGN_FREEZE.md) | Phase 1.7 Design Freeze (APPROVED / LOCKED) |
| [phases/PHASE_1_8A_DESIGN_FREEZE.md](./phases/PHASE_1_8A_DESIGN_FREEZE.md) | Phase 1.8A Design Freeze (APPROVED / LOCKED) |
| [phases/PHASE_1_9_DESIGN_FREEZE.md](./phases/PHASE_1_9_DESIGN_FREEZE.md) | Phase 1.9 Design Freeze (CLOSED / LOCKED) |
| [phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md) | Community Upload + Moderation Design Freeze (**EPIC COMPLETE / LOCKED**) |
| [phases/PHASE_RECORDING_DESIGN_FREEZE.md](./phases/PHASE_RECORDING_DESIGN_FREEZE.md) | Recording / Quick Take Design Freeze v1.0 (**LOCKED**) |
| [phases/PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md](./phases/PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md) | Audio Transport V1 Design Freeze (CLOSED) |
| [audits/RECORDING_QUICK_TAKE_COLD_START_AUDIT.md](./audits/RECORDING_QUICK_TAKE_COLD_START_AUDIT.md) | Recording cold-start audit |
| [runbooks/PRODUCTION_BOOTSTRAP.md](./runbooks/PRODUCTION_BOOTSTRAP.md) | Phase 1.9 operator production bootstrap (historical) |
| [DOCUMENTATION_CONTINUITY.md](./DOCUMENTATION_CONTINUITY.md) | Stała zasada ciągłości docs |
| [CHANGELOG.md](./CHANGELOG.md) | Historia zmian dokumentacji |

---

## Zasada dla Cursor Agent

Patrz SSOT §51–§52. Instrukcje po polsku; nazwy techniczne po angielsku, gdy wymaga tego standard.

**APPLICATION:** Foundation 1.3–1.9 **LOCKED** · Community EPIC **COMPLETE / LOCKED** @ `c5e1f17` · Recording Design Freeze **LOCKED** · Wave 1–2 **CLOSED** @ `2ab3e3e` · Wave 3 **IMPLEMENTED** (Owner Review).
**Next:** Owner Review of Wave 3 → commit/push/deploy only with Owner GO. See [PROJECT_STATE.md](./PROJECT_STATE.md).
