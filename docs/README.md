# Dokumentacja BitRymDym

## NEW AGENT ENTRY POINT

**Zacznij tutaj:** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) · potem [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · potem [PROJECT_STATE.md](./PROJECT_STATE.md)

### Kolejność czytania

1. [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) — ultra cold-start (nowy GPT + Cursor)
2. [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) — full continuity
3. [PROJECT_STATE.md](./PROJECT_STATE.md) — gdzie jesteśmy teraz
4. [ssot/MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md) — prawda produktowa
5. [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md) — architektura techniczna
6. [decisions/OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md) — co nadal OPEN
7. [decisions/DECISION_LOG.md](./decisions/DECISION_LOG.md) — decyzje zamknięte
8. [phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md) — Community EPIC **CLOSED**
9. [phases/PHASE_RECORDING_DESIGN_FREEZE.md](./phases/PHASE_RECORDING_DESIGN_FREEZE.md) — Recording freeze **LOCKED** · Waves 1–5 **CLOSED / PRODUCTION VERIFIED**
10. Dokumentacja konkretnego feature’a — dopiero po wyborze EPIC przez Ownera

**Nie zaczynaj implementacji** przed: FINAL COLD START + MASTER_HANDOFF + PROJECT_STATE + SSOT + relevant architecture + OPEN_DECISIONS + **Owner GO**.

**Now:** Repo tip verify `git rev-parse HEAD` · aliases → `dpl_56FGHZNNdfgZ9k2qsLGHDRD4QcX6` · App feature V2 **`44f7cbd`** (**GREEN / CLOSED**) · **STUDIO_EXPORT** local E2E **I.7 PASS** · I.3A a11y in main · **not** production GREEN · Contabo **STOPPED** · waiver `EXPORT_WAV`. Start: [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) · Living: [PROJECT_STATE.md](./PROJECT_STATE.md) · Final Mix: [decisions/STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md](./decisions/STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md).

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

**Next:** **STOP — OWNER DECISION REQUIRED** — Studio Visual Parity V2 **CLOSED / GREEN** @ `44f7cbd` · follow-ups non-blocking · do not auto-open EPIC · **SEARCH EXISTING FIRST** · see [REUSE_SSOT_MAP.md](./architecture/REUSE_SSOT_MAP.md) · [PROJECT_STATE.md](./PROJECT_STATE.md).

---

## Indeks

| Dokument | Opis |
|----------|------|
| [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) | Ultra cold-start entry (nowy GPT + Cursor) |
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
| [architecture/REUSE_SSOT_MAP.md](./architecture/REUSE_SSOT_MAP.md) | Reuse / SSOT / DO NOT DUPLICATE map (cold-start) |
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
| [audits/P7_1_6_AUTO_SAVE_CAS_PRODUCTION_CLOSEOUT.md](./audits/P7_1_6_AUTO_SAVE_CAS_PRODUCTION_CLOSEOUT.md) | Phase 7.1.6 Auto Save + CAS Completeness production closeout · **CLOSED / GREEN** @ `4fa658d` |
| [audits/P7_1_5_SHELL_POLISH_PRODUCTION_CLOSEOUT.md](./audits/P7_1_5_SHELL_POLISH_PRODUCTION_CLOSEOUT.md) | Phase 7.1.5 Shell Polish + Stacked Escape production closeout · **CLOSED / GREEN** @ `3fccbf7` (HISTORY) |
| [audits/P7_1_4_MIXER_DOCK_PRODUCTION_CLOSEOUT.md](./audits/P7_1_4_MIXER_DOCK_PRODUCTION_CLOSEOUT.md) | Phase 7.1.4 Mixer Dock production closeout · **CLOSED / GREEN** @ `9abc1b6` (ancestry) |
| [decisions/P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md](./decisions/P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md) | Phase 7.1.4 Mixer Dock design freeze · OD-P7.1.4-01…04 |
| [decisions/STUDIO_VISUAL_SHELL_DESIGN_FREEZE.md](./decisions/STUDIO_VISUAL_SHELL_DESIGN_FREEZE.md) | Studio Visual Shell Pass design freeze · OD-VS-01…05 · **not** P7.1.7 |
| [decisions/STUDIO_VISUAL_PARITY_V2_DESIGN_FREEZE.md](./decisions/STUDIO_VISUAL_PARITY_V2_DESIGN_FREEZE.md) | Studio Visual Parity V2 · **GREEN / RELEASE VERIFIED / CLOSED** @ `44f7cbd` · **not** P7.1.7 |
| [decisions/STUDIO_FINAL_MIX_DESIGN_FREEZE.md](./decisions/STUDIO_FINAL_MIX_DESIGN_FREEZE.md) | Studio Final Mix product freeze · OD-SFM · OD-VS-03 supersession for Export meaning |
| [decisions/STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md](./decisions/STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md) | STUDIO_EXPORT bake/UI stages · Stage I UI local WIP · not production GREEN |
| [architecture/STUDIO_FINAL_MIX_ARCHITECTURE_AUDIT.md](./architecture/STUDIO_FINAL_MIX_ARCHITECTURE_AUDIT.md) | Studio Final Mix architecture audit |
| [audits/POLISH_UX_PRODUCTION_CLOSEOUT.md](./audits/POLISH_UX_PRODUCTION_CLOSEOUT.md) | Polish UX Mix / Master / Recording / Playback — **CLOSED / PRODUCTION VERIFIED — PASS WITH EVIDENCE LIMITATIONS** @ `0afa29b` |
| [audits/A_ACCOUNT_BEATS_PRODUCTION_CLOSEOUT.md](./audits/A_ACCOUNT_BEATS_PRODUCTION_CLOSEOUT.md) | Wave A Account / Beats — **CLOSED / PRODUCTION VERIFIED — GREEN** @ `2c4200b` |
| [audits/FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md](./audits/FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md) | Fala 1B Account + Panel Administracyjny — **CLOSED / PRODUCTION VERIFIED — GREEN** @ `42369c0` (historical) |
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

**APPLICATION:** Foundation 1.3–1.9 **LOCKED** · Community EPIC **COMPLETE / LOCKED** @ `c5e1f17` · Recording Waves 1–5 **CLOSED** · D02 **SHIPPED** @ `e98ba52` · **Polish UX = CLOSED / PRODUCTION VERIFIED — PASS WITH EVIDENCE LIMITATIONS** @ `0afa29b` · deploy `6815846706` · Wave A @ `2c4200b` · Wave B @ `812a9d4` · **E3 = PRODUCTION VERIFIED — GREEN** · Mix/Jobs/PUBLIC_AUDIO **ON** · **STORAGE-ARCH-01 = LOCKED**.
**Next:** EXISTING BACKLOG / OWNER DECISION · do not auto-start next wave · start from [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [PROJECT_STATE.md](./PROJECT_STATE.md).
