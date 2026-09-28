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
| **Production application** | `99c4815` · https://www.bitrymdym.pl · **GREEN** / **PRODUCTION VERIFIED** |
| **Git / origin/main** | `b4199ef` (`security: harden definer grants and updated_at search path`) |
| Community Upload + Moderation EPIC | **COMPLETE / LOCKED** @ `c5e1f17` |
| Recording Design Freeze | **LOCKED** |
| **Recording Wave 1–4** | **CLOSED** / **PRODUCTION VERIFIED** (prod app `99c4815`) |
| **P1-B** DEFINER grants hardening | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-C** `set_updated_at` hardening | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-A** HIBP | **BLOCKED** — Owner Dashboard action required |
| Security | **GREEN WITH WARNINGS** · CRITICAL=0 · HIGH=0 · MEDIUM residual = HIBP disabled |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Janitor cron | `0 0 * * *` (Hobby daily) · `CRON_SECRET` configured |

Do not mix SHAs: **app = `99c4815`** · **git tip = `b4199ef`** (P1 security migration; ≠ production — do not auto-align).

Handoff: [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)  
W4 closeout: [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md)

---

## 3. Current Phase

```text
RECORDING WAVE 4 = CLOSED / PRODUCTION VERIFIED @ 99c4815
COMMUNITY UPLOAD = CLOSED / LOCKED @ c5e1f17
P1-B / P1-C SECURITY = CLOSED @ b4199ef
P1-A HIBP = BLOCKED (Owner Dashboard)
NEXT = OWNER DIRECTION
WAVE 5 = NOT IMPLEMENTED / NO IMPLEMENTATION GO
```

---

## 4. Next Session Entry

```text
NEXT = OWNER DIRECTION

New GPT:  AUDIT → CURRENT STATE → OPEN SURFACE → OPTIONS → DESIGN FREEZE → OWNER GO
New Cursor: AUDIT FIRST → REPORT → WAIT FOR OWNER GO

Do NOT auto-start Wave 5 / Shared Grants / Anonymous QT / MIX / Payments
Do NOT treat documentation alone as proof a feature is shipped
Do NOT reopen closed Recording W1–W4 without evidence
Do NOT treat P1 security closeout as Wave 5 GO
Product EPIC selection = Owner only
HIBP enable = Owner Dashboard only (until enabled)
```

---

## 5. Decision vs Delivery (recording deferred items)

| ID | Decision | Delivery | Implementation GO |
|----|----------|----------|-------------------|
| D02 Anonymous QT | CLOSED / IN V1 (unchanged) | NOT SHIPPED / DEFERRED | NONE |
| D03 Shared grants | CLOSED / IN Recording EPIC · Wave 5 designed | NOT SHIPPED | NONE · not auto-next |

---

## 6. Out of scope reminders (current delivery)

Anonymous QT (delivery deferred) · shared grants (delivery not shipped) · Access Gate RECORD for grants · MIX/EXPORT · Track publish from recording · payments/Premium · dual-play mix preview · comments/voting/messaging product.

**P2 OPS (not P1 blocker):** migration version name drift (local vs remote timestamps).
