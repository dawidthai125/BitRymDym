# RECORDING WAVE 4 — IMPLEMENTATION (Owner Review)

**Type:** Implementation report (not CLOSED)  
**Date:** 2026-09-27  
**Production baseline (unchanged):** `9f6f006c4dbb3354260ca2f5479c18952f8a713a`  
**Status:** READY_FOR_OWNER_REVIEW — COMMIT / PUSH / DEPLOY = NOT PERFORMED

```text
RECORDING_WAVE4_IMPLEMENTATION = COMPLETE
READY_FOR_OWNER_REVIEW = YES
```

---

## 1. Scope delivered

| Item | Status |
|------|--------|
| Account-level recording entitlement (BEGINNER 30 / PRO·LEGEND MIN(beat,180)) | DONE |
| Retention via server `expires_at` | DONE |
| Janitor (Vercel Cron → `/api/cron/takes-janitor`) | DONE |
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
| Applied to remote | YES (`recording_wave4_session_claim` + `recording_wave4_claim_rpc_revoke`) |

---

## 4. API / routes

| Route | Purpose |
|-------|---------|
| `POST /api/takes/session` | unchanged path; now race-safe claim + entitlement |
| `POST /api/takes/finalize` | snapshot max; deleted/expired DENY |
| `POST /api/takes/preview` | shared AuthZ gate |
| `POST /api/takes/download` | owner signed GET (TTL 300s) |
| `POST /api/takes/delete` | owner soft-delete |
| `GET /api/cron/takes-janitor` | retention cleanup |
| `/account/takes` | Moje próbki UI |

---

## 5. Tests

- Unit: `wave4-unit.test.ts` (entitlement, retention, caps, download AuthZ)
- Live: `wave4-live.test.ts` (BEGINNER flow, caps, concurrent, IDOR, janitor, PRO/LEGEND)
- Regression: all `src/lib/takes/*` — 45 PASS

---

## 6. Production

**NOT DEPLOYED.** Requires Owner GO for commit → push → deploy.  
Cron needs `CRON_SECRET` in Vercel env after deploy.
