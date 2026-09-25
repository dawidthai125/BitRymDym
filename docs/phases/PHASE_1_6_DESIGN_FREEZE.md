# Phase 1.6 Design Freeze

**Title:** Published Beats Surface + Playback Shell
**Baseline:** `origin/main` @ `7de20a315a444ad8b28f52ccfe9aaf70b7723bb7`
**Depends on:** Phase 1.5 Private Audio Storage + Access Gate — COMPLETE / CLOSED / LOCKED
**Supabase project:** `rzzxrgcdogkybkiidqgw`
**SSOT:** §6–§11, §39–§40
**Document status:** DESIGN FREEZE — **APPROVED / LOCKED**
**Implementation:** **COMPLETE / CLOSED / LOCKED** @ `39be430` — production **GREEN / VERIFIED**

Legend:

| Label | Meaning |
|-------|---------|
| **FROZEN** | Approved design decision for Phase 1.6 implementation |
| **OPEN** | Existing OD still OPEN — not closed by this freeze |
| **DEFERRED** | Intentionally out of Phase 1.6 |

---

## Status

| Item | State |
|------|--------|
| Phase 1.5 | COMPLETE / CLOSED / LOCKED |
| Phase 1.6 Design Freeze | **APPROVED / LOCKED** |
| Phase 1.6 Implementation | **COMPLETE / CLOSED / LOCKED** @ `39be430` |
| Production | **GREEN / VERIFIED** |
| Candidate | Published Beats Surface + Playback Shell |

---

## Objective

Deliver the first complete public listening path:

```text
PUBLISHED BEAT
  → CATALOG
  → BEAT DETAIL
  → PLAYBACK
  → EXISTING ACCESS GATE
  → SIGNED PLAYBACK URL
```

---

## Scope IN

### 1. Published Beats Surface

**FROZEN:**

- Public list of **PUBLISHED** beats only
- Anonymous access
- Authenticated access
- Reuse existing beats model + server/domain helpers
- **Zero duplicate business logic**

Minimal fields:

- `id`, `title`, `producer`, `genre`, `style`, `bpm`, `key`, `scale`, `duration`, `cover_ref`

No advanced filters. No controlled-vocab freeze.

### 2. Beat Detail

**FROZEN — PUBLISHED only:**

- `title`, `producer`, `description`, `genre`, `style`, `bpm`, `key`, `scale`, `duration`, `cover`
- Playback action

### 3. Custom Playback Shell

**FROZEN — reusable BitRymDym component:**

- play / pause / seek / progress
- current time / duration
- volume / mute
- loading / error
- keyboard accessibility
- mobile-first

`HTMLAudioElement` may be used as the engine.
**Forbidden as product UI:** native `<audio controls>`.

### 4. Access Gate

**FROZEN:** Playback only via existing `requestBeatAudioAccess` with purpose `PLAYBACK`.

Do **not** create a second:

- signed URL service
- audio access service
- authorization system

Authorization remains server-side.

### 5. Anonymous Playback

```text
ANONYMOUS
  → PUBLIC BUSINESS RULE
  → PUBLISHED CHECK
  → PLAYBACK POLICY
  → SIGNED URL
```

Public PUBLISHED beats are playable without login.

### 6. Authenticated Playback

```text
AUTHENTICATED
  → requireUser
  → existing AuthZ / business rules
  → PLAYBACK
  → SIGNED URL
```

**AccountLevel is not a permission.**

---

## HARD OUT

### DOWNLOAD

- Download button / CTA / menu
- download counter / audit / daily limits / repeat logic / anti-abuse
- `DOWNLOAD` purpose calls from UI

Do **not** close OD-05 / OD-06 / OD-17.

### QUICK TAKE

- microphone, MediaRecorder, recording, take, mixing, export, publish take

### WAVEFORM

- waveform engine, peaks generation, audio decoding pipeline, server-side waveform

**Progress bar is sufficient.**

### Outside Phase 1.6

- Tracks, Community, Messaging, Payments
- Admin CMS, community upload
- OD-12 final codec, OD-13 watermark, OD-15 final visual lock
- controlled vocab, final waveform processing

---

## Design System

**OD-15 remains OPEN.**

Allowed: existing Design System tokens, existing UI components, interim BitRymDym visual direction.
No brand redesign.

---

## Responsive

Mobile-first: mobile, desktop, touch controls, keyboard accessibility, focus states, loading/disabled states, readable metadata.
Sticky global mini-player is **not** required.

---

## Error Handling

Handle: loading, signed URL failure, unauthorized, missing asset, playback failure, expired URL, network failure.

Do **not** expose: SQL errors, Storage internals, service-role details, secrets, configuration internals.

---

## Routing

| Route | Rule |
|-------|------|
| `/beats` | Public PUBLISHED catalog |
| `/beat/[id]` | Public PUBLISHED detail + playback |

No admin routes. No user upload routes.

---

## Data Access

Public metadata via existing RLS / server / domain mechanisms.
Do not use service-role unless necessary.
`createSupabaseAdminClient` stays out of the client graph.

---

## Test Plan

**Unit:**

- PUBLISHED catalog visibility; non-PUBLISHED excluded
- beat detail visibility
- playback action invokes PLAYBACK access
- DOWNLOAD not exposed
- loading/error states; player state transitions

**Auth matrix:**

| Actor | Published playback | Non-published public |
|-------|--------------------|----------------------|
| ANONYMOUS | ALLOW | DENY |
| USER | ALLOW | DENY |
| MODERATOR | ALLOW | DENY (public surface) |
| ADMIN | ALLOW | DENY (public surface) |

Do **not** change Phase 1.5 RLS.

---

## Acceptance Criteria

1. `/beats` works publicly
2. Shows PUBLISHED only
3. `/beat/[id]` works for PUBLISHED
4. Non-PUBLISHED not publicly available
5. Custom playback UI works
6. PLAYBACK uses existing Access Gate
7. Signed URL remains server-generated
8. Anonymous playback works
9. Authenticated playback works
10. Player does not use native audio controls as UI
11. Download CTA does not exist
12. Quick Take does not exist
13. Waveform engine does not exist
14. Mobile layout works
15. Error states handled
16. Tests exist
17. lint / typecheck / build PASS
18. Documentation matches implementation

---

## Open Decisions

Remain **OPEN** (do not close): OD-04 … OD-18.

| ID | Phase 1.6 stance |
|----|------------------|
| OD-12 | PLAYBACK uses current MIME / `content_type` from Phase 1.5 |
| OD-15 | Interim Design System styling allowed |

---

## FINAL STATUS

**PHASE 1.6 DESIGN FREEZE = APPROVED / LOCKED**
**PHASE 1.6 IMPLEMENTATION = COMPLETE / CLOSED / LOCKED** @ `39be430`
**PRODUCTION = GREEN / VERIFIED**

Delivered: `/beats` PUBLISHED-only catalog; `/beat/[id]` PUBLISHED-only detail; Playback Shell; Access Gate PLAYBACK (anon + auth).
Downloads remain **PARTIAL** (no UI / limits / counters / audit). Quick Take **NOT STARTED**.
Hard OUT retained: DOWNLOAD productization, Quick Take, waveform, Admin CMS, payments.
OD-04 … OD-18 remain OPEN.
