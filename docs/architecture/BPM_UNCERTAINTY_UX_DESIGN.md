# BPM Uncertainty UX + Controlled User Override — DESIGN REVIEW

**Status:** DESIGN APPROVED · **IMPLEMENTATION CLOSED** (domain/server/UI)  
**Date:** 2026-10-05  
**Scope:** product + contract design for controlled BPM correction during upload  
**Implemented:** `bpm-uncertainty.ts` + `bpm-uncertainty-ui.ts` + `BpmUncertaintyField` wired into admin/user upload · no DB migration  
**Full browser READY E2E:** **BLOCKED / ACCEPTED ENVIRONMENT LIMITATION** (no local Docker/Supabase; Owner accepted — not an E2E PASS). See `docs/audits/BPM_E2E_ACCEPTANCE_AND_DURATION_210_AUDIT.md`.  
**Non-goals this phase:** DB mutation · resolver threshold changes · VocalRemover integration · import · commit/push/deploy

```text
PRODUCT RULE
  User may correct the system's decision,
  but may NOT supply a BPM outside the value-space
  the system itself considers plausible for this file.

HOLE CLOSED (server)
  resolveCreateBpm / finalize rebuild envelope from bytes;
  bpmManualOverride NEVER grants free 1–300 entry.
  UI candidate controls = next Owner GO.
```

VocalRemover / `key_bpm.csv` = **external research only**. Not a signal, not a candidate source, not integrated.

---

## 0. Audit findings (current production)

| Area | Fact | Implication |
|------|------|-------------|
| DB | `beats.bpm integer NOT NULL` + CHECK 1–300 | READY finalize must write a concrete integer; no nullable BPM |
| Detector metadata columns | **None** (`bpm_source` / confidence / candidates forbidden in V1 freeze) | Logical model first; persist strategy phased (ephemeral → optional columns later) |
| Resolver | `resolveCanonicalBpm` authoritative AUTO; near-tempo tol=1; hard conflict Δ>10 | Candidate/range gen must reuse these outputs — **do not re-tune thresholds for UX** |
| Analyze API | Ephemeral `bpmDecision` / `bpm` / `bpmReason` / `bpmMessage` | Safest place to expose ranked candidates + hypotheses **now** without migration |
| Finalize | Re-download + re-probe + `resolveCreateBpm` → `beats.bpm` → asset READY | Server-side allowlist enforcement belongs here |
| User / admin create forms | Free BPM number input; `bpmManualOverride` on edit/MANUAL | Must become candidate buttons / constrained select — **no free text** |
| MASTER replace | READY without BPM path | Out of scope for uncertainty UX |
| Admin metadata edit | Can set any in-range BPM without re-probe | Separate privilege path — must not be confused with detector UX |
| Publish gate | Active MASTER READY only — not BPM quality | Uncertainty blocks **finalize/READY**, not publish semantics |

**Safest insertion point for controlled override (no DB yet):**

```text
analyze → TransportAnalyzeResult (+ candidates / hypotheses / confidence_class)
     ↓
UI constrained choice (buttons / select / optional narrow slider)
     ↓
finalize(clientBpm, selectionMode) → re-probe → allowlist check → beats.bpm
```

---

## 1. BPM UNCERTAINTY DESIGN

### 1.1 Product intent

| Confidence | System behavior | User role |
|------------|-----------------|-----------|
| **HIGH** | Auto-decide; show detected BPM as confirmed | Passive (optional “change among system options” only if we expose secondary candidates) |
| **MEDIUM** | Prefer top candidate; allow pick among ranked candidates | Corrector within system set |
| **LOW** | Do not auto-decide; force pick among ranked candidates | Required chooser within system set |
| **CONFLICT** | Do not invent a continuum; present disjoint hypotheses | Must pick one hypothesis |

User is **never** the BPM inventor for detector-available formats (WAV/MP3).

### 1.2 Logical data model (A)

Logical fields the product must understand. **Persistence = phased** (see §7).

| Field | Type | Meaning |
|-------|------|---------|
| `detected_bpm` | `number \| null` | Winner BPM if AUTO; else top hypothesis / null if unavailable |
| `detected_bpm_candidates` | `Candidate[]` | Ranked, de-duplicated integer BPMs from **this probe** |
| `detected_bpm_range` | `Range \| null` | **Only** when a contiguous near-tempo family exists; else `null` |
| `detected_hypotheses` | `Hypothesis[]` | Disjoint tempo families (e.g. `{92}` vs `{138}`) |
| `detected_confidence` | `HIGH \| MEDIUM \| LOW \| CONFLICT \| UNAVAILABLE` | UX class derived from resolver — **not** calibrated accuracy |
| `detection_reason` | string enum | Existing reason codes (`MULTI_SIGNAL_AGREED`, `ESTIMATOR_HARD_CONFLICT`, …) |
| `user_selected_bpm` | `number \| null` | Set only when user actively chose among system options |
| `bpm_source` | enum below | Provenance of final `beats.bpm` |
| `beats.bpm` | integer 1–300 | Final persisted value (unchanged column) |

**`bpm_source` (minimum set):**

| Value | When |
|-------|------|
| `AUTO_DETECTED` | HIGH auto path; client accepts / submits detected BPM without choice UI |
| `USER_SELECTED_CANDIDATE` | User picked an explicit ranked candidate / hypothesis |
| `USER_SELECTED_WITHIN_SYSTEM_RANGE` | User picked an integer inside a **contiguous** system range (rare; see §3) |

**Explicitly out of V1 product path:**

- `USER_FREE_ENTRY` — **forbidden** for detector-available uploads  
- VocalRemover / external reference as source  

### 1.3 Candidate type

```ts
type BpmCandidate = {
  bpm: number;           // integer
  rank: number;          // 1 = top
  score: number;         // internal composite (not shown as %)
  clusterId: string;     // hypothesis / near-tempo family id
  role: "TOP" | "RUNNER" | "SUPPORTING" | "HALF_DOUBLE_ALT";
};
```

### 1.4 Hypothesis type (disjoint)

```ts
type BpmHypothesis = {
  id: string;
  representativeBpm: number;
  members: number[];     // near-tempo cluster members, |Δ|≤ BPM_NEAR_TEMPO_TOL
  range: { min: number; max: number } | null;
  // range only if members form a contiguous integer span after clustering
};
```

**Rule:** if two representatives are **not** near-tempo and **not** half/double of each other → **separate hypotheses**. Never emit `range = {min:92, max:138}`.

---

## 2. Proposed state machine

```text
                    ┌──────────────┐
                    │  UPLOADED    │
                    │ PENDING_UPLOAD│
                    └──────┬───────┘
                           │ analyze (server)
                           ▼
                 ┌─────────────────────┐
                 │  BPM_PROBED         │
                 │  (ephemeral result) │
                 └─────────┬───────────┘
           ┌───────────────┼────────────────┬──────────────────┐
           ▼               ▼                ▼                  ▼
      CONF_HIGH      CONF_MEDIUM       CONF_LOW           CONF_CONFLICT
      (AUTO)         (assist)          (force pick)       (force pick hyp.)
           │               │                │                  │
           │         ┌─────┴──────┐         │                  │
           │         ▼            ▼         ▼                  ▼
           │   ACCEPT_TOP   PICK_CANDIDATE  PICK_CANDIDATE  PICK_HYPOTHESIS
           │         │            │         │                  │
           └─────────┴────────────┴─────────┴──────────────────┘
                           │
                           ▼
                 ┌─────────────────────┐
                 │ BPM_RESOLVED_CLIENT │  (selection + mode)
                 └─────────┬───────────┘
                           │ finalize (server re-probe)
                           ▼
                 ┌─────────────────────┐
                 │ SERVER_ALLOWLIST    │
                 │ CHECK               │
                 └─────────┬───────────┘
                    pass ──┤── fail → reject (no READY)
                           ▼
                 ┌─────────────────────┐
                 │ beats.bpm WRITTEN   │
                 │ bpm_source set*     │
                 │ asset → READY       │
                 └─────────────────────┘

* Phase 1 may keep bpm_source ephemeral/log-only until Owner GO for columns.
```

**Hard gate:** no transition to MASTER `READY` on create finalize without allowlisted integer BPM.

**Unsupported decode (`UNAVAILABLE`):** see §8 — Owner decision required; do not silently reopen free entry.

---

## 3. Candidate / range algorithm (C, D, E)

**Do not change resolver weights/thresholds.** Derive UX sets from existing probe outputs:

- estimator A/B tops + candidates  
- near-tempo clusters (`BPM_NEAR_TEMPO_TOL = 1`)  
- half/double pairs  
- multi-signal scores / top / runner / margin / reason  

### 3.1 Build candidate set

```text
INPUT: canonical resolution + evidence candidate bag + ensemble helpers
STEPS:
  1. Collect integer BPMs in detector window (60–200 probe; persist still 1–300).
  2. Cluster |Δ| ≤ 1 → one member set; representative = existing cluster NearTempo rule.
  3. Collapse half/double into linked alts (role HALF_DOUBLE_ALT), keep BOTH visible if still ambiguous.
  4. Rank by multi-signal composite (existing scores). Cap N = 6 (align MAX_EVIDENCE_CANDIDATES).
  5. Always include: top, runner (if distinct), hard-conflict opposing top when reason = ESTIMATOR_HARD_CONFLICT.
  6. Drop values not produced by this file's analysis (no global ±5 pad, no VocalRemover inject).
```

### 3.2 Build range (contiguous only)

Emit `detected_bpm_range` **only if**:

1. Exactly **one** hypothesis remains after clustering, **or** user is choosing inside one selected hypothesis; **and**
2. Members form a contiguous integer span of length ≤ `BPM_NEAR_TEMPO_TOL + 1` (practically `{k}` or `{k,k+1}`); **and**
3. Ranking does **not** claim equal probability across a wider band.

| Example | Range? | UI |
|---------|--------|-----|
| 91 / 92 | optional `{91,92}` or single clustered rep 92 + supporting 91 | near-tempo buttons |
| 92 / 95 | **NO** range 92–95 | two ranked candidates |
| 92 / 138 | **NO** range | two hypotheses / conflict UI |
| AUTO 88 alone | null or singleton | confirm / optional secondary if present |

**Forbidden:** fabricating `min=top, max=runner` across hard-conflict gap.

### 3.3 Disjoint hypotheses (E)

```text
IF |repA − repB| > BPM_HARD_ESTIMATOR_DELTA
   AND not near-tempo
   AND not half/double:
     → confidence_class = CONFLICT
     → hypotheses = [H(repA), H(repB)]
     → range = null
     → UI = "system sees two tempos" + pick one
```

Half/double (92 vs 184, 70 vs 140): present as **related hypotheses / alts**, not a continuous slider across the octave.

### 3.4 Confidence class mapping (proposal — mapping only, no threshold retune)

| Class | Derivation (from existing signals) |
|-------|-------------------------------------|
| **HIGH** | `AUTO_SUGGEST` + `MULTI_SIGNAL_AGREED` (or equivalent AUTO success) |
| **MEDIUM** | MANUAL but margin close / single cluster / no hard estimator conflict — ranked candidates clear |
| **LOW** | MANUAL `INSUFFICIENT_MARGIN` / weak agreement; still ≥2 ranked candidates |
| **CONFLICT** | `ESTIMATOR_HARD_CONFLICT` / `TRUE_CONFLICT` / `UNRESOLVED_PAIR` with disjoint reps |
| **UNAVAILABLE** | unsupported format / decode failure |

Exact mapping table to be locked in implementation PR against reason codes — **without** lowering AUTO gates.

---

## 4. Resolver contract (B)

Resolver stays the SSOT for analysis. New **presentation contract** wraps it:

```ts
type BpmUncertaintyEnvelope = {
  decision: "AUTO_SUGGEST" | "MANUAL_REQUIRED" | "UNAVAILABLE";
  confidenceClass: "HIGH" | "MEDIUM" | "LOW" | "CONFLICT" | "UNAVAILABLE";
  reason: string;
  detectedBpm: number | null;
  candidates: BpmCandidate[];
  hypotheses: BpmHypothesis[];
  range: { min: number; max: number } | null;
  allowlist: number[];           // sorted unique integers legal for finalize
  message: string;                // user-facing PL, no fake certainty
};
```

`allowlist` = union of:

- all candidate bpms  
- all hypothesis member bpms  
- all integers in `range` **iff** range is non-null  

Server finalize must recompute the same envelope from re-probe and test `clientBpm ∈ allowlist`.

---

## 5. Server-side enforcement (G, H, I)

### 5.1 Replace create policy

**Current (unsafe for product rule):**

```text
override=true → accept any 1–300
MANUAL + no suggest → accept any 1–300
```

**Target:**

```text
re-probe → build BpmUncertaintyEnvelope
IF confidenceClass == HIGH AND clientBpm == detectedBpm AND selectionMode == AUTO:
  → ok, bpm_source = AUTO_DETECTED
ELSE IF clientBpm ∈ allowlist AND selectionMode == CANDIDATE:
  → ok, bpm_source = USER_SELECTED_CANDIDATE
ELSE IF range != null AND clientBpm ∈ [range.min, range.max] AND selectionMode == RANGE:
  → ok, bpm_source = USER_SELECTED_WITHIN_SYSTEM_RANGE
ELSE:
  → REJECT (no beats.bpm write, no READY)
```

No boolean `bpmManualOverride` that bypasses allowlist. Replace with typed `selectionMode`.

### 5.2 Why frontend is insufficient

| Attack / accident | Frontend | Server allowlist |
|-------------------|----------|------------------|
| DevTools POST bpm=150 | bypassed | rejected |
| Stale analyze vs new file | possible | re-probe binds allowlist to bytes |
| Replay old candidates | possible | re-probe regenerates set |
| Admin tooling curl | N/A | same policy on finalize |

### 5.3 Audit trail (I)

Minimum (Phase 1, no DB columns):

- Server log / structured finalize result: `bpm_source`, `detected_bpm`, `allowlist`, `clientBpm`, `reason`, `confidenceClass`  
- Optional: write to existing audit/event channel if present — **do not invent telemetry stack**

Phase 2 (Owner GO + migration): persist `bpm_source` (+ optional JSON detection snapshot) beside `beats.bpm`.

### 5.4 Admin metadata edit

Treat as **privileged out-of-band** path, not user upload UX. Design recommendation:

- Keep separate from create-finalize allowlist **or** require explicit `ADMIN_METADATA_OVERRIDE` source with audit  
- Never label admin-edited BPM as `AUTO_DETECTED`

---

## 6. UX states (F)

| State | UI | Input control | Copy principle |
|-------|-----|---------------|----------------|
| **HIGH** | Show BPM as detected | No free field; optional “Inne opcje systemu” if supporting candidates exist | “Wykryto automatycznie” — no accuracy claims |
| **MEDIUM** | Preselect top; show ranked chips/buttons | Buttons / select of allowlist only | “Wybierz tempo — propozycje systemu” |
| **LOW** | No pre-accept; force select | Buttons / select | “Nie udało się jednoznacznie ustalić — wybierz spośród wykrytych” |
| **CONFLICT** | Two (or few) hypothesis cards | Pick hypothesis A **or** B — **not** a wide slider | “System widzi dwie możliwe tempa” |
| **UNAVAILABLE** | Block free invent | Owner policy (§8) | Format / decode message |

**Controls allowed:** buttons, select, slider **only** when `range` is non-null and narrow.  
**Controls forbidden:** unrestricted number/text input for detector-available path.

**Blocking:** Finalize / READY disabled until selection valid for MEDIUM/LOW/CONFLICT.

---

## 7. Test matrix (J)

| ID | Scenario | Expect |
|----|----------|--------|
| T01 | HIGH AUTO 88; client 88 AUTO | accept · `AUTO_DETECTED` |
| T02 | HIGH AUTO 88; client 150 | reject |
| T03 | HIGH AUTO 88; client 108 (runner) via CANDIDATE | accept iff 108 ∈ allowlist · `USER_SELECTED_CANDIDATE` |
| T04 | CONFLICT 92 vs 138; client 92 | accept |
| T05 | CONFLICT 92 vs 138; client 115 (between) | **reject** |
| T06 | CONFLICT 92 vs 138; client range pretend 92–138 | **reject** (no such range) |
| T07 | Near-tempo 91/92 clustered; client 91 or 92 | accept if both in allowlist |
| T08 | Candidates 92 & 95; client 93 | **reject** (no continuous fill) |
| T09 | Candidates 92 & 95; client 95 | accept · candidate |
| T10 | MANUAL insufficient margin; empty selection | reject finalize |
| T11 | Stale client allowlist vs re-probe different bytes | reject if bpm ∉ new allowlist |
| T12 | `selectionMode=RANGE` but envelope.range=null | reject |
| T13 | Non-int / 0 / 301 | reject |
| T14 | Unsupported format UNAVAILABLE | per Owner policy (TBD) |
| T15 | MASTER replace path | BPM unchanged (regression) |
| T16 | Publish without READY | unchanged deny |
| T17 | DevTools override flag revival | no bypass if flag removed |
| T18 | Half/double 70/140 presented as alts; client 105 | reject |

Fixture seed: existing 17 local MP3 probe set + synthetic fixtures — **docs only until implementation**.

---

## 8. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Closing free entry leaves **UNAVAILABLE** (FLAC/AAC) with no candidates | High | Owner decision: deny auto-BPM formats only; or admin-only privileged override with audit; or force WAV/MP3 for create |
| Allowlist too small → user stuck | Med | Always include hard-conflict opposing tops; keep half/double alts; do **not** widen by inventing values |
| Allowlist too wide → product rule weakens | High | Cap candidates; forbid cross-hypothesis ranges; no global ±5 |
| Re-probe nondeterminism → reject valid UI choice | Med | Same bytes + deterministic pipeline; if rare flake, soft-retry once with identical code path |
| Admin metadata edit remains free-BPM backdoor | Med | Separate source + audit; document as privileged |
| Persisting confidence as truth | Med | Keep classes internal UX; ACCURACY NOT CERTIFIED |
| VocalRemover creep into allowlist | High | Explicit forbid in contract tests |
| Scope creep into resolver retune | High | UX derives from freeze; thresholds unchanged |
| Phase 1 without DB columns loses provenance | Low | Structured logs; Phase 2 migration GO |

---

## 9. Next-phase change list (implementation — not this STOP)

Ordered; each needs Owner GO:

1. **Design freeze amendment** — supersede “free manual BPM entry” / `override=true` any-1–300 for user+admin **create** paths  
2. **`BpmUncertaintyEnvelope` builder** — pure function over existing probe (no weight/threshold change)  
3. **Analyze transport** — return candidates / hypotheses / range / confidenceClass / allowlist  
4. **`resolveCreateBpm` → allowlist policy** — kill free override for detector-available  
5. **User + admin create UI** — buttons/select/conflict cards; remove free BPM text for WAV/MP3  
6. **Unit tests** — matrix T01–T18  
7. **Owner decision on UNAVAILABLE formats**  
8. **Optional migration** — `bpm_source` (+ optional detection JSON) — **separate GO**  
9. **Docs** — update `BPM_AUTO_DETECTION.md` + freeze addendum  
10. **Explicit non-work:** VocalRemover · import 17 · MASTER replace BPM · publish gate changes · threshold retune  

---

## 10. Alignment with Owner 17-file matrix (illustrative only)

| Pattern from matrix | Designed UX |
|---------------------|-------------|
| AUTO 88/88/92/95 | HIGH → auto · optional secondary only if in allowlist |
| MANUAL hard conflict 92 vs 138 / 161 | CONFLICT → pick hypothesis · no 92–138 slider |
| MANUAL 92 vs 95/103/115/116/120/123 | Ranked candidates · no fake continuum |
| Near-tempo 91≈92 | Cluster / optional tiny range · not free 1–300 |
| External 88 on `Bit komitywa2 by DTT` while tops 125/117 | **Do not** inject 88 into allowlist from VocalRemover |

---

## 11. STOP checklist

```text
DESIGN: COMPLETE (review only)
IMPLEMENTATION: NO
RESOLVER THRESHOLDS: UNCHANGED
DB MUTATION: 0
STORAGE MUTATION: 0
AUTH/RLS MUTATION: 0
MIGRATION: NO
IMPORT: NO
PRODUCTION MUTATIONS: 0
COMMIT: NO
PUSH: NO
DEPLOY: NO
VOCALREMOVER: NOT INTEGRATED
```

**Owner next action:** approve/reject this design (especially §8 UNAVAILABLE policy + Phase 2 persistence), then GO implementation phase.
