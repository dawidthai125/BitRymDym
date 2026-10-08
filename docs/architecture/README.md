# Architektura — status

**SSOT (produkt):** [MASTER SSOT v0.1](../ssot/MASTER_SSOT_v0.1.md)
**Architektura (technika):** [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)
**Status:** BASELINE ACCEPTED — OD-01 / OD-02 / OD-03 CLOSED (2026-09-25)

---

## Baseline techniczny (zatwierdzony)

| Warstwa | Decyzja |
|---------|---------|
| Frontend | Next.js, TypeScript, Tailwind, shadcn/ui (baza), własny Design System, App Router — **OD-01** |
| Application server | Next.js Server Actions / Route Handlers — **OD-02** |
| Infrastruktura | Supabase: PostgreSQL, Auth, RLS, Storage; Edge Functions gdy potrzebne — **OD-03** |

---

## Co jest już ustalone w SSOT (domena)

| Obszar | Ustalenie | SSOT |
|--------|-----------|------|
| Auth | Supabase Auth (OD-03) | §5 |
| Role | `ADMIN`, `MODERATOR`, `USER` | §3–4 |
| Poziom konta | osobny od roli; nazwy robocze (OD-09 OPEN) | §4 |
| Uprawnienia | oddzielone od ról; role = zestawy permissions | §36 |
| Bit — max długość | 180 s, walidacja serwerowa | §7 |
| Bit — statusy | `DRAFT` … `ARCHIVED` | §8 |
| BPM | wartość liczbowa | §6 |
| Storage audio | private; playback/download; signed URLs | §9 |
| Player | autorski; bez `<audio controls>` jako UI | §10 |
| Pobieranie | signed URL + limity + audit | §12–13 |
| Quick Take | BEGINNER max 30 s; retention by account level; **anon delivery NOT SHIPPED** (D02 decision unchanged) | §18–21 · freeze · Waves 1–4 CLOSED |
| Full Take (PRO/LEGEND V1) | ≤ długość bitu ≤ 180 s; PRO 10 dni · LEGEND 30 dni | §22–23 · OD-REC-04/05 |
| Feature flags płatności | wyłączone na start; Premium = future overlay | §14–15 · D04 hybrid |
| Bezpieczeństwo | krytyczne reguły tylko po stronie serwera | §39 |

---

## Nadal OPEN (nie zamrażać)

Codec, watermark, mix, limity liczbowe, payments, visual identity itd. — [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md) (OD-04–OD-18).

---

## Application implementation

**Phase 1.2–1.9 LOCKED** on `main` (production **VERIFIED GREEN** @ `47643c2`).

| Phase / capability | Status |
|--------------------|--------|
| 1.2–1.7 Admin PLATFORM ops | **CLOSED / LOCKED** @ `ed499ee` |
| 1.8A Downloads | **CLOSED / LOCKED** @ `fd87f23` |
| BPM Production V1 | **SHIPPED** @ `471dd5b` (accuracy not certified) |
| Audio Transport V1 | **CLOSED / PRODUCTION VERIFIED** @ `73e213c` |
| Phase 1.9 Operator enablement | **CLOSED / LOCKED** @ `47643c2` |
| GAP-PUBLISH-READY | **CLOSED** (server hard gate: active MASTER READY) |
| Community Upload + Moderation | **EPIC COMPLETE / LOCKED** (Waves 1–5) @ `c5e1f17` |
| Recording / Quick Take | **Waves 1–5 CLOSED** · D02 **SHIPPED** @ `e98ba52` — [RECORDING.md](./RECORDING.md) · [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) |
| **Studio P5.1–P5.6** | **PRODUCTION VERIFIED — GREEN** — foundation → Take Workflow · `finalize ≠ place` |
| **P5.8 Studio Devices / Input** | **PRODUCTION VERIFIED — GREEN** @ `95e04ff` · dpl `dpl_2RhUDg…` — [freeze](../decisions/P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md) |
| **P5.10 Studio Audio Engine** | **PRODUCTION VERIFIED — GREEN** @ `9c2a958` · dpl `dpl_L7pB5A8…` — [freeze](../decisions/P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md) |
| **P6.1 FX persist / CAS** | **COMPLETE** · RPC hotfix `57ef69e` — [P6 freeze](../decisions/P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md) |
| **P6.2 Track FX graph** | **PRODUCTION VERIFIED — GREEN** @ `23d3be8` — [P6 freeze](../decisions/P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md) |
| **P6.3 Master FX graph** | **PRODUCTION VERIFIED — GREEN** @ `350303e` — [P6 freeze](../decisions/P6_MIX_TRACK_FX_MASTER_FX_DESIGN_FREEZE.md) |
| **P6.4.1 Master Gain/Pan + Track documentVersion** | **PRODUCTION VERIFIED — GREEN** @ `9f93606` · dpl `dpl_EHkvay…` — [P6.4 freeze](../decisions/P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md) |
| **P6.4.2 Shared FX UI Foundation** | **PRODUCTION VERIFIED — GREEN** @ `320907a` · dpl `dpl_HrDh4nw…` — [P6.4 freeze](../decisions/P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md) |
| **P6.4.3 Mix UX polish & integration** | **PRODUCTION VERIFIED — GREEN** @ `f261ea8` · dpl `dpl_5ZBCGED…` · served `0kfptvapkfp-m.js` — [P6.4 freeze](../decisions/P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md) |
| **P6.5 Studio Audio Quality Metering** | **IMPLEMENTATION COMPLETE · PRODUCTION DEPLOYED** @ `2258bdb` · **Scenario A PROVEN** · **Scenario B BLOCKED / INCONCLUSIVE** (browser/CDP · not GREEN · not reopened) — [freeze](../decisions/P6_5_STUDIO_AUDIO_QUALITY_METERING_DESIGN_FREEZE.md) · [audit](./P6_5_STUDIO_AUDIO_QUALITY_METERING_ARCHITECTURE_AUDIT.md) |
| **P6.6 On-demand Track Peak Metering** | **PRODUCTION VERIFIED — GREEN** @ `c825e42` · dpl `dpl_3s3fAnvrpNVSwJcdhV8J1SZtc9g9` · served `3_efrbzvmc1dc.js` · P6.6.1 `a8a3337` · P6.6.2/3 `c825e42` · Vitest **1410 PASS · 1 SKIP** — [freeze](../decisions/P6_6_STUDIO_TRACK_METERING_DESIGN_FREEZE.md) · [audit](./P6_6_STUDIO_ARCHITECTURE_AUDIT.md) |
| **P6.7 Clip Fades** | **PRODUCTION VERIFIED — GREEN · CLOSED** @ app `06c60b5` (ancestry) · dpl `dpl_CpGUtwjDbvXdJ8oEuDyDFjQ1UgNp` · Vitest **1519 PASS · 1 SKIP** — [audit](./P6_7_CLIP_FADES_ARCHITECTURE_AUDIT.md) · [freeze](../decisions/P6_7_CLIP_FADES_DESIGN_FREEZE.md) |
| **Phase 7.1.3 Inspector IA** | **CLOSED / PRODUCTION GREEN** @ `8f6eeca` (ancestry · do not reopen) |
| **Phase 7.1.4 Mixer Dock** | **CLOSED / PRODUCTION VERIFIED — GREEN** @ `9abc1b6` (ancestry) · OD-P7.1.4-01…04=A · desktop dock · tablet/mobile sheet · XOR · Master sticky · 1 StudioAudioEngine · no DB/API — [freeze](../decisions/P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md) · [closeout](../audits/P7_1_4_MIXER_DOCK_PRODUCTION_CLOSEOUT.md) |
| **Phase 7.1.5 Shell Polish + Stacked Escape** | **CLOSED / PRODUCTION VERIFIED — GREEN** @ `3fccbf7` · dpl `dpl_2E7JrvusAzAG8bsXydpqNJ36k6JR` · feature `f891bce` · Escape fix `3fccbf7` · Escape#1 FxSheet / Escape#2 Mixer · 1 StudioAudioEngine · PlayerProvider/E3 untouched — [closeout](../audits/P7_1_5_SHELL_POLISH_PRODUCTION_CLOSEOUT.md) |
| **P4.6 TAKE_EXPORT** | **CLOSED / PRODUCTION VERIFIED / LIVE E2E VERIFIED / GREEN** @ `a72fed9` (ancestry) · Contabo **STOPPED/DISABLED** after controlled E2E — [closeout](../audits/P4_6_PRODUCTION_CLOSEOUT.md) |
| **D02 live harness** | **CLOSED** @ `44dc22c` (**TEST ONLY**) |
| **P5.7 Architecture Audit** | **GO WITH CONDITIONS** — [P5_7_STUDIO_ARCHITECTURE_AUDIT.md](./P5_7_STUDIO_ARCHITECTURE_AUDIT.md) |
| **P5.9 Architecture Audit** | **GO WITH CONDITIONS** — [P5_9_STUDIO_ARCHITECTURE_AUDIT.md](./P5_9_STUDIO_ARCHITECTURE_AUDIT.md) |
| **Next Studio step** | **STOP** — **Phase 7.1.5 CLOSED / GREEN** @ `3fccbf7` · **P6.8 NOT STARTED / OWNER DECISION** · do **not** reopen 7.1.5 / 7.1.4 / 7.1.3 / P6.6 / P6.5 Scenario B · Owner decides next |
| Studio audio rule | `StudioTransport != PlayerProvider` · `StudioAudioEngine != PlayerProvider != E3 Mix` · Track/Master FX · Master + Track Peak (P6.5/P6.6) · Clip Fades on Clip GainNode (P6.7 GREEN) · Mix UX · Mixer dock chrome reuses engine (7.1.4) · FxSheet Escape owns top layer (7.1.5) · overlap = MIX · P6.5 Scenario B remains BLOCKED / INCONCLUSIVE |
| E3 Full Audio (through E3.6) | **E3.1→E3.6 CLOSED / PRODUCTION VERIFIED** @ `183b2a4` · historically **DARK** at wave closeout — [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) · [E3_6_PRODUCTION_CLOSEOUT.md](../audits/E3_6_PRODUCTION_CLOSEOUT.md) |
| E3.7 Premium Render | **Code on Production** · historically shipped **DARK** · Premium Production E2E **NOT TESTED** — [E3_7_IMPLEMENTATION_CLOSEOUT.md](../audits/E3_7_IMPLEMENTATION_CLOSEOUT.md) |
| E3.8 W6 Mobile Cert | **CLOSED / PASS** · **OWNER-ACCEPTED EMULATED** — [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](../audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md) |
| W6.2/W6.3 UX ship | **CLOSED / PRODUCTION VERIFIED** @ `9026fa9` (ship SHA) |
| E3 Production Enablement | **COMPLETE** · **PRODUCTION VERIFIED — GREEN** · AC-PE-12 **PASS** · GO #5 **PASS** · PUBLIC_AUDIO **ON** — [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](../audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md) |
| OWNER GO #2 Worker Infra | **CLOSED / SUPERSEDED** (Contabo) — [E3_WORKER_INFRASTRUCTURE_GO2.md](../audits/E3_WORKER_INFRASTRUCTURE_GO2.md) |
| **STORAGE-ARCH-01** | **LOCKED** · Hybrid C · Final Arch Review **PASS WITH FINDINGS** · Implementation **NOT STARTED** — [STORAGE_ARCH_01_DESIGN_FREEZE.md](../audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · [STORAGE_ARCH_01_AUDIT.md](../audits/STORAGE_ARCH_01_AUDIT.md) |
| **STORAGE-ARCH-02** | **FUTURE SCALABILITY DOCS PREPARED** · external Object Storage **OPTIONAL / NOT IMPLEMENTED / NO CURRENT INVESTMENT** · current durable = **Supabase only** — [STORAGE_ARCH_02_FUTURE_SCALABILITY.md](./STORAGE_ARCH_02_FUTURE_SCALABILITY.md) |
| **STORAGE-ARCH-07** | **DESIGN FREEZE COMPLETE** · OD-SA-07-01…16 **CLOSED** · VPS COPY **43/43** · AWS **DEFERRED** — [freeze](../audits/STORAGE_ARCH_07_DESIGN_FREEZE.md) · [evidence](../audits/STORAGE_ARCH_07_IMPLEMENTATION.md) |
| **VPS BACKUP PLANE** | OD-VPS-01…20 **CLOSED** · Phase 1–6 **PASS** · Layer-1 **43/43** · restore **3/43** — [freeze](../audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md) |
| **LOCAL WINDOWS Layer-2** | OD-VPS-LOCAL-01…12 **CLOSED** · **43/43 RESTORE VERIFIED** — [restore](../audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md) · [impl](../audits/STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION.md) |
| Historical local DB backup | **FOUND** · PostgreSQL CUSTOM dump · **≠ Storage object bytes** — [audit](../audits/HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md) |
| Contabo VPS | **EXTERNAL COMPUTE** (FFmpeg ephemeral) · **NOT** durable media SSOT · VPS Layer-1 staging **43/43** · **NOT** sole/final DR · worker **STOPPED / DISABLED** @ `92496d4` |
| FAR-01 | Phase 1 DR-A historical SHIPPED · campaign **SOAK COMPLETE / CONTAMINATED** · RETIREMENT **NOT EXECUTED** — [FAR_01_CURRENT_STATE.md](../audits/FAR_01_CURRENT_STATE.md) |
| ARCH-05 orphan GC | **CLOSED / VERIFIED** · live Storage **11 / 8 / 3 / 0 / 0** · DELETE **32/32** historical — [reconciliation](../audits/ARCH_05_POST_DELETE_RECONCILIATION.md) |
| Current Production / repo tip | Live planes: [PROJECT_STATE.md](../PROJECT_STATE.md) · production app `3fccbf7` · dpl `dpl_2E7JrvusAzAG8bsXydpqNJ36k6JR` · Phase 7.1.5 GREEN · CLOSED · repo tip verify `git rev-parse HEAD` (may ≠ app) |

See [BEATS.md](./BEATS.md), [AUTHORIZATION.md](./AUTHORIZATION.md), [AUDIO_TRANSPORT.md](./AUDIO_TRANSPORT.md), [BPM_AUTO_DETECTION.md](./BPM_AUTO_DETECTION.md), [RECORDING.md](./RECORDING.md), [PHASE_1_7_DESIGN_FREEZE.md](../phases/PHASE_1_7_DESIGN_FREEZE.md), [PHASE_1_9_DESIGN_FREEZE.md](../phases/PHASE_1_9_DESIGN_FREEZE.md), [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](../phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md), [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md).

**Note:** Canonical live baseline is [PROJECT_STATE.md](../PROJECT_STATE.md) · [MASTER_HANDOFF.md](../MASTER_HANDOFF.md). Supabase Storage = durable media SSOT (live **11 / 8 / 3 / 0 / 0** after ARCH-05). Contabo = EXTERNAL COMPUTE + VPS Layer-1 evidence (**43/43 RETAINED**). Local Windows Layer-2 **43/43 RETAINED**. AWS Object Lock **DEFERRED**. STORAGE-ARCH-01 **LOCKED**. ARCH-05 **CLOSED / VERIFIED**.
