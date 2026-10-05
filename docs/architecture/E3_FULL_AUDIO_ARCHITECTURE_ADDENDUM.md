# E3 FULL AUDIO — ARCHITECTURE ADDENDUM

**Status:** COMPLETE — superseded for decision status by [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md)
**Date:** 2026-09-28
**Epic:** `E3 — FULL AUDIO`
**Design Freeze:** FROZEN (Owner Decisions 01–11)
**Architecture:** `C — HYBRID`
**Prior gate:** Architecture Review = COMPLETE · Readiness was **B — READY AFTER OWNER DECISIONS**
**Post-lock:** OAD-01…07 **CLOSED** by Owner (2026-09-28) — see Final Architecture Lock
**Delivery reconcile (2026-09-29):** E3.7 **PRODUCTION VERIFIED** @ `17c4d530` · **OD-E36-04 = C** · E3 = **DARK**

```text
PRODUCTION APPLICATION  = 17c4d530 · https://www.bitrymdym.pl
REPOSITORY / origin/main = 17c4d530
E3.7                    = PRODUCTION VERIFIED / DARK
E3 FLAGS                = DARK
OD-E36-04               = OPTION C (native/system FFmpeg + libmp3lame on EXTERNAL worker; not app npm dep)
```

### Addendum-era header (historical)

```text
APPLICATION SHA = e98ba52c610b4c6dee8f69aa76f734b6cbe898ab
DOCS SHA        = bd6d1b0d8bbf1e9f09265f1f62496d3369348d83
PRODUCTION      = e98ba52
PRODUCTION URL  = https://www.bitrymdym.pl
IMPLEMENTATION  = NONE
```

**Role of this document:** evidence-based options for Owner Dawid.
**Not:** vendor selection · Implementation GO · Design Freeze change · D02/W1–W5 reopen.

**Evidence legend:** `FACT` · `INFERENCE` · `ESTIMATE` · `UNKNOWN` · `OWNER DECISION`

---

## 1. Executive Summary

E3 Hybrid remains buildable on BitRymDym’s AuthZ / Storage / entitlement patterns **without** duplicating identity systems. Blocking gaps are not product-scope (already frozen) but **delivery dependencies**:

| Gap | Evidence class | Blocks |
|-----|----------------|--------|
| No async render worker / job table | FACT — only `takes-janitor` cron | Pro Master + durable encode |
| No MP3/WAV encoder dependency | FACT — `package.json` has decode/probe only | Basic/HQ MP3 + WAV |
| No Premium overlay table | FACT — OAD-01 chose shape C; not implemented | Premium AuthZ |
| No mixed-artifact bucket | FACT — only `beat-audio` + `take-audio` | Durable export storage |
| Anti-abuse numeric policy | OWNER — three variants below | Production caps |
| Stems / mobile staged / codec numbers | OWNER — addenda below | Scope & ship gate |

**OAD-01…07:** all **CLOSED** by Owner — see Final Architecture Lock. This Addendum remains the evidence/options record (Standard caps source for OAD-03).

---

## 2. Current Baseline

### Frozen product (do not re-litigate)

Anonymous = D02 only + login gate · Free = Basic Mix/Master + Mixed Preview + Basic MP3 · Premium = Pro Mix/Master + HQ MP3 + WAV · Hybrid client preview / server durable · Mobile W6 cert = prereq for **public** Free Audio (Decision 10) · E3 = Mix+Master+Render+Export · Account Level ≠ Premium.

### Existing technical facts (repo)

| Area | Fact | Path / proof |
|------|------|----------------|
| Take max duration | ≤ 180 s | `RECORDING_GLOBAL_MAX_SECONDS` · `src/config/recording.ts` |
| Take max bytes | 20 MiB | `TAKE_AUDIO_MAX_BYTES` · same |
| Beat max duration | 210 s | `BEAT_DURATION_MAX` · `src/lib/beats/validation.ts` |
| Beat max bytes | 50 MiB interim | `BEAT_AUDIO_MAX_BYTES` · `src/lib/beats/audio-validation.ts` |
| Beat download caps | anon 2 / user 4 per UTC day | `src/config/downloads.ts` · OD-05/06 |
| Recording session caps | B 10 / P 30 / L 60 per UTC day | `RECORDING_ANTI_ABUSE` · `recording.ts` |
| Private buckets | `beat-audio`, `take-audio` | migrations Phase 1.5 + Wave 1 |
| Take keys | `user/{owner}/takes/{id}/mic.bin` | `src/lib/takes/object-key.ts` |
| Signed URL TTL | playback 120s · download 300s | audio-validation / recording config |
| Jobs | **None** (moderation “queue” ≠ worker) | — |
| Cron | Hobby daily janitor only | `vercel.json` · `src/lib/takes/takes-janitor.ts` |
| Decode | `audio-decode` WAV/MP3; **no ffmpeg** | `audio-pcm-decode.ts` · BPM docs |
| Web Audio mix product | **Absent** | PlaybackShell = single `<audio>` |
| Premium runtime | **Absent** | profiles have `role` + `account_level` only |
| Routes | `runtime = "nodejs"`; no `maxDuration` set | `src/app/api/**` |

### Cost model (no fake prices)

```text
cost ≈ (render_wall_time × worker_compute_rate)
     + artifact_storage_bytes × storage_rate
     + egress_bytes × bandwidth_rate
     + retries × (compute + egress)
```

`UNKNOWN — vendor dependent` for absolute currency.

---

## 3. Render Worker Addendum (OAD-02)

**Goal:** durable Basic/Pro bake + MP3/WAV encode **outside** synchronous request/response as sole SSOT.

### Category A — External Worker

Dedicated worker process/service (queue consumer) separate from Next.js request path. Vendor **not** chosen here.

| Dimension | Assessment |
|-----------|------------|
| CPU / RAM | Suitable for DSP + encode (INFERENCE: category purpose) |
| Timeout | Configurable long jobs (INFERENCE) |
| Native / FFmpeg | Typically allowed (INFERENCE; vendor-specific FACT TBD) |
| DSP + MP3/WAV | Feasible category |
| Private storage | Via Supabase service role / signed ops (reuses existing admin client pattern) |
| Polling / retry / idempotency / concurrency / progress | Must be designed in app DB + worker contract |
| Security | Strong if worker never trusts client; service credentials server-only |
| Scaling | Horizontal workers (INFERENCE) |
| Ops complexity | Medium–high (new runtime surface) |
| Vercel integration | App enqueues job via API; worker pulls (INFERENCE) |
| Supabase integration | Job rows + Storage — natural |
| Cost | `UNKNOWN — vendor dependent` |
| Vendor lock-in | Medium–high if proprietary queue APIs |

**Verdict:** **technically possible** for E3 Pro Master + HQ encode.

### Category B — Supabase / runtime-based worker

Examples of *category* (not vendors): Edge Functions, DB triggers + cron claiming jobs, Database Webhooks → function. Exact product limits = **UNKNOWN** without plan-specific measurement.

| Dimension | Assessment |
|-----------|------------|
| CPU / RAM / timeout | Often **constrained** vs long Pro bake (INFERENCE + industry pattern; exact = UNKNOWN) |
| Native FFmpeg | Frequently **unavailable** or hard on Edge-class runtimes (INFERENCE; confirm per product) |
| DSP / encode | Basic may fit; Pro Master + True Peak + HQ encode = **high risk** |
| Storage / Auth | Excellent fit (same project) |
| Jobs | `pg_cron` **not** enabled for takes today (FACT: Wave 4 docs — app cron, not pg_cron) |
| Ops | Lower if stays in Supabase; hidden limits risk |
| Cost | `UNKNOWN — vendor / plan dependent` |
| Lock-in | Coupled to Supabase ops model |

**Verdict:** **technically possible with limitations** — plausible for *lightweight* enqueue/claim or Basic-only experiments; **not recommended as sole Pro Master + HQ encode host** without proven limits.

### Category C — Other sensible options in *current* architecture

| Sub-option | Assessment |
|------------|------------|
| **C1 — Synchronous Vercel Route Handler only** | **Niezalecane / blocker** for Pro Master + HQ as SSOT. FACT: no job infra; FACT: no encoder; INFERENCE: serverless wall clocks unfit for unbounded DSP. May enqueue only. |
| **C2 — Vercel function as enqueue + Category A worker** | Same as A with thin Next.js API (pattern: existing Route Handlers). |
| **C3 — Expand Hobby cron into render worker** | **Niezalecane.** FACT: cron is daily janitor (`0 0 * * *`); not low-latency job runner; no progress/concurrency model. |

**Recommended direction (technical, not Owner decision):** treat **Category A (external worker)** as the durable-render host class; keep Next.js as AuthZ + enqueue + poll + signed download; optionally use Supabase only for job state/storage—not as exclusive heavy DSP runtime—unless a measured spike proves otherwise.

```text
OWNER DECISION REQUIRED — OAD-02
Pick worker category (A recommended direction). Vendor selection = separate Owner GO.
```

---

## 4. Anti-Abuse Addendum (OAD-03)

### Anchors (FACT — reuse, do not invent unrelated ceilings)

| Anchor | Value | Source |
|--------|-------|--------|
| Max mix source duration | ≤ 180 s | recording / beat max |
| Max take bytes | 20 MiB | `TAKE_AUDIO_MAX_BYTES` |
| Max beat bytes | 50 MiB | `BEAT_AUDIO_MAX_BYTES` |
| UTC-day semantics | Existing download + recording caps | `downloads.ts`, `entitlement.ts` |
| Concurrent recording | max 1 PENDING claim pattern | Wave 4 / D02 RPCs |
| Download analogy | user 4/day | OD-06 interim |

**Egzekucja SSOT (INFERENCE — architecture):** server-only config module (e.g. future `src/config/audio-render.ts`) + job create AuthZ; client display-only. Idempotency key on create. UTC day = same convention as downloads/recording.

### Variant 1 — Conservative

| Control | Proposal | Justification |
|---------|----------|----------------|
| Max source duration | 180 s | Existing hard ceiling |
| Max source size (take+beat inputs) | take ≤20 MiB; beat asset ≤50 MiB | Existing |
| Free renders/UTC day | **3** | Below recording BEGINNER sessions (10); above download user (4) would be loose—kept tight for cost bomb |
| Premium renders/UTC day | **15** | Between PRO recording sessions (30) and Free×5 |
| Concurrent jobs / user | **1** | Mirrors take PENDING concurrency philosophy |
| Job timeout | **120 s** wall | ESTIMATE — short tracks; needs worker benchmark |
| Retries | **2** automatic | Limits retry abuse |
| Artifact retention Free Basic MP3 | **24 h** | Align BEGINNER take retention order |
| Artifact retention Premium | **10 d** | Align PRO take retention order |
| Storage quota / user | Free **100 MiB** · Premium **1 GiB** active artifacts | ESTIMATE order-of-magnitude from ~3–15 files |
| Cost cap | Soft deny when daily render count hit | No $ without vendor |

| Consequences | Conservative |
|--------------|--------------|
| UX | May feel tight for power Free users |
| Cost / security | Best cost bomb resistance |
| Storage / worker | Lowest capacity pressure |

### Variant 2 — Standard

| Control | Proposal | Justification |
|---------|----------|----------------|
| Duration / size | same as existing 180 / 20 / 50 | FACT anchors |
| Free renders/day | **5** | Slightly above OD-06 download (4) |
| Premium renders/day | **30** | Align PRO recording session order |
| Concurrent | **1** Free · **2** Premium | Premium parallel preview iterate |
| Timeout | **180 s** | ESTIMATE |
| Retries | **3** | |
| Retention Free | **48 h** | |
| Retention Premium | **30 d** | Align LEGEND take order |
| Quota | Free **250 MiB** · Premium **2 GiB** | ESTIMATE |

| Consequences | Standard |
|--------------|----------|
| UX | Balanced iterate/export |
| Cost | Medium |
| Security | Adequate if concurrent capped |

### Variant 3 — Liberal

| Control | Proposal | Justification |
|---------|----------|----------------|
| Duration / size | same anchors | |
| Free renders/day | **10** | = BEGINNER recording sessions |
| Premium renders/day | **60** | = LEGEND recording sessions |
| Concurrent | **2** Free · **3** Premium | Higher abuse surface |
| Timeout | **300 s** | ESTIMATE — more Pro headroom |
| Retries | **5** | Retry abuse risk ↑ |
| Retention Free | **7 d** | |
| Retention Premium | **90 d** | Storage risk ↑ |
| Quota | Free **1 GiB** · Premium **10 GiB** | ESTIMATE |

| Consequences | Liberal |
|--------------|---------|
| UX | Most forgiving |
| Cost / storage / worker | Highest |
| Security | Weakest against cost bomb |

**Shared hard rules (all variants):** anonymous mixed render = **0** (freeze) · tier escalation denied · expired take → no new render · idempotent create · signed URL short TTL (reuse 300s download class unless Arch sets artifact-specific).

```text
OWNER DECISION REQUIRED — OAD-03
Pick Conservative / Standard / Liberal (or hybrid). Timeouts remain ESTIMATE until worker benchmark.
```

---

## 5. Stems Addendum (OAD-04)

**FACT:** True AI stem separation = OUT (Owner instruction).
**INFERENCE:** “Stems” here = export of **already-separated buses** from known sources (e.g. dry vocal take + beat master ± wet mix), not ML separation.

| Item | Vocals stem | Beat stem | Optional wet mix |
|------|-------------|-----------|------------------|
| Source | MIC TAKE bytes | Beat MASTER | Mix+Master bake |
| Artifacts / render | +1 | +1 | already counted as mix export |
| Storage multiplier | ~×2–×3 vs single mix file | same | — |
| Render multiplier | ~×2–×3 wall time if sequential; less if parallel | | |
| Queue impact | More jobs or multi-output job | | |
| Security | Premium-only; owner AuthZ | | |
| UX | ZIP or multi signed URLs | | |

### STEMS DEFER

| Pros | Cons |
|------|------|
| Smaller E3 surface | Less Premium differentiation |
| Lower storage/queue | Revisit later = second freeze |
| Faster path to Basic/HQ | |

### STEMS IN

| Pros | Cons |
|------|------|
| Clear Premium package | Architecture + anti-abuse + retention complexity |
| Fits Hybrid buses | Multiplier on worker cost (`UNKNOWN — vendor`) |
| No AI required if bus export | Download UX + ZIP packaging |

**Architectural cost:** new artifact kinds, multi-object jobs, quota math, possibly ZIP endpoint — **significant** vs single-file export.

```text
OWNER DECISION REQUIRED — OAD-04
STEMS DEFER vs STEMS IN (bus export only; AI OUT).
```

**Recommended direction (technical):** **DEFER** stems from E3 v1 ship. **E3 v1 ships without `artifact_kind`** (IP-01 CLOSED). Future Owner IN may add schema then — not in E3 v1.

---

## 6. Mobile Rollout Addendum (OAD-05)

Design Freeze **Decision 10** remains: W6-class Mobile Certification = **prereq before public Free Audio**. This addendum compares *interpretation* for Owner—**does not change** Decision 10 text.

### A — STRICT MOBILE CERT FIRST

Public Free Audio (all clients) only after W6 matrix PASS.

| Dimension | Effect |
|-----------|--------|
| QA | Single quality bar |
| Release mgmt | Simpler “all or nothing” |
| Feature flags | Optional internal dogfood only |
| UX | No desktop/mobile promise gap |
| Support | Lower “works on PC not phone” |
| Divergence | Minimal |
| Rollback | Feature off globally |
| E3 / W6 | W6 on critical path before public value |

### B — DESKTOP STAGED

Desktop Free Audio earlier; mobile Mix UI **hard-gated** until W6 PASS.

| Dimension | Effect |
|-----------|--------|
| QA | Two tracks; mobile still blocked |
| Release | Needs reliable client capability gate (UA alone = weak) |
| Flags | Server-enforced `audio_mix_clients = desktop_only` + UI hide |
| UX | Mobile users see “wkrótce” / login-ok but Mix disabled |
| Security | Gate must be server-side for export; UA spoof possible for UI only |
| Support | “Why phone blocked?” burden |
| Divergence | Desktop learns prod issues before mobile |
| Rollback | Disable desktop flag |
| vs Decision 10 | **Tension:** staged public desktop may be read as violating “no public Free Audio before mobile cert” unless Owner **explicitly** reinterprets Decision 10 to mean “no public *mobile* Free Audio” |

```text
OWNER DECISION REQUIRED — OAD-05
A strict vs B desktop staged — and explicit reconciliation with Decision 10 wording.
```

**Recommended direction (technical):** **A (strict)** until Owner explicitly amends Decision 10; B only with written Decision 10 carve-out + server-side desktop allowlist policy.

---

## 7. Codec / Quality Addendum (OAD-06)

OD-12 remains OPEN. Values below = **architecture proposals**, not closed codec SSOT.

**Size ESTIMATE formula (mono/stereo): `bytes ≈ bitrate_kbps × 1000/8 × duration_s`.**

For **180 s**:

| Profile | Bitrate | ~Size @ 180s | Notes |
|---------|---------|--------------|-------|
| Basic MP3 A | 128 kbps stereo | ~2.8 MiB | Common “good enough” preview/export |
| Basic MP3 B | 160 kbps stereo | ~3.5 MiB | Slightly better Free |
| HQ MP3 A | 256 kbps stereo | ~5.6 MiB | Clear Premium step |
| HQ MP3 B | 320 kbps stereo | ~7.0 MiB | Near-ceiling MP3 |
| WAV 44.1 kHz 16-bit stereo | PCM | ~30.3 MiB | Uncompressed Premium |
| WAV 48 kHz 24-bit stereo | PCM | ~49.5 MiB | Heavier; near beat upload cap class |

### Recommended direction bundles (Owner picks one row each)

| Tier | Option set | Sample rate | Channels | Rationale |
|------|------------|-------------|----------|-----------|
| **BASIC MP3 (Free)** | **128 kbps** · 44.1 kHz · stereo | 44.1 | 2 | Differentiates from HQ; mobile-friendly size; storage-friendly vs WAV |
| **HQ MP3 (Premium)** | **320 kbps** · 44.1 kHz · stereo | 44.1 | 2 | Max common MP3; clear upgrade vs 128 |
| **WAV (Premium)** | **44.1 kHz · 16-bit · stereo** | 44.1 | 2 | DAW-friendly; avoids 24-bit storage spike unless Owner wants “masterspec” |

**Alt Free:** 160 kbps if Owner wants less harsh Free ceiling.
**Alt WAV:** 48 kHz/24-bit only if Premium positioning requires it (quota/abuse impact ↑).

| Impact | Lower bitrate Basic | Higher WAV |
|--------|---------------------|------------|
| Storage / abuse | ↓ | ↑ |
| Worker encode time | ESTIMATE: MP3 encode ≪ WAV write; Pro DSP dominates UNKNOWN | |
| Mobile download | Basic easier | WAV painful on cellular |

MIME (INFERENCE): `audio/mpeg` · `audio/wav` — align beat allow-list where possible (`audio-validation.ts`).

```text
OWNER DECISION REQUIRED — OAD-06
Confirm Basic/HQ/WAV parameter bundle (does not alone close OD-12 globally).
```

---

## 8. Artifact Storage Addendum (OAD-07)

### A — New private bucket `audio-artifacts` (proposed)

| Pros | Cons |
|------|------|
| Separates MIC TAKE vs mix/export lifecycle | New bucket + policies + janitor |
| MIME/keys not forced to `.bin` take convention | More ops surface |
| Clear Premium AuthZ / retention / quota | |
| Worker writes via service role (mirror takes) | |

**Object key sketch (DESIGN ONLY):**
`user/{ownerId}/mix/{mixSessionId}/jobs/{jobId}/{tier}.{ext}`

### B — Reuse `take-audio`

| Pros | Cons |
|------|------|
| No new bucket | FACT: bucket constrained to take domain; keys expect `.bin` mic paths (`takes` constraints / object-key builders) |
| | Lifecycle collision with take janitor (`takes-janitor.ts` — take-audio only today, but mixing semantics risky) |
| | MIME/export ≠ mic capture model |
| | Higher abuse/confusion surface |

**Verdict:** **niezalecane** as primary durable mix store.

### C — Reuse `beat-audio`

| Pros | Cons |
|------|------|
| Existing private + signed URL patterns | FACT: beat masters / community upload domain |
| | Ownership = beat, not mix user artifact |
| | Pollutes Access Gate PLAYBACK/DOWNLOAD semantics |

**Verdict:** **niezalecane** for user mix exports.

### D — Other

Store only DB metadata + ephemeral worker disk: **blocker** for durable Free Basic MP3 promise.

**Recommended direction (technical):** **A — `audio-artifacts`** private, service-only writes, signed GET, dedicated janitor pattern reused from takes.

```text
OWNER DECISION REQUIRED — OAD-07
```

---

## 9. Premium Entitlement Compatibility (OAD-01 confirmed)

**Owner chose C:** table-shaped `premium_entitlements` (`user_id`, `active`, `source`, **`expires_at`** canonical) — **not implemented in this addendum**.

### Compatibility with existing stack

| Layer | Compatible? | Notes |
|-------|-------------|-------|
| Auth / profiles | YES | Overlay keyed by `profiles.id` / auth uid |
| `account_level` | YES | Unchanged recording entitlements |
| `entitlement.ts` | YES | Extend effective capability resolve; no parallel module identity |
| Access Gate | YES | Remains PLAYBACK/DOWNLOAD; Mix uses take AuthZ + new capabilities |
| RLS | YES | Deny-by-default; service-mediated mutations (mirror grants/takes) |
| ROLE | YES | `ROLE ≠ ACCOUNT LEVEL ≠ PREMIUM` |

### Logical flow (FROZEN intent)

```text
AUTH
 → Profile (role + account_level)
 → PREMIUM OVERLAY (premium_entitlements.active && !expired)
 → EFFECTIVE CAPABILITIES
      Account Level → recording max / retention / caps
      Premium → MIX_PRO / MASTER_PRO / EXPORT_HQ / EXPORT_WAV
      Always (auth) → MIX_BASIC / MASTER_BASIC / EXPORT_BASIC_MP3
 → AUTHZ on mix session / job / artifact
 → RENDER JOB (entitlement_snapshot frozen at create)
```

**Forbidden:** `PremiumAudioRole` · client-supplied premium boolean as SSOT · equating `PRO_RAPPER`/`LEGEND_RAPPER` to Premium.

**Source values (DESIGN):** e.g. `manual_admin` | `promo` | `migration_payments_later` — exact enum = impl-time / Owner.

---

## 10. Security Review (addenda-wide)

| Threat | Control requirement |
|--------|---------------------|
| IDOR mix/job/artifact | Owner-only AuthZ + RLS deny-by-default |
| Premium spoof | Server reads `premium_entitlements` only |
| Tier escalation | Job `requested_tier` checked against effective capabilities |
| Foreign take / beat | Session create reuses take ownership + beat PLAYBACK eligibility |
| Expired artifact / take | Deny download / deny new render |
| Signed URL replay | Short TTL; no public ACL (reuse 120/300 class) |
| Duplicate render | Idempotency key + concurrent caps |
| Render / retry abuse | OAD-03 caps server-side |
| Anonymous mixed export | Hard DENY (Decision 01) |
| D02 | Untouched |

Worker must use service credentials; never expose worker secrets to client.

---

## 11. Performance / Cost

| Topic | Class | Statement |
|-------|-------|-----------|
| Client Basic MIX CPU | INFERENCE | Web Audio Basic FX feasible; mobile thermal risk until W6 |
| Pro Master server time | UNKNOWN — requires benchmark | Depends on DSP stack + duration ≤180s |
| Encode MP3 vs WAV | ESTIMATE | WAV larger I/O; DSP likely dominates Pro jobs |
| Absolute $ | UNKNOWN — vendor dependent | Use cost model in §2 |
| Storage @ Standard Free 5×128kbps×180s/day | ESTIMATE | ~14 MiB/day/user raw before retention |

Do not treat ESTIMATE as FACT.

---

## 12. Owner Decision Matrix

| ID | Decision | Options | Evidence | Risk | Recommended direction | Owner decision |
|----|----------|---------|----------|------|----------------------|----------------|
| OAD-01 | Premium without Payments | C `premium_entitlements` | D04 hybrid; no premium table today | Low if service-only writes | **C** | **CLOSED = C** |
| OAD-02 | Render Worker | A External · B Supabase-runtime · C sync/cron-only | No job infra; no encoder; janitor≠worker | High if C1 sole path | **A (external worker class)**; vendor later GO | **CLOSED = EXTERNAL WORKER CLASS** |
| OAD-03 | Anti-Abuse | Conservative · Standard · Liberal | Anchored to 180s/20MiB/50MiB + existing UTC caps | Cost bomb if liberal | **Standard** | **CLOSED = STANDARD** (timeout clock = CLAIM/RUNNING per Impl Plan IP-03) |
| OAD-04 | Stems | DEFER · IN (bus-only) | AI OUT; multiplier on storage/jobs | Scope/cost if IN early | **DEFER** | **CLOSED = DEFER** |
| OAD-05 | Mobile rollout | A Strict · B Desktop staged | Decision 10 text; W6 not run | Decision 10 conflict if B without carve-out | **A Strict** | **CLOSED = STRICT MOBILE-CERT-FIRST** |
| OAD-06 | Codec / Quality | Basic 128 · HQ 320 · WAV 44.1/16 stereo (+alts) | Size math; OD-12 OPEN; no encoder yet | Weak Premium diff if Basic too high | **128 / 320 / WAV44.1-16** | **CLOSED = 128 / 320 / WAV 44.1-16 stereo** |
| OAD-07 | Artifact storage | A `audio-artifacts` · B take-audio · C beat-audio | Dual-bucket pattern; take `.bin` constraints | Lifecycle collision if B/C | **A `audio-artifacts`** | **CLOSED = audio-artifacts** |

---

## Appendix — What this addendum does *not* do

- No code, migrations, buckets, dependencies, FFmpeg, workers, AuthZ runtime changes
- No Design Freeze 01–11 edits · no D02/W1–W5 reopen · no Production change
- No vendor selection · no Implementation GO

---

```text
E3 FULL AUDIO ARCHITECTURE ADDENDUM = COMPLETE
OAD-01…07 = CLOSED (see FINAL ARCHITECTURE LOCK)

APPLICATION SHA = e98ba52
DOCS SHA = bd6d1b0
PRODUCTION = e98ba52

DESIGN FREEZE = FROZEN
ARCHITECTURE = C — HYBRID / LOCKED
IMPLEMENTATION = NONE
COMMIT = NONE
PUSH = NONE
DEPLOY = NONE

OWNER IMPLEMENTATION GO = NOT YET

NEXT GATE = IMPLEMENTATION PLAN
```

**ABSOLUTE STOP**
