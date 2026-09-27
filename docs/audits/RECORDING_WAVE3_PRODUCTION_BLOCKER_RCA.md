# Recording Wave 3 — Production Blocker RCA

**Date:** 2026-09-27  
**Baseline (blocker discovered):** `507f78fb03347683c847d5b0a0d76a3fffe1827d`  
**Hotfix commit:** `9f6f006c4dbb3354260ca2f5479c18952f8a713a`  
**Production deploy SHA:** `9f6f006c4dbb3354260ca2f5479c18952f8a713a`  
**Status:** **RECORDING_WAVE3 = CLOSED** · real Chromium WebM/Opus production E2E **PASS**

---

## 1. Symptom (production)

Authenticated Wave 3 flow on PUBLISHED beat:

1. Microphone arm + Start → PASS  
2. REC timer + controls lock → PASS  
3. Stop → upload to private `take-audio` → PASS (~355 KB `audio/webm`)  
4. Finalize → **FAIL** `DURATION_PROBE_FAILED`  
5. UI: `Duration could not be verified (fail-closed).`  
6. Take never reaches `READY` → take-only preview unreachable  

Fixture WAV live tests remained PASS.

---

## 2. Exact call path

```text
POST /api/takes/finalize
  → finalizeTakeRecordingFor (take-transport.ts)
    → download object from take-audio
    → validateTakeUploadMeta
    → probeAudioDurationFromBytes (audio-duration.ts)
         → music-metadata parseBuffer(..., { duration: true })
         → requires metadata.format.duration > 0
    → on !probe.ok: status=FAILED, failure_reason=DURATION_PROBE_FAILED
```

Canonical client capture (`TakeMediaRecorder.start`):

```ts
this.recorder.start(250); // 250ms timeslice
```

Timesliced Chromium MediaRecorder WebM typically **omits Segment Info.Duration**.

---

## 3. Root cause

### 3.1 Why WAV works

`music-metadata` reads duration from WAV/RIFF headers (`fmt` + `data` sizes / sample rate). Reliable.

### 3.2 Why Chromium WebM/Opus fails

1. **Container:** Chromium MediaRecorder emits EBML/WebM + Opus.  
2. **Missing metadata:** With timeslices (`start(250)`), Chrome does **not** write `Info/Duration` (known MediaRecorder/WebM behavior).  
3. **Parser limitation:** `music-metadata` Matroska parser (`MatroskaParser.js`) sets `format.duration` **only** from `Info.duration` (`0x4489`). Cluster elements (`0x1F43B675`) are **always ignored** (`ParseAction.IgnoreElement`) — no cluster-timecode duration path.  
4. Result: codec/container/sampleRate present, **`format.duration` undefined** → probe fail-closed.

Reproduced locally with a real Chromium capture fixture:

`src/lib/beats/fixtures/chromium-mediarecorder-opus.webm`

```text
music-metadata: codec=OPUS, container=EBML/webm, duration=undefined
```

### 3.3 Why fail-closed was correct

Accepting READY without server duration would:

- break `duration <= MIN(beat, 180)` enforcement  
- allow trusting client elapsed time  
- weaken finalize AuthZ contract  

Fail-closed was the right security posture.

---

## 4. Alternatives audited

| Option | Verdict |
|--------|---------|
| A. music-metadata alone | Insufficient — no Duration + ignores Clusters |
| B. Custom EBML Cluster Timecode scan | Viable, more custom parser surface |
| C. Existing `audio-decode` | **Chosen** — already in repo (BPM path); decodes Opus→PCM; `duration = samples/sampleRate` |
| D. New dependency / ffmpeg | Not needed |
| Client `fix-webm-duration` / client timer | **Rejected** — client duration trust |

---

## 5. Chosen fix (minimal)

**File:** `src/lib/beats/webm-duration-fallback.ts`  
**Wired in:** `probeAudioDurationFromBytes` (`audio-duration.ts`)

Contract unchanged:

1. Prefer `music-metadata` duration when present (WAV/MP3/etc.).  
2. If duration missing **and** bytes/MIME look like EBML/WebM (or related Opus/Ogg hint):  
   decode via `audio-decode` → `channelData[0].length / sampleRate`.  
3. Still enforce `> 0`, `BEAT_DURATION_MIN..BEAT_DURATION_MAX`.  
4. Take finalize still enforces `duration <= recording_max_seconds_snapshot + tolerance` where snapshot is `MIN(beat, 180)`.  
5. **Client duration never read.**

Not changed: RecordingPanel, state machine, PlaybackShell, AuthZ, storage, RLS, signed upload/preview, product scope.

---

## 6. Security implications

| Check | Result |
|-------|--------|
| Client duration trust | Still **FALSE** |
| Fail-closed on undecodable/malformed WebM | Preserved |
| Max duration gate | Still server-derived |
| Arbitrary READY without probe | Impossible |
| Accept any EBML/Opus without duration | No — must decode to PCM with positive length |

---

## 7. Tests

- `audio-duration.chromium-webm.test.ts` — repro + fallback PASS + malformed DENY  
- `wave2-live.test.ts` — `WEBM_OPUS_CHROMIUM` session→upload→finalize→READY  
- Existing WAV / duration mock / Wave 2–3 suites retained  

Fixture generator (dev only): `scripts/generate-chromium-webm-fixture.mjs`

---

## 8. Production verify (2026-09-27)

```text
HOTFIX_DEPLOYED_SHA = 9f6f006c4dbb3354260ca2f5479c18952f8a713a
CHROMIUM_MEDIARECORDER = audio/webm;codecs=opus · timeslice=250
DURATION_METADATA = music-metadata format.duration = null (as expected)
DURATION_FALLBACK = audio-decode samples/sampleRate → 27s = DB duration_seconds
FINALIZE / READY_TAKE / TAKE_PREVIEW (signed, private) = PASS
RECORDING_WAVE3 = CLOSED
```
