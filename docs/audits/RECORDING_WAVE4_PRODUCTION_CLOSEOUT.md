# RECORDING WAVE 4 — PRODUCTION CLOSEOUT

**Type:** Production verification closeout  
**Date:** 2026-09-28  
**Production SHA:** `99c4815e26b224cb66e221831687b0688bf20476`  
**Production URL:** https://www.bitrymdym.pl  

```text
RECORDING_WAVE4 = CLOSED
PRODUCTION = GREEN
```

---

## Deployment

| Item | Result |
|------|--------|
| Pre-deploy gate | `CRON_SECRET` PRESENT · required Supabase env PRESENT |
| Deploy | SUCCESS → Vercel Production Ready · aliased www.bitrymdym.pl |
| Commit | Wave 4 `4a88a00` + Hobby cron hotfix `99c4815` |
| Cron schedule | `0 0 * * *` (Hobby-compatible daily 00:00 UTC) |

---

## Verification summary

| Control | Result |
|---------|--------|
| Public smoke (`/`, `/beats`, beat detail, auth, `/account/takes`) | PASS |
| W4 live E2E (BEGINNER session→READY→preview→download→delete) | PASS |
| Entitlement BEGINNER / PRO / LEGEND snapshots | PASS |
| Retention `expires_at` + AuthZ DENY on expired | PARTIAL (logic + live AuthZ; full natural expiry not forced) |
| Janitor unauthorized | PASS (401) |
| Janitor authorized / scheduled run | PENDING_SCHEDULE (daily Hobby; config present) |
| Anti-abuse concurrent PENDING + active READY cap | PASS |
| Download / delete / IDOR / unauth | PASS |
| Claim RPC anon/authenticated DENY · service_role ALLOW | PASS |
| Public take-audio object | DENY |
| Regression W2/W3 + Chromium WebM/Opus fallback | PASS |

---

## Notes

- Expiry AuthZ is immediate/server-side; daily janitor is Storage/lifecycle cleanup only.
- No Anonymous QT / shared grants / MIX / EXPORT / payments in this wave.
