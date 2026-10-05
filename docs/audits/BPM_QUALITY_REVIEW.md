# BPM Quality Review — Audit / RCA / Design Only

**Date:** 2026-10-05  
**Production SHA:** `91de4c7`  
**Scope:** AUDIT → RCA → ANALYSIS → PROPOSAL  
**Mutations:** **0** (no DB update, no BPM change, no import, no deploy, no commit)  
**Evidence:** `docs/audits/BPM_QUALITY_REVIEW_EVIDENCE.json`

**External reference role:** VocalRemover = **EXTERNAL REFERENCE ONLY** — not SSOT, not automatic ground truth.

---

## 1. Executive Summary

Production catalog has **17 PUBLISHED** real beats. Against VocalRemover reference:

| Class | Count |
|-------|------:|
| EXACT (`Δ=0`) | **5** |
| NEAR (`Δ≤1`) | **7** |
| MATERIAL (`Δ>1`) | **5** |

The canonical **AUTO gate is doing its job**: of 17 probes, only **4** were `AUTO_SUGGEST`; **13** were `MANUAL_REQUIRED`. The quality problem is **not** “AUTO falsely locked wrong BPM.”

The quality problem is:

1. **Estimator + multi-signal scoring** often ranks a denser/faster grid (138 / 125 / 120 / 161 / 116) above the ~88–95 family that matches external reference and often the other estimator.
2. **Import selection** (`scripts/real-beats-import.ts`) writes `envelope.detectedBpm` (= composite top) as `USER_SELECTED_CANDIDATE` whenever it is allowlisted — **even under CONFLICT/LOW**. Result: **17/17 production BPMs equal probe composite top**.
3. For the 5 MATERIAL cases, the pipeline **cannot prove** the production value is better than the reference-aligned allowlisted alternative. Writing the composite top under CONFLICT is a **false-confidence default**, not proven AUTO.

**Final decision: B — CURRENT BPM RESOLVER NEEDS IMPROVEMENT — DESIGN REQUIRED**

Not C (unsafe rollback): AUTO refusal on hard conflict is sound.  
Not A (no change): 5 MATERIAL catalog BPMs + CONFLICT-default-to-top is a product/quality debt.

---

## 2. Production safety (read-only, post-audit)

| Metric | Value |
|--------|------:|
| beats | 17 |
| PUBLISHED | 17 |
| assets | 17 |
| beat-audio | 17 |
| orphans | 0 |
| take-audio unmapped | 1 |

**Unchanged. MUTATIONS = 0.**

---

## 3. 17-file comparison table

Production BPM confirmed from DB. Reference from Owner VocalRemover CSV (`key_bpm.vocalremover.owner.csv`). Probe from `_probe_bpm_all.json`. Import from `REAL_BEATS_IMPORT_READY_EVIDENCE.json`.

| # | File | Prod | Ref | Δ | Class | Probe status / reason | Import source | Allowlist contains ref±1? |
|--:|------|-----:|----:|--:|-------|------------------------|---------------|---------------------------|
| 1 | Bit By DTT.mp3 | **138** | 91 | 47 | **MATERIAL** | MANUAL / ESTIMATOR_HARD_CONFLICT | USER_SELECTED | 92 yes / 91 no |
| 2 | Bit By DTTremix.mp3 | 92 | 91 | 1 | NEAR | MANUAL / HARD_CONFLICT | USER_SELECTED | yes |
| 3 | Bit komitywa2 by DTT (1).mp3 | 89 | 89 | 0 | EXACT | MANUAL / HARD_CONFLICT | USER_SELECTED | yes |
| 4 | Bit komitywa2 by DTT.mp3 | **125** | 88 | 37 | **MATERIAL** | MANUAL / INSUFFICIENT_MARGIN | USER_SELECTED | 88 yes |
| 5 | Bit new komitywa 2 by DTremix.mp3 | **120** | 89 | 31 | **MATERIAL** | MANUAL / HARD_CONFLICT | USER_SELECTED | 89 yes |
| 6 | Bit new komitywa 2 by DTT.mp3 | 89 | 89 | 0 | EXACT | MANUAL / INSUFFICIENT_MARGIN | USER_SELECTED | yes |
| 7 | Bit new komitywa 2 byBRD.mp3 | 88 | 88 | 0 | EXACT | **AUTO** / MULTI_SIGNAL_AGREED | AUTO_DETECTED | yes |
| 8 | Bit new komitywa 2 byBRDremix.mp3 | 88 | 88 | 0 | EXACT | **AUTO** / MULTI_SIGNAL_AGREED | AUTO_DETECTED | yes |
| 9 | Bitrymdym1.mp3 | **161** | 93 | 68 | **MATERIAL** | MANUAL / HARD_CONFLICT | USER_SELECTED | 92 yes / 93 no |
| 10 | bitrymdym1remix.mp3 | 92 | 91 | 1 | NEAR | MANUAL | USER_SELECTED | yes |
| 11 | Cinny StreetBRD.mp3 | 92 | 91 | 1 | NEAR | AUTO | AUTO_DETECTED | yes |
| 12 | Cinny StreetBRDremix.mp3 | 92 | 91 | 1 | NEAR | MANUAL | USER_SELECTED | yes |
| 13 | Gryź się z mnąBTS1.mp3 | 95 | 95 | 0 | EXACT | AUTO | AUTO_DETECTED | yes |
| 14 | Gryź się z mnąBTSremix.mp3 | **116** | 95 | 21 | **MATERIAL** | MANUAL / HARD_CONFLICT | USER_SELECTED | 95 yes |
| 15 | Nikt nie zatrzyma nasBRS.mp3 | 92 | 91 | 1 | NEAR | MANUAL | USER_SELECTED | yes |
| 16 | Nikt nie zatrzyma nasBRSremix.mp3 | 92 | 91 | 1 | NEAR | MANUAL | USER_SELECTED | yes |
| 17 | Sucha KlawiszBTS.mp3 | 92 | 91 | 1 | NEAR | MANUAL | USER_SELECTED | yes |

### Octave / half-double possibility (D)

| File | Flag | Note |
|------|------|------|
| Bit By DTT | **YES** | 138 ≈ 1.5×92; runner 92 ≈ ref 91 |
| Bitrymdym1 | **YES (soft)** | Runner 92 ≈ ref 93; 161 not clean 2×93 |
| Other MATERIAL | NO | Not clean 2× / ½ relative to ref |

---

## 4. Exact / Near / Material

- **EXACT (5):** komitywa2 (1), new komitywa DTT, byBRD, byBRDremix, Gryź BTS1  
- **NEAR (7):** DTTremix, bitrymdym1remix, both Cinny, both Nikt, Sucha Klawisz — all prod 92 vs ref 91 (pipeline rounds to 92; external reports 91)  
- **MATERIAL (5):** Bit By DTT, komitywa2 by DTT, new komitywa DTremix, Bitrymdym1, Gryź BTSremix  

NEAR band is healthy: Δ=1 is within `BPM_NEAR_TEMPO_TOL=1` and hip-hop feel is the same.

---

## 5. Five far cases — deep dive

### 5.1 Bit By DTT — prod 138 vs ref 91

| Signal | 138 | 92 (≈91) |
|--------|----:|---------:|
| Estimator tops | B=138 | A=92 |
| Composite | **0.798** | 0.709 |
| Onset | **0.506** | 0.406 |
| IBI regularity | 0.983 | **0.995** |
| Segment | **0.750** | 0.440 |
| dimsLeading | **3** | 2 |
| Margin | 0.0895 | — |

- Hard conflict: **true** → canonical **MANUAL** (`ESTIMATOR_HARD_CONFLICT`) — margin 0.089 < hard gate **0.15**.  
- Allowlist: `[62, 92, 97, 138]` — **91 not present**; **92 is**.  
- Import wrote **138** as `USER_SELECTED_CANDIDATE`.  
- Extended beatTrack: 92 has lower IBI CV than 138; raw `trackConfidence` higher at 184/92 than at 138 — denser grids remain attractive.

**91 vs 138 proof test:** System **cannot** prove either. AUTO correctly refused. Defaulting to 138 under CONFLICT is **not** evidence that 138 is true.

**Primary RCA:** B (1.5× / double-time feel) + C (onset/segment denser-grid) + F (weights) + H (import after hard-conflict).

### 5.2 Bit komitywa2 by DTT — prod 125 vs ref 88

| Signal | 125 | 117 | 88 |
|--------|----:|----:|---:|
| Composite | **0.6963** | 0.6958 | 0.471 |
| Margin top−runner | **0.00046** | — | — |

- Not hard conflict (tops 117/125, Δ=8 < 10).  
- MANUAL via **INSUFFICIENT_MARGIN**.  
- **88 is on allowlist** and in A candidates (conf ~0.82) but ranks ~4th in composite.  
- Import wrote composite top **125**.

**88 vs 125 proof test:** System **cannot** prove 125; margin ≈ 0. Owner matrix marked OWNER_REVIEW / outside strong match.

**Primary RCA:** A + F + G + I.

### 5.3 Bit new komitywa 2 by DTremix — prod 120 vs ref 89

| Signal | 120 | 89 |
|--------|----:|---:|
| Estimator | A top | B top |
| Composite | **0.689** | 0.663 |
| Onset / segment | higher | lower |
| Margin | 0.026 | — |

- Hard conflict → MANUAL.  
- Owner matrix proposed **89** (EXACT → runner, STRONG_REFERENCE).  
- Import still wrote **120**.

**89 vs 120 proof test:** Inconclusive. Allowlist contains both; AUTO refused.

**Primary RCA:** A + C + H (selection).

### 5.4 Bitrymdym1 — prod 161 vs ref 93

| Signal | 161 | 92 (≈93) |
|--------|----:|---------:|
| Estimator | B top | A top |
| Composite | **0.776** | 0.676 |
| Onset / segment | higher | lower |
| Margin | 0.100 | — |

- Hard conflict → MANUAL (0.100 < 0.15).  
- Owner matrix proposed **92**. Import wrote **161**.

**93 vs 161 proof test:** Inconclusive. 92 allowlisted; 93 not exact integer in pool.

**Primary RCA:** A + B + C + H.

### 5.5 Gryź się z mnąBTSremix — prod 116 vs ref 95

| Signal | 116 | 95 |
|--------|----:|---:|
| Composite | **0.676** | 0.667 |
| EstimatorNorm | **1.0** | 0.664 |
| Onset | 0.323 | **0.435** |
| IBI | 0.982 | **0.993** |
| Segment | 0.414 | **0.696** |
| dimsLeading | **1** | **3** |
| Margin | 0.0088 | — |

Critical counter-example: **95 leads 3/4 dimensions** and extended IBI CV is better, yet composite still ranks **116** first because `estimatorNorm` is maxed for B-top.

**95 vs 116 proof test:** System **cannot** prove 116; internal evidence arguably favors 95 on independent dims. Import wrote 116.

**Primary RCA:** F (scoring) + A + H + I (dimsLeading not used as primary key).

---

## 6. Resolver RCA — production call path

```
analyzeBeatAudioBytes
  → probeAudioDurationFromBytes
  → analyzeBeatBpm
       → tempo() + combTempo()          [@audio/beat]  → estimator A/B
       → resolveEnsembleSuggestion      [suggestion only]
       → collectBpmCandidates → selectEvidenceBpms (≤6)
       → gatherBpmEvidence              [onsets, beatTrack→IBI, segments]
       → resolveCanonicalBpm            ★ AUTO gate
  → buildBpmUncertaintyEnvelopeFromProbe
  → finalize / import: resolveCreateBpm(allowlist)
```

Confirmed path matches Owner diagram (ensemble → evidence → canonical → uncertainty → allowlist → finalize re-probe). Experiment v2–v5 / `rankBpmCandidates` are **off** production path.

### Why production equals composite top even when MANUAL

1. Canonical sets `detectedBpm` to composite winner for UI even when `status=MANUAL_REQUIRED`.  
2. Import rule: if `detectedBpm ∈ allowlist` → select it as CANDIDATE (not only on HIGH).  
3. Therefore CONFLICT/LOW cases still persist the contested top into DB.

This is the main **process RCA** linking probe MANUAL → production MATERIAL.

---

## 7. Current scoring model

```
composite =
  0.3 * estimatorNorm +
  0.3 * onsetAlignment +
  0.2 * ibiRegularity +
  0.2 * segmentScore

segmentScore = 0.5*mean + 0.25*consistency + 0.25*winRate
```

Pre-score: near-tempo cluster (`tol=1`) → half/double collapse → score → sort composite DESC, bpm ASC.

AUTO needs: margin ≥ 0.08, dimsLeading ≥ 2, composite ≥ 0.32, no segment contradiction.  
Hard conflict: margin ≥ **0.15**, dims ≥ **3** (and still often MANUAL when tops disagree).

---

## 8. Current uncertainty model

| Class | Typical cause |
|-------|----------------|
| HIGH | `AUTO_SUGGEST` |
| CONFLICT | hard conflict / unresolved pair / octave ambiguity |
| LOW | insufficient margin / signal disagreement / segment contradiction |
| MEDIUM | other MANUAL |
| UNAVAILABLE | decode/analysis failure |

Allowlist = union of ranked candidates + hypothesis members + narrow near-tempo range (only contiguous Δ≤1 family).  
Create policy: client BPM must be in server-rebuilt allowlist; override cannot invent free BPM.

---

## 9. External reference comparison

- VocalRemover cluster for this corpus is tightly **88–95**.  
- Production AUTO cases that land in that band match EXACT/NEAR.  
- MATERIAL production values sit **outside** that band while still having an allowlisted near-ref candidate in 4/5 cases (88/89/92/95).  
- Owner approval matrix already flagged the same 5 files for review / runner preference — import did not follow those proposals.

**Do not treat reference as truth.** Treat it as: “another independent tool prefers the slower family; our allowlist already contains that family; we lack proof for the faster family.”

---

## 10. Evidence quality assessment

| Layer | Quality | Notes |
|-------|---------|-------|
| Dual estimators (`tempo`/`combTempo`) | Medium | Often disagree on hip-hop; useful conflict detector |
| Onset grid alignment | Medium–bias | Favors denser grids (more hits) |
| IBI regularity | Medium | Often prefers slower candidate; under-weighted vs onset |
| Segment stability | Medium–bias | Can reinforce denser grid |
| Half/double collapse | Good for 2× | Weak for **1.5×** (138 vs 92) |
| Hard-conflict AUTO block | **Strong** | Correctly prevented false AUTO on far cases |
| Import default under CONFLICT | **Weak** | Converts MANUAL into silent top pick |
| External reference | Weak SSOT / useful prior | Not enough alone to rewrite BPM |

**Answer to key question:** For MATERIAL cases, pipeline does **not** have sufficient independent proof to declare one BPM “real.” `USER_SELECTED_CANDIDATE` / MANUAL is the correct epistemic state — but the **value chosen** under automation was the unproven composite top.

---

## 11. Potential improvements (design only — no implementation)

Stack-internal independent signals (no new library required first):

1. **dimsLeading-aware ranking / veto** — if runner leads ≥3 dims and margin < hard gate, do not prefer estimator-top alone (Gryź remix).  
2. **1.5× relation detector** — treat `|hi − lo×1.5| ≤ 2` as ambiguity class (Bit By DTT).  
3. **CONFLICT selection policy** — never auto-pick composite top for import/batch; require explicit Owner pick or prefer slower hip-hop band when both tops allowlisted.  
4. **Downbeat / bar-period energy** — longer periodicity (bar = 4 beats) to distinguish 92 vs 138.  
5. **Onset density normalization** — penalize candidates whose expected beat count ≫ onset count.  
6. Optional later library (architecture only): second tempo estimator with different bias (e.g. spectral flux autocorrelation) — only after (1)–(3) evaluated on golden corpus.

---

## 12. Risks of false AUTO

| Risk | Current status |
|------|----------------|
| AUTO writing wrong BPM on hard conflict | **Mitigated** (gate works) |
| Batch import writing contested top as if decided | **Active** — observed on 5 MATERIAL |
| Using VocalRemover to force AUTO | **Forbidden** by design; would create false AUTO |
| Lowering hard-conflict margin to get more AUTO | **High risk** — would greenlight 138/161/116 |

**False AUTO is worse than controlled user selection.** Keep that invariant.

---

## 13. Recommended next architecture — PROPOSED BPM QUALITY V2 (design)

### Algorithm
1. Keep existing estimators + evidence + hard-conflict AUTO refusal.  
2. Add ambiguity classes: `HARD_CONFLICT`, `NEAR_TIE` (margin < 0.08), `RATIO_1_5`, `DIMS_DISAGREE` (runner dimsLeading > winner).  
3. Scoring adjustment (proposal): when `DIMS_DISAGREE`, require winner dimsLeading ≥ runner OR margin ≥ hard gate; else MANUAL with **no preferred default**.  
4. Selection policy for CONFLICT: UI/import must present **hypothesis pair** (A-family vs B-family); no silent top write.  
5. Optional prior (not SSOT): if Owner supplies external ref and it matches an allowlisted candidate within tol 1, surface as “external agrees with candidate X” — never auto-finalize.

### Evidence
Reuse onset/IBI/segment; add bar-periodicity score; persist probe JSON per beat for audit.

### Thresholds (proposal — to be golden-tested, not guessed live)
- Keep `BPM_HARD_CONFLICT_MARGIN_MIN = 0.15`.  
- Add `BPM_DIMS_DISAGREE` veto when runner.dimsLeading − winner.dimsLeading ≥ 2 and margin < 0.05.  
- Add `BPM_RATIO_TOL` for 1.5× (`|hi/lo − 1.5| ≤ 0.03`).

### Tests required
- Golden: all 5 far cases → MANUAL, allowlist contains both families.  
- Gryź remix: dims-disagree → must not AUTO; preferred UI default ≠ 116 unless Owner picks.  
- Bit By DTT: 1.5× class; allowlist includes 92 & 138.  
- Regression: 4 current AUTO files remain AUTO.  
- Import: CONFLICT path never writes BPM without explicit selection mode.  
- No free BPM outside allowlist.

### Migration / UX / rollback / rollout
- **No automatic rewrite of the 17 production BPMs.**  
- UX: CONFLICT shows two hypotheses + “choose”; catalog may show “BPM uncertain” badge until Owner confirms.  
- Optional Owner batch correction later (allowlist-only updates) — separate GO.  
- Rollback: feature flag `BPM_QUALITY_V2_SELECTION`; resolver AUTO gate unchanged behind flag.  
- Rollout: local golden → staging fixture → production analyze path → only then optional Owner BPM correction pass.

---

## 14. Whether current system should remain unchanged

**Resolver AUTO core: keep.**  
**CONFLICT/import default-to-top + denser-grid bias: change via design V2 (separate Owner GO).**  
**Do not change production BPM now** without Owner case-by-case approval.

Prior Owner matrix proposals for far cases (not applied at import):

| File | Prod now | Matrix proposed |
|------|---------:|----------------:|
| Bit By DTT | 138 | 92 (OWNER_REVIEW) |
| komitywa2 by DTT | 125 | — (OWNER_REVIEW) |
| new komitywa DTremix | 120 | 89 |
| Bitrymdym1 | 161 | 92 (OWNER_REVIEW) |
| Gryź BTSremix | 116 | 95 |

---

## 15. Final decision

### **B — CURRENT BPM RESOLVER NEEDS IMPROVEMENT — DESIGN REQUIRED**

Rationale:
- AUTO safety is acceptable (not C).  
- Catalog quality for 5/17 MATERIAL BPMs + automated CONFLICT→top selection is not acceptable as-is (not A).  
- Next step is **BPM QUALITY V2 design + golden tests**, then Owner GO for implementation — **without** treating VocalRemover as SSOT and **without** silent production BPM mutation.

---

## Appendix A — Probe vs production (regression check)

| Check | Result |
|-------|--------|
| Probe AUTO count | 4 |
| Import AUTO_DETECTED | 4 |
| Production BPM == probe composite top | **17/17** |
| Probe MANUAL → still wrote a BPM | 13/13 via USER_SELECTED_CANDIDATE |
| Evidence of second import / data loss | **None** |

No resolver regression between probe and production: values match. The issue is **policy of what to persist under MANUAL**, not probe drift.
