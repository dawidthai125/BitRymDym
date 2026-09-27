# RECORDING / QUICK TAKE DESIGN FREEZE v1.0 — PROPOSAL

**Document type:** Design Freeze proposal (not approved / not locked)  
**Author role:** Architecture / Implementation Engineer  
**Owner:** Prezes Dawid · Architect: ChatGPT  
**Date:** 2026-09-27  
**Baseline:** `main` @ `c5e1f17` (Community EPIC CLOSED)  
**Prerequisite audit:** [RECORDING_QUICK_TAKE_COLD_START_AUDIT.md](./RECORDING_QUICK_TAKE_COLD_START_AUDIT.md)

```text
STATUS OF THIS DOCUMENT = PROPOSAL ONLY
IMPLEMENTATION         = NONE
MIGRATION              = NONE
COMMIT / PUSH / DEPLOY = NONE
```

---

## 1. Executive Summary

Cold-start audit confirmed Recording / Quick Take is **NOT IMPLEMENTED**. Adjacent foundations that **must be reused** (not replaced):

| Foundation | Reuse |
|------------|--------|
| Access Gate (`requestBeatAudioAccess`) | Beat access checks; **extend** with recording capability semantics — do not fork a second AuthZ engine |
| Signed upload transport (Audio Transport V1) | Session → signed PUT → finalize pattern for take blobs |
| Private Storage + server-chosen object keys | Same privacy model; **dedicated take bucket** (Phase 1.5 intent) |
| `profiles.account_level` | Entitlement input only; ROLE ≠ ACCOUNT LEVEL unchanged |
| `PlaybackShell` | Add Record entry; do not replace player |
| Community / OD-05–17 / READY publish | **OUT** — do not reopen |

**Proposed V1 product shape:**

```text
BEAT → ACCESS (beat + RECORD capability) → PLAYBACK → RECORD MIC
  → TAKE (mic-only, private) → PREVIEW (client: beat + mic) → SAVE / DELETE
```

**Explicitly OUT of Recording EPIC:** MIX / EXPORT / Final Track (OD-14 remains OPEN).

This proposal lists **Design Freeze decisions as PROPOSED** and **Open Decisions** for Owner/Architect. Nothing is closed by this document alone.

---

## 2. Current State

| Area | Fact |
|------|------|
| Recording / QT code | NONE |
| Take DB / Storage / retention | NONE |
| Shared beat grants | NONE |
| Access Gate purposes | `PLAYBACK` \| `DOWNLOAD` only |
| Account level | Enum exists; unused for recording |
| Beat audio bucket | `beat-audio` private; PLATFORM + USER beat masters |
| Player | `PlaybackShell` — no Record |
| Edge Functions / cron | Empty — no janitor |
| Mix/export | NONE |

See cold-start audit for full forensic matrix.

---

## 3. Product Model

### 3.1 Goal

User records own vocal/rap **against** a beat to test fit. Primary persisted artifact = **MIC TAKE** (not a mixed song).

### 3.2 Assumed entitlement table (PRODUCT ASSUMPTION — not CLOSED)

| Actor | Mode | Max seconds (entitlement) | Retention | Notes |
|-------|------|--------------------------:|----------:|-------|
| Anonymous | Quick Take | 30 | Short server TTL | SSOT §20; V1 scope = **OD-REC** |
| `BEGINNER_RAPPER` | Quick Take | 30 | 24 h | SSOT §19–§21 |
| `PRO_RAPPER` | Full Take | 180 (global cap) | 10 days | Owner brief; maps SSOT “Premium Full Take” §22–§23 — **mapping OPEN** |
| `LEGEND_RAPPER` | Full Take+ | 180 (global cap) | > PRO | Exact days = **OPEN** |

### 3.3 Hard limit rule (to freeze after approval)

```text
recording_max_seconds =
  MIN(
    beat.duration_seconds,
    entitlement.max_recording_seconds,
    GLOBAL_TECHNICAL_MAX_SECONDS   // 180
  )
```

Examples:

| beat.duration | entitlement | effective max |
|--------------:|------------:|--------------:|
| 90 | 180 | **90** |
| 150 | 180 | **150** |
| 240 | 180 | **180** |
| 200 | 30 (BEGINNER) | **30** |

**Enforcement locus (proposed):** server-only module `resolveRecordingPolicy(accountLevel | anon, beat)` + re-check at session create, finalize, and (if needed) analyze. Client timer is UX only.

### 3.4 Non-goals (V1 Recording EPIC)

- MIX / EXPORT / publish Track from take  
- Watermark / final codec pipeline (OD-12/13)  
- Payments / Premium purchase flows (OD-04/07)  
- Waveform engine  
- Reopening Community moderation/publish  

---

## 4. Access Model

### 4.1 Principle: REUSE Access Gate, add capability

Do **not** invent a parallel “can hear this beat?” engine.

```text
RECORD request
  → AUTH (session | anonymous identity policy)
  → RECORDING ENTITLEMENT (account level / anon policy)
  → BEAT ACCESS (shared Access Gate core)
  → RECORD CAPABILITY (recording-specific allow)
  → BUSINESS RULES (status, READY, duration)
  → TAKE SESSION / STORAGE
```

### 4.2 Proposed capability split

| Capability | Meaning | Today |
|------------|---------|-------|
| `PLAYBACK` | Hear beat via signed URL | Implemented |
| `DOWNLOAD` | Download beat master via signed URL + limits | Implemented |
| `RECORD` | Create MIC TAKE against this beat | **Proposed — new** |

**SSOT of this split:** Design Freeze doc + `AUTHORIZATION.md` extension + central `canRequestBeatRecordAccess` (name illustrative). Product truth remains MASTER SSOT §18–§24 + freeze decisions after Owner GO.

### 4.3 Proposed semantics (PROPOSED — Owner must confirm)

| Question | Proposed answer | Rationale |
|----------|-----------------|-----------|
| Does PLAYBACK alone allow RECORD? | **No** | Separate capability; avoids “heard once ⇒ may record forever” coupling |
| Does DOWNLOAD imply RECORD? | **No** | Download is scarcity/limit product; recording is entitlement product |
| Can USER record on PUBLISHED public beat? | **Yes** (if entitlement allows) | Primary QT use case |
| Can owner record on own non-PUBLISHED beat? | **Yes for own DRAFT/REJECTED?** | **OPEN** — useful for producers testing; increases AuthZ surface |
| Can ADMIN/MOD record for moderation? | **Out of V1** unless needed | Staff use PLAYBACK today |
| Anonymous RECORD | Allowed only if OD-REC-ANON = yes | SSOT allows; abuse risk |

### 4.4 Recommended V1 freeze slice (narrow)

```text
RECORD allowed iff:
  entitlement.recording.enabled
  AND beat.status = PUBLISHED
  AND beat has active READY MASTER (same READY notion as playback)
  AND (actor is entitled anonymous OR authenticated user)
  AND NOT blocked by anti-abuse
```

Owner/own-DRAFT recording and shared-beat recording = later waves / OD.

---

## 5. Shared Beat Model

### 5.1 Current fact

**No** `beat_shares` / grants / ACL. SSOT §16 “Bity udostępnione” is product future only.

### 5.2 Required product path (Owner brief)

```text
PRODUCER/OWNER → shares BEAT → USER gains access → open beat → PLAYBACK → RECORD
```

### 5.3 Proposed architecture (no second gate)

Introduce a **beat access grant** domain (name illustrative: `beat_access_grants`) consumed by **one** Access Gate resolver:

```text
resolveBeatAccess(actor, beatId) → {
  canPlayback: boolean
  canDownload: boolean   // may stay PUBLISHED-only in V1
  canRecord: boolean     // grant flag + entitlement + RECORD rules
  source: PUBLIC | OWNER | GRANT | STAFF
}
```

Grant row (conceptual):

| Field | Purpose |
|-------|---------|
| `id` | UUID |
| `beat_id` | Target beat |
| `grantee_user_id` | Recipient |
| `granted_by` | Owner / admin |
| `capabilities` | e.g. `{ playback: true, record: true }` |
| `expires_at` | Optional |
| `created_at` | Audit |

**Rules (PROPOSED):**

- Owner can always PLAYBACK own beat (existing staff/owner patterns to align carefully with RLS).  
- Grant with `record: true` ⇒ RECORD only if entitlement also allows.  
- Grant without `record` ⇒ PLAYBACK maybe, RECORD deny.  
- Public PUBLISHED remains `source: PUBLIC` without grant rows.

### 5.4 Wave placement

Shared grants are **not** required for first playable QT on public PUBLISHED beats. Propose:

- **Wave 1–3:** PUBLISHED-only RECORD (no shares)  
- **Wave 5:** Grants + shared RECORD + E2E  

Do not block QT MVP on share schema if Owner prioritizes public QT first — but document that Owner’s “shared producer beat” story needs Wave 5 (or pull share foundation earlier if Owner insists).

---

## 6. Entitlement Model

### 6.1 Central resolver (anti-scatter)

```text
ACCOUNT LEVEL (profiles.account_level | ANON)
        ↓
resolveRecordingEntitlement(level)   // single module / config
        ↓
RecordingPolicy {
  enabled
  max_recording_seconds
  retention_seconds
  max_active_takes
  max_takes_per_utc_day        // V1 recommended
  download_own_take_enabled    // OD
  concurrent_sessions
}
        ↓
SERVER AUTHORIZATION (every mutation)
```

**Forbidden:** `if (accountLevel === 'PRO_RAPPER')` sprinkled in UI/actions.

**Config home (proposed):** `src/config/recording.ts` (mirrors `src/config/downloads.ts`) — numeric SSOT for interim values after Owner GO; not duplicated in client as authority.

### 6.2 V1 fields (minimal)

| Field | V1 | Notes |
|-------|----|-------|
| `enabled` | MUST | Kill-switch |
| `max_recording_seconds` | MUST | 30 / 180 / … |
| `retention_seconds` | MUST | Drive `expires_at` |
| `max_active_takes` | MUST | Anti-abuse + storage |
| `max_takes_per_utc_day` | MUST | Flood control |
| `download_own_take_enabled` | OD | See §16 |
| `concurrent_sessions` | MUST | Default 1 |

Account level remains identity SSOT; entitlements are **derived policy**, not a new role.

### 6.3 Premium naming drift

SSOT says “Premium Full Take”; Owner uses PRO/LEGEND. **OD-REC-MAP** must close before Wave 4 ships Full Take. Until then, Design Freeze may document *assumed* mapping as PROPOSED only.

---

## 7. Take Data Model

### 7.1 Entity: `takes` (proposed name)

| Column | Type (conceptual) | Notes |
|--------|-------------------|-------|
| `id` | uuid PK | Server-generated |
| `owner_id` | uuid NULLABLE | NULL = anonymous take; else `profiles.id` |
| `anonymous_token_hash` | text NULL | Reuse download-style hashing patterns for anon; never store raw token |
| `beat_id` | uuid FK | Beat recorded against |
| `recording_mode` | enum | `QUICK` \| `FULL` (derived from entitlement at create) |
| `status` | enum | See lifecycle |
| `duration_ms` | int NULL | Server-validated after upload |
| `byte_size` | int NULL | After upload |
| `mime_type` | text NULL | Declared + validated |
| `bucket` | text | Server-set |
| `object_key` | text | Server-set; opaque `.bin` |
| `beat_duration_seconds_snapshot` | int | Snapshot at session |
| `recording_max_seconds_snapshot` | int | Policy snapshot (anti-drift) |
| `beat_bpm_snapshot` | int NULL | For future mix sync |
| `started_at_client` | timestamptz NULL | Client claim; **not** authority |
| `audio_offset_ms` | int DEFAULT 0 | Mic vs beat start offset metadata |
| `created_at` / `updated_at` | timestamptz | |
| `expires_at` | timestamptz NOT NULL | Retention clock |
| `deleted_at` | timestamptz NULL | Soft delete |
| `failure_reason` | text NULL | Safe codes only |

Optional later: `beat_audio_asset_id` snapshot for mix reproducibility.

### 7.2 Minimal lifecycle (PROPOSED)

```text
PENDING_UPLOAD  — row created; signed upload issued; no READY audio yet
READY           — object present; duration validated; playable to owner
FAILED          — upload/validation failed; cleanup eligible
EXPIRED         — past expires_at; inaccessible; cleanup eligible
DELETED         — user soft-delete; cleanup eligible
```

**Why not `RECORDING` as DB status:** browser MediaRecorder state is client-ephemeral; DB should reflect **server-known** persistence. Client “recording…” is UI state.

### 7.3 Failure / interrupt mapping

| Event | Proposed handling |
|-------|-------------------|
| Browser close mid-record | No upload ⇒ row stays `PENDING_UPLOAD` until TTL janitor |
| Upload fail / network loss | `FAILED` or remain `PENDING_UPLOAD`; user retry with new session |
| Interrupted MediaRecorder | Client discard; optional cancel API → `DELETED` / `FAILED` |
| Fake / overlong duration | Finalize DENY → `FAILED` |
| User delete | `DELETED` + schedule storage remove |
| Retention elapsed | `EXPIRED` + storage remove |

### 7.4 RLS sketch (conceptual)

- Owner SELECT own non-expired, non-deleted takes  
- Anon SELECT only via server (service role) after token proof — prefer **no direct client RLS read** for anon; use Server Actions  
- INSERT/UPDATE/DELETE from clients: **DENY**; mutations via service after AuthZ (mirror beat audio)  
- Staff: optional later; not V1 requirement  

---

## 8. Storage Model

### 8.1 Bucket (PROPOSED)

| Decision | Proposal | Reason |
|----------|----------|--------|
| Bucket name | `take-audio` (or `quick-take` per Phase 1.5) | Domain isolation from `beat-audio` (Phase 1.5 freeze) |
| Public | **false** | SSOT §9 |
| Client Storage INSERT | **DENY** | Same as beats |
| Permanent public URL | **FORBIDDEN** | |

Community already namespaced USER beats inside `beat-audio`; QT should **not** add take objects there if freeze intends separate domain.

### 8.2 Object key convention (PROPOSED)

Align with opaque `.bin` style:

```text
user/{ownerId}/takes/{takeId}/mic.bin
anon/{tokenHashPrefix}/{takeId}/mic.bin
```

- Server generates all path segments  
- Client never supplies bucket / ownerId / takeId / key  
- Extension always `.bin` (codec in DB metadata only)

### 8.3 Upload / download / delete

| Flow | Proposal |
|------|----------|
| Upload | Signed upload URL (reuse Audio Transport pattern): AuthZ → create take row → issue signed PUT (short TTL) → client PUT → finalize |
| Download own take | Signed GET after AuthZ + entitlement.download_own_take (OD) |
| Preview playback | Signed GET PLAYBACK-equivalent for take object (short TTL) |
| Delete | Soft-delete row + async/sync storage remove |
| Retention cleanup | Job marks EXPIRED + removes object |

Signed URL TTL: propose reuse-class values (e.g. upload 120–300s; playback 120s) — exact numbers OD/config.

---

## 9. Recording Pipeline

```text
MIC (getUserMedia)
  → MediaRecorder (browser)
  → client Blob / chunks buffer
  → createTakeSession (Server Action / Route Handler)
       Auth + entitlement + beat RECORD access + anti-abuse
       → insert take PENDING_UPLOAD
       → signed upload URL (server key)
  → client PUT blob
  → finalizeTake
       verify object exists, size, MIME allow-list
       measure / verify duration server-side
       compare to recording_max_seconds_snapshot
       set READY + expires_at from retention policy
```

| Concern | Proposal |
|---------|----------|
| Who assigns `takeId` | **Server** at session create |
| When DB row created | **Before** upload (binds key + ownership) |
| When upload starts | After permission + optional countdown; blob complete preferred for V1 |
| Chunked vs final | **V1: single final blob PUT** (simplest). Chunked/resumable = DEFERRED unless size forces it |
| Large files | Cap by `max_bytes` from duration × bitrate budget; deny oversize |
| Duration truth | **Server** analysis of uploaded object (decode/probe). Client duration = hint only |
| Fake duration | Finalize fails if probed duration > max + small tolerance |
| MIME | Allow-list from negotiated MediaRecorder type; reject others |
| Size | `byte_size <= policy.max_upload_bytes` |

**Source of truth for duration:** server probe at finalize. Snapshot max seconds stored at session create so mid-flight entitlement upgrades cannot extend an in-flight take without new session.

---

## 10. Audio Format

### 10.1 Browser reality (MediaRecorder)

| Browser | Typical MediaRecorder audio |
|---------|------------------------------|
| Chrome / Edge / Android Chrome | `audio/webm;codecs=opus` (common) |
| Firefox | webm/opus commonly |
| Safari desktop / iOS Safari | Often `audio/mp4` / AAC — **webm support limited or absent** |

**V1 cannot assume a single codec** without transcoding.

### 10.2 Proposed V1 strategy

| Item | Proposal |
|------|----------|
| Preferred MIME | `audio/webm;codecs=opus` where supported |
| Fallback MIME | `audio/mp4` (AAC) on Safari/iOS |
| Negotiation | Client reports `MediaRecorder.isTypeSupported`; server allow-lists both |
| Storage | Store **native MediaRecorder output** as opaque `.bin` |
| Extension in key | Always `.bin` |
| Server validation | MIME allow-list + sniff if feasible; size; duration probe |
| Transcoding to one canonical format | **DEFERRED** (OD-12 adjacent) |
| Mixed beat+vocal file | **FORBIDDEN in V1** |

Risk: heterogeneous formats complicate future MIX — acceptable if metadata + original bytes preserved (see §20).

---

## 11. Synchronization

### 11.1 Preferred model (aligns SSOT §24)

```text
BEAT audio     = separate source (Access Gate PLAYBACK)
MIC TAKE       = separate private object
PREVIEW        = client mixes in real time (two elements) OR sequential UX
PERMANENT MIX  = NOT V1
```

| Question | Proposed answer |
|----------|-----------------|
| Is beat played by existing player? | **Yes** — PlaybackShell / same signed PLAYBACK |
| Does recording store only MIC? | **Yes** |
| Start offset stored? | **Yes** — `audio_offset_ms` (and optional client timestamps) for future mix |
| BPM / beat metadata snapshot? | **Yes** — bpm + duration snapshots on take |
| Preview with beat + mic? | **Yes, client-side** — dual playback; no server mix |
| Server-side sync mix? | **No in V1** |

Recording session UX: start beat playback and MediaRecorder as near-simultaneously as the browser allows; record offset if start skew detected.

---

## 12. UX

### 12.1 Player (proposed)

```text
[ ▶ / ❚❚ ]  [======== progress ========]  [ 🔊 ]  [ 🎙 RECORD ]
```

### 12.2 Record flow

```text
RECORD
  → mic permission prompt
  → COUNTDOWN (3..2..1)
  → RECORDING (beat plays + mic captures)
  → STOP | AUTO-STOP at recording_max_seconds
  → PREVIEW (beat + mic)
  → SAVE (finalize already or confirm persist) / DELETE / RE-RECORD
```

Timer display:

```text
elapsed / recording_max_seconds
e.g. 00:12 / 00:30   or   01:05 / 02:14
```

Auto-stop at client max **and** server rejects oversize/overlong anyway.

### 12.3 Error / edge UX

| Case | UX |
|------|-----|
| Permission denied | Explain + settings hint; no fake recording |
| No microphone | Clear empty-state |
| Mic busy | Retry message |
| Browser unsupported | Block Record with support message |
| Upload failed | Keep local preview if possible; Retry upload |
| Network lost | FAILED / retry session |
| User cancels | Delete pending take |
| Limit reached (daily/active) | Entitlement message; no session |
| Session expired (signed URL) | Re-issue or restart |

Anonymous (if enabled): post-preview CTA — Zaloguj / Załóż konto / Pobierz (SSOT §20) per OD.

---

## 13. Mobile

| Concern | V1 design stance |
|---------|------------------|
| iOS Safari mic permission | Require user gesture to start; handle denial |
| Android Chrome | Prefer webm/opus; handle backgrounding |
| Tab background / screen lock | Expect MediaRecorder pause/stop; mark FAILED or incomplete; do not silently “succeed” |
| Incoming call / audio focus | Treat as interrupt → stop → user re-record |
| Memory | Prefer modest bitrate; enforce max_bytes; avoid holding multiple blobs |
| Playback + record | Dual audio elements; test mono mic + beat; document known iOS quirks |
| Certification | Wave 6 dedicated mobile matrix — not a silent assumption of Wave 3 |

No native app in V1 — browser only.

---

## 14. Security

### 14.1 Request path

```text
REQUEST
  → AUTH (user session | anon token policy)
  → SERVER AUTHZ
  → RECORDING ENTITLEMENT (server resolve; ignore client-claimed level)
  → BEAT ACCESS + RECORD capability
  → BUSINESS RULE (PUBLISHED/READY/max/active/daily)
  → RLS deny client writes + private storage
  → TAKE row + signed URL
```

### 14.2 Threat responses (design)

| Threat | Mitigation |
|--------|------------|
| IDOR take id | Ownership check every read/finalize/delete; RLS + service asserts |
| Owner spoof | `owner_id` from auth.uid() only; never client body |
| Beat spoof | Session binds `beat_id` server-side; object key includes takeId not client beat |
| Account-level spoof | Existing profile trigger; entitlement from DB profile, not client |
| Duration spoof | Server probe; snapshot max |
| MIME spoof | Allow-list + size; optional magic-byte check |
| Object key spoof | Server-only key generation |
| Signed URL abuse | Short TTL; single take binding; no public bucket |
| Replay finalize | Status machine: only PENDING_UPLOAD → READY once |
| Unauthorized shared record | Grant + capability; default deny without grant/public rule |
| Privilege via PLAYBACK cookie | RECORD capability independent |

**CRITICAL:** Client-reported `accountLevel` / `maxSeconds` / `ownerId` must never authorize.

---

## 15. Retention

| Trigger | DB | Storage |
|---------|----|---------|
| User DELETE | `deleted_at` + status DELETED | Remove object (sync or near-sync) |
| TTL (`expires_at`) | Status EXPIRED | Remove object |
| Abandoned PENDING_UPLOAD | Expire after short pending TTL (e.g. 1–24h) | Remove if any partial object |
| FAILED | Eligible for cleanup | Remove |

**V1 preference:** soft-delete in DB for audit short window **or** hard-delete row after storage purge — pick one in freeze (recommend: soft-delete + janitor hard-purge after N days for DELETED/EXPIRED).

**Janitor:** Edge Function + `pg_cron` or scheduled platform job — **required for correctness** (SSOT §38 temporary data). Without it, do not ship anon/long retention claims.

Grace: optional short grace on EXPIRED before hard storage delete (OPEN).

---

## 16. Download

Own MIC TAKE download is **not** automatic.

| Level | Proposed default | Status |
|-------|------------------|--------|
| Anonymous | Download CTA may exist for ephemeral blob (SSOT §20) | OD-REC-DL |
| BEGINNER | Allow download own take while not expired | OD-REC-DL |
| PRO / LEGEND | Allow download own take | OD-REC-DL |

**Not** tied to beat DOWNLOAD limits (OD-05/06) unless Owner explicitly unifies — recommend **separate** take-download policy to avoid breaking Phase 1.8A semantics.

If download is premium-only for BEGINNER → mark OD and keep BEGINNER preview-only.

---

## 17. Anti-Abuse

Minimal V1 set:

| Control | Proposal |
|---------|----------|
| Max duration | Entitlement + 180 global + beat duration MIN |
| Max upload bytes | Derived ceiling from max duration × bitrate budget |
| Max active READY takes | e.g. BEGINNER 3, PRO 10 (numbers OD) |
| Max creates / UTC day | e.g. low for anon/BEGINNER |
| Concurrent sessions | 1 per user |
| Pending upload TTL | Short; janitor |
| Rate on session endpoint | Simple per-user cooldown (reuse Wave 5 cooldown *idea*, not community table) |

Avoid building a generic rate-limit platform. Prefer columns + server checks + janitor.

---

## 18. Observability

| Event | V1 |
|-------|-----|
| TAKE_CREATED (session) | **MUST** (structured log / minimal table) |
| TAKE_READY | **MUST** |
| TAKE_FAILED | **MUST** |
| TAKE_DELETED | **MUST** |
| TAKE_EXPIRED | **MUST** (janitor) |
| RECORDING_STARTED / STOPPED | **OPTIONAL** (client telemetry; privacy-sensitive) |
| Full audit framework | **DEFERRED** (same stance as Community Wave 5) |

Do not block MVP on DOWNLOAD_EVENT-style perfection; do require enough server logs to debug AuthZ denies and finalize failures.

---

## 19. Test Strategy

### Unit

- Entitlement resolver matrices  
- `recording_max_seconds` MIN rule  
- Capability: PLAYBACK ≠ RECORD; DOWNLOAD ≠ RECORD  
- Status transitions  
- Object key builder (no client segments)

### Integration / RLS

- Owner read/write deny patterns  
- Foreign take IDOR DENY  
- Anon isolation  

### Storage

- Private bucket; signed upload bind  
- MIME/size deny  

### E2E (roles)

| Case | Expect |
|------|--------|
| Anon 30s (if enabled) | PASS / gated |
| BEGINNER 30s | PASS |
| PRO full beat ≤180 | PASS |
| Beat shorter than entitlement | Cap = beat length |
| Beat longer than entitlement | Cap = entitlement |
| Shared beat + grant | PASS (Wave 5) |
| Shared without record capability | DENY |
| Unauthorized / non-PUBLISHED | DENY |
| Expired take access | DENY |
| Wrong owner | DENY |
| Fake duration / oversize | DENY |
| Failed upload | FAILED + cleanup |
| Delete | Soft + storage gone |
| Download AuthZ | Per OD |

### Mobile

Manual/cert matrix iOS Safari + Android Chrome (Wave 6).

---

## 20. Future Mix / Export Boundary

```text
V1 RECORDING EPIC          V2+ MIX/EXPORT EPIC (OD-14)
─────────────────────      ────────────────────────────
MIC TAKE bytes             Mix engine
Beat remains separate      Export file / Track publish
Preview = client dual-play Watermark / codec final
```

**V1 must preserve for future mix:**

- `beat_id`  
- `audio_offset_ms`  
- `beat_duration_seconds_snapshot`  
- `beat_bpm_snapshot` (and optional asset id)  
- `duration_ms` of mic  
- original mime / byte size  
- ownership  

**V1 must NOT:** bake mixed masters into take storage; auto-publish tracks; require OD-14 closed to ship QT.

---

## 21. Design Freeze Decisions

All statuses = **PROPOSED** (Owner/Architect close separately).

| ID | Decision | Reason | Impact | Status |
|----|----------|--------|--------|--------|
| DF-REC-01 | MIC TAKE ≠ mixed song; V1 stores mic-only | SSOT §24; audit | Schema/storage/UX | PROPOSED |
| DF-REC-02 | MIX/EXPORT out of Recording EPIC | OD-14; scope control | Waves | PROPOSED |
| DF-REC-03 | RECORD is separate capability from PLAYBACK/DOWNLOAD | Prevent implicit escalation | Access Gate extension | PROPOSED |
| DF-REC-04 | Reuse single Access Gate resolver; add RECORD capability | Zero duplicate AuthZ | `audio-access` evolution | PROPOSED |
| DF-REC-05 | V1 RECORD eligibility = PUBLISHED + READY master (+ entitlement) | Narrow secure MVP | Shared beats deferred | PROPOSED |
| DF-REC-06 | Shared beat grants = separate wave; grant feeds same gate | Owner path without forking AuthZ | Wave 5 / schema | PROPOSED |
| DF-REC-07 | `recording_max_seconds = MIN(beat, entitlement, 180)` server-enforced | Owner/SSOT alignment | Config + finalize | PROPOSED |
| DF-REC-08 | Central entitlement module from `account_level` / anon | No scattered ifs | `config/recording` | PROPOSED |
| DF-REC-09 | Dedicated private take bucket (not `beat-audio`) | Phase 1.5 domain isolation | New bucket on impl GO | PROPOSED |
| DF-REC-10 | Opaque `.bin` keys; server-chosen paths | Match beat conventions | Storage | PROPOSED |
| DF-REC-11 | Signed upload session → PUT → finalize (Audio Transport pattern) | Proven; avoids body limits | API shape | PROPOSED |
| DF-REC-12 | Duration authority = server probe at finalize | Anti spoof | Finalize pipeline | PROPOSED |
| DF-REC-13 | V1 store native MediaRecorder output; dual MIME allow-list; transcoding DEFERRED | Safari vs Chromium | Format OD | PROPOSED |
| DF-REC-14 | Preview = client dual playback; no server mix | Scope | Player UX | PROPOSED |
| DF-REC-15 | Persist offset + beat snapshots for future mix | Enable V2 | Take columns | PROPOSED |
| DF-REC-16 | Take lifecycle: PENDING_UPLOAD → READY \| FAILED → EXPIRED \| DELETED | Minimal durable states | DB | PROPOSED |
| DF-REC-17 | Retention via `expires_at` + janitor mandatory | SSOT temporary data | Ops | PROPOSED |
| DF-REC-18 | Client Storage INSERT DENY; no public take URLs | Security parity | Storage policies | PROPOSED |
| DF-REC-19 | Anti-abuse: active cap + daily cap + concurrent 1 + max bytes | Simple safety | Service checks | PROPOSED |
| DF-REC-20 | Extend PlaybackShell with Record; no player rewrite | Reuse | UI wave | PROPOSED |
| DF-REC-21 | ROLE ≠ ACCOUNT LEVEL unchanged | AuthZ SSOT | Identity | PROPOSED |
| DF-REC-22 | Do not modify OD-05/06/17 beat download semantics for takes | Isolation | Downloads | PROPOSED |

---

## 22. Implementation Waves

Adapted to **this** repo (Access Gate + Audio Transport + PlaybackShell + no shares):

| Wave | Scope | Depends |
|------|-------|---------|
| **W1** | Design Freeze LOCKED docs · `takes` schema · RLS deny-by-default · private `take-audio` bucket · entitlement config module (no UI) | Owner GO on DF + ODs needed for numbers |
| **W2** | Take signed upload transport (session/finalize) · MIME/size/duration validation · janitor skeleton | W1 |
| **W3** | MediaRecorder client · PlaybackShell Record · countdown/timer · preview dual-play · BEGINNER (+ optional anon) Quick Take 30s E2E | W2 |
| **W4** | PRO/LEGEND Full Take entitlements · retention differences · Moje próbki list · delete UX | W3 + OD-REC-MAP / LEGEND days |
| **W5** | `beat_access_grants` · Access Gate RECORD via grant · shared-beat E2E · unauthorized DENY matrix | W3+; can parallel W4 if staffed |
| **W6** | Security regression · IDOR · fake duration · mobile certification · observability hardening · docs closeout | W3–W5 |

**PROPOSED_WAVES = 6**

Alternative if Owner prioritizes shared producer flow before Full Take: swap W4/W5 order.

---

## 23. Documentation Plan

**After Owner approves Design Freeze (not now):**

| Document | Action |
|----------|--------|
| `docs/phases/PHASE_RECORDING_DESIGN_FREEZE.md` | **Create** — LOCKED freeze (copy approved DF-REC + ODs closed) |
| `docs/architecture/RECORDING.md` | **Create** — HOW: pipeline, sync, UX, mobile |
| `docs/architecture/TAKES.md` | **Create** — data model, RLS, retention |
| `docs/architecture/AUTHORIZATION.md` | **Update** — RECORD capability + grants |
| `docs/architecture/AUDIO_TRANSPORT.md` or sibling | **Update/link** — take signed upload reuse |
| `docs/architecture/SYSTEM_ARCHITECTURE.md` §9 | **Update** — implementation status |
| `docs/PROJECT_STATE.md` | **Update** — next epic pointer |
| `docs/decisions/OPEN_DECISIONS.md` | **Update** — close/add OD-REC-* |
| `docs/decisions/DECISION_LOG.md` | **Update** — on LOCK |
| `docs/CHANGELOG.md` / `docs/README.md` | Index freeze |
| MASTER SSOT | **Do not rewrite casually** — only if Owner amends product truth |

This proposal file remains historical audit/proposal artifact.

---

## 24. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| iOS MediaRecorder format fragmentation | HIGH | Dual allow-list; defer transcode; mobile Wave 6 |
| Shipping QT without janitor | HIGH | Block prod claim of TTL until job exists |
| Entitlement mapping SSOT Premium vs PRO/LEGEND | MED | OD-REC-MAP before W4 |
| Shared beats delayed vs Owner story | MED | Explicit Wave 5; or pull forward |
| Duration probe inaccurate on some containers | MED | Tolerance band + deny on failure to probe |
| Client dual-preview sync drift | MED | Store offset; UX “good enough” for V1 |
| Take download confused with beat download limits | LOW | Separate policy (DF-REC-22) |
| Scope creep into MIX | HIGH | DF-REC-02 hard OUT |

---

## 25. Open Decisions

| ID | Question | Why blocking / important |
|----|----------|--------------------------|
| OD-REC-01 | Anonymous Quick Take in V1? | Abuse + identity + TTL ops |
| OD-REC-02 | Map Full Take to `PRO_RAPPER` / `LEGEND_RAPPER` vs SSOT “Premium”? | Entitlement table |
| OD-REC-03 | LEGEND retention exact duration | W4 |
| OD-REC-04 | May owner RECORD on own non-PUBLISHED beats? | AuthZ surface |
| OD-REC-05 | Take download allowed for BEGINNER / all levels / premium-only? | UX + AuthZ |
| OD-REC-06 | Numeric caps: max_active_takes, max/day (per level) | Anti-abuse |
| OD-REC-07 | Bucket final name `take-audio` vs `quick-take` | Ops/docs |
| OD-REC-08 | Soft-delete grace before hard purge | Retention |
| OD-REC-09 | Pull shared-grants before or after Full Take wave? | Roadmap |
| OD-REC-10 | Pending-upload TTL length | Janitor |
| OD-REC-11 | Exact signed URL TTLs for take upload/playback | Config |
| OD-REC-12 | Server duration probe library / approach | Impl spike |

Related existing OPEN (unchanged): OD-08 Premium levels, OD-09 names, OD-12 codec, OD-14 mix, OD-18 share **stats** (grants ≠ stats).

**OPEN_DECISIONS = 12** (OD-REC-01…12) plus unchanged global ODs above.

---

## 26. Final Recommendation

```text
RECOMMENDATION
  Approve Design Freeze v1.0 direction after Owner closes critical ODs
  (especially OD-REC-01, OD-REC-02, OD-REC-05, OD-REC-09).

  Then LOCK docs/phases/PHASE_RECORDING_DESIGN_FREEZE.md
  Then Owner Implementation GO for Wave 1 only.

DO NOT
  Implement code, migrations, buckets, or UI from this proposal alone.
```

### Final verdict

```text
RECORDING_DESIGN_FREEZE_PROPOSAL = COMPLETE
IMPLEMENTATION                   = NONE
MIGRATION                        = NONE
COMMIT                           = NONE
PUSH                             = NONE
DEPLOY                           = NONE
OPEN_DECISIONS                   = 12
PROPOSED_WAVES                   = 6
READY_FOR_OWNER_REVIEW           = YES
```

---

*End of proposal. No production code, schema, storage, UI, commit, push, or deploy was performed.*
