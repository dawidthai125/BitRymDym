# P5.6 Studio Take Workflow Design Freeze

**Status:** DESIGN FREEZE — GO  
**Date:** 2026-10-06  
**Product name:** Studio Take Workflow  
**Type:** DESIGN FREEZE ONLY — **NO IMPLEMENTATION IN THIS STEP**  
**Architecture audit:** [P5_6_STUDIO_ARCHITECTURE_AUDIT.md](../architecture/P5_6_STUDIO_ARCHITECTURE_AUDIT.md) (`705a13c`)  
**Parent freeze:** [P5_STUDIO_DESIGN_FREEZE.md](./P5_STUDIO_DESIGN_FREEZE.md)  
**Production baseline:** P5.5 PRODUCTION VERIFIED — GREEN @ `7f28dae0bb556208a271bc3be38c2d083c5e763e`  
**Production URL:** https://www.bitrymdym.pl

```text
P5.6 DESIGN FREEZE STATUS: GO
IMPLEMENTATION: NOT STARTED
```

---

## 1. Status

| Gate | State |
|------|--------|
| Architecture Audit | COMPLETE — GO |
| Design Freeze | **THIS DOCUMENT — GO** |
| Owner Implementation GO | PENDING |
| Code / migration / deploy | **FORBIDDEN until Owner GO** |

**Unit numbering SSOT:** Project recording + Take→Clip foundation shipped as **P5.5**. This unit is the **next** shippable slice:

```text
P5.6 = Studio Take Workflow
```

(Unshipped “devices + metronome + BPM” from older audit numbering remains OUT of P5.6.)

---

## 2. Baseline

| Item | Value |
|------|--------|
| Production | https://www.bitrymdym.pl |
| P5.5 | PRODUCTION VERIFIED — GREEN |
| App SHA | `7f28dae0bb556208a271bc3be38c2d083c5e763e` |
| Audit commit | `705a13c77e91de292d82febd294e023d7d267fba` |
| Architecture | GO |

P5.5 already provides:

```text
mic → eligibility → session → finalize → Take READY → (auto) place Clip → StudioTransport
```

P5.6 redesigns the **post-READY Studio UX** and **Clip placement coupling**. It does **not** replace the P3/P4 recording engine.

---

## 3. Problem

1. **Auto-place glued to finalize** — user cannot preview / discard / decide before Clip appears.  
2. **No first-class retake workflow** — “Nagraj kolejne” exists, but Keep / Discard / Preview are incomplete as a product loop.  
3. **Place-fail orphan READY** — READY Take without Clip is valid, but Studio lacks recovery / place-from-library UX.  
4. **Existing READY Takes** live mainly under `/account/takes`, not as Studio placement actions.

These are **workflow gaps**, not missing DB entities.

---

## 4. Product Goal

Enable a clear Studio loop:

```text
Record
  → Take READY
  → Preview (Odtwórz)
  → Keep (Zachowaj) / Discard (Odrzuć) / Record again (Nagraj ponownie)
  → Place existing READY Take when needed
```

without:

- a second recording system,
- mutating Take bytes,
- requiring a DB migration,
- coupling to `PlayerProvider`.

**Hard rule:**

```text
Take = immutable source
Clip = timeline representation
```

---

## 5. User Workflow

### 5.1 Record path (unchanged engine)

```text
Przygotuj mikrofon
  → ● Nagraj
  → ■ Zatrzymaj nagrywanie
  → Zapisywanie nagrania…
  → Take READY
```

Recording lock (no MOVE / TRIM / SPLIT / DELETE / accidental seek) remains as in P5.5.

### 5.2 Post-READY Studio Take Workflow (NEW — P5.6)

After Take reaches **READY** (and **before** or **instead of** automatic Clip creation — see §13):

| UI (PL) | Action |
|---------|--------|
| **Odtwórz** | Preview Take |
| **Zachowaj** | Keep Take + ensure single Clip placement at captured playhead |
| **Odrzuć** | Confirm → delete Take (existing cleanup) · no Clip |
| **Nagraj ponownie** | Start new capture → **new** Take |

All labels Polish. Brand word „Studio” may stay English.

### 5.3 Place existing Take

```text
READY Take (list / picker)
  → Umieść na osi czasu
  → placeReadyTakeAsStudioClip @ playhead
```

---

## 6. Take Lifecycle

**SSOT remains P3/P4.** No new durable Take statuses for Studio UI.

| Take status | Meaning |
|-------------|---------|
| `PENDING_UPLOAD` | Session in flight |
| `READY` | Source usable |
| `FAILED` / `EXPIRED` / `DELETED` | Existing semantics |

Studio UI-only phases (not DB):

```text
previewing | deciding | placing | kept | discarded
```

`previewing` / `kept` / `placing` **MUST NOT** become columns or enums on `takes`.

Recording capture continues to reuse `reduceRecordingUi` + `TakeMediaRecorder`.

---

## 7. Clip Lifecycle

| Operation | Effect on Take | Effect on storage |
|-----------|----------------|-------------------|
| Place Clip | none | none |
| MOVE / TRIM / SPLIT | none | none |
| DELETE Clip | none | none |
| DELETE Take | clips `source_take_id` SET NULL (existing FK) | existing take-delete cleanup |

Clip creation uses existing `placeReadyTakeAsStudioClip` → `addStudioClipFor` only.

**Geometry (unchanged contract):**

```text
source_take_id
timeline_start_ms   // playhead at record start OR current playhead for library place
source_offset_ms = 0   // for fresh capture place; library place uses 0 unless freeze later extends
duration_ms         // from Take duration (integer ms)
```

---

## 8. Multiple Takes

**Frozen:** multiple READY Takes and multiple TAKE Clips on one Track are **allowed**.

```text
Track: Wokal
  Take 1 · Take 2 · Take 3 · Take 4
```

Constraints:

- **No** unique constraint on Track ↔ Take.  
- **No** unique constraint on timeline position.  
- **No** anti-overlap constraint.  
- Caps remain Sample Policy SSOT (eligibility), not Studio-local limits.

---

## 9. Keep

### 9.1 Meaning

```text
Zachowaj
```

= **keep the READY Take as a durable owned source** and **ensure it is represented once on the timeline** at the capture playhead.

### 9.2 Auto-place decoupling (CLOSED)

P5.5 panel auto-places immediately after finalize. **P5.6 removes that automatic place from the finalize success path.**

**Frozen pipeline:**

```text
Finalize
  → Take READY
  → Studio Take Workflow UI
  → user taps Zachowaj
  → placeReadyTakeAsStudioClip (once)
  → Clip on timeline
```

### 9.3 Idempotence / no duplication

| Forbidden | Required |
|-----------|----------|
| Duplicate Take | Keep never creates a second Take |
| Duplicate storage object | Keep never re-uploads |
| Mutate Take bytes | Keep never edits source |
| Duplicate Clip for same Keep action | Keep places **at most one** Clip for this capture session |

If Clip for this Take at the intended placement already exists (retry / double-tap), Keep is **idempotent success** (no second Clip). Exact matching rule for “already placed” is implementation detail but **must** prevent silent duplicates from double Keep.

### 9.4 Keep does not equal Discard recovery

Keep succeeds only when place succeeds (or Clip already present). Place failure → Polish error; Take stays READY for retry / library place (§13, §19).

---

## 10. Discard

```text
Odrzuć
```

Meaning: user does **not** want this Take in the current workflow.

### 10.1 Confirmation (MUST)

Because Take is already durable after READY:

```text
Odrzucić nagranie?
Nagranie zostanie usunięte.
```

Destructive confirm required.

### 10.2 Effect

After confirm:

1. Reuse existing Take delete pipeline (`/api/takes/delete` / service).  
2. Storage cleanup via existing best-effort cleanup.  
3. **No Clip** (place never ran, or any Clip already created for this path must not remain — if a Clip was placed earlier in an edge case, delete that Clip first or rely on Take delete SET NULL + UI refresh; prefer: Discard only offered when Clip not yet placed).  
4. UI returns to safe idle / ready-to-record state.  
5. **No second delete pipeline.**

### 10.3 Failure

Discard failure → Polish error; do not claim success; Take may still exist.

---

## 11. Record Again

```text
Nagraj ponownie
```

**Always** creates a **new Take**.

| Must | Must not |
|------|----------|
| New Take lifecycle (eligibility → session → finalize) | Overwrite previous Take |
| Preserve previous Takes | Mutate previous storage |
| Preserve previous Clips | Auto-destroy Clip 1 |

### Retake + existing Clip (additive — CLOSED)

```text
Take 1 → Clip 1
Nagraj ponownie → Take 2 → (after Zachowaj) Clip 2
```

Clip 1 and Take 1 remain unless user separately deletes them.

Default placement for Take 2 Keep: **captured playhead at start of that recording** (same as P5.5 geometry rules).

---

## 12. Existing READY Take

Users may place an already READY owned Take without re-recording.

```text
READY Take
  → Umieść w Studio
  → placeReadyTakeAsStudioClip
  → Clip
```

**Reuse** `placeReadyTakeAsStudioClip` / `POST …/record/place`.  
**Do not** add a parallel place endpoint.

Validation (server):

- authenticated user,
- Take `READY`, owned, not deleted,
- project ownership,
- track ∈ project,
- valid integer `timelineStartMs` inside timeline,
- reject client `ownerId` / `objectKey`.

**Beat filter (CLOSED default):** when project has `beatId`, picker **prefers** Takes for that beat; may show other owned READY Takes with clear UX (no silent wrong-beat place without user intent). Exact filter UX is implementation; AuthZ remains ownership-based.

Scratch projects without beat: **record remains blocked** (P5.5); place-from-library **allowed** if Take owned and geometry valid.

---

## 13. Place Workflow

### 13.1 When place runs

| Trigger | Place? |
|---------|--------|
| Finalize success | **NO** (P5.6 change vs P5.5 auto-place) |
| Zachowaj | **YES** (captured playhead) |
| Umieść (library) | **YES** (current playhead) |
| Zastąp klip (SHOULD) | delete Clip then YES |

### 13.2 Place failure / orphan READY (CLOSED)

```text
Take READY + place fails  ≠  invalid Take
```

- Do **not** auto-delete a correct READY Take because place failed.  
- Surface Polish error.  
- Keep Take available for retry Zachowaj / library place / Moje nagrania.  
- This is the architectural justification for Take Workflow.

### 13.3 Clip before READY

**Forbidden.** No playable Studio Clip until Take is READY.

---

## 14. Replace Workflow

**Classification: SHOULD (not MUST).**

If implemented:

```text
existing Clip
  → confirm
  → DELETE Clip only
  → place new READY Take
```

Never mutate Take. Never delete previous Take as side effect of Replace.

If Replace increases risk during implementation, ship without it; additive Keep remains sufficient for GO of MUST scope.

---

## 15. Security

Every P5.6 action MUST enforce:

```text
current user
  → project ownership
  → track ∈ project
  → take ownership + READY
```

| Threat | Required result |
|--------|-----------------|
| Unauthenticated | `401` / Auth required |
| Cross-user project | `403` / `404` |
| Foreign Take → own project | `403` |
| Client `ownerId` / `objectKey` | `400` rejected |
| Expired / not READY Take | blocked with Polish message |

Client-supplied `projectId` / `trackId` / `takeId` / `timelineStartMs` are **hints only** until server validation.

---

## 16. Storage

- Server-side keys only (existing claim/finalize).  
- Keep / Preview / Place create **no** extra storage object.  
- Discard reuses existing Take delete + janitor semantics.  
- No raw access tokens in client persistence.

---

## 17. Mobile

Target: **390×844**.

MUST:

- Record → READY → Odtwórz / Zachowaj / Odrzuć / Nagraj ponownie  
- Full-width, touch-friendly controls  
- No horizontal page overflow  
- Recording lock retained  
- Confirmation for Discard (and Replace if shipped)

Take list (SHOULD): bottom sheet / accordion — not desktop-only side rail.

---

## 18. Audio / Transport

| System | Role |
|--------|------|
| `StudioTransport` | Studio playhead + BEAT_REF + TAKE preview layer |
| `/api/takes/preview` | Signed Take preview URL |
| `PlayerProvider` | Catalog only — **isolated** |
| `TakeMediaRecorder` | Capture only |

**Forbidden:** second Studio player, preview via PlayerProvider, new `StudioAudioEngine` in P5.6.

Preview of the workflow Take must be clearly tied to Studio (inline control / StudioTransport), not an unmanaged primary path.

---

## 19. Error Handling

Must handle without false success:

| Case | Example PL message |
|------|--------------------|
| Preview failure | Nie udało się odtworzyć nagrania. |
| Keep / place failure | Nie udało się umieścić nagrania na osi czasu. |
| Discard failure | Nie udało się usunąć nagrania. |
| Not READY / expired | Nagranie nie jest już dostępne. |
| Ownership / IDOR | Existing studio/take AuthZ messages |
| Storage failure | Existing user-facing take upload errors |

UI must return to a safe state; READY Take remains usable after place failure.

---

## 20. MUST

1. Post-READY workflow: **Odtwórz · Zachowaj · Odrzuć · Nagraj ponownie**  
2. Decouple auto-place from finalize (explicit Zachowaj → place)  
3. Preview via `/api/takes/preview` + StudioTransport  
4. Keep: no Take/storage duplication; at most one Clip per Keep session  
5. Discard: confirmation + existing delete/cleanup; no Clip left for that capture  
6. Record again: always **new** Take; preserve old Takes/Clips  
7. Place existing READY Take via existing `placeReadyTakeAsStudioClip`  
8. `takes.title` / `displayTakeTitle` only (defaults like Take 1/2/3 OK)  
9. Multiple Takes / Clips without migration or anti-overlap  
10. Source immutability  
11. Security matrix (owner / cross-user / unauth / storage)  
12. Mobile 390×844  
13. Reuse P3/P4 recording pipeline exclusively  
14. PlayerProvider isolation  
15. Place-fail leaves READY Take usable  
16. Tests per §23 + typecheck + build; Production Gate after ship  

---

## 21. SHOULD

- Compact in-Studio Take list (“Moje Take’i” / recent READY)  
- Library preview before place  
- Replace Clip (delete Clip + place) with confirm  
- “Wycisz poprzedni” overlapping TAKE Clip (`Clip.muted`)  
- Clearer PL copy: deleting Clip ≠ deleting Take  

---

## 22. OUT OF SCOPE

- Punch-in/out, pre-roll, count-in  
- Metronome, BPM editor, Tap Tempo, beat grid audio  
- Comping engine / lane playlists  
- `active_take_id` (or any durable active-take DB field)  
- FX / EQ / compressor / limiter / reverb / delay / autotune / mastering  
- Automation, routing, mix bus, master chain  
- Samples / scratch engine / time-stretch / pitch correction  
- Second recording backend / `StudioRecorderV2`  
- Anon Studio recording  
- Anti-overlap DB constraints  
- D02 live test flakiness fix (separate debt)  

---

## 23. Test Contract

### Take
- READY after finalize  
- Multiple READY Takes coexist  
- Ownership  
- Title via `takes.title`  
- Preview signed URL  

### Keep
- Does not duplicate Take  
- Does not duplicate storage  
- Does not mutate source  
- Places at most one Clip (idempotent Keep)  

### Discard
- Confirmation required  
- Take cleanup  
- Storage cleanup path  
- No Clip for discarded capture  
- Failure handling  

### Retake
- New Take created  
- Old Take preserved  
- Old Clip preserved  
- New Clip additive after Zachowaj  

### Place
- READY only  
- Owner only  
- Project + track ownership  
- Valid timeline position  
- Failed place leaves READY Take usable  
- No second place endpoint  

### Security
- Owner PASS  
- Cross-user BLOCKED  
- Unauthenticated BLOCKED  
- IDOR BLOCKED  
- Storage identity rejected  

### Mobile
- 390×844  
- No overflow  
- Touch controls for post-READY actions  

### Regression
- P3, P4, P5.1, P5.2, P5.3, P5.4, P5.5  
- PlayerProvider isolated  

---

## 24. DB Decision

```text
NO MIGRATION
```

Existing `takes`, recording claim/finalize, `studio_clips`, `studio_tracks`, `studio_projects` are sufficient.

If implementation discovers a hard requirement for schema change:

```text
STOP
P5.6 DB MIGRATION REQUIRED
```

Report table/column/why — do **not** migrate without a new Architect decision.

---

## 25. Architecture Risks

| Risk | Severity | Freeze mitigation |
|------|----------|-------------------|
| Auto-place glued to finalize | Medium | **CLOSED:** remove auto-place; Zachowaj places |
| Place-fail orphan READY | Medium | **CLOSED:** READY remains valid; retry/library |
| Overlapping Clips playback | Medium | Allowed; no comping; optional mute SHOULD |
| Double Keep → duplicate Clip | Medium | Idempotent Keep rule |
| Shared Sample Policy caps | Low–Med | Surface eligibility errors; no Studio-local caps |
| Scratch project no beat | Low | Record blocked; library place allowed |

---

## 26. Closed Owner / Architect Decisions (OD-P56)

| ID | Decision | Status |
|----|----------|--------|
| **OD-P56-01** | Auto-place removed; Keep = explicit place | **CLOSED** |
| **OD-P56-02** | Prefer same-beat Takes in picker; other owned READY allowed with clear UX | **CLOSED** |
| **OD-P56-03** | Replace Clip = SHOULD, not MUST | **CLOSED** |
| **OD-P56-04** | Scratch: record blocked; place-from-library allowed | **CLOSED** |
| **OD-P56-05** | Active take = UI only; no DB column | **CLOSED** |
| **OD-P56-06** | Retake = additive Clip; never overwrite Take | **CLOSED** |
| **OD-P56-07** | No migration | **CLOSED** |

---

## 27. GO / NO-GO

```text
P5.6 DESIGN FREEZE: GO
```

**Checklist satisfied:**

- [x] Take workflow (Preview / Keep / Discard / Record again)  
- [x] Retake = new Take, additive Clip  
- [x] Discard with confirmation + existing cleanup  
- [x] Place via existing `placeReadyTakeAsStudioClip`  
- [x] Auto-place decoupling closed  
- [x] Place-fail orphan policy closed  
- [x] Security / storage / mobile  
- [x] Test contract  
- [x] NO MIGRATION  
- [x] OUT scope explicit  

**Next:** Owner Implementation GO → implement P5.6 only against this freeze → tests → Production Gate.  
**Do not** implement from this docs commit alone.

---

*End of P5.6 Studio Take Workflow Design Freeze.*
