# P5.6 Studio Architecture Audit

**Status:** AUDIT COMPLETE — WAITING FOR ARCHITECT DESIGN FREEZE  
**Date:** 2026-10-06  
**Type:** Architecture audit only — **NO IMPLEMENTATION**  
**Production baseline:** P5.5 PRODUCTION VERIFIED — GREEN @ `7f28dae0bb556208a271bc3be38c2d083c5e763e`  
**Production URL:** https://www.bitrymdym.pl  
**Prior SSOT:** [P5_STUDIO_ARCHITECTURE_AUDIT.md](./P5_STUDIO_ARCHITECTURE_AUDIT.md) · [P5_STUDIO_DESIGN_FREEZE.md](../decisions/P5_STUDIO_DESIGN_FREEZE.md)

```text
P5.1 … P5.5 = PRODUCTION VERIFIED — GREEN
P5.6        = AUDIT ONLY (this document)
```

---

## 1. Executive Summary

P5.5 already delivered the fundamental Studio path:

```text
mic → P3/P4 Take pipeline → Take READY → placeReadyTakeAsStudioClip → Clip → StudioTransport
```

The data model **already supports multiple Takes and multiple TAKE Clips on one Track** without a new table. There is **no uniqueness** on `(track_id, source_take_id)` and **no anti-overlap** rule for clips.

The architectural gap for P5.6 is **workflow**, not storage:

| Gap | Today (P5.5) | Needed next |
|-----|----------------|-------------|
| After READY | Auto-place Clip immediately | Explicit Keep / Discard / Record again |
| Retake | New Take + new Clip (works) but UX is “Nagraj kolejne” only | Named retake flow without overwriting sources |
| Existing Takes | `/account/takes` only | Place READY Take onto Studio timeline |
| Overlap / versions | Allowed by DB; no product UX | Compatible with future comping; no comping in P5.6 |

**Verdict:** P5.6 is ready for Design Freeze as a **small Studio Take Workflow** unit on top of existing Take/Clip contracts. No second recording backend. Prefer **NO MIGRATION**.

---

## 2. Current Baseline

| Item | Value |
|------|--------|
| Production | https://www.bitrymdym.pl |
| SHA | `7f28dae0bb556208a271bc3be38c2d083c5e763e` |
| HEAD / origin/main | same SHA |
| P5.5 | PRODUCTION VERIFIED — GREEN (real mic → READY → Clip → playback → mobile → security) |
| P5.1–P5.4 | PRODUCTION VERIFIED — GREEN |

**Doc vs code discrepancy (must resolve in Design Freeze naming only):**

| Source | Labels “Project recording + Take→Clip” as |
|--------|-------------------------------------------|
| `P5_STUDIO_ARCHITECTURE_AUDIT.md` §37 | **P5.6** |
| `P5_STUDIO_DESIGN_FREEZE.md` §16 + code/tests | **P5.5** |

**SSOT for numbering going forward:** freeze + shipped code win. That unit is **closed as P5.5**. This audit defines the **next** unit as **P5.6 = Studio Take Workflow** (retake / place existing / preview gate). Audit §37 “P5.5 Devices + metronome” remains **unshipped** and stays **OUT of P5.6** (defer to a later P5 unit or P6 prep).

---

## 3. Current Recording Architecture

```text
StudioRecordingPanel
  → POST /api/takes/eligibility          (P4 SSOT)
  → TakeMediaRecorder                    (P3/P4)
  → uploadTakeRecordingBlob
       → /api/takes/session
       → signed PUT take-audio
       → /api/takes/finalize             → Take READY
  → POST /api/studio/.../record/place
       → placeReadyTakeAsStudioClipFor
       → addStudioClipFor                → studio_clips TAKE
  → StudioTransport (BEAT_REF + TAKE preview layers)
```

Supporting APIs:

| API | Role |
|-----|------|
| `GET …/record/context` | Resolve `project.beatId` (auth + ownership). Scratch project without beat → blocked. |
| `POST …/record/place` | Place READY owned Take at `timelineStartMs`. Rejects client `ownerId` / `objectKey`. |

**Session model:** no `recording_sessions` table. Session = `takes` row `PENDING_UPLOAD` claimed by RPC (`claim_take_recording_session`).

---

## 4. Take Model

| Concern | Fact (code / migration) |
|---------|-------------------------|
| Entity | `public.takes` |
| Status | `PENDING_UPLOAD` → `READY` / `FAILED`; TTL → `EXPIRED`; user delete → `DELETED` |
| Ownership | XOR `owner_id` **or** `anonymous_token_hash` |
| Storage | Private `take-audio` + unique `(storage_bucket, object_key)` |
| Title | Optional `takes.title` (P4, ≤120). Display via `displayTakeTitle` |
| Caps | Sample Policy `maxActiveReady` / daily sessions / max duration — global, not per-track |
| Multiple READY | **Allowed** (no unique on owner+beat for READY) |
| Replace | Explicit `replaces_take_id` (P2) — marketplace QT path; Studio place does **not** replace Takes |

**Rule frozen:** Take bytes and READY payload are **immutable sources**. Timeline never edits Take files.

---

## 5. Clip Model

| Concern | Fact |
|---------|------|
| Entity | `public.studio_clips` |
| Source XOR | Exactly one of `source_take_id` / `source_beat_id` / `source_artifact_id` |
| TAKE FK | `source_take_id` → takes **ON DELETE SET NULL** |
| Uniqueness on take | **None** (index `studio_clips_take_idx` non-unique) |
| Placement checks | Integer ms, duration ≥ 1, end ≤ `timeline_length_ms` — **no anti-overlap** |
| Delete Clip | Hard-delete clip row only; Take + storage retained |

**Answers (required):**

1. **One Take → many Clips?** YES (DB + API allow).  
2. **Many Takes → Clips on one Track?** YES.  
3. **One Clip → one Take?** YES (XOR source).  
4. **Take READY without Clip?** YES (and already happens if place fails after finalize).  
5. **Delete Clip keeps Takes?** YES (by contract and code).  
6. **FK/constraints support this?** YES — no migration required for multi-take / multi-clip.

---

## 6. Track Model

| Concern | Fact |
|---------|------|
| Types | `VOCAL`, `BEAT`, `SAMPLE`, `SCRATCH`, `INSTRUMENT`, `GUITAR`, `FX`, `BUS`, `OTHER` |
| Seed | Create project → BEAT + VOCAL (`record_armed` on VOCAL) |
| Recording UI | Prefers non-`BEAT`; not VOCAL-only hardcode |
| `record_armed` | App enforces one armed track per project; **not** a DB unique |
| Multi-track future | Enum already open; core clip ops type-agnostic |

P5.6 must not introduce `VOCAL_TRACK_ONLY` or type-switch recording backends.

---

## 7. Multiple Takes Analysis

### Supported today

```text
Track VOCAL
  Clip(Take1) @ 0ms
  Clip(Take2) @ 5000ms
  Clip(Take1) @ 20000ms   ← same Take reused
```

All valid under current schema and `addStudioClipFor`.

### Required changes for product multi-take

| Layer | Change |
|-------|--------|
| DB | **None** for multi-take storage |
| API | Reuse `place`; optional list endpoint scoped to Studio (or reuse `listOwnTakes`) |
| UI | Take list / retake / preview / place — **P5.6 scope** |
| Caps | Continue Sample Policy — Studio must not invent parallel limits |

### Risks

| Risk | Severity | Note |
|------|----------|------|
| Auto-place always creates Clip | Medium | User cannot “record then decide” without deleting Clip |
| Place-fail orphan READY Take | Medium | Message exists; no Studio recovery UI |
| Overlapping Clips playback | Medium | StudioTransport picks one TAKE under playhead; stack/comping undefined |
| Cap exhaustion mid-retake | Medium | Existing REPLACE_REQUIRED / eligibility — must surface in Studio PL |

---

## 8. Retake Workflow

### Recommended model (SOURCE IMMUTABILITY)

```text
Record again
  → NEW Take (never overwrite Take A)
  → optional NEW Clip at playhead
  → previous Take remains READY
  → previous Clip remains unless user deletes Clip only
```

**Do not:**

- mutate Take A bytes,
- reuse same `object_key`,
- “update in place” Clip.source_take_id without explicit product action,
- delete previous Take as side effect of retake.

**Clip workflow options (Design Freeze must pick one):**

| Option | Behavior | Recommendation |
|--------|----------|----------------|
| **A. Additive** | Each Keep places a new Clip; overlaps allowed | **Default for P5.6** — simplest, matches DB |
| **B. Replace Clip** | Delete previous Clip (not Take), place new Clip | Allowed as explicit user action with confirm |
| **C. Swap source** | PATCH Clip `source_take_id` to new Take | Defer — needs AuthZ + immutability review |

P5.6 MUST implement **A**. MAY specify **B** as optional “Zastąp klip na playheadzie” using existing DELETE Clip + place (no Take delete).

---

## 9. Take Management

Existing product surface:

- `/account/takes` (“Moje nagrania”) — list, preview, title, delete, download  
- `/studio/recordings` → redirects to `/account/takes`

**P5.6 recommendation:** Studio-side **Take browser / panel** (not a new entity):

| Capability | P5.6 | Mechanism |
|------------|------|-----------|
| List recent own READY Takes | MUST | Reuse `listOwnTakes` (filter by project beat when present) |
| Preview | MUST | `/api/takes/preview` |
| Place on timeline at playhead | MUST | `placeReadyTakeAsStudioClip` |
| Edit title | SHOULD | Existing `/api/takes/title` |
| Delete Take | SHOULD | Existing delete + confirm (clips SET NULL) |
| Preferred / active flag | OUT | UI-only selection; no DB column |

**Active Take:** UI/runtime selection only (`selectedTakeId` in Studio panel). **Not** project/Track durable state in P5.6.

---

## 10. Recording Lifecycle

```text
idle → preparing → ready → recording → finalizing → READY_TAKE
                                         ↘ error / cancelled
```

Reuse `reduceRecordingUi` (P3/P4). Do not invent a second Studio state machine.

| Event | Expected cleanup |
|-------|------------------|
| Cancel before session | No Take |
| Cancel after MediaRecorder start, before session | No Take |
| Cancel after session claim | PENDING may exist → janitor / one-pending guard |
| Finalize success + place fail | READY Take retained (orphan Clip) — P5.6 MUST add recovery UX |
| Discard Take | Existing soft-delete + storage best-effort |

---

## 11. Storage Lifecycle

```text
claim session → object_key server-side → PUT → finalize probe → READY
cancel / fail / expire / delete → janitor / take-delete best-effort remove
```

| Path | Orphan risk | Owner |
|------|-------------|-------|
| Cancel mid-upload | PENDING + object | Existing pending unique + janitor |
| Place fail after READY | READY without Clip | **P5.6 UX debt** |
| Delete Clip | None for storage | Correct |
| Delete Take | Clips lose `source_take_id` (SET NULL) | Existing |

P5.6 does **not** invent a new bucket or client-chosen keys.

---

## 12. Audio Architecture

| Layer | Role | Verdict |
|-------|------|---------|
| `PlayerProvider` | Catalog sticky player | Keep isolated |
| `StudioTransport` | Project playhead + BEAT_REF + TAKE preview layers | Sufficient for P5.6 |
| `TakeMediaRecorder` | Capture | Reuse |
| `/api/takes/preview` | Signed read for TAKE layer | Reuse |
| Web Audio meter | Input level only | Reuse; no LUFS |

**StudioAudioEngine:** NOT required for P5.6. Revisit when P6 FX / buses need a shared graph. Introducing it now would be premature abstraction.

---

## 13. Security Architecture

Existing gates (keep):

| Check | Where |
|-------|-------|
| Auth | `requireUser` |
| Project ownership | `getStudioProjectDocumentFor` / `assertOwnsProject` |
| Track ∈ project | place + addStudioClip |
| Take owner + READY | place + addStudioClip |
| Reject client storage identity | place route `ownerId` / `objectKey` |
| Cross-user place foreign Take | `403` |
| Cross-user foreign project | `404` / FORBIDDEN |
| Unauthenticated | `401` |

**Invariant for P5.6:** User A Take → User B Project remains **impossible**.

---

## 14. Mobile Architecture

Viewport target: `390x844`.

| Concern | P5.6 requirement |
|---------|------------------|
| Record / Stop / Cancel | Retain P5.5 lock mode |
| After READY | Single-column Keep / Record again / Discard — no desktop-only side rails |
| Take list | Bottom sheet / accordion; no horizontal page overflow |
| Preview | Inline; do not open unmanaged tabs as primary path |
| Timeline | Lock during recording; seek OK after READY |
| Confirmation | Required for Discard Take and Replace Clip |

Do not assume desktop Take browser layout.

---

## 15. P3/P4 Reuse

| Contract | Studio use |
|----------|------------|
| Eligibility | `/api/takes/eligibility` only |
| Entitlement / caps / TTL | Sample Policy SSOT |
| Session / finalize | Auth take APIs only (Studio = auth-only) |
| MediaRecorder / UI state | Shared modules |
| Preview / delete / title | Existing take APIs |
| Anon QT | Unchanged on beat detail — **not** extended into Studio |

**Forbidden:** second Studio recording backend, Studio-local duration caps, client storage paths.

---

## 16. Current Coupling / Risks

| Coupling | Severity | Impact on P5.6 |
|----------|----------|----------------|
| Studio record requires `project.beatId` | Medium | Scratch projects cannot record; place-from-library still OK if beat present or product allows take without beat match |
| Auto-place glued to finalize in panel | Medium | Blocks Keep/Discard UX — primary P5.6 change surface |
| Shared Sample Policy caps with QT | Low–Med | Correct SSOT; Studio UX must show eligibility errors |
| TAKE under playhead = single pick in transport | Medium | Overlapping retakes need mute/selection later (P6-ish) |
| Doc unit numbering drift (audit vs freeze) | Low | Naming only — resolve in freeze title |

---

## 17. P5.6 MUST

Small, verifiable unit: **Studio Take Workflow**.

1. **Post-READY Studio actions (PL):** Preview · Keep on timeline · Record again · Discard Take (confirm).  
2. **Record again** always creates a **new** Take; never overwrites prior Take storage.  
3. **Place existing own READY Take** at current playhead via existing `placeReadyTakeAsStudioClip` (Studio Take picker).  
4. **Default naming** via `takes.title` / `displayTakeTitle` (e.g. sequential labels in UI — no second name column).  
5. **Additive Clip placement** (Option A); Clip overlap allowed; no Take mutation.  
6. **Recovery UX** when finalize succeeds but place fails (surface Take + link Moje nagrania / retry place).  
7. **Mobile 390×844** for the above.  
8. **Security regression** (owner / cross-user / unauth / storage).  
9. **Reuse-only recording** (eligibility + session + finalize).  
10. **Automated tests + typecheck + build**; Production Gate after ship.

**DB migration:** Prefer **NONE**. STOP and report if freeze discovers a true need.

---

## 18. P5.6 SHOULD

- In-Studio compact Take list (last N READY for project beat).  
- Optional **Replace Clip** (delete Clip + place new) with confirm — Take untouched.  
- Mute previous overlapping TAKE Clip when placing a retake (Clip.muted only).  
- Clearer PL copy that deleting Clip ≠ deleting Take (already partially present).

---

## 19. P6 Dependencies

| Dependency | Why |
|------------|-----|
| Shared audio graph / buses | FX, monitor mix, analyzers |
| Clip overlap policy / lanes | Comping UI |
| Durable “active take” or playlist | Only if product requires saved choice |
| Punch / pre-roll timing engine | Separate from Take workflow |

P5.6 must remain compatible with these without implementing them.

---

## 20. P7 Dependencies

| Dependency | Why |
|------------|-----|
| SAMPLE / SCRATCH / INSTRUMENT sources | Creative sources beyond Take/Beat |
| Non-Take clip sources in recording UX | Out of recording foundation |

Track enum already reserved — P5.6 must not collapse types to VOCAL-only.

---

## 21. Out of Scope

Explicitly **OUT of P5.6**:

- Punch-in/out, pre-roll, count-in  
- Metronome, BPM editor, Tap Tempo, beat-grid audio  
- EQ / compressor / limiter / reverb / delay / de-esser / autotune / mastering  
- Automation, routing, mix bus, master chain  
- Samples / scratch engine / time-stretch / pitch correction  
- New `active_take` DB column / table  
- Comping lanes / playlist engine  
- Second recording backend  
- Anon Studio recording path  
- D02 live test flakiness fix (separate debt)

---

## 22. Open Questions

For Architect / Owner Design Freeze (not blockers for GO):

| ID | Question | Default if undecided |
|----|----------|----------------------|
| OD-P56-01 | Auto-place remain default Keep, or require explicit Keep before place? | Keep auto-place; add Preview + Record again + Discard |
| OD-P56-02 | Place picker: all own READY Takes vs same `beat_id` only? | Prefer same beat when project has beat; allow all with warning |
| OD-P56-03 | Replace Clip action in P5.6 or defer? | Defer to SHOULD / later unless Owner wants MUST |
| OD-P56-04 | Scratch project (no beat): allow place-from-library only? | Record blocked (current); place-from-library GO if Take owned |

---

## 23. Architecture Decision

```text
Take     = immutable audio source (P3/P4 lifecycle)
Clip     = mutable timeline placement (P5)
Track    = extensible channel
Project  = container

Record again     = NEW Take (+ optional NEW Clip)
Delete Clip      = timeline only
Delete Take      = source lifecycle (existing API)
Active Take      = UI selection only (P5.6)
StudioAudioEngine = NOT NOW
DB migration     = NOT PREFERRED
Recording system = REUSE P3/P4 ONLY
```

**P5.6 name (frozen for next freeze doc):**

```text
P5.6 — Studio Take Workflow
(retake · preview · place existing · keep/discard · mobile)
```

---

## 24. GO / NO-GO

```text
P5.6 ARCHITECTURE: GO
```

**Rationale:**

1. Multi-take / multi-clip already supported by DB and APIs.  
2. Gap is Studio UX/workflow coupling (auto-place), not a missing entity.  
3. Scope can be small, testable, and Production-Gated without migration.  
4. Source immutability and P3/P4 reuse remain intact.  
5. Punch/metronome/FX correctly deferred.

**Next gate:** Architect Design Freeze for P5.6 (no code until Owner GO).

---

## Appendix A — D02 findings

| Item | Assessment |
|------|------------|
| `d02-live` 2 failed (READY-cap race → `REPLACE_REQUIRED` vs daily-cap string) | **Env / assertion pollution** under shared anon caps |
| Impact on P5.6 | **None** on Studio auth recording path |
| Action | **Separate backlog debt item** — do not fix inside P5.6 audit or implementation unless Owner prioritizes |

---

## Appendix B — Key code anchors

| Area | Path |
|------|------|
| Place service | `src/lib/studio/studio-record-service.ts` |
| Geometry | `src/lib/studio/studio-record-ops.ts` |
| Panel | `src/components/studio/studio-recording-panel.tsx` |
| Transport | `src/components/studio/studio-transport-provider.tsx` |
| Clip ops | `src/lib/studio/studio-clip-ops.ts` |
| Studio service | `src/lib/studio/studio-service.ts` |
| Take list/title | `src/lib/takes/list-own-takes.ts`, `take-title.ts` |
| Schema | `supabase/migrations/20261006051500_p5_1_studio_project_track_clip_foundation.sql` |
| Take foundation | `supabase/migrations/20260927180000_recording_wave1_take_foundation.sql` |

---

*End of P5.6 Studio Architecture Audit. Implementation must not start without Design Freeze + Owner GO.*
