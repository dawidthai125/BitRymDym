# Phase 1.8A Design Freeze

**Title:** Download Productization
**Candidate ID:** Phase 1.8A
**Baseline (closed):** `origin/main` @ `fd87f23`
**Depends on:** Phase 1.5 Access Gate LOCKED · Phase 1.6 Public Surface LOCKED · Phase 1.7 Admin Ops LOCKED
**Supabase project:** `rzzxrgcdogkybkiidqgw`
**SSOT:** §5, §9, §12–§13, §16–§17, §36, §39
**Document status:** DESIGN FREEZE — **APPROVED / LOCKED** (2026-09-26)
**Owner GO:** APPROVED — Download Productization (interim OD-05 / OD-06 / OD-17)
**Implementation status:** **COMPLETE / CLOSED / LOCKED** @ `fd87f23` — Audit **PASS** · Docs **COMPLETE** · Push **COMPLETE** · Production Verify **PASS**

### Implementation model (technical — frozen OD-17 unchanged)

```text
AUTH / IDENTITY
→ AUTHORIZATION
→ READY asset
→ RESERVATION (ephemeral; NOT an event; default TTL 120s)
→ signed URL SUCCESS
→ FINALIZE
→ beat_download_events
```

- `beat_download_reservations` = limit holds with TTL (default 120s); expired holds are not counted
- `beat_download_events` = **only** successful signed-URL issuances (OD-17)
- URL failure / abandon → `release_beat_download_reservation` (no event)
- Crash before finalize → no final event; reservation expires; slot frees
- Claim-before-URL model rejected and removed

### Known non-blocking gaps (retained)

- No live RLS/concurrency integration tests (unit/source-contract coverage)
- Live product E2E **NOT VERIFIED** (`published_count=0`, `admin_count=0` / OD-20)


Legend:

| Label | Meaning |
|-------|---------|
| **APPROVED / LOCKED** | Owner-approved freeze — implementation must follow |
| **REUSE** | Existing locked capability — do not rebuild |
| **FROZEN** | Approved interim rule for Phase 1.8A |
| **OUT / DEFERRED** | Explicitly not in Phase 1.8A |

---

## Owner-approved frozen rules (2026-09-26)

### OD-05 — Anonymous limit (CLOSED / ACCEPTED — Phase 1.8A interim)

```text
anonymous_daily_download_limit = 2
window = UTC calendar day
identity = httpOnly opaque anonymous token
server stores only token hash
scope = global (all beats)
```

### OD-06 — Authenticated user limit (CLOSED / ACCEPTED — Phase 1.8A interim)

```text
user_daily_download_limit = 4
window = UTC calendar day
identity = authenticated user_id
scope = global per user
```

### OD-17 — Counting semantics (CLOSED / ACCEPTED — Phase 1.8A interim)

```text
DOWNLOAD_EVENT = successful DOWNLOAD signed-URL issuance
after:
  AUTH / IDENTITY
  → SERVER AUTHORIZATION
  → LIMIT CHECK
  → ALLOW
  → SIGNED DOWNLOAD URL
  → EVENT
```

### Explicit OUT

| ID | Status in 1.8A |
|----|----------------|
| OD-13 watermark | **OUT** (remains OPEN product-wide) |
| OD-04 payments | **OUT** (remains OPEN product-wide) |

### Product / architecture locks

| Item | Frozen |
|------|--------|
| Moje pobrane | **IN** — minimal authenticated download history |
| Data model | `beat_download_events` — **DATABASE CHANGE REQUIRED** |
| Config SSOT | `src/config/downloads.ts` — single source of truth; no magic numbers |
| Access Gate | **REUSE** — no duplicate download authorization engine |
| Role / AccountLevel | No new rules; AccountLevel unused for download AuthZ/limits |
| Quick Take / Tracks / Community | **OUT** |

---

## Confirmed current Download state (pre-implementation evidence)

| Fact | Evidence |
|------|----------|
| Access Gate DOWNLOAD exists | `requestBeatAudioAccess({ purpose: "DOWNLOAD" })` in `src/lib/beats/audio-access.ts` |
| Signed URL DOWNLOAD exists | same; Storage `createSignedUrl` |
| TTL DOWNLOAD = 300s | `BEAT_AUDIO_DOWNLOAD_TTL_SECONDS` / Phase 1.5 freeze |
| MASTER fallback for DOWNLOAD | Access Gate resolution order (1.5 FROZEN) |
| No product UI | Phase 1.6 `PUBLIC_UI_FORBIDDEN_PURPOSES = ["DOWNLOAD"]`; no CTA on `/beat/[id]` |
| No product limits | 1.5 freeze: limits DEFERRED; no counters in code |
| No download event table | 1.5: `beat_audio_access_events` DEFERRED; no migration |
| MODERATOR DOWNLOAD | DENY (1.5 FROZEN) |
| ADMIN DOWNLOAD | ALLOW any status (1.5 FROZEN) |
| AccountLevel unused for audio access | 1.5 / 1.7 FROZEN |

---

## 1. Purpose

Productize download for **PUBLISHED** beats by wiring UI + server limit enforcement + download events onto the **existing** Access Gate:

```text
PUBLISHED BEAT
  → DOWNLOAD CTA
  → SERVER ACCESS GATE (REUSE)
  → LIMIT CHECK (NEW)
  → DOWNLOAD_EVENT (NEW)
  → SIGNED DOWNLOAD URL (REUSE, TTL 300s)
  → FILE (browser / OS download)
```

Do **not** invent a second signed-URL service or alternate AuthZ stack.

---

## 2. Scope IN

**LOCKED — Phase 1.8A implements:**

1. **Download CTA** on public `/beat/[id]` for PUBLISHED beats with READY audio (MASTER fallback OK).
2. **Server-side limit check** inside / immediately before DOWNLOAD branch of Access Gate (not UI-only).
3. **Download event persistence** (`beat_download_events`) for counting + authenticated history.
4. **Anonymous identity** per OD-05 (httpOnly opaque token; server stores hash only).
5. **Authenticated daily limit** per OD-06 (`user_id`, global, UTC day).
6. **Counting semantics** per OD-17 (successful DOWNLOAD signed-URL issuance).
7. **Minimal “Moje pobrane bity”** for authenticated users only.
8. **Config** in `src/config/downloads.ts` (no magic numbers).
9. Unit + integration tests + safe live verification plan.
10. Documentation updates after implementation PASS.

**DATABASE:** `beat_download_events` — **DATABASE CHANGE REQUIRED** at implementation (not applied at freeze lock).

---

## 3. Scope OUT

| Out | Reason |
|-----|--------|
| Watermarking (OD-13) | **OUT** of 1.8A; OD remains OPEN product-wide |
| Payments / Premium / extra downloads (OD-04, OD-07, OD-08) | **OUT** |
| `premium_daily_download_limit` enforcement | No Premium product yet |
| Per-beat purchase | OUT |
| Community USER beat downloads special rules | Same PUBLISHED gate; no community upload yet |
| Quick Take / Tracks / Messaging | OUT |
| Waveform | OUT |
| Full Audit Log CMS | OUT (download events ≠ full audit system) |
| Changing PLAYBACK TTL / Access Gate architecture | LOCKED |
| Closing GAP-PUBLISH-READY | Unrelated; remains as-is |
| Admin bootstrap | OD-20 CLOSED — unchanged |
| Fingerprinting / invasive tracking | OUT |
| Guaranteeing perfect anonymous anti-abuse | Impossible; document limitations |

---

## 4. User Flow

### 4.1 Anonymous

```text
/beat/[id] (PUBLISHED + READY audio)
  → Download CTA
  → Server Action: request DOWNLOAD
  → Access Gate AuthZ (PUBLISHED + actor ANON)
  → Ensure anonymous download token cookie (httpOnly)
  → Count DOWNLOAD_EVENTs for token hash today (UTC)
  → If count >= 2 → BLOCK (no URL)
  → Else createSignedUrl SUCCESS → INSERT DOWNLOAD_EVENT
  → Client triggers file download / navigation to URL
```

### 4.2 Authenticated USER

```text
/beat/[id]
  → Download CTA
  → Server Action: request DOWNLOAD
  → Access Gate AuthZ (PUBLISHED + actor USER)
  → Count DOWNLOAD_EVENTs for user_id today (UTC)
  → If count >= 4 → BLOCK
  → Else createSignedUrl SUCCESS → INSERT DOWNLOAD_EVENT
  → Bit appears in Moje pobrane (distinct beat)
```

### 4.3 ADMIN

```text
DOWNLOAD ALLOW per Phase 1.5 (any status with READY)
FROZEN: ADMIN exempt from daily product limits (ops)
Still emit DOWNLOAD_EVENT for auditability (actor_type=ADMIN)
```

### 4.4 MODERATOR

```text
DOWNLOAD DENY (Phase 1.5 FROZEN) — unchanged
```

### 4.5 Blocked / error

| Case | Result |
|------|--------|
| Limit reached | Safe message; **no** signed URL |
| Non-PUBLISHED (non-ADMIN) | FORBIDDEN |
| Missing READY audio | NOT_FOUND / DENY |
| Network / server error | Safe generic error |
| Unauthorized / forbidden | Safe DENY |

Mobile: CTA usable; download via browser download / share sheet; no desktop-only UX.

---

## 5. Authorization Flow

**REUSE** existing chain; extend DOWNLOAD branch only:

```text
REQUEST
  → AUTH / IDENTITY
  → SERVER AUTHORIZATION (Access Gate actor rules — REUSE)
  → BUSINESS RULE (PUBLISHED / ADMIN / MODERATOR DENY — REUSE)
  → LIMIT CHECK (NEW — server-only)
  → ALLOW
  → SIGNED DOWNLOAD URL (REUSE Storage)
  → DOWNLOAD_EVENT insert (NEW)
```

**FROZEN order (critical):**

1. Validate purpose / resolve actor / load beat / `canRequestBeatAudioAccess`
2. Resolve READY asset (existing)
3. **Limit check** (if not ADMIN-exempt)
4. **createSignedUrl SUCCESS**
5. **Insert DOWNLOAD_EVENT** (status ISSUED / counting + history)
6. Return `{ url, expiresAt, purpose, beatId, assetId }` (+ optional `remainingToday`)

If insert fails after URL issued: rare; log server-side; do not revoke URL (TTL short). Prefer transactional discipline where practical.

**UI is not a security boundary.** Direct Server Action invocation must hit the same gate + limits.

**AccountLevel:** unused for download AuthZ / limits in 1.8A (Premium later).

---

## 6. Download Limits

### 6.1 OD-05 — Anonymous (FROZEN)

| Field | FROZEN |
|-------|--------|
| Limit value | **`anonymous_daily_download_limit = 2`** |
| Period | Calendar day **UTC** `00:00–24:00` |
| Scope | **Global** (all beats), not per-beat |
| Identity model | Opaque httpOnly cookie `brd_dl_aid` = random UUID; server stores **hash** of token only |
| Cookie flags | `HttpOnly`, `Secure` (prod), `SameSite=Lax`, path `/`, Max-Age ≥ 400 days |
| Storage | Rows in `beat_download_events` keyed by `anonymous_token_hash` (+ `actor_type=ANON`) |
| Expiration | Daily window for counting; token persists across days |
| Abuse limitation | Cookie required for anon DOWNLOAD; no cookie → mint new token (counts from 0 — known reset vector) |
| IP | Optional **hashed** IP for ops analysis only — **NOT** primary limit key |
| Known limitations | Clearing cookies / private mode resets limit; not fraud-proof; Foundation interim |

### 6.2 OD-06 — Authenticated USER (FROZEN)

| Field | FROZEN |
|-------|--------|
| Limit value | **`user_daily_download_limit = 4`** |
| Identity | authenticated `user_id` |
| Period | Calendar day **UTC** |
| Scope | **Global** daily count (not per-beat) |
| Reset | Next UTC day |
| What counts | Each DOWNLOAD_EVENT (see §7) |
| Per-beat limit | **OUT** of 1.8A |
| Premium / AccountLevel boost | **OUT** |

### 6.3 ADMIN

**FROZEN:** exempt from OD-05/OD-06 daily caps; still subject to Access Gate AuthZ.

### 6.4 Configuration

**FROZEN:**

- Module **`src/config/downloads.ts`** exporting:
  - `ANONYMOUS_DAILY_DOWNLOAD_LIMIT` (= 2)
  - `USER_DAILY_DOWNLOAD_LIMIT` (= 4)
  - optional env overrides `DOWNLOAD_LIMIT_ANON_DAILY` / `DOWNLOAD_LIMIT_USER_DAILY`
- Single import into Access Gate / limit service — **no magic numbers** in UI or scattered files.
- No new feature-flag admin CMS.
- Later: move to DB/config table without changing Access Gate API.

SSOT conceptual keys: `anonymous_daily_download_limit`, `user_daily_download_limit`.

---

## 7. Counting Semantics (OD-17)

### DOWNLOAD_EVENT definition (FROZEN)

```text
DOWNLOAD_EVENT =
  one successful server-side issuance of a DOWNLOAD-purpose signed URL
  AFTER AUTH / IDENTITY
  AFTER SERVER AUTHORIZATION ALLOW
  AFTER LIMIT CHECK ALLOW (or ADMIN exempt)
  AFTER signed URL creation SUCCESS
```

| Moment | Counts? |
|--------|---------|
| CTA click only | NO |
| AuthZ DENY | NO |
| Limit BLOCK | NO (no URL) |
| Signed URL issued successfully | **YES = 1 DOWNLOAD_EVENT** |
| Browser retry / refresh requesting new URL | **YES** (new issuance) |
| Re-use of same unexpired signed URL (no new request) | NO new event |
| Failed Storage transfer after issuance | Still YES (cannot observe transfer reliably; TTL bounds damage) |
| PLAYBACK URL issuance | NO |

**Repeat downloads of same beat:** each successful DOWNLOAD URL issuance counts toward the **daily limit**.
**Moje pobrane:** distinct `beat_id` per `user_id` (upsert last_downloaded_at); repeats refresh timestamp, do not create duplicate list rows.

**Beat-level total downloads (SSOT §17):** `COUNT(*)` of DOWNLOAD_EVENTs for `beat_id` (including anon) — optional display OUT of 1.8A UI; data supports it.

---

## 8. Data Model

**No existing download/event table to REUSE** (1.5 deferred `beat_audio_access_events`).

### FROZEN minimal schema (implementation later)

**Table: `beat_download_events`** (append-only) — **REQUIRED**

| Column | Notes |
|--------|-------|
| `id` | uuid PK |
| `beat_id` | FK → `beats.id` |
| `asset_id` | FK → `beat_audio_assets.id` (nullable if needed) |
| `actor_type` | `ANON` \| `USER` \| `ADMIN` |
| `user_id` | nullable FK → `profiles.id` (USER/ADMIN) |
| `anonymous_token_hash` | nullable text (ANON) |
| `created_at` | timestamptz default now() |

Indexes:

- `(user_id, created_at DESC)` partial where user_id not null
- `(anonymous_token_hash, created_at DESC)` partial where hash not null
- `(beat_id, created_at DESC)`

Prefer **no second table** for Moje pobrane — derive:

```sql
SELECT beat_id, max(created_at) AS last_downloaded_at
FROM beat_download_events
WHERE user_id = $1 AND actor_type = 'USER'
GROUP BY beat_id
ORDER BY last_downloaded_at DESC
```

**RLS:** users SELECT own events only; INSERT via server/service role after Access Gate only; anon no direct client insert.

**Counters:** derived from events for 1.8A (no separate counter table) — ZERO DUPLICATE LOGIC.

---

## 9. “Moje pobrane bity”

| Decision | FROZEN |
|----------|--------|
| In Phase 1.8A? | **YES — MINIMAL** |
| Why | SSOT §5 / §16–§17; Owner GO |
| Scope | Authenticated-only list: title + link to `/beat/[id]` + last download time |
| Route | e.g. `/account/downloads` or section on `/account` |
| Anonymous | **OUT** (no durable account) |
| Full profile CMS | **OUT** |

---

## 10. Security

| Threat | Mitigation |
|--------|------------|
| UI-only limit | Enforce in Access Gate server path |
| Direct Server Action | Same gate + limits |
| Signed URL leak | TTL 300s; no permanent URL; private bucket |
| Replay of URL | Storage TTL; re-request counts again |
| Multiple tabs / concurrent | Serialize count via DB insert + count query; accept rare race → prefer short transaction / advisory lock if needed |
| Cookie theft | HttpOnly; HTTPS; still soft identity |
| Cookie clear reset | Documented limitation |
| MODERATOR download | DENY unchanged |
| Role spoof / AccountLevel escalation | Unused for limits |
| Service-role client | FORBIDDEN |
| Non-PUBLISHED download (USER/ANON) | DENY unchanged |

Access Gate remains the security boundary. Client UI is not.

---

## 11. Configuration

- **`src/config/downloads.ts`** (+ optional env)
- Server-only reads
- SSOT conceptual keys preserved
- No new config platform
- No magic numbers

---

## 12. UI

**FROZEN:**

- Download control on `/beat/[id]` when PUBLISHED + READY audio
- States: idle / loading / success / limit-reached / error
- Show remaining downloads when known (optional)
- No download on `/beats` catalog row (detail only)
- Remove Phase 1.6 hard-out for DOWNLOAD **only** for this CTA path
- Accessibility: button/link, keyboard, clear disabled reason
- Mobile usable

**OUT:** download from PlaybackShell chrome (optional later); bulk download.

---

## 13. Tests

### UNIT

- Limit arithmetic (anon/user/admin exempt)
- Counting semantics helpers
- Config defaults (= 2 / = 4)
- Access purpose DOWNLOAD still AuthZ matrix (existing + limit wrappers)

### INTEGRATION

| Case | Expect |
|------|--------|
| Anon under limit | URL + event |
| Anon at limit | BLOCK, no URL |
| User under limit | URL + event + history |
| User at limit | BLOCK |
| Unauthenticated direct DOWNLOAD OK path | anon rules |
| Non-PUBLISHED USER/ANON | DENY |
| Missing READY | DENY |
| MODERATOR DOWNLOAD | DENY |
| ADMIN DOWNLOAD | ALLOW (exempt limit) |
| Concurrent / retry | events + limits behave safely |
| TTL constant | 300s DOWNLOAD |

### LIVE E2E (when ADMIN + PUBLISHED READY exist)

- Publish fixture → download as anon → hit limit → cleanup
- Auth user history appears
- No leftover fixtures

If no ADMIN/content: mark LIVE **NOT FULLY VERIFIED** (known ops gap).

---

## 14. Documentation impact (post-implementation)

Update after implementation PASS (not part of freeze lock alone):

- `docs/PROJECT_STATE.md`
- `docs/CHANGELOG.md`
- `docs/phases/PHASE_1_FOUNDATION.md`
- `docs/architecture/BEATS.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/architecture/AUTHORIZATION.md`
- `docs/decisions/DECISION_LOG.md` (implementation closeout note)
- `docs/README.md` / architecture README indexes
- This freeze → implementation SHA on phase closeout

---

## 15. Open Decisions (freeze lock)

| ID | Phase 1.8A status |
|----|-------------------|
| OD-05 | **CLOSED / ACCEPTED** — interim model above |
| OD-06 | **CLOSED / ACCEPTED** — interim model above |
| OD-17 | **CLOSED / ACCEPTED** — interim model above |
| OD-13 | **OUT** of 1.8A; remains OPEN product-wide |
| OD-04 | **OUT** of 1.8A; remains OPEN product-wide |

Other ODs unchanged.

---

## 16. Risks

| Risk | Mitigation |
|------|------------|
| Anon cookie reset abuse | Document; optional later harden; rate signals |
| Race on concurrent downloads | DB transaction / careful ordering |
| Counting URL issue ≠ file transfer | Short TTL; OD-17 explicit |
| Scope creep into Premium | Hard OUT |
| Magic numbers | Central `src/config/downloads.ts` |
| Empty production catalog | Ops ADMIN + content (not freeze scope) |

---

## 17. Acceptance Criteria (LOCKED)

| ID | Criterion |
|----|-----------|
| AC-01 | PUBLISHED beat detail shows Download CTA when READY audio exists |
| AC-02 | Download uses existing Access Gate purpose `DOWNLOAD` only |
| AC-03 | DOWNLOAD signed URL TTL remains 300s |
| AC-04 | Anon limited to **2**/UTC day server-side |
| AC-05 | USER limited to **4**/UTC day server-side |
| AC-06 | Limit reached → no signed URL + clear error |
| AC-07 | DOWNLOAD_EVENT recorded per successful signed-URL issuance |
| AC-08 | Authenticated Moje pobrane lists distinct downloaded beats |
| AC-09 | MODERATOR DOWNLOAD still DENY |
| AC-10 | ADMIN DOWNLOAD still ALLOW; exempt from daily caps |
| AC-11 | No watermark / payments / Premium limit logic |
| AC-12 | No client service-role; private Storage unchanged |
| AC-13 | AccountLevel unused for download AuthZ |
| AC-14 | Limits from `src/config/downloads.ts` only — not hardcoded in UI |
| AC-15 | Unit + integration tests PASS |
| AC-16 | Docs updated on closeout; OD-05/06/17 CLOSED for interim 1.8A model |
| AC-17 | Live fixtures cleaned if used |
| AC-18 | `beat_download_events` migration applied at implementation |
| AC-19 | No Quick Take / Tracks / Community / duplicate AuthZ engine |

---

## FINAL STATUS

```text
PHASE 1.8A DESIGN FREEZE = APPROVED / LOCKED
CANDIDATE = Download Productization
IMPLEMENTATION = COMPLETE
IMPLEMENTATION AUDIT = PASS
DOCUMENTATION = COMPLETE
COMMIT = fd87f23
PUSH = COMPLETE (origin/main)
PRODUCTION VERIFY = PASS
PHASE CLOSED = YES — CLOSED / LOCKED
DATABASE = beat_download_events + beat_download_reservations applied
OD-05 / OD-06 / OD-17 = CLOSED / ACCEPTED (Phase 1.8A interim model)
OD-13 / OD-04 = OUT of 1.8A
MOJE POBRANE = IN (/account/downloads)
CONFIG SSOT = src/config/downloads.ts
ACCESS GATE = REUSE (requestBeatAudioAccess DOWNLOAD branch)
FLOW = AUTH → AUTHZ → READY → RESERVATION → signed URL SUCCESS → FINALIZE → EVENT
CONCURRENCY = reserve_beat_download_slot + pg_advisory_xact_lock
LIVE E2E = NOT VERIFIED (published_count=0 / admin_count=0; non-blocking)
```

**PHASE 1.8A = COMPLETE / CLOSED / LOCKED** @ `fd87f23`

**DESIGN FREEZE = APPROVED / LOCKED**
**IMPLEMENTATION = COMPLETE**
**IMPLEMENTATION AUDIT = PASS**
**DOCUMENTATION = COMPLETE**
**COMMIT / PUSH = COMPLETE**
**PRODUCTION VERIFY = PASS**

Next: **COLD-START AUDIT (next Foundation candidate)** — no implementation without Owner GO.
