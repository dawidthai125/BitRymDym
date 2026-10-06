# P5.7 Studio Architecture Audit

**Status:** COMPLETE — audit artifact only  
**Date:** 2026-10-06  
**Auditor role:** Senior Staff Engineer / Software Architect / Security Architect  
**Scope:** Architecture evaluation after P5.6. **No implementation. No migrations. No production code changes.**

**SSOT inputs read:**
- `docs/ssot/MASTER_SSOT_v0.1.md`
- `docs/PROJECT_STATE.md`
- `docs/MASTER_HANDOFF.md`
- `docs/architecture/P5_STUDIO_ARCHITECTURE_AUDIT.md`
- `docs/decisions/P5_STUDIO_DESIGN_FREEZE.md`
- `docs/architecture/P5_6_STUDIO_ARCHITECTURE_AUDIT.md`
- `docs/decisions/P5_6_STUDIO_TAKE_WORKFLOW_DESIGN_FREEZE.md`
- Code: `src/config/studio.ts`, `src/lib/studio/*`, `src/components/studio/*`, `src/app/api/studio/*`, Studio + Take migrations

---

## Executive Summary

Studio after P5.6 has a **sound domain model** (Project → Track → Clip → Take), a **correct security mutation pattern** (service_role writes + owner RLS + server AuthZ), a **clean catalog/Studio playback boundary** (`StudioTransport ≠ PlayerProvider`), and a **correct Take workflow** (`finalize ≠ place`).

The architecture is **ready for the next Design Freeze** of remaining P5 ergonomics and later P6/P7 — **with conditions**. No production rewrite of P5 is required. Conditions are freeze/contract gates (unit numbering, P6 audio-graph SSOT, `document_version` before autosave, capability flags before creative track UX), not hotfixes.

```text
P5.7 ARCHITECTURE: GO WITH CONDITIONS
```

---

## Current Baseline

| Item | Evidence |
|------|----------|
| Production URL | https://www.bitrymdym.pl |
| Production application SHA | `7f801430d6680c32e7af5a4e6f5b6818541014d8` (P5.6 Take Workflow) |
| Repo HEAD / origin/main | `44dc22c9f11cac3852d1fd4d3f680c7d06b274aa` |
| HEAD == origin/main | YES (verified at audit start) |
| Test-only on main | `44dc22c` — D02 live harness fix |
| P5.6 | PRODUCTION VERIFIED — GREEN |
| D02 | CLOSED (test infrastructure; not production READY-cap debt) |
| Deploy for this audit | NOT REQUIRED |
| WIP | Present and **untouched** (`.env.example`, STORAGE_ARCH, eligibility WIP, audits, scripts, etc.) |

**SSOT reconcile (2026-10-06):** Living docs (`PROJECT_STATE`, `MASTER_HANDOFF`, `FINAL_COLD_START`, `docs/README`, architecture README) updated to list P5.1–P5.6, D02 CLOSED, P5.7 GO WITH CONDITIONS, and **P5.8** as next unit. Finding **M5** treated as **RECONCILED** by that docs wave.

### Shipped P5 units (code evidence)

| Unit | Focus | Primary anchors |
|------|--------|-----------------|
| P5.1 | Project/Track/Clip foundation | migration `20261006051500_p5_1_*`, `studio-service.ts`, `p5-1-foundation.test.ts` |
| P5.2 | Transport + BEAT_REF playback | `studio-transport.ts`, `studio-transport-provider.tsx`, `p5-2-beat-transport.test.ts` |
| P5.3 | MOVE / TRIM / SPLIT | `studio-clip-ops.ts`, `p5-3-clip-edit.test.ts` |
| P5.4 | Timeline UX | `studio-timeline-view.ts`, `p5-4-timeline-ux.test.ts` |
| P5.5 | Recording foundation | `studio-recording-panel.tsx`, `studio-record-service.ts`, `p5-5-recording.test.ts` |
| P5.6 | Take workflow (Preview/Keep/Discard/place) | `P5_6_*_DESIGN_FREEZE.md`, `p5-6-take-workflow.test.ts` |

---

## Domain Model

Frozen core (P5 Design Freeze §3, confirmed in schema + services):

```text
Project  →  Track  →  Clip  →  (references) Take | Beat | Artifact
Take     = immutable audio source (P3/P4 lifecycle)
Clip     = mutable timeline placement
Track    = extensible channel
Project  = container
```

**Marketplace `beats`** remain a separate product entity. Project may optionally bind `beat_id` (OD-P5-05: scratch Project without beat allowed; Studio **recording** still requires beat context).

---

## Project / Track / Clip / Take

### Project (`studio_projects`)

| Concern | Current state |
|---------|----------------|
| Ownership | `owner_id` NOT NULL → profiles |
| Lifecycle | `DRAFT` \| `ACTIVE` \| `ARCHIVED` |
| Container fields | `tempo_bpm`, time signature, `timeline_length_ms`, `master_gain_db`, `master_pan`, `master_fx_chain` jsonb stub, `schema_version`, `document_version` |
| Soft cap | `STUDIO_MAX_PROJECTS_PER_USER = 25` (`src/config/studio.ts`) |
| Mutations | service_role only (`prevent_studio_project_privilege_escalation`) |
| SELECT RLS | own `owner_id` |

### Track (`studio_tracks`)

| Concern | Current state |
|---------|----------------|
| Ownership | via `project_id` → project owner |
| Types | `VOCAL\|BEAT\|SAMPLE\|SCRATCH\|INSTRUMENT\|GUITAR\|FX\|BUS\|OTHER` (DB chk + `STUDIO_TRACK_TYPES`) |
| Channel controls | gain, pan, mute, solo, record_armed, sort_order, color |
| Stubs | `effects_chain` jsonb, `output_route` chk=`MASTER` |
| Extensibility | Enum ready; **runtime coupling** to BEAT/VOCAL still present (see Track Extensibility) |

### Clip (`studio_clips`)

| Concern | Current state |
|---------|----------------|
| Ownership | via track → project owner |
| Geometry | `timeline_start_ms`, `duration_ms`, `source_offset_ms` (integer ms) |
| Sources | `TAKE` \| `BEAT_REF` \| `ARTIFACT` with XOR FK checks |
| Mutability | Geometry/mute/gain editable; **source Take bytes never mutated by clip ops** |
| Overlap | Allowed — no anti-overlap unique/check |
| Delete | Clip delete ≠ Take delete; `source_take_id ON DELETE SET NULL` |
| Stubs | `pitch_cents`, `stretch_ratio`, `effects`, fades |

### Take (`takes` — P3 foundation)

| Concern | Current state |
|---------|----------------|
| Ownership | `owner_id` XOR anonymous token hash |
| Status | `PENDING_UPLOAD` \| `READY` \| `FAILED` \| `EXPIRED` \| `DELETED` |
| Immutability | Place/Keep create Clip only; storage object unchanged |
| Studio use | Auth Studio records via existing session/finalize; place requires READY + owner |

### Invariants confirmed

1. **Take = immutable source** — `placeReadyTakeAsStudioClipFor` selects take; does not update take/storage.  
2. **Clip = timeline representation** — additive place; Keep idempotent on `(trackId, takeId, timelineStartMs)`.  
3. **Track = extensible channel** — at schema/config level; partial at UI/capability level.  
4. **Project = container** — document load aggregates tracks + clips.  
5. **finalize ≠ place** — panel finalizes READY without place; Keep/place is explicit (`p5-6-take-workflow.test.ts`).

### Deletion semantics

| Action | Effect |
|--------|--------|
| Delete Clip | Timeline only; Take remains READY |
| Discard Take | Existing take-delete + storage cleanup; Clip FK nulls if Take hard-removed |
| Delete Project | Cascades tracks/clips; Takes remain (separate lifecycle) |
| Retake | New Take (+ optional new Clip); old Take and old Clips survive |

---

## Timeline

- Persisted geometry: integer ms (`studio-time.ts` `assertIntegerMs`).  
- Ops: MOVE / TRIM / SPLIT / DELETE via pure `studio-clip-ops` + service persistence.  
- View: scroll, zoom, ruler, snap, selection (`studio-timeline-view.ts`, P5.4).  
- Bounds: clip end ≤ `timeline_length_ms`; min duration 1 ms.  
- Recording lock blocks edit/seek during capture (`studio-editor.tsx` + panel).  
- Overlap: allowed in model; playback resolution is first-wins for TAKE (see Audio Architecture).

---

## Transport

| Concern | Owner |
|---------|--------|
| Project playhead FSM | `reduceStudioTransport` / `studio-transport.ts` |
| Beat + TAKE audio elements | `StudioTransportProvider` — local `HTMLAudioElement` ×2 |
| Catalog marketplace playback | `PlayerProvider` |
| Isolation | Provider calls `catalogPlayer?.setSuppressed(true)` on mount; tests forbid PlayerProvider import in Studio panel/editor |

**Confirmed:** `StudioTransport != PlayerProvider`.

Transport is the correct **clock / playhead** boundary. It is **not** a future DSP graph.

---

## Recording

Pipeline (Studio auth path):

```text
record/context (resolve beatId)
→ eligibility
→ getUserMedia + TakeMediaRecorder
→ upload session → signed PUT → finalize → READY Take
→ UI: Preview / Keep / Discard / Record again
→ Keep → POST …/record/place → Clip
```

| Future capability | Readiness |
|-------------------|-----------|
| Punch-in / out | READY WITH REFACTOR — needs timing layer around same finalize/place; geometry already playhead-based |
| Pre-roll / count-in | READY — transport clock + UI; no second recorder |
| Metronome | READY — tempo on Project; audio click separate from Take pipeline |
| Monitoring | READY WITH REFACTOR — likely Web Audio monitor path; keep capture on MediaRecorder |
| Latency compensation | READY WITH REFACTOR — adjust `timeline_start_ms` / `source_offset_ms` / `audio_offset_ms` at place; persist integer ms |
| Device changes | READY WITH REFACTOR — device UX unit; MediaRecorder restart rules |

**Hard rule retained:** no second recording backend; REUSE P3/P4 session/finalize.

---

## Placement

| Property | Evidence |
|----------|----------|
| API | `POST /api/studio/projects/[projectId]/record/place` |
| Service | `placeReadyTakeAsStudioClipFor` |
| AuthZ | `requireUser` + project ownership + take `owner_id` + `READY` + not deleted |
| Client rejects | `ownerId` / `objectKey` → 400 |
| Idempotency | `findIdenticalTakeClipPlacement` → `reusedExisting: true` (HTTP 200 vs 201) |
| Failure mid-place | Clip insert fails → Take remains READY (place does not mutate Take) — **retry-safe** |
| Library place | `listReadyTakesForStudioPlaceFor` — owned READY; prefers same beat |

P5.6 additive semantics: new Keep → new Clip; retake → new Take; old Clip/Take survive.

---

## Audio Architecture

### Today

```text
StudioTransport (playhead ms)
  ├── HTMLAudioElement (BEAT_REF)
  └── HTMLAudioElement (single TAKE under playhead via pickTakeClipAtPlayhead)
PlayerProvider = catalog only (suppressed in Studio)
E3 mix-graph.ts = beat Mix/Master preview (Web Audio) — NOT wired as Studio engine
```

### Overlap / mix readiness

- Multiple TAKE Clips per track allowed.  
- `pickTakeClipAtPlayhead` uses `.find()` → **first match wins**; no simultaneous TAKE mix.  
- Track mute/solo/gain affect beat path; TAKE path is limited.  
- Clipping risk: product-level, not enforced (no limiter in Studio).  
- Mute/solo fields exist on tracks; true multi-source mix needs graph.

### P6 recommendation (Architect)

```text
StudioTransport = clock / transport UI
StudioAudioEngine (P6) = sources → processing → routing → bus → master
```

Do **not** implement FX on dual `HTMLAudioElement`. Do **not** silently make E3 `mix-graph` the Studio graph without an explicit adapter freeze.

---

## Track Extensibility

**Extensible today:**
- `STUDIO_TRACK_TYPES` + DB chk include future creative/bus types.  
- Track ops header intent: type-agnostic controls.  
- Label helpers are presentation switches (acceptable).

**Coupling (evidence):**

| Location | Pattern |
|----------|---------|
| `studio-service.ts` create seed | Always inserts BEAT + VOCAL |
| `studio-beat-audio.ts` | `tracks.find(t => t.trackType === "BEAT")` |
| `studio-recording-panel.tsx` | `tracks.filter(t => t.trackType !== "BEAT")` |
| `studio-editor.tsx` | `isBeat = track.trackType === "BEAT"` |

**Impact:** Adding SAMPLE/GUITAR recording UX by scattering more `===` checks will calcify coupling. Prefer capability flags (`canRecord`, `carriesBeatRef`, `isBus`) in the unit that expands track UX.

**Migration need for new enum values:** none if value already in chk; new values need additive chk migration. Refactor of hardcodes is a **code** concern, not schema rewrite of P5.

---

## Source Extensibility

Current: `TAKE | BEAT_REF | ARTIFACT` (`STUDIO_CLIP_SOURCE_KINDS` + XOR).

| Source | Runtime |
|--------|---------|
| TAKE | Place + transport pick + preview API |
| BEAT_REF | Project create + beat audio |
| ARTIFACT | Validated in `assertValidClipSource` / API; **no StudioTransport playback path** |

Future SAMPLE / SCRATCH / INSTRUMENT / LOOP:

- **Recommended:** additive `source_kind` (+ library tables) — does not break XOR model.  
- Do not overload ARTIFACT long-term for user sample libraries.  
- Track type enum already reserves SAMPLE/SCRATCH/INSTRUMENT/GUITAR — orthogonal to clip source kind.  
- Pitch/stretch columns reserved on clips for P7.

---

## Security

| Control | Status |
|---------|--------|
| Project ownership | `assertOwnsProject` on mutations |
| Track/Clip ownership | join via project; privilege-escalation triggers |
| Take ownership on place | `take.owner_id === context.userId` + READY |
| Storage keys | Server-generated object keys; place route rejects client `ownerId`/`objectKey` |
| Unauthenticated Studio mutate | `requireUser` — blocked |
| Cross-user | Ownership mismatch → FORBIDDEN / NOT_FOUND patterns |
| RLS | SELECT own; mutations not via authenticated direct table writes |
| IDOR surface | projectId/trackId/takeId always re-checked server-side |

**Assessment:** Security architecture for Studio foundation is **sound** and aligned with Take P3/P4 patterns. No CRITICAL IDOR finding in reviewed place/record paths.

---

## Storage

```text
MediaRecorder blob
→ take session + signed upload (take-audio / user/{ownerId}/takes/{takeId}/mic.bin)
→ finalize → READY
→ preview via /api/takes/preview (signed)
→ placement → Clip FK only (no new object)
→ delete/Discard → take-delete + storage cleanup
→ janitor → expires READY/PENDING past expires_at
```

| Topic | Assessment |
|-------|------------|
| Orphan Clip after Take delete | FK SET NULL — Clip may become sourceless; acceptable; UI should handle later |
| Orphan storage | Janitor + delete paths; Sample Policy caps |
| Place retry | Safe — Take unchanged on clip failure |
| DB/storage consistency | Same as Take domain; Studio adds no second bucket |

---

## Mobile

- Single Studio shell: `/studio`, `/studio/p/[projectId]` — **no separate mobile Studio**.  
- Touch affordances: `touch-pan-x` / `touch-none` on timeline.  
- P5.6 freeze targets 390×844; contract tests cover mobile/recording lock.  
- Take workflow controls are full-width PL copy suitable for narrow viewports.  
- Future creative tools must stay in the same shell + touch constraints (per-unit freeze).

---

## Performance

| Class | Assessment |
|-------|------------|
| **Real current issue** | None evidenced as production blocker at P5.6 scale (few tracks, dual audio elements). |
| **Future scalability** | Many overlapping TAKE clips still resolve to one element (limits CPU today, limits fidelity). Many tracks + P6 graph nodes will need pooling/decoding strategy. Long timelines: view virtualization may be needed later. Soft project cap 25 helps. |

Do not build a performance engine now.

---

## Testability

| Layer | Coverage pattern |
|-------|------------------|
| Domain pure ops | `studio-clip-ops`, `studio-time`, `studio-record-ops`, transport reduce |
| Unit suites | `p5-1` … `p5-6` separate files — **not monolithic** |
| Live Take caps | `d02-live.test.ts` (harness fixed at `44dc22c`) |
| Security contracts | Source grep/asserts for `assertOwnsProject`, rejected `ownerId`/`objectKey` |
| Isolation | No PlayerProvider in Studio recording/editor tests |

**P6/P7:** Can add focused suites (graph node pure tests, source_kind validators) without a mega-harness — **READY** pattern exists.

---

## Autosave / Recovery

| Mechanism | State |
|-----------|--------|
| Immediate persist | REST mutations after edits (no debounce autosave client) |
| `document_version` column | Exists; exposed on DTO |
| Version bump | **Only** in `updateStudioTrackControlsFor` — **not** on clip add/edit/delete/split/reorder |
| Optimistic concurrency | None |
| Crash recovery UX | None |
| Revision table | Not present (optional FUTURE) |

**Verdict:** Model **not ready** for autosave/recovery until version contract is frozen and implemented. Not a blocker for non-autosave next units.

---

## Undo / Redo Readiness

Operations are discrete server commands (move/trim/split/delete/place) with pure geometry helpers — **good command boundaries**.

Missing: history stack, inverse ops packaging, selection restore.

**Verdict:** Undo/Redo can be introduced later **without** rewriting the domain model. Do not implement global undo in next unit unless Owner prioritizes.

---

## P6 Readiness

| Group | Readiness | Rationale |
|-------|-----------|-----------|
| Effect chains (EQ, comp, limiter, reverb, delay, de-esser) | **READY WITH REFACTOR** | jsonb stubs exist; need StudioAudioEngine + schema productization |
| Autotune / pitch correction | **NOT READY** | Needs DSP strategy + likely clip/track processing path beyond stubs |
| Automation | **NOT READY** | No automation tables/points; stub only in old audit |
| Routing / buses | **READY WITH REFACTOR** | `output_route` locked to MASTER; BUS track type reserved |
| Mix bus / master chain | **READY WITH REFACTOR** | `master_fx_chain` stub; must not conflate E3 MixPanel graph without freeze |
| Analyzers / metering | **READY WITH REFACTOR** | Depends on graph |

**P6 gate condition:** Design Freeze must introduce **StudioAudioEngine** as SSOT for Studio DSP; transport remains clock.

---

## P7 Readiness

| Capability | Readiness | Rationale |
|------------|-----------|-----------|
| Samples / scratch / instruments (as track types) | **READY WITH REFACTOR** | Enum reserved; need capability flags + library + source_kind |
| Guitar/Piano/Bass/Synth engines | **NOT READY** | No instrument runtime; future creative engines |
| Pitch / time-stretch / reverse / loop | **READY WITH REFACTOR** | Clip columns reserved; no runtime |
| Drag & drop from library | **READY WITH REFACTOR** | Clip create API exists; UX + source kinds later |
| FX as creative insert (vs P6 mix FX) | Boundary must stay clear in freezes |

P7 must remain **additive** (new kinds/tables/UI), not a P5 model break.

---

## Findings

### CRITICAL

*None evidenced.*

### HIGH

**H1 — Track-type hardcodes instead of capabilities**  
- **Problem:** Beat/record/lane logic switches on `trackType === "BEAT"` / seed BEAT+VOCAL.  
- **Evidence:** `studio-beat-audio.ts`, `studio-recording-panel.tsx`, `studio-editor.tsx`, `studio-service.ts` seed.  
- **Impact:** Future SAMPLE/GUITAR/BUS UX will duplicate switches; violates “no type-switch core logic” intent from P5 freeze §8.  
- **Why now / later:** Condition for next track/creative freeze; not a P5.6 reopen.  
- **Recommendation:** Freeze capability flags before expanding track UX.  
- **Blocking:** YES for P7 / multi-type recording Design Freeze; NO for metronome-only unit.

**H2 — Incomplete `document_version`**  
- **Problem:** Version bumped only on track controls update.  
- **Evidence:** `studio-service.ts` bump at track controls; `addStudioClipFor` / geometry / split / delete paths lack bump.  
- **Impact:** Autosave/multi-tab conflict detection would be false-safe.  
- **Why later:** Only blocks autosave/recovery unit.  
- **Recommendation:** Freeze bump-on-all-document-mutations + conflict rules before P5 autosave.  
- **Blocking:** YES for autosave Design Freeze; NO otherwise.

**H3 — Unit-numbering drift**  
- **Problem:** Original P5 audit §37 called recording P5.6 and punch P5.7; shipped = P5.5 recording + P5.6 Take Workflow.  
- **Evidence:** `P5_STUDIO_ARCHITECTURE_AUDIT.md` §37 vs `P5_6_*` freeze + code tests.  
- **Impact:** Agents may implement wrong “next” scope.  
- **Why now:** This audit **is** P5.7; next implementation unit needs a new number/name.  
- **Recommendation:** Next freeze names P5.8+ explicitly; update handoff/state when Owner schedules docs sync.  
- **Blocking:** YES for next Design Freeze naming clarity.

**H4 — Dual audio-engine risk (E3 Mix vs Studio HTMLAudio)**  
- **Problem:** Web Audio Mix graph exists outside Studio; Studio uses HTMLAudio.  
- **Evidence:** `src/lib/mix/mix-graph.ts` vs `studio-transport-provider.tsx`.  
- **Impact:** Naive P6 could fork two incompatible DSP stacks.  
- **Why later:** Blocks P6 freeze, not current P5 UX units.  
- **Recommendation:** P6 freeze mandates StudioAudioEngine SSOT; optional adapter to E3 only if product requires.  
- **Blocking:** YES for P6 Design Freeze.

### MEDIUM

**M1 — Overlap playback first-wins**  
- **Problem:** `pickTakeClipAtPlayhead` returns first matching clip.  
- **Evidence:** `studio-take-audio.ts`.  
- **Impact:** Overlapping retakes do not mix; acceptable P5 limit.  
- **Recommendation:** Document as known limit; P6 freezes mix vs playlist policy.  
- **Blocking:** NO for next non-mix unit.

**M2 — ARTIFACT not playable in StudioTransport**  
- **Problem:** Source kind accepted; no playback path.  
- **Evidence:** `studio-clip-ops.ts` ARTIFACT validation; transport only BEAT/TAKE.  
- **Impact:** Bounce/artifact clips silent until wired.  
- **Recommendation:** Wire when bounce/artifacts enter Studio freeze.  
- **Blocking:** NO now.

**M3 — Parallel recording panels**  
- **Problem:** Beat Quick Record panel vs Studio recording panel share Take helpers but diverge on Keep/place.  
- **Evidence:** `recording-panel` (beat) vs `studio-recording-panel.tsx`.  
- **Impact:** Drift risk if one path regresses finalize≠place.  
- **Recommendation:** Keep REUSE discipline; shared pure helpers only.  
- **Blocking:** NO.

**M4 — Multi-tab edit races**  
- **Problem:** No If-Match / version check on clip writes.  
- **Evidence:** absence alongside incomplete `document_version`.  
- **Impact:** Last-write-wins across tabs.  
- **Recommendation:** Address with H2 in autosave unit.  
- **Blocking:** NO for single-tab P5 UX.

**M5 — PROJECT_STATE / MASTER_HANDOFF lag Studio P5**  
- **Problem:** Operational SSOT docs lagged Studio P5 ship state.  
- **Evidence:** pre-reconcile `PROJECT_STATE.md` / handoff vs code + freezes.  
- **Impact:** Cold-start agents could miss Studio baseline.  
- **Recommendation:** Docs sync — **DONE 2026-10-06** (this reconciliation wave).  
- **Blocking:** NO · **Status: RECONCILED**.

### LOW

**L1 — Default seed BEAT+VOCAL** — product default OK; document as default, not invariant.  
**L2 — Stale “P5.7 = punch” comments/docs** — living docs reconciled 2026-10-06; historical §37 kept with supersession note.  
**L3 — DTO omits FX stub fields** — fine until P6.

### FUTURE

- Full FX racks, automation lanes, buses (P6)  
- Sample library, scratch pad, instruments (P7)  
- Comping / playlist / durable active-take  
- Project sharing grants  
- Global undo/redo  
- `studio_project_revisions`  
- Timeline virtualization at large clip counts  

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Implementing punch under name “P5.7” | HIGH | This audit claims P5.7; freeze next as P5.8+ |
| Bolting FX onto HTMLAudioElement | HIGH | P6 StudioAudioEngine condition |
| Autosave without version SSOT | HIGH | H2 condition |
| Type-switch explosion for P7 | HIGH | Capability flags condition |
| Treating E3 Mix as Studio master | MEDIUM | Explicit adapter or separate |
| Silent ARTIFACT clips | LOW | Defer until bounce-in-Studio |

---

## Required Conditions

**MUST before next Design Freeze approval:**

1. **Name the next implementation unit** (**P5.8 — Studio Devices / Input & Device Foundation**). Do not call punch “P5.7”.  
2. **Record P6 audio rule in freeze backlog:** StudioAudioEngine for FX/buses; transport stays clock; no silent ownership of E3 Mix graph.  
3. **If autosave is next:** freeze `document_version` bump on all document mutations + conflict behavior first.  
4. **If track-type / creative expansion is next:** freeze capability flags; ban new domain `trackType ===` branches.

**SHOULD:**

- Document overlap first-wins as known P5 playback limit.  
- Keep `finalize ≠ place` and Take immutability absolute.  
- Defer SAMPLE `source_kind` to P7 freeze (additive).  
- Sync `PROJECT_STATE` / `MASTER_HANDOFF` Studio lines when Owner schedules docs.  
- Optional mute-previous overlapping Clip on retake remains product SHOULD (P5.6).

**OUT OF SCOPE for P5.7 (this audit):**

FX, metronome, punch, samples, undo, versioning UI, schema/RPC/API/UI/test code changes, commit/push/deploy.

---

## Decision

```text
P5.7 ARCHITECTURE: GO WITH CONDITIONS
```

**Rationale:**

1. Domain model Project/Track/Clip/Take is correct and production-proven through P5.6.  
2. Security mutation pattern matches Take SSOT; place rejects client storage identity.  
3. `StudioTransport != PlayerProvider` holds.  
4. `finalize ≠ place` and additive retake semantics hold.  
5. Integer ms persistence remains the right SSOT for P6/P7 edges.  
6. Remaining gaps are **contract/freeze conditions** and future engines — not a NO-GO rewrite.  
7. No CRITICAL findings.

**Next step after Owner/Architect acceptance:** Design Freeze for the next implementation unit (**P5.8 — Studio Devices / Input & Device Foundation**), incorporating Required Conditions. **No implementation until that freeze is GO.**

---

*End of P5.7 Studio Architecture Audit. Single allowed artifact path: `docs/architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md`.*

---

## Living conditions (post-audit SSOT)

Documented for freezes — **not implemented in this wave:**

### H1 — Track capabilities (future)

Functional today with BEAT/VOCAL assumptions. Before expanding track types / P7 creative UX, freeze **Track Type + Capabilities** (examples: `CAN_RECORD`, `CAN_PLAY`, `CAN_EDIT`, `CAN_FX`, `CAN_AUTOMATE`, `CAN_ROUTE`, `CAN_MONITOR`). Ban new domain `if (track.type === …)` branches.

### H2 — document_version

Column exists; not yet a frozen autosave/recovery/versioning contract. **Freeze `document_version` bump + conflict rules before any autosave unit.**

### H4 — StudioAudioEngine

```text
StudioTransport != PlayerProvider
P6 Studio audio processing must not be bolted onto
HTMLAudioElement / current simple StudioTransport.
P6 requires a dedicated StudioAudioEngine / audio graph boundary.
```

### M1 — Overlap

P5 known limit: **overlap playback = first-wins** (single TAKE under playhead). No mix engine in P5.

### M2 / M3 / M4

- **M2:** `ARTIFACT` not fully playable in StudioTransport — non-blocking for P5.8.
- **M3:** Parallel beat vs Studio recording panels — document only; no refactor now.
- **M4:** Multi-tab = last-write-wins — no collaborative locking now.

### P6 / P7 split

- **P6:** StudioAudioEngine, FX, routing, buses, automation, mix, master.
- **P7:** samples, scratch, instruments, creative sources, time-stretch, pitch, reverse, loop, drag/drop.

