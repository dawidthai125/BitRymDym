# RECORDING WAVE 1 IMPLEMENTATION CLOSEOUT

**Date:** 2026-09-27  
**Baseline code:** `c5e1f17` (+ Wave 1 working tree)  
**Owner GO:** Wave 1 Implementation APPROVED  

```text
COMMIT / PUSH / DEPLOY = NONE (await Owner review)
```

---

## 1. Implementation summary

Wave 1 delivers the **Take domain foundation** only:

- Postgres `takes` (+ enums, constraints, indexes, soft-delete columns)
- RLS: owner SELECT own non-deleted; **no** client INSERT/UPDATE/DELETE; **no** staff blanket access
- Private Storage bucket `take-audio` (client direct access DENY)
- Server object-key builders + recording config constants
- Unit + live foundation tests

**Not implemented (correct):** MediaRecorder, Record button, upload session routes, Access Gate RECORD, shared grants, janitor cron, Premium.

---

## 2. Migration

| Item | Value |
|------|--------|
| File | `supabase/migrations/20260927180000_recording_wave1_take_foundation.sql` |
| Remote apply | **YES** via Supabase MCP (`recording_wave1_take_foundation`) |
| Touches beats / beat-audio policies | **NO** |

---

## 3. Database

| Element | Status |
|---------|--------|
| `take_status` / `take_recording_mode` | Created |
| `public.takes` | Created |
| FK `beat_id` → `beats` | Yes |
| FK `owner_id` → `profiles` (nullable for anon W2+) | Yes |
| XOR owner / anon hash | CHECK |
| `duration_seconds` 0..180 or NULL | CHECK |
| `expires_at`, `deleted_at` | Yes |
| Snapshots (beat duration, max seconds, bpm, offset) | Yes |

---

## 4. RLS

| Actor | Result |
|-------|--------|
| Owner SELECT own (`deleted_at IS NULL`) | ALLOW |
| Foreign / anon / moderator SELECT | DENY (empty) |
| Authenticated INSERT/UPDATE/DELETE | DENY (no policies + trigger requires service_role) |
| service_role | Full (server AuthZ path for Wave 2+) |

Live verified.

---

## 5. Storage

| Item | Result |
|------|--------|
| Bucket `take-audio` | private, 20 MiB interim MIME allow-list |
| Client upload | DENY |
| Service `createSignedUploadUrl` + PUT + signed read | PASS (foundation smoke) |
| `beat-audio` unchanged / still private | PASS |

---

## 6. Security

| Control | Status |
|---------|--------|
| Owner isolation | PASS |
| Owner_id spoof via client UPDATE | No-op (0 rows); ownership unchanged |
| Invalid beat FK | DENY |
| Invalid duration > 180 | DENY |
| Object key server builder + UUID validation | PASS |
| Cross-domain use of `beat_audio_assets` | Not used |

---

## 7. Tests

| Suite | Result |
|-------|--------|
| `wave1-foundation.test.ts` | 7 PASS |
| `wave1-live.test.ts` | 1 PASS |
| Full vitest | **321 PASS** / 1 skipped |
| lint (Wave 1 paths) | PASS |
| typecheck / `next build` | PASS |

---

## 8. Regression

| Area | Result |
|------|--------|
| Community live suites (W2–W5) | PASS in full run |
| beat-audio bucket still private | PASS |
| Downloads / Access Gate / PlaybackShell | Untouched |

---

## 9. Documentation

Updated: `PROJECT_STATE.md`, `CHANGELOG.md`, `architecture/RECORDING.md`, `architecture/README.md`, freeze footer status.

---

## 10. Remaining gaps (later waves)

| Gap | Wave |
|-----|------|
| Product signed upload session / finalize / duration probe | W2 |
| MediaRecorder + PlaybackShell Record + anon QT UX | W3 |
| Entitlement enforcement + own take download API + Moje próbki | W4 |
| Shared grants + RECORD capability in Access Gate | W5 |
| Janitor / mobile certification / hardening | W2 skeleton / W6 |

---

## 11. Next wave readiness

```text
READY_FOR_WAVE_2_PLAN = YES
READY_FOR_WAVE_2_IMPLEMENTATION = NO (needs Owner GO after Wave 1 review/commit)
```

---

## Final

```text
RECORDING_WAVE1_IMPLEMENTATION = COMPLETE
TAKE_DOMAIN = PASS
RLS = PASS
STORAGE = PASS
SECURITY = PASS
REGRESSION = PASS
DOCUMENTATION = UPDATED
COMMIT = NONE
PUSH = NONE
DEPLOY = NONE
NEXT_STEP = OWNER REVIEW
```
