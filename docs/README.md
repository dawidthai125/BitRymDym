# Dokumentacja BitRymDym

## NEW AGENT ENTRY POINT

**Zacznij tutaj:** [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · potem [PROJECT_STATE.md](./PROJECT_STATE.md)

### Kolejność czytania

1. [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) — cold-start continuity (prod SHA vs git tip)
2. [PROJECT_STATE.md](./PROJECT_STATE.md) — gdzie jesteśmy teraz
3. [ssot/MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md) — prawda produktowa
4. [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md) — architektura techniczna
5. [decisions/OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md) — co nadal OPEN
6. [decisions/DECISION_LOG.md](./decisions/DECISION_LOG.md) — decyzje zamknięte
7. [phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md) — Community EPIC **CLOSED**
8. [phases/PHASE_RECORDING_DESIGN_FREEZE.md](./phases/PHASE_RECORDING_DESIGN_FREEZE.md) — Recording freeze **LOCKED** · Waves 1–5 **CLOSED / PRODUCTION VERIFIED**
9. Dokumentacja konkretnego feature’a — dopiero po wyborze EPIC przez Ownera

**Nie zaczynaj implementacji** przed: MASTER_HANDOFF + PROJECT_STATE + SSOT + relevant architecture + OPEN_DECISIONS + **Owner GO**.

**Next:** **E3 = PRODUCTION VERIFIED — GREEN** · app `6dfd201` · docs tip `a8e9356` · deploy `dpl_3H57UgU2TfqkYawzamsVJ13qnMsG` · Mix/Jobs/PUBLIC_AUDIO **ON** · **STORAGE-ARCH-01 = LOCKED** · STORAGE-ARCH-02 **NOT STARTED** · next = Owner docs commit GO (optional) then deferred backlog / Wave 02 only after Implementation GO.

Stała zasada: [DOCUMENTATION_CONTINUITY.md](./DOCUMENTATION_CONTINUITY.md).
**MASTER_HANDOFF** = cold-start continuity layer. Documentation ≠ proof of shipped implementation.

---

## Ownership dokumentów

| Dokument | Rola |
|----------|------|
| MASTER HANDOFF | COLD-START CONTINUITY (canonical entry) |
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

**Product / design intent** (SSOT hierarchy — unchanged constitution):

1. Najnowszy zatwierdzony SSOT
2. Dokumentacja architektury
3. Zatwierdzona specyfikacja funkcji
4. Zatwierdzony kod
5. Rozmowy i pomysły robocze

**Implementation / shipped evidence (agents):**

- Code + remote schema = evidence of what is implemented
- Documentation alone ≠ proof a feature is shipped
- Decision CLOSED ≠ delivery SHIPPED
- Production verification = separate stage

See [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [DOCUMENTATION_CONTINUITY.md](./DOCUMENTATION_CONTINUITY.md).

**Next:** STORAGE-ARCH-01 **LOCKED** · do **not** start STORAGE-ARCH-02 without Implementation GO — see [PROJECT_STATE.md](./PROJECT_STATE.md).

---

## Indeks

| Dokument | Opis |
|----------|------|
| [PROJECT_STATE.md](./PROJECT_STATE.md) | Aktualny stan projektu |
| [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) | Cold-start handoff (GPT + Cursor) |
| [ssot/MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md) | Konstytucja produktu (v0.1) |
| [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md) | Baseline architektury (OD-01–03) |
| [architecture/AUTHORIZATION.md](./architecture/AUTHORIZATION.md) | Phase 1.3 AuthZ (+ 1.4 beats AuthZ notes) |
| [architecture/BEATS.md](./architecture/BEATS.md) | Phase 1.4 beats domain |
| [architecture/RECORDING.md](./architecture/RECORDING.md) | Recording / Quick Take architecture index (freeze LOCKED) |
| [architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) | E3 Full Audio architecture lock (Hybrid C · OAD · OD-E36-04) |
| [architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](./architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md) | E3 waves · E3.1→E3.6 Production · E3.7 @ `17c4d530` (not Production) |
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
| [audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md) | Recording Wave 5 production closeout |
| [audits/E3_6_PRODUCTION_CLOSEOUT.md](./audits/E3_6_PRODUCTION_CLOSEOUT.md) | E3.6 Basic MP3 production closeout (DARK) |
| [audits/E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md) | E3.7 Premium Render implementation closeout (not Production) |
| [audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md) | E3 Production Enablement Design Freeze |
| [audits/STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) | Storage Architecture V1 Design Freeze — **LOCKED** |
| [audits/STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md) | STORAGE-ARCH-01 audit · PASS WITH FINDINGS |
| [audits/E3_WORKER_INFRASTRUCTURE_GO2.md](./audits/E3_WORKER_INFRASTRUCTURE_GO2.md) | OWNER GO #2 Worker Infrastructure — **CLOSED / SUPERSEDED** (Contabo) |
| [audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md) | E3.8 W6 closeout · CLOSED / PASS · Owner-accepted emulated |
| [audits/E3_8_W6_MOBILE_CERT_PLAN.md](./audits/E3_8_W6_MOBILE_CERT_PLAN.md) | E3.8 W6 Mobile Certification Design Freeze |
| [audits/E3_8_W6_CERT_CHECKLIST.md](./audits/E3_8_W6_CERT_CHECKLIST.md) | E3.8 W6 certification checklist (Owner-accepted emulated) |
| [runbooks/PRODUCTION_BOOTSTRAP.md](./runbooks/PRODUCTION_BOOTSTRAP.md) | Phase 1.9 operator production bootstrap (historical) |
| [DOCUMENTATION_CONTINUITY.md](./DOCUMENTATION_CONTINUITY.md) | Stała zasada ciągłości docs |
| [CHANGELOG.md](./CHANGELOG.md) | Historia zmian dokumentacji |

---

## Zasada dla Cursor Agent

Patrz SSOT §51–§52. Instrukcje po polsku; nazwy techniczne po angielsku, gdy wymaga tego standard.

**APPLICATION:** Foundation 1.3–1.9 **LOCKED** · Community EPIC **COMPLETE / LOCKED** @ `c5e1f17` · Recording Waves 1–5 **CLOSED** · D02 **SHIPPED** @ `e98ba52` · **E3 = PRODUCTION VERIFIED — GREEN** @ `6dfd201` · deploy `dpl_3H57UgU2TfqkYawzamsVJ13qnMsG` · Mix/Jobs/PUBLIC_AUDIO **ON** · **STORAGE-ARCH-01 = LOCKED**.
**Next:** STORAGE-ARCH-02 **NOT STARTED** (requires Implementation GO) · see [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [PROJECT_STATE.md](./PROJECT_STATE.md).
