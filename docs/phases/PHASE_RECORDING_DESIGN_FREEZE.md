# PHASE — RECORDING / QUICK TAKE DESIGN FREEZE v1.0

**Status:** **LOCKED / OWNER APPROVED**  
**Date locked:** 2026-09-27  
**Owner:** Prezes Dawid  
**Architect:** ChatGPT (Chief Product / Technical Architect)  
**Baseline:** `main` @ `c5e1f17` · Community Upload + Moderation EPIC = **CLOSED**  
**Prerequisite audits:**  
- [RECORDING_QUICK_TAKE_COLD_START_AUDIT.md](../audits/RECORDING_QUICK_TAKE_COLD_START_AUDIT.md)  
- [RECORDING_QUICK_TAKE_DESIGN_FREEZE_PROPOSAL.md](../audits/RECORDING_QUICK_TAKE_DESIGN_FREEZE_PROPOSAL.md)  
- [RECORDING_QUICK_TAKE_FINAL_OWNER_DECISION_REVIEW.md](../audits/RECORDING_QUICK_TAKE_FINAL_OWNER_DECISION_REVIEW.md)

```text
RECORDING_DESIGN_FREEZE = LOCKED
IMPLEMENTATION          = NONE (await Wave 1 GO)
MIGRATION / BUCKETS     = NONE yet
```

---

## 1. Scope

**IN — Recording / Quick Take EPIC**

- Microphone capture (browser MediaRecorder / getUserMedia)
- MIC TAKE as primary persisted artifact (not mixed song)
- Anonymous Quick Take (D02)
- Account-level recording entitlements (BEGINNER / PRO / LEGEND)
- Hybrid entitlement architecture ready for future Premium (D04; payments **not** in this EPIC)
- Shared beat grants with independent PLAYBACK / DOWNLOAD / RECORD flags (D03)
- Private take storage (separate from `beat-audio`)
- Signed upload / playback / own-take download
- Retention + janitor
- Anti-abuse caps (active + daily sessions)
- Player Record entry (extend PlaybackShell; no player rewrite)
- Preview = client dual-play (beat + mic)
- Security: Auth → AuthZ → entitlement → beat access → business rules → RLS/Storage
- Mobile-first browser behavior requirements
- Tests per wave strategy

**Product flow (V1):**

```text
BEAT → ACCESS (capabilities) → PLAYBACK → RECORD → MIC TAKE → PREVIEW → SAVE / DELETE
(+ own take DOWNLOAD per D08)
```

---

## 2. Non-goals

**OUT of Recording EPIC**

- MIX / EXPORT / permanent BEAT+VOCAL master (OD-14 remains OPEN — future EPIC)
- Publish MIC TAKE as Track / public utwór
- Payments / Premium checkout (OD-04, OD-07, OD-08 remain OPEN for billing product)
- Watermarking (OD-13)
- Final codec/transcoding pipeline as requirement (OD-12; V1 stores native MediaRecorder output)
- Waveform engine
- Changing Community upload/moderation/publish
- Changing OD-05 / OD-06 / OD-17 beat download semantics
- New identity system (ROLE ≠ ACCOUNT LEVEL unchanged)
- Native mobile apps

---

## 3. Owner Decisions D01–D08

| ID | Status | Decision (locked) |
|----|--------|-------------------|
| **D01** | **CLOSED** | RECORD ≠ PLAYBACK ≠ DOWNLOAD. One Access/AuthZ layer; three capabilities. RECORD never implied by PLAYBACK or DOWNLOAD. Shared grants use independent flags. |
| **D02** | **CLOSED** | Anonymous Quick Take **IN V1**: max 30 s, temporary take, short server TTL, signed upload, identity/session token, active/daily limits, janitor, CTA Zaloguj / Załóż konto. No durable account. |
| **D03** | **CLOSED** | Shared grants + RECORD **IN Recording EPIC**. Producer → grant → user → PLAYBACK/DOWNLOAD/RECORD per flags → MIC TAKE. Least privilege: RECORD only if grant.record (not merely playback). |
| **D04** | **CLOSED** | **Hybrid:** Account Level → base entitlements; future Premium plan → premium entitlements; merge → effective entitlement → recording policy. No payments in V1; architecture must not block Premium later. No new identity system. |
| **D05** | **CLOSED** | Retention: BEGINNER **24 h** · PRO **10 days** · LEGEND **30 days**. |
| **D06** | **CLOSED** | User owns MIC TAKE: **preview**, **download**, **delete**. Track/publish utwór **OUT** of this EPIC. |
| **D07** | **CLOSED** | Anti-abuse V1 caps (not duration limits) — see §13. |
| **D08** | **CLOSED** | Own MIC TAKE download = **YES** for BEGINNER, PRO, LEGEND. Anonymous has **no** standard durable take-download flow. |

Canonical IDs in decision registry: **OD-REC-01 … OD-REC-08** (aliases of D01–D08).

---

## 4. Account Level / Premium model (D04)

```text
ACCOUNT LEVEL (BEGINNER_RAPPER | PRO_RAPPER | LEGEND_RAPPER)
        ↓
BASE RECORDING ENTITLEMENTS

PREMIUM PLAN (future; payments OFF in V1)
        ↓
PREMIUM ENTITLEMENT OVERLAY

        ↓
EFFECTIVE ENTITLEMENT
        ↓
RECORDING POLICY (max seconds, retention, caps, download_own_take, …)
```

| Rule | Locked |
|------|--------|
| ROLE ≠ ACCOUNT LEVEL | Unchanged |
| Premium replaces Account Level? | **No** |
| Payments in Recording V1? | **No** |
| Entitlement resolver | Central module; no scattered `if (accountLevel === …)` in UI |

**V1 effective policy** uses Account Level only (Premium overlay = no-op until payments GO).

---

## 5. Recording capability model (D01)

Reuse **existing Access Gate / authorization architecture**. Do **not** create a second gate.

| Capability | Meaning |
|------------|---------|
| `PLAYBACK` | Hear beat (signed URL) — existing |
| `DOWNLOAD` | Download beat file + OD-05/06/17 — existing |
| `RECORD` | Create MIC TAKE against `beat_id` — **new** |

```text
RECORD request
  → AUTH (user | anon token policy)
  → SERVER AUTHZ
  → RECORDING ENTITLEMENT (effective policy)
  → BEAT ACCESS + RECORD capability
  → BUSINESS RULES
  → TAKE session / storage
```

Client checks are UX only — **not** security authority.

---

## 6. Shared Beat model (D03)

```text
OWNER / PRODUCER
      ↓
SHARED GRANT (capabilities independent)
      ↓
USER
      ↓
PLAYBACK and/or DOWNLOAD and/or RECORD
      ↓
MIC TAKE (if RECORD allowed + entitlement)
```

**Example (allowed):** `playback=true`, `download=false`, `record=true`.

**Forbidden assumption:** shared PLAYBACK ⇒ RECORD.

Grant domain is **IN** this EPIC (Wave 5). Public PUBLISHED RECORD remains valid without a grant row (`source: PUBLIC`).

---

## 7. Anonymous model (D02)

| Rule | Value |
|------|--------|
| Max duration | 30 s |
| Persistence | Temporary take only |
| TTL | Short server-side (exact seconds = architecture-resolvable; must be ≪ BEGINNER 24 h) |
| Upload | Signed upload (server-issued) |
| Identity | Opaque session/token + server hash (pattern family of anon download; raw token never stored) |
| Anti-abuse | max 1 active · max 3 sessions / UTC day (D07) |
| CTA after record | Zaloguj / Załóż konto |
| Durable take download | **No** (D08) |
| Closing tab | Must not leave permanent orphan without janitor path |

---

## 8. Take lifecycle

**Server-known statuses (minimal):**

```text
PENDING_UPLOAD → READY | FAILED
READY → EXPIRED | DELETED
FAILED / EXPIRED / DELETED → cleanup-eligible
```

| Client event | Server outcome |
|--------------|----------------|
| MediaRecorder in progress | UI only (no `RECORDING` DB status required) |
| Session created | `PENDING_UPLOAD` + signed upload |
| Finalize OK | `READY` + `expires_at` |
| Validate fail / upload fail | `FAILED` |
| User delete | `DELETED` |
| Past `expires_at` | `EXPIRED` + janitor |

Interrupted browser / network → abandoned `PENDING_UPLOAD` cleaned by pending TTL + janitor.

**Own take actions (D06):** preview · download (D08) · delete. **Not:** publish Track.

---

## 9. Recording duration rules

**Architecture-resolvable / SSOT — locked for implementation:**

```text
recording_max_seconds =
  MIN(
    beat.duration_seconds,
    entitlement.max_recording_seconds,
    180
  )
```

| Actor | `entitlement.max_recording_seconds` | Mode |
|-------|------------------------------------:|------|
| Anonymous | 30 | Quick Take |
| BEGINNER_RAPPER | 30 | Quick Take |
| PRO_RAPPER | 180 | Full Take |
| LEGEND_RAPPER | 180 | Full Take+ |

**Authority:** server probe at finalize. Client timer = UX + auto-stop hint only.

Examples: beat 90 + ent 180 → **90**; beat 150 + 180 → **150**; beat 240 + 180 → **180**.

---

## 10. Storage architecture

| Decision | Locked direction |
|----------|------------------|
| Bucket | **Private**, **separate from** `beat-audio` (Phase 1.5 domain C). Final name e.g. `take-audio` / `quick-take` = architecture-resolvable at Wave 1 |
| Public permanent URL | **FORBIDDEN** |
| Client Storage INSERT | **DENY** |
| Upload | Server AuthZ → create take → **server-chosen** object key → signed PUT → finalize |
| Playback / own download | Signed GET after AuthZ |
| Owner binding | `owner_id` or anon hash — never client-supplied as authority |
| Beat binding | `beat_id` set at session create |
| Expiration | `expires_at` on row + object cleanup |

**Object key convention (aligned with BitRymDym `.bin` opacity):**

```text
user/{ownerId}/takes/{takeId}/mic.bin
anon/{tokenHashPrefix}/takes/{takeId}/mic.bin
```

(Exact prefix spelling = architecture-resolvable; must remain server-generated.)

---

## 11. Security model

```text
REQUEST
  → AUTH
  → SERVER AUTHZ
  → RECORDING ENTITLEMENT (DB profile / anon policy — never client-claimed level)
  → BEAT ACCESS + RECORD capability
  → BUSINESS RULE (status, READY, caps, duration snapshot)
  → RLS / STORAGE
  → TAKE
```

**Must mitigate:** ownerId spoof · beatId spoof · account-level spoof · duration spoof · MIME spoof · oversized upload · take IDOR · unauthorized shared RECORD · signed URL abuse · replay finalize.

---

## 12. Retention

| Tier | Retention |
|------|-----------|
| Anonymous | Short server TTL (architecture-resolvable numeric) |
| BEGINNER | **24 hours** |
| PRO | **10 days** |
| LEGEND | **30 days** |

**Mechanism (preferred):** soft expiry / `EXPIRED` state + **janitor** storage+row cleanup. Exact purge grace = architecture-resolvable. Janitor is **required** before claiming TTL in production.

---

## 13. Anti-abuse (D07)

These are **session/active caps**, not duration limits.

| Tier | Max active READY takes | Max recording sessions / UTC day | Concurrent sessions |
|------|----------------------:|---------------------------------:|--------------------:|
| Anonymous | 1 | 3 | 1 |
| BEGINNER | 3 | 10 | 1 |
| PRO | 10 | 30 | 1 |
| LEGEND | 20 | 60 | 1 |

Also: max upload bytes derived from duration × bitrate budget (architecture-resolvable).

---

## 14. Download (D08)

| Actor | Own MIC TAKE download |
|-------|------------------------|
| BEGINNER / PRO / LEGEND | **Allowed** while take not expired/deleted |
| Anonymous | **No** standard durable download flow |

**Isolation:** take download **must not** mutate OD-05/06/17 beat download counters/events.

---

## 15. Mobile requirements

- Mobile-first UX; Record reachable from beat player
- iOS Safari + Android Chrome in certification matrix (Wave 6)
- Mic permission via user gesture; clear denial/empty/unsupported states
- Backgrounding / lock / call → treat as interrupt; no silent false READY
- Memory: enforce max bytes; avoid retaining multiple large blobs
- Dual playback (beat + mic) tested on mobile

---

## 16. Audio format strategy

| Item | Locked direction |
|------|------------------|
| V1 storage | **Native MediaRecorder output** (opaque `.bin`) |
| Preferred | `audio/webm;codecs=opus` where supported |
| Fallback | `audio/mp4` / AAC (Safari / iOS) |
| Server | MIME allow-list + size + duration probe |
| Transcoding to single canonical codec | **DEFERRED** (OD-12 adjacent) |

---

## 17. Preview strategy

```text
BEAT (Access Gate PLAYBACK) + MIC TAKE (signed take playback)
→ client-side dual play for preview
→ NO permanent mixed file in V1
```

Persist for future mix: `beat_id`, `audio_offset_ms`, duration/bpm snapshots, mime/size, ownership.

---

## 18. Future MIX / EXPORT boundary

| V1 Recording EPIC | Future MIX/EXPORT EPIC |
|-------------------|-------------------------|
| MIC TAKE bytes | Mix engine |
| Beat stays separate | Export / Track publish |
| Client preview only | OD-14 method |

OD-14 remains **OPEN** and **out of scope** here.

---

## 19. Implementation waves

| Wave | Scope | GO required |
|------|--------|-------------|
| **W1** | Take domain · DB · RLS deny-by-default · private take bucket foundation · entitlement config module (no MediaRecorder UI) | Owner Wave 1 Implementation GO |
| **W2** | Recording transport · signed upload/finalize · MIME/size/duration validation · janitor skeleton | After W1 |
| **W3** | PlaybackShell Record · MediaRecorder · countdown/timer · preview · Anonymous + BEGINNER Quick Take E2E | After W2 |
| **W4** | Full entitlement matrix · retention per tier · anti-abuse caps · own take download · Moje próbki list/delete | **CLOSED** @ `99c4815` (production GREEN · Hobby daily cron) — [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md) |
| **W5** | Shared grants domain · RECORD capability on grants · shared E2E · unauthorized DENY | **CLOSED / PRODUCTION VERIFIED** @ `37892a6` — [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md) |
| **W6** | Security regression · IDOR · fake duration · mobile certification · observability · docs closeout | After W3–W5 |

```text
READY_FOR_WAVE_1 = YES
IMPLEMENTATION   = NONE until separate Owner GO
```

---

## 20. Test strategy

**Minimum matrix (across waves):**

- Anon 30 s · BEGINNER 30 s · PRO/LEGEND MIN(beat,180)
- Beat shorter / longer than entitlement
- Shared grant: record allow / playback-only DENY record
- Unauthorized beat / foreign take IDOR
- Expired take DENY · delete · own download AuthZ
- Fake duration · oversized · failed upload
- PLATFORM / Community / OD-05–17 regression GREEN
- Mobile cert (W6)

Unit · integration · RLS · AuthZ · storage · E2E · mobile.

---

## 21. Open Decisions

### CLOSED — Owner (this freeze)

D01–D08 / OD-REC-01…08 — see §3.

### ARCHITECTURE-RESOLVABLE (do not block Wave 1)

- Exact take bucket name (`take-audio` vs `quick-take`)
- Exact object-key prefix spelling
- Pending-upload TTL seconds; anon short TTL seconds
- Signed URL TTL numeric values for take upload/playback/download
- Duration probe library / tolerance band
- Soft-delete grace before hard purge
- Table/column/API/route/component names
- Concurrent=1 already locked as anti-abuse baseline with D07

### OPEN — FUTURE OWNER DECISION (non-blocking for Wave 1)

| ID | Topic | Notes |
|----|--------|-------|
| OD-04 / OD-07 / OD-08 | Payments / Premium prices / Premium plan catalog | Hybrid overlay later; V1 no-op |
| OD-09 | Final account level display names | Enum values stay |
| OD-12 / OD-13 | Codec final / watermark | DEFERRED |
| OD-14 | Mix/export method | Separate EPIC |
| OD-18 | Share **stats** counting | Grants ≠ stats; separate |
| OD-REC-OWN-DRAFT | RECORD on own non-PUBLISHED beat (DRAFT/REJECTED)? | **Not selected as A/B/C in Owner GO 2026-09-27**; V1 default = **OUT** (PUBLISHED + grant paths only). Reopen only with Owner GO. |

---

## 22. Risks

| Risk | Mitigation |
|------|------------|
| Anon abuse (D02) | Caps D07 + short TTL + janitor mandatory |
| iOS MediaRecorder format split | Dual MIME allow-list; transcode deferred |
| Shared grants scope creep | Wave 5; least privilege flags (D01/D03) |
| Premium/account confusion | D04 hybrid documented; payments OFF |
| Duration spoof | Server probe + snapshot max |
| Orphan storage without janitor | Block prod TTL claims until job exists |
| Mix scope creep | §18 hard OUT |
| Beat download regression | D08 isolation from OD-05/06/17 |

---

## 23. Acceptance criteria

Design Freeze **LOCKED** when all true:

- [x] D01–D08 documented CLOSED / OWNER APPROVED
- [x] Scope / non-goals explicit
- [x] Capability model + shared + anon locked
- [x] Duration MIN rule + tier policies locked
- [x] Retention + anti-abuse numbers locked
- [x] Storage/security/preview/mix boundary locked
- [x] Waves defined; implementation **not** started
- [x] Continuity updates: PROJECT_STATE · OPEN_DECISIONS · DECISION_LOG · README · CHANGELOG
- [ ] Wave 1 Implementation GO (separate Owner command)
- [ ] No migrations/buckets/routes/UI until Wave GO

---

## Related documents

| Doc | Role |
|-----|------|
| [PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md](./PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md) | **D02 CURRENT CONTRACT** (2026-09-28) — Anonymous QT · **SHIPPED / PRODUCTION VERIFIED** @ `e98ba52` |
| [AUTHORIZATION.md](../architecture/AUTHORIZATION.md) | Extend with RECORD + grants at impl |
| [AUDIO_TRANSPORT.md](../architecture/AUDIO_TRANSPORT.md) | Reuse signed upload pattern for takes |
| [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) §9 | Product baseline; status → freeze LOCKED |
| [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §18–§24 | Product truth; Recording freeze is HOW+LOCKED policy overlay for V1 |
| [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md) | OD-REC-* CLOSED |
| [DECISION_LOG.md](../decisions/DECISION_LOG.md) | Full decision entries |
| [RECORDING_D02_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md) | D02 production verify + post-release closeout |

---

## Addendum — D02 Anonymous Quick Take (2026-09-28)

**D02 CURRENT CONTRACT** (product rules) is locked in:

[PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md](./PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md)

**Delivery status (reconciled):** **SHIPPED / PRODUCTION VERIFIED** @ `e98ba52` · closeout [RECORDING_D02_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md).

Summary: TTL **7200 s** · max **30 s** · caps **1 / 3 / concurrent 1** · dedicated take identity (≠ `brd_dl_aid`) · preview YES (short-lived signed) · durable download NO · anon→account claim NO · PUBLISHED only · dual-play OUT.

**Freeze-era note:** At Design Freeze Addendum time, Implementation GO was **NONE** and delivery was NOT SHIPPED — correct for that gate; superseded by Implementation GO → commit `e98ba52` → Production Verify GREEN.
---

```text
RECORDING_DESIGN_FREEZE = LOCKED
WAVE 1 FOUNDATION       = IMPLEMENTED (takes + take-audio + RLS)
D01–D08                 = CLOSED
READY_FOR_WAVE_2        = YES (after Owner review / commit of Wave 1)
IMPLEMENTATION WAVES 2+ = NONE until separate Owner GO
NEXT                    = OWNER REVIEW Wave 1 → Wave 2 transport GO
```
