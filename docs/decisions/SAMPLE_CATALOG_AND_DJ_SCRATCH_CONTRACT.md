# BitRymDym — Sample Catalog & Full DJ Scratch Contract

**Status:** OWNER-APPROVED product contract · **implementation NOT authorized**  
**Authority:** Detailed product + architecture contract for platform sample catalog, private TAKE copy, SAMPLE/SCRATCH tracks, and Scratch DJ v1  
**Does not replace:** [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) (product WHAT) · [PROJECT_STATE.md](../PROJECT_STATE.md) (living tip / deploy / NEXT) · [REUSE_SSOT_MAP.md](../architecture/REUSE_SSOT_MAP.md) (reuse / do-not-duplicate)  
**Updated:** 2026-10-25 — OD-SC-01…05 + catalog object-key design direction (narrow docs GO; see §12)  
**Implementation:** **NOT AUTHORIZED** · **NOT SHIPPED**  
**OD-15 / OD-16:** remain **OPEN** · **Premium Retention:** remains **HOLD**

---

## 0. Status and evidence rules

```text
This document = approved product contract for future work.
This document ≠ shipped feature.
This document ≠ Implementation GO.
This document ≠ production verification.
CODE + REMOTE SCHEMA + PRODUCTION EVIDENCE > prose.
Historical audits ≠ fresh HEAD / production re-verify.
```

Evidence labels used below:

| Label | Meaning |
|-------|---------|
| **FACT** | Confirmed from safe docs / Owner-approved decisions in this contract |
| **INFERENCE** | Conclusion required to keep Owner decisions coherent |
| **NOT VERIFIED** | Technical detail not confirmed in this docs GO (no code/Git re-open) |
| **BLOCKED** | Cannot verify or edit due to Sacred WIP / dirty WIP / missing file |

---

## 1. Scope

**In scope (contract only):**

- Platform-published sample catalog assets (v1 publishers = platform only).
- Copy of catalog audio bytes into a private user `TAKE`.
- Studio clip that references that private `TAKE` (`source_kind = TAKE`).
- Functional Studio track types `SAMPLE` and `SCRATCH`.
- Full Scratch DJ v1 behaviour (not a static trim/gain clip).
- Live playback and `STUDIO_EXPORT` rules for the above.
- Persistence via existing Studio persistence + CAS.

**Out of scope (explicit):**

- Implementation, migrations, Storage apply, deploy, feature flags flip.
- User-uploaded catalog samples (v1).
- External AI audio, stems, reference mastering.
- Premium Retention worker (remains HOLD).
- SFM Versions product cutover / worker enablement.
- Closing OD-15 / OD-16.
- Creating `docs/architecture/STUDIO_MASTER_ARCHITECTURE.md` (file absent; second Studio arch SSOT forbidden without separate Owner GO).
- Second `StudioAudioEngine`, second AudioContext, second player, second transport, second persist orchestrator, or parallel CAS write path.
- Time-stretch independent of pitch (OUT of Scratch v1).
- Jog-gesture automation lanes in export (OUT of v1).
- Undo/redo for Scratch unless an existing SSOT stack is later proven reusable without scope expansion (**NOT VERIFIED** in this docs GO).

---

## 2. Glossary

| Term | Meaning |
|------|---------|
| **Catalog Asset** | Platform-owned original sample audio + metadata + license + publish state |
| **User TAKE** | Private copy of audio bytes in the existing take domain (`take-audio`), owned by the user |
| **Studio Clip** | Timeline clip with `source_kind = TAKE` pointing at the user copy |
| **SAMPLE track** | Studio track type for sample placement (non-DJ static use of TAKE clips) |
| **SCRATCH track** | Studio track type that hosts Scratch DJ v1 controls on TAKE clips |
| **Scratch DJ v1** | Full jog/cue/reverse/pitch-rate/BPM sync set defined in §9 |
| **Approved Scratch state** | Last persisted Scratch parameters used for live resume and for export |

---

## 3. Canonical model: Catalog Asset → User TAKE → Studio Clip

```text
Catalog Asset (platform original)
        │  copy bytes (server)
        ▼
User TAKE (private · QUICK · beat_id = project.beat_id · TTL/caps)
        │  place clip
        ▼
Studio Clip (source_kind = TAKE · sourceTakeId = copy id)
```

| Entity | Responsibility | Ownership |
|--------|----------------|-----------|
| Catalog Asset | Original bytes + metadata + license + PUBLISHED/WITHDRAWN | Platform |
| User TAKE | Private playable/exportable copy; subject to take TTL and caps | User (`owner_id`) |
| Studio Clip | Timeline placement, geometry, fades, Scratch params (on SCRATCH) | Project owner |

**FACT (product):** Catalog original and private TAKE are distinct.  
**FACT (product):** Adding a sample to a project **copies bytes**; a bare reference to the catalog original is insufficient for Studio source identity.  
**INFERENCE:** Clip `source_kind` remains `TAKE` (no new clip source kind required for catalog use).  
**NOT VERIFIED:** Physical table/bucket for Catalog Asset (must reuse existing Storage policy where possible; **do not invent a new bucket name in this contract**).

---

## 4. Ownership, authorization, license

1. **Publishers (v1):** platform only. User catalog upload = OUT.
2. **Catalog read:** only assets in an allowed publish state for catalog browsing (**FACT** product; exact role matrix **NOT VERIFIED** against live AuthZ code in this GO).
3. **Copy / preview / place / export of the copy:** must pass existing **owner** gates for the user TAKE. No weakening of RLS or service-role owner checks to “share” another user’s private take.
4. **License (mandatory per asset):**
   - Each Catalog Asset carries an explicit license record.
   - Copy into Studio, use on the timeline, and WAV `STUDIO_EXPORT` are allowed **only** within that license.
   - **`PUBLISHED` alone does not grant export permission.**
5. **Provenance:** each copy MUST retain a catalog asset identifier so origin can be audited **without** exposing other users’ private TAKE rows or keys.

---

## 5. Server-side `beat_id` validation

```text
Authoritative source = Studio project.beat_id (server-loaded for the authenticated project owner)
Client-supplied beat_id = ignored for binding
```

Required sequence (logical):

1. Authenticate user; load project; verify project ownership.
2. Reject if project has no beat attached.
3. Set `take.beat_id := project.beat_id` for the new copy.
4. Reject if catalog asset duration or policy would violate take rules.

**FACT (product):** Copy `beat_id` must match the Studio project beat.  
**INFERENCE:** Validation happens at copy time on the server, not via trust of client body fields.

---

## 6. TAKE policy for catalog copies (no catalog exceptions)

Catalog copies use the **existing** TAKE model with:

| Rule | Value |
|------|--------|
| `recording_mode` | `QUICK` |
| `beat_id` | Required; = project beat (§5) |
| Max duration | ≤ **180** seconds |
| Ownership | Private user ownership |
| TTL | Existing take TTL policy |
| Session / active READY caps | Existing take / sample policy caps |

**No catalog-specific exceptions** to TTL, caps, duration, or ownership.

**FACT (product):** MIC Quick Take language in MASTER_SSOT remains the mic recording product; this contract **extends** the TAKE domain to also hold platform catalog copies under the same hard limits. It does **not** claim catalog copies are already implemented.

---

## 7. Storage, copy mechanics, idempotency, failures

### 7.1 Storage

- Private copy lands in the existing **user TAKE** durable path (`take-audio` plane per living architecture docs).
- Catalog **originals** (direction): existing bucket **`beat-audio`**, separate platform prefix, separate catalog metadata entity — **OD-SC-01** (`OWNER-ACCEPTED — TECHNICAL DECISION`). Exact object key (**OWNER-ACCEPTED — DESIGN DIRECTION ONLY**): `catalog/{catalogAssetId}/original.bin` in `beat-audio` (see §12). **No fourth bucket.**
- **NOT VERIFIED before Implementation GO:** access / list / delete / retention / orphan-cleanup policies for that catalog original plane. Acceptance of direction ≠ those controls verified.

### 7.2 Required copy result

On success:

1. Object bytes exist under the user’s take object key layout.
2. TAKE row is `READY` with `recording_mode = QUICK`, correct `beat_id`, duration ≤ 180 s, provenance catalog asset id.
3. Optional same-product step: place Studio clip on a SAMPLE/SCRATCH track.

### 7.3 Atomicity

**NOT VERIFIED:** end-to-end atomic Storage + DB transaction.  
**Required contract behaviour:** partial failure must not leave a user-visible READY take without bytes, nor orphan durable bytes without a recoverable/failed row; retries must be safe.

### 7.4 Idempotency

Logical idempotency key (or equivalent server dedupe):

```text
(userId, projectId, catalogAssetId, project.beat_id)
```

Repeat of the same request must not create a second READY copy / duplicate identical clip placement for the same intent.

### 7.5 Error classes (product)

`CATALOG_NOT_FOUND` · `CATALOG_WITHDRAWN` · `LICENSE_DENIES_COPY` · `LICENSE_DENIES_EXPORT` · `DURATION_EXCEEDED` · `TAKE_CAP` · `TTL_POLICY` · `PROJECT_NO_BEAT` · `FORBIDDEN` · `COPY_FAILED` · `SOURCE_UNAVAILABLE` (playback/export)

Messages to users: Polish, actionable. No silent success.

---

## 8. Publish, withdraw, retention, project beat change

| Event | Behaviour |
|-------|-----------|
| Asset `PUBLISHED` | Eligible for browse/copy **subject to license** |
| Asset withdrawn | **Blocks new copies**; does **not** by itself delete existing private TAKEs |
| User TAKE expires / janitor | Removes **copy** only; catalog original untouched |
| Premium Retention | **HOLD** — out of this contract |
| Project beat changes after copy | Existing copies **keep** their `beat_id` and normal TTL; **no automatic rebinding**. New copies use the new project beat |

---

## 9. Scratch DJ v1 — functional definition

**FACT (product):** Scratch is a real DJ feature set, not a renamed static clip.

### 9.1 Required capabilities

1. **Jog / scratch** with variable speed and direction (mouse + **full touch jog on mobile in v1**).
2. **Cue** set and return-to-cue.
3. **Reverse** playback.
4. **Pitch / playback rate** (linked rate+pitch model in v1).
5. **BPM / project grid sync** (transport alignment).
6. **Optional quantize** (may ship off by default; must be designed, not forbidden).

### 9.2 Release-after-jog

On jog release: **return to normal Studio transport** (Owner-approved).

### 9.3 Explicitly OUT of Scratch v1

- Time-stretch independent of pitch.
- Jog-gesture automation recording for export.
- Second audio engine / player / transport.
- Vinyl RIAA simulation, multi-deck crossfader, external MIDI controllers (unless later Owner expands scope).

### 9.4 SAMPLE vs SCRATCH tracks

| Track type | Role |
|------------|------|
| `SAMPLE` | Hold TAKE clips (catalog copy or other eligible private takes); trim/split/gain/fade/track FX; no jog layer required |
| `SCRATCH` | Same source model + Scratch DJ v1 controls |

Track creation allowlist and UI wiring: **implementation detail**; historical reports noted RPC limits — **NOT RE-VERIFIED** in this docs GO. Contract requires functional SAMPLE and SCRATCH tracks in the first complete Studio flow once Implementation GO is issued.

### 9.5 Interaction contract

| Topic | Rule |
|-------|------|
| Jog input | Pointer/touch capture; delta → instantaneous rate/direction relative to scratch playhead |
| Mobile | Full touch jog required in v1 |
| Cue | Per-clip cue position in source ms; set + jump |
| Clip bounds | Clamp; no read outside clip source window |
| Keyboard | Optional shortcuts; not the only control path |
| Global loop | Must not invent a second clock; follow Studio transport SSOT |

### 9.6 DSP contract (v1)

| Parameter | Rule |
|-----------|------|
| Rate / direction | Continuous during jog; clamp illegal values; no crash |
| Reverse | Boolean; audible live; must be represented in approved state |
| Pitch / rate | Linked in v1 (no independent time-stretch) |
| Invalid values | Clamp + controlled error; never silent no-op export |

Performance: jog must remain responsive; UI thread must not block on long synchronous offline work.

### 9.7 Sync contract

- Project BPM is tempo SSOT.
- BPM change does not destructively rewrite TAKE bytes.
- During jog, scratch playhead may diverge from global transport; on release, return to normal Studio transport (§9.2).
- Global Play/Pause/Stop applies to scratch voices per Studio transport rules.

### 9.8 Persistence / CAS

- Scratch parameters (cue, reverse, rate/pitch mode values, approved offsets) persist through the **existing** Studio persistence path and CAS (`document_version` / `studio_cas_*` / persist orchestrator).
- **Forbidden:** second write path, client-direct RPC bypass, parallel orchestrator.
- Undo/redo: **OUT of v1** unless a pre-existing SSOT mechanism is later confirmed reusable (**NOT VERIFIED** here).

### 9.9 Nondestructive editing

- Jog/scratch must not rewrite TAKE object bytes in place.
- Trim / split / duplicate: clamp cue into new geometry; preserve reverse and pitch/rate approved state unless Owner later specifies reset (default = preserve + clamp).

---

## 10. Live playback and `STUDIO_EXPORT`

| Class | Rule |
|-------|------|
| Reverse, approved rate/pitch, cue offset, clip geometry | Must be reflected in export from **approved Scratch state** |
| Live jog gesture | Export uses **last approved parameter state**, not a recording of the gesture (v1) |
| Missing source / unsupported DSP | Controlled failure — **no silent omission** of reverse/pitch/rate in WAV |
| Live ↔ offline bit-perfect parity | **NOT declared as FACT** without evidence. Required: no silent feature drop; quality differences must be explicit if any |

Shared identity: the same private `sourceTakeId` resolves for live adapters and offline PCM. Catalog original is not the Studio clip source.

---

## 11. Acceptance criteria (for a future Implementation GO)

These are verification targets **after** a separate Implementation GO — not claims of current GREEN.

1. Platform catalog asset can be copied to a private TAKE owned by the caller with `recording_mode = QUICK` and `beat_id` equal to the project beat.
2. Client cannot bind a different `beat_id` than the server project beat.
3. Copy respects ≤ 180 s, TTL, and active/session caps with no catalog exceptions.
4. License denying export blocks `STUDIO_EXPORT` even if asset is PUBLISHED.
5. Withdrawn asset blocks new copies; existing private copies remain until their own TTL.
6. Take expiry / janitor does not delete the catalog original.
7. Project beat change does not rebind existing catalog copies.
8. SAMPLE and SCRATCH tracks can be created and host TAKE clips in the product flow.
9. Scratch jog (mouse + mobile touch) changes audible rate/direction; release returns to Studio transport.
10. Cue set/jump works; reverse is audible; pitch/rate approved state reloads after project reopen.
11. Persist uses existing Studio/CAS path only.
12. Export encodes approved Scratch state; missing source or unsupported DSP fails closed (Polish error).
13. No second StudioAudioEngine / AudioContext / persist orchestrator introduced.
14. Provenance catalog asset id is stored on the copy without exposing foreign private takes.

---

## 12. OD-SC-01…05 — OWNER-ACCEPTED technical decisions

**Status of each row below:** `OWNER-ACCEPTED — TECHNICAL DECISION` (Owner acceptance 2026-10-25).  
**This section ≠ Implementation GO.**  
**Implementation NOT AUTHORIZED · NOT SHIPPED.**

| ID | Decision |
|----|----------|
| **OD-SC-01** | Catalog originals use existing **`beat-audio`**, a **separate platform prefix**, and a **separate catalog metadata entity** (independent of beat MASTER). Retention of catalog originals is **independent** of the `take-audio` janitor. **No fourth bucket.** Exact object key: **OWNER-ACCEPTED — DESIGN DIRECTION ONLY** — see note below. Before Implementation GO: verify access, listing, delete, retention, and orphan cleanup for that plane — acceptance of direction does **not** mean those controls exist or were verified. |
| **OD-SC-02** | Original allowlist: `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/mp4`, `audio/aac`. Max **20 MiB**. Max **180** seconds. **FLAC off** in catalog v1. MIME, **real file content**, byte size, and duration are **separate fail-closed gates**; client-declared MIME alone is insufficient. Do **not** claim content-validation is already implemented or verified without evidence. |
| **OD-SC-03** | Reject private TAKE copies **above 20 MiB**. Do **not** change `TAKE_AUDIO_MAX_BYTES`. Do **not** change the **180** second limit. Copies still obey private TAKE ownership, user caps, `QUICK`, TTL, and session/active limits. Changing those limits needs a separate Owner decision and GO. |
| **OD-SC-04** | **No FLAC** in sample catalog v1. **No silent/implicit transcoding.** Revisit needs a separate decision and TAKE-format compatibility analysis. |
| **OD-SC-05** | Quantize **default OFF**. UX intent only — **not** proof that Quantize exists or works. Scratch implementation detail remains outside this technical-decision record. |

**OWNER-ACCEPTED — DESIGN DIRECTION ONLY (2026-10-25):** Exact catalog original object key: bucket **`beat-audio`**, key **`catalog/{catalogAssetId}/original.bin`**. Catalog originals remain modeled by a **separate metadata entity**, not as another beat MASTER or another MASTER entry in `beat_audio_assets`. This decision does **not** authorize migrations, code changes, Storage policy changes, or automatic orphan cleanup. Production Storage policies and blocked cleanup tooling remain **NOT VERIFIED**. **Implementation NOT AUTHORIZED · NOT SHIPPED.** Shipping requires a separate Owner **Implementation GO**.

### 12.1 Copy protocol — PROPOSED IMPLEMENTATION DESIGN (not shipped)

Documented for a future Implementation GO only:

1. Authorize user and project.  
2. Load authoritative `beat_id` from the project on the server.  
3. Verify catalog asset publication and COPY/EXPORT license rights.  
4. Validate MIME, bytes, and duration (fail-closed).  
5. Enforce existing TAKE caps.  
6. Idempotency / anti-parallel duplicate protection.  
7. Controlled non-READY intermediate state.  
8. Write copy object and verify it.  
9. Finalize TAKE to READY with catalog provenance only after successful verification.  
10. Safe retry; incomplete rows and Storage orphans handled explicitly.  
11. Place clip on the project as a **separate** CAS operation.

Storage and DB are **not** automatically one atomic transaction. Idempotency, retry, orphan GC, and concurrency behaviour require separate design and evidence (**NOT VERIFIED** as implemented).

---

## 13. Implementation blockers (docs-level)

| Blocker | Status |
|---------|--------|
| Catalog original Storage **direction** | **OWNER-ACCEPTED (OD-SC-01)** — `beat-audio` + prefix + encja `catalog_assets` · klucz `catalog/{catalogAssetId}/original.bin` · **repo policies SHIPPED** (`20261027220000_…`) · **prod apply APPLIED** history `20261027225553` · schema read-back **PASS** · live probe upload **BLOCKED** (osobne GO) · access/list runtime **NOT VERIFIED** |
| Audio format allowlist + max byte size | **OWNER-ACCEPTED (OD-SC-02…04)** — values in §12 unchanged · runtime declared gates **SHIPPED in repo** (`validateCatalogOriginalUploadMeta`) · content sniff **SHIPPED in repo** (`sniffAudioContainer` / `validateCatalogOriginalContentSniff`) |
| Exact AuthZ role matrix for catalog browse | **NOT VERIFIED** |
| Fresh confirmation of `studio_cas_add_track` allowlist / editor wiring | **BLOCKED / NOT RE-VERIFIED** (dirty Studio files excluded) |
| Storage↔DB copy failure protocol details | **NOT VERIFIED** (behaviour required; technique open) — see §12.1 |
| Live/offline Scratch DSP parity evidence | **NOT VERIFIED** (must not be claimed until tested) |
| Quantize feature existence / behaviour | **NOT VERIFIED** — OD-SC-05 is default-OFF intent only |
| Sacred WIP eligibility service | **BLOCKED** — out of this contract |
| Implementation GO | Gate 3 + prod apply (2026-10-27): Storage+allowlist+API skeleton + schema **authorized/applied** · live probe **PASS** · content sniff **SHIPPED in repo** · copy path **SHIPPED in repo** · prod copy runtime **NOT VERIFIED** · Studio unlock + Scratch DJ v1 **PARTIAL** (2026-10-28) — domain/panel/catalog→place · live reverse / CAS persist / SAMPLE-SCRATCH create / export encode **OUT** · [STUDIO_UNLOCK_AUDIT_2026-10-28.md](../audits/STUDIO_UNLOCK_AUDIT_2026-10-28.md) |

---

## 14. Document hierarchy

| Layer | Document | Role |
|-------|----------|------|
| Product WHAT (short) | `docs/ssot/MASTER_SSOT_v0.1.md` | Pointer + high-level; version **0.1** unchanged by this contract |
| Detailed contract | **This file** | Canonical for catalog copy + Scratch DJ v1 + OD-SC technical decisions |
| Living ops | `docs/PROJECT_STATE.md` | Tip / deploy / NEXT; must not mark SHIPPED from docs alone |
| Reuse | `docs/architecture/REUSE_SSOT_MAP.md` | One engine, take pipeline, CAS |
| Storage planes | `docs/architecture/SYSTEM_ARCHITECTURE.md` | Durable buckets; catalog original direction → OD-SC-01 |

Do not create a second Studio master architecture SSOT without Owner GO.

---

## 15. Status history

| Date | Event |
|------|-------|
| 2026-10-25 | Owner docs-only GO: contract written; implementation still unauthorized; OD-15/OD-16 OPEN; Premium Retention HOLD |
| 2026-10-25 | Narrow docs GO: OD-SC-01…05 recorded as `OWNER-ACCEPTED — TECHNICAL DECISION` in this file only; **Implementation NOT AUTHORIZED · NOT SHIPPED**; living SSOT / CHANGELOG not updated in that GO |
| 2026-10-25 | Narrow docs GO: exact catalog object key `catalog/{catalogAssetId}/original.bin` recorded as `OWNER-ACCEPTED — DESIGN DIRECTION ONLY` in this file only; migrations/code/Storage policies/orphan cleanup **not** authorized; **Implementation NOT AUTHORIZED · NOT SHIPPED** |

---

## 16. Related SSOT (safe pointers)

- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) — Quick Take / product foundation (MIC recording language remains; catalog copy is additive contract)
- [REUSE_SSOT_MAP.md](../architecture/REUSE_SSOT_MAP.md) — StudioAudioEngine / persist / CAS
- [PROJECT_STATE.md](../PROJECT_STATE.md) — living tip / STUDIO_EXPORT / NEXT
- [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) — Storage planes
- [STUDIO_FINAL_MIX_SFM2_OFFLINE_RENDER.md](../architecture/STUDIO_FINAL_MIX_SFM2_OFFLINE_RENDER.md) — offline TAKE/BEAT_REF vs ARTIFACT (historical architecture evidence; not Scratch GREEN)
