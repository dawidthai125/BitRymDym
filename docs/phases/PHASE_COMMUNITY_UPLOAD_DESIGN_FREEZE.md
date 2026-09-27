# Phase — Community Beat Upload + Moderation Design Freeze

**Title:** Community Beat Upload + Moderation  
**Candidate ID:** Community Upload V1  
**Baseline:** `origin/main` @ `47643c2` (Phase 1.9 CLOSED · Audio Transport V1 CLOSED · GAP-PUBLISH-READY CLOSED)  
**Depends on:** Phase 1.4 beats · Phase 1.5 Access Gate · Phase 1.7 PLATFORM ops · Audio Transport V1 · BPM Production V1 · Publish READY hard gate  
**Supabase project:** `rzzxrgcdogkybkiidqgw`  
**SSOT:** §3–§4, §6–§9, §12–§13, §36, §39  
**Document status:** DESIGN FREEZE — **READY / OWNER GO** (2026-09-27)  
**Implementation status:** **WAVE 1 COMPLETE** · **WAVE 2 COMPLETE** · **WAVE 3 IMPLEMENTED** · Wave 4 **PENDING** (APPROVED→PUBLISHED)

```text
COMMUNITY LOOP = USER → UPLOAD → MODERATION → APPROVED → PUBLISHED
WAVE 1 = DB/RLS/TRIGGER/AUTHZ FOUNDATION — COMPLETE @ 609a05e
WAVE 2 = USER SIGNED AUDIO TRANSPORT — COMPLETE @ 9cfb3cf
WAVE 3 = SUBMIT + MODERATION — IMPLEMENTED (APPROVED ≠ PUBLISHED)
WAVE 4 = APPROVED → PUBLISHED — PENDING
USER PUBLISH = DENY
APPROVED ≠ AUTO PUBLISHED
BUCKET = beat-audio (reuse)
OBJECT KEY = user/{ownerId}/{beatId}/{assetId}/master.bin
BPM V1 = UNCHANGED
ACCESS GATE / PLAYBACK / DOWNLOAD = REUSE
NO NEW BUCKET / NO NEW AUDIO STACK / NO COMMENTS / NO QT
```

Legend:

| Label | Meaning |
|-------|---------|
| **APPROVED / OWNER GO** | Owner-approved freeze — execution must follow |
| **REUSE** | Existing locked capability — do not rebuild |
| **FROZEN** | Approved rule for Community Upload V1 |
| **OUT** | Explicitly not in this epic |
| **CANDIDATE** | Allowed later; not required for V1 exit |

---

## 1. Goal

Enable authenticated USER to create USER-owned beats, upload MASTER audio via signed private Storage, submit for moderation, and — after staff approve + staff publish with active MASTER READY — appear in the existing public catalog with existing playback and download limits.

Must not regress PLATFORM admin create / transport / publish / Access Gate.

---

## 2. In scope

| Item | Status |
|------|--------|
| USER-owned beat create (`ownership_type=USER`, `owner_id=auth.uid()`, `DRAFT`) | IN |
| Signed upload to private `beat-audio` with server-chosen `user/…` keys | IN |
| Analyze + duration + BPM V1 + finalize → MASTER READY | IN |
| Submit `DRAFT → PENDING_REVIEW` (own + READY) | IN |
| Moderator queue approve / reject (+ required `rejection_reason`) | IN |
| Staff publish `APPROVED → PUBLISHED` (ADMIN + MODERATOR) + READY hard gate | IN |
| USER archive own `DRAFT` / `REJECTED` / `PUBLISHED` → `ARCHIVED` | IN |
| UX: `/beats/upload`, `/account/beats`, `/admin/moderation` | IN |
| RLS / trigger / permission grants for community path | IN |
| Grant USER `beats.create` | IN |
| Column `rejection_reason text` (nullable) | IN |
| Optional `submitted_at timestamptz` for queue UX | CANDIDATE |

---

## 3. Out of scope

- New Storage bucket  
- New audio / playback / download stack  
- New BPM detector / accuracy certification  
- Comments / voting / messaging (OD-10, OD-11, OD-18 remain separate)  
- Quick Take / Tracks / Payments / Premium  
- Watermarking (OD-13) / mix-export (OD-14)  
- Orphan asset janitor cron  
- `beats.create_own` (unless implementation proves required — prefer reuse `beats.create`)  
- USER self-publish  
- Auto-publish on APPROVE  
- Moderator metadata edit  
- Ownership transfer by USER/MODERATOR  
- Authenticated client Storage INSERT policies  

---

## 4. Ownership

**FROZEN**

| Rule | Value |
|------|--------|
| USER beat | `ownership_type = USER` |
| Owner | `owner_id = auth.uid()` at create |
| Immutability | USER cannot change `owner_id` or `ownership_type` |
| PLATFORM | Remains ADMIN-only create path; must not be reachable via community APIs |
| Integrity | Existing DB check: USER ⇒ owner set; PLATFORM ⇒ owner NULL |

Ownership is enforced by **service + RLS + trigger**, not by permission key alone.

---

## 5. Lifecycle

**FROZEN** happy path (USER-owned):

```text
DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED
```

**FROZEN** reject / rework:

```text
PENDING_REVIEW → REJECTED  (rejection_reason required)
REJECTED → DRAFT           (USER own)
DRAFT → PENDING_REVIEW     (again; requires active MASTER READY)
```

**FROZEN** archive (USER own only):

```text
DRAFT → ARCHIVED
REJECTED → ARCHIVED
PUBLISHED → ARCHIVED
```

**FROZEN** denials for USER:

- → `PUBLISHED`  
- → `APPROVED`  
- → `PENDING_REVIEW` without active MASTER READY  
- ownership / PLATFORM mutations  
- hard DELETE (archive is the soft lifecycle exit)

**FROZEN** staff:

| Actor | Transitions |
|-------|-------------|
| MODERATOR | `PENDING_REVIEW → APPROVED` · `PENDING_REVIEW → REJECTED` · `APPROVED → PUBLISHED` (USER beats only) |
| ADMIN | Full lifecycle per existing matrix + community edges as needed |

`PUBLISHED → DRAFT` remains forbidden for all actors.

---

## 6. AuthZ

**FROZEN chain:**

```text
AUTH → ownership AuthZ → permission → business transition → RLS → Storage
```

| Actor | Capability | Permission / rule |
|-------|------------|-------------------|
| USER | Create own USER DRAFT | `beats.create` + ownership force |
| USER | Edit own allowed states | ownership AuthZ (not broad `beats.edit`) |
| USER | Submit DRAFT→PENDING_REVIEW | ownership + READY (transition AuthZ) |
| USER | Archive own DRAFT/REJECTED/PUBLISHED | ownership + transition |
| USER | Approve / Reject / Publish | **DENY** |
| MODERATOR | Queue + approve/reject | `beats.approve` / `beats.reject` |
| MODERATOR | Publish USER `APPROVED→PUBLISHED` | **role MODERATOR** + USER ownership + READY; **do not** grant `beats.edit` (avoids PLATFORM metadata write) |
| ADMIN | PLATFORM + full staff | existing `beats.create` / `beats.edit` / delete + role ADMIN |

**FROZEN:** Role ≠ Account Level. Account levels may upload (OD-COMMUNITY-04) but never bypass moderation or publish.

**FROZEN:** PLATFORM transport/create paths keep **explicit ADMIN role checks** in addition to `beats.create` (already present) so USER grant cannot open PLATFORM upload.

---

## 7. RLS

**FROZEN target model** (implementation later):

### `beats`

| Policy intent | Rule |
|---------------|------|
| USER INSERT | `ownership_type=USER` AND `owner_id=auth.uid()` AND `status=DRAFT` |
| USER SELECT | PUBLISHED (existing) + own rows (existing `beats_select_own`) |
| USER UPDATE | own row only; allowed transitions only; no ownership change; no →PUBLISHED |
| USER DELETE | **DENY** (archive via UPDATE status) |
| MODERATOR UPDATE | review path + publish path for USER APPROVED→PUBLISHED (or service_role after AuthZ) |
| ADMIN | existing full policies |

**Trigger `prevent_beat_privilege_escalation` must be extended** to allow:

- USER self-insert USER+own+DRAFT  
- USER status edges: DRAFT↔PENDING_REVIEW (submit), REJECTED→DRAFT, *→ARCHIVED (own)  
- MODERATOR: PENDING_REVIEW→APPROVED\|REJECTED (+ `rejection_reason` whitelist)  
- MODERATOR: APPROVED→PUBLISHED for USER beats only (or perform via service_role after AuthZ)

Ownership change remains ADMIN/service_role only.

### `beat_audio_assets`

Prefer **admin/service client after ownership AuthZ** for insert/update/finalize (same pattern as PLATFORM transport). No broad authenticated INSERT.

### `storage.objects`

**FROZEN:** default deny; **server-issued signed upload only**. No authenticated Storage INSERT policy for community.

---

## 8. Storage

**FROZEN**

| Item | Value |
|------|--------|
| Bucket | `beat-audio` (reuse, private) |
| Upload | Server-issued signed upload URL |
| Object key | `user/{ownerId}/{beatId}/{assetId}/master.bin` |
| Client may choose | **nothing** (no bucket, no path, no beat/asset ids in key construction) |
| MIME / size | REUSE allowlist + `BEAT_AUDIO_MAX_BYTES` (50 MiB) |
| New bucket | **NO** |

PLATFORM keys remain `platform/{beatId}/{assetId}/…`. Validator must accept both prefixes.

---

## 9. Upload flow

**FROZEN**

```text
USER FILE
  → AUTH + USER AuthZ (own create)
  → create USER DRAFT (owner_id=uid, status=DRAFT)
  → asset PENDING_UPLOAD + signed upload (server key)
  → client uploadToSignedUrl → private beat-audio
  → analyze (duration + BPM V1)
  → finalize → MASTER READY
  → (optional edit metadata while DRAFT)
  → submit → PENDING_REVIEW (require READY)
```

REUSE Audio Transport V1 pattern; **do not** open admin PLATFORM session APIs to USER.

---

## 10. Analysis

**FROZEN**

- Duration: server truth (1–180)  
- BPM: Production V1 unchanged (C_NEAR + RULE B) — **ACCURACY NOT CERTIFIED**  
- Client BPM untrusted; override allowed within validator  
- No new detector / telemetry columns required for V1  

---

## 11. Moderation

**FROZEN**

| Item | Rule |
|------|------|
| Queue visibility | Staff SELECT (existing staff policy) |
| Approve | `PENDING_REVIEW → APPROVED` |
| Reject | `PENDING_REVIEW → REJECTED` + **required** `rejection_reason` |
| User visibility of reason | YES (own beat SELECT) |
| Comments / threads | **OUT** |
| Auto-publish on approve | **NO** |
| Moderator metadata edit | **NO** |
| Moderator ownership change | **NO** |
| New moderation table | **NO** for V1 |

Column: `rejection_reason text` nullable. Cleared on successful re-submit or when returning to DRAFT (implementation detail; must not leak stale reason as active rejection after re-submit without Owner UX preference — default: clear on `REJECTED → DRAFT`).

---

## 12. Publish

**FROZEN** hard gate (generalize existing gate; do not fork):

| Ownership | From status | Who | Extra |
|-----------|-------------|-----|-------|
| PLATFORM | `DRAFT` | ADMIN | active MASTER READY |
| USER | `APPROVED` | ADMIN or MODERATOR | active MASTER READY |
| any | any | USER | **DENY** |

MODERATOR must **not** bypass READY. ADMIN must **not** bypass READY for normal publish paths.

REUSE: `transitionBeatStatus` + READY assertion (extend beyond PLATFORM-only / DRAFT-only).

---

## 13. UX

**FROZEN routes (minimal)**

| Surface | Route |
|---------|-------|
| USER upload | `/beats/upload` |
| USER library / status | `/account/beats` |
| Moderator queue | `/admin/moderation` |

USER status labels (product-facing may map analyzing/ready from asset state):

```text
DRAFT · ANALYZING · READY · PENDING_REVIEW · APPROVED · REJECTED · PUBLISHED · ARCHIVED
```

Required metadata: title, bpm, duration (server), MASTER READY before submit.  
Optional: producer, genre, style, key, scale, tags, cover_ref.  
Reuse audio-first UX patterns from PLATFORM; separate from `/admin/beats/new`.

Moderator queue columns: title, producer, owner, created_at, submitted_at (if present), duration, BPM, MASTER READY, status.  
Actions: APPROVE · REJECT (reason required).

---

## 14. Security

**FROZEN threat model (must defend)**

| Threat | Defense |
|--------|---------|
| Cross-user beat IDOR | Ownership AuthZ on every mutate/upload/analyze/finalize/submit |
| Cross-user asset IDOR | Bind asset.beat_id + owner; server keys |
| Owner spoofing | Force `owner_id=auth.uid()` on insert; immutable |
| ownership_type spoofing | Force USER on community create; block PLATFORM |
| Status spoofing | Transition matrix + trigger + no USER→PUBLISHED |
| Signed upload abuse | Short TTL; AuthZ before issue; server path |
| Analyze/finalize cross-beat | Ownership + beat/asset bind |
| Moderation bypass | No USER publish; no auto-publish |
| USER publish | DENY in AuthZ + RLS + trigger |
| MOD publish without READY | Hard gate |
| MIME/size spoof | Server validation REUSE |
| Stale signed URL | TTL; fail closed |
| Duplicate / resubmit abuse | Status machine; rate-limit CANDIDATE |

---

## 15. DB changes

**FROZEN planned (not applied in this freeze)**

| Change | Required |
|--------|----------|
| `beats.rejection_reason text` | YES |
| `beats.submitted_at timestamptz` | CANDIDATE |
| New tables | **NO** |
| New bucket | **NO** |
| `role_permissions`: USER ← `beats.create` | YES |
| RLS USER insert/update | YES |
| Trigger privilege escalation rewrite | YES |
| Object key validator `user/` prefix | YES |

No migration in Design Freeze session.

---

## 16. Tests

Required before production GO:

- Unit: USER/MOD/ADMIN transitions; publish gate PLATFORM vs USER; object keys  
- AuthZ: USER cannot publish/approve; cannot touch foreign beats/assets  
- RLS (or policy contract): insert own; deny foreign; deny PUBLISHED insert  
- Transport: signed upload/analyze/finalize IDOR  
- Reject reason required; visible to owner  
- Archive own PUBLISHED; cannot re-publish via archive path  
- PLATFORM regression: admin create/transport/publish/Access Gate  

---

## 17. Production verification

1. USER uploads → READY → PENDING_REVIEW  
2. Foreign USER denied on first user’s APIs  
3. MODERATOR reject + reason → USER sees reason → DRAFT → resubmit  
4. APPROVE → not public yet  
5. MODERATOR or ADMIN publish → catalog + playback + download  
6. PLATFORM admin path unchanged  
7. Anon blocked from `/admin`  

---

## 18. Rollback

- Revoke USER `beats.create` grant  
- Disable community routes / feature flag if introduced  
- PLATFORM path remains independent  

---

## 19. Open decisions

Related product ODs (unchanged): OD-09, OD-10, OD-11, OD-12, OD-13, OD-14, OD-18 — **NON-BLOCKER / FUTURE** for this epic.

### OWNER DECISIONS — CLOSED

| ID | Status | Decision |
|----|--------|----------|
| OD-COMMUNITY-01 | **CLOSED** | APPROVED→PUBLISHED: ADMIN + MODERATOR; USER never; READY required |
| OD-COMMUNITY-02 | **CLOSED** | `rejection_reason text` nullable; required on reject; USER can read; no comment threads |
| OD-COMMUNITY-03 | **CLOSED** | USER gets `beats.create`; no `beats.create_own` unless proven necessary; ownership via service+RLS+trigger; submit = DRAFT→PENDING_REVIEW own+READY |
| OD-COMMUNITY-04 | **CLOSED** | All account levels may upload in V1; no Premium bypass; Role ≠ Account Level |
| OD-COMMUNITY-05 | **CLOSED** | USER may archive own PUBLISHED (and DRAFT/REJECTED); no ownership/APPROVED/re-publish via that path |

---

## 20. Exit criteria

- Design Freeze **READY / OWNER GO** (this document)  
- Implementation waves complete with tests GREEN  
- USER cannot publish  
- No review without active MASTER READY  
- No public playback/download before PUBLISHED  
- PLATFORM path production GREEN after deploy  
- Production community E2E PASS  

```text
COMMUNITY UPLOAD DESIGN FREEZE = READY / OWNER GO
WAVE 1 = COMPLETE (DB / RLS / Trigger / AuthZ) @ 609a05e
WAVE 2 = COMPLETE (USER signed upload → MASTER READY) @ 9cfb3cf
WAVE 3 = IMPLEMENTED (submit + moderation; APPROVED not public)
WAVE 4 = PENDING (APPROVED → PUBLISHED)
Migrations = community_wave1_ownership · community_wave2_user_audio · community_wave3_user_edit_freeze
Routes = /beats/upload · /account/beats · /admin/moderation
```

---

## Wave 2 implementation note (2026-09-27)

```text
createUserBeat / existing USER DRAFT
  → POST /api/beats/audio/session
  → signed PUT private beat-audio (user/{ownerId}/{beatId}/{assetId}/master.bin)
  → POST /api/beats/audio/analyze (duration + BPM V1)
  → finalizeUserBeatWithMasterAction → MASTER READY
  → status remains DRAFT (no auto-submit)
```

Replacement reuses `activateAssetReady` (previous MASTER → REPLACED). Storage INSERT remains DENY.

---

## Wave 3 implementation note (2026-09-27)

```text
USER: DRAFT + MASTER READY → submitUserBeat → PENDING_REVIEW
MOD:  PENDING_REVIEW → approveUserBeat → APPROVED (not public)
MOD:  PENDING_REVIEW → rejectUserBeat(+reason) → REJECTED
USER: REJECTED → DRAFT (clears rejection_reason) → rework → resubmit
```

- Routes: `/beats/upload` · `/account/beats` · `/admin/moderation` · `/admin/moderation/[id]`
- READY revalidated on submit and approve
- USER metadata freeze except DRAFT/REJECTED (`community_wave3_user_edit_freeze`)
- Moderator playback via PlaybackShell + staff Access Gate
- APPROVED ≠ PUBLISHED (Wave 4)

---

## Wave 1 implementation note (2026-09-27)

Delivered without UI:

- `rejection_reason` · `beats.publish` · USER `beats.create`
- RLS USER insert/update · MOD review + USER publish policies
- Trigger ownership/status invariants · rejection_reason required on reject
- `assertPublishHardGate` ownership-aware · community service contracts
- `user/` object key validator (Storage INSERT still denied)

---

## Implementation waves (planning only)

| Wave | Content |
|------|---------|
| 1 | DB column(s) · RLS · trigger · USER `beats.create` · transition matrix |
| 2 | User signed upload / analyze / finalize (`user/` keys) |
| 3 | Submit + moderation service + `/admin/moderation` |
| 4 | Staff publish USER APPROVED→PUBLISHED + gate generalization + catalog |
| 5 | Security tests · PLATFORM regression · production E2E |

---

## Architecture review (READ-ONLY) — 2026-09-27

| Check | Result |
|-------|--------|
| MASTER SSOT §8 (acceptance; no auto-public) | **PASS** — aligns |
| Phase 1.3–1.9 locks | **PASS** — community was OUT; freeze extends without rewriting closed phases |
| Permissions model | **PASS** — reuse `beats.create` / approve / reject; MOD publish without granting `beats.edit` |
| RLS / trigger today | **EXPECTED GAP** — ADMIN-only insert/status; must change in Wave 1 (not a freeze blocker) |
| Audio Transport V1 | **PASS** — reuse pattern; PLATFORM ADMIN role gate retained |
| Publish hard gate | **EXPECTED EXTENSION** — today PLATFORM+DRAFT only; freeze requires ownership-aware gate |
| PLATFORM regression risk | **WARN** — mitigated by keeping ADMIN role checks on PLATFORM transport/create |

**Blockers:** none.

**Remaining risks (Wave 4):** APPROVED→PUBLISHED surface + public catalog; MOD publish UI without metadata edit; resubmit rate-limit deferred.
