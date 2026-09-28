# RECORDING WAVE 4 — IMPLEMENTATION REPORT

**Type:** Implementation + production closeout reference  
**Date:** 2026-09-28  
**Production SHA:** `99c4815e26b224cb66e221831687b0688bf20476`  
**Status:** **CLOSED / PRODUCTION VERIFIED**

```text
RECORDING_WAVE4 = CLOSED
PRODUCTION = GREEN
```

See: [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](./RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md)

---

## 1. Scope delivered

| Item | Status |
|------|--------|
| Account-level recording entitlement (BEGINNER 30 / PRO·LEGEND MIN(beat,180)) | DONE |
| Retention via server `expires_at` | DONE |
| Janitor (Vercel Cron → `/api/cron/takes-janitor`) | DONE (Hobby daily `0 0 * * *`) |
| Anti-abuse race-safe (advisory lock + unique PENDING) | DONE |
| Own TAKE signed download | DONE |
| `/account/takes` Moje próbki | DONE |
| Owner soft-delete (DELETED + deleted_at) | DONE |
| Expired/deleted AuthZ DENY preview/download | DONE |

**OUT (correct):** Anonymous QT · shared grants · MIX/EXPORT · Track publish · payments/Premium · dual-play

---

## 2. Architecture

```text
REQUEST
  → AUTH (requireUser)
  → assertTakeRecordAccess + computeRecordingMaxSeconds (entitlement SSOT)
  → claim_take_recording_session (advisory_xact_lock + caps)
  → signed upload → finalize (snapshot max + duration probe)
  → READY → preview/download via assertOwnReadyTakeAccess
  → soft-delete / janitor → EXPIRED|DELETED
```

Canonical entitlement: `src/lib/takes/entitlement.ts`  
Session claim RPC: `claim_take_recording_session`  
Janitor: Vercel Hobby daily cron `0 0 * * *` (00:00 UTC) + `CRON_SECRET` Bearer (not pg_cron). Expiry AuthZ is immediate; janitor cleans Storage/lifecycle.

---

## 3. Migrations

| Version / file | Purpose |
|----------------|---------|
| `20260927220000_recording_wave4_session_claim.sql` | unique PENDING per owner · indexes · claim RPC |
| `20260927220100_recording_wave4_claim_rpc_revoke.sql` | REVOKE EXECUTE from anon/authenticated |
| Applied to remote | YES |

---

## 4. API / routes

| Route | Purpose |
|-------|---------|
| `POST /api/takes/session` | race-safe claim + entitlement |
| `POST /api/takes/finalize` | snapshot max; deleted/expired DENY |
| `POST /api/takes/preview` | shared AuthZ gate |
| `POST /api/takes/download` | owner signed GET (TTL 300s) |
| `POST /api/takes/delete` | owner soft-delete |
| `GET /api/cron/takes-janitor` | retention cleanup |
| `/account/takes` | Moje próbki UI |

---

## 5. Production

**DEPLOYED + VERIFIED** @ `99c4815` · https://www.bitrymdym.pl
