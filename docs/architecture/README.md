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
| E3 Full Audio (through E3.6) | **E3.1→E3.6 CLOSED / PRODUCTION VERIFIED** @ `183b2a4` · **DARK** — [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) · [E3_6_PRODUCTION_CLOSEOUT.md](../audits/E3_6_PRODUCTION_CLOSEOUT.md) |
| E3.7 Premium Render | **IMPLEMENTED** locally · Owner Verify **PASS WITH FINDINGS** · **COMMIT NONE** · **not** on Production — [E3_7_IMPLEMENTATION_CLOSEOUT.md](../audits/E3_7_IMPLEMENTATION_CLOSEOUT.md) |

See [BEATS.md](./BEATS.md), [AUTHORIZATION.md](./AUTHORIZATION.md), [AUDIO_TRANSPORT.md](./AUDIO_TRANSPORT.md), [BPM_AUTO_DETECTION.md](./BPM_AUTO_DETECTION.md), [RECORDING.md](./RECORDING.md), [PHASE_1_7_DESIGN_FREEZE.md](../phases/PHASE_1_7_DESIGN_FREEZE.md), [PHASE_1_9_DESIGN_FREEZE.md](../phases/PHASE_1_9_DESIGN_FREEZE.md), [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](../phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md), [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md).

**Note:** Rows above for Phase 1.x list historical closeout SHAs. Canonical live baseline is production app `183b2a4` / git tip per [PROJECT_STATE.md](../PROJECT_STATE.md).
