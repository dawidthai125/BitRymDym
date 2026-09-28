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
| **Production application** | `e98ba52` · https://www.bitrymdym.pl · **GREEN** / **PRODUCTION VERIFIED** |
| **Git / origin/main (app tip)** | `e98ba52` (`feat: add d02 anonymous quick take`) — docs closeout may advance tip without redeploy |
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

Handoff: [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) *(may lag until separate docs sync — trust this file + D02 closeout for D02 status)*  
D02 closeout: [RECORDING_D02_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)  
W5 closeout: [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)  
W4 closeout: [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md)

---

## 3. Current Phase

```text
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
D02 = CLOSED / IN V1 · SHIPPED @ e98ba52
WAVE 5 = CLOSED @ 37892a6 (unchanged)

New GPT / Cursor: AUDIT FIRST → REPORT → WAIT FOR OWNER GO
Do NOT auto-pick next product EPIC
Do NOT implement MIX / EXPORT / Payments / Track Publish / grant PLAYBACK|DOWNLOAD / anon→account claim without separate Owner GO
Do NOT treat docs-only tip SHA as a new application deploy unless Owner Production GO
HIBP enable = Owner Dashboard only (orthogonal)
```

D02 contract + closeout: [PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md](./phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md) · [RECORDING_D02_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)

---

## 5. Decision vs Delivery (recording)

| ID | Decision | Delivery | Implementation |
|----|----------|----------|----------------|
| D02 Anonymous QT | CLOSED / IN V1 | **SHIPPED / PRODUCTION VERIFIED** @ `e98ba52` | COMPLETE |
| D03 Shared grants | CLOSED / IN Recording EPIC | **SHIPPED / PRODUCTION VERIFIED** @ `37892a6` (RECORD only) | Wave 5 COMPLETE |

---

## 6. Out of scope reminders (current delivery)

Anon→account claim · durable anonymous download · grant PLAYBACK/DOWNLOAD · MIX/EXPORT · Track publish from recording · payments/Premium · dual-play mix preview · comments/voting/messaging product.

**D02 POST-RELEASE FINDING (MEDIUM=1):** Production Verify left TTL-bound anonymous takes; no product hard-delete; expire via `expires_at` / janitor — not escalated to P0/P1.

**P2 OPS (not blocker):** migration version name drift (local vs remote timestamps).

**INFO (non-blocker):** React hydration warning on `/beat/[id]` (observed in `next dev`).
