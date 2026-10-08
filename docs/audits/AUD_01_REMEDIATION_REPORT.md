# AUD-01 — REMEDIATION REPORT

**Date:** 2026-10-08  
**Trigger:** DIFF / ARCHITECTURE REVIEW → BLOCKED  
**Commit / push:** **NOT PERFORMED**

---

## Critical fix

| Item | Result |
|------|--------|
| atomic / fail-closed strategy | App-layer **fail-closed compensating restore** (no new txn/RPC migration). Snapshot `previousBeatId` + `previousTempo` + full prior `BEAT_REF` rows **before** mutate; on any BEAT_REF delete/insert/verify failure → restore project beat binding + prior clips, then rethrow |
| beat_id consistency | Success → `studio_projects.beat_id = NEW`. Failure after update → restored to prior value |
| BEAT_REF consistency | Success → matching `BEAT_REF` verified (`source_beat_id === NEW`). Failure → prior clips restored |
| stale BEAT_REF guard | `beatRefMatchesProjectSsot` + `resolvePrimaryBeatRef` ignore clips whose `sourceBeatId ≠ projectBeatId` (defense-in-depth; persistence still reseeds) |
| failure rollback/fail-closed | `restorePriorBinding()`; if rollback itself fails, error concatenates primary + rollback messages |
| retry | Re-attach same/new beat re-snapshots current rows; safe reseed |

**SSOT unchanged:** `studio_projects.beat_id` remains authoritative. BEAT_REF remains derived.

---

## Microphone

| Item | Result |
|------|--------|
| tester stream | Held in IDLE/READY; blocked when arming / recording / finalize |
| recorder stream | Started only after tester stopped |
| start order | `captureArmingRef=true` → `setCaptureArming` → `stopTesterStream()` → `recorder.start()` → `START_RECORDING` |
| cleanup | Arming ref checked after `acquireMicStream`; in-flight acquires discarded if arming |
| dual-stream window | **Closed** (sync ref + state block + stop before start) |

Meter path unchanged: `useMicAnalyser` + `BrdInputMonitor` · no destination / Master / Track Peak.

---

## Lint

| Item | Result |
|------|--------|
| previous | unused `_id` failed `--max-warnings 0` |
| current | **PASS** (`eslint … --max-warnings 0` exit 0) |

---

## Tests

Commands + results:

```text
npm test -- \
  src/lib/studio/aud-01-studio-audio-beat.test.ts \
  src/lib/studio/p5-8-devices.test.ts \
  src/lib/studio/pr-v1-architecture-guards.test.ts \
  src/lib/studio/p6-6-1-track-meter.test.ts \
  src/lib/studio/p5-2-beat-transport.test.ts
→ 5 files / 72 tests PASS

npx tsc --noEmit → exit 0

npx eslint <remediation paths> --max-warnings 0 → exit 0
```

| Suite | Result |
|-------|--------|
| AUD-01 | **17 PASS** (incl. fail-closed contracts, SSOT guard, mic order) |
| P5.8 | **14 PASS** |
| architecture | **4 PASS** |
| track meter | **16 PASS** |
| P5.2 beat transport | **21 PASS** (incl. stale BEAT_REF) |
| typecheck | **PASS** |
| lint | **PASS** |

---

## Architecture

| Item | Status |
|------|--------|
| StudioAudioEngine | 1 class / 1 per editor |
| Studio AudioContext | 1 product context |
| duplicate engine | **NO** |
| duplicate Studio context | **NO** |
| mic analyser short-lived context | unchanged P5.8 exception |

---

## Changed files (this remediation)

- `src/lib/studio/studio-service.ts` — fail-closed attach
- `src/lib/studio/studio-beat-audio.ts` — SSOT BEAT_REF guard
- `src/components/studio/studio-recording-panel.tsx` — tester/recorder order
- `src/lib/studio/aud-01-studio-audio-beat.test.ts` — expanded contracts + unit guards
- `src/lib/studio/p5-2-beat-transport.test.ts` — stale BEAT_REF case
- `docs/audits/AUD_01_REMEDIATION_REPORT.md` — this report

---

## WIP

| Item | Status |
|------|--------|
| `recording-eligibility-service.ts` | **untouched by remediation** (still pre-existing dirty WIP — exclude from AUD-01 commit) |
| other WIP (~170+ paths) | **untouched** |
| commit/push/stash/reset/clean | **none** |

---

## Remaining findings

1. Fail-closed is **compensating** (not a single Postgres transaction). Extremely rare: if restore itself fails after a partial mutate, error is explicit; true DB txn RPC remains a future hardening option.
2. Downloads picker can still list beats that later fail attach eligibility (pre-existing LOW UX).
3. `recording-eligibility-service.ts` WIP must stay out of any future AUD-01 commit allowlist.

---

## FINAL BLOCKER CLOSURE (2026-10-08)

| Item | Fix |
|------|-----|
| Engine stale BEAT_REF | `engineDocument.projectBeatId` + filter at editor clip map + `planVoicesAtPlayhead` skips mismatched BEAT_REF |
| Attach verify | re-read `studio_projects.beat_id` + require matching BEAT_REF + reject leftover stale refs |
| Failure-path tests | `aud-01-attach-failclosed.test.ts` cases A–G (success/insert/delete/restore/retry/partial/engine) |

```text
READY FOR FINAL PRE-COMMIT GATE
Commit: NOT PERFORMED
```
