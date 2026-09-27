# RECORDING WAVE 2 — TRANSPORT / MEDIARECORDER — COLD START / READINESS AUDIT

**Type:** Audit + plan only  
**Date:** 2026-09-27  
**Baseline:** `dd2ffd7b486829f6cbbb0cc549527a23c1621059`  
**Wave 1:** CLOSED · PRODUCTION VERIFIED  

```text
IMPLEMENTATION = NONE
COMMIT / PUSH / DEPLOY = NONE
```

**SSOT / freeze:** [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md) · [RECORDING.md](../architecture/RECORDING.md) · [AUDIO_TRANSPORT.md](../architecture/AUDIO_TRANSPORT.md)

---

## 0. Scope alignment note

| Source | Wave 2 wording |
|--------|----------------|
| **This Owner GO** | Mic → MediaRecorder → session → AuthZ → upload → `take-audio` → TAKE READY; **no** product Quick Take UI / player Record surface |
| Design Freeze §19 table | W2 = transport/finalize/validation; W3 = PlaybackShell Record + MediaRecorder UX |

**Recommendation for implementation GO:** Follow **this Owner Wave 2 instruction** (capture + transport foundation). Treat PlaybackShell Record button / countdown product UI as **Wave 3**. Document that freeze table row for “MediaRecorder” moves earlier into W2 for the capture module only.

---

## 1. Baseline facts

| Item | Status |
|------|--------|
| `takes` table + RLS + soft-delete | EXISTS (W1) |
| `take-audio` private bucket | EXISTS (W1) |
| Object key `user/{ownerId}/takes/{takeId}/mic.bin` | EXISTS helpers |
| Config retention/caps/MIME constants | EXISTS (`src/config/recording.ts`) — **not enforced** |
| MediaRecorder / getUserMedia | **NOT IMPLEMENTED** |
| Take upload routes | **NOT IMPLEMENTED** |
| Access Gate `RECORD` capability | **NOT IMPLEMENTED** |
| Shared grants | **NOT IMPLEMENTED** |
| Beat signed upload | **IMPLEMENTED** (`beat-audio` only) |

---

## 2. Existing audio transport (REUSE inventory)

### 2.1 Proven pattern (KEEP)

```text
AuthZ → INSERT PENDING_UPLOAD row (service) → server object_key
  → createSignedUploadUrl → client PUT binary
  → server download object → validate MIME/size/duration
  → status READY
```

| Asset | Location | Reuse for takes? |
|-------|----------|------------------|
| Signed upload session shape | `audio-transport.ts` `SignedUploadSession` | **Pattern yes** — new take-specific type |
| Route shape | `POST /api/beats/audio/session` + analyze | **Mirror** as `/api/takes/...` — do **not** overload beat routes |
| Client forbid bucket/ownerId/key | `rejectClientChosenStorageParams` | **Copy pattern** into take AuthZ |
| Object key binding assert | `user-audio-authz.ts` / `assertUserBeatObjectKeyBinding` | **Analog** `assertTakeObjectKeyBinding` |
| MIME/size validate | `validateAudioUploadMeta` | **Partial** — take MIME allow-list + `TAKE_AUDIO_MAX_BYTES` (do not use beat 50 MiB blindly) |
| Duration probe | `analyzeBeatAudioBytes` | **Evaluate reuse** for take blobs; may need take-specific wrapper (webm/mp4 from MediaRecorder) |
| Access Gate PLAYBACK/DOWNLOAD | `audio-access.ts` | **Do not** use for take upload; optional later for take preview signed GET |
| Bucket | `beat-audio` | **NEVER** for takes |

### 2.2 Verdict: EXISTING_AUDIO_TRANSPORT

**READY** as a **pattern library**; **NOT** a drop-in for takes.

Do **not** extend `createUserBeatSignedUploadSession` to write into `takes` — that couples community DRAFT beat upload to recording and risks regression.

**Proposed modules (plan only):**

- `src/lib/takes/take-transport.ts` — session + finalize  
- `src/app/api/takes/session/route.ts` · `.../finalize/route.ts` (names architecture-final)  
- Client capture helper (no PlaybackShell) for tests / future W3 wiring  

---

## 3. MediaRecorder audit

| Capability | Status |
|------------|--------|
| `MediaRecorder` | **NOT IMPLEMENTED** |
| `getUserMedia` / mic permission | **NOT IMPLEMENTED** |
| MIME / codec negotiation | **NOT IMPLEMENTED** (config allow-list only) |
| Chunks / Blob assembly | **NOT IMPLEMENTED** |
| Duration measurement (client) | **NOT IMPLEMENTED** |
| Cancel / interrupt / pagehide | **NOT IMPLEMENTED** |
| Browser support matrix | Docs only (freeze §16) |

Unit tests explicitly assert MediaRecorder absence (`playback-state.test.ts`, wave1 migration text).

---

## 4. Recording session model — recommendation

### Recommendation: **No separate `recording_sessions` table in Wave 2**

**Use `takes` row as the session** (already designed in W1):

| Session concept | Maps to `takes` |
|-----------------|-----------------|
| session/take id | `takes.id` |
| owner | `owner_id` |
| beat | `beat_id` |
| upload pending | `status = PENDING_UPLOAD` |
| ready | `READY` |
| fail | `FAILED` + `failure_reason` |
| cancel/abandon | `FAILED` or leave `PENDING_UPLOAD` until janitor (W2+ / later) |
| max duration | `recording_max_seconds_snapshot` |
| retention clock | `expires_at` |
| storage | `object_key` / `storage_bucket` |

**Why not a second table:** Zero duplicate lifecycle; W1 RLS/indexes already target `takes`; signed upload binds to `takeId` path segment; Design Freeze lifecycle is take-centric.

**Optional later:** ephemeral Redis/memory locks for concurrent session — **OUT of W2**; single active PENDING_UPLOAD soft-check is enough stub.

**Duplicate submit:** finalize only from `PENDING_UPLOAD` → `READY` once; second finalize DENY (mirror asset finalize).

---

## 5. Server authorization — Wave 2 minimal contract

Full chain (freeze):

```text
AUTH → AUTHZ → ENTITLEMENT → BEAT ACCESS (RECORD) → BUSINESS RULE → RLS/STORAGE → TAKE
```

### Wave 2 MUST implement (minimal)

| Step | Minimal W2 behavior |
|------|---------------------|
| AUTH | `requireUser()` — **logged-in only** (anon OUT of W2) |
| AUTHZ | Role `USER` (or any authenticated profile); no new permission key required if Owner accepts interim |
| ENTITLEMENT | **Stub:** read `profiles.account_level`; set `recording_max_seconds_snapshot` via simple map BEGINNER→30, PRO/LEGEND→180; set `expires_at` from `RECORDING_RETENTION_SECONDS`; **do not** enforce daily/active caps yet (OUT) |
| BEAT ACCESS | Interim: beat `PUBLISHED` + active READY master exists (reuse readiness check pattern from publish/gate). **No** shared-grant RECORD (OUT). **No** Access Gate purpose enum change required if dedicated take AuthZ helper asserts PUBLISHED+READY |
| BUSINESS RULE | `recording_max_seconds = MIN(beat.duration, entitlementMax, 180)` stored on row; finalize probes duration ≤ snapshot (+tolerance) |
| STORAGE | service_role insert take + signed upload to `take-audio` only |

### Wave 2 MUST NOT implement

- Full entitlement / Premium hybrid engine (W4)  
- Anti-abuse active/daily enforcement (W4)  
- Anon token take path (W3)  
- Shared grant RECORD (W5)  
- Extending `canRequestBeatAudioAccess` with RECORD unless needed for shared preview later  

### SERVER_AUTHZ readiness

**GAP** (design clear; code missing) — **not a blocker** to start implementation.

---

## 6. Audio format plan

| Item | Recommendation |
|------|----------------|
| **A. Canonical store** | Native MediaRecorder bytes as opaque `.bin` (freeze) |
| **B. Preferred MIME** | `audio/webm;codecs=opus` (Chromium/Firefox) |
| **C. Fallback** | `audio/mp4` / AAC (Safari / iOS) |
| **D. Server allow-list** | Reuse `TAKE_AUDIO_INTERIM_MIME_ALLOWLIST` (+ codecs param strip for matching) |
| **E. Max size** | `TAKE_AUDIO_MAX_BYTES` (20 MiB) |
| **F. Max duration** | Snapshot ≤ 180; BEGINNER stub 30 |
| **G. Transcoding** | **NOT required** in W2; OD-12 / ffmpeg **DEFERRED** |

**Risk:** `analyzeBeatAudioBytes` may be beat-oriented (wav/mp3/flac). Spike in W2 impl: probe webm/mp4 duration; if library fails, document GAP and use conservative fail-closed or alternate probe — **do not** add ffmpeg without Owner GO.

---

## 7. Security / abuse — wave assignment

| Threat | Wave |
|--------|------|
| Unauth recording | W2 (requireUser) |
| Foreign take_id / beat_id / object key | W2 (server bind + assert) |
| Client-chosen bucket/owner path | W2 (reject client params) |
| MIME spoof / oversize | W2 (validate on session + finalize) |
| Fake duration | W2 (server probe vs snapshot) |
| Replay finalize | W2 (status machine) |
| Partial / abandoned PENDING_UPLOAD | W2 soft: leave PENDING; **janitor OUT** (Owner) — document orphan gap |
| Concurrent sessions flood | **Stub** optional 1 PENDING per user check; full caps **W4** |
| Mic permission UX | W2 capture module + W3 product UI |
| Shared unauthorized RECORD | **W5** |

---

## 8. Storage contract (confirmed)

| Contract | Status |
|----------|--------|
| Bucket `take-audio` | PRIVATE = true (prod verified W1) |
| Client INSERT/SELECT | DENY |
| Key `user/{ownerId}/takes/{takeId}/mic.bin` | Helpers exist |
| Transport | Same signed-URL pattern as beat-audio; **different bucket** |

**STORAGE = READY** (foundation); transport wiring = GAP until W2 code.

---

## 9. Client UX contract (no UI impl)

```text
IDLE
 → REQUESTING_MIC
 → READY_TO_RECORD   (permission granted; recorder prepared)
 → RECORDING
 → STOPPING
 → UPLOADING         (signed PUT)
 → PROCESSING        (finalize / probe)
 → READY | FAILED
```

| Event | Expected |
|-------|----------|
| Permission denied | → FAILED / IDLE + clear message |
| Browser unsupported | Block before REQUESTING_MIC |
| User cancel | Abort; mark take FAILED or abandon PENDING |
| Upload failure | FAILED; allow retry = **new** take session (no key reuse) |
| Max duration | Client auto-stop + server enforce |
| Page close mid-record | PENDING orphan (janitor later) |
| Mic disconnect | STOP → FAILED/retry |

Product chrome (Record on PlaybackShell) = **Wave 3**.

---

## 10. Test plan (do not implement yet)

| Layer | Cases |
|-------|-------|
| UNIT | Key binding; MIME/size; MIN(duration) snapshot; reject client spoof fields; status transitions |
| INTEGRATION | session → signed PUT → finalize READY; second finalize DENY |
| SECURITY / RLS | owner only; foreign take DENY; unauth DENY |
| STORAGE | client insert DENY; object in `take-audio` only |
| MEDIARECORDER | isTypeSupported matrix; permission denied mock; blob assemble (jsdom/limited) |
| FAILURE | oversize, overlong probe, wrong status, wrong beat |
| REGRESSION | beat `/api/beats/audio/*` unchanged; community/download suites PASS |
| E2E minimal | Logged-in USER + PUBLISHED beat → create take session → PUT fixture/webm → finalize → READY row; cleanup soft-delete/archive |

---

## 11. Implementation steps (proposed W2 breakdown)

1. **Take AuthZ helper** — requireUser; PUBLISHED+READY beat; entitlement snapshot stub; reject client storage params  
2. **take-transport session** — insert `PENDING_UPLOAD`; signed upload URL for server key  
3. **take-transport finalize** — download object; MIME/size/duration; → READY or FAILED  
4. **API routes** — session + finalize (no beat route changes)  
5. **Capture module** — getUserMedia + MediaRecorder + Blob (headless-testable; **no** PlaybackShell)  
6. **Tests** — unit + live transport + regression  
7. **Docs** — RECORDING.md / PROJECT_STATE / CHANGELOG (only on Owner Implementation GO)

**Janitor skeleton:** Owner OUT for W2 — **skip** unless Owner revises.

---

## 12. Gaps / risks / decisions

### BLOCKERS

**NONE** for starting Wave 2 implementation after Owner GO.

### OWNER_DECISIONS_REQUIRED

| ID | Question | Default if Owner silent |
|----|----------|-------------------------|
| OD-W2-01 | Confirm MediaRecorder **module** in W2 vs freeze table W3 | **In W2** (per this cold-start GO) |
| OD-W2-02 | Interim RECORD eligibility = PUBLISHED only for logged-in? | **YES** |
| OD-W2-03 | New permission `takes.create` vs reuse authenticated USER? | Prefer **no new permission** until W4/W5; AuthZ helper sufficient |
| OD-W2-04 | Duration probe failure on webm — fail-closed vs soft accept client duration? | **Fail-closed** (security) |

### REGRESSION_RISK

**LOW** if take transport is isolated modules/routes; **MEDIUM** if someone patches `audio-transport.ts` / beat session routes.

### SCOPE_DRIFT

**NONE** observed in repo today. Risk = pulling PlaybackShell Record or anon QT into W2 — resist.

---

## Final verdict

```text
RECORDING_WAVE2_READINESS_AUDIT

CURRENT_BASELINE = dd2ffd7b486829f6cbbb0cc549527a23c1621059

EXISTING_AUDIO_TRANSPORT = READY          (pattern; not drop-in)
MEDIARECORDER            = NOT_IMPLEMENTED
SESSION_MODEL            = READY          (use takes row; no new table)
UPLOAD_ARCHITECTURE      = GAP            (design ready; code missing)
SERVER_AUTHZ             = GAP            (contract clear; stub OK)
STORAGE                  = READY
SECURITY_PLAN            = READY
TEST_PLAN                = READY
REGRESSION_RISK          = LOW
SCOPE_DRIFT              = NONE

BLOCKERS                 = NONE
OWNER_DECISIONS_REQUIRED = OD-W2-01…04 (non-blocking defaults above)

READY_FOR_WAVE2_IMPLEMENTATION = YES

COMMIT = NONE
PUSH   = NONE
DEPLOY = NONE
```

**Safest minimal Wave 2:** isolated take signed-upload + finalize on `takes`/`take-audio` + MediaRecorder capture module + logged-in PUBLISHED stub AuthZ — **reuse beat transport patterns, never beat-audio bucket or beat session routes.**
