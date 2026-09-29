# E3 FULL AUDIO — IMPLEMENTATION PLAN

**Status:** E3.1 → E3.6 **CLOSED / PRODUCTION VERIFIED** @ `183b2a4` · E3 = **DARK** · later waves **NOT SELECTED**
**Date:** 2026-09-28 (plan) · **Delivery reconcile:** 2026-09-29
**Epic:** `E3 — FULL AUDIO`
**Architecture:** `C — HYBRID` (LOCKED)
**OD-E36-04:** **OPTION C** — native/system FFmpeg + libmp3lame on EXTERNAL worker · FFmpeg is **not** an npm dependency of the app

### Delivery status (reconciled 2026-09-29)

```text
PRODUCTION              = 183b2a4a7ea3cc8be7f0ac337e75e915ffdae0b9
PRODUCTION URL          = https://www.bitrymdym.pl
E3.1 → E3.6             = CLOSED / PRODUCTION VERIFIED
E3 FLAGS                = DARK (UNSET)
E3_RENDER_WORKER_SECRET = UNSET
PRODUCTION RENDER       = NOT ENABLED
CLOSEOUT                = docs/audits/E3_6_PRODUCTION_CLOSEOUT.md
NEXT FEATURE            = DO NOT AUTO-SELECT
```

### Plan-era header (historical — true when plan awaited Implementation GO)

```text
APPLICATION SHA = e98ba52c610b4c6dee8f69aa76f734b6cbe898ab
DOCS SHA        = bd6d1b0d8bbf1e9f09265f1f62496d3369348d83
PRODUCTION      = e98ba52 · https://www.bitrymdym.pl
IMPLEMENTATION  = NONE (this document is plan only)
OWNER IMPLEMENTATION GO = NOT YET
```

### Canonical sources (actual paths)

| Requested name | Actual / status |
|----------------|-----------------|
| Design Freeze | Captured in session + frozen via [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) §1 (no separate `E3_FULL_AUDIO_DESIGN_FREEZE.md` file) |
| Architecture Review | Session artifact; outcomes in Final Lock + [E3_FULL_AUDIO_ARCHITECTURE_ADDENDUM.md](./E3_FULL_AUDIO_ARCHITECTURE_ADDENDUM.md) |
| Architecture Addendum | [E3_FULL_AUDIO_ARCHITECTURE_ADDENDUM.md](./E3_FULL_AUDIO_ARCHITECTURE_ADDENDUM.md) |
| Final Architecture Lock | [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) **SSOT for OAD + STANDARD caps** |
| Recording / D02 | [RECORDING.md](./RECORDING.md) · [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md) · D02 addendum |
| AuthZ | [AUTHORIZATION.md](./AUTHORIZATION.md) |
| Handoff / index | [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) · [docs/README.md](../README.md) |

**STEMS:** DEFERRED — no implementation waves. **No `artifact_kind` column/schema in E3 v1** (IP-01 CLOSED).

**Findings closeout:** IP-01…IP-07 CLOSED in this document (2026-09-28).

---

## 1. Executive Implementation Summary

### Target flow

```text
AUTH USER (+ optional Premium overlay)
  → own READY take + PLAYBACK-eligible beat
  → MIX SESSION (params + engine version)
  → CLIENT preview (Basic or Pro UI)
  → REQUEST RENDER (tier)
  → AUTH → AUTHZ → EFFECTIVE ENTITLEMENT → ANTI-ABUSE → IDEMPOTENCY
  → render_jobs QUEUED
  → EXTERNAL WORKER (adapter) → DSP + encode
  → audio-artifacts READY
  → SIGNED DOWNLOAD
```

Anonymous: D02 only · Mix entry → LOGIN GATE · **no** mixed durable export.

### Main components

| Component | Role |
|-----------|------|
| `premium_entitlements` | Overlay SSOT (OAD-01) |
| Mix Session + params schema | Domain state |
| Client Basic/Pro Mix + Master UI | Preview / interaction |
| `render_jobs` + Worker Adapter | Async durable pipeline |
| Encoder (worker) | Basic 128 / HQ 320 / WAV 44.1-16 stereo |
| `audio-artifacts` bucket + rows | Durable private objects |
| Capability AuthZ + STANDARD caps | Server SSOT |
| Feature kill switch | Rollback / W6 gate |

### Dependencies

1. Schema + RLS for mix/jobs/artifacts/premium
2. Private `audio-artifacts` bucket
3. **Worker vendor GO** (separate) before prod heavy render
4. DSP/encoder tech spike (non-product OD)
5. **W6 PASS** before public Free Audio enablement

### Top risks

Worker vendor delay · Premium preview≠final UX · mobile thermal · encode/DSP quality · D02 regression if take AuthZ touched carelessly · orphan Storage objects.

### Implementation order (waves summary)

`E3.1 Foundation` → `E3.2 Premium overlay` → `E3.3 Mix Session + Basic client` → `E3.4 Master Basic` → `E3.5 Jobs + Worker Adapter (stub/fake)` → `E3.6 Basic MP3 end-to-end` → *(later waves in plan — **not selected / do not auto-start**)*
Public enablement only after W6 PASS + Owner Production Enablement GO.
**E3.6 Production:** code verified · flags **DARK** · real Production render **not** enabled.

---

## 2. Current Architecture Inventory

| Element | Path / proof | Disposition |
|---------|--------------|-------------|
| MediaRecorder / QT UI | `src/lib/takes/media-recorder.ts`, `recording-panel.tsx` | **REUSE** capture · **DO NOT TOUCH** D02 contract |
| Take AuthZ / transport | `authz.ts`, `take-transport.ts`, `take-access.ts` | **REUSE** ownership patterns · **EXTEND** callers for mix source checks |
| Anon D02 | `anon-take-*`, `brd_tk_aid` | **DO NOT TOUCH** |
| PlaybackShell | `playback-shell.tsx` | **EXTEND** hooks for dual-play / mix surface · no rewrite of beat Access Gate |
| Entitlement (recording) | `src/lib/takes/entitlement.ts`, `config/recording.ts` | **EXTEND** effective capabilities (+ Premium overlay) · **ZERO** parallel PremiumAuth |
| Profiles / account_level | Phase 1.3 identity | **REUSE** · **DO NOT** map PRO/LEGEND → Premium |
| Permissions catalog | `permissions.ts` | **DO NOT** invent PremiumAudioRole |
| beat-audio / Access Gate | `audio-access.ts`, `audio-validation.ts` | **REUSE** PLAYBACK for beat source · **DO NOT** store mix artifacts here |
| take-audio | Wave 1 bucket | **REUSE** MIC source only · **DO NOT** store mix exports |
| Signed URLs | take/beat download/preview | **REUSE** pattern for artifacts |
| Janitor | `takes-janitor.ts`, cron | **REUSE pattern** · new artifact janitor · **DO NOT** overload take janitor for mixes |
| Decode / duration | `audio-decode`, `music-metadata` | **REUSE** where MIME fits · encode = worker |
| Beat master pipeline | audio-transport | **DO NOT TOUCH** product semantics |
| Shared grants W5 | RECORD only | **DO NOT** extend to Mix/Download without separate Owner GO |
| Vercel cron | `vercel.json` | **EXTEND** later for artifact cleanup schedule only |

---

## 3. Target Component Map (logical — no files created)

| Logical module | Responsibility |
|----------------|----------------|
| Mix Session service | Create/update/list own sessions; bind take+beat; version params |
| Mix parameters schema | Validate Basic/Pro param JSON |
| Client Basic Mix engine | Web Audio preview gains/EQ/comp/limiter/reverb/delay |
| Client Pro Mix engine | Preview approx for Pro FX |
| Client Basic Master | Preview gain/clip/limiter/loudness |
| Client Pro Master UI | Metering display; bake is server |
| Render Job service | Create/claim status/cancel; caps; idempotency |
| Render Worker Adapter | Vendor-agnostic enqueue/status/result |
| Server DSP Basic/Pro | Final bake in worker |
| Encoder | MP3 128 / 320 / WAV per OAD-06 |
| Audio Artifact service | Persist metadata + signed GET |
| Premium entitlement resolver | Read overlay → capabilities |
| Download AuthZ | Owner + READY + not expired |
| Rate limit / anti-abuse | STANDARD caps config SSOT |
| Observability | Structured logs · no secrets/audio bytes |

---

## 4. Database / Data Model Plan

**No migration execution in this gate.** Prefer **new tables** (do not overload `takes` / `beat_audio_assets`).

### 4.1 `premium_entitlements`

| | |
|--|--|
| Purpose | OAD-01 Premium overlay SSOT |
| Fields (logical) | `id`, `user_id` → profiles, `active` bool, `source` text/enum, **`expires_at`** timestamptz null=open (canonical; OAD prose “expires” = this column — IP-07), `created_at`, `updated_at` |
| Relations | 1..n per user historically; **effective** = latest active non-expired (define unique partial index on active) |
| Indexes | `(user_id)`, partial unique where `active` |
| RLS | No client write; authenticated SELECT own optional; mutations service_role |
| Ownership | `user_id` |
| Dependency | profiles exist |

### 4.2 `mix_sessions`

| | |
|--|--|
| Purpose | Editable mix state before/during renders |
| Fields | `id`, `owner_id`, `source_take_id`, `beat_id`, `parameters` jsonb, `params_version` int/text, `preview_engine_id`, `status`, `created_at`, `updated_at` |
| Relations | take ON DELETE RESTRICT/SET unavailable; beat FK |
| Indexes | `(owner_id, updated_at)`, `(source_take_id)` |
| RLS | Owner SELECT; writes service-mediated |
| Lifecycle | If take expired/deleted → block new jobs; session `SOURCE_UNAVAILABLE` |
| Dependency | takes, beats |

### 4.3 `render_jobs`

| | |
|--|--|
| Purpose | Async render lifecycle |
| Fields | `id`, `owner_id`, `mix_session_id`, `requested_tier` (`BASIC_MP3`\|`HQ_MP3`\|`WAV`), `idempotency_key`, `status`, `progress`, `attempt`, `entitlement_snapshot` jsonb, `error_code`, `error_message`, `queued_at`, `started_at`, `finished_at`, `timeout_at`, `worker_ref` |
| Indexes | `(owner_id, created_at)`, `(status, queued_at)`, unique `(owner_id, idempotency_key)` |
| RLS | Owner read; writes service |
| Dependency | mix_sessions |

### 4.4 `audio_artifacts`

| | |
|--|--|
| Purpose | Durable export metadata |
| Fields | `id`, `owner_id`, `mix_session_id`, `render_job_id`, `format`, `quality_tier`, `storage_bucket` default `audio-artifacts`, `object_key`, `byte_size`, `duration_ms`, `checksum`, `sample_rate`, `bitrate_kbps`, `status`, `expires_at`, `created_at` |
| Indexes | `(owner_id, status)`, `(expires_at)`, unique `(storage_bucket, object_key)` |
| RLS | Owner read; writes service |
| Dependency | render_jobs · bucket |

**STEMS / `artifact_kind`:** **OUT of E3 v1 schema** (IP-01). No `artifact_kind` column. STEMS remain DEFERRED until separate Owner IN — no schema placeholder in this epic.

---

## 5. Storage Plan — `audio-artifacts`

| Rule | Plan |
|------|------|
| Privacy | Private bucket · no public ACL |
| Writes | Service-role / worker credentials only |
| Reads | Short-lived signed GET (reuse TTL class **300 s** download unless config twin) |
| Key convention | `user/{ownerId}/mix/{mixSessionId}/jobs/{jobId}/{tier}.{mp3\|wav}` |
| MIME | `audio/mpeg` · `audio/wav` |
| Retention | Free Basic **48 h** · Premium **30 d** (OAD-03) |
| Cleanup | Dedicated janitor (pattern from `takes-janitor`) · cron schedule TBD in wave |
| Orphans | Sweep EXPIRED/DELETED rows + missing DB for leftover keys |
| Quotas | Free **250 MiB** · Premium **2 GiB** active |
| Forbidden | Writing mixes into `take-audio` or `beat-audio` |

**Bucket not created in this gate.**

---

## 6. Render Pipeline

```text
REQUEST
→ requireUser (anon DENY mix render)
→ AUTHZ: own mix session · own READY take · beat PLAYBACK-eligible
→ EFFECTIVE ENTITLEMENT → capability for requested_tier
→ ANTI-ABUSE: duration/size · renders/day · concurrent · quota
→ IDEMPOTENCY: same key → return existing job
→ INSERT job status=QUEUED · entitlement_snapshot · timeout_at=NULL (not started)
→ Adapter.enqueue(job)
→ CLAIM → status=RUNNING · **timeout clock START** · timeout_at=claim_at+180s (IP-03)
→ WORKER: load sources → DSP → encode → upload artifact
→ QC: size/duration/checksum/MIME
→ ARTIFACT READY · job SUCCEEDED
→ client poll → SIGNED DOWNLOAD
```

| Status | Meaning |
|--------|---------|
| QUEUED | Accepted · waiting worker · **queue wait does not consume render timeout** |
| RUNNING | Worker claimed · **180 s wall clock active** |
| SUCCEEDED | Artifact READY |
| FAILED | Terminal error · retry policy may requeue new attempt ≤3 |
| CANCELLED | User/system cancel · **no artifact** |
| TIMEOUT | `now > timeout_at` while RUNNING (or reaper) |

**Timeout semantics (IP-03 CLOSED / OAD-03):**

```text
QUEUED → CLAIM → RUNNING + timeout clock START (180 s wall)
     → SUCCEEDED | FAILED | CANCELLED | TIMEOUT
```

Queue wait **must not** consume the 180 s render timeout.

| Concern | Plan |
|---------|------|
| Timeout | **180 s wall from CLAIM / RUNNING only** → FAILED/`TIMEOUT` |
| Retry | Max **3** attempts · backoff · no silent infinite loop |
| Duplicate | Unique idempotency key per owner |
| Stale RUNNING | Reaper: if `now > timeout_at` → TIMEOUT/FAILED or requeue per attempt |
| Failure recovery | User may create new job if under caps |

---

## 7. Worker Architecture (vendor-agnostic)

**Do not select vendor here.** Separate Owner GO before production heavy render.

### Adapter interface (logical)

```text
enqueue(jobId, payload) → { workerRef }
getStatus(workerRef | jobId) → { state, progress?, error? }
cancel(workerRef) → void
```

### Contracts

| Contract | Content |
|----------|---------|
| **Input** | jobId, ownerId, mixSessionId, tier, params + versions, signed/ephemeral source URLs or worker fetch via service, engine ids |
| **Output** | object_key, byte_size, checksum, duration_ms, sample_rate, bitrate, format |
| **Status** | queued/running/succeeded/failed/cancelled mapped to DB |
| **Retry** | worker may nack; app enforces attempt ≤3 |
| **Timeout** | 180 s wall from CLAIM/RUNNING only (queue wait excluded · IP-03) |
| **Error** | stable `error_code` + safe client message |
| **Idempotency** | same jobId must not double-upload distinct artifacts |
| **Observability** | correlation id = jobId |

Domain (`render_jobs`, AuthZ, caps) **must not** import vendor SDKs — only Adapter.

Fake/local adapter allowed in E3.5–E3.6 for CI until vendor GO.

---

## 8. DSP Plan

| Package | Client preview | Server final |
|---------|----------------|--------------|
| FREE BASIC MIX | Web Audio: vocal/beat gain, balance, basic EQ, comp, limiter, reverb, delay | Same param schema · Basic engine id |
| FREE BASIC MASTER | gain, clip protect, basic limiter, basic loudness | Baked into Basic MP3 |
| PREMIUM PRO MIX | Approx Pro FX UI | Authoritative Pro chain in worker |
| PREMIUM PRO MASTER | Metering UX | LUFS/true peak/pro limit/stereo/QC in worker |

| Topic | Plan |
|-------|------|
| Parameter schema | Versioned JSON · reject unknown keys for engine version |
| Engine ids | e.g. `webaudio-basic-v1` / `server-basic-v1` / `server-pro-v1` |
| Determinism | Same params + engine → golden fixture tests |
| Unsupported params | 400 on session save / job create |
| DSP library choice | **OPEN NON-BLOCKING** — spike in E3.5/E3.7 · not product OD |

Premium UX: disclose preview may differ from export (Final Lock §2 gap).

---

## 9. Encoding Plan (OAD-06 LOCKED · IP-05 CLOSED)

| Tier | Spec | Where |
|------|------|-------|
| BASIC MP3 | **128 kbps · stereo** | Worker after Basic bake |
| HQ MP3 | **320 kbps · stereo** | Worker after Pro bake |
| WAV | **44.1 kHz / 16-bit / stereo** | Worker after Pro bake |

No additional quality tiers. Encode **only** on external worker — not sync Route Handler.
Encoder library = same OPEN NON-BLOCKING spike as DSP.

---

## 10. Premium Entitlement Plan

```text
ACCOUNT LEVEL  → recording (existing entitlement.ts) UNCHANGED semantics
PREMIUM OVERLAY → premium_entitlements.active && (expires_at IS NULL OR expires_at > now)
EFFECTIVE CAPABILITIES → AuthZ
```

| Capability | Who |
|------------|-----|
| `MIX_BASIC` | All authenticated |
| `MASTER_BASIC` | All authenticated |
| `EXPORT_BASIC_MP3` | All authenticated |
| `MIX_PRO` | Premium overlay |
| `MASTER_PRO` | Premium overlay |
| `EXPORT_HQ_MP3` | Premium overlay |
| `EXPORT_WAV` | Premium overlay |
| STEMS | **OUT** |

Anonymous: no mix capabilities (login gate only).
`PRO_RAPPER` / `LEGEND_RAPPER` **≠** Premium.

Resolver: extend `entitlement.ts` family (e.g. `effectiveAudioCapabilities(profile, premiumRow)`) — **no** duplicate AuthZ system.

---

## 11. Authorization Plan

| Resource | Server rules |
|----------|--------------|
| Source take | Owner · READY · not deleted · not expired |
| Beat | PLAYBACK-eligible (PUBLISHED + READY master path via existing Access Gate semantics) |
| Mix session | `owner_id = auth uid` |
| Render job | Owner · tier ≤ capabilities |
| Artifact | Owner · READY · not expired |
| Download | AuthZ then signed URL · never client-chosen object_key |
| Anonymous | DENY all mix/render/artifact |

IDOR: every API loads resource by id **and** owner check (mirror `take-access.ts`).
Grants: **do not** imply Mix (W5 RECORD only).

---

## 12. Anti-Abuse Plan (STANDARD ONLY — Final Lock §1.2)

| Control | Locked value | Enforcement |
|---------|--------------|-------------|
| Max source duration | ≤ **180 s** | Job create |
| Max take size | ≤ **20 MiB** | Job create |
| Max beat size | ≤ **50 MiB** | Job create |
| Free renders/UTC day | **5** | Job create |
| Premium renders/UTC day | **30** | Job create |
| Concurrent jobs | Free **1** · Premium **2** | Claim/create |
| Timeout | **180 s wall from CLAIM/RUNNING** (not from QUEUED) | Worker + reaper |
| Retries | **3** | Job attempts |
| Retention Free | **48 h** | expires_at + janitor |
| Retention Premium | **30 d** | expires_at + janitor |
| Quota | Free **250 MiB** · Premium **2 GiB** | Before enqueue |
| Cost cap | Deny when day count or quota hit | Server |
| Anonymous renders | **0** | Auth gate |
| Idempotency | Unique per owner key | DB |

Config SSOT module (planned): `src/config/audio-render.ts` (name indicative) — **not created now**.
**No new limits invented.** If a future need arises → Owner Decision, not silent change.

---

## 13. Mobile / W6 Plan

**Public Free Audio enablement requires W6 PASS** (OAD-05). Desktop QA ≠ W6.

| Area | Cert focus |
|------|------------|
| iOS Safari | MIME, AudioContext gesture, memory |
| Android Chrome | CPU/thermal, backgrounding |
| Touch UI | Large controls, sheets, limited simultaneous params |
| Interrupt / orientation | Safe pause; no false SUCCEEDED |
| Realtime Basic Mix | Audible stable preview |
| Metering | Readable on small screens |
| Export handoff | Poll job + download |

Wave **E3.8** owns matrix execution.

### Kill switches (IP-06 CLOSED)

| Flag | Role |
|------|------|
| **`e3_public_audio`** | **SSOT** for **public Free Audio release gate**. Default **OFF**. |
| **`e3_mix_enabled`** | Optional **internal/technical** Mix enablement only. **≠** public release authorization. |

```text
Public Free Audio requires ALL of:
  e3_public_audio = ON
  + W6 PASS
  + OWNER PRODUCTION GO
```

`e3_mix_enabled` alone **never** authorizes public Free Audio. No third flag.

---

## 14. UX Implementation Plan

| Actor | Flow |
|-------|------|
| Anonymous | D02 unchanged → Mix & Master → LOGIN GATE (Zaloguj / Załóż / Wróć) |
| Free | Basic Mix → Basic Master → Mixed Preview → Basic MP3 → soft Premium CTA · Pro 🔒 |
| Premium | Full Pro Mix/Master · HQ MP3 · WAV · no fake locks |

Locked click copy: Premium tool message + Odblokuj Premium.
Do not disable entire Free mixer.
**D02 / W1–W5:** no regression; Mix UI is additive surface.

---

## 15. Test Plan

### A. Unit
Param schema validation · capability matrix · cap math UTC day · idempotency key · engine version reject.

### B. Integration
Session create → job → fake worker → artifact → signed URL.

### C. RLS / AuthZ
Foreign session/job/artifact DENY · anon DENY · Premium spoof DENY · tier escalation DENY.

### D. Render pipeline
Status transitions · timeout → FAILED · retry ≤3 · cancel · stale RUNNING reaper.

### E. Encoder
Basic 128 · HQ 320 · WAV 44.1/16/stereo metadata assertions (when real encoder present).

### F. Premium entitlement
Overlay active/expired/inactive · PRO account without Premium → Basic only.

### G. Anti-abuse
6th Free render same UTC day DENY · concurrent overflow DENY · quota DENY.

### H. Preview/final parity
Basic golden fixtures within documented tolerance · Premium approx disclosure.

### I. Mobile W6
Full matrix §13 on device.

### J. D02 regression
Anon QT/session/finalize/preview · no durable DL · cookie/hash/TTL/caps unchanged.

### K. W1–W5 regression
Community upload/moderation · grants RECORD · beat PLAYBACK/DOWNLOAD · recording entitlements.

### L. Production verification
Flagged rollout checklist · janitor dry-run · sample Free+Premium jobs · no CRON_SECRET leakage.

**Critical path cases:**

1. Free Basic MP3 happy path
2. Premium WAV happy path
3. IDOR artifact DENY
4. Expired take blocks job
5. Kill switch: `e3_public_audio` OFF → no public Free Audio
6. **CANCEL → NO ARTIFACT** (IP-04)
7. **PREMIUM CONCURRENCY** (IP-04 / STANDARD): concurrent **2** ALLOW · **3rd** DENY; Free concurrent **1** ALLOW · **2nd** DENY
8. **BEAT ELIGIBILITY FAILURE AT BAKE** (IP-04): beat no longer PLAYBACK-eligible → job FAIL/DENY · no READY artifact
9. **PREMIUM ENTITLEMENT EXPIRES MID-FLIGHT** (IP-04): overlay expires after QUEUED/RUNNING start → fail closed for Pro tier completion per snapshot policy (document in impl: snapshot-at-create vs re-check-at-bake; both must deny unauthorized durable Pro artifact)

---

## 16. Observability Plan

Log (structured): `job_id`, `owner_id` (uuid ok), `tier`, `status`, `attempt`, `duration_ms`, `error_code`, `worker_ref`, entitlement allow/deny reason codes, rate-limit denials, artifact_id.

**Never log:** raw anon tokens, `CRON_SECRET`, service keys, audio bytes, signed URL full query secrets beyond truncated id.

Correlate client poll ↔ job_id.

---

## 17. Migration Order ≡ Wave Order (IP-02 CLOSED)

**Single canonical sequence.** There is **no** alternate ordering. Migration / schema / code steps are nested **inside** waves E3.1→E3.9 below.

```text
E3.1 → E3.2 → E3.3 → E3.4 → E3.5 → E3.6 → E3.7 → E3.8 → E3.9
```

**Dependency-safe parallelism (explicit only):**

| Parallelism | Allowed when |
|-------------|--------------|
| Within **E3.1**: draft multiple migration files | Same wave; apply in listed sub-order before exit |
| Docs / test harness scaffolding | Anytime · no runtime enablement |
| Fake-worker unit tests during E3.5 | After job schema from E3.1 exists |
| **Not allowed:** E3.3 UI before E3.1 schema · E3.6 real encode before Vendor GO · `e3_public_audio` ON before E3.8+Prod GO |

Overall **Owner Implementation GO** required before E3.1 code.

---

## 18. Implementation Waves (canonical · includes migration steps)

| Wave | PRECONDITION | CHANGE (includes migrations where noted) | TEST | EXIT / DELIVERY |
|------|--------------|------------------------------------------|------|-----------------|
| **E3.1** | Owner Impl GO | Config STANDARD caps · migrate `premium_entitlements` (`expires_at`) · `mix_sessions` · `render_jobs` · create private `audio-artifacts` · migrate `audio_artifacts` · **no** `artifact_kind` | unit + live RLS + storage deny anon | **CLOSED** @ `35e1eaa` chain |
| **E3.2** | E3.1 exit | Premium resolver · manual/admin grant path · capability AuthZ helpers | capability matrix · PRO≠Premium | **CLOSED** @ `24e50ac` |
| **E3.3** | E3.2 exit | Mix Session API · Basic Mix client preview · login gate | desktop preview e2e | **CLOSED** @ `8283bd0` · DARK |
| **E3.4** | E3.3 exit | Basic Master preview · params versioning | preview chain | **CLOSED** @ `69dc9d1` · DARK |
| **E3.5** | E3.4 exit | Job API · Adapter · fake worker · anti-abuse · timeout from CLAIM | Queued→Claim→Running→Succeeded/Timeout/Cancel | **CLOSED** @ `fbece37` · DARK · fake-complete = CI/domain |
| **E3.6** | E3.5 exit + **OD-E36-04 = C** | Real Basic bake + **128 kbps stereo** MP3 via native FFmpeg on EXTERNAL worker · signed download · Free export UX · QC | encoder + tests · Production Verify | **CLOSED / PRODUCTION VERIFIED** @ `183b2a4` · **DARK** (not public / not enabled) |
| Later waves (plan draft) | E3.6 exit + **separate Owner GO** | Historical plan names Pro/Premium/W6/public enablement — **NOT SELECTED** in this closeout | — | **DO NOT AUTO-START** |

**Public Free Audio:** `E3_PUBLIC_AUDIO` + W6 PASS + Owner Production Enablement GO.
**STEMS:** no wave.
**E3.6 encode:** **OD-E36-04 = OPTION C** — native/system FFmpeg + libmp3lame on EXTERNAL worker · FFmpeg **not** an app npm dependency · Fake-complete must not ship as public Final Truth.
**Production safety:** `E3_RENDER_JOBS_ENABLED` / `E3_MIX_ENABLED` / `E3_PUBLIC_AUDIO` / `E3_RENDER_WORKER_SECRET` remain **UNSET** after E3.6 verify.

---

## 19. Risk Register

| RISK | IMPACT | LIKELIHOOD | MITIGATION | OWNER DECISION? | BLOCKING? |
|------|--------|------------|------------|-----------------|-----------|
| Worker vendor delay | No real durable encode | Med | Fake adapter for domain; gate public ship | Yes — Vendor GO | For prod encode |
| DSP quality / preview≠final | User trust | Med | Engine versions · UX disclosure · fixtures | No (tolerance ops) | No for plan |
| Mobile thermal / Safari | Public Free fail | Med | W6 gate · simplified mobile UI | No | For public release |
| Orphan Storage objects | Cost/leak | Low | Janitor + status discipline | No | No |
| Accidental D02 change | Contract break | Low | Explicit DO NOT TOUCH + regression suite | No | If touched → HIGH RISK stop |
| Premium spoof | Billing abuse | Med | Server overlay only | No | No if AuthZ correct |
| Cap too tight/loose | UX/cost | Low | STANDARD locked; change needs Owner | Yes if change | N/A |
| Encode license/native on worker | Ops | Med | Vendor spike criteria | Vendor GO | For E3.6 real |
| Feature flag mis-enable pre-W6 | Policy breach | Med | Default off · checklist | Production GO | Yes if violated |

---

## 20. File / Module Impact Map (planned)

### Existing → expected change

| Existing | Expected change | Why |
|----------|-----------------|-----|
| `src/lib/takes/entitlement.ts` | Extend effective audio capabilities | D04 overlay |
| `src/config/recording.ts` | Untouched limits; sibling config for render | SSOT separation |
| `src/components/takes/recording-panel.tsx` | Optional entry CTA to Mix · **no D02 logic change** | UX bridge |
| `src/components/player/playback-shell.tsx` | Imperative hooks for mix dual-play | Preview |
| `src/app/beat/[id]/page.tsx` | Compose Mix surface + login gate | Entry |
| `src/lib/auth/*` | Read premium via service helpers | Overlay |
| `vercel.json` | Later cron for artifact janitor | Cleanup |
| Take/D02 modules | **DO NOT TOUCH** contracts | Regression boundary |

### New (planned names indicative)

| Module | Purpose |
|--------|---------|
| `src/config/audio-render.ts` | STANDARD caps + codec constants |
| `src/lib/audio/premium-entitlement.ts` | Overlay read/resolve |
| `src/lib/audio/capabilities.ts` | Capability checks |
| `src/lib/audio/mix-session.ts` | Session domain |
| `src/lib/audio/render-job.ts` | Job domain + caps |
| `src/lib/audio/artifacts.ts` | Artifact + signed download |
| `src/lib/audio/worker-adapter.ts` | Vendor interface |
| `src/lib/audio/params-schema.ts` | Param validation |
| `src/components/audio/mix-panel-*.tsx` | Free/Premium UI |
| `src/app/api/audio/**` | Session/job/download routes |
| `supabase/migrations/*_e3_*.sql` | Tables/RLS/bucket |
| Artifact janitor + cron route | Retention |

---

## 21. Definition of Done (E3)

- [ ] Authenticated Free: Basic Mix + Basic Master + Mixed Preview + Basic MP3 128 download
- [ ] Premium overlay: Pro Mix + Pro Master + HQ 320 + WAV
- [ ] Server = durable SSOT; client cannot forge Premium/tier/ownership
- [ ] Artifacts in private `audio-artifacts` with signed GET
- [ ] STANDARD anti-abuse enforced server-side
- [ ] Job lifecycle + timeout/retry/idempotency
- [ ] Worker behind Adapter; vendor swappable
- [ ] Anonymous: D02 intact · Mix login gate · zero mixed export
- [ ] W6 certification PASS before public Free Audio
- [ ] D02 + W1–W5 regression suites PASS
- [ ] Observability without secret/audio leakage
- [ ] `e3_public_audio` OFF blocks public Free Audio; `e3_mix_enabled` ≠ public auth

- [ ] Production Verify PASS after Owner Production GO
- [ ] STEMS not shipped

---

## 22. Open Non-Blocking Items

| Item | Notes |
|------|-------|
| External worker **vendor** | Separate Owner GO before prod heavy render |
| Concrete DSP / encoder libraries | Spike in E3.5–E3.7 |
| W6 **execution** | BLOCKING for public Free Audio only |
| Premium preview≠final numeric tolerance | Impl detail + UX copy |
| Artifact signed URL TTL twin config | Default reuse 300 s class |
| Admin UX for manual `premium_entitlements` grant | Ops; source=`manual_admin` |
| Mid-flight Premium policy detail | Snapshot-at-create vs re-check-at-bake — both must deny unauthorized Pro artifact (IP-04 case); pick in impl without new product OD |

IP-01…IP-07 documentation findings: **CLOSED**.
No unresolved **product** Owner Decisions for Architecture. Caps/codec/storage/worker **class** closed.

---

## 23. Rollback / Safety Strategy

| Scenario | Plan |
|----------|------|
| Kill switch | **`e3_public_audio`** = public release SSOT (default OFF). **`e3_mix_enabled`** = internal Mix only · never public auth. Public needs `e3_public_audio` + W6 + Prod GO |
| Render job failure | FAILED status · user message · no partial public object |
| Artifact failure | No READY row without successful upload+QC; orphan sweep |
| Premium entitlement failure | Fail closed (deny Pro) · Free path unaffected if possible |
| Migration rollback | Expand/contract migrations; feature flag off before drop |
| Worker outage | Jobs stay QUEUED/FAILED · UI degraded · no sync fallback encode |
| Storage orphan | Janitor batch remove |

Flags planned only — **not implemented in this gate**.

---

## 24. Regression Boundary

| Area | Rule |
|------|------|
| D02 | No change to anon recording, `brd_tk_aid`, hashing, TTL, 30s, caps, preview, no durable DL, no claim |
| W1–W5 | No change to community upload/moderation, shared grants RECORD-only, playback/download contracts |
| If plan forces touch | **HIGH RISK → stop for Owner Review** before coding that touch |

---

## 25. Implementation GO Checklist

- [ ] Implementation Plan reviewed by Owner
- [ ] All dependencies identified
- [ ] No architecture blocker
- [ ] No scope creep (STEMS deferred)
- [ ] No unresolved Owner product decision for locked OADs
- [ ] Worker vendor isolated from domain (Adapter)
- [ ] DSP/encoder decisions identified as spike/GO
- [ ] W6 gate identified (public enablement)
- [ ] Migration order defined
- [ ] Test strategy defined
- [ ] Rollback strategy defined

---

```text
E3 FULL AUDIO IMPLEMENTATION PLAN = COMPLETE
FINDINGS IP-01…IP-07 = CLOSED

ARCHITECTURE = CLOSED
PRODUCT SCOPE = CLOSED
IMPLEMENTATION PLAN = READY FOR OWNER GO
IMPLEMENTATION GO = NOT YET

CODE CHANGES = NONE
DB MIGRATIONS = NONE
STORAGE CHANGES = NONE
WORKER CHANGES = NONE
VENDOR CHANGES = NONE
COMMIT = NONE
PUSH = NONE
DEPLOY = NONE

NEXT GATE = OWNER IMPLEMENTATION GO

ABSOLUTE STOP
```
