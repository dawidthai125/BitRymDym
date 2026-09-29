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
| **Production application** | `183b2a4` · https://www.bitrymdym.pl · **GREEN** / **PRODUCTION VERIFIED** |
| **Production deployment** | `dpl_D5EfHdSSahouFftf5HK35wKSHmts` |
| **Git / origin/main (app tip)** | `183b2a4` (`feat(audio): implement E3.6 basic mp3 export`) — docs closeout may advance tip without redeploy |
| Previous Production | `fbece37` (E3.5 Render Jobs) |
| **E3 FULL AUDIO** | **E3.1 → E3.6 CLOSED / PRODUCTION VERIFIED** · **E3 = DARK** (flags UNSET · worker secret UNSET · not Production-enabled as real render service) |
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
E3.6 closeout: [E3_6_PRODUCTION_CLOSEOUT.md](./audits/E3_6_PRODUCTION_CLOSEOUT.md)
E3 architecture: [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) · [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](./architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md)
D02 closeout: [RECORDING_D02_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)
W5 closeout: [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)

---

## 3. Current Phase

```text
E3.1 → E3.6 = CLOSED / PRODUCTION VERIFIED @ 183b2a4
E3 FLAGS = DARK (E3_RENDER_JOBS_ENABLED / E3_MIX_ENABLED / E3_PUBLIC_AUDIO = UNSET)
E3_RENDER_WORKER_SECRET = UNSET
RECORDING WAVE 1–4 = CLOSED / PRODUCTION VERIFIED
RECORDING WAVE 5 = CLOSED / PRODUCTION VERIFIED @ 37892a6
D02 ANONYMOUS QT = CLOSED / IN V1 · SHIPPED / PRODUCTION VERIFIED @ e98ba52
COMMUNITY UPLOAD = CLOSED / LOCKED @ c5e1f17
P1-B / P1-C SECURITY = CLOSED @ b4199ef
P1-A HIBP = BLOCKED (Owner Dashboard)
NEXT = OWNER DIRECTION / READY FOR NEXT AUDIT
```

---

## 4. Next Session Entry

```text
NEXT = OWNER DIRECTION / READY FOR NEXT AUDIT
NEXT SESSION = AUDIT
NEXT FEATURE = DO NOT AUTO-SELECT (Owner only)

E3.6 = PRODUCTION VERIFIED @ 183b2a4 · DARK (not Production-enabled render service)
D02 = CLOSED / IN V1 · SHIPPED @ e98ba52
WAVE 5 = CLOSED @ 37892a6 (unchanged)

New GPT / Cursor: AUDIT FIRST → REPORT → WAIT FOR OWNER GO
Do NOT auto-pick next product EPIC / E3.7+
Do NOT enable E3 flags or set E3_RENDER_WORKER_SECRET without separate Owner Production Enablement GO
Do NOT treat docs-only tip SHA as a new application deploy unless Owner Production GO
HIBP enable = Owner Dashboard only (orthogonal)
```

E3 closeout: [E3_6_PRODUCTION_CLOSEOUT.md](./audits/E3_6_PRODUCTION_CLOSEOUT.md)
D02 contract + closeout: [PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md](./phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md) · [RECORDING_D02_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)

---

## 5. Decision vs Delivery (recording + E3)

| ID | Decision | Delivery | Implementation |
|----|----------|----------|----------------|
| D02 Anonymous QT | CLOSED / IN V1 | **SHIPPED / PRODUCTION VERIFIED** @ `e98ba52` | COMPLETE |
| D03 Shared grants | CLOSED / IN Recording EPIC | **SHIPPED / PRODUCTION VERIFIED** @ `37892a6` (RECORD only) | Wave 5 COMPLETE |
| E3.1–E3.6 Full Audio | Architecture Hybrid C LOCKED · OD-E36-04 = C | **SHIPPED / PRODUCTION VERIFIED** @ `183b2a4` · **DARK** | E3.1–E3.6 COMPLETE · not Production-enabled |

---

## 6. Out of scope reminders (current delivery)

Anon→account claim · durable anonymous download · grant PLAYBACK/DOWNLOAD · Track publish from recording · payments/Premium catalog · dual-play mix preview · comments/voting/messaging product · E3 public Free Audio enablement · Production real render enablement · STEMS.

**E3 Production safety (mandatory):**

```text
E3_RENDER_JOBS_ENABLED = UNSET
E3_MIX_ENABLED = UNSET
E3_PUBLIC_AUDIO = UNSET
E3_RENDER_WORKER_SECRET = UNSET
```

E3.6 is deployed code on Production but **must not** be described as an active Production rendering service while flags stay DARK.

**D02 POST-RELEASE FINDING (MEDIUM=1):** Production Verify left TTL-bound anonymous takes; no product hard-delete; expire via `expires_at` / janitor — not escalated to P0/P1.

**P2 OPS (not blocker):** migration version name drift (local vs remote timestamps).

**INFO (non-blocker):** React hydration warning on `/beat/[id]` (observed in `next dev`).
