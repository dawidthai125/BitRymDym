# Studio Final Mix — SFM-2 Offline Render Core

**Status:** IMPLEMENTED (local core) — **NOT** production export
**Date:** 2026-10-09
**SFM-2.2:** MEMORY_CAP reachable via public budgets (independent of DURATION_CAP)
**SFM-3B/3C/3D:** Offline EQ + compressor + limiter + delay + reverb (deterministic IR)
**Engine id:** `studio-offline-pcm-v1` + `studio-offline-fx-v1`
**Code:** `studio-offline-render.ts`, `studio-offline-fx*.ts`, `studio-fx-impulse.ts`
**Tests:** `studio-offline-render.test.ts`, `studio-offline-fx.test.ts`
**Depends on:** SFM-1 / SFM-1.1 `interpretStudioSessionAtPlayhead`
**Freeze:** [STUDIO_FINAL_MIX_DESIGN_FREEZE.md](../decisions/STUDIO_FINAL_MIX_DESIGN_FREEZE.md)

```text
SFM-2 = Node-safe offline PCM bake of StudioEngineDocument
≠ STUDIO_EXPORT job
≠ Contabo worker
≠ TAKE_EXPORT / E3 MIX
≠ UI Export wiring
≠ bit-perfect live parity claim
```

---

## 1. What is implemented

| Capability | Status |
|------------|--------|
| Timeline placement / trim / `sourceOffsetMs` | YES |
| Overlap mix (sum) | YES |
| Clip gain + fade envelope (via `effectiveClipGain`) | YES |
| Track gain / pan / mute / solo (via interpretation) | YES |
| Master gain / pan | YES |
| Injectable PCM resolver (`TAKE` / `BEAT_REF`) | YES |
| Synthetic unit fixtures (no prod download) | YES |
| Typed errors | YES |
| Duration / memory caps | YES |
| Offline EQ (track + master) | YES (SFM-3B) |
| Offline compressor / limiter | YES (SFM-3C; sample-peak dynamics, NOT True Peak) |
| Offline delay / reverb | YES (SFM-3D; shared IR formula; partitioned convolve) |

**Entry:** `renderStudioDocumentOffline({ document, resolvePcm, maxDurationMs?, exportDurationMs?, maxOutputBytes?, maxTotalPcmBytes? })`
**Output:** interleaved stereo Float32 @ 44.1 kHz + `peakAbs` / `rms` metadata.
**Stage G:** `exportDurationMs` may extend past `timelineLengthMs` for OD-SFM-F04 FX post-roll (caller plans via `planStudioExportDuration`; no silent trim). Worker wiring in `render-worker-pipeline.ts` — **LOCAL INTEGRATION NOT RUN**.

Interpretation SSOT is **not** duplicated: membership uses `interpretStudioSessionAtPlayhead` each integer ms; continuous sample index advances within the ms; fade×gain uses `effectiveClipGain(clip, tMs)`.

---

## 2. Explicitly NOT supported (fail-closed)

| Item | Code / behavior |
|------|-----------------|
| `ARTIFACT` clips | `STUDIO_RENDER_ARTIFACT_UNSUPPORTED` |
| Unsupported FX schema | `STUDIO_RENDER_FX_UNSUPPORTED` |
| Missing PCM from resolver | `STUDIO_RENDER_SOURCE_MISSING` |
| Wrong sample rate / buffer | `STUDIO_RENDER_SOURCE_INVALID` |
| No audible voices | `STUDIO_RENDER_EMPTY_SESSION` |
| Timeline > 180_000 ms | `STUDIO_RENDER_DURATION_CAP` |
| Output / total PCM over public budget | `STUDIO_RENDER_MEMORY_CAP` |
| Storage fetch / AuthZ inside renderer | Forbidden — caller injects PCM |
| Job / worker / MP3 / upload / UI | Out of SFM-2 scope |

Empty / `null` FX chains are **allowed** (dry path). Enabled unsupported FX types are **not** silently dry-mixed.

### FX support matrix (SFM-3)

| Effect | Status | Notes |
|--------|--------|-------|
| `eq` | **IMPLEMENTED + TESTED** | lowshelf → peaking → highshelf; Web Audio cookbook; shelf Q ignored |
| `compressor` | **IMPLEMENTED + TESTED** | soft-knee (knee=6), linked peak, makeup; Node approx of DynamicsCompressor |
| `limiter` | **IMPLEMENTED + TESTED** | ratio=20, knee=0, attack=3ms, release=50ms + ceiling Gain; **NOT True Peak** |
| `delay` | **IMPLEMENTED + TESTED** | feedback delay ≤2s; wet/dry; no BPM sync |
| `reverb` | **IMPLEMENTED + TESTED** | shared `fillStudioSyntheticImpulse`; seeded offline RNG; UPC convolve; normalize≈equal-power |
| bypass / skip slots | passthrough | matches live dry/wire audible path |
| Live Web Audio parity | **NOT VERIFIED AGAINST LIVE** | live IR uses Math.random; offline seeded; Convolver ≠ bit-identical |

Signal order (matches live engine): clip sum → **track FX** → track gain/pan → Σ → **master FX** → master gain/pan.

---

## 3. DSP limitations (honest)

- No Web Audio `OfflineAudioContext` (Node Vitest).
- EQ uses RBJ / Web Audio coefficient recipes in Direct Form I (not browser nodes).
- Compressor/limiter: feed-forward soft-knee + envelope GR; live uses browser `DynamicsCompressorNode` (detector pre-filters / look-ahead differ).
- Limiter is **sample-peak** DynamicsCompressor-style + ceiling — not True Peak, not LUFS, not brickwall OS.
- Delay: circular feedback line matching live dry∥delay→wet topology; max 2s (`createDelay(2)`).
- Reverb: shared synthetic IR envelope; live `Math.random`, offline seeded; partitioned overlap-save (~512-sample wet latency); equal-power normalize approximation.
- FX insert state (delay buffers, IR FFTs) counted in `maxTotalPcmBytes` — not a hard process RSS cap.
- No E3 `server-basic-v1` as Studio substitute.
- Pan law: linear `g * min(1, 1±pan)` (same shape as `applyGainPan` in server-basic).
- Source shorter than clip → trailing silence (not an error).
- **No bit-perfect / full live↔render parity claim.**

---

## 4. Limits

| Limit | Value |
|-------|--------|
| Sample rate | 44100 (`AUDIO_CODEC.WAV_SAMPLE_RATE`) |
| Channels | 2 |
| Max timeline (DURATION_CAP) | 180_000 ms (`AUDIO_RENDER_MAX_SOURCE_DURATION_SECONDS`) |
| Default max output bytes | `STUDIO_OFFLINE_RENDER_MAX_OUTPUT_BYTES` ≈ 63.5 MiB (180s stereo f32) |
| Default max total PCM bytes | `STUDIO_OFFLINE_RENDER_MAX_TOTAL_PCM_BYTES` = 256 MiB (output + cached sources) |
| Public tighter budgets | `maxOutputBytes` / `maxTotalPcmBytes` options |

### 4.1 Validation order (before output allocation)

1. Document / ARTIFACT / FX dry-only checks
2. **DURATION_CAP** — `timelineLengthMs` / `maxDurationMs` vs 180s
3. Compute `frames` + `outputBytes` (safe-integer gated)
4. **MEMORY_CAP** — `outputBytes` vs `maxOutputBytes` and vs `maxTotalPcmBytes`
5. Empty-session probe (interpretation only; no PCM alloc)
6. Prefetch sources — **MEMORY_CAP** if `output + cached sources` exceeds `maxTotalPcmBytes`
7. Allocate interleaved output `Float32Array`

DURATION and MEMORY are independent codes: a timeline ≤180s can still fail MEMORY when budgets are tighter (or when many large sources exceed the 256 MiB total PCM plane). Default output budget equals the 180s PCM size so duration still gates oversize timelines first; MEMORY is reachable without private test hooks via the public options (and via total-PCM with large source caches).

### 4.2 Budget justification (SFM-2.1 bench)

- PCM plane for 180s stereo f32 ≈ 63.5 MiB per buffer.
- Bench (win32/node): 180s dry render ~2.3s wall, RSS ~260 MiB with sources + output.
- Total PCM budget 256 MiB covers output + ~2–3 full-length cached sources without claiming OS RSS headroom for non-PCM.

---

## 5. Tests (local Vitest)

Command:

```bash
npx vitest run src/lib/studio/studio-offline-render.test.ts src/lib/studio/studio-offline-fx.test.ts src/lib/studio/studio-session-interpretation.test.ts src/lib/studio/p6-7-1-clip-fade.test.ts src/lib/studio/p6-1-fx-chain.test.ts src/lib/studio/p6-2-track-fx-graph.test.ts
```

Covered: dry mix geometry, MEMORY/DURATION caps, SFM-3B EQ numerics + render integration, FX fail-closed for non-eq, existing P6 chain/graph tests.

---

## 6. Still requires separate Owner GO

- `STUDIO_EXPORT` job + AuthZ resolve + Storage
- Worker / Contabo / encode
- Studio Export UI (supersede OD-VS-03)
- Live Web Audio oracle / parity campaign
- Isolated-env smoke
- Commit / push / deploy
