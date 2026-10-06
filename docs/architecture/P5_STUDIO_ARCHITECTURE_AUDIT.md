# P5 Studio — Architecture Audit + Design Freeze Proposal

**Status:** AUDIT COMPLETE · **DESIGN FREEZE GO** (see `docs/decisions/P5_STUDIO_DESIGN_FREEZE.md`) · OD-P5-01…07 **CLOSED**  
**Date:** 2026-10-06  
**Baseline HEAD / origin/main (audit):** `bface6c36661e9bdc9142add85f58a03ea2e1760`  
**Production:** https://www.bitrymdym.pl · P4 **PRODUCTION VERIFIED — GREEN** · P4.6 **BLOCKED_INFRA** (Contabo worker STOPPED — not a P4 functional defect)  
**Follow-on:** P5.1 implementation authorized by Design Freeze GO

---

## 1. Executive Summary

BitRymDym ma dziś **Studio jako IA alias** (`/studio` → `/account`) oraz **nagrywanie osadzone na beat detail** (`BeatRecordingSurface` + `RecordingPanel` + `MixPanel`). Trwały model audio to **`takes`** (ownership XOR, Sample Policy, P3 claim, P4 identity/download). **Nie istnieją** tabele/typy Project / Track / Clip / timeline.

P5 ma dostarczyć **Extensible Studio Foundation**:

```text
Project → Track → Clip → Take(reference)
```

bez przebudowy P3/P4 i bez domknięcia drogi do P6 (FX/Mix/Master) oraz P7 (sample/instrument/creative).

**Werdykt audytu:** architektura jest **GO** — fundamenty (Take, dual playback engines, Storage, AuthZ, E3 `kind` split, ms time SSOT z P4 DF) wystarczają, by zbudować P5 jako **nową warstwę referencyjną** nad istniejącymi Take’ami.

**Główna zasada:** Take pozostaje **źródłem audio**; Clip to **umiejscowienie na timeline**; Track to **kanał**; Project to **kontener utworu**. Nie utożsamiać tych pojęć.

---

## 2. Aktualny stan architektury

### 2.1 Routing / surfaces

| Route | Reality |
|-------|---------|
| `/studio` | `redirect("/account")` |
| `/studio/recordings` | `redirect("/account/takes")` |
| `/studio/tracks` | `redirect("/account/beats")` |
| `/account` | Artist Studio hub |
| `/account/takes` | My Recordings (P4) |
| `/beat/[id]` | **Primary capture UX** — hero PlayerProvider + `BeatRecordingSurface` |

**Brak** dedykowanego DAW / timeline route.

### 2.2 Audio engines (nie mylić)

| Engine | Rola | Plik |
|--------|------|------|
| **PlayerProvider** | Globalny odsłuch katalogu / beatów | `src/components/player/player-provider.tsx` |
| **PlaybackShell** | Lokalny BIT engine pod REC sync | `src/components/player/playback-shell.tsx` |
| **Take preview graph** | Dual preview READY take | `src/lib/audio/take-preview-graph.ts` |
| **Mix graph** | Live mix preview (E3) | `src/lib/mix/mix-graph.ts` |

P5 **nie może** scalić tych silników w jeden globalny player bez regresji Fala 3.5.1 / StickyMiniPlayer.

### 2.3 Domains already shipped

- **Takes:** Waves 1–5 · D02 anon · P1 Sample Policy · P2 replace · P3 claim · P4 eligibility/title/download/TAKE_EXPORT  
- **E3:** `mix_sessions` · `render_jobs` (`MIX` \| `TAKE_EXPORT`) · `audio_artifacts`  
- **Beats marketplace:** `beats` + `beat-audio` (orthogonal to Project)  
- **AuthZ:** server-only mutations · RLS select-own · service_role privilege triggers

### 2.4 Gap vs P5

Brak: Project/Track/Clip schema · Studio timeline transport · punch/pre-roll · metronome · device picker · Project autosave · Undo stack · dedicated `/studio/project/[id]` UI.

---

## 3. Istniejące SSOT (reuse map)

| SSOT | Location | P5 reuse |
|------|----------|----------|
| Product truth | `docs/ssot/MASTER_SSOT_v0.1.md` | Limits, player rules |
| System architecture | `docs/architecture/SYSTEM_ARCHITECTURE.md` | Principles |
| Recording index | `docs/architecture/RECORDING.md` | Take lifecycle |
| Sample Policy | `src/config/recording.ts` · `entitlement.ts` | Eligibility / caps / RAW |
| Premium matrix | `PREMIUM_TIER_MATRIX` · entitlement resolvers | Export ladder · MIX caps |
| P4 DF | `docs/decisions/P4_RECORDING_IDENTITY_ELIGIBILITY_DOWNLOAD_DESIGN_FREEZE.md` | ms time · Take reference · P5 boundary sketch |
| E3 lock | `docs/architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md` | MIX ≠ TAKE_EXPORT · artifacts |
| Polish labels | `src/lib/ui/labels.ts` (POLISH-01) | Extend — do not fork |
| Authorization | `docs/architecture/AUTHORIZATION.md` | Ownership patterns |
| Object keys | `src/lib/takes/object-key.ts` · `artifact-object-key.ts` | Keep; extend only if Project bounce needs new prefix |
| UI status labels | `labelTakeStatus` etc. | Studio Polish strings → same SSOT pattern |

**P4 DF §23 vs ten audyt (OWNER ALIGNMENT):**

| Wave | P4 DF (historical) | Ten audyt (Owner prompt 2026-10-06) |
|------|--------------------|-------------------------------------|
| P5 | Project/Track/Clip/timeline/**lyrics/play events** | Extensible Studio Foundation (Project→Clip→Take) |
| P6 | Samples/effects/ratings… | Effects / Mix / Master |
| P7 | Publication / Mix productization / social | Creative audio (sample, instruments…) |

→ Patrz **§36 Owner Decisions** (boundary rename).

---

## 4. Co można ponownie wykorzystać

### MUST REUSE (do not rewrite)

1. **Take transport** — `take-transport.ts` / anon transport / finalize / eligibility  
2. **MediaRecorder module** — `media-recorder.ts` + `client-upload.ts`  
3. **Recording UI state machine** — `recording-ui-state.ts` (extend, don’t fork)  
4. **PlaybackShell contracts** — `playFromStart` / `stopPlayback` / `setControlsLocked`  
5. **Waveform stack** — `waveform.tsx`, live mic, take preview rails  
6. **AuthZ gates** — `assertTakeRecordAccess`, `assertOwnReadyTakeAccess`, Sample Policy  
7. **Storage paths** — `take-audio` user/anon; do not invent parallel mic storage for Studio takes  
8. **E3 render_jobs + audio_artifacts** — bounce/merge later as new kind or artifact purpose  
9. **PlayerProvider `setSuppressed`** — Studio REC must suppress sticky mini-player  
10. **listOwnTakes / My Recordings** — library of source Takes for Clip import

### MUST NOT DUPLICATE

- Eligibility logic outside `recording-eligibility(-service)`  
- Download AuthZ outside `take-download` / export capability  
- Beat playback signed URL purpose (PLAYBACK vs DOWNLOAD)  
- Mix parameter validation outside E3 services

### REUSE WITH ADAPTER

| Existing | P5 adapter |
|----------|------------|
| `BeatRecordingSurface` | Becomes one **entry mode** (“Szybkie nagranie na bicie”) vs **Project Studio** |
| `MixPanel` | Remains beat-surface mix; Project Master bus is separate extension point (P6) |
| `audio_offset_ms` | Take-level source alignment; Clip adds timeline placement fields |

---

## 5. P3 / P4 compatibility

### 5.1 Take integration rule (critical)

**Jak obecny Take wykorzystać w Studio bez łamania P3/P4:**

1. **Take = immutable source blob + lifecycle** (PENDING→READY→EXPIRED/DELETED).  
2. **Clip.references `take_id`** (FK) — nie kopiuje bajtów.  
3. **Studio recording** (authenticated Project) tworzy **nowy Take** tym samym pipeline’em (`session` → upload → `finalize`), potem **Clip** na timeline.  
4. **Anonymous QT** pozostaje na **beat detail** (D02/P3). Project Studio = **wymaga konta**.  
5. **P3 claim** nie wchodzi w Project schema — claim nadal przenosi Take `anon→user`; Clip może później **zaimportować** claimed Take.  
6. **P4 title / author / ladder / RAW / TAKE_EXPORT** działają na Take niezależnie od Project.  
7. **`audio_offset_ms`** — zachować; dziś zawsze `0` (REC from start). Punch/timeline używa pól **Clip**, nie przebudowuje Take.  
8. **Nie** dodawać Project-only kolumn do `takes` poza ewentualnym opcjonalnym `source_project_id` / `source_clip_id` (nullable, additive) — preferowane: reverse FK tylko z Clip→Take.

### 5.2 Regression contracts

| Contract | P5 must |
|----------|---------|
| Ownership XOR | Never break CHECK |
| Anon path `anon/{hash}/takes/{id}/mic.bin` | Untouched |
| User path `user/{owner}/takes/{id}/mic.bin` | Untouched for Studio-created takes |
| Eligibility before getUserMedia | Keep for all REC entry points |
| MIX vs TAKE_EXPORT kind XOR | Keep |
| PlayerProvider / StickyMiniPlayer | Keep suppression contract |

**Assessment:** Compatible if P5 is a **new layer**, not a Take rewrite.

---

## 6. Project model

### 6.1 Purpose

Kontener utworu użytkownika — nie marketplace `beats`, nie `creator_tracks` (publish later).

### 6.2 Proposed persisted fields

| Field | Persist? | Notes |
|-------|----------|-------|
| `id` | YES | uuid |
| `owner_id` | YES | = auth user; RLS |
| `title` | YES | user string; max ~120 (align Take title policy) |
| `status` | YES | `DRAFT` \| `ACTIVE` \| `ARCHIVED` (no publish in P5) |
| `tempo_bpm` | YES | numeric; Project tempo SSOT |
| `time_signature_num` / `time_signature_den` | YES | e.g. 4/4 |
| `beat_id` | YES nullable | **reference** to marketplace beat (optional BEAT track seed) |
| `timeline_length_ms` | YES | project length (derived or explicit) |
| `schema_version` | YES | for migration of document shape |
| `created_at` / `updated_at` | YES | |
| Master volume/pan | YES | lightweight master bus state |
| Metronome prefs | YES or local | see §14 — recommend persist volume/on + count-in bars |
| Device prefs | LOCAL preferred | deviceId ephemeral across browsers |
| Playhead position | LOCAL / session | not durable SSOT |
| Publication state | NO in P5 | P7+/publish wave |
| Full mix FX chain | NO in P5 | P6 |
| Lyrics document | NO in P5 MVP | defer (was in P4 DF P5 list) |

### 6.3 Autosave / recovery (product)

- **Server document** (tracks/clips/settings) = durable SSOT  
- **Local draft buffer** (IndexedDB) = crash/refresh safety for in-flight edits + pending upload tokens  
- Status UI: „Zapisano” / „Zapisywanie…” / „Błąd zapisu — spróbuj ponownie”

### 6.4 Non-goals for Project

- Public catalog listing  
- Social reactions  
- Replacing `beats` table

---

## 7. Track model

### 7.1 Principle

Track = **channel**, not “vocal editor object”. Avoid `if (type === "VOCAL")` for core behavior.

### 7.2 Fields

| Field | Notes |
|-------|-------|
| `id`, `project_id` | |
| `name` | Polish default names: „Wokal”, „Bit”, … |
| `type` | enum **extensible**: `VOCAL` \| `BEAT` \| `SAMPLE` \| `SCRATCH` \| `INSTRUMENT` \| `GUITAR` \| `FX` \| `BUS` \| `OTHER` |
| `sort_order` | integer |
| `gain_db` / `pan` | track mixer |
| `muted`, `solo` | |
| `record_armed` | only one armed typical; allow policy later |
| `input_device_hint` | optional string deviceId preference |
| `output_route` | enum stub: `MASTER` (P5) · future buses P6 |
| `color` | optional UX |
| `effects_chain` | **NULL / empty jsonb stub** — P6 owns schema |
| `automation` | **NULL stub** — P6 |

### 7.3 Behavior by capability, not type

Core ops (mute/solo/volume/arm/order) are type-agnostic.  
Type-specific **plugins** later: BEAT pulls marketplace audio; SAMPLE pulls library (P7); VOCAL default arm target.

---

## 8. Clip model

Clip = **placement on timeline**, not a Take.

| Field | Notes |
|-------|-------|
| `id`, `track_id` | |
| `source_kind` | `TAKE` \| `BEAT_REF` \| `ARTIFACT` \| (future `SAMPLE`…) |
| `source_take_id` | nullable FK → takes |
| `source_beat_id` | nullable FK → beats (BEAT track) |
| `source_artifact_id` | nullable FK → audio_artifacts (bounce) |
| `timeline_start_ms` | project time |
| `timeline_end_ms` **or** `duration_ms` | prefer start + duration |
| `source_offset_ms` | trim start into source |
| `gain_db`, `muted` | clip-level |
| `fade_in_ms`, `fade_out_ms` | P5 basic OK |
| `pitch_cents`, `stretch_ratio` | **NULL / unused in P5** — P7 |
| `effects` | stub — P6 |

**Invariant:** deleting Clip does **not** delete Take (soft unlink).  
**Invariant:** Take EXPIRED/DELETED → Clip becomes unavailable (UI + AuthZ), not silent ghost play.

---

## 9. Take integration (detail)

```text
Marketplace Beat ──(reference)──► Track(type=BEAT) ──► Clip(source=BEAT_REF)
User mic recording ──► Take (existing pipeline) ──► Clip(source=TAKE)
E3 MIX / bounce ──► audio_artifacts ──► Clip(source=ARTIFACT)   [P5.late / P6]
```

### Recording into Project

1. Arm Track  
2. Set punch/pre-roll/count-in  
3. Eligibility (P4.1) for `project.beat_id` or selected beat context  
4. Existing session/finalize → new Take  
5. Create Clip at punch start with `source_offset_ms=0`, `duration_ms=recorded`  
6. Optional: set Take.title from Project context (user can edit via P4 title API)

### Import existing Take

- From `/account/takes` picker → Clip on VOCAL track  
- Respect ownership + READY + not expired

---

## 10. Timeline architecture

### 10.1 Time SSOT

| Layer | Unit |
|-------|------|
| **Persisted DB** | **integer milliseconds** (P4 DF frozen) |
| **Runtime engine** | AudioContext samples / high-res seconds converted at edges |
| **UI display** | `mm:ss.mmm` Polish formatting |

**Do not** persist float seconds as SSOT.

### 10.2 Time domains

| Domain | Meaning |
|--------|---------|
| Project time | Absolute timeline 0…length |
| Track time | Same as project (tracks share ruler) |
| Clip time | `[timeline_start_ms, timeline_start_ms+duration_ms)` |
| Take source time | 0…take.duration; + legacy `audio_offset_ms` vs beat when captured |
| Playback time | Transport playhead in project ms |
| Recording time | Wall/capture clock mapped onto punch window |

Compatibility: today’s REC-from-0 ⇒ Take `audio_offset_ms=0` and Clip at `timeline_start_ms=0`. Punch at `01:24.500` ⇒ Clip `timeline_start_ms=84500`, new Take still starts at source 0.

### 10.3 Transport features (P5 scope)

| Feature | P5 |
|---------|----|
| Play / Stop / Pause / Playhead | IN |
| Current time display | IN |
| Zoom / scroll | IN |
| Move / Trim / Split / Delete / Duplicate Clip | IN |
| Snap (grid / bar / ms) | IN (basic) |
| Loop region | IN (basic) |
| Pre-roll | IN |
| Punch-in / Punch-out | IN |
| Count-in | IN (with metronome) |
| Full automation lanes | OUT → P6 |
| Pitch/stretch UI | OUT → P7 |

---

## 11. Recording architecture

### 11.1 Flow (Project Studio)

```text
1  Wybór Track (record_armed)
2  Wybór mikrofonu (deviceId)
3  Wybór wyjścia (jeśli browser pozwala)
4  Test urządzenia + poziom wejścia
5  BPM Project + metronom
6  Count-in / pre-roll
7  Punch start/end (opcjonalnie)
8  Eligibility (reuse P4.1) — BEFORE getUserMedia arm if not already streaming for monitor
9  REC → MediaRecorder (reuse)
10 Upload/finalize → Take
11 Clip na timeline
12 Odsłuch (Studio transport, not PlayerProvider catalog)
```

### 11.2 Monitoring

- Input Monitor reuse (`BrdInputMonitor` / mic analyser)  
- Headphones tip in Polish help  
- Clipping warning on input + master peak

### 11.3 Failure / recovery

| Event | Behavior |
|-------|----------|
| Abort REC | Discard PENDING take (existing delete/janitor paths) |
| Upload fail | FAILED take + Polish recovery message |
| Refresh mid-upload | Local recovery token + server PENDING unique constraints |
| Offline | Block REC start with clear Polish message |
| Quota / cap | Eligibility DENY messages (existing Soft/Hard codes) |

---

## 12. Punch-in / Punch-out

### 12.1 Product rule

User sets:

- START `01:32.500`  
- END `01:38.200`  

Records **only that window**. No requirement to record whole verse from 0.

### 12.2 Architecture

1. Transport plays from `punchStart - preRoll` (or count-in bars)  
2. At punchStart: MediaRecorder start (or keep rolling and mark keep-region — prefer **start at punch** after pre-roll monitoring)  
3. At punchEnd: stop  
4. **Always new Take** + **new Clip** at punchStart  
5. Existing clips **untouched** (layering / comping later)  
6. Optional future: “replace clip region” = explicit user action (not default)

### 12.3 Pre-roll / count-in

- Pre-roll: ms before punch (audition beat)  
- Count-in: 1/2/4 bars via metronome; option „wyłącz metronom po odliczeniu”

---

## 13. BPM

| Concern | SSOT |
|---------|------|
| Project tempo | `projects.tempo_bpm` |
| Beat seed | copy initial from `beats.bpm` when creating Project from beat — **editable thereafter** |
| Take snapshot | keep `beat_bpm_snapshot` on Take (historical) |
| Metronome / grid | derive from Project tempo + time signature |
| Tap tempo | client helper → writes Project tempo |
| Marketplace beat BPM | unchanged BPM SSOT for catalog |

Manual entry · `+`/`−` · Tap Tempo = P5 UX on Project tempo.

---

## 14. Metronome

Polish UX: „Metronom” — „tik” / „pik”.

| Control | Spec |
|---------|------|
| WŁ/WYŁ | boolean |
| BPM | bound to Project tempo |
| Takt | time signature |
| Głośność | 0…1 |
| Count-in | 0 / 1 / 2 / 4 takty |
| Podczas nagrania | on/off |
| Po odliczeniu | auto-off option |

Implementation: Web Audio click scheduler locked to transport; not a second PlayerProvider track.

---

## 15. Audio Devices

| Topic | Guidance |
|-------|----------|
| Input | `navigator.mediaDevices.enumerateDevices` after permission |
| Output | `setSinkId` where available (Chromium); graceful degrade elsewhere |
| Permissions | Polish prompts; deny → actionable error |
| Devicechange | re-enumerate; if selected device gone → fallback + warn |
| Mobile | often single default mic/speaker; hide advanced output if unsupported |
| Latency | measure RTT approx / buffer size; expose “Kompensacja opóźnienia (ms)” advanced |
| Monitoring | software monitor with latency warning (headphones recommended) |

**Do not assume** identical behavior Safari iOS vs Chrome Android vs Desktop.

---

## 16. Monitoring

- Track Solo / Mute  
- Input Monitor (existing)  
- Master peak  
- Optional analyzer panel (§20)  
- Tip: słuchawki przy wokalu

---

## 17. Latency

| Layer | Approach |
|-------|----------|
| Input monitoring | warn + optional ms compensation on clip placement |
| Punch alignment | apply `latency_compensation_ms` when placing Clip |
| Persist | per-user preference (profile or local), not per-Take rewrite |
| Calibration wizard | Advanced mode — optional P5.late |

---

## 18. Beat Track

- Track `type=BEAT` references `project.beat_id` / Clip `BEAT_REF`  
- Waveform from existing PlaybackShell/Waveform peaks  
- Controls: play via **Studio transport**, volume/mute/solo/pan  
- BPM display from Project (seeded from beat)  
- Start offset: Clip `source_offset_ms` + `timeline_start_ms`  
- **Do not** merge marketplace `beats` row into Project tables

---

## 19. Master

P5 Master bus (minimal):

- Volume · Pan · Peak meter · Clip warning  
- Extension point: `master_fx_chain jsonb NULL` for P6  

E3 MixPanel on beat page remains; Project Master ≠ automatically E3 `mix_sessions` until explicit bridge.

---

## 20. Analyzer (optional panel)

Optional, collapsed by default:

- Peak / True Peak (approx) · LUFS (approx) · spectrum · L/R  

Must not dominate Basic mode. Advanced toggle only.

---

## 21. Undo / Redo

| Approach | Recommendation |
|----------|----------------|
| Model | Command stack on Project document ops |
| Scope | move/trim/split/delete/duplicate clip · track volume/pan/mute/solo/order/rename · punch create (undo removes Clip link, not necessarily Storage Take immediately) |
| Persist | stack session-local; optional server “revision” later |
| Destructive Take delete | **not** on Undo of clip remove — soft unlink only |

---

## 22. Autosave / Recovery

| State | Store |
|-------|-------|
| Project document | Postgres (debounced PATCH) |
| In-progress REC blob | existing Take PENDING upload |
| UI draft (playhead, selection) | session/local |
| Conflict | server `updated_at` / version column → reload+toast |

**Hard requirement:** refresh must not lose a completed Take; at worst lose unsynced clip placement (recoverable from Take library).

---

## 23. Merge / Bounce

P5 designs the **contract**, full bounce can be late unit:

- Action: „Scal do nowej ścieżki”  
- Output: new `audio_artifacts` row (+ optional Take-like or ARTIFACT clip source)  
- Sources **retained**  
- Prefer new `render_jobs.kind` value later (`PROJECT_BOUNCE`) **or** artifact purpose — **do not** overload MIX incorrectly  
- Worker dependency: same BLOCKED_INFRA reality as P4.6 until worker GO

---

## 24. UX

### Modes

**Podstawowy:** Bit · Play/Stop · REC · Mikrofon · Wyjście · BPM · Metronom · Volume · Mute · Solo · Asystent nagrania  

**Zaawansowany:** Punch · Pre-roll · dokładny czas · latency · routing stub · analizator · snap/grid  

### Recording Assistant („Gotowe do nagrania”)

Checklist: Mikrofon · Wyjście · BPM · Metronom · Count-in · Track · Start · Poziom.  
On fail: **CO JEST NIE TAK** + **CO ZROBIĆ** (Polish).

### Help

Sparse tooltips / `?` / „Co to robi?” — e.g. punch tip, headphones tip. No wall of text.

---

## 25. Polish localization

- All Studio chrome Polish (buttons, errors, empty states, onboarding)  
- Extend `src/lib/ui/labels.ts` pattern  
- Technical aliases allowed secondarily: „Punch-in — nagraj tylko wybrany fragment”  

**Tension with POLISH-01 OD-PL-05** („Studio KEEP EN” as nav/brand): keep brand word **Studio** in nav; **controls** Polish. → Owner confirm §36.

---

## 26. Mobile

| Surface | Approach |
|---------|----------|
| Phone | Basic mode default · simplified transport · vertical track list · pinch zoom timeline · avoid dense mixer |
| Tablet | Hybrid — more timeline room |
| Desktop | Full Advanced |

Touch: drag handles with large hit targets; long-press clip menu; snap stronger on touch.  
Desktop-only OK: multi-track drag precision, analyzer, latency calibration.

**Do not** shrink a Pro Tools clone onto 390px.

---

## 27. Storage

| Bucket | P5 |
|--------|-----|
| `take-audio` | All new mic Takes (unchanged keys) |
| `audio-artifacts` | Bounce/export later |
| `beat-audio` | Read-only refs for BEAT clips |
| New Project blob bucket | **Avoid in P5** unless bounce needs project-scoped stems |

Lifecycle: Take expiry still applies; Project should warn when Clip source expired.  
Quota: reuse Sample Policy + future project caps (Owner decision if separate).

---

## 28. Security

| Asset | Rule |
|-------|------|
| Project/Track/Clip | owner_id RLS · service_role mutations (mirror takes pattern) |
| Take access | existing AuthZ — Studio APIs must call same gates |
| IDOR | every projectId/trackId/clipId ownership check server-side |
| Storage | signed URLs only; no public project audio |
| Export | existing TAKE_EXPORT / MIX AuthZ |
| Sharing | OUT of P5 (future grants on Project) |

---

## 29. P6 extension points

| Hook | Location |
|------|----------|
| Track `effects_chain` jsonb | Per-track insert slots |
| Clip `effects` jsonb | Clip inserts |
| Master `master_fx_chain` | Bus |
| Automation tables | future `*_automation_points` |
| Mix bus tracks | `type=BUS` + routing graph |
| Analyzer → metering API | read-only from graph |
| Bridge to E3 `mix_sessions` | optional adapter when productizing Mix |

Do **not** implement FX in P5.

---

## 30. P7 extension points

| Hook | Location |
|------|----------|
| `source_kind=SAMPLE` | Clip + sample library table later |
| Track types INSTRUMENT/GUITAR/SCRATCH | already in enum |
| Scratch Pad | UI region binding to SAMPLE clips |
| pitch/stretch fields on Clip | reserved columns |
| reverse/loop flags | reserved |
| Drag from library | Clip create API |

---

## 31. DB proposal (design only — no migration now)

```text
studio_projects
studio_tracks
studio_clips
studio_project_revisions? (optional late)
```

**Rules:**

- FK Clip → Take / Beat / Artifact (nullable by source_kind)  
- CHECK source XOR by kind  
- RLS owner-only  
- privilege-escalation trigger (service_role write) like takes  
- Indexes: `(project_id, sort_order)`, `(track_id, timeline_start_ms)`, `(owner_id, updated_at)`  
- **No** Project/Track/Clip tables in P4 era — additive only after Owner GO  

Optional additive on `takes`:

- `origin_project_id uuid NULL` — audit only; not required for MVP if Clip is enough

---

## 32. API proposal (design)

| API | Role |
|-----|------|
| `POST /api/studio/projects` | create (optional beat seed) |
| `GET/PATCH /api/studio/projects/[id]` | load/autosave document |
| `POST .../tracks` · PATCH · reorder | track CRUD |
| `POST .../clips` · PATCH · split · delete | clip ops |
| `POST .../record/session` | thin wrapper → existing take session + returns clip draft plan |
| `POST .../record/finalize` | finalize take + create clip |
| Reuse | `/api/takes/eligibility`, preview, title, download, export |

**Anonymous:** no Project APIs.

---

## 33. UI / component proposal

| Component | Role |
|-----------|------|
| `StudioProjectPage` | `/studio/p/[projectId]` (new; keep `/studio` hub) |
| `StudioTransport` | playhead/transport (separate from PlayerProvider) |
| `StudioTimeline` | tracks/clips/zoom |
| `StudioTrackHeader` | arm/solo/mute/vol/pan/name |
| `StudioRecordingAssistant` | readiness checklist |
| `StudioMetronome` | |
| `StudioDevicePicker` | |
| `StudioModeToggle` | Podstawowy / Zaawansowany |
| Reuse | Waveform · RecordingPanel internals · Input Monitor · OwnTakesList picker |

Route strategy:

- Keep `/studio` → account hub **or** evolve to Project list (Owner UX)  
- Beat detail **Quick Record** remains for P3/anon + cold start  
- Deep Studio = authenticated Project editor

---

## 34. Risks

| Risk | Mitigation |
|------|------------|
| Scope creep into DAW/P6 | Hard OUT list in Design Freeze |
| Breaking PlayerProvider | Separate StudioTransport |
| Take rewrite temptation | Reference-only rule |
| Worker STOPPED blocks bounce/export | Mark bounce BLOCKED_INFRA-tolerant |
| Mobile timeline frustration | Basic mode default |
| Dual eligibility paths drift | Single eligibility service |
| Clip→expired Take | UX + AuthZ deny play |
| POLISH-01 vs full Polish Studio | Owner decision |
| Document autosave conflicts | version column |
| Latency mis-alignment punch | compensation + tests |

---

## 35. Open Questions (technical defaults applied)

Resolved by Architect in this audit (no Owner needed):

- Integer ms persisted SSOT — YES  
- Clip references Take — YES  
- Punch creates new Take+Clip — YES  
- Anon outside Project Studio — YES  
- Avoid `if vocal` architecture — YES  
- MIX ≠ TAKE_EXPORT preserved — YES  

---

## 36. Owner Decisions Required

| ID | Topic | Consequences | Recommendation |
|----|-------|--------------|----------------|
| **OD-P5-01** | Confirm P5/P6/P7 boundary rename vs P4 DF §23 | Docs continuity | **Adopt this audit’s boundaries**; amend P4 DF note “superseded for P5+ naming” |
| **OD-P5-02** | Lyrics / play events in P5? | Scope + schema | **OUT of P5** (defer) |
| **OD-P5-03** | `/studio` becomes Project list vs stay account alias | IA | Project list at `/studio` + keep Quick Record on beat |
| **OD-P5-04** | Polish controls vs OD-PL-05 Studio KEEP EN | UX | Brand „Studio” EN; **all controls PL** |
| **OD-P5-05** | Project without beat allowed? | Empty BEAT track | **Allow** scratch Project; beat optional |
| **OD-P5-06** | Bounce/merge in P5 vs defer to worker GO | Infra | **Design in P5 · ship UI later** if worker STOPPED |
| **OD-P5-07** | Separate project storage quota vs Sample Policy only | Abuse | Start with Sample Policy + max projects soft cap |

---

## 37. P5 implementation sequence

### P5.1 — Domain foundation (schema + AuthZ + ms time)

- **Scope:** `studio_projects` / `tracks` / `clips` · RLS · service mutations · types · no rich UI  
- **Deps:** none  
- **Tests:** XOR sources · ownership IDOR · ms constraints  
- **AC:** CRUD project owned-only; Clip cannot reference foreign Take  
- **Risk:** over-modeling FX fields — keep stubs null  

### P5.2 — Studio transport + timeline read-only

- **Scope:** Project page · playhead · BEAT clip playback via StudioTransport · zoom/scroll  
- **Deps:** P5.1  
- **Tests:** play/pause/seek; PlayerProvider undisturbed  
- **AC:** play Project with BEAT track; sticky mini-player suppressed when appropriate  
- **Risk:** engine merge — forbid  
- **Repo status:** implemented (StudioTransport + BEAT_REF HTMLAudio; Production Verification = separate gate)

### P5.3 — Clip editing ops

- **Scope:** move/trim/split (delete/duplicate/undo deferred)  
- **Deps:** P5.2  
- **Tests:** ms math · source immutability · ownership  
- **AC:** edit without destroying Takes  
- **Repo status:** implemented (MOVE/TRIM/SPLIT; Production Verification = separate gate)

### P5.4 — Track controls + mixer basics

- **Scope:** name/order/volume/pan/mute/solo/arm · Master vol/pan/peak  
- **Deps:** P5.2  
- **Tests:** solo exclusivity rules · persistence  
- **AC:** Polish controls; mobile Basic layout  

### P5.5 — Devices + monitoring + metronome + BPM

- **Scope:** device picker · input level · metronome · tap tempo · count-in  
- **Deps:** P5.4  
- **Tests:** permission deny paths · devicechange  
- **AC:** Assistant checklist green path  

### P5.6 — Project recording + Take→Clip

- **Scope:** arm track · eligibility reuse · session/finalize reuse · auto Clip  
- **Deps:** P5.5 · P4.1  
- **Tests:** P3 untouched · P4 eligibility · new Take + Clip  
- **AC:** record into Project without breaking beat Quick Record  

### P5.7 — Punch / pre-roll

- **Scope:** punch in/out · pre-roll · place Clip at start  
- **Deps:** P5.6  
- **Tests:** timing accuracy tolerances · latency compensation hook  
- **AC:** record `01:32.500`–`01:38.200` window  

### P5.8 — Import library Takes + My Recordings bridge

- **Scope:** picker from own READY takes → Clip  
- **Deps:** P5.3 · P4 list  
- **Tests:** expired deny  
- **AC:** import without re-upload  

### P5.9 — Autosave / recovery / Assistant polish

- **Scope:** debounced save · version · recovery UX · full Polish copy · Basic/Advanced  
- **Deps:** P5.1–P5.8  
- **Tests:** refresh retention · conflict toast  
- **AC:** no lost Take on refresh  

### P5.10 — Bounce contract (optional ship) + hardening

- **Scope:** API/UI “Scal…” · artifact kind design · BLOCKED_INFRA note if worker down  
- **Deps:** E3 worker reality  
- **Tests:** sources retained  
- **AC:** design complete; ship gated on worker OR explicit stub status  

---

## 38. Acceptance Criteria (epic-level)

1. Authenticated user can create Project with optional Beat track.  
2. Timeline Play/Stop/Pause/Seek works in project ms.  
3. User can record onto armed Track → Take + Clip via existing take pipeline.  
4. Punch-in/out records partial region without requiring start-from-zero.  
5. Mute/Solo/Volume/Pan/Arm/Rename/Reorder tracks work and persist.  
6. Metronome + count-in Polish UX.  
7. Device selection with graceful mobile degrade.  
8. Clip edits do not delete source Takes.  
9. P3 anon claim + beat Quick Record still GREEN.  
10. P4 eligibility/title/My Recordings/RAW/TAKE_EXPORT/MIX split still GREEN.  
11. PlayerProvider catalog playback unaffected.  
12. No Project/Track/Clip logic implemented as Take columns soup.  
13. Extension stubs present for P6/P7 without FX/sample features shipping.  
14. Mobile Basic mode usable for REC + play.  
15. All user-facing Studio strings Polish (brand exception per OD-P5-04).

---

## 39. Test Strategy

| Layer | Focus |
|-------|-------|
| Unit | ms math · punch window · clip trim/split · undo commands · tempo/grid |
| AuthZ | IDOR project/clip/take · RLS |
| Integration | record→take→clip · eligibility before mic · import take |
| Regression | P3 claim · P4 download ladder · MIX vs TAKE_EXPORT · PlayerProvider suppress |
| Browser matrix | Chromium desktop · Safari iOS · Chrome Android (devices/output) |
| Mobile UX | Basic mode REC checklist |
| Infra-tolerant | bounce/export when worker STOPPED → explicit BLOCKED status |

---

## 40. GO / NO-GO

```text
P5 ARCHITECTURE: GO
```

**Why GO**

- Clear reuse of Take/E3/PlaybackShell/Eligibility without rewrite  
- Time SSOT already frozen (ms)  
- Separation of engines already proven (Fala 3.5.1)  
- Extensible Track/Clip source_kind avoids vocal-only trap  
- P3/P4 regression path is isolation-by-reference  

**Blocking only for implementation start (not architecture):**

- Owner GO on Design Freeze + OD-P5-01…07  
- Implementation prompt per P5.1…P5.N  

**Not blockers:** Contabo STOPPED (bounce/export infra-tolerant); existing local WIP (unrelated).

---

# P5 DESIGN FREEZE PROPOSAL

## F1. P5 contains

- Project / Track / Clip foundation  
- Timeline transport (play/stop/pause/playhead/zoom/edit ops)  
- Track mixer basics (arm/solo/mute/vol/pan/order/name)  
- Beat-as-track reference  
- Master volume/pan/peak  
- BPM + metronome + count-in + pre-roll  
- Punch-in/out  
- Device input (+ output where supported)  
- Recording Assistant (Polish)  
- Basic / Advanced modes  
- Autosave + recovery strategy  
- Undo/redo for document ops  
- Take reference integration (record + import)  
- Extension stubs for P6/P7  
- Bounce **contract** (ship may be infra-gated)

## F2. P5 does NOT contain

- Full FX racks / autotune / automation lanes (P6)  
- Sample library / scratch pad / instruments (P7)  
- Publication / creator_tracks social (later)  
- Lyrics editor (deferred)  
- Rewriting Take ownership / P3 / P4 download  
- Merging PlayerProvider with StudioTransport  
- Starting Contabo worker  
- Anonymous Project Studio  

## F3. Data model (frozen intent)

```text
studio_projects 1─┬─* studio_tracks 1─┬─* studio_clips
                  │                   └─ source → Take | Beat | Artifact
                  └─ optional beat_id (marketplace ref)

takes = source SSOT (unchanged lifecycle)
```

## F4. Runtime model

- StudioTransport (project timeline)  
- PlaybackShell patterns for BIT sync during REC  
- PlayerProvider remains catalog-only  
- MediaRecorder + take transport reused  

## F5. Timeline model

- Persisted integer ms  
- Punch/pre-roll/loop/snap  
- Clip placement ≠ Take rewrite  

## F6. Recording / device flow

- Assistant checklist → eligibility → devices → metronome/count-in → REC → Take → Clip  
- Latency compensation preference  

## F7. UX / mobile / security

- Polish UI · Basic default on phone · owner-only RLS · signed URLs · no IDOR  

## F8. Boundaries

| Boundary | Rule |
|----------|------|
| P5 / P6 | Stubs only for FX/automation/buses |
| P5 / P7 | Enum/source_kind reserved; no library |
| P5 / P3 | Anon stays on beat Quick Record |
| P5 / P4 | Take APIs reused; no ladder/AuthZ fork |
| P5 / E3 | MIX jobs unchanged; bounce ≠ MIX misuse |

## F9. Freeze verdict (proposal)

```text
P5 DESIGN FREEZE PROPOSAL: READY FOR OWNER GO
```

Implementation **forbidden** until Owner explicitly accepts this freeze (and OD-P5-* decisions).

---

## Git / WIP continuity (this audit session)

| Item | Value |
|------|-------|
| HEAD before/after | `bface6c36661e9bdc9142add85f58a03ea2e1760` |
| origin/main | `bface6c36661e9bdc9142add85f58a03ea2e1760` |
| Worktree before | dirty (pre-existing WIP + untracked audits/scripts) |
| Worktree after | **only additive** `docs/architecture/P5_STUDIO_ARCHITECTURE_AUDIT.md` |
| Existing WIP | **UNTouched** (`recording-eligibility-service.ts`, `p4-live-verify.test.ts`, other WIP) |
| Commits | **none** |
| Migrations / code | **none** |
| P3 regression assessment (arch) | **SAFE** if reference model followed |
| P4 regression assessment (arch) | **SAFE** if Take pipeline reused |
| Architecture recommendation | **P5 ARCHITECTURE: GO** |

---

*End of audit. Stop. No implementation.*
