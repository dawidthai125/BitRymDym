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
| **Repository HEAD / origin/main** | docs tip after W6 closeout · application code baseline Production `17c4d530` |
| **Production application** | `17c4d530` · https://www.bitrymdym.pl · **GREEN** / **PRODUCTION VERIFIED** (E3.7 Premium Render · **DARK**) |
| **Production deployment** | `dpl_BsdUUMvwsgg3xGJthfSYXE52rQCe` |
| **E3.7 Premium Render** | **PRODUCTION VERIFIED** @ `17c4d530` · **E3 enablement = NO** · **DARK** |
| **E3.8 W6 Mobile Cert** | **CLOSED / PASS** · **OWNER-ACCEPTED EMULATED** · [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md) |
| Previous Production | `183b2a4` (E3.6 Basic MP3) |
| **E3 FULL AUDIO** | **E3.1 → E3.7 PRODUCTION VERIFIED** @ `17c4d530` · **E3 = DARK** · **W6 mobile cert prerequisite = SATISFIED** · public Free Audio **still gated** |
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
E3.8 W6 closeout: [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md)
E3.8 W6 Design Freeze: [E3_8_W6_MOBILE_CERT_PLAN.md](./audits/E3_8_W6_MOBILE_CERT_PLAN.md)
E3.8 W6 Cert Checklist: [E3_8_W6_CERT_CHECKLIST.md](./audits/E3_8_W6_CERT_CHECKLIST.md)
E3.7 closeout: [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)
E3.6 closeout: [E3_6_PRODUCTION_CLOSEOUT.md](./audits/E3_6_PRODUCTION_CLOSEOUT.md)
E3 architecture: [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) · [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](./architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md)
D02 closeout: [RECORDING_D02_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)
W5 closeout: [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)

---

## 3. Current Phase

```text
E3.7 = PRODUCTION VERIFIED @ 17c4d530 · DARK
E3.8 W6 = CLOSED / PASS · OWNER-ACCEPTED EMULATED CERTIFICATION
W6.1–W6.5 = COMPLETE
Mobile certification prerequisite = SATISFIED
PRODUCTION APPLICATION = 17c4d530
E3 FLAGS = DARK
E3_RENDER_WORKER_SECRET = UNSET
PRODUCTION RENDER = NOT EXECUTED
ARTIFACT = NONE
PRODUCTION ENABLEMENT = NOT EXECUTED
PUBLIC FREE AUDIO = GATED (E3_PUBLIC_AUDIO UNSET)
NEXT = OWNER DECISION / NEXT RELEASE STAGE
```

---

## 4. Next Session Entry

```text
NEXT SESSION ENTRY = OWNER DECISION / NEXT RELEASE STAGE

W6 = CLOSED
Mobile certification prerequisite = SATISFIED
Production enablement = NOT EXECUTED
E3_PUBLIC_AUDIO = UNSET
E3_RENDER_JOBS_ENABLED = UNSET
E3_MIX_ENABLED = UNSET
E3_RENDER_WORKER_SECRET = UNSET
Production remains DARK @ 17c4d530

Do NOT auto-open E3.9 / invent next feature
Do NOT enable Production E3 flags / worker secret / render jobs / public Free Audio
HIBP enable = Owner Dashboard only (orthogonal)
```

Closeout: [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md)

---

## 5. Decision vs Delivery (recording + E3)

| ID | Decision | Delivery | Implementation |
|----|----------|----------|----------------|
| D02 Anonymous QT | CLOSED / IN V1 | **SHIPPED / PRODUCTION VERIFIED** @ `e98ba52` | COMPLETE |
| D03 Shared grants | CLOSED / IN Recording EPIC | **SHIPPED / PRODUCTION VERIFIED** @ `37892a6` (RECORD only) | Wave 5 COMPLETE |
| E3.1–E3.6 Full Audio | Architecture Hybrid C LOCKED · OD-E36-04 = C | **SHIPPED / PRODUCTION VERIFIED** @ `183b2a4` · **DARK** | COMPLETE |
| E3.7 Premium Render | OD-E37-01/02/03 LOCKED · Design Freeze PASS WITH FINDINGS | **SHIPPED / PRODUCTION VERIFIED** @ `17c4d530` · **DARK** (not render-enabled) | Waves A–H COMPLETE |
| E3.8 W6 Mobile Cert | OD-W6-01/02 LOCKED · **OD-W6-03 CLOSED / OWNER ACCEPTED** (emulated substitute) · Design Freeze COMPLETE · Arch PASS WITH FINDINGS | **CERT CLOSED / PASS** · Production app still `17c4d530` DARK · presentation code may remain local until separate ship GO | W6.1–W6.5 COMPLETE |

---

## 6. Out of scope reminders (current delivery)

Anon→account claim · durable anonymous download · grant PLAYBACK/DOWNLOAD · Track publish from recording · payments/Premium catalog · dual-play mix preview · comments/voting/messaging product · E3 public Free Audio enablement · Production real render enablement · STEMS · `MasterProParams` / True Peak / BS.1770 · Recording historical W6 security leftovers (OD-W6-01 OUT) · W6 full redesign / native apps.

**E3 Production safety (mandatory):**

```text
E3_RENDER_JOBS_ENABLED = UNSET
E3_MIX_ENABLED = UNSET
E3_PUBLIC_AUDIO = UNSET
E3_RENDER_WORKER_SECRET = UNSET
```

**W6 PASS ≠ Production Enablement ≠ Public Free Audio ON.**
