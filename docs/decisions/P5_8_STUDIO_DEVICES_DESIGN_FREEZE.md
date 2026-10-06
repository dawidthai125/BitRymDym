# P5.8 Studio Devices / Input Foundation — Design Freeze

**Status:** DESIGN FREEZE — GO  
**Date:** 2026-10-06  
**Product name:** Studio Devices / Input & Device Foundation  
**Type:** DESIGN FREEZE ONLY — **NO IMPLEMENTATION IN THIS STEP**  
**Architecture audit:** [P5_7_STUDIO_ARCHITECTURE_AUDIT.md](../architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md)  
**Parent freezes:** [P5_STUDIO_DESIGN_FREEZE.md](./P5_STUDIO_DESIGN_FREEZE.md) · [P5_6_STUDIO_TAKE_WORKFLOW_DESIGN_FREEZE.md](./P5_6_STUDIO_TAKE_WORKFLOW_DESIGN_FREEZE.md)  
**Production baseline:** P5.6 PRODUCTION VERIFIED — GREEN @ `7f801430d6680c32e7af5a4e6f5b6818541014d8`  
**Repo tip (docs):** `67f4b4eb042e5c76edd407293db52f73a8583dfa`  
**Production URL:** https://www.bitrymdym.pl

```text
P5.8 DESIGN FREEZE STATUS: GO
IMPLEMENTATION: AUTHORIZED BY THIS FREEZE (Owner Implementation GO assumed for ship)
```

---

## Status

| Gate | State |
|------|--------|
| P5.6 | PRODUCTION VERIFIED — GREEN @ `7f80143` |
| D02 | CLOSED @ `44dc22c` (TEST ONLY) |
| P5.7 Architecture Audit | GO WITH CONDITIONS |
| Design Freeze | **THIS DOCUMENT — GO** |
| Owner Implementation GO | PENDING |
| Code / migration / deploy | **FORBIDDEN until Owner GO** |

**Unit numbering SSOT (living):**

```text
P5.7 = Studio Architecture Audit (complete)
P5.8 = Studio Devices / Input & Device Foundation (this freeze)
```

Do **not** call punch “P5.7”. Punch / metronome remain later P5 units.

---

## Baseline

| Item | Value |
|------|--------|
| Production app | `7f80143` — P5.6 Take Workflow |
| Repo HEAD at freeze authoring | `67f4b4e` — SSOT reconcile after P5.7 |
| `finalize ≠ place` | FROZEN (P5.6) — unchanged by P5.8 |
| Recording pipeline | eligibility → session → `TakeMediaRecorder` → finalize → READY → explicit place |
| Existing Studio device UX | Partial: `enumerateDevices` + select + `exact` deviceId in `studio-recording-panel.tsx` |
| Gaps vs this freeze | No `devicechange`, no local persistence, no separate Device State, hard `exact` fail, permission/device errors collapsed into recording UI messages |

**Evidence anchors:**

| Area | Path |
|------|------|
| Studio panel devices | `src/components/studio/studio-recording-panel.tsx` |
| Capture | `src/lib/takes/media-recorder.ts` (`TakeMediaRecorder`, `PERMISSION_DENIED`) |
| Recording UI FSM | `src/lib/takes/recording-ui-state.ts` (`REQUESTING_MIC`, `MIC_DENIED`, …) |
| Input meter | `src/hooks/use-mic-analyser.ts` + `src/components/brand/brd-input-monitor.tsx` |
| Beat QT panel (parallel) | `src/components/takes/recording-panel.tsx` (no device picker today) |
| Track stub field | `studio_tracks.input_device_hint` — **not** browser device preference SSOT |

---

## Problem

1. Studio already exposes a mic `<select>`, but device lifecycle is incomplete (no `devicechange`, no persistence, brittle `exact` constraints).  
2. Permission / “no mic” / “device gone” are largely folded into `reduceRecordingUi` string errors — hard to test and hard to UX consistently.  
3. Without a clear **Device/Input layer**, later punch / monitoring / latency / P6 graph work will keep growing `studio-recording-panel.tsx`.  
4. Privacy risk if anyone later stores browser `deviceId` / labels on Project or Profile without a freeze.

P5.8 freezes the **input/device foundation** so recording can stay REUSE-FIRST while becoming reliable across reload, permission, and hotplug.

---

## Goals

1. Stable **Device Discovery** + **Permission** + **Selection** contracts for Studio.  
2. Safe **local** persistence of preferred input (browser origin), with fallback when `deviceId` is stale.  
3. Correct **`devicechange`** behavior that does **not** casually abort an in-flight capture.  
4. Keep **one** recording engine (`TakeMediaRecorder`) and **one** analyser path (`useMicAnalyser` → `BrdInputMonitor`).  
5. Preserve `StudioTransport != PlayerProvider` and `finalize ≠ place`.  
6. Leave a clean seam for future latency compensation and P6 `StudioAudioEngine` — without implementing either.

---

## Non-Goals

Punch, pre-roll, count-in, metronome, BPM, FX, mix/master, autotune, latency compensation implementation, autosave, undo, collaborative locking, second recording engine, StudioAudioEngine, full Track capability system, backend device inventory.

---

## Architecture

```text
Studio UI (panel / picker / meter)
        ↓
Studio input/device layer   ← P5.8 owns this contract
        ↓
recording / monitoring
  · TakeMediaRecorder (capture)     REUSE
  · useMicAnalyser + BrdInputMonitor REUSE
        ↓
future StudioAudioEngine             P6 — NOT P5.8
```

**Hard boundaries:**

```text
StudioTransport != PlayerProvider
Device State    != Recording State (reduceRecordingUi)
device preference != project document_version
browser deviceId  != ownership / storage identity
```

**Layers:**

| Layer | Owns | Does not own |
|-------|------|----------------|
| Device/Input layer | enumerate, permission, selected device, persistence, devicechange, device error codes | Take lifecycle, place, eligibility AuthZ |
| `reduceRecordingUi` | Capture/upload/finalize UX phases | Device list / stored preference |
| `TakeMediaRecorder` | getUserMedia + MediaRecorder | Device picker UI |
| `useMicAnalyser` | Level from active stream | Stream ownership |
| `StudioTransport` | Playhead / beat / take preview | Mic devices |
| PlayerProvider | Catalog | Studio input |

**Decision:** Extract (or isolate) a small client module for device ops (e.g. `src/lib/studio/studio-input-devices.ts` + thin hook) during implementation — **REUSE** from Studio panel; beat QT may adopt later (SHOULD), not required for P5.8 GO.

---

## Device Discovery

### When to enumerate

| Moment | Action |
|--------|--------|
| Studio recording panel mount (idle) | Enumerate (labels may be empty pre-permission) |
| After successful mic permission / probe | Re-enumerate (labels usually appear) |
| `devicechange` event | Re-enumerate (see Device Change) |
| User opens/refocuses device picker | Optional refresh (SHOULD) |
| Before start with stored preference | Enumerate + validate selected id |

### What to show

- `MediaDeviceInfo` where `kind === "audioinput"` only.  
- **Do not** show `audiooutput` in P5.8 (output / `setSinkId` = COULD / later).  
- Map to UI option: `{ deviceId, label }`.  
- Empty `label` → Polish fallback `Mikrofon ${index+1}` (existing pattern).  
- Include browser default entry semantics: first enumerated device **or** empty selection meaning “system default” (`getUserMedia({ audio: true })`).

### Pre-permission vs post-permission

| Phase | Labels | deviceIds |
|-------|--------|-----------|
| Before permission | Often empty / generic | May be empty or opaque |
| After permission / probe | Usually real labels | Populated |

**Contract:** Discovery must not throw if labels are empty. UX copy must explain that granting mic access reveals device names (PL).

### No devices / unavailable API

| Condition | Device layer outcome |
|-----------|----------------------|
| `navigator.mediaDevices` missing | `UNAVAILABLE` + stable code `NO_INPUT_DEVICE` / unsupported path |
| Enumerate returns zero `audioinput` | `NO_INPUT_DEVICE` |
| Secure context missing | Treat as unavailable (HTTPS required) |

### deviceId stability

```text
deviceId is a browser technical handle — NOT a business key.
It may change across browsers, profiles, OS sessions, or after re-plug.
```

Never use `deviceId` as Project/Track/Take identity. Never send device lists to the backend (see Privacy).

---

## Permissions

### Permission state machine (Device layer — separate from Recording)

```text
UNKNOWN
REQUESTING
GRANTED
DENIED
BLOCKED
UNAVAILABLE
```

| State | Meaning |
|-------|---------|
| `UNKNOWN` | Not yet probed this session |
| `REQUESTING` | `getUserMedia` / Permissions API in flight |
| `GRANTED` | Mic access allowed (stream may be stopped after probe) |
| `DENIED` | User dismissed / denied |
| `BLOCKED` | Browser/OS policy blocks (SecurityError / persistent block UX) |
| `UNAVAILABLE` | No mediaDevices / no mic hardware |

**Mapping to existing recording UI (compatibility):**

| Device permission | May surface via `reduceRecordingUi` as |
|-------------------|----------------------------------------|
| `REQUESTING` | `REQUESTING_MIC` |
| `DENIED` / `BLOCKED` | `MIC_DENIED` |
| `UNAVAILABLE` / no device | `UNSUPPORTED` or typed device error → user message |
| `GRANTED` | enables transition to `READY` after probe |

**Rule:** Recording phases (`RECORDING`, `UPLOADING`, `READY_TAKE`, …) must **not** be overloaded to mean permission. Device layer owns permission; recording FSM owns capture/upload.

**Permissions API:** Optional enhancement (`navigator.permissions.query({ name: "microphone" })`) where supported — **SHOULD**, not MUST. Primary truth remains probe/`getUserMedia` result (Safari gaps).

---

## Device Selection

### State

```text
selectedInputDeviceId: string | null
  null / ""  → system default (constraints.audio = true)
  non-empty  → prefer that deviceId when still present
```

### Default selection

1. If stored preference exists and still in enumerated list → select it.  
2. Else if enumerated list non-empty → select first `audioinput` (current Studio behavior).  
3. Else → empty (system default) + `NO_INPUT_DEVICE` when user tries to arm.

### Changing device (idle / READY)

- User changes `<select>` → update `selectedInputDeviceId` + persist locally.  
- If mic already probed: stop probe tracks; next start uses new id.  
- Do **not** mutate Take / Clip / Project.

### Constraints strategy (critical)

Today Studio uses `{ deviceId: { exact: id } }` which fails hard if stale.

**Frozen P5.8 strategy:**

```text
1) Try preferred device with ideal/exact once
2) On OverconstrainedError / NotFoundError:
     clear invalid preference → fallback to default (audio: true)
     refresh list → surface DEVICE_NOT_FOUND (non-fatal)
3) Never leave user unable to record solely because stored id is stale
```

Implementation may use `ideal` then fallback, or `exact` with catch-and-fallback — either is fine if AC-07 holds.

### Reload

Restore from local persistence → validate against enumerate → fallback if missing (AC-06 / AC-07).

---

## Device Persistence

### Architect decision (CLOSED)

```text
Selected input device = local browser preference (per-origin)
NOT project document state
NOT profile SSOT
NOT cookie auth identity
NOT document_version
```

| Store | Decision |
|-------|----------|
| `localStorage` key (e.g. `bitrymdym.studio.selectedAudioInputDeviceId`) | **MUST** for Studio preferred id |
| Project / `input_device_hint` | **OUT** of P5.8 as persistence target for browser deviceId |
| Profile / Supabase | **FORBIDDEN** for deviceId / labels |
| `sessionStorage` | OUT (reload must restore — AC-06) |

**`studio_tracks.input_device_hint`:** remains an unused/future stub. P5.8 must **not** write browser `deviceId` there (unstable + privacy + wrong ownership plane).

**Invalidation:** If stored id not in current enumerate → clear storage entry → fallback default → soft warn.

---

## Device Change

Listen: `navigator.mediaDevices.addEventListener("devicechange", …)` while Studio recording panel mounted (and remove on unmount).

| Context | Behavior |
|---------|----------|
| **Idle / READY / READY_TAKE / error phases** | Re-enumerate. If selected id missing → fallback + `DEVICE_NOT_FOUND` soft state. Persist updated selection. |
| **REQUESTING_MIC / preparing** | Re-enumerate; re-validate selection before completing READY. |
| **RECORDING / STOPPING / UPLOADING / PROCESSING** | **Do not** stop MediaRecorder solely because the device list changed. Re-enumerate quietly for UI. If the **active track** ends (`ended` / error) → map to `DEVICE_DISCONNECTED` / `INPUT_STREAM_FAILED`, stop capture gracefully, finalize-or-fail using **existing** Take rules. |
| **After recording (READY_TAKE etc.)** | Refresh list; keep preference if still valid. |

**Invariant:** A Take that already reached **READY** must not be deleted or corrupted by a later `devicechange` (AC-09). Placement remains explicit (`finalize ≠ place`).

---

## Recording Boundary

```text
eligibility
→ session
→ TakeMediaRecorder
→ finalize
→ READY Take
→ explicit placement (Keep / library)
```

**P5.8 MUST:**

- Call eligibility **before** mic permission / capture (existing P4/P5.5 order).  
- Pass selected device only as `audioDeviceId` option into `TakeMediaRecorder.start`.  
- Keep `finalize ≠ place`.  
- Keep ownership / object keys server-side.  
- Keep StudioTransport isolation from PlayerProvider.

**P5.8 MUST NOT:**

- Create a second MediaRecorder stack.  
- Auto-place on finalize.  
- Change claim/eligibility AuthZ.  
- Move device preference into Project mutations.

---

## Input Monitoring

```text
device/input layer
      ↓  (active MediaStream from TakeMediaRecorder.getStream())
useMicAnalyser          ← REUSE — single analyser
      ↓
BrdInputMonitor         ← REUSE — UI meter
```

**Rules:**

- Analyser must not own/stop tracks (already true).  
- Do not connect analyser to `AudioContext.destination` by default (no speaker feedback loop).  
- Do not invent a second peak meter pipeline.  
- Software monitoring to headphones / latency UI = OUT of P5.8 (future).

---

## Error Model

Prefer stable codes (extend / align with `TakeRecorderErrorCode` where natural). UI maps codes → Polish copy via existing user-facing helpers — **not** raw `error.message` branching.

| Code | When |
|------|------|
| `DEVICE_PERMISSION_DENIED` | User denied (`NotAllowedError` / existing `PERMISSION_DENIED`) |
| `DEVICE_PERMISSION_BLOCKED` | Persistent block / SecurityError where distinguishable |
| `NO_INPUT_DEVICE` | Zero audioinputs / no mediaDevices |
| `DEVICE_NOT_FOUND` | Stored/selected id missing → fallback applied |
| `DEVICE_DISCONNECTED` | Active track ended mid-capture |
| `DEVICE_SELECTION_FAILED` | Constraint failure after fallback exhausted |
| `INPUT_STREAM_FAILED` | Other getUserMedia / track failures |
| Existing `UNSUPPORTED` | MediaRecorder / MIME unsupported (keep) |

Do not invent codes for FX/latency. Do not send codes that include device labels to the server.

---

## Security

| Rule | Status |
|------|--------|
| Device selection cannot set `ownerId` / `objectKey` / Take ownership | MUST |
| Place/Keep routes continue rejecting client storage identity | UNCHANGED |
| `projectId` / `trackId` / `takeId` always server-authorized | UNCHANGED |
| `deviceId` is untrusted browser tech data | MUST treat as such |
| No privilege escalation via `input_device_hint` writes | MUST NOT wire browser id into DB in P5.8 |

---

## Privacy

```text
device preference = local/browser state
```

**MUST NOT** send to Supabase/backend:

- full device lists,  
- device labels,  
- deviceIds,  

unless a future Owner-approved product need appears (none for P5.8).

Telemetry: if any client error logging exists, scrub labels/ids.

---

## Mobile

Target: **390×844** + iOS Safari + Android Chrome + desktop Chrome.

| Concern | Contract |
|---------|----------|
| Permission UX | Clear PL copy; system sheet is OS-owned |
| Empty labels pre-permission | Fallback names; explain grant-to-see-names |
| Single default mic | Hide complexity; picker may be short list |
| Hotplug | Rare on phone; still handle `devicechange` safely |
| Touch | Full-width select + meter; no horizontal overflow |
| Architecture | Same Studio shell — **no** separate mobile recording stack |

---

## Multi-tab

| Topic | Contract |
|-------|----------|
| Persistence | `localStorage` → **per-origin**, shared across tabs |
| Semantics | Last tab write wins for preference (acceptable) |
| Recording | Each tab has own MediaStream; no cross-tab lock |
| Project edits | Still last-write-wins (P5.7 M4) — **out of P5.8** |
| Sync | No BroadcastChannel / collaborative device sync |

---

## Future Latency

```text
Device/Input Layer
        ↓
Audio Engine (P6 StudioAudioEngine)
        ↓
Latency / timing layer (future unit)
```

P5.8 may leave a **documented extension point** (e.g. future `inputLatencyMs` preference local-only) but **MUST NOT** implement compensation, calibration UI, or clip offset mutation for latency.

---

## Future StudioAudioEngine

```text
P5.8 does NOT implement StudioAudioEngine.
```

P6 owns: multiple simultaneous sources, gain, routing, FX, buses, master, automation.

P5.8 must not bolt FX onto `HTMLAudioElement` / `StudioTransport`. Input monitoring may continue to use a short-lived `AudioContext` inside `useMicAnalyser` (already present) — that is **metering only**, not StudioAudioEngine.

---

## Track Capability Boundary

P5.7 H1: avoid new domain `if (track.type === …)` sprawl.

| P5.8 stance | Detail |
|-------------|--------|
| Full capability system | **OUT** (not required to ship device foundation) |
| Existing BEAT filter for recordable tracks | Allowed to remain temporarily |
| Documented future flags | `CAN_RECORD`, `CAN_MONITOR` — for later freeze before P7 expansion |
| Device layer | Capability-agnostic: supplies input to whoever is allowed to record |

---

## MUST

1. Device discovery for `audioinput` with empty-label fallback.  
2. Permission states distinct from recording phases.  
3. Selected device + system-default path.  
4. Local persistence (`localStorage`) with stale-id fallback (AC-06/07).  
5. `devicechange` handler with recording-safe semantics (AC-08/09).  
6. Soft-fail stale `exact`/`ideal` constraints → default mic.  
7. REUSE `TakeMediaRecorder`, `useMicAnalyser`, `BrdInputMonitor`.  
8. Preserve eligibility-before-mic, `finalize ≠ place`, StudioTransport isolation.  
9. Stable device/permission error codes → PL UX.  
10. No backend persistence of deviceId/labels.  
11. Mobile 390×844 without overflow.  
12. Unit/contract tests for pure device helpers + panel contracts (grep/AC style as P5.5/P5.6).

---

## SHOULD

1. Shared device helper usable later by beat QT panel (no forced QT redesign).  
2. `permissions.query` when available.  
3. Soft banner when falling back from missing stored device.  
4. Refresh list when picker focused.  
5. Distinguish DENIED vs BLOCKED in copy when detectable.

---

## COULD

1. Output device / `setSinkId` (Chromium).  
2. “Test mic” tone / countdown (not metronome product).  
3. Remember last device label fingerprint as soft hint (still local-only; optional — avoid if it adds complexity).

---

## OUT

```text
Punch-in / Punch-out / Pre-roll / Count-in
Metronome / BPM / Quantization
FX / EQ / Comp / Limiter / Reverb / Delay / Autotune / Pitch
Automation / Routing / Mix bus / Master bus
Samples / Scratch / Instruments / Time-stretch / Reverse / Loop engine
Undo/Redo / Project versioning / Autosave
Collaborative editing / multi-tab locks
StudioAudioEngine
Latency compensation implementation
Full Track capability system
Writing browser deviceId into Project / Profile / input_device_hint
Second recording engine / PlayerProvider mic path
```

---

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| **AC-01** | Enumerate loads `audioinput` list (empty labels OK with fallback names). |
| **AC-02** | Permission denied → stable `DEVICE_PERMISSION_DENIED` / `MIC_DENIED` UX (not a generic silent fail). |
| **AC-03** | No mic / no mediaDevices → `NO_INPUT_DEVICE` / unavailable UX. |
| **AC-04** | Default / first device path can reach READY and record. |
| **AC-05** | User can select a specific input and capture uses it when available. |
| **AC-06** | After reload, stored preference restored if still present. |
| **AC-07** | Stale stored `deviceId` → fallback to default; recording not blocked. |
| **AC-08** | `devicechange` refreshes list in idle/READY. |
| **AC-09** | Device list change during RECORDING does not destroy an already-READY Take; disconnect of active track fails capture safely without deleting prior READY Takes. |
| **AC-10** | Meter uses existing `useMicAnalyser` + `BrdInputMonitor` only. |
| **AC-11** | eligibility → session → `TakeMediaRecorder` → finalize pipeline unchanged in responsibility. |
| **AC-12** | `finalize ≠ place` remains true (no auto-place). |
| **AC-13** | No second recording engine. |
| **AC-14** | No backend persistence of private device IDs/labels. |
| **AC-15** | Studio recording controls usable at 390×844 without overflow. |
| **AC-16** | PlayerProvider remains independent (`StudioTransport != PlayerProvider`). |
| **AC-17** | No `StudioAudioEngine` module/product graph in P5.8. |
| **AC-18** | P3/P4/P5.6 regression suites remain green after implementation (Production Gate). |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Safari Permissions API gaps | Probe/`getUserMedia` as source of truth |
| `exact` overconstraint | Frozen fallback strategy |
| Parallel beat QT without picker | SHOULD share helper later; not a P5.8 blocker |
| Accidental DB write of deviceId via `input_device_hint` | Explicit OUT + review AC-14 |
| devicechange aborting capture | Frozen “don’t stop on list-only change” |
| Scope creep into metronome/punch | Hard OUT list |

---

## Open Decisions

**None blocking.**

All technical decisions above are **Architect-closed** from repo evidence + privacy/security:

| ID | Topic | Decision |
|----|-------|----------|
| OD-P58-01 | Persistence plane | `localStorage` per-origin |
| OD-P58-02 | Project/Profile device storage | Forbidden in P5.8 |
| OD-P58-03 | Constraint fallback | Required on stale id |
| OD-P58-04 | Capability system | Deferred; document flags only |
| OD-P58-05 | Beat QT device picker parity | SHOULD later, not MUST |

No `OWNER DECISION REQUIRED` for P5.8 freeze.

---

## Final Decision

```text
P5.8 DESIGN FREEZE: GO
```

**Rationale:**

1. Existing Studio already has a partial device picker + `TakeMediaRecorder` deviceId option — freeze completes the contract without a new engine.  
2. Separation of Device State vs Recording State is achievable without schema migration.  
3. Local persistence + stale-id fallback closes real reliability gaps.  
4. Privacy/security boundaries are clear and aligned with P5.7 conditions.  
5. P6 StudioAudioEngine and latency remain correctly deferred.  
6. No CRITICAL repo blocker for this unit.

**Next (after Owner Implementation GO only):**

```text
IMPLEMENTATION → TESTS (AC-01…AC-18) → COMMIT (allowlist) → (optional Preview) → PRODUCTION GATE
```

No code, migration, or deploy is authorized by this freeze alone.

---

*End of P5.8 Studio Devices / Input Foundation Design Freeze.*
