# BPM QUALITY V2 — DESIGN FREEZE

**Status:** DESIGN ONLY · **READY FOR ARCHITECT REVIEW**  
**Date:** 2026-10-05  
**Production SHA (context):** `91de4c7`  
**Audit input:** `docs/audits/BPM_QUALITY_REVIEW.md` + `BPM_QUALITY_REVIEW_EVIDENCE.json`  
**Related designs:** `BPM_AUTO_DETECTION.md`, `BPM_UNCERTAINTY_UX_DESIGN.md`  
**Evidence pack:** `docs/audits/BPM_QUALITY_V2_DESIGN_EVIDENCE.json`

```text
MUTATIONS THIS PHASE = 0
NO IMPLEMENTATION · NO DB CHANGE · NO BPM REWRITE · NO COMMIT · NO DEPLOY
```

**Non-goals:** matching VocalRemover; retuning weights “to look right”; free BPM; silent CONFLICT top; automatic correction of the 17 production beats.

---

## 1. Problem Statement

### Confirmed RCA (audit B)

| Layer | Status |
|-------|--------|
| Canonical AUTO gate | **Sound** — hard conflict / thin margin → MANUAL |
| Probe outcomes (17 files) | 4 AUTO / 13 MANUAL |
| Downstream persistence | **Broken policy** — CONFLICT/LOW still persist composite top |
| Observed effect | **17/17** production BPM = probe composite top |
| Material vs external ref | 5 files (ref = fixture only, not SSOT) |

### Exact hole to close

```text
TODAY (bad):
  resolveCanonicalBpm → MANUAL_REQUIRED / CONFLICT
  envelope.detectedBpm = composite top   // ranking metadata
  import/finalize default → detectedBpm  // treated as decision
  → beats.bpm written without proven AUTO

V2 (required):
  SCORING ranks hypotheses
  DECISION POLICY decides AUTO | REQUIRE_SELECTION | BLOCK
  CONFLICT/LOW never silently persist composite top
```

UX already sets `recommendedBpm: null` for CONFLICT (`bpm-uncertainty-ui.ts`).  
**V2 must make the same rule binding for import, admin batch, and any non-UI finalize path.**

---

## 2. Current Architecture (SSOT for V2 reuse)

```text
bytes
 → analyzeBeatAudioBytes
 → tempo() + combTempo()           // estimator A/B
 → ensemble suggestion             // not AUTO authority
 → gatherBpmEvidence               // onset, IBI, segments
 → resolveCanonicalBpm             // AUTO gate ★
 → buildBpmUncertaintyEnvelopeFromProbe
 → UI / import selection
 → finalize re-probe → resolveCreateBpm(allowlist) → beats.bpm
```

**Reuse first:** do not invent a parallel detector. V2 changes **decision policy + selection contract**, not a new catalog path.

Frozen constants (do not casually change; any change needs golden tests):

| Constant | Value | Role |
|----------|------:|------|
| `BPM_SCORE_WEIGHTS` | 0.3/0.3/0.2/0.2 | Scoring only |
| `BPM_AUTO_MARGIN_MIN` | 0.08 | Soft AUTO margin |
| `BPM_AUTO_MIN_DIMENSIONS` | 2 | Soft AUTO dims |
| `BPM_AUTO_MIN_COMPOSITE` | 0.32 | Soft floor |
| `BPM_HARD_ESTIMATOR_DELTA` | 10 | Hard conflict trigger |
| `BPM_HARD_CONFLICT_MARGIN_MIN` | 0.15 | Hard AUTO margin |
| `BPM_HARD_CONFLICT_MIN_DIMENSIONS` | 3 | Hard AUTO dims |
| `BPM_NEAR_TEMPO_TOL` | 1 | Near cluster |
| Half/double tol | `\|hi−lo×2\|≤1` | Collapse / relation |
| `BPM_UNCERTAINTY_MAX_CANDIDATES` | 6 | Cap |

DB today: only `beats.bpm` (integer NOT NULL). `bpm_source` is logical / ephemeral (see §12).

---

## 3. RCA Summary (design implications)

| Cause | Implication for V2 |
|-------|-------------------|
| Composite ranking ≠ multi-dimension agreement (Gryź remix) | Add **dims-disagree veto** before AUTO |
| Hard conflict correctly MANUAL, but default still top | **CONFLICT selection required**; no default BPM |
| 1.5× (138≈1.5×92) not modeled | Add **RATIO_1_5** relation class; no auto-collapse |
| Import `detectedBpm` under CONFLICT | Close hole in **all** create paths |
| External ref ≠ SSOT | Material cases stay MANUAL unless **internal** evidence proves AUTO |

---

## 4. Decision Contract

### 4.1 Vocabulary

| Term | Meaning |
|------|---------|
| **Scoring** | Composite ranks candidates; produces `rankedTop`, `runnerUp`, margins, dimsLeading |
| **Decision** | Policy output: `AUTO_SUGGEST` \| `REQUIRE_SELECTION` \| `UNAVAILABLE` |
| **detectedBpm** | Optional **ranking hint** = composite top when scores exist — **not** a commit decision |
| **selectedBpm** | Explicit choice (AUTO accept of HIGH winner, or user/import Owner pick from allowlist) |
| **allowlist** | Server-rebuilt discrete integer set (≤6 + hypothesis members); security boundary |

### 4.2 CONFLICT semantics (normative)

```text
CONFLICT ≠ "best BPM is rankedTop"
CONFLICT  = "system lacks sufficient evidence for automatic choice"
```

| Question | V2 answer |
|----------|-----------|
| May `detectedBpm` exist under CONFLICT? | **Yes** — as ranking metadata / “highest composite” label only |
| May UI preselect `detectedBpm` under CONFLICT? | **No** (`recommendedBpm = null`) |
| May import/batch persist `detectedBpm` under CONFLICT without explicit pick? | **No** → `BLOCKED_BPM_SELECTION_REQUIRED` |
| May user persist an allowlisted candidate under CONFLICT? | **Yes** → `bpm_source = USER_SELECTED_CANDIDATE` |
| When is READY allowed under CONFLICT? | Only after **explicit** allowlisted selection + finalize re-probe pass |
| When does upload stay BLOCKED? | UNAVAILABLE, empty allowlist, CONFLICT/LOW without selection, stale envelope, outside allowlist |

### 4.3 Confidence → selection obligation

| Class | Auto-persist? | Selection | READY gate |
|-------|---------------|-----------|------------|
| **HIGH** | Yes — `detectedBpm` if allowlisted | Optional change among allowlist | Finalize with `AUTO` or allowlisted alternate |
| **MEDIUM** | **No** silent persist | Soft recommend top; user may accept or pick | Requires explicit finalize selection (`CANDIDATE` or accept-recommend signal) |
| **LOW** | **No** | Force pick among candidates; no preferred default for batch | Explicit selection required |
| **CONFLICT** | **No** | Force pick among 2–3 hypotheses; no preferred default | Explicit selection required |
| **UNAVAILABLE** | **No** | No options | **Blocked** — no free BPM |

**MEDIUM nuance (design):** interactive UI may show “sugerowane: X” with one-click accept; that accept is still an **explicit** client action (`selectionMode=CANDIDATE` or `AUTO` only if policy upgrades to HIGH). Batch/import must not treat soft recommend as implicit.

### 4.4 `bpm_source` mapping (logical)

| Condition | `bpm_source` |
|-----------|--------------|
| Decision HIGH + client submits detected winner + no override | `AUTO_DETECTED` |
| Any explicit pick from allowlist / hypothesis | `USER_SELECTED_CANDIDATE` |
| Contiguous near-tempo range pick (span ≤1, all integers present) | `USER_SELECTED_WITHIN_SYSTEM_RANGE` |
| Free entry / invented BPM | **Forbidden** |

---

## 5. Candidate Model

### 5.1 Construction order (cap 6)

1. Estimator A top, B top (if distinct)  
2. Composite ranked top + runner-up  
3. Half/double alts of members already in set  
4. **RATIO_1_5** alts of members already in set (new; see §7)  
5. Supporting scored candidates by composite DESC  
6. Truncate to **`BPM_UNCERTAINTY_MAX_CANDIDATES = 6`**

### 5.2 Roles (extend existing)

```ts
role:
  | "TOP"
  | "RUNNER"
  | "SUPPORTING"
  | "HALF_DOUBLE_ALT"
  | "RATIO_1_5_ALT"   // V2
```

### 5.3 Discrete only — no continuum invent

| Allowed | Forbidden |
|---------|-----------|
| `{92, 95}` as two candidates | Range 92–95 inventing 93/94 unless both already evidenced |
| Contiguous range **only** if every integer in span already in set **and** `max−min ≤ BPM_NEAR_TEMPO_TOL` | `{92…138}` continuum |
| Hypotheses as disjoint families | Merging hard-conflict tops into one range |

---

## 6. Conflict Policy

### 6.1 Conflict classes (decision taxonomy)

| Class | Trigger (reuse existing evidence) | AUTO? | Persist default? |
|-------|-----------------------------------|-------|------------------|
| `ESTIMATOR_HARD_CONFLICT` | Existing hard-conflict predicate | No | No |
| `NEAR_TIE` | `margin < BPM_AUTO_MARGIN_MIN` (0.08) | No | No |
| `DIMS_DISAGREE` | New veto §6.2 | No | No |
| `SEGMENT_CONTRADICTION` | Existing segment δ rule | No | No |
| `RATIO_1_5_AMBIGUITY` | New relation §7 without resolve | No | No |
| `UNRESOLVED_PAIR` / `OCTAVE_AMBIGUITY` | Existing ensemble/resolve reasons | No | No |

Any of the above → `confidenceClass = CONFLICT` or `LOW` per existing mapper, but **selection obligation = required** (never silent top).

### 6.2 Dimensions-disagree veto

**Problem evidence (Gryź BTSremix):**  
winner 116 composite 0.676, dimsLeading **1**; runner 95 composite 0.667, dimsLeading **3**; margin **0.0088**.

**Rule (V2):**

```text
DIMS_DISAGREE if:
  runner exists
  AND (runner.dimsLeading - winner.dimsLeading) >= 2
  AND margin < BPM_AUTO_MARGIN_MIN   // 0.08 — existing constant
```

| Design choice | Justification |
|---------------|---------------|
| Δ dims ≥ **2** | Gryź evidence: 3−1=2; single-dim noise (2 vs 1) alone is weaker |
| Margin bound uses **0.08** | Reuses frozen soft AUTO margin; avoids inventing a third magic number |
| Effect | Force `REQUIRE_SELECTION`; keep **both** winner and runner as hypotheses; composite still ranks for display |

**When composite may still be used:** ranking, labels (“wyższy score”), allowlist order — **never** as sole AUTO authority when veto fires.

**Open calibration:** if golden corpus later shows false MANUAL on safe files, adjust only with tests — not “on feel.” Marked in §16.

### 6.3 Hypothesis retention under conflict

- Prefer **2** hypotheses (A-family vs B-family).  
- Allow **3** when TOP, RUNNER, and a distinct RATIO_1_5/HALF_DOUBLE family all survive scoring.  
- Never collapse hard-conflict or RATIO_1_5 pairs into one representative for decision.

---

## 7. 1.5× Class (`RATIO_1_5`)

### 7.1 Definition

```text
isRatioOnePointFive(a, b) iff
  lo = min(a,b), hi = max(a,b)
  AND lo > 0
  AND |hi / lo - 1.5| ≤ R15_REL_TOL
```

### 7.2 Tolerance — DESIGN OPEN QUESTION (bound)

| Proposal | Value | Evidence basis | Status |
|----------|------:|----------------|--------|
| `R15_REL_TOL` | **0.03** | Bit By DTT: 138/92 ≈ 1.500; 138/91 ≈ 1.516 → within 0.03 of 1.5 for 92-family | **PROVISIONAL — must golden-test** |
| Absolute fallback | `\|hi − round(lo×1.5)\| ≤ 2` | Catches integer BPM rounding | **PROVISIONAL** |

If golden tests disagree → keep class detection but **never AUTO-collapse**; treat as ambiguity only.

### 7.3 Behavior

| Topic | Rule |
|-------|------|
| Collapse like half/double? | **No** — 1.5× is **not** resolved automatically |
| Allowlist | Both sides remain discrete candidates (`RATIO_1_5_ALT`) |
| AUTO | Blocked if pair involves winner/runner and not otherwise independently proven |
| UX | Label both hypotheses (“możliwe tempo sesyjne vs siatka 1.5×”) without claiming truth |
| VocalRemover | Not used to pick which side wins |

### 7.4 DESIGN OPEN QUESTIONS

1. Exact `R15_REL_TOL` after golden sweep on 17 + fixtures.  
2. Whether 1.5× should appear in ensemble octave traps (today traps are 2× oriented).  
3. Whether bar-periodicity signal (future) can resolve 1.5× — **out of V2 MVP** unless evidence lands first.

---

## 8. Score vs Decision — Decision Matrix

```text
SCORING  → ranked list, margin, dimsLeading, relationships
DECISION → AUTO_SUGGEST | REQUIRE_SELECTION | UNAVAILABLE
```

| # | confidence path | margin | dims agree | conflict/relation | segment OK | **Decision** |
|---|-----------------|--------|------------|-------------------|------------|--------------|
| 1 | scores empty / decode fail | — | — | — | — | **UNAVAILABLE** |
| 2 | hard estimator conflict | < 0.15 or dims < 3 | any | HARD | any | **REQUIRE_SELECTION** |
| 3 | dims-disagree veto | < 0.08 | runner leads by ≥2 | DIMS_DISAGREE | any | **REQUIRE_SELECTION** |
| 4 | ratio 1.5 on top pair | any | any | RATIO_1_5 | any | **REQUIRE_SELECTION** |
| 5 | segment contradiction | any | any | — | fail | **REQUIRE_SELECTION** |
| 6 | near tie | < 0.08 | any | NEAR_TIE | ok | **REQUIRE_SELECTION** |
| 7 | soft AUTO gates all pass | ≥ 0.08 | winner dims ≥ 2 | none | ok | **AUTO_SUGGEST** (HIGH) |
| 8 | hard conflict but margin≥0.15 **and** dims≥3 **and** no veto/1.5 | ≥ 0.15 | ≥ 3 | hard cleared | ok | **AUTO_SUGGEST** (rare) |

**Invariant:** passing row #7/#8 is the **only** path to `AUTO_DETECTED` without explicit user/Owner selection.

---

## 9. Five Material Cases — Expected V2 Outcomes

External reference = **test fixture only**. Success ≠ “match VocalRemover.”

| Case | Prod today | Fixture ref | Internal evidence conclusive? | V2 decision | Allowlist must include |
|------|-----------:|------------:|-------------------------------|-------------|------------------------|
| Bit By DTT | 138 | 91 | **No** (hard conflict; 1.5×) | REQUIRE_SELECTION | 92 & 138 (91 optional if not probed) |
| komitywa2 by DTT | 125 | 88 | **No** (margin≈0) | REQUIRE_SELECTION | 125, 117, **88** |
| new komitywa DTremix | 120 | 89 | **No** (hard conflict) | REQUIRE_SELECTION | 120 & **89** |
| Bitrymdym1 | 161 | 93 | **No** (hard conflict) | REQUIRE_SELECTION | 161 & **92** |
| Gryź BTSremix | 116 | 95 | **No** (dims-disagree) | REQUIRE_SELECTION | 116 & **95** |

**Pass criteria for these tests:** MANUAL/REQUIRE_SELECTION + both families present + **no silent persist of top** in import simulation.  
**Fail criteria:** forcing fixture BPM as AUTO, or collapsing to a single candidate.

---

## 10. Regression Matrix (must not break)

| ID | Case | Expected |
|----|------|----------|
| R01 | HIGH AUTO (byBRD 88, byBRDremix 88, Cinny BRD 92, Gryź BTS1 95) | Remain AUTO_SUGGEST |
| R02 | Half/double resolved | Still collapse per existing rule; AUTO if gates pass |
| R03 | Near-tempo 91/92 cluster | Discrete family; tol=1 |
| R04 | Discrete 92 vs 95 | Two candidates, no 93/94 invent |
| R05 | 92 vs 138 separate hypotheses | Never one continuum |
| R06 | Stale analyze / envelope mismatch | Finalize reject |
| R07 | Arbitrary 150 not in allowlist | Reject |
| R08 | Empty allowlist / UNAVAILABLE | Block READY |
| R09 | Client bypass / override outside allowlist | Reject |
| R10 | Soft AUTO margin gate | Unchanged constants unless golden GO |
| R11 | Uncertainty UX CONFLICT `recommendedBpm=null` | Remains + becomes server/import binding |

---

## 11. Security (unchanged boundary)

| Control | V2 |
|---------|----|
| NO FREE BPM | Kept |
| Server allowlist from re-probe | Kept |
| Finalize re-download + re-probe | Kept |
| `bpmManualOverride` cannot invent | Kept |
| Stale envelope rejection | Kept |
| Client cannot force off-allowlist | Kept |
| External tools as candidates | **Forbidden** |

V2 **tightens** selection obligation; it does **not** widen the value space.

---

## 12. UX Contract

| Class | Headline (PL intent) | Behavior |
|-------|----------------------|----------|
| HIGH | „System wykrył BPM X” | Auto-ready; optional change among allowlist |
| MEDIUM | „System sugeruje X” | Show suggestion + alternatives; explicit accept/pick |
| LOW | „System nie ma pełnej pewności” | Force pick; no batch default |
| CONFLICT | „System nie może jednoznacznie określić BPM” | 2–3 hypotheses; **no** preselected value |
| UNAVAILABLE | „Brak wiarygodnego BPM” | No input; cannot proceed |

No free-text BPM. No slider inventing integers outside evidenced set.

---

## 13. Data Model

### Prefer existing (MVP)

| Store | Field | V2 |
|-------|-------|-----|
| DB | `beats.bpm` | Final integer only (unchanged) |
| Ephemeral analyze/finalize | envelope + `bpm_source` in API/audit logs | Already logical |
| DB | `bpm_source` / confidence columns | **Not required for V2 MVP** |

### Optional later (Owner GO — not in this freeze)

| Column | Purpose |
|--------|---------|
| `bpm_source` | Persist provenance |
| `bpm_confidence_class` | Audit/UI |
| `bpm_decision_reason` | Resolver reason code |
| `bpm_evidence_version` | Probe algorithm version |

**Rule:** V2 ships without migration if selection hole can be closed in `resolveCreateBpm` + import + UI contracts alone.

---

## 14. Batch / Import Policy (critical)

```text
IF confidenceClass IN {CONFLICT, LOW, UNAVAILABLE}
  OR decision != AUTO_SUGGEST
THEN
  refuse implicit detectedBpm
  require explicit selection map (Owner/file → allowlisted BPM)
  ELSE block file (BLOCKED_BPM_SELECTION_REQUIRED)

IF confidenceClass == HIGH AND decision == AUTO_SUGGEST
THEN
  allow AUTO persist of detectedBpm
```

MEDIUM: interactive = explicit accept; batch = require map or block (conservative default for V2).

---

## 15. Test Strategy (design — not implemented yet)

### Unit
- dims-disagree veto (Gryź synthetic scores)  
- RATIO_1_5 detector (±tol)  
- decision matrix rows #1–8  
- allowlist still ≤6 discrete  

### Contract / security
- CONFLICT finalize without selection → reject  
- override outside allowlist → reject  
- stale envelope → reject  
- empty allowlist → reject  

### Resolver / uncertainty
- 5 material fixtures → REQUIRE_SELECTION + dual hypotheses  
- 4 HIGH fixtures → AUTO  
- half/double + near-tempo regression  

### Integration
- analyze → envelope flags `requiresExplicitSelection`  
- finalize honors flag  

### E2E
- CONFLICT UI: no preselected BPM; READY only after click  
- HIGH UI: auto path  
- Import dry-run: CONFLICT files blocked without map  

### Corpus
- All 17 production filenames as golden inputs (probe JSON fixtures)  
- External ref used only as **annotation**, never assertion target for AUTO  

---

## 16. Rollout

| Phase | Action | Data mutation |
|-------|--------|---------------|
| 0 | Architect / Owner review of this freeze | 0 |
| 1 | Implement decision policy + import/UI gates behind flag `BPM_QUALITY_V2` | 0 |
| 2 | Golden tests green locally | 0 |
| 3 | Deploy code (behavior for **new** uploads/finalizes) | 0 on existing rows |
| 4 | Optional Owner GO: case-by-case BPM correction of 17 | Separate GO only |

**V2 MUST NOT auto-rewrite the 17 production BPMs.**

---

## 17. Rollback

| Layer | Plan |
|-------|------|
| Code | Revert flag / revert PR; restore V1 selection behavior |
| Resolver | Soft/hard AUTO constants unchanged by default — roll back only V2 veto/1.5 policy modules |
| UX | Prior copy/phases from uncertainty V1 |
| Data | **No data rollback needed** if V2 never rewrote BPM; if Owner later corrected rows, revert those rows only via explicit GO |

Existing 17 beats: remain as-is across V2 code rollout until a **separate** Owner correction GO.

---

## 18. Open Questions

1. Final `R15_REL_TOL` after golden sweep.  
2. MEDIUM batch policy: block vs require map (freeze default = **block/require map**).  
3. Whether to persist `bpm_source` columns (optional; not MVP).  
4. Whether dims-disagree Δ≥2 needs corpus-wide false-positive audit before ship.  
5. Admin metadata edit path (non-reprobe) remains out of detector UX — confirm still separate privilege.

---

## 19. Acceptance Criteria

V2 is successful when:

1. CONFLICT/LOW never silently persist composite top (UI + import + finalize).  
2. AUTO only via decision matrix rows that pass evidence gates.  
3. Candidate selection is controlled allowlist-only.  
4. 1.5× is explicit class; no silent collapse.  
5. Composite score cannot bypass decision policy.  
6. Security remains server-side re-probe allowlist.  
7. Current HIGH AUTO cases remain AUTO (regression).  
8. False AUTO risk decreases (dims-disagree + CONFLICT binding).  
9. Existing production BPM are **not** auto-changed.  
10. Material five remain REQUIRE_SELECTION unless future evidence proves AUTO internally.

---

## 20. Final Design Verdict

# BPM QUALITY V2 DESIGN: READY FOR ARCHITECT REVIEW

**Do not implement** until Architect Review + Owner GO.

---

## Appendix A — Mapping to uncertainty UX V1

| V1 | V2 delta |
|----|----------|
| CONFLICT UI `recommendedBpm=null` | Make **server/import** enforce same |
| `detectedBpm` always set from top | Keep as ranking hint; strip decision authority under CONFLICT/LOW |
| Import picks `detectedBpm` if allowlisted | **Forbidden** unless HIGH AUTO |
| Half/double collapse | Unchanged |
| RATIO_1_5 | New ambiguity class |
| Dims-disagree | New veto before AUTO |

## Appendix B — Explicit non-goals

- VocalRemover as signal or SSOT  
- Free BPM text field  
- Automatic production BPM rewrite  
- New detector library in MVP  
- Lowering hard-conflict margin to increase AUTO rate  
