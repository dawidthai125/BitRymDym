# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point dla nowego agenta:** najpierw [MASTER_HANDOFF.md](./MASTER_HANDOFF.md), potem ten plik.

---

## 1. Project Identity

| Pole | Wartość |
|------|---------|
| Nazwa | BitRymDym |
| Cel | Platforma muzyczna (rap / hip-hop / bity): odsłuch, pobieranie, test flow (Quick Take) → społeczność i współpraca |
| Owner / Product Owner | Prezes Dawid |

---

## 2. Current Repository State

| Pole | Wartość |
|------|---------|
| Canonical branch | `main` |
| **Repository HEAD / origin/main** | `9026fa9` (`feat(mobile): ship W6.2 W6.3 presentation`) · docs tip may advance after docs closeout |
| **Production application** | `9026fa9` · https://www.bitrymdym.pl · **GREEN** / **PRODUCTION VERIFIED** (W6.2/W6.3 UX) |
| **Production deployment** | `dpl_2aZabB1AtXCUNGEERmjwupXTVP9S` |
| **E3.7 Premium Render** | Code still present · **E3 enablement = NO** · **DARK** |
| **W6.2/W6.3 UX** | **CLOSED / PRODUCTION VERIFIED** @ `9026fa9` |
| **E3.8 W6 Mobile Cert** | **CLOSED / PASS** · **OWNER-ACCEPTED EMULATED** · [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md) |
| **E3 Production Enablement** | **DESIGN FREEZE COMPLETE** · Arch **PASS WITH FINDINGS** · OD-E3-PE-01…05 **LOCKED** · **NOT EXECUTED** — [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md) |
| Previous Production app | `17c4d530` (E3.7 DARK baseline before W6 UX) |
| **E3 FULL AUDIO** | **E3.1 → E3.7 code on Production** · **E3 = DARK** · W6 mobile cert **SATISFIED** · public Free Audio **gated** |
| Community Upload + Moderation EPIC | **COMPLETE / LOCKED** @ `c5e1f17` |
| Recording Design Freeze | **LOCKED** |
| **Recording Wave 1–4** | **CLOSED** / **PRODUCTION VERIFIED** |
| **Recording Wave 5** | **CLOSED** / **PRODUCTION VERIFIED** @ `37892a6` · Shared Grants → RECORD |
| **D02 Anonymous Quick Take** | **CLOSED / IN V1** · **SHIPPED** / **PRODUCTION VERIFIED** @ `e98ba52` |
| **P1-B** DEFINER grants hardening | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-C** `set_updated_at` hardening | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-A** HIBP | **BLOCKED** — Owner Dashboard action required |
| Security | **GREEN WITH WARNINGS** · CRITICAL=0 · HIGH=0 · MEDIUM = HIBP disabled + D02 TTL-only verify artifacts |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Janitor cron | `0 0 * * *` (Hobby daily) · `CRON_SECRET` configured |

Handoff: [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)
E3 Production Enablement Design Freeze: [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md)
E3.8 W6 closeout: [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md)
E3.8 W6 Design Freeze: [E3_8_W6_MOBILE_CERT_PLAN.md](./audits/E3_8_W6_MOBILE_CERT_PLAN.md)
E3.8 W6 Cert Checklist: [E3_8_W6_CERT_CHECKLIST.md](./audits/E3_8_W6_CERT_CHECKLIST.md)
E3.7 closeout: [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)
E3.6 closeout: [E3_6_PRODUCTION_CLOSEOUT.md](./audits/E3_6_PRODUCTION_CLOSEOUT.md)
E3 architecture: [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) · [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](./architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md)

---

## 3. Current Phase

```text
W6.2/W6.3 UX = CLOSED / PRODUCTION VERIFIED @ 9026fa9
E3.8 W6 CERT = CLOSED / PASS (Owner-accepted emulated)
E3 PRODUCTION ENABLEMENT = DESIGN FREEZE COMPLETE · NOT EXECUTED
PRODUCTION APPLICATION = 9026fa9
PRODUCTION DEPLOYMENT = dpl_2aZabB1AtXCUNGEERmjwupXTVP9S
E3 FLAGS = DARK (UNSET)
E3_RENDER_WORKER_SECRET = UNSET
PRODUCTION RENDER = NOT EXECUTED
ARTIFACT = NONE
PUBLIC FREE AUDIO = GATED
NEXT = OWNER GO #2 — WORKER INFRASTRUCTURE
```

---

## 4. Next Session Entry

```text
NEXT SESSION ENTRY = OWNER GO #2 — WORKER INFRASTRUCTURE

W6.2/W6.3 UX = PRODUCTION VERIFIED
E3 Production Enablement = NOT EXECUTED
Do NOT start GO #2 without Owner GO
Do NOT set E3_MIX_ENABLED / E3_RENDER_JOBS_ENABLED / E3_PUBLIC_AUDIO / E3_RENDER_WORKER_SECRET
Do NOT run worker / real render
HIBP enable = Owner Dashboard only (orthogonal)
```

Enablement freeze: [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md)

---

## 5. Decision vs Delivery (recording + E3)

| ID | Decision | Delivery | Implementation |
|----|----------|----------|----------------|
| D02 Anonymous QT | CLOSED / IN V1 | **SHIPPED / PRODUCTION VERIFIED** @ `e98ba52` | COMPLETE |
| D03 Shared grants | CLOSED / IN Recording EPIC | **SHIPPED / PRODUCTION VERIFIED** @ `37892a6` (RECORD only) | Wave 5 COMPLETE |
| E3.1–E3.6 Full Audio | Architecture Hybrid C LOCKED | **SHIPPED** (prior) · **DARK** | COMPLETE |
| E3.7 Premium Render | OD-E37-01/02/03 LOCKED | **Code on Production** · **DARK** | Waves A–H COMPLETE |
| E3.8 W6 Mobile Cert | OD-W6-03 OWNER ACCEPTED emulated | **CERT CLOSED / PASS** | W6.1–W6.5 COMPLETE |
| W6.2/W6.3 UX ship | OD-E3-PE-04 / Owner GO #1 | **SHIPPED / PRODUCTION VERIFIED** @ `9026fa9` | COMPLETE |
| E3 Production Enablement | OD-E3-PE-01…05 LOCKED · Design Freeze COMPLETE | **NOT EXECUTED** | Awaiting Owner GO #2+ |

---

## 6. Out of scope reminders (current delivery)

E3 Production Enablement · public Free Audio · worker provision · real Production render · STEMS · payments · Recording historical W6 security · janitor for audio-artifacts (F-PE-04).

**E3 Production safety (mandatory):**

```text
E3_RENDER_JOBS_ENABLED = UNSET
E3_MIX_ENABLED = UNSET
E3_PUBLIC_AUDIO = UNSET
E3_RENDER_WORKER_SECRET = UNSET
```

**W6 UX ship ≠ E3 Production Enablement ≠ Public Free Audio ON.**
