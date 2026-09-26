# Production Bootstrap Runbook

**Phase:** 1.9 — Operator Production Enablement
**Freeze:** [PHASE_1_9_DESIGN_FREEZE.md](../phases/PHASE_1_9_DESIGN_FREEZE.md) — APPROVED / LOCKED
**OD-20:** CLOSED — manual ADMIN only; no app bootstrap
**Supabase project:** `rzzxrgcdogkybkiidqgw`
**Production:** https://www.bitrymdym.pl (apex https://bitrymdym.pl → www) · https://bitrymdym.vercel.app

**NEVER** record in this file, chat, or git: service-role keys, passwords, access tokens, cookies, or secret env values.

---

## Progress log (2026-09-26)

| Step | Status |
|------|--------|
| Auth E2E (Brevo + PL template + OTP callback) | **PASS** |
| OD-20 first ADMIN | **PASS** (`dawid.thai@int.pl`) |
| First PLATFORM beat create/upload/publish | **BLOCKED** — agent has no ADMIN browser session; must use UI only |
| Anon/auth playback + download E2E | **PENDING** (needs PUBLISHED) |

---

## 1. Prerequisites

| Item | Check |
|------|--------|
| Design Freeze APPROVED | Phase 1.9 |
| Production app GREEN | Homepage HTTP 200 |
| Auth canonical URL | Supabase Site URL = `https://bitrymdym.pl` (not `*.vercel.app`) |
| Auth redirect allow-list | Includes `https://bitrymdym.pl/**` and `https://www.bitrymdym.pl/**` |
| Vercel Production env | `NEXT_PUBLIC_SITE_URL=https://bitrymdym.pl` |
| Operator access | Production browser + Supabase Dashboard (SQL) for this project |
| Rights-cleared MASTER audio | ≤ 180 s; allowed MIME; ≤ 50 MiB |
| Prefer second browser / profile | Separate AUTH USER for E2E (not ADMIN) |
| Schema | No migration; existing profiles / beats / assets / downloads |

**Forbidden:** auto-admin code, bootstrap endpoints, seed migrations, SQL READY/PUBLISHED bypass, Access Gate bypass.

**Email sender:** default Supabase SMTP is acceptable for Phase 1.9. Custom branded sender (`BitRymDym <noreply@bitrymdym.pl>`) is a **future** Owner GO — not required here.

---

## 2. Normal signup (operator → USER)

1. Open https://www.bitrymdym.pl/sign-up
2. Register with operator email/password (or existing Auth flow)
3. Complete any email confirmation if required by project Auth settings

**Pass:** Account created; can reach `/account` after login.
**Abort:** Signup fails.

---

## 3. Profile verification

Confirm in Supabase SQL Editor (read-only), substituting the operator uid:

```sql
SELECT id, role, account_level, display_name, created_at
FROM public.profiles
WHERE id = '<operator_auth_uid>';
```

**Pass:**

- `role = 'USER'`
- `account_level = 'BEGINNER_RAPPER'`

**Abort:** Missing profile or wrong defaults.

---

## 4. Operator-controlled ADMIN promotion (OD-20)

Run **only** in Supabase Dashboard SQL / service-role tooling (never via app UI):

```sql
UPDATE public.profiles
SET role = 'ADMIN'
WHERE id = '<operator_auth_uid>'
  AND role = 'USER';

SELECT id, role, account_level
FROM public.profiles
WHERE id = '<operator_auth_uid>';
```

**Pass:**

- `role = 'ADMIN'`
- `account_level` still `'BEGINNER_RAPPER'` (unchanged)

**Abort:** Update fails; role unchanged; account_level changed unexpectedly.

**Forbidden:** App Server Action, env-based first admin, client UPDATE of `role`.

Optional hygiene check (must fail for authenticated USER JWT — do not paste secrets):

```sql
-- Expect failure when run as authenticated non–service_role:
-- UPDATE public.profiles SET role = 'ADMIN' WHERE id = auth.uid();
```

---

## 5. ADMIN verification

1. Sign out / sign in on production
2. Open https://www.bitrymdym.pl/admin/beats
3. Confirm page loads (empty list OK)
4. From a non-admin session (or before promotion evidence): USER must **not** operate admin PLATFORM flows

**Pass:** ADMIN can use `/admin/beats`; USER denied.
**Abort:** USER reaches admin ops; ADMIN AuthZ fails.

Also confirm live count:

```sql
SELECT count(*)::int AS admin_count
FROM public.profiles
WHERE role = 'ADMIN';
```

Expect `admin_count >= 1`.

---

## 6. First PLATFORM beat creation

Use **existing UI only**:

1. `/admin/beats`
2. `/admin/beats/new`
3. **Audio-first:** select audio → wait for server analysis (duration auto; title suggestion). Enter **BPM manually** (required). Optional: producer, genre, style, key/scale, tags, cover. Duration is **not** typed by hand.
4. Submit → PLATFORM DRAFT + MASTER upload (existing pipeline) → READY when upload succeeds; redirects to `/admin/beats/[id]`

Verify (SQL read):

```sql
SELECT id, ownership_type, owner_id, status, title, bpm, duration_seconds
FROM public.beats
WHERE id = '<beat_id>';
```

**Pass:** `ownership_type = 'PLATFORM'`, `owner_id IS NULL`, `status = 'DRAFT'`, `duration_seconds` matches analyzed audio.
**Abort:** Wrong ownership; create fails. **Do not** INSERT beats via SQL.

---

## 7. MASTER upload

With Scope A create-with-master, MASTER is uploaded during create. If the detail page still shows missing READY, use the existing admin audio form as fallback:

1. Upload rights-cleared MASTER via existing admin audio form
2. Wait for success

**Abort:** Upload fails. **Do not** write storage objects or asset rows via ad-hoc SQL.

---

## 8. READY verification

```sql
SELECT id, beat_id, purpose, status, is_active, storage_bucket, object_key
FROM public.beat_audio_assets
WHERE beat_id = '<beat_id>'
ORDER BY created_at DESC;
```

**Pass:** Active `purpose = 'MASTER'`, `status = 'READY'`, `storage_bucket = 'beat-audio'`.

Confirm bucket privacy:

```sql
SELECT id, name, public FROM storage.buckets WHERE id = 'beat-audio';
```

**Pass:** `public = false`.
**Abort:** No READY MASTER; public bucket.

---

## 9. PUBLISHED via UI

1. On beat detail, use **Publish** only when UI gate allows (DRAFT + READY MASTER)
2. Do **not** `UPDATE beats SET status = 'PUBLISHED'` via SQL

```sql
SELECT id, status FROM public.beats WHERE id = '<beat_id>';
```

**Pass:** `status = 'PUBLISHED'`.
**Abort:** Gate blocked; publish fails. Fix upload/READY — never bypass.

---

## 10. Anonymous E2E

Incognito / logged-out:

| Step | Expect |
|------|--------|
| `/` | 200 |
| `/beats` | Lists the PUBLISHED beat |
| `/beat/[id]` | Detail + PlaybackShell + Download |
| Play | Playback works (play/pause/seek) |
| Download | File/URL obtained |

Behind the scenes (Access Gate REUSE):

- PLAYBACK signed URL TTL **120s**
- DOWNLOAD: reserve → signed URL TTL **300s** → finalize → `beat_download_events` (ANON hash)

**Abort:** Catalog empty; play/download fail; permanent public audio URL appears.

---

## 11. Authenticated USER E2E

Prefer a **second** account (not ADMIN):

1. `/sign-up` as normal USER
2. Login → `/beat/[id]` → playback → download
3. Open `/account/downloads`

**Pass:** Own history row; `user_id` matches; no other users’ events.
**Abort:** Missing event; cross-user leakage; download fail.

---

## 12. Limits smoke

Same UTC calendar day; **real** downloads only — no fake SQL rows.

| Actor | Expect |
|-------|--------|
| ANON | 1st PASS, 2nd PASS, 3rd **DENY** (OD-05 = 2) |
| AUTH USER | 1st–4th PASS, 5th **DENY** (OD-06 = 4) |

If full smoke impractical: mark **LIMITS SMOKE = PARTIAL** and record exact attempts.

Confirm config SSOT (code, not env secrets):

- `ANONYMOUS_DAILY_DOWNLOAD_LIMIT` default **2**
- `USER_DAILY_DOWNLOAD_LIMIT` default **4**
- `DOWNLOAD_RESERVATION_TTL_SECONDS` default **120**
- File: `src/config/downloads.ts`

---

## 13. OD-17 verification

For at least one successful authenticated download:

```text
reserve → signed URL SUCCESS → finalize → beat_download_events
```

```sql
SELECT id, beat_id, actor_type, user_id, anonymous_token_hash, created_at
FROM public.beat_download_events
WHERE beat_id = '<beat_id>'
ORDER BY created_at DESC
LIMIT 10;
```

**Pass:** Event exists after success; client cannot INSERT events; My Downloads shows USER event.
**Abort:** Event missing after success; manual SQL event creation used.

Do **not** modify Phase 1.8A code or invent events.

---

## 14. Security verification

| Check | Pass |
|-------|------|
| `beat-audio` `public=false` | Yes |
| No permanent public audio URL | Yes |
| Signed URL only after Access Gate | Yes |
| Download RPCs EXECUTE for `service_role` only | Yes |
| Reservations: no client grants / RLS deny | Yes |
| Events: authenticated SELECT own; no client INSERT | Yes |
| USER cannot PLATFORM admin ops | Yes |
| MODERATOR cannot PLATFORM admin ops (if present) | Yes |
| No client-side service-role | Yes |
| No new bootstrap endpoint | Yes |

**Security anomaly → IMMEDIATE STOP.**

---

## 15. Evidence package (private)

Record privately (Owner ops notes — not git secrets):

| Field | Example |
|-------|---------|
| UTC start / end | … |
| Operator identity | email + profile uid |
| Beat ID / Asset ID | uuids |
| Download event ID(s) | uuids |
| Counts | admin / published / ready / users / beats / events |
| E2E results | anon / auth / OD-17 |
| Limits attempts | N PASS / DENY |
| Security | checklist |
| Verdict | PASS / ABORT + step |

**Never** store: service-role key, cookies, passwords, access tokens.

Optional later: sanitized summary in docs (IDs + counts only) if Owner GO.

---

## 16. Abort / rollback rules

| Failure | Action |
|---------|--------|
| Signup / profile defaults fail | STOP |
| ADMIN promotion fails | STOP |
| USER reaches `/admin` ops | **IMMEDIATE STOP** |
| account_level changes on promote | STOP |
| Admin AuthZ / upload / READY / publish gate fail | STOP — no SQL bypass |
| Catalog / playback / download / My Downloads fail | STOP — do not patch 1.5–1.8A |
| Public audio URL / client service-role / RLS anomaly | **IMMEDIATE STOP** |
| Unexpected schema | STOP — BLOCKER |

Leftover DRAFT: document; archive later via UI. No requirement for destructive cleanup on abort.

---

## 17. Production data policy

**Allowed:** Real production rows created only by this controlled operator bootstrap (Auth users, PLATFORM beat, assets, download events from real E2E).

**Forbidden:**

- Auto fixtures / seed migrations
- Fake download events or reservations via SQL
- Test users created by application code
- Auto-admin / public bootstrap endpoint
- Copyrighted scraped audio

First beat = normal PLATFORM content with rights-cleared audio.

---

## Post-success live counts (target)

```sql
SELECT
  (SELECT count(*)::int FROM public.profiles WHERE role = 'ADMIN') AS admin_count,
  (SELECT count(*)::int FROM public.profiles) AS profiles_total,
  (SELECT count(*)::int FROM public.beats) AS beats_total,
  (SELECT count(*)::int FROM public.beats WHERE status = 'PUBLISHED') AS published_count,
  (SELECT count(*)::int FROM public.beat_audio_assets WHERE status = 'READY') AS ready_audio_count,
  (SELECT count(*)::int FROM public.beat_download_events) AS download_events;
```

Expect: ADMIN ≥ 1, PUBLISHED ≥ 1, READY ≥ 1, profiles ≥ 1, beats ≥ 1, events ≥ 1 (after E2E downloads).

Confirm production domains still GREEN after ops.

---

## Status stamp

| Field | Value |
|-------|--------|
| Runbook version | Phase 1.9 APPROVED freeze |
| Bootstrap | **PENDING** human operator |
| Phase CLOSED | **NO** until verification PASS |
