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
| **Production application** | `37892a6` · https://www.bitrymdym.pl · **GREEN** / **PRODUCTION VERIFIED** |
| **Git / origin/main** | `37892a6` (`feat: add wave 5 shared recording grants`) — docs tip may advance after Wave 5 closeout without redeploy |
| Community Upload + Moderation EPIC | **COMPLETE / LOCKED** @ `c5e1f17` |
| Recording Design Freeze | **LOCKED** |
| **Recording Wave 1–4** | **CLOSED** / **PRODUCTION VERIFIED** |
| **Recording Wave 5** | **CLOSED** / **PRODUCTION VERIFIED** @ `37892a6` · Shared Grants → RECORD |
| **P1-B** DEFINER grants hardening | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-C** `set_updated_at` hardening | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-A** HIBP | **BLOCKED** — Owner Dashboard action required |
| Security | **GREEN WITH WARNINGS** · CRITICAL=0 · HIGH=0 · MEDIUM residual = HIBP disabled |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Janitor cron | `0 0 * * *` (Hobby daily) · `CRON_SECRET` configured |

Handoff: [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)
W5 closeout: [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)
W4 closeout: [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md)

---

## 3. Current Phase

```text
RECORDING WAVE 1–4 = CLOSED / PRODUCTION VERIFIED
RECORDING WAVE 5 = CLOSED / PRODUCTION VERIFIED @ 37892a6
SCOPE = Shared Grants → RECORD
COMMUNITY UPLOAD = CLOSED / LOCKED @ c5e1f17
P1-B / P1-C SECURITY = CLOSED @ b4199ef
P1-A HIBP = BLOCKED (Owner Dashboard)
NEXT = OWNER DIRECTION / READY FOR NEXT AUDIT
```

---

## 4. Next Session Entry

```text
NEXT = OWNER DIRECTION / READY FOR NEXT AUDIT

New GPT:  AUDIT → CURRENT STATE → OPEN SURFACE → OPTIONS → DESIGN FREEZE → OWNER GO
New Cursor: AUDIT FIRST → REPORT → WAIT FOR OWNER GO

Do NOT auto-pick the next product EPIC
Do NOT implement Anonymous QT / MIX / EXPORT / Payments / Track Publish without separate Owner GO
Do NOT treat docs-only tip SHA as production unless Owner Production GO redeploys
HIBP enable = Owner Dashboard only (orthogonal)
```

---

## 5. Decision vs Delivery (recording deferred items)

| ID | Decision | Delivery | Implementation GO |
|----|----------|----------|-------------------|
| D02 Anonymous QT | CLOSED / IN V1 (unchanged) | NOT SHIPPED / DEFERRED | NONE |
| D03 Shared grants | CLOSED / IN Recording EPIC | **SHIPPED / PRODUCTION VERIFIED** @ `37892a6` (RECORD only) | Wave 5 COMPLETE |

---

## 6. Out of scope reminders (current delivery)

Anonymous QT (delivery deferred) · grant PLAYBACK/DOWNLOAD · MIX/EXPORT · Track publish from recording · payments/Premium · dual-play mix preview · comments/voting/messaging product.

**P2 OPS (not blocker):** migration version name drift (local vs remote timestamps).

**INFO (non-blocker):** React hydration warning on `/beat/[id]` (observed in `next dev`).
