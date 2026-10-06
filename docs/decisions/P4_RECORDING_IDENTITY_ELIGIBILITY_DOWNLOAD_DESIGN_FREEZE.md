# P4 — Recording Identity, Eligibility & Download Foundation — DESIGN FREEZE

**Status:** DESIGN FREEZE COMPLETE — WAITING FOR OWNER IMPLEMENTATION GO  
**Date:** 2026-10-05  
**Decydent produktu:** Owner (Prezes Dawid)  
**Decyzje techniczne:** Architect + Cursor Agent (ten dokument)  
**Upstream audit:** P4 ARCHITECTURE AUDIT (chat session · READ-ONLY)  
**Related SSOT:** [RECORDING_SAMPLE_DOWNLOAD_DESIGN_FREEZE.md](./RECORDING_SAMPLE_DOWNLOAD_DESIGN_FREEZE.md) · [architecture/RECORDING.md](../architecture/RECORDING.md) · P1 Sample Policy · E3 audio-render

```text
THIS DOCUMENT           = DESIGN FREEZE ONLY
IMPLEMENTATION          = NOT AUTHORIZED (awaits Owner GO)
CODE / DB / STORAGE     = ZERO mutations in this gate
COMMIT / PUSH / DEPLOY  = NO
P3 / P1 / P2 / Fala 3.5.1 = CLOSED — do not reopen
NEXT GATE               = Owner Implementation GO → P4.1…
```

---

## 1. Status

```text
P4 NAME (canonical):
  Recording Identity, Eligibility & Download Foundation

DESIGN FREEZE = COMPLETE
IMPLEMENTATION = NOT STARTED
PRODUCTION VERIFY = N/A

NAMING:
  Former “P4-A / P4-B” split = REJECTED
  Sample-freeze “P4 GOLD take download” = ABSORBED into this P4 (units P4.4–P4.6)
```

---

## 2. Baseline

| Plane | Value |
|-------|--------|
| Repository HEAD / origin/main | `9d72e9e5b7f40ee07d9c7fe130eb714f73435a40` (`9d72e9e`) |
| Production application | `dabbc936` · `dpl_Hd4QAwDkkw99FMiFhh8nJ1N6nvsR` |
| Production URL | https://www.bitrymdym.pl |
| Note | `9d72e9e` = docs-only tip · **no redeploy required** for this freeze |

**Closed prerequisites (must remain GREEN):** P0 · P1 · P2 · P3 · Fala 3.5.1.

---

## 3. Problem

1. Eligibility recording jest częściowo egzekwowana w sesji/finalize, ale UX może otworzyć mic zanim user dostanie jasny DENY + Premium CTA.  
2. Take nie ma **tożsamości produktowej** (title); lista `/account/takes` to głównie status/TTL.  
3. `canDownloadOwnTake` istnieje w Sample Policy, ale **`take-download.ts` nie egzekwuje** GOLD + counter C.  
4. Brak drabiny jakości pobrań (128/192/320/WAV) i LOCKED UX.  
5. E3 eksportuje **mix** beat+take; take-only multi-bitrate **nie istnieje**.  
6. Pomyłka nazewnicza „P4” groziła rozjechaniem epiku.

---

## 4. Goal

Jeden spójny fundament:

1. **Recording Eligibility** — server-side gate przed mic.  
2. **Recording Identity** — title + author z profilu + beat + duration.  
3. **My Recordings** — rozszerzenie `/account/takes`.  
4. **Download UX** — pełna lista jakości + LOCKED.  
5. **Download capability enforcement** — server AuthZ + ledger.  
6. **Take export pipeline** — worker FFmpeg → `audio_artifacts` (+ `EXPORT_MP3_192`).  
7. **Studio compatibility** — Take pozostaje source; Project/Track/Clip później.

---

## 5. Scope (IN)

| Area | IN |
|------|-----|
| Eligibility gate | Server resolve Sample Policy + product entitlement przed start REC |
| Identity | Additive `takes.title`; author = `profiles.display_name` |
| My Recordings | Extend `/account/takes` (no new route) |
| Download UX | Full quality ladder + LOCKED + plan hint |
| AuthZ download | Enforce capabilities + ownership + READY + object binding |
| Raw take DL | `DOWNLOAD_OWN_TAKE_RAW` ≡ `canDownloadOwnTake` (GOLD + daily C) |
| Rendered export | Take-only render jobs → artifacts · MP3 128/192/320 · WAV |
| Capability | Add `EXPORT_MP3_192`; map 128→`EXPORT_BASIC_MP3`, 320→`EXPORT_HQ_MP3` |
| Docs / tests | Unit + live + regression P3/Fala |

---

## 6. Non-goals (OUT)

```text
OUT — absolute:
  full DAW / Project editor / Track / Clip editor
  multitrack · samples library · effects
  comments · reactions · rankings · Messenger · presence
  creator_tracks publication · public song catalog
  payments / checkout
  Mix/Master product rebuild (E3 Mix remains separate plane)
  Contabo as durable media SSOT
  second Premium system
  lyrics on takes
  artwork implementation on Take (design only — DEFER ship)
```

---

## 7. Current architecture (facts)

```text
Beat detail → BeatRecordingSurface
  → RecordingPanel → TakeMediaRecorder
  → /api/takes/session|anon → take-audio …/mic.bin
  → finalize READY → preview/download signed GET
  → /account/takes

Sample Policy SSOT: getSamplePolicy + SAMPLE_POLICY_DEFAULTS
Product Premium:    PREMIUM_TIER_MATRIX + resolveProductEntitlement
Mix Export (E3):    mix_sessions → render_jobs → audio_artifacts
  EXPORT_BASIC_MP3=128 · EXPORT_HQ_MP3=320 · EXPORT_WAV
  WAV QC: 44.1 kHz / 16-bit PCM / stereo (AUDIO_CODEC)
```

**Gaps:** eligibility UX gate · `takes.title` · download GOLD enforcement · `take_download_events` · take-only render · `EXPORT_MP3_192` · LOCKED ladder UI.

---

## 8. Target architecture

```text
IDENTITY PLANE
  profiles.display_name ──author──► Take (title?, beat_id, duration, status)

ELIGIBILITY PLANE
  resolveProductEntitlement + getSamplePolicy
        ↓
  canStartRecording(beatId, actor) ──DENY──► UI message + Premium CTA (no mic)
        ↓ ALLOW
  RecordingPanel / MediaRecorder (Fala 3.5.1 unchanged engine)

SOURCE PLANE (immutable MIC)
  takes + take-audio …/mic.bin

DOWNLOAD PLANE (two products — do not merge names)
  A. RAW OWN TAKE
       DOWNLOAD_OWN_TAKE_RAW (= canDownloadOwnTake)
       → assertOwnReadyTakeAccess + GOLD + daily C
       → signed GET take-audio
       → take_download_events ledger

  B. RENDERED OWN TAKE EXPORT
       EXPORT_MP3_128 | EXPORT_MP3_192 | EXPORT_MP3_320 | EXPORT_WAV
       → take_export_jobs (or render_jobs kind=TAKE_EXPORT)
       → EXTERNAL worker FFmpeg
       → audio_artifacts
       → signed GET artifact
       → artifact download AuthZ + capability

MIX PLANE (existing E3 — orthogonal)
  mix_sessions → render_jobs (MIX) → audio_artifacts
  unchanged contract; do not overload as take-only without kind discriminant
```

**Timeline SSOT (frozen technical):** DB = integer **milliseconds**; editor runtime (P5+) = **samples**. Keep `audio_offset_ms`.

---

## 9. Data model

### 9.1 `takes` — additive

| Column | Type | Notes |
|--------|------|-------|
| `title` | `text NULL` | User-visible identity; empty → UI fallback (beat title / „Nagranie”) |
| *(existing)* | — | `owner_id` XOR anon · `beat_id` · `duration_seconds` · status · snapshots · `audio_offset_ms` |

**Constraints:** `title` max length **120** chars (CHECK / app validate). No UNIQUE.  
**Author:** **not** denormalized on take — always join/resolve `profiles.display_name` for `owner_id` (anon → „Gość” / no public author).

### 9.2 `take_download_events` — new (RAW ledger)

| Column | Notes |
|--------|-------|
| `id` | uuid PK |
| `user_id` | auth owner (GOLD path) |
| `take_id` | FK takes |
| `created_at` | timestamptz |
| UTC day bucket | for counter C (index `(user_id, created_at)` or generated day key) |

Increment **only after** successful signed-URL issuance (mirror OD-17 beat download order).  
**Never** reuse `beat_download_events`.

### 9.3 Take export jobs — new discriminant on existing plane

**Technical decision (REUSE FIRST):** extend `render_jobs` with:

| Field | Value |
|-------|--------|
| `kind` or `source_type` | `MIX` (default, backfill) \| `TAKE_EXPORT` |
| `take_id` | required when TAKE_EXPORT |
| `mix_session_id` | required when MIX (existing) |
| `quality_tier` | extend enum/tiers: add `MP3_192` alongside BASIC_MP3 / HQ_MP3 / WAV |

Alternatively (if enum coupling too tight): table `take_export_jobs` mirroring job lifecycle — **only if** Architect Review finds `render_jobs` coupling unsafe. **Preferred:** single jobs table + `kind`.

### 9.4 `audio_artifacts`

REUSE bucket `audio-artifacts`.  
Object key pattern (TAKE_EXPORT):

```text
user/{ownerId}/take-export/{takeId}/jobs/{jobId}/{TIER}.{mp3|wav}
```

Do **not** put rendered exports into `take-audio` (source bucket stays capture-only).

### 9.5 Artwork — DESIGN ONLY / IMPLEMENTATION DEFERRED

```text
Artwork belongs to future Project / creator_tracks — NOT to Take.
P4.7 implementation = DEFER
Design note only: path sketch user/{ownerId}/project/{projectId}/artwork.bin
Take must not grow cover_ref that later forces rewrite.
```

### 9.6 NOT in P4 schema

`projects` · `tracks` · `clips` · `lyrics_*` · `creator_tracks` · `comments` · `track_reactions` · messaging tables.

---

## 10. Capability model

### 10.1 Recording (Sample Policy axis — existing)

| Key | Source |
|-----|--------|
| `RECORDING_MAX_DURATION` | `getSamplePolicy().maxRecordingSeconds` |
| `RECORDING_DAILY_SESSIONS` | `maxSessionsPerUtcDay` |
| `RECORDING_ACTIVE_READY_CAP` | `maxActiveReady` |
| `DOWNLOAD_OWN_TAKE_RAW` | `canDownloadOwnTake` (GOLD only) |

### 10.2 Export (Product Premium axis — extend)

| UI quality | Capability key | Tier matrix (frozen product target) |
|-----------|----------------|--------------------------------------|
| MP3 128 kbps | `EXPORT_MP3_128` ≡ existing `EXPORT_BASIC_MP3` | FREE+ |
| MP3 192 kbps | **`EXPORT_MP3_192`** (NEW) | BRONZE+ |
| MP3 320 kbps | `EXPORT_MP3_320` ≡ existing `EXPORT_HQ_MP3` | SILVER+ |
| WAV study | `EXPORT_WAV` | GOLD |

**Aliases:** keep existing enum keys in code (`EXPORT_BASIC_MP3` / `EXPORT_HQ_MP3`) with documented mapping; UI labels use kbps names only.

**Update `PREMIUM_TIER_MATRIX.capabilities`:**

| Tier | Export caps (take-rendered + existing mix) |
|------|--------------------------------------------|
| FREE | `EXPORT_BASIC_MP3` |
| BRONZE | + `EXPORT_MP3_192` + existing `EXPORT_HQ_MP3`? **NO** — HQ 320 = SILVER+ |
| BRONZE | `EXPORT_BASIC_MP3`, `EXPORT_MP3_192` |
| SILVER | + `EXPORT_HQ_MP3` (+ MIX_PRO as today) |
| GOLD | + `EXPORT_WAV` (+ `DOWNLOAD_OWN_TAKE_RAW`) |

> **Note:** Today BRONZE already has `EXPORT_HQ_MP3` in E3 mix matrix. P4 **product ladder** for **take export** is stricter (320 = SILVER+).  
> **Technical decision:** Keep E3 mix capabilities as-is for MIX kind. Apply the FREE/BRONZE/SILVER/GOLD ladder above to **`TAKE_EXPORT` kind only** via dedicated resolver `canExportOwnTake(quality)`. Avoid breaking existing mix GOLD/SILVER contracts.

### 10.3 Extension slot (NOT implemented)

```text
MULTITRACK · MAX_TRACKS · ADVANCED_EDITING · SAMPLES · EFFECTS · PUBLICATION
```

---

## 11. Download model

### 11.1 UX labels (frozen copy)

```text
MP3 — 128 kbps — podstawowa jakość
MP3 — 192 kbps — wyższa jakość
MP3 — 320 kbps — najwyższa jakość MP3
WAV — bezstratny plik audio — jakość studyjna
```

LOCKED pattern:

```text
🔒 MP3 — 320 kbps
Dostępne w planie SILVER.
```

Show **full list** always. Never hide higher tiers.

### 11.2 WAV technical standard (REUSE E3)

```text
44.1 kHz · 16-bit PCM · stereo
(AUDIO_CODEC.WAV_SAMPLE_RATE / WAV_BIT_DEPTH)
```

No marketing claims beyond „bezstratny / jakość studyjna”.

### 11.3 Flows

**Eligibility DENY:** no `getUserMedia`; message from server error code + optional Premium upsell.

**RAW download:** GOLD ∧ owner ∧ READY ∧ not expired ∧ daily_C < 5 → signed take URL → ledger.

**Rendered download:** capability for quality ∧ owner ∧ READY → enqueue TAKE_EXPORT job (or reuse READY artifact) → signed artifact URL.

**Idempotency:** reuse existing SUCCEEDED artifact for same `(take_id, quality_tier)` while not expired.

---

## 12. Storage model

| Bucket | Content |
|--------|---------|
| `take-audio` | Source MIC `.bin` only |
| `audio-artifacts` | Mix exports **and** take-rendered exports (discriminated keys) |
| beat-audio | Unchanged · P0 PLATFORM download DENY |

Privacy: both take-audio and audio-artifacts remain **private**; signed GET only.

---

## 13. AuthZ

```text
canStartRecording:
  published beat eligible
  ∧ Sample Policy session/active/duration allow
  ∧ (auth or anon path rules)

assertOwnReadyTakeAccess:  REUSE + purposes preview|download|export
DOWNLOAD_OWN_TAKE_RAW:     canDownloadOwnTake ∧ daily C
canExportOwnTake(quality): owner ∧ READY ∧ EXPORT_* for TAKE_EXPORT
mix export:                existing E3 paths unchanged
```

**Forbidden client inputs:** `object_key`, Premium tier, spoofed `canDownload`.

---

## 14. Security

| Control | Requirement |
|---------|-------------|
| IDOR | Owner + expected key binding |
| Capability | Server resolver only |
| Ledger | RAW downloads → `take_download_events` |
| Secrets | Never log signed URL tokens |
| P3 | claim / XOR / paths untouched |
| Rate | Daily C for RAW; render daily/concurrent from existing matrix for jobs |

---

## 15. UX

### 15.1 Eligibility

Before mic: call server eligibility. On DENY: Polish message + required plan if tier-gated. Mobile-first; `min-h-11` controls.

### 15.2 Recording Identity

Optional title field (pre-start or post-READY edit). Author display from profile. Beat title linked.

### 15.3 My Recordings (`/account/takes`)

Columns/cards: title · author · beat · duration · created · status · preview · download menu (ladder).  
`canDownload` flags from **server DTO only** (fix current `activeReady` spoof).

### 15.4 Fala 3.5.1

No redesign of live MIC / dual preview; eligibility wraps entry only.

---

## 16. Migration

| Change | Type | Additive |
|--------|------|----------|
| `takes.title text null` + length check | ALTER | YES |
| `take_download_events` + RLS (owner select own; insert service_role) | CREATE | YES |
| `render_jobs.kind` + `take_id` nullable + check XOR kind | ALTER | YES |
| quality tier / capability `EXPORT_MP3_192` in config + DB enum if needed | ALTER/config | YES |
| Storage policies | none new buckets | — |
| RPC | optional `assert_take_export` later | prefer TS AuthZ first |

**No** destructive drops. **No** rewrite of existing object keys.

---

## 17. Tests

### Eligibility
- FREE allow under caps  
- FREE/BRONZE deny when daily/active exhausted  
- ANON 15s policy unchanged  
- DENY does not invoke getUserMedia (unit/UI)

### Download RAW
- GOLD allow · FREE deny · wrong owner · bad object key · expired · non-READY · daily C 5th OK / 6th DENY · ledger row

### Export rendered
- capability matrix per tier · job enqueue · worker artifact · signed download · deny without capability · reuse artifact idempotent

### Metadata
- title save/list · author from display_name · beat · duration

### Regression
- P3 claim paths  
- authenticated + anon recording  
- `/account/takes` list  
- Fala 3.5.1 REC dual rail  
- E3 MIX export still works (kind=MIX)

---

## 18. Acceptance criteria

```text
AC-01 Eligibility DENY blocks mic + shows plan message when tier-gated
AC-02 takes.title persists and appears on /account/takes
AC-03 Author shown from profiles.display_name (auth takes)
AC-04 Download menu lists all 4 qualities; LOCKED show plan name
AC-05 EXPORT_MP3_192 exists; BRONZE+ can request 192 take export
AC-06 FREE can request 128 take export; cannot 192/320/WAV
AC-07 GOLD RAW download gated + take_download_events + daily C
AC-08 listOwnTakes download flags match server capabilities
AC-09 Worker performs FFmpeg; no FFmpeg in Vercel request path
AC-10 P3 / Fala / E3 MIX regression PASS
AC-11 No artwork column on takes
AC-12 No Project/Track/Clip/lyrics tables in P4
```

---

## 19. Rollout

```text
1. Owner Implementation GO
2. P4.1 Eligibility Gate
3. P4.2 Identity metadata (+ migration title)
4. P4.3 My Recordings UX
5. P4.5 RAW download enforcement + take_download_events
6. P4.4 Download capability UX (can ship behind flags with P4.5/6)
7. P4.6 Take export pipeline + EXPORT_MP3_192
8. Production verify matrix
9. SSOT reconcile docs
```

P4.7 Artwork = **skipped** (DEFER).

Feature flags optional: `TAKE_EXPORT_ENABLED` for P4.6 canary.

---

## 20. Rollback

- Config flag off → hide export ladder / disable enqueue  
- Migration additive → columns/tables remain harmless  
- Do not delete user artifacts on rollback without Owner GO  
- RAW enforcement revert = restore pre-P4 download allow for auth READY (**avoid** unless emergency)

---

## 21. Risks

| Risk | Mitigation |
|------|------------|
| BRONZE mix still has EXPORT_HQ_MP3 while take ladder denies 320 | Separate resolvers by `kind` |
| Worker STOPPED in prod | P4.6 requires worker enablement GO or fake-complete only in non-prod |
| Title spam / empty | Length cap + UI fallback |
| Confusing RAW vs rendered | Distinct UI sections: „Oryginał nagrania” vs „Eksport jakości” |
| Scope creep Studio | Hard OUT list |

---

## 22. Future compatibility

```text
PROJECT (P5+)
  ├── lyrics document
  ├── artwork
  ├── TRACK → CLIP → TAKE (reference existing takes)
  └── publish → creator_tracks (≠ beats)

Social later: track_reactions · comments · conversations…
Profiles: extend — never fork.
Time: ms in DB · samples in editor.
```

---

## 23. P5 / P6 / P7 boundaries

| Wave | Boundary (historical at P4 freeze) |
|------|----------|
| **P5** | Project / Track / Clip / timeline / lyrics / play events |
| **P6** | Samples/effects / ratings / advanced editing caps |
| **P7** | Publication · creator catalog · Mix/Master productization (OD-14) · social surfaces |

P4 must not implement any of the above.

> **Superseded for P5+ naming (OD-P5-01 CLOSED 2026-10-06):** see [P5_STUDIO_DESIGN_FREEZE.md](./P5_STUDIO_DESIGN_FREEZE.md) — P5 = Extensible Studio Foundation; P6 = Effects/Mix/Master; P7 = Creative audio. Lyrics/play events deferred (OD-P5-02).

---

## 24. Implementation units (frozen order)

### P4.1 — Eligibility Gate
- **Scope:** `canStartRecording` server + UI block before mic  
- **Files:** entitlement helpers · recording-panel entry · beat-recording-surface  
- **DB:** none  
- **AuthZ:** Sample Policy + beat eligibility  
- **Tests:** allow/deny matrix  
- **AC:** AC-01

### P4.2 — Recording Identity / Metadata
- **Scope:** `takes.title` · resolve author  
- **Files:** migration · take transport finalize/update · types  
- **DB:** `takes.title`  
- **Tests:** metadata  
- **AC:** AC-02, AC-03

### P4.3 — My Recordings UX
- **Scope:** `/account/takes` cards/list enrichment  
- **Files:** `list-own-takes.ts` · `own-takes-list.tsx`  
- **DB:** none beyond P4.2  
- **AC:** AC-02–AC-03 list display

### P4.4 — Download Capability UX
- **Scope:** quality ladder + LOCKED · server DTO flags  
- **Files:** account takes UI · capability label helpers  
- **AC:** AC-04

### P4.5 — Download Server Enforcement (RAW)
- **Scope:** GOLD RAW + `take_download_events` + daily C · fix `listOwnTakes.canDownload`  
- **Files:** `take-download.ts` · `take-access.ts` · migration events  
- **AC:** AC-07, AC-08

### P4.6 — Take Export Pipeline / 192 kbps
- **Scope:** TAKE_EXPORT jobs · worker · artifacts · `EXPORT_MP3_192` · tier resolver  
- **Files:** audio-render config · worker pipeline · APIs · matrix  
- **Storage:** `audio-artifacts` new key prefix  
- **AC:** AC-05, AC-06, AC-09, AC-10

### P4.7 — Artwork foundation
- **Status:** **DEFER** — design only (§9.5) · no code in P4

---

## 25. OWNER DECISIONS (narrow)

| ID | Status | Notes |
|----|--------|-------|
| P4 Implementation GO | **REQUIRED** before code | This freeze ≠ implement authorization |
| Worker enablement for P4.6 prod | **REQUIRED** if shipping render live | Contabo currently STOPPED |
| RAW daily C = 5 | Inherited from sample freeze | Confirm only if Owner wants change |
| Paid Premium live rows | Optional | Matrix works with FREE; GOLD RAW needs GOLD entitlement |

**Not Owner questions (frozen here):** naming P4 · artwork DEFER · ms timeline · creator_tracks ≠ beats · lyrics not on takes · capability aliases · TAKE_EXPORT vs MIX kind split · WAV 44.1/16 stereo.

---

## 26. Design Freeze verdict

```text
P4 DESIGN FREEZE STATUS:

GO
```

Zamrożone: nazwa epiku · scope/non-goals · eligibility · identity (`title`) · My Recordings reuse · download ladder + LOCKED · capability mapping + `EXPORT_MP3_192` · RAW vs rendered split · storage keys · AuthZ · security · units P4.1–P4.6 · artwork DEFER · P5–P7 boundaries.

Wymaga implementacji (po Owner GO): P4.1 → P4.6.

Poza P4: DAW · social · publication · payments · artwork ship · lyrics editor.

OWNER DECISIONS pozostałe: **Implementation GO** · **worker prod enablement dla P4.6**.
