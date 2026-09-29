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
| **Repository HEAD / origin/main** | `17c4d530` (`feat(audio): implement E3.7 premium export`) |
| **Production application** | `17c4d530` · https://www.bitrymdym.pl · **GREEN** / **PRODUCTION VERIFIED** (E3.7 Premium Render · **DARK**) |
| **Production deployment** | `dpl_BsdUUMvwsgg3xGJthfSYXE52rQCe` |
| **E3.7 Premium Render** | **IMPLEMENTED** · Owner Verify **PASS WITH FINDINGS** · **COMMITTED + PUSHED** · **PRODUCTION DEPLOYED = YES** · **PRODUCTION VERIFIED = YES** @ `17c4d530` · **E3 enablement = NO** · **DARK** |
| Previous Production | `183b2a4` (E3.6 Basic MP3) |
| **E3 FULL AUDIO** | **E3.1 → E3.6 CLOSED** · **E3.7 PRODUCTION VERIFIED** @ `17c4d530` · **E3 = DARK** (not COMPLETE / not render-enabled) |
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
E3.7 closeout: [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)
E3.6 closeout: [E3_6_PRODUCTION_CLOSEOUT.md](./audits/E3_6_PRODUCTION_CLOSEOUT.md)
E3 architecture: [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) · [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](./architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md)
D02 closeout: [RECORDING_D02_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)
W5 closeout: [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)

---

## 3. Current Phase

```text
E3.7 = IMPLEMENTED / OWNER VERIFIED (PASS WITH FINDINGS) / COMMITTED+PUSHED / PRODUCTION DEPLOYED+VERIFIED @ 17c4d530
E3.7 PRODUCTION ENABLEMENT = NO
E3.1 → E3.6 = CLOSED (prior) · superseded as live app by E3.7
REPOSITORY = 17c4d530
PRODUCTION APPLICATION = 17c4d530
E3 FLAGS = DARK (E3_RENDER_JOBS_ENABLED / E3_MIX_ENABLED / E3_PUBLIC_AUDIO = UNSET)
E3_RENDER_WORKER_SECRET = UNSET
PRODUCTION RENDER = NOT EXECUTED
ARTIFACT = NONE
RECORDING WAVE 1–5 = CLOSED / PRODUCTION VERIFIED
D02 = CLOSED / IN V1 · SHIPPED @ e98ba52
NEXT = OWNER DECISION (do not auto-enable E3 / do not invent E3.8+)
```

---

## 4. Next Session Entry

```text
NEXT = OWNER DECISION
NEXT FEATURE = DO NOT AUTO-SELECT (no E3.8+ / no auto E3 enablement)

REPOSITORY (main / origin/main) = 17c4d530
APPLICATION (Production) = 17c4d530 · dpl_BsdUUMvwsgg3xGJthfSYXE52rQCe
E3.7 = PRODUCTION VERIFIED · DARK · real render NOT EXECUTED

Do NOT enable E3 flags or set E3_RENDER_WORKER_SECRET without separate Owner Production Enablement GO
Do NOT mark E3 Full Audio epic COMPLETE
HIBP enable = Owner Dashboard only (orthogonal)
```

E3.7 closeout: [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)

---

## 5. Decision vs Delivery (recording + E3)

| ID | Decision | Delivery | Implementation |
|----|----------|----------|----------------|
| D02 Anonymous QT | CLOSED / IN V1 | **SHIPPED / PRODUCTION VERIFIED** @ `e98ba52` | COMPLETE |
| D03 Shared grants | CLOSED / IN Recording EPIC | **SHIPPED / PRODUCTION VERIFIED** @ `37892a6` (RECORD only) | Wave 5 COMPLETE |
| E3.1–E3.6 Full Audio | Architecture Hybrid C LOCKED · OD-E36-04 = C | **SHIPPED / PRODUCTION VERIFIED** @ `183b2a4` · **DARK** | COMPLETE |
| E3.7 Premium Render | OD-E37-01/02/03 LOCKED · Design Freeze PASS WITH FINDINGS | **SHIPPED / PRODUCTION VERIFIED** @ `17c4d530` · **DARK** (not render-enabled) | Waves A–H COMPLETE |

---

## 6. Out of scope reminders (current delivery)

Anon→account claim · durable anonymous download · grant PLAYBACK/DOWNLOAD · Track publish from recording · payments/Premium catalog · dual-play mix preview · comments/voting/messaging product · E3 public Free Audio enablement · Production real render enablement · STEMS · `MasterProParams` / True Peak / BS.1770.

**E3 Production safety (mandatory):**

```text
E3_RENDER_JOBS_ENABLED = UNSET
E3_MIX_ENABLED = UNSET
E3_PUBLIC_AUDIO = UNSET
E3_RENDER_WORKER_SECRET = UNSET
```

Production app = E3.7 @ `17c4d530` (**DARK** — flags UNSET · worker secret UNSET · real render **NOT EXECUTED**). **Do not** describe E3 as Production-enabled or epic COMPLETE.

**E3.7 INFO findings (non-blockers):** G5 soft RMS ≠ BS.1770.

**D02 POST-RELEASE FINDING (MEDIUM=1):** TTL-bound anonymous verify artifacts — not escalated to P0/P1.

**P2 OPS (not blocker):** migration version name drift (local vs remote timestamps).

**INFO (non-blocker):** React hydration warning on `/beat/[id]` (observed in `next dev`).
