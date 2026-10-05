# BPM Quality V2 — Implementation Report

**Date:** 2026-10-05  
**Commit:** `feat(bpm): separate decision policy from scoring`  
**Design:** `docs/architecture/BPM_QUALITY_V2_DESIGN.md`  
**Evidence:** `docs/audits/BPM_QUALITY_V2_IMPLEMENTATION_EVIDENCE.json`

```text
MUTATIONS ON EXISTING 17 PRODUCTION BEATS = 0
NO DB MIGRATION · NO STORAGE MUTATION · NO VOCALREMOVER RUNTIME
```

---

## 1. Implementation scope

| Area | Change |
|------|--------|
| Decision policy | DIMS_DISAGREE + RATIO_1_5 veto before AUTO in `resolveCanonicalBpm` |
| Envelope | `requiresExplicitSelection`; CONFLICT/LOW/MEDIUM cannot silent-persist |
| Finalize | `resolveCreateBpmWithEnvelope` rejects missing/`AUTO` mode when required |
| Import | Batch path blocks non-HIGH → `BLOCKED_BPM_SELECTION_REQUIRED` |
| Candidates | `RATIO_1_5_ALT` role when both sides already evidenced |
| UX | CONFLICT headline + LOW no preferred default |
| Tests | New `bpm-quality-v2.test.ts` + regression updates |

**Not changed:** production `beats.bpm`, titles, durations, assets, Storage, Auth/RLS, migrations, VocalRemover.

---

## 2. Changed files

- `src/lib/beats/bpm-resolve.ts`
- `src/lib/beats/bpm-ensemble.ts`
- `src/lib/beats/audio-bpm.ts`
- `src/lib/beats/bpm-uncertainty.ts`
- `src/lib/beats/bpm-uncertainty-ui.ts`
- `scripts/real-beats-import.ts`
- `src/lib/beats/bpm-quality-v2.test.ts` *(new)*
- `src/lib/beats/bpm-resolve.test.ts`
- `src/lib/beats/bpm-uncertainty.test.ts`
- `src/lib/beats/bpm-uncertainty-ui.test.ts`
- `docs/audits/BPM_QUALITY_V2_IMPLEMENTATION.md`
- `docs/audits/BPM_QUALITY_V2_IMPLEMENTATION_EVIDENCE.json`

---

## 3. Behavior contract (shipped)

```text
SCORING → ranks hypotheses (composite)
DECISION → AUTO_SUGGEST | REQUIRE_SELECTION | UNAVAILABLE

HIGH + AUTO_SUGGEST → may persist detectedBpm as AUTO_DETECTED
CONFLICT / LOW / MEDIUM → requiresExplicitSelection
  → finalize needs selectionMode CANDIDATE|RANGE
  → import without Owner map → BLOCKED_BPM_SELECTION_REQUIRED
detectedBpm under CONFLICT = ranking hint only
```

---

## 4. Tests

| Suite | Result |
|-------|--------|
| `bpm-quality-v2.test.ts` | PASS (18) |
| `bpm-uncertainty.test.ts` | PASS (21) |
| `bpm-uncertainty-ui.test.ts` | PASS (13) |
| `bpm-resolve.test.ts` | PASS (33) |
| `bpm-ensemble.test.ts` | PASS (20) |
| `audio-bpm.test.ts` | PASS (4) |
| `bpm-audit-contracts.test.ts` | PASS (5) |
| `audio-transport.test.ts` | PASS (6) |
| `user-errors.test.ts` | PASS (21) |
| **Total related** | **141 PASS / 0 FAIL** |

Pre-existing local `tsc` failures in unrelated `scripts/*` audit tools remain (not introduced by V2).

Lint on changed files: 0 errors (1 pre-existing warning in import script unused var).

---

## 5. Security

| Control | Status |
|---------|--------|
| NO FREE BPM | Kept |
| Server allowlist | Kept |
| Finalize re-probe | Kept |
| Stale / off-allowlist reject | Kept |
| CONFLICT silent top | **Closed** |
| Client AUTO under CONFLICT | **Rejected** |

---

## 6. Production deploy / verify

*(filled after deploy)*

---

## 7. Existing 17 BPM

**Unchanged by this release** — code-only policy for new analyze/finalize/import paths.

---

## 8. Final verdict

*(filled after production verify)*
