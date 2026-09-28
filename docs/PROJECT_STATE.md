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
| **Recording Wave 5** | **IMPLEMENTED locally** (Shared Grants → RECORD) · awaiting Owner Verification · **not** on prod app |
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
WAVE 5 = IMPLEMENTED LOCALLY / AWAITING OWNER VERIFICATION
NEXT = OWNER VERIFICATION (Wave 5) → then COMMIT GO
```

---

## 4. Next Session Entry

```text
NEXT = OWNER VERIFICATION (Wave 5)

New GPT:  VERIFY → OPTIONS → OWNER GO (commit/push/deploy separate)
New Cursor: OWNER VERIFICATION package · NO COMMIT until Owner GO

Do NOT commit/push/deploy Wave 5 without Owner Verification
Do NOT treat local Wave 5 as Production Verified (prod app remains 99c4815)
Do NOT open Anon QT / MIX / EXPORT / Payments without separate GO
HIBP enable = Owner Dashboard only (orthogonal)
```

---

## 5. Decision vs Delivery (recording deferred items)

| ID | Decision | Delivery | Implementation GO |
|----|----------|----------|-------------------|
| D02 Anonymous QT | CLOSED / IN V1 (unchanged) | NOT SHIPPED / DEFERRED | NONE |
| D03 Shared grants | CLOSED / IN Recording EPIC | IMPLEMENTED locally · NOT Production Verified | Owner Verification required |

---

## 6. Out of scope reminders (current delivery)

Anonymous QT (delivery deferred) · shared grants (delivery not shipped) · Access Gate RECORD for grants · MIX/EXPORT · Track publish from recording · payments/Premium · dual-play mix preview · comments/voting/messaging product.

**P2 OPS (not P1 blocker):** migration version name drift (local vs remote timestamps).
