# Scope B — BPM auto-detection (signal analysis)

**Status:** **PRODUCTION V1.1 MULTI-SIGNAL** (Platform Beat create) · **ACCURACY NOT CERTIFIED** · Phase 1.9 **NOT CLOSED**

## Decision

| Item | Choice |
|------|--------|
| Detector | `@audio/beat@2.1.3` — **A** `tempo()` + **B** `combTempo()` (same PCM) |
| Evidence | onset–grid alignment · IBI regularity · segment consistency (`bpm-evidence.ts`) |
| Resolver | ensemble candidates → **`resolveCanonicalBpm`** multi-signal gate → AUTO_SUGGEST \| MANUAL_REQUIRED |
| AUTO rule | multi-signal agreement **and** sufficient confidence margin — never sole `@audio/beat` confidence |
| Not used | ID3/`music-metadata` BPM tags; raw `beatTrack.confidence` as sole winner; filename BPM; always-min/always-max |
| Decode | `audio-decode` — WAV + MP3 (**single** PCM decode per probe) |
| Unsupported auto-BPM | FLAC / AAC / M4A → MANUAL_REQUIRED (upload still allowed) |
| ffmpeg / native | **NO** |
| DB | unchanged — only `beats.bpm`; **no** `bpm_source` / `bpm_confidence` columns |
| App + DB duration SSOT | `BEAT_DURATION_MAX = 210` (`validation.ts`) · `beats_duration_range_chk` 1–210 · takes remain `RECORDING_GLOBAL_MAX_SECONDS = 180` |

## Pipeline

```text
bytes → validate MIME/size → duration (music-metadata)
      → decode PCM once (WAV/MP3)
      → tempo() + combTempo() → candidate generation
      → half/double normalize + cross-support (ensemble helpers)
      → gather evidence (onset alignment, IBI regularity, segments)
      → resolveCanonicalBpm (composite + margin + ≥2 dimensions)
      → AUTO_SUGGEST | MANUAL_REQUIRED
      → UI suggestion / manual entry
      → create: server re-probe + resolveCreateBpm
      → beats.bpm
```

## Composite scoring (explicit weights)

| Signal | Weight | Notes |
|--------|--------|-------|
| Estimator support | 0.30 | tempo + combTempo candidate confidences (normalized) |
| Onset–grid alignment | 0.30 | independent of denser-grid trackConf |
| IBI regularity | 0.20 | `1 − CV` of beat intervals from `beatTrack({bpm})` |
| Segment consistency | 0.20 | mean alignment + stability + win-rate across PCM windows |

**Not weighted:** raw `beatTrack.confidence` (known denser-grid bias).

## AUTO gate

AUTO_SUGGEST only when **all** hold:

1. Winner composite ≥ `BPM_AUTO_MIN_COMPOSITE` (0.32)
2. Margin (top − runner-up) ≥ `BPM_AUTO_MARGIN_MIN` (0.08)
   — or ≥ `BPM_HARD_CONFLICT_MARGIN_MIN` (0.15) when estimator tops hard-disagree
3. Winner leads on ≥ `BPM_AUTO_MIN_DIMENSIONS` (2) independent dimensions
   — or ≥ `BPM_HARD_CONFLICT_MIN_DIMENSIONS` (3) under hard estimator conflict
4. Near-tempo clustering (`BPM_NEAR_TEMPO_TOL = 1`) then half/double collapse before compare
5. Segment signal does not clearly contradict the winner

**Hard estimator conflict:** `|aTop − bTop| > BPM_HARD_ESTIMATOR_DELTA` (10) and not half/double / near.
Then AUTO requires the strengthened margin + dimension gate (`ESTIMATOR_HARD_CONFLICT` if not met).

**Near-tempo clustering:** `|Δbpm| ≤ 1` (e.g. 91/92, 115/116) merges to one cluster before the margin gate — representative by estimatorSupport → onset → lower BPM; fields use `max()` (no sum boost).

Otherwise: **MANUAL_REQUIRED** (correct fail-safe — not a bug).

## Confidence

- Estimator / evidence scores are **internal** — not UX truth, not DB columns.
- **Do not** use “higher `@audio/beat` confidence wins.”
- **ACCURACY NOT CERTIFIED.**

## Status (accuracy)

```text
PRODUCTION V1.1 MULTI-SIGNAL IMPLEMENTED (Platform Beat create)
ACCURACY NOT CERTIFIED
```

## Half / double

- Half/double pairs are **normalized** before multi-signal compare (same pulse family).
- Resolution uses estimator + evidence scoring — **never** blind always-lower / always-higher / denser-grid preference.
- Legacy `rankBpmCandidates` remains research/benchmark tooling only.

## Create policy (server)

**Uncertainty envelope (V1.2):** finalize **re-probes** audio, rebuilds `BpmUncertaintyEnvelope`, then requires `clientBpm ∈ allowlist`.  
`bpmManualOverride` **never** grants free 1–300 entry. See `docs/architecture/BPM_UNCERTAINTY_UX_DESIGN.md`.

| Client | Server envelope | Result |
|--------|-----------------|--------|
| selection AUTO + client === detectedBpm | HIGH / AUTO_SUGGEST | accept · `AUTO_DETECTED` |
| selection CANDIDATE + client ∈ allowlist | MANUAL or HIGH secondary | accept · `USER_SELECTED_CANDIDATE` |
| selection RANGE + client ∈ range | narrow contiguous range only | accept · `USER_SELECTED_WITHIN_SYSTEM_RANGE` |
| any + client ∉ allowlist (incl. override) | any | **reject** |
| any | UNAVAILABLE / empty allowlist | **reject** (no free entry) |
| BPM 0 / 999 / non-int | any | **reject** |

## Synthetic fixture generator (tooling only)

| | |
|--|--|
| Generator | `scripts/generate-bpm-fixtures.ts` + `scripts/bpm/synthetic-*.ts` |
| NPM | `npm run generate:bpm-fixtures` |
| SSOT BPM list | `scripts/bpm/synthetic-bpm-matrix.ts` |
| Output | `../bitrymdym-fixtures/bpm-<BPM>-steady.wav` (**outside Git**) |
| Signal | mono 44.1 kHz · 30 s · steady kick-click transient (not pure sine) |
| Runtime | **not** imported by app / production bundle |

## BPM BENCHMARK HARNESS

**Status:** `PREPARED` · first **synthetic** run complete · real-music accuracy still pending

| | |
|--|--|
| Code | `src/lib/beats/bpm-benchmark/` |
| CLI | `npm run benchmark:bpm` → `scripts/run-bpm-benchmark.ts` |
| Fixtures dir | `../bitrymdym-fixtures/` (outside Git) |
| Detector changes | **none** |
| Threshold changes | **none** (0.45 stays provisional) |

### Fixture convention (auto-discover by filename)

| Pattern | Layer | Genre |
|---------|-------|-------|
| `bpm-<BPM>-steady.wav\|mp3` | SYNTHETIC (A) | synthetic |
| `rap-boombap-<BPM>[-sourceTag].wav\|mp3` | RAP_BOOMBAP (B) | boombap |
| `rap-trap-<BPM>[-sourceTag].wav\|mp3` | RAP_TRAP (C) | trap |
| `rap-drill-<BPM>[-sourceTag].wav\|mp3` | RAP_DRILL (C) | drill |

Optional `-sourceTag` (e.g. `-fs680221`) allows multiple fixtures at the same BPM. Expected BPM is always the first number after the layer.

Expected BPM is parsed from the filename. Non-matching files (e.g. `phase19-master-tone.wav`) are ignored.

### Metrics (per fixture)

file, layer, genre, format, expected, rawDetected (top `@audio/beat` candidate), normalizedDetected (after half/double rank), abs/rel error, confidence, candidates, decode_ms, detection_ms, total_ms, classification.

### Classification

| Label | Rule |
|-------|------|
| EXACT | `detected === expected` only |
| WITHIN_1 | abs error = 1 |
| WITHIN_2 | abs error = 2 |
| HALF | octave pair and `detected < expected` (e.g. 70 vs 140) |
| DOUBLE | octave pair and `detected > expected` |
| MISS | otherwise |

### Confidence analysis capability

- Buckets vs provisional 0.45: correct/incorrect × ≥/< threshold
- Optional sweep 0.40 / 0.45 / 0.50 / 0.55 / 0.60 (**report only**)

### Summaries

Per layer + per genre: counts, exact / ±1 / ±2 rates, half/double count, miss count, avg/max abs error, avg confidence.

## BENCHMARK STATUS

```text
HARNESS = PREPARED
SYNTHETIC ACCURACY RUN = COMPLETE (first run)
REAL RAP / TRAP / DRILL RUN = COMPLETE (first run, Freesound CC0 HQ MP3)
ORIGINAL WAV REAL FIXTURES = PENDING (requires Freesound login for originals)
FINAL CONFIDENCE THRESHOLD = PENDING (0.45 remains provisional)
TECHNICAL PIPELINE VERIFIED = YES
PRODUCTION CERTIFIED = NO
```

## SYNTHETIC BENCHMARK — FIRST RUN

**Scope:** synthetic kick-click WAVs only. **Not** production-certified.  
**Not** a substitute for rights-cleared real rap / MP3 fixtures.

| Item | Value |
|------|--------|
| Date | 2026-09-26 |
| Fixtures | 38 × `bpm-*-steady.wav` in `../bitrymdym-fixtures/` |
| Format | WAV PCM16 mono · 44100 Hz · 30 s · steady tempo |
| Pipeline | same as product (`audio-decode` → `@audio/beat` → `rankBpmCandidates`) |
| Detector / threshold / DB | **unchanged** |

### Headline rates (normalized BPM vs expected)

| Metric | Result |
|--------|--------|
| EXACT | 22 / 38 = **57.9%** |
| ±1 (EXACT+WITHIN_1) | 32 / 38 = **84.2%** |
| ±2 (EXACT+WITHIN_1+WITHIN_2) | 36 / 38 = **94.7%** |
| HALF | 1 (170 → 85) |
| DOUBLE | 0 |
| MISS | 1 (180 → 91; half-ish + hip-hop rank bias — raw candidates include ~182) |

### Confidence @ provisional 0.45 (synthetic)

| Bucket | Count |
|--------|-------|
| correct ≥ 0.45 | 36 |
| correct < 0.45 | 0 |
| incorrect ≥ 0.45 | 2 |
| incorrect < 0.45 | 0 |

Offline sweep 0.40–0.60: identical TP=36 / FP=2 (all confidences ≈ 1.0 on this material).

### Performance (synthetic, this machine)

| | ms |
|--|-----|
| avg decode | ~8.9 |
| avg detection | ~70.2 |
| avg total | ~79.2 |
| max total | ~122 |

Performance is **not** evidence of accuracy.

## REAL-MUSIC BENCHMARK — FIRST RUN

**Scope:** Freesound **CC0 / Public Domain** hip-hop / trap / UK drill loops.  
**Format:** official Freesound **HQ MP3 previews** (not BitRymDym re-encodes; original WAV download requires account login).  
**Manifest:** `../bitrymdym-fixtures/REAL_FIXTURE_MANIFEST.md` (outside Git).  
**Not** production-certified.

| Item | Value |
|------|--------|
| Date | 2026-09-26 |
| Real fixtures | **17** (9 boom-bap, 6 trap, 2 drill) |
| Detector / threshold / DB | **unchanged** |

### Headline rates (real only, normalized)

| Metric | Result |
|--------|--------|
| EXACT | 4 / 17 = **23.5%** |
| ±1 | 7 / 17 = **41.2%** |
| ±2 | 8 / 17 = **47.1%** |
| HALF | 1 (142 → 71; **142@0.95 still in candidates**) |
| DOUBLE | 0 |
| MISS | 8 |

### Key finding (Owner review) — superseded by RCA section below

On several misses, a near-correct BPM appears in the **post-rank** candidate list, but the top pick is wrong with confidence ≈ 1.0. RCA clarifies: for half/double, “near-correct” is often **our** octave expansion of a wrong raw top; for ×4/3 and ×3/4 errors, expected can be present in **raw** `@audio/beat` candidates at rank 2 with conf ≈ 0.84–0.99 and still lose.

**FINDING:** high detector confidence on incorrect BPM is common (`incorrect ≥ 0.45` = **9**). Do **not** treat 0.45 as a filter that removes false auto-BPM on real material.

### Rap-zone slices

| Zone | n | Exact | ±1 | ±2 | HALF | MISS |
|------|---|-------|----|----|------|------|
| 87–105 | 8 | 0% | 37.5% | 37.5% | 0 | 5 |
| 130–150 | 9 | 44.4% | 44.4% | 55.6% | 1 | 3 |

## BPM DETECTOR RCA — REAL MUSIC

**Date:** 2026-09-26 · **Mode:** READ-ONLY (no detector / rank / threshold / DB changes)  
**Tooling:** `scripts/rca-bpm-analyze.ts` (outside product runtime)  
**Status:** TECHNICALLY IMPLEMENTED · **ACCURACY NOT CERTIFIED**

### Confidence semantics (`@audio/beat-tempo` 1.0.3)

From `node_modules/@audio/beat-tempo/index.js`:

1. Build spectral-flux ODF.
2. Autocorrelate ODF over lags in `[minBpm, maxBpm]` → `raw = sum/r0`.
3. Multiply by log-Gaussian weight centered at **120 BPM** (`prefSigma = 0.8`).
4. Divide all scores by `maxConf` → top becomes **1.0**.
5. Sort; suppress near-duplicates and **half/double** (±5%) from the returned candidate list.
6. Optional octave correction if winner >130 BPM and half-lag is much weaker.

**Why 90 BPM material can yield `120@1.00`:** periodicity near 120 is boosted by the perceptual prior; if the ACF peak at 120 outranks 90 after weighting, confidence of 120 is normalized to 1.0 by construction. This is **relative peak strength**, not accuracy.

### RAW vs NORMALIZED (BitRymDym rank)

On all **17/17** real fixtures: `rawTop === rankedTop`.  
`rankBpmCandidates` did **not** flip any top pick. Half/double expansion puts octave mates at `conf * 0.95`, which cannot beat a raw top at `1.0` (+0.02 hip-hop bias is insufficient).

### Candidate coverage (expected within ±1 of a **raw** `@audio/beat` candidate; `candidates: 8` for analysis)

| Metric | Count | % of 17 |
|--------|-------|---------|
| A. as top | 7 | 41.2% |
| B. in top 3 | 11 | 64.7% |
| C. in top 5 | 11 | 64.7% |
| D. absent from raw candidates | 6 | 35.3% |

**Interpretation:** mixed **CASE A + CASE B**. Ranking-inside-detector matters when expected sits at rank 2 with high conf; detector/prior also fails to emit expected at all in ~⅓ of files. BitRymDym post-rank is not the primary flipper on this set.

### Harmonic analysis of raw top vs expected

| Relation | Count | Examples |
|----------|-------|----------|
| exact | 4 | drill/trap 140 |
| neighbor (±1–2) | 4 | 100→99, 90→91, 150→148 |
| half | 1 | 142→71 |
| double | 0 | — |
| ×4/3 | 3 | 90→120 (josefpres ×2 + phantastonia) |
| ×3/4 | 2 | 140→112/113 |
| ×2/3 | 1 | 140→94 (melody) |
| unrelated | 2 | 87→172, 88→170 |

**90→120 and 140→112 are not half/double.** They are metrical / subdivision relations that our current ranker does **not** model.

### Failure classes (mutually informative tags; n=17)

| Class | Count | % | Notes |
|-------|-------|---|-------|
| A half | 1 | 5.9% | 142→71; expected **absent** from raw (octave suppressed by detector) |
| B double | 0 | 0% | — |
| C harmonic (non-octave) | 6 | 35.3% | ×4/3, ×3/4, ×2/3 |
| D neighbor | 4 | 23.5% | often “correct enough” for ±1/±2 product metric |
| E unrelated | 2 | 11.8% | 87/88 short/lofi drums → ~170 |
| F expected present but ranked below (raw) | 4 | 23.5% | e.g. 120 vs 91@0.97; 112 vs 140@0.99; 94 vs 140@0.84 |
| G expected absent from raw | 6 | 35.3% | includes octave-suppressed half + true misses |

### Segment stability (tooling-only experiment)

Long enough fixtures (≥32 s): `rap-boombap-90-fs680221` / `fs682512`.

| File | Expected | Full-track | 5×8s / 4×10s |
|------|----------|------------|--------------|
| fs680221 | 90 | 120 | **all segments 120@1.0 — stable wrong** |
| fs682512 | 90 | 120 | **all segments 120@1.0 — stable wrong** |

→ **CASE D** (stable wrong), not unstable segment noise. Segment voting alone would not fix these two.

### Preprocessing audit (no changes)

| Step | Behavior | Risk |
|------|----------|------|
| Decode | `audio-decode` WAV/MP3 | OK for this set |
| Channels | mean mix to mono | OK; stereo phase issues unlikely primary |
| Sample rate | native (44.1k / 48k) passed to `tempo` | OK |
| Gain / normalize | **none** | ACF is energy-normalized; clipping rare on Freesound |
| Trim intro/outro | **none** — full file | OK for short loops; not cause of 90→120 |
| Length | full track ≤180s policy | Short drums (5–7s) → poorer lag stats (87/drill) |

### Alternative detector audit (architecture only — not installed)

| Approach | Relevance |
|----------|-----------|
| Current: spectral-flux ODF + ACF + 120 prior | Explains 90→120 bias and max-normalized false confidence |
| `combTempo` (same family) | Cross-check; still ODF-based |
| Multi-estimator vote (ACF + comb + DP `beatTrack`) | May reduce single-prior failures |
| Explicit non-octave harmonics (×2/3, ×3/4, ×4/3) in ranker | Targets observed trap/boom-bap errors — **design decision, not yet approved** |
| Segment aggregation | Helps unstable tracks; **does not** help stable-wrong 90→120 |
| External libraries | Not evaluated in depth this pass; do not add without Owner GO |

### RCA decision tree (this corpus)

| Case | Verdict |
|------|---------|
| A — expected often in candidates | **PARTIAL YES** (64.7% in top3; 4 clear rank-2 losses) — problem inside detector peak selection / prior, not BitRymDym flip |
| B — expected often absent | **YES** (35.3%) — detector + octave suppression + prior |
| C — segments unstable | **NO** on measured long fixtures |
| D — segments stable wrong | **YES** (90 BPM josefpres → 120 everywhere) |

### Recommended next architecture step (Owner Review — do not implement yet)

1. **Do not certify** auto-BPM; keep manual override path primary for create.
2. Treat `confidence` as **relative ACF score**, not accuracy — UI copy / threshold policy must reflect that.
3. Prefer investigation order: (a) detector prior / multi-estimator, (b) whether to model ×2/3·×3/4·×4/3 in ranking, (c) only then threshold tuning.
4. Re-run RCA after any change on the same 17 real + 38 synthetic fixtures.

### Pending (explicit)

- Real rap music benchmark Owner Review = **REQUIRED**
- Original WAV real fixtures = **PENDING** (login)
- Additional priority BPMs (91–105 dense, 130–148) = **PENDING** if more CC0 sources appear
- Final confidence threshold = **PENDING** (keep 0.45 provisional)
- Any ranking / detector change = **PENDING Owner GO**

## BPM DETECTOR EXPERIMENT V2 — COMBTEMPO

**Date:** 2026-09-26 · **Mode:** EXPERIMENT ONLY (no production wiring)  
**Command:** `npm run experiment:bpm-v2`  
**Code:** `src/lib/beats/bpm-experiment-v2/` + `scripts/run-bpm-experiment-v2.ts`  
**Status:** TECHNICALLY IMPLEMENTED · **ACCURACY NOT CERTIFIED** · **NO ENSEMBLE IMPLEMENTED**

### API audit (`combTempo`)

Source: `node_modules/@audio/beat-tempo/comb.js` via `@audio/beat@2.1.3`.

| | |
|--|--|
| Signature | `combTempo(data, opts?) → { bpm, confidence, candidates? }` |
| Input | `Float32Array \| Float64Array` mono |
| Options | `fs`, `frameSize`, `hopSize`, `minBpm`, `maxBpm`, `candidates`, optional `ODF` |
| BPM / confidence / candidates | **yes / yes / yes** (candidates when `candidates > 1`) |
| New dependency | **none** |
| Vercel | yes (pure JS) |

**Independence vs `tempo()`:** **not a wrapper**. Separate Scheirer comb-filter scorer on the **same** `spectralFlux` ODF; both apply log-Gaussian ~120 prior (`prefSigma` 0.8 vs 1.4) + max-norm + octave suppress. → **partially independent**.

Harness: identical decoded mono PCM + `sampleRate` for A and B; raw tops only (no production `rankBpmCandidates`).

**Rejected:** `bpm-detective` / Web Audio detectors (browser `AudioBuffer`).

### Estimator selection

| | A (baseline) | B (experiment) |
|--|--------------|----------------|
| API | `@audio/beat` `tempo()` | `@audio/beat` `combTempo()` |
| Package | `@audio/beat@2.1.3` / `@audio/beat-tempo` | same umbrella (`beat-tempo/comb`) |
| Method | ACF of spectral-flux ODF | Comb-filter resonance on ODF (+ harmonics 1–4) |
| Prior | log-Gaussian ~120 BPM (`σ=0.8`) | log-Gaussian ~120 BPM (`σ=1.4`, **shared center**) |
| Confidence | max-normalized | max-normalized (**shared pattern**) |
| License | MIT | MIT |
| Input | Float32Array mono + fs | Float32Array mono + fs |
| Node / Vercel | yes (no native/ffmpeg) | yes |
| New dependency | — | **none** |
| Independence | — | **Partial** — different peak scorer, same ODF + 120 prior family |

Experiment compares **raw tops only** (no production `rankBpmCandidates`) so A/B differences isolate estimators.

### Results — aggregate

| Metric | ESTIMATOR A | ESTIMATOR B |
|--------|-------------|-------------|
| **REAL exact** | 4/17 = 23.5% | **8/17 = 47.1%** |
| **REAL ±1** | 7/17 = 41.2% | **10/17 = 58.8%** |
| **REAL ±2** | 8/17 = 47.1% | **10/17 = 58.8%** |
| **REAL half/double** | 1 | **6** (more octave errors) |
| **REAL harmonic (×4/3·×3/4·×2/3)** | 6 | **1** |
| **REAL miss** | 2 | **0** |
| **SYNTH exact** | 22/38 = 57.9% | **29/38 = 76.3%** |
| **SYNTH ±1** | 32/38 = 84.2% | 29/38 = 76.3% |
| **SYNTH ±2** | **36/38 = 94.7%** | 29/38 = 76.3% |
| **SYNTH half/double** | 1 | **9** (HALF on high BPMs) |
| **SYNTH harmonic** | 0 | 0 |
| **SYNTH miss** | 1 | 0 |

### Candidate coverage (when candidates exist)

| | A REAL | B REAL |
|--|--------|--------|
| expected as top-1 (±1) | 41.2% | 58.8% |
| expected in top-3 | 64.7% | 58.8% |
| expected in top-5 | 64.7% | 58.8% |

### Rap-zone slices (REAL)

| Zone | A ±2 | B ±2 | Notes |
|------|------|------|-------|
| 87–105 | 37.5% | 50.0% | B fixes josefpres 90→120; also emits DOUBLE (90→180, 100→200, 87→175) |
| 130–150 | 55.6% | 66.7% | B does not fix 142→71; 140→112 becomes 70 HALF |

### Error correlation (REAL, ±2 = correct)

| Outcome | Count | % of 17 |
|---------|-------|---------|
| A correct & B correct | 6 | 35.3% |
| A wrong & B correct | **4** | 23.5% |
| A correct & B wrong | **2** | 11.8% |
| A wrong & B wrong | **5** | 29.4% |

**Independence:** partial. B recovers 4 A failures but also breaks 2 A successes; 5 fixtures wrong in both (often different wrong BPM).

### Critical case checks

| Case | A | B | Fixed? |
|------|---|---|--------|
| 90→120 (fs680221 / fs682512) | 120 | **90 EXACT** | **YES** |
| 90→120 (fs336135) | 120 | 180 DOUBLE | NO (different wrong) |
| 140→112 (fs456135 FULL_BEAT) | 112 | 70 HALF | NO |
| 142→71 (fs838789) | 71 | 71 HALF | NO (same) |
| A expected outside top-5 recovered by B | e.g. 88→170 → **88 EXACT** | partial |

### Segment stability

| Fixture | A segments | B segments |
|---------|------------|------------|
| 90 fs680221 (4×10s) | **stable wrong 120** | **stable correct 90** |
| 140 fs456135 (4×7.7s) | **unstable** 140/140/140/94 — full-track A=112 | near-140 per segment — full-track B=70 |
| 142 fs838789 (4×3.3s, short) | unstable ~71/72/115 | unstable ~71/69/179/109 — full both 71 |

Finding: for fs456135, **segments are often near-correct while full-track top is wrong** — supports future segment voting research, separate from choosing B alone.

### Performance (this machine)

| | A REAL | B REAL | A SYNTH | B SYNTH |
|--|--------|--------|---------|---------|
| avg detection ms | 50 | 64 | 66 | 85 |
| p95 detection ms | 123 | 152 | 72 | 95 |
| max detection ms | 123 | 152 | 85 | 101 |

B is ~20–30% slower; still sub-second per fixture. Combined A+B ≈ decode + A + B (experiment ran both sequentially on same PCM).

### Decision matrix

**Category: B** — B improves a meaningful subset of real failures (notably stable 90→120) at acceptable CPU cost, but:

- is **not** a drop-in replacement (regresses some A wins; more half/double),
- shares ODF + 120-prior family → limited independence,
- synthetic ±2 **worsens** (HALF bias on high BPM),
- therefore a future **ensemble / selection policy** would be required — **not implemented this pass**.

Not A (not clearly better overall without caveats). Not C (material recoverable cases exist). Not D (Vercel-compatible, no new deps).

### Recommended next step (Owner Review — still no production change)

1. Keep production on Estimator A; keep ACCURACY NOT CERTIFIED.
2. If pursuing multi-estimator: design an **experiment-only** fusion (agreement / segment vote / half-double resolve) on the same corpus before any create-flow wiring.
3. Optional follow-up probe: ACF **without** 120 prior (custom tooling) to isolate prior vs comb scoring.
4. Do **not** raise confidence threshold or certify based on B alone.

## BPM ENSEMBLE EXPERIMENT V3

**Date:** 2026-09-26 · **Mode:** RESEARCH / EXPERIMENT ONLY  
**Command:** `npm run experiment:bpm-v3`  
**Code:** `src/lib/beats/bpm-experiment-v3/` (reuses V2 estimators; one PCM decode per fixture)  
**Status:** TECHNICALLY IMPLEMENTED · **ACCURACY NOT CERTIFIED** · **NO PRODUCTION ENSEMBLE**

### Architecture

```text
fixture → decode once → mono PCM
       → A = tempo() | B = combTempo()   (same PCM)
       → pair analysis (agreement / candidates / harmonic / confidence)
       → experimental strategies → AUTO_ACCEPT | MANUAL_REQUIRED
```

Baselines `A_ONLY` / `B_ONLY` **must** reproduce V2 REAL exact/±2 counts (gate in runner). This run: **baseline OK**.

### Strategies (all GENERAL RULE — no fixture IDs)

| ID | Rule |
|----|------|
| A_ONLY / B_ONLY | Always accept A or B |
| C_AGREEMENT_EXACT | Accept only if A==B |
| C_AGREEMENT_NEAR | Accept if \|A−B\|≤2 (mean) |
| G1 | Exact agreement else MANUAL |
| G2 | Agreement, else one-way candidate cross-support; mutual≠ → MANUAL |
| G3 | Agreement, else harmonic pair → prefer 70–160 / nearer 100 |
| G4 | Near-agree mean, else harmonic pick, else one-way cross-support, else MANUAL |

Confidence recorded (Strategy F) but **never** used as “higher wins” (RCA).

### REAL metrics (n=17) — precision of AUTO_ACCEPT vs coverage

| Strategy | AUTO | MANUAL | Coverage | Abstain | **Precision AUTO** | Exact | ±2 |
|----------|------|--------|----------|---------|--------------------|-------|-----|
| A_ONLY | 17 | 0 | 100% | 0% | 47.1% | 4 | 8 |
| B_ONLY | 17 | 0 | 100% | 0% | 58.8% | 8 | 10 |
| C_EXACT / G1 | 3 | 14 | 17.6% | 82.4% | 66.7% | 2 | 2 |
| **C_NEAR** | **7** | **10** | **41.2%** | **58.8%** | **85.7%** | 3 | 6 |
| G2 | 6 | 11 | 35.3% | 64.7% | 50.0% | 3 | 3 |
| G3 | 11 | 6 | 64.7% | 35.3% | 63.6% | 5 | 7 |
| G4 | 16 | 1 | 94.1% | 5.9% | 68.8% | 6 | 11 |

### SYNTHETIC metrics (n=38) — overfitting check

| Strategy | Coverage | Precision AUTO | ±2 among AUTO |
|----------|----------|----------------|---------------|
| A_ONLY | 100% | **94.7%** | 36 |
| B_ONLY | 100% | 76.3% | 29 |
| C_EXACT / G1 / G2 | 55.3% | **95.2%** | 20 |
| **C_NEAR** | **81.6%** | **93.6%** | 29 |
| G3 | 73.7% | 78.6% | 22 |
| G4 | 100% | 81.6% | 31 |

C_NEAR stays high-precision on synthetic → **not** a REAL-only overfit. G3/G4 harmonic band rule is GENERAL (8 harmonic autos on REAL; mix of correct/incorrect — fails on some ×2/3 pairs).

### Agreement / support landscape (REAL)

- AGREEMENT 3 · NEAR_AGREEMENT 4 · CONFLICT 10  
- MUTUAL candidate support 8 · NO_SUPPORT 6 · A_TOP_IN_B 1 · B_TOP_IN_A 2  
- **Warning:** exact agreement can still be wrong (both A&B = 71 on expected 142).

### Focus cases (REAL)

| Expected path | A | B | Relation | Support | C_NEAR | G3 | G4 |
|---------------|---|---|----------|---------|--------|----|-----|
| 90→120 (fs680221) | 120 | 90 | x3_4 | MUTUAL | MANUAL | AUTO 90 ✓ | AUTO 90 ✓ |
| 90→120 (fs682512) | 120 | 90 | x3_4 | MUTUAL | MANUAL | AUTO 90 ✓ | AUTO 90 ✓ |
| 90→180 (fs336135) | 120 | 180 | x3_2 | A_TOP_IN_B | MANUAL | AUTO 120 ✗ | AUTO 120 ✗ |
| 140→112 (fs456135) | 112 | 70 | x2_3 | NONE | MANUAL | AUTO 112 ✗ | AUTO 112 ✗ |
| 140→94 (fs852267) | 94 | 140 | x3_2 | B_TOP_IN_A | MANUAL | AUTO 94 ✗ | AUTO 94 ✗ |
| 142→71 | 71 | 71 | equal | MUTUAL | AUTO 71 ✗ | AUTO 71 ✗ | AUTO 71 ✗ |
| 87→172 | 172 | 175 | unrelated | NONE | MANUAL | MANUAL | MANUAL |
| 88→170 | 170 | 88 | x0_5 | NONE | MANUAL | AUTO 88 ✓ | AUTO 88 ✓ |
| 100→99 (fs336134) | 99 | 100 | near_1 | MUTUAL | AUTO 100 ✓ | MANUAL | AUTO 100 ✓ |

### Best experimental architecture (not production)

**Prefer C_AGREEMENT_NEAR** for auto-suggest: highest REAL auto precision (85.7%) with usable coverage (41%), and strong synthetic precision (93.6% @ 82% coverage).

G4 maximizes coverage but precision drops (68.8% REAL) — still better than A_ONLY auto precision, worse than C_NEAR.

Do **not** ship G3/G4 as sole auto path without more corpus — harmonic band heuristic still mis-picks some pairs.

### Limitations

- Small REAL n=17; precision CIs wide.
- Agreement≠truth.
- No segment voting in V3 strategies (V2 showed segment/full-track divergence).
- No production wiring.

## BPM GOLDEN VALIDATION V4

**Date:** 2026-09-26 · **Mode:** VALIDATION ONLY  
**Command:** `npm run experiment:bpm-v4`  
**Code:** `src/lib/beats/bpm-experiment-v4/` (reuses V2 estimators + V3 `C_NEAR`)  
**Status:** TECHNICALLY IMPLEMENTED · **ACCURACY NOT CERTIFIED** · **NO PRODUCTION WIRING**

### Corpus

| Set | N | Notes |
|-----|---|-------|
| AVAILABLE GOLDEN FIXTURES (real) | **31** | 17 original + 14 V4 CC0 expansion |
| SYNTHETIC | 38 | unchanged |
| Target ≥30 real | **met** | still thin on 135/138/148/155/170/180 |

**Ground-truth provenance:** Freesound CC0 / Public Domain HQ MP3 previews; BPM from source title / page / `REAL_FIXTURE_MANIFEST.md` — **never** from detectors A or B.

### Baseline consistency (original 17)

A exact 4 / ±2 8 · B exact 8 / ±2 10 · C_NEAR auto 7 precision 0.8571 — **matches V2/V3**.

### Agreement-but-wrong

Exact `A==B` on expanded REAL: **5** agreements, **1 wrong**:

| File | Expected | A=B | Kind | Expected in candidates | Segments |
|------|----------|-----|------|------------------------|----------|
| `rap-boombap-142-fs838789.mp3` | 142 | 71 | HALF / OCTAVE x2 | **absent** (only “harmonic_of_top” vs 71) | A/B **UNSTABLE** (4×~3.3s) |

Critical: **142 never appears in A or B candidate lists**. Agreement ≠ truth. Segment voting is **not** a fix here (UNSTABLE, not STABLE_WRONG).

Other C_NEAR wrong autos (near-agree, not exact agreement): 80→161 (DOUBLE), 166→84 (half-ish MISS).

### Octave ambiguity

For exact agreements: 4× `x1` correct · 1× `x2` wrong (142/71).  
RULE B does **not** auto-pick ×2; it abstains when:

1. half/double appears in candidates, **or**
2. low-side trap: agreed ≤100 and 2× ≤200, **or**
3. high-side trap: agreed ≥140 and ÷2 ≥60  

(GENERAL RULE — no fixture IDs.)

### C_NEAR safety (REAL n=31)

| Metric | original17 | realAll (31) | synthetic |
|--------|------------|--------------|-----------|
| Precision AUTO | 85.7% | **76.9%** | 93.6% |
| Coverage | 41.2% | 41.9% | 81.6% |
| Abstain | 58.8% | 58.1% | 18.4% |
| **False-auto rate** | **14.3%** | **23.1%** | 6.5% |

Expanding the golden set **lowered** C_NEAR precision (more octave traps) — validation working as intended.

### General rule trade-off (REAL n=31)

| Strategy | Precision | Coverage | Abstain | False Auto |
|----------|-----------|----------|---------|------------|
| C_NEAR | 76.9% | 41.9% | 58.1% | 23.1% |
| RULE A (mutual candidates) | 75.0% | 38.7% | 61.3% | 25.0% |
| **RULE B (octave abstain)** | **100%** | **12.9%** | **87.1%** | **0%** |
| RULE C (short &lt;12s) | 80.0% | 32.3% | 67.7% | 20.0% |
| RULE D (near without mutual) | 75.0% | 38.7% | 61.3% | 25.0% |
| B+D / B+C | 100% | 12.9% | 87.1% | 0% |

SYNTHETIC: RULE B also **100%** precision @ 23.7% coverage (false-auto 0) — not a REAL-only overfit, but **coverage collapses**.

### Certification question

**B — AUTO-SUGGEST PROMISING BUT MORE GOLDEN DATA REQUIRED**

Not A: false-auto of raw C_NEAR is 23% on 31 golden; priority BPM gaps remain.  
Not C: RULE B shows a path to zero false-auto with heavy abstain; architecture still investigable — do not ship.

### Limitations

- Priority BPMs missing: 135, 138, 148, 155, 170, 180.
- RULE B precision=1 on n_auto=4 only — CI meaningless.
- No production C_NEAR / RULE B wiring.

## BPM GOLDEN CORPUS EXPANSION V5

**Date:** 2026-09-26 · **Mode:** EVIDENCE / VALIDATION ONLY  
**Command:** `npm run experiment:bpm-v5`  
**Code:** `src/lib/beats/bpm-experiment-v5/` (reuses V2 estimators + V4 `C_NEAR` / `RULE_B` **unchanged**)  
**Status:** TECHNICALLY IMPLEMENTED · **ACCURACY NOT CERTIFIED** · **NO ALGORITHM CHANGE** · **NO PRODUCTION WIRING**

### Corpus

| | N |
|--|--|
| Previous REAL (V4) | 31 |
| **New REAL** | **56** |
| Added V5 | 25 |
| SYNTHETIC | 38 (unchanged) |
| Target ≥50 | **met** |

**Licensing:** CC0 / Public Domain Freesound HQ MP3 previews only.  
**Ground truth:** source title/page/manifest — **never** tempo() / combTempo() / C_NEAR / RULE B.  
Audio remains **outside Git**.

### Priority BPM gaps (V4 → V5)

| BPM | Status |
|-----|--------|
| 135 | PRESENT (`fs416061`) |
| 138 | PRESENT (`fs573964`) |
| 148 | PRESENT (`fs848121`, industrial drums) |
| 155 | PRESENT (`fs852263`) |
| 170 | PRESENT (`fs510002`, **SPARSE** hi-hat) |
| 180 | PRESENT (`fs829052`) |

**Remaining priority gaps:** none (exact BPM). Diversity still thin for some materials (e.g. full hip-hop at 148/180 vs industrial).

### Material diversity (REAL n=56)

FULL_BEAT 2 · DRUM_LOOP 34 · MUSIC_LOOP 14 · MELODY_LOOP 4 · SPARSE 1 · DENSE 1 · UNKNOWN 0

### Baseline (original 17)

Unchanged vs V2/V4: A 4/8 · B 8/10 · C_NEAR auto 7 / precision 0.8571 — **OK**.

### Estimators on full REAL (n=56)

| | Exact | ±2 | Half/Dbl | Harmonic | Miss |
|--|-------|-----|----------|----------|------|
| A `tempo()` | 13 (23.2%) | 31 (55.4%) | 5 | 17 | 3 |
| B `combTempo()` | 37 (66.1%) | 39 (69.6%) | 10 | 5 | 2 |

### C_NEAR (strategies unchanged)

| | Precision | Coverage | Abstain | False-auto |
|--|-----------|----------|---------|------------|
| REAL n=56 | **89.3%** | **50.0%** | 50.0% | **10.7%** (3/28) |
| SYNTHETIC | 93.6% | 81.6% | 18.4% | 6.5% |
| *(V4 REAL n=31)* | *76.9%* | *41.9%* | *58.1%* | *23.1%* |

Larger / more diverse golden set **improved** observed C_NEAR precision vs V4 — still not certified.

### RULE B (unchanged)

| | Precision | Coverage | Abstain | False-auto |
|--|-----------|----------|---------|------------|
| REAL n=56 | 1.0 (12/12 autos) | **21.4%** | 78.6% | **0** |
| SYNTHETIC | 1.0 | 23.7% | 76.3% | **0** |

**RULE B SAFETY PROPERTY:** held (0 false-auto in studied corpus).  
Wording: **not** “100% accurate” — “0 false-auto in studied corpus (n=56); confidence limited by corpus size/diversity.”

### False-auto inventory (C_NEAR) — 3 cases, **no new class from V5 adds**

| Fixture | Exp | Pred | Class | Material |
|---------|-----|------|-------|----------|
| fs838789 | 142 | 71 | OCTAVE | MUSIC_LOOP |
| fs640253 | 166 | 84 | UNRELATED* | MUSIC_LOOP |
| fs621185 | 80 | 161 | OCTAVE | DRUM_LOOP |

\*octaveRel still x2 (near-half); classifier bucket UNRELATED at ±1 on half.

2/3 wrong autos are MUSIC_LOOP (descriptive share 66.7% of false-autos; **not** causal proof).

### Band snapshot (C_NEAR)

| Band | n | Precision | Coverage | False-auto |
|------|---|-----------|----------|------------|
| 70–90 | 13 | 75% | 31% | 25% |
| 91–110 | 7 | 100% | 57% | 0 |
| 111–130 | 10 | 100% | 80% | 0 |
| 131–150 | 16 | 89% | 56% | 11% |
| 151–170 | 6 | 67% | 50% | 33% |
| 171–180 | 4 | — | 0% | — |

### Certification

**ACCURACY NOT CERTIFIED** · evidence supports continued **B** (promising, more data / review before any production suggest).

## BPM PRODUCTION DESIGN FREEZE

**Status:** **IMPLEMENTED (Production V1)** · **ACCURACY NOT CERTIFIED**  
**SSOT doc:** [`docs/phases/PHASE_BPM_DESIGN_FREEZE.md`](../phases/PHASE_BPM_DESIGN_FREEZE.md)  
**Date:** 2026-09-27

### Intent

Production wiring for Platform Beat audio-first create: ensemble suggest with safety abstain. **No** new DB columns. **No** accuracy certification.

### Frozen resolver (Design Freeze → implemented in V1)

```text
A = tempo() · B = combTempo() · same PCM
→ C_NEAR → RULE B (octave safety)
→ AUTO_SUGGEST | MANUAL_REQUIRED
→ user confirm/edit → server revalidation → beats.bpm
```

| Public decision | Meaning |
|-----------------|---------|
| AUTO_SUGGEST | Provisional BPM shown; user may edit |
| MANUAL_REQUIRED | User must enter BPM |

Internal reasons (not accuracy claims): `AGREEMENT` · `NEAR_AGREEMENT` · `CONFLICT` · `OCTAVE_AMBIGUITY` · `UNSUPPORTED_FORMAT` · …

### C_NEAR (frozen)

Exact A==B → suggest A; \|A−B\|≤2 → suggest round mean; else MANUAL. Candidates/harmonics unused.

### RULE B (frozen) = SAFETY GATE ≠ accuracy proof

After C_NEAR: if octave twin in candidates **or** low-side (≤100 & 2×≤200) **or** high-side (≥140 & ÷2≥60) → MANUAL. Never auto ×2. Rejects 142→71 even when 142 absent from candidates.

V5 studied corpus: **0 false-auto (n=56)** · coverage ~21%. Do not say “100% accurate.”

### SSOT

Source audio + server analysis authoritative · client BPM untrusted · `beats.bpm` final · range **1–300** · WAV/MP3 auto · FLAC/AAC/M4A manual · no `bpm_source` / `bpm_confidence` in first wiring.

### UX principles

Suggest: “Automatycznie wykryto” + change. Manual: “BPM nie udało się wiarygodnie określić.” Forbidden: AI certainty / 100% / confidence=1 claims.

## PRODUCTION IMPLEMENTATION V1

**Status:** **IMPLEMENTED** locally · **ACCURACY NOT CERTIFIED** · **NO DB MIGRATION**  
**Date:** 2026-09-27

### Final architecture

```text
upload bytes
  → validate MIME/size
  → duration (music-metadata) — client duration ignored
  → decode PCM (WAV/MP3)
  → A = tempo() + B = combTempo() (same PCM)
  → C_NEAR → RULE B
  → AUTO_SUGGEST | MANUAL_REQUIRED
  → admin UI confirm/edit
  → create: re-analyze + resolveCreateBpm
  → beats.bpm
```

| Module | Role |
|--------|------|
| `bpm-ensemble.ts` | Pure C_NEAR + RULE B + create policy helpers |
| `audio-bpm.ts` → `analyzeBeatBpm` | Server decode + A/B + ensemble |
| `audio-duration.ts` → `analyzeBeatAudioBytes` | Duration + BPM gate |
| `create-with-master.ts` | Admin analyze + create actions |
| `admin-create-beat-form.tsx` | UX (no confidence display) |

### Formats

WAV/MP3 → ensemble auto. FLAC/AAC/M4A → MANUAL_REQUIRED / unavailable message; upload still allowed with manual BPM.

### Override / revalidation

- Match AUTO_SUGGEST without override → accept suggest  
- Explicit override + range 1–300 → accept user BPM  
- MANUAL / unsupported → accept entered BPM  
- Mismatch without override → reject  

### ADMIN METADATA EDIT

- **CREATE** flow uses server re-probe + C_NEAR + RULE B.
- Existing **ADMIN metadata edit** (`updateBeatMetadata` / `admin-metadata-form`) may manually change `beats.bpm` in range **1–300**.
- That edit does **not** run automatic audio analysis / ensemble.
- It is an intentional administrative path (not a create-flow bypass for untrusted clients).
- Do **not** present a manual metadata change as a detector result.
- Accuracy certification does **not** follow from this mechanism.
- Behavior unchanged in V1; future audit may revisit whether edit should re-probe.

### Tests

- `bpm-ensemble.test.ts` — AGREEMENT / NEAR / CONFLICT; critical **142→71**, **80→161**, **166→84** → `OCTAVE_AMBIGUITY`; create policy override + invalid range.
- `bpm-audit-contracts.test.ts` — legacy `createPlatformBeatAction` hard-disabled; metadata edit contract (no ensemble import); NaN / Infinity / non-integer rejects.
- Smoke WAV decode path (`audio-bpm.test.ts`).

### Known limitations / remaining gaps

- Accuracy **not certified**; RULE B AUTO coverage remains low (~21% on golden).
- High-side RULE B abstains many ≥140 agreements (by design).
- No `bpm_source` / confidence columns; no telemetry in V1.
- FLAC/AAC/M4A remain **manual fallback** (no full format E2E harness).
- No full create E2E against production storage (would need auth/storage harness).
- ADMIN metadata edit without re-probe documented above — optional future policy audit.
- Experiments V2–V5 unchanged (research harness).

## Limitations

- Synthetic click fixtures are an unambiguous ground-truth smoke test — **not** production certification.
- Real Freesound set mixes FULL_BEAT / MUSIC_LOOP / DRUM_LOOP / MELODY_LOOP / SPARSE / DENSE / industrial — weight carefully in Owner review.
- Freesound HQ MP3 previews ≠ studio masters; still valid for production MP3 decode path.
- Pure tones / sparse material may yield high false confidence — treat UI “provisional”.
- Full ≤180 s analysis (no silent trim to 30 s).
- `@audio/beat` confidence is max-normalized ACF — **not** a calibrated error probability.
- Experiment V2 B (`combTempo`) shares ODF + ~120 prior with A — not a fully independent detector family.
- Experiment V3/V4/V5 strategies remain research harnesses; production uses `bpm-ensemble` + `analyzeBeatBpm`.
- **Production V1:** suggestion + safety abstain only — **ACCURACY NOT CERTIFIED**.
