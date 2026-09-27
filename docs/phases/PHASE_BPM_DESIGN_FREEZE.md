# BPM Production Design Freeze

**Title:** BPM Auto-Suggest Production Architecture (post V1–V5 research)  
**Document status:** **IMPLEMENTED (Production V1)** · **ACCURACY NOT CERTIFIED**  
**Implementation date:** 2026-09-27  
**Evidence base:** Experiments V1–V5 (`docs/architecture/BPM_AUTO_DETECTION.md`)  
**Corpus at freeze:** REAL golden **n=56** · SYNTHETIC **n=38**  
**Owner:** commit / push / deploy remain Owner-gated

```text
DESIGN FREEZE = frozen rules (C_NEAR, RULE B, formats, SSOT)
IMPLEMENTATION STATUS = BPM Production Implementation V1 = IMPLEMENTED
CURRENT STATUS = shipped locally (Platform Beat audio-first create)
ACCURACY = NOT CERTIFIED
NO NEW DB FIELDS
NO TELEMETRY IN V1
```

**Code:** `src/lib/beats/bpm-ensemble.ts` · `analyzeBeatBpm` in `audio-bpm.ts` · admin create form · `resolveCreateBpm`

---

## Status map (read this first)

| Layer | Meaning |
|-------|---------|
| **DESIGN FREEZE** | Rules locked from V1–V5 research before wiring (C_NEAR, RULE B, UX principles, format matrix). Changing them needs a new experiment + Owner review. |
| **IMPLEMENTATION STATUS** | Platform Beat create uses the frozen resolver end-to-end. |
| **CURRENT STATUS** | **BPM Production Implementation V1 = IMPLEMENTED** |
| **ACCURACY** | **NOT CERTIFIED** — do not market rates as proven. |

This document is the freeze SSOT **plus** implementation status. Research history lives in `BPM_AUTO_DETECTION.md`.

---

## 0. Purpose

Freeze the production architecture for BPM auto-suggest based on research evidence, then record what V1 actually wired for Platform Beat audio-first create.

This freeze + V1 implementation does **not**:

- certify accuracy
- add DB columns (`bpm_source` / `bpm_confidence` / detector version)
- add telemetry
- extend formats beyond WAV/MP3 auto

It defines SSOT, pipeline, decision model, safety gates, UX copy principles, revalidation, test contract, known gaps, and open questions.

---

## 1. SSOT

| Role | Authority |
|------|-----------|
| **Source audio bytes** | SSOT for signal analysis |
| **Server-side analysis** | Authority for AUTO_SUGGEST / MANUAL_REQUIRED |
| **`beats.bpm`** | Final persisted BPM (integer domain contract) |
| **Client BPM** | Suggestion display / user input only — **never trusted as analysis truth** |

**Forbidden:**

- Treating client-computed BPM as trusted without server path
- Persisting detector confidence as calibrated accuracy
- Silent overwrite of user-confirmed override without explicit override flag

---

## 2. Production pipeline (frozen design → implemented in V1)

**Design freeze (locked before GO):** the pipeline below.  
**Implementation status:** implemented on Platform Beat create (`createPlatformBeatWithMasterAction`).

```text
UPLOAD
  ↓
SERVER AUDIO VALIDATION (MIME / size / Access Gate — existing)
  ↓
AUDIO DECODE (WAV/MP3 only for auto; FLAC/AAC/M4A → analysis unavailable)
  ↓
ESTIMATOR A = @audio/beat tempo()     } same mono PCM
ESTIMATOR B = @audio/beat combTempo() } one decode
  ↓
ENSEMBLE / SAFETY RESOLVER
  = C_NEAR then RULE B (octave safety)
  ↓
AUTO_SUGGEST | MANUAL_REQUIRED  (+ internal reason codes)
  ↓
USER CONFIRM / EDIT
  ↓
SERVER REVALIDATION (re-probe + resolveCreateBpm policy)
  ↓
beats.bpm
```

**Estimators (frozen identities):**

| ID | Method | Role |
|----|--------|------|
| A | `tempo()` ACF + ODF + ~120 prior | Estimator A |
| B | `combTempo()` comb + same ODF family | Estimator B |

Evidence: B ≈ +25–30% wall time vs A; both sub-second on studied corpus. **No production SLA frozen** without live load data.

---

## 3. Decision model

### Public outcomes (user-facing)

| Decision | Meaning |
|----------|---------|
| `AUTO_SUGGEST` | Server proposes a BPM; user may accept or edit |
| `MANUAL_REQUIRED` | No reliable suggest; user must enter BPM |

### Internal reason codes (technical only — not accuracy claims)

| Reason | When |
|--------|------|
| `AGREEMENT` | A BPM == B BPM |
| `NEAR_AGREEMENT` | \|A−B\| ≤ 2 |
| `CONFLICT` | \|A−B\| > 2 |
| `OCTAVE_AMBIGUITY` | RULE B safety trip (half/double trap) |
| `UNSUPPORTED_FORMAT` / `DECODE_FAILED` / `ANALYSIS_FAILED` | Manual / unavailable path |
| `OUT_OF_RANGE` / `MISSING_ESTIMATE` | Manual path |

Reasons must **never** be shown as “AI is sure” / “100% accurate” / “confidence=1 means correct”.

---

## 4. C_NEAR (frozen definition — do not alter without new experiment)

Research strategy `C_AGREEMENT_NEAR` / `strategyCNear` (V3):

1. If A or B missing → `MANUAL_REQUIRED`
2. If **exact agreement** (`A == B`) → `AUTO_SUGGEST` with BPM = A
3. If **near agreement** (`|A − B| ≤ 2`) → `AUTO_SUGGEST` with BPM = `round((A+B)/2)`
4. Else (`|A − B| > 2`) → `MANUAL_REQUIRED` (`CONFLICT`)

**Tolerance:** ±2 BPM absolute between tops only.

**Candidates:** C_NEAR does **not** require candidate cross-support. Candidate lists are unused by C_NEAR itself.

**Harmonics:** C_NEAR does **not** normalize ×2 / ×½ / ×3/2 / etc. Harmonic pairs with \|A−B\| > 2 abstain (manual).

**V5 evidence (REAL n=56):** precision 89.3% · coverage 50% · false-auto 10.7% (3/28). All three false-autos are octave / near-octave class. **Not certified.**

---

## 5. RULE B — SAFETY GATE (frozen — do not alter without new experiment)

Research: `RULE_B_OCTAVE_AMBIGUITY` (V4/V5).

### Composition

```text
result = C_NEAR(pair)
if result == MANUAL_REQUIRED → MANUAL_REQUIRED
if octaveAmbiguous(suggestedBpm, A.candidates, B.candidates) → MANUAL_REQUIRED
else → AUTO_SUGGEST (C_NEAR BPM)
```

### Octave ambiguity (GENERAL RULE — no fixture IDs, no expected BPM)

Flag `OCTAVE_AMBIGUITY` when **any** of:

1. Half or double of suggested BPM appears in A or B candidate lists (±1 BPM), **or**
2. **Low-side trap:** suggested ≤ 100 and `2 × suggested ≤ 200` (detector search max), **or**
3. **High-side trap:** suggested ≥ 140 and `suggested / 2 ≥ 60` (detector search min)

### Why this rejects 142→71

A=B=71 → C_NEAR would AUTO 71. Suggested 71 ≤ 100 and 142 ≤ 200 → low-side trap → **MANUAL_REQUIRED**.  
Critical V4 finding: **142 was absent from both candidate lists** — candidate-twin alone is insufficient; range trap is required.

### Why never auto ×2

Agreement ≠ truth. Doubling 71→142 without independent evidence would invent BPM. Safety policy: **abstain**, let the user enter.

### Coverage consequence

V5 REAL: **0 false-auto in studied corpus (n=56)** · coverage **~21.4%** · abstain ~78.6%.  
Synthetic: 0 false-auto · coverage ~23.7%.

```text
RULE B = SAFETY GATE
RULE B ≠ ACCURACY PROOF
RULE B ≠ CERTIFICATION
```

Do not claim “100% accurate.” Allowed wording: “0 false-auto in studied corpus (n=56); confidence limited by corpus size/diversity.”

---

## 6. Octave safety (production behavior)

For pairs like:

| Pattern | Example | Safe action |
|---------|---------|-------------|
| Half of true | 142 → 71 | `MANUAL_REQUIRED` (RULE B) |
| Double of true | 80 → 161 | `MANUAL_REQUIRED` (RULE B high-side) |
| Near-half | 166 → 84 | `MANUAL_REQUIRED` (RULE B) |

**Forbidden automatic actions:**

- Multiply / divide by 2 and accept
- Prefer hip-hop band as proof of truth
- Use `confidence === 1` as correctness

If no independent proof of octave direction → **MANUAL_REQUIRED**.

---

## 7. UX (frozen principles — implemented on admin create)

### CASE A — `AUTO_SUGGEST`

```text
BPM: <suggested>
Automatycznie wykryto

[ Zmień BPM ]
```

User can accept (no override) or edit (sets explicit manual override for create).

### CASE B — `MANUAL_REQUIRED`

```text
BPM nie udało się wiarygodnie określić.

[ Wpisz BPM ]
```

### Forbidden copy

- “AI jest pewne”
- “100% dokładności”
- “confidence 1.0 = pewne”
- Any certification language

Language: Polish product UI; keep technical reasons server-side / admin logs only.

---

## 8. Server revalidation (create) — implemented

```text
client BPM + override flag
  ↓
server receives
  ↓
server re-probes audio (A+B+resolver) when decode available
  ↓
compare via resolveCreateBpm
  ↓
persist beats.bpm
```

| Situation | Policy |
|-----------|--------|
| Exact match client ↔ AUTO_SUGGEST | Accept server suggest |
| Conflict, `override=false` | Reject with clear error |
| Conflict, **`override=true`** | **Accept client BPM** if in legal range |
| Decode unavailable / MANUAL_REQUIRED (no suggest) | Accept manual BPM in range |

**User-confirmed override wins** over estimator disagreement when explicit. Client analysis never bypasses server range validation.

---

## 9. Range (existing domain contract)

```text
BEAT_BPM_MIN = 1
BEAT_BPM_MAX = 300
integer only
```

No new range invented by this freeze. Detector experiment window historically 60–200 — internal to estimators; persisted BPM still 1–300.

---

## 10. Format support (existing)

| Format | Auto analysis | Upload |
|--------|---------------|--------|
| WAV | YES | YES |
| MP3 | YES | YES |
| FLAC | NO → MANUAL | YES |
| AAC / M4A | NO → MANUAL | YES |

No format expansion without separate audit. No ffmpeg / native deps.

---

## 11. Performance (evidence, not SLA)

| | Evidence |
|--|----------|
| A | Sub-second on studied fixtures |
| B | ~+25–30% vs A; still sub-second |
| Combined A+B | One PCM decode; two estimators |

**No artificial production SLA** frozen without production traffic / hardware profile.

---

## 12. Data model

**Keep:** `beats.bpm` only (SSOT persisted value).

**Not added in V1:**

- `bpm_source`
- `bpm_confidence`
- `detector_version` column

Rationale: V1–V5 show confidence ≠ correctness; source/version can live in logs/metrics first.

---

## 13. Observability (design only — not implemented)

Optional future counters / logs (no raw audio retention):

- count AUTO_SUGGEST vs MANUAL_REQUIRED
- manual override rate
- format (wav/mp3/unavailable)
- detection duration (ms)
- resolver reason code
- optional package / detector version string in logs

**V1:** no telemetry / analytics.

---

## 14. Test contract

### Implemented (unit / pure)

| Area | Coverage |
|------|----------|
| RULE B criticals | 142→71, 80→161, 166→84 → MANUAL |
| C_NEAR | agreement / near / conflict |
| Create policy | override / mismatch / invalid range / NaN / Infinity |
| Legacy FormData create | hard-disabled |
| Metadata BPM contract | range validation; no ensemble on edit module |

### Remaining gaps (explicit)

- Full create E2E against production storage (no harness in V1)
- FLAC/AAC/M4A full upload E2E (manual fallback only; MIME unit covered)
- Accuracy certification corpus / live traffic audit
- Future policy review of ADMIN metadata edit vs create ensemble

### Must-block false AUTO (RULE B)

| Case | Expected decision |
|------|-------------------|
| 142 → A=B=71 | `MANUAL_REQUIRED` / `OCTAVE_AMBIGUITY` |
| 80 → ~161/160 near | `MANUAL_REQUIRED` |
| 166 → ~83/84 near | `MANUAL_REQUIRED` |

### Ensemble / conflict behavior

| Case | Expectation |
|------|-------------|
| 90 → 120 vs 90 (A/B disagree) | C_NEAR conflict → MANUAL (unless near) |
| 140 → 112 / 70 | CONFLICT → MANUAL |
| 140 → 94 / 140 | CONFLICT or B-sided — per C_NEAR \|Δ\| |
| 87 → 172 / 175 | CONFLICT → MANUAL |
| 88 → 170 / 88 | CONFLICT → MANUAL (C_NEAR); harmonic strategies out of scope for frozen resolver |
| 100 → 99 / 100 | NEAR → C_NEAR suggest ~100; RULE B may still MANUAL if octave trap applies |

### Server revalidation

- override=false + mismatch → reject
- override=true + range OK → accept user BPM
- invalid 0 / 999 / non-int / NaN / Infinity → reject
- FLAC path → manual accept in range

---

## 15. Security

| Rule | Status |
|------|--------|
| Server authoritative for analysis decision on **create** | IMPLEMENTED |
| Client cannot force out-of-range BPM | IMPLEMENTED (1–300 int) |
| User override must be explicit when AUTO suggest present | IMPLEMENTED |
| No trust in client-only analysis | IMPLEMENTED |
| No DB / storage schema change in V1 | HELD |
| Access Gate / upload limits unchanged | REUSE |
| ADMIN metadata edit can set BPM without re-probe | DOCUMENTED (intentional admin path) |

---

## 16. Open questions (cannot close from V1–V5 alone)

1. **Ship coverage vs safety:** Is ~21% AUTO_SUGGEST coverage (RULE B) acceptable for admin UX, or is a later hybrid needed?
2. **Production traffic / file lengths** may differ from Freesound golden set — false-auto rate under live masters unknown.
3. **Telemetry retention / PII** policy if reason codes are logged with beat IDs.
4. **Whether metadata edit** should later require ensemble re-probe (today: intentional manual admin edit).

No new Open Decision IDs invented here; escalate to OD only if Owner requires formal tracking.

---

## 17. Production resolver (frozen + implemented)

```text
PRODUCTION_SUGGEST = RULE_B(C_NEAR(A, B))
```

- Prefer **safety (RULE B)** over raw C_NEAR coverage.
- Keep C_NEAR definition frozen as above.
- Keep RULE B definition frozen as above.
- Surface only AUTO_SUGGEST / MANUAL_REQUIRED to UI.
- Persist only `beats.bpm` after revalidation.

**Still:** ACCURACY NOT CERTIFIED until Owner certification gate (separate).

---

## 18. Status legend

| Label | Meaning |
|-------|---------|
| DESIGN FREEZE | Architecture / rules locked from research |
| IMPLEMENTED | Production V1 code wired for Platform Beat create |
| NOT CERTIFIED | Accuracy must not be marketed as proven |
| FROZEN RULE | Change requires new experiment + Owner review |
| REUSE | Existing locked capability |
| GAP | Explicit known gap (tests, formats, certification, etc.) |

---

**End of Design Freeze + V1 status document.**  
Owner review required before commit / push / deploy.
