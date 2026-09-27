# RECORDING WAVE 3 — PLAYER INTEGRATION / RECORDING UX — COLD START / READINESS AUDIT

**Type:** Audit + plan only  
**Date:** 2026-09-27  
**Baseline:** `2ab3e3e22f8ef1ed727eeabfa59c830d32e9d418`  
**Wave 1:** CLOSED · **Wave 2:** CLOSED · PRODUCTION GREEN  

```text
IMPLEMENTATION = NONE
COMMIT / PUSH / DEPLOY = NONE
```

**SSOT / freeze:** [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md) · [RECORDING.md](../architecture/RECORDING.md) · [AUTHORIZATION.md](../architecture/AUTHORIZATION.md)  
**Prior closeouts:** [WAVE1](./RECORDING_WAVE1_IMPLEMENTATION_CLOSEOUT.md) · [WAVE2](./RECORDING_WAVE2_IMPLEMENTATION_CLOSEOUT.md)

---

## 0. Owner Wave 3 scope (this GO)

| Item | This GO |
|------|---------|
| **IN** | PlaybackShell integration · RECORD CTA · mic permission UX · reuse Wave 2 MediaRecorder/transport · finalize → READY · basic own-take preview |
| **OUT** | Anonymous QT · shared grants · Access Gate RECORD productization (full) · entitlement engine · janitor · anti-abuse enforcement · own take download · MIX/EXPORT · finished-track publish |

Interim AuthZ remains Wave 2 contract: **authenticated + PUBLISHED + `MIN(beat, 180)`**.

---

## 1. Current facts (code @ 2ab3e3e)

| Asset | Status |
|-------|--------|
| `PlaybackShell` | EXISTS — beat detail + moderation; PLAYBACK-only; local `useReducer(reducePlayback)` + hidden `<audio>` |
| `playback-state.ts` | Pure phase machine: idle/loading/ready/playing/paused/error — **no recording** |
| Sticky / global mobile player | **ABSENT** |
| Catalog | Links to beat detail; no player embed |
| Download | Sibling `DownloadButton` on beat detail (composition pattern) |
| Access Gate purposes | `PLAYBACK` \| `DOWNLOAD` only — **no `RECORD`** |
| Wave 2 transport | `/api/takes/session` · `/api/takes/finalize` · `TakeMediaRecorder` · `uploadTakeRecordingBlob` |
| Take signed **read** / preview API | **ABSENT** |
| Recording UI state machine | **ABSENT** (MediaRecorder errors only: UNSUPPORTED, PERMISSION_DENIED, …) |

---

## 2. Existing player architecture (answers A–E)

### A. Where RECORD belongs naturally

**Primary surface:** `src/app/beat/[id]/page.tsx` next to `PlaybackShell` + `DownloadButton` (PUBLISHED-only page already).

**Not:** catalog grid, homepage, sticky chrome (does not exist).

### B. Can PlaybackShell host an extra capability?

**Yes as composition / thin props — not by merging reducers.**

Freeze text (“extend PlaybackShell”) should mean: Record is reachable **from the beat player surface**, not that `reducePlayback` absorbs mic/upload.

Proven pattern: **DownloadButton is a sibling**, not inside `PlaybackShell`. Recommend the same for Record.

### C. Separate RecordingPanel?

**YES — recommend `RecordingPanel` (or `TakeRecordControls`) as sibling.**

Owns: mic UX, recording UI state, session→upload→finalize, preview mount.  
Coordinates with `PlaybackShell` via explicit callbacks (`onRecordingStart` / `onRecordingStop` / beat play sync) — **no shared global player store** (none exists today).

### D. Playback vs recording state collision risk

**HIGH if merged into one reducer.** Current playback machine is intentionally pure and unit-tested; Wave 2 MediaRecorder is separate.

**Mitigation:** two machines:

| Machine | Module | Engine |
|---------|--------|--------|
| Playback | `playback-state.ts` | `HTMLAudioElement` (beat) |
| Recording UI | **new** `recording-ui-state.ts` | `TakeMediaRecorder` + fetch transport |

Cross-rules (coordination layer only): e.g. while `RECORDING`/`UPLOADING`, disable seek; on unmount cancel recorder; on beat navigation cancel.

### E. Avoid duplicate audio/mic logic

| Reuse | Do not duplicate |
|-------|------------------|
| `TakeMediaRecorder` | New getUserMedia wrapper |
| `uploadTakeRecordingBlob` / `/api/takes/*` | New upload routes |
| `assertTakeRecordAccess` | New permission key / full Access Gate RECORD (defer W4/W5 unless Owner forces) |
| Beat PLAYBACK signed URL via existing Access Gate | Do not use beat DOWNLOAD for takes |
| Design system `Button` / layout tokens | New design system |

---

## 3. Proposed recording UI state machine

**Not implemented.** Wave 2 has only MediaRecorder error codes + transport success/fail.

```text
IDLE
  → REQUESTING_MIC
  → ARMED            (mic granted, not yet recording; optional)
  → RECORDING        (MediaRecorder active; beat play policy per OD-W3-01)
  → STOPPING
  → UPLOADING        (session → signed PUT)
  → FINALIZING       (= PROCESSING)
  → TAKE_READY       (preview available)

Errors (terminal or recoverable → IDLE):
  AUTH_REQUIRED | BEAT_NOT_ELIGIBLE | MIC_DENIED | UNSUPPORTED
  RECORDING_ERROR | UPLOAD_ERROR | FINALIZE_ERROR | EXPIRED
```

| Proposed UI | Wave 2 today |
|-------------|--------------|
| REQUESTING_MIC / MIC_DENIED / UNSUPPORTED / RECORDING_ERROR | `TakeRecorderError` codes |
| UPLOADING / FINALIZING / UPLOAD_ERROR / FINALIZE_ERROR | fetch errors only |
| TAKE_READY / preview | DB `READY` only — no client UI |
| AUTH_REQUIRED / BEAT_NOT_ELIGIBLE | server AuthZ; no CTA mapping |
| Client timer | `clientElapsedMs` — **not** SOT |

DB statuses remain Wave 1: `PENDING_UPLOAD` → `READY` / `FAILED` / `EXPIRED` / `DELETED`. **No DB `RECORDING` status.**

---

## 4. Playback ↔ recording interaction (plan)

| Concern | Recommendation (plan only) |
|---------|----------------------------|
| Beat during capture | **Owner decision OD-W3-01.** Freeze implies rap-over-beat; default proposal = start beat from `0` + MediaRecorder on user gesture; stop both on Stop. |
| Preview after READY | Freeze §17: **dual-play** beat PLAYBACK + take signed read — **GAP** (take read API missing). |
| Timer | UI countdown/elapsed from client clock + `maxRecordingSeconds` from session; server probe remains SOT. |
| SEEK during RECORDING | **Lock** seek (and prefer lock pause-only-beat without stop) until Stop. |
| Pause beat mid-record | Prefer **Stop recording** path; do not leave orphan PENDING_UPLOAD without UX. |
| Change beat / leave page | `cancel()` MediaRecorder; abandon PENDING; clear blob; optional soft FAILED later (janitor OUT). |
| Second Record while uploading | DENY until IDLE / TAKE_READY. |

---

## 5. RECORD button contract

| Actor / beat | UI |
|--------------|-----|
| Anonymous | CTA → `/sign-in` / `/sign-up` (mirror DownloadButton auth pattern) |
| Auth + PUBLISHED + READY master | Record enabled (interim W2 AuthZ) |
| DRAFT / APPROVED / REJECTED / ARCHIVED / PENDING_REVIEW | Unavailable (beat detail is PUBLISHED-only today — still guard in panel) |
| New `takes.create` permission | **Forbidden** (OD-W2-03) |

Server remains SOT; client CTA is UX only.

---

## 6. Mobile UX (plan)

- No sticky player today → Record lives in beat-detail column (`max-w-3xl`, same as shell).
- Touch: Button sizes from existing UI kit; timer + status text under controls.
- Mic denied / unsupported: inline `role="alert"` (same as playback errors).
- Upload/finalize: busy + disable double-submit.
- `pagehide` / `visibilitychange`: interrupt → cancel (freeze §15); no silent READY.
- Landscape: stack controls; avoid overlapping seek + Record.
- **No new design system.**

---

## 7. Take preview (GAP)

Freeze: beat PLAYBACK + mic take signed read → client dual-play; no mix file.

| Need | Status |
|------|--------|
| Owner-only take SELECT (RLS) | EXISTS (W1) |
| Private `take-audio` | EXISTS |
| Server-issued **signed GET** for own READY take | **MISSING** |
| Route/action e.g. `POST /api/takes/playback` | **MISSING** |
| Expiry / DELETED / foreign DENY | Must mirror finalize AuthZ |
| Download own take | **OUT W3** |

**Do not** overload beat `PLAYBACK`/`DOWNLOAD` Access Gate for take bytes.

Minimal W3 preview: second `<audio>` for take + existing beat audio; sync play/pause optional v1 (start both on Preview).

---

## 8. Security plan (reuse)

| Control | Source |
|---------|--------|
| Auth session/finalize | `requireUser` |
| PUBLISHED + max | `assertTakeRecordAccess` |
| Owner isolation / no client READY | W1 RLS + W2 transport |
| Object key binding | `buildUserTakeObjectKey` |
| Duration fail-closed | W2 finalize |
| Preview signed URL | **New** owner+READY+not-expired check only |
| Foreign take / expired | DENY |

No new permission keys. Full Access Gate `RECORD` purpose = later wave unless Owner expands W3.

Known medium (carry): `audio/ogg` picker vs allow-list — fail-closed at session; prefer webm/mp4 first (already ordered).

---

## 9. Scope control vs freeze

| Freeze / epic | This Wave 3 GO | Action |
|---------------|----------------|--------|
| W3 table: MediaRecorder + Anon + BEGINNER QT E2E | MediaRecorder already W2; **Anon OUT** | **DRIFT** — confirm OD-W3-02 Anon OUT of W3 |
| Access Gate RECORD capability | Interim AuthZ only | Defer product RECORD purpose |
| Shared grants RECORD | OUT | W5 |
| Entitlements / janitor / anti-abuse | OUT | W4 |
| Own take download | OUT | W4 (D08) |
| MIX/EXPORT | OUT | Future EPIC |

---

## 10. Test plan (not implemented)

**UNIT:** `recording-ui-state` transitions; Record CTA eligibility; coordination guards (seek lock).  
**INTEGRATION:** session→upload→finalize with mocked fetch; MediaRecorder deps (existing wave2-unit).  
**UI:** Record / Stop / errors / auth CTA; PlaybackShell regression (hard-outs test must be updated when Record lands — today asserts no MediaRecorder in shell).  
**RESPONSIVE:** beat detail narrow viewport smoke.  
**SECURITY:** A–M matrix reuse + take preview IDOR/expiry.  
**REGRESSION:** full suite; playback-state; community; downloads; auth.  
**E2E minimum:** auth + PUBLISHED → Record → mic → stop → upload → finalize → READY → preview.  
**Negative:** anon · non-PUBLISHED · foreign/expired take · mic deny · unsupported · upload/finalize fail.

---

## 11. Documentation drift

| Doc | Drift |
|-----|-------|
| `PROJECT_STATE.md` | Still says Wave 2 “not committed / not deployed” — **stale** vs GREEN @ `2ab3e3e` |
| `RECORDING.md` | Wave 2 “Owner Review” wording — stale |
| Freeze §19 W3 | Still lists MediaRecorder + Anonymous QT in W3 — MediaRecorder moved to W2 by OD-W2-01; Anon conflict with this GO |
| Wave 2 closeout commit markers | Historical pre-commit text |

**Do not edit during this audit** (per Owner). Fix continuity on Wave 3 impl GO / closeout.

---

## 12. Recommended implementation shape (for Owner GO)

```text
beat/[id]/page
  ├── PlaybackShell          (unchanged reducer; optional sync hooks)
  ├── DownloadButton         (existing)
  └── RecordingPanel         (NEW)
        ├── recording-ui-state (NEW pure)
        ├── TakeMediaRecorder (REUSE W2)
        ├── uploadTakeRecordingBlob (REUSE W2)
        └── TakePreviewAudio (NEW; needs signed take read API)
```

Optional thin `PlaybackShell` API: `playFromStart()`, `pause()`, `setSeekEnabled(false)` — **no** mic inside shell.

---

## 13. Readiness verdict

| Area | Verdict |
|------|---------|
| Player architecture | **READY** (composition clear) |
| Record UI architecture | **GAP** (panel + UI state missing — planned) |
| State machine | **GAP** (designed; not coded) |
| Playback↔record integration | **GAP** (needs OD-W3-01 + coordination) |
| Take preview | **GAP** (signed read missing) |
| Mobile UX | **READY** (no sticky conflict; plan reuse layout) |
| Security plan | **READY** (reuse W2 + preview AuthZ) |
| Test plan | **READY** |
| Documentation | **DRIFT** (continuity + freeze W3 row) |

**Regression risk:** **MEDIUM** — touching beat detail + possibly PlaybackShell hooks; playback hard-out tests will need conscious update; must not regress beat-audio Access Gate.

**READY_FOR_WAVE3_IMPLEMENTATION = YES** after Owner closes OD-W3-01…04 (or accepts defaults below).

### Proposed defaults if Owner wants fast GO

| ID | Default |
|----|---------|
| OD-W3-01 | Beat plays from 0 during capture; Stop stops both |
| OD-W3-02 | Anonymous OUT of W3 (auth-only; matches W2) |
| OD-W3-03 | Sibling `RecordingPanel` + minimal shell sync API (not merge reducers) |
| OD-W3-04 | Preview = dual-play when take signed read exists; take-only acceptable as interim if dual blocked |

---

```text
COMMIT = NONE
PUSH = NONE
DEPLOY = NONE
WAVE4+ = NOT STARTED
```
