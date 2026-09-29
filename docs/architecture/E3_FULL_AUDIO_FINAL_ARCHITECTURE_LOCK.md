# E3 FULL AUDIO — FINAL ARCHITECTURE LOCK

**Status:** ARCHITECTURE LOCKED
**Date:** 2026-09-28
**Owner decisions captured:** Design Freeze 01–11 · OAD-01…07 · **OD-E36-04 = C** (2026-09-29)
**Epic:** `E3 — FULL AUDIO`
**Architecture:** `C — HYBRID`

### Delivery status (reconciled 2026-09-29 — does not rewrite freeze-era history below)

```text
PRODUCTION              = 183b2a4a7ea3cc8be7f0ac337e75e915ffdae0b9
PRODUCTION URL          = https://www.bitrymdym.pl
E3.1 → E3.6             = CLOSED / PRODUCTION VERIFIED
E3 FLAGS                = DARK (UNSET)
E3_RENDER_WORKER_SECRET = UNSET
OD-E36-04               = OPTION C (native/system FFmpeg + libmp3lame on EXTERNAL worker)
CLOSEOUT                = docs/audits/E3_6_PRODUCTION_CLOSEOUT.md
```

### Freeze-era header (historical — true at Architecture Lock gate)

```text
APPLICATION SHA = e98ba52c610b4c6dee8f69aa76f734b6cbe898ab
DOCS SHA        = bd6d1b0d8bbf1e9f09265f1f62496d3369348d83
PRODUCTION      = e98ba52
PRODUCTION URL  = https://www.bitrymdym.pl
IMPLEMENTATION  = NONE
OWNER IMPLEMENTATION GO = NOT YET
```

**Precedents (read-only inputs):**

| Document | Role |
|----------|------|
| Design Freeze (Owner 01–11) | Product contract FROZEN |
| Architecture Review | Readiness B → Owner decisions |
| [E3_FULL_AUDIO_ARCHITECTURE_ADDENDUM.md](./E3_FULL_AUDIO_ARCHITECTURE_ADDENDUM.md) | Options + Standard caps baseline |
| AUTHORIZATION / RECORDING / SSOT | Existing AuthZ · D02 · entitlement patterns |

**This document does not:** implement code · choose vendor · amend Design Freeze · reopen D02/W1–W5 · grant Implementation GO.

---

## 1. Final Architecture Reconciliation

### 1.1 OAD-01…07 — LOCKED VALUES

| ID | Decision | Locked value |
|----|----------|--------------|
| **OAD-01** | Premium without full Payments | `premium_entitlements` overlay (`user_id`, `active`, `source`, **`expires_at`** canonical column; prose “expires” = same) · Premium ≠ Role · Account Level ≠ Premium · no `PremiumAudioRole` · Server SSOT |
| **OAD-02** | Render worker | **EXTERNAL WORKER CLASS** · heavy DSP / Pro Master / MP3 / WAV / durable render **not** sync Vercel Route Handler · encode host = EXTERNAL · **OD-E36-04 = C** (native/system FFmpeg + libmp3lame; **not** an app npm dependency) |
| **OAD-03** | Anti-Abuse | **STANDARD** baseline from Addendum §4 Variant 2 (see §1.2) · do not raise/lower in this lock |
| **OAD-04** | Stems | **DEFER** · vocal/beat stems OUT · AI separation OUT · docs extension point only |
| **OAD-05** | Mobile | **STRICT MOBILE-CERT-FIRST** · W6 = prereq before **public** Free Audio · no desktop-only public · no W6 bypass |
| **OAD-06** | Codec | Basic MP3 **128 kbps** · HQ MP3 **320 kbps** · WAV **44.1 kHz / 16-bit / stereo** · no extra tiers |
| **OAD-07** | Artifact storage | Private bucket **`audio-artifacts`** · not `take-audio` · not `beat-audio` · service-only writes · owner-scoped · signed GET · lifecycle/retention/cleanup |

### 1.2 OAD-03 STANDARD CAPS — Owner-approved baseline (from Addendum)

| Control | Locked baseline |
|---------|-----------------|
| Max source duration | ≤ **180 s** (existing recording/beat ceiling) |
| Max take source size | ≤ **20 MiB** (`TAKE_AUDIO_MAX_BYTES`) |
| Max beat source size | ≤ **50 MiB** (`BEAT_AUDIO_MAX_BYTES`) |
| Free renders / UTC day | **5** |
| Premium renders / UTC day | **30** |
| Concurrent jobs | Free **1** · Premium **2** |
| Job timeout | **180 s** wall **from CLAIM / RUNNING** (queue wait excluded; Impl Plan IP-03) |
| Retries | **3** |
| Artifact retention Free Basic MP3 | **48 h** |
| Artifact retention Premium | **30 d** |
| Storage quota active artifacts | Free **250 MiB** · Premium **2 GiB** |
| Cost cap | Soft deny when daily render count / quota hit |
| Anonymous mixed render | **0** |
| UTC-day / idempotency | Same semantics class as downloads/recording · idempotent job create |

### 1.3 Consistency check vs prior docs

| Source | Reconciliation |
|--------|----------------|
| Design Freeze 01–11 | Compatible — OAD refine delivery; product packages unchanged |
| Decision 10 / OAD-05 | Aligned — strict mobile-cert-first; no staged public desktop carve-out |
| OD-14 Hybrid C | Aligned — client preview · server durable |
| D04 / OAD-01 | Aligned — Premium overlay, not Account Level |
| D02 / W1–W5 | Untouched — OUT of E3 contract changes |
| OD-12 | E3 **export quality baseline** locked via OAD-06; global OD-12 registry may remain OPEN for unrelated surfaces — **E3 must not invent extra tiers** |
| Addendum recommendations | Owner accepted: A worker class · Standard caps · Stems DEFER · Strict mobile · 128/320/WAV · `audio-artifacts` |
| AUTHORIZATION.md | No conflict — extend entitlement; no PremiumRole |
| RECORDING.md | MIC TAKE remains source; mix/export = new layer |

**Conflicts found requiring Owner re-open:** **NONE.**

### 1.4 Stems extension point (documentation only)

Future (not E3 v1): bus-export stems only after separate Owner IN.
**E3 v1:** **no** `artifact_kind` schema · **no** stems UI/worker (IP-01 CLOSED in Implementation Plan).

---

## 2. Preview vs Final (LOCKED)

```text
CLIENT = preview / interaction
SERVER = final truth / durable artifact
```

| Tier | Preview | Durable |
|------|---------|---------|
| **Free / Basic** | Client Web Audio Basic Mix + Basic Master | Server bake → Basic MP3 128 kbps · **preview ≈ final** (same params + Basic engine class) |
| **Premium** | Client Pro controls = **approximation** | Server Pro Mix + Pro Master → HQ MP3 320 / WAV · **server authoritative** |

**Known gap (OPEN NON-BLOCKING for Architecture; address in Implementation Plan):**
exact numeric tolerance / UX copy for Premium “preview may differ from export”; golden-fixture regression strategy. Does **not** reopen Hybrid C.

---

## 3. Security Model (LOCKED)

```text
AUTH
→ AUTHZ
→ EFFECTIVE ENTITLEMENT
     (Account Level → recording)
     (premium_entitlements → Mix Pro / Master Pro / HQ / WAV)
→ RATE / COST CAP (OAD-03 STANDARD)
→ JOB (entitlement_snapshot + idempotency)
→ EXTERNAL WORKER RENDER
→ PRIVATE audio-artifacts OBJECT
→ SIGNED DOWNLOAD
```

| Threat | Status |
|--------|--------|
| IDOR mix / job / artifact | CLOSED (requirement) — owner-only + deny-by-default RLS / service mediation |
| Foreign take / beat | CLOSED (requirement) — own READY take · beat PLAYBACK-eligible at bake |
| Premium spoof | CLOSED (requirement) — server overlay only |
| Tier escalation | CLOSED (requirement) — capability check at job create |
| Anonymous mixed export | CLOSED — DENY |
| Expired source / artifact | CLOSED (requirement) — DENY |
| Duplicate job | CLOSED (requirement) — idempotency + concurrent caps |
| Signed URL replay | CLOSED (requirement) — short TTL · no public ACL |
| D02 bypass via mix | CLOSED — anon has no mix durable path |

Runtime enforcement = Implementation; architecture contract = **CLOSED**.

---

## 4. Remaining Items After OAD Lock

| Item | Classification | Notes |
|------|----------------|-------|
| Product scope E3 | **CLOSED** | Design Freeze + OAD |
| Design Freeze 01–11 | **CLOSED** | |
| Architecture Hybrid C | **CLOSED** | |
| Premium overlay shape | **CLOSED** | OAD-01 — impl not started |
| Render worker **class** | **CLOSED** | OAD-02 External |
| External worker **vendor** / encode host stack | **CLOSED for E3.6 Basic** via **OD-E36-04 = C** | Native/system FFmpeg + libmp3lame on EXTERNAL worker · further vendor productization remains Owner GO if needed |
| DSP / encoder library choice | **CLOSED for Basic MP3 (E3.6)** | OD-E36-04 = C · Premium/HQ/WAV encode stack may still need later Owner GO |
| Anti-abuse STANDARD numbers | **CLOSED** | OAD-03 |
| Stems | **DEFERRED** | OAD-04 |
| Mobile gate policy | **CLOSED** | OAD-05 |
| W6 certification **execution** | **OPEN NON-BLOCKING** (Architecture) | **BLOCKING for public Free Audio release** — not for writing Implementation Plan |
| Codec E3 baseline | **CLOSED** | OAD-06 |
| Artifact bucket policy | **CLOSED** | OAD-07 — private `audio-artifacts` exists (E3.1+) |
| Mix session lifecycle / take expiry / beat eligibility rules | **CLOSED** (Architecture intent) | Delivered E3.3–E3.6 |
| Preview≈final tolerance numbers | **OPEN NON-BLOCKING** | Soft RMS makeup (INFO-03) — not full BS.1770 |
| Job table / idempotency / retry wiring | **CLOSED** (requirements) | Delivered E3.5+ |
| Signed download pattern | **CLOSED** (reuse) | Delivered E3.6-E |
| AuthZ duplicate systems | **CLOSED** — forbidden | |
| Architectural blocker preventing Implementation Plan | **NONE** | |

**OD-E36-04** is an Owner Decision refining OAD-02 encode host stack for E3.6 Basic — **OPTION C** locked.

---

## 5. Final E3 Architecture Status

| Area | Status |
|------|--------|
| Product Scope | **CLOSED** |
| Design Freeze | **CLOSED** |
| Architecture | **CLOSED** |
| Premium Overlay | **CLOSED** |
| Render Worker Class | **CLOSED** |
| Anti-Abuse Baseline | **CLOSED** |
| Stems | **DEFERRED** |
| Mobile Gate | **CLOSED** |
| Codec | **CLOSED** |
| Artifact Storage | **CLOSED** |
| Security Model | **CLOSED** |
| Implementation Plan | **ACTIVE SSOT for waves** (IP-01…07 CLOSED) — [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](./E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md) |
| Implementation through E3.6 | **COMPLETE / PRODUCTION VERIFIED** @ `183b2a4` · **DARK** |
| Production enablement | **NOT ENABLED** — separate Owner GO |

---

## 6. Next Gate (reconciled)

```text
ARCHITECTURAL BLOCKER = NONE
E3.1 → E3.6 = CLOSED / PRODUCTION VERIFIED @ 183b2a4
E3 = DARK
NEXT = OWNER DIRECTION / READY FOR NEXT AUDIT
NEXT FEATURE = DO NOT AUTO-SELECT
```

Do **not** invent E3.7+ scope from this lock. Public Free Audio / Production render enablement remain separate Owner gates (OAD-05 / flags).

Historical Architecture Lock gate required Implementation Plan before code — that gate is **closed** in history. Current continuity: see [PROJECT_STATE.md](../PROJECT_STATE.md) · [E3_6_PRODUCTION_CLOSEOUT.md](../audits/E3_6_PRODUCTION_CLOSEOUT.md).

---

## 7. Absolute constraints (Architecture Lock authorship — historical)

At Architecture Lock authorship time:

- No code · no migrations · no bucket create · no worker deploy · no dependency install · no FFmpeg add
- No Production / Supabase / Vercel config change in this lock
- No self-granted Implementation GO

Post-E3.6 delivery does **not** reopen Architecture. FFmpeg landed on EXTERNAL worker host per OD-E36-04 = C (not as app npm dependency).

---

```text
E3 FULL AUDIO FINAL ARCHITECTURE LOCK = COMPLETE

DESIGN FREEZE = FROZEN / CLOSED
ARCHITECTURE = C — HYBRID / CLOSED
OAD-01…07 = CLOSED
OD-E36-04 = OPTION C
STEMS = DEFERRED

DELIVERY (2026-09-29) =
  E3.1 → E3.6 CLOSED / PRODUCTION VERIFIED @ 183b2a4
  E3 FLAGS = DARK
  WORKER SECRET = UNSET
  PRODUCTION RENDER = NOT ENABLED

NEXT = OWNER DIRECTION / READY FOR NEXT AUDIT
```
