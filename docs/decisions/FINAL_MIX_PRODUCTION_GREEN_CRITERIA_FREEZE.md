# Final Mix Production GREEN — Criteria Freeze (GO-FM-CRITERIA)

**Status:** **CRITERIA FREEZE ACCEPTED** · living **Final Mix Production GREEN** remains **NOT VERIFIED** (closeout = separate GO)  
**Date:** 2026-10-13  
**Unit:** GO-FM-CRITERIA (documentation-only)  
**Living SSOT:** [PROJECT_STATE.md](../PROJECT_STATE.md)  
**Parent freeze:** [STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md](./STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md)  
**Stage J close:** [STAGE_J_FINAL_CLOSURE.md](../audits/STAGE_J_FINAL_CLOSURE.md) · [STAGE_J_CLOSURE_CRITERIA_FREEZE.md](./STAGE_J_CLOSURE_CRITERIA_FREEZE.md)

```text
Final Mix Production GREEN: NOT VERIFIED (criteria frozen · ≠ GREEN yet)
FULL FIXTURE VERIFIED: NOT CONFIRMED (IN for GREEN · not yet PASS)
Stage J: CLOSED
P6.8: NOT STARTED
Contabo always-on: OPEN / NOT VERIFIED · persistent worker disabled/inactive (WAIVE for GREEN)
I.18 tip evidence: MISSING ON CURRENT MAIN (evidence blocker)
I.13F tip evidence: MISSING ON CURRENT MAIN (≠ automatic IN for GREEN)
```

---

## 1. Purpose

Lock the **allowlist** of evidence required to mark **Final Mix Production GREEN**, plus explicit **WAIVE / OUT**, so later closeout cannot invent gates or over-claim Contabo always-on / bit-perfect PCM / P6.8.

This note does **not** declare GREEN. Final living `Final Mix Production GREEN` requires a separate Owner GO + docs closeout after **all IN** rows are PASS under this freeze.

Production probes for empty-session and fixture bytes are **not authorized** by this unit.

---

## 2. IN — required for Final Mix Production GREEN

All of the following must be **PASS** (or **PASS / CLOSED**) with canonical tip evidence. Do **not** re-run historical SUCCEEDED jobs solely to restage history.

| # | Gate | Documented status (tip) | Canonical evidence / PASS criterion |
|---|------|-------------------------|-------------------------------------|
| 1 | **Stage J CLOSED** | **CLOSED** | [STAGE_J_FINAL_CLOSURE.md](../audits/STAGE_J_FINAL_CLOSURE.md) under [GO-SJ-CRITERIA](./STAGE_J_CLOSURE_CRITERIA_FREEZE.md) |
| 2 | **I.45DR** narrow Contabo WAV canary | **PASS** | Living bake freeze / PROJECT_STATE · job `53398f9e-…` · artifact `21d98be2-…` READY · **do not re-run** |
| 3 | **J2** Download AuthZ | **PASS / CLOSED** | [I45EX_J2_DOWNLOAD_AUTHZ_GATE_CLOSEOUT.md](../audits/I45EX_J2_DOWNLOAD_AUTHZ_GATE_CLOSEOUT.md) |
| 4 | **object_key** reject-only (narrow) | **PASS** | [STAGE_J_OBJECT_KEY_REJECT_ONLY_PROBE_CLOSEOUT.md](../audits/STAGE_J_OBJECT_KEY_REJECT_ONLY_PROBE_CLOSEOUT.md) |
| 5 | **P5 / P6** owner download (JSON) | **PASS** | [STAGE_J_P5_P6_OWNER_DOWNLOAD_PROBE_CLOSEOUT.md](../audits/STAGE_J_P5_P6_OWNER_DOWNLOAD_PROBE_CLOSEOUT.md) · JSON only · **≠** WAV bytes · **≠** FULL FIXTURE VERIFIED |
| 6 | **I.18 empty-session production probe** | **NOT VERIFIED** | Separate Owner GO required. **PASS when:** controlled enqueue of empty/inaudible session → job **FAILED** · public/allowlisted `errorCode` / persisted code **`STUDIO_RENDER_EMPTY_SESSION`** · **no** SUCCEEDED/READY silent WAV artifact |
| 7 | **FULL FIXTURE VERIFIED** | **NOT CONFIRMED** | Separate Owner GO required. **PASS when:** bytes obtained via allowed download flow for a real export artifact · `RIFF`/`WAVE` QC · size/coherence check · **no** signed URL / token / cookie / secret retained in docs, logs, or repo |
| 8 | **I.18 evidence integrity on tip** | **MISSING ON CURRENT MAIN** | Canonical report must exist on `origin/main` and align with empty-session criteria. Expected path: `docs/audits/STUDIO_EXPORT_I18_EMPTY_SESSION_INTEGRATION.md` · **blocker until present + consistent** (land/recover via separate GO · **do not** copy from dirty worktree in this unit) |

**Binding limits:**

- P5/P6 PASS does **not** satisfy gate 7.
- Stage J WAIVE of byte-level QC for Stage J close does **not** WAIVE gate 7 for Final Mix GREEN.
- Historical I.45BM/BO WAV smoke and I.45DR canary remain evidence classes; they do **not** auto-set FULL FIXTURE VERIFIED without an explicit gate-7 closeout under this freeze.
- I.13F tip files are **not** an automatic IN row (see §4 / evidence note).

---

## 3. WAIVE — conscious exclusion from Final Mix Production GREEN

| Item | Decision | Must not claim |
|------|----------|----------------|
| Contabo always-on / persistent worker | **WAIVED** as a GREEN requirement · remains **disabled/inactive** · **OPEN / NOT VERIFIED** · needs separate **Ops GO** | Continuous-mode · always-on · “worker production-ready 24/7” |
| Full bit-perfect Live↔Offline PCM parity | **WAIVED** for GREEN · I.14-01 **functional** FX parity acceptance stands · ≠ bit-perfect | Full PCM / bit-identical live↔offline |
| **P6.8** and other independent epics not required by SSOT for Final Mix release | **WAIVED** for GREEN | P6.8 started/closed · unrelated Studio epics GREEN via Final Mix |

---

## 4. OUT — outside this freeze (unchanged independent statuses)

Do **not** mark PASS/CLOSED as a side effect of Final Mix GREEN:

| Item | Living posture |
|------|----------------|
| Full IDOR / download-AuthZ module audit beyond documented J2 | **NOT CLAIMED** |
| Apex redirect e2e | **NOT VERIFIED** |
| Empty-project delete happy path | **NOT TESTED** / **NOT VERIFIED** |
| Formal “Studio migration CLOSED” claim | **≠ CLOSED** (unless a future SSOT explicitly makes it a Final Mix IN — not in this freeze) |

Each OUT item requires its **own** Owner GO and evidence class.

---

## 5. Tip evidence gaps (this freeze — no fabrication)

| Path | Tip status | Role for GREEN |
|------|------------|----------------|
| `docs/audits/STUDIO_EXPORT_I18_EMPTY_SESSION_INTEGRATION.md` | **MISSING ON CURRENT MAIN** | **IN blocker** (gate 8) · also prerequisite integrity for documenting gate 6 |
| `docs/audits/STUDIO_FX_PARITY_I13F_REPORT.md` | **MISSING ON CURRENT MAIN** | Historical tip gap · **≠** automatic IN |
| `docs/audits/STUDIO_FX_PARITY_I13F_EVIDENCE.json` | **MISSING ON CURRENT MAIN** | Historical tip gap · **≠** automatic IN |

**Future GO (not this unit):** safe recovery/land of I.18 tip evidence without dirty-worktree sync, reset, or inventing content from code.

Do **not** copy, stage, or rewrite dirty-local copies of I.18/I.13F in this criteria freeze.

---

## 6. When Final Mix may be marked GREEN (later GO)

Only after a separate Owner GO that:

1. Confirms all **IN** rows PASS under this freeze (including tip I.18 evidence + prod empty-session + FULL FIXTURE VERIFIED);  
2. Records all **WAIVE** rows explicitly;  
3. Leaves all **OUT** statuses unchanged;  
4. Does **not** declare Contabo always-on, bit-perfect PCM, or P6.8 as side effects.

---

## 7. Explicit non-actions (this criteria freeze)

- No production HTTP · no empty-session prod probe · no WAV download · no signed URL open  
- No Contabo / worker / SQL / Supabase / Storage writes · no P6.8  
- No application code · no Sacred WIP · no dirty worktree sync  
- **No** `Final Mix Production GREEN` living claim  

---

## 8. Stop line

```text
GO-FM-CRITERIA: ACCEPTED
Final Mix Production GREEN: NOT VERIFIED
IN open blockers: I.18 tip evidence MISSING · empty-session prod NOT VERIFIED · FULL FIXTURE VERIFIED NOT CONFIRMED
IN already satisfied (historical): Stage J CLOSED · I.45DR · J2 · object_key · P5/P6 JSON
WAIVE: Contabo always-on · bit-perfect PCM · P6.8
OUT: full IDOR · apex · empty-project delete · Studio migration CLOSED claim
NEXT: Owner GO — I.18 tip recovery (docs) · then separate GOs for empty-session prod + fixture bytes · ≠ GREEN yet
```
