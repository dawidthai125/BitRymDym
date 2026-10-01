# STORAGE-ARCH-01 — DESIGN FREEZE

**Type:** Design Freeze (canonical)  
**Date:** 2026-10-01  
**Epic:** `STORAGE-ARCH-01`  
**Prior audit:** [STORAGE_ARCH_01_AUDIT.md](./STORAGE_ARCH_01_AUDIT.md) · **PASS WITH FINDINGS** · **OWNER REVIEW = PASS**  
**Architecture Review (pre-freeze):** PASS WITH FINDINGS  

```text
DESIGN FREEZE                    = COMPLETE (this document)
FINAL ARCHITECTURE REVIEW        = PASS WITH FINDINGS (Owner-accepted)
OWNER REVIEW                     = PASS
OWNER DECISIONS OD-SA-01…10      = LOCKED (below)
ARCHITECTURE                     = C — HYBRID (Storage layer)
IMPLEMENTATION                   = NONE / NOT AUTHORIZED
STORAGE-ARCH-02                  = NOT STARTED
COMMIT / PUSH / DEPLOY           = NONE (under freeze gate; living SSOT may reconcile separately)
CODE / DB / STORAGE / RLS / ENV  = UNCHANGED
WORKER                           = UNCHANGED (STOPPED)
```

**Baseline (frozen reference — do not mutate Production under this gate):**

| Pole | Wartość |
|------|---------|
| Production application | `6dfd201` |
| Repository HEAD / origin/main (docs tip) | `a8e9356` |
| Worker bootstrap | `92496d4` |
| Production deployment | `dpl_3H57UgU2TfqkYawzamsVJ13qnMsG` |
| Production URL | https://www.bitrymdym.pl |
| E3_MIX_ENABLED | ON |
| E3_RENDER_JOBS_ENABLED | ON |
| E3_PUBLIC_AUDIO | ON |
| Worker | STOPPED |
| W6 | CLOSED / PASS |
| E3 | GREEN |
| AC-PE-12 | PASS |
| GO #5 | PASS |

**This document does not:** implement code · change Supabase/Storage/RLS · create buckets · migrate keys · run janitor · mutate worker/env · deploy · rewrite historical E3 OD locks / PE / W6 records.

**SSOT precedents (read-only):**

| Document | Role |
|----------|------|
| [STORAGE_ARCH_01_AUDIT.md](./STORAGE_ARCH_01_AUDIT.md) | Audit evidence · RCA · findings |
| [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](../architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) | E3 Hybrid C · OAD-07 artifacts |
| [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md) | PE living state · F-PE-04 deferred janitor |
| Phase 1.5 / Recording Wave 1 | `beat-audio` · `take-audio` foundations |

---

## 1. Purpose

Zamrozić **docelową architekturę Storage BitRymDym V1** na podstawie STORAGE-ARCH-01 audit + Owner Decisions OD-SA-01…10.

Freeze odpowiada na pytanie: gdzie i jak BitRymDym przechowuje audio/media, jak płynie Vercel → Supabase → Contabo, oraz jak AuthZ / retention / migracja / backup mają wyglądać **bez** implementacji w tym gate.

---

## 2. Scope

**IN:**

- Durable media architecture V1
- Bucket model (reuse existing three)
- DB metadata model (reuse existing tables)
- Storage key convention + legacy dual-read policy
- AuthZ layering vs `E3_PUBLIC_AUDIO`
- Worker ephemeral policy
- Retention / cleanup principles
- Orphan / migration / backup principles
- Future implementation waves (planning only)

**OUT (this gate):**

- Any code, migration, RLS, bucket, object, env, worker, deploy change
- Artwork bucket implementation
- Physical beat PLAYBACK/BASIC/HQ/WAV derivatives
- Artifacts janitor implementation
- Legacy key migration execution
- Orphan delete execution
- Backup system deployment
- STEMS / payments / Premium catalog expansion

---

## 3. Baseline

See header table. Living Production PE state remains as-is. Storage freeze is an **additive documentation layer** — it does not reopen E3.6/E3.7/W6 closeouts or rewrite OD-E3-PE-*.

---

## 4. Current Architecture (evidence summary)

```text
CLIENT
  → Vercel Next.js (Auth / AuthZ / API / signed URL issuance)
  → Supabase PostgreSQL (metadata SSOT)
  → Supabase Storage (durable private buckets)
  → Contabo EXTERNAL worker (ephemeral compute + FFmpeg)
  → upload audio-artifacts → DB finalize → signed download
```

LIVE (audit-time): three private buckets; zero `storage.objects` policies for anon/auth; Contabo holds no durable library; catalog beats are physical MASTER with Access Gate fallback for PLAYBACK/DOWNLOAD.

---

## 5. Frozen Target Architecture

### ARCHITECTURE C — HYBRID (Storage V1) — LOCKED

| Layer | Frozen role | Durable media? |
|-------|-------------|----------------|
| **Vercel** | Next.js app · Auth · AuthZ · API/orchestration · signed URL issuance | **NO** |
| **Supabase PostgreSQL** | Metadata SSOT · ownership · entitlement · job state · artifact metadata | metadata only |
| **Supabase Storage** | **Jedyny durable media store V1** | **YES** |
| **Contabo** | External worker · FFmpeg · ephemeral compute · temporary files only | **NO** |

**LOCKED negatives:**

- Contabo **NIE** jest biblioteką BitRymDym
- Contabo **NIE** jest SSOT audio
- Contabo tmp **NIGDY** nie jest backupem
- Vercel **NIE** przechowuje trwałych dużych plików audio

```text
USER
 ↓
VERCEL / NEXT.JS (AuthZ)
 ↓
SUPABASE DB + STORAGE
 ↓
CONTABO WORKER
 ↓
os.tmpdir()/e3-mp3-*   (ephemeral — not /tmp/render/{jobId} as product SSOT)
 ↓
FFMPEG
 ↓
SUPABASE STORAGE (audio-artifacts)
 ↓
DB FINALIZE
 ↓
SIGNED DOWNLOAD
```

---

## 6. Bucket Architecture — LOCKED (OD-SA-01)

V1 uses **exactly** the existing three buckets. **No** fourth “mega” bucket without a new Owner Decision.

| # | Bucket | Public | Contents | DB SSOT |
|---|--------|--------|----------|---------|
| 1 | **`beat-audio`** | **PRIVATE** | Beat source / MASTER audio | `beat_audio_assets` |
| 2 | **`take-audio`** | **PRIVATE** | User (and anon) mic recordings | `takes` |
| 3 | **`audio-artifacts`** | **PRIVATE** | E3 Mix/Render export results | `audio_artifacts` |

| Topic | Locked value |
|-------|--------------|
| Artwork bucket | **DEFERRED** (OD-SA-04) — `cover_ref` unchanged |
| Archive/backup bucket | **Future** (OD-SA-06) — not created in V1 freeze |
| New buckets in V1 | **FORBIDDEN** without separate Owner Decision |

---

## 7. Database Architecture — LOCKED

**KEEP (no new duplicate domain table):**

- `beats`
- `beat_audio_assets`
- `takes`
- `mix_sessions`
- `render_jobs`
- `audio_artifacts`
- `premium_entitlements`

**NIE tworzyć:** `audio_assets` — duplikowałoby podział `beat_audio_assets` vs `audio_artifacts`.

**Artwork:** bez nowej tabeli w tym freeze (OD-SA-04).

---

## 8. Storage Key Convention — LOCKED

### Canonical target

**beat-audio:**

```text
platform/{beatId}/{assetId}/{purpose}.bin
user/{ownerId}/{beatId}/{assetId}/{purpose}.bin
```

**take-audio:**

```text
user/{ownerId}/takes/{takeId}/mic.bin
anon/{tokenHashPrefix}/takes/{takeId}/mic.bin
```

**audio-artifacts:**

```text
user/{ownerId}/mix/{mixSessionId}/jobs/{jobId}/{BASIC_MP3|HQ_MP3|WAV}.{mp3|wav}
```

Client never supplies owner / beat / asset / job path segments. Server builders remain SSOT.

### Purpose enum vs physical files (OD-SA-03)

- Logical purposes `MASTER` / `PLAYBACK` / `DOWNLOAD` remain in schema / Access Gate.
- V1 physical catalog file = **MASTER** (+ Access Gate fallback to MASTER when PLAYBACK/DOWNLOAD asset missing).
- **No** physical catalog Basic/HQ/WAV derivatives in V1.

---

## 9. Legacy Key Policy — LOCKED (OD-SA-02)

### Legacy format (LIVE majority USER assets)

```text
user/{ownerId}/{beatId}/master/{assetId}.bin
```

Audit-time count: **51** legacy USER · **2** canonical USER · **3** platform canonical.

### Policy

| Rule | Locked |
|------|--------|
| Dual-read | **REQUIRED** before any migration |
| Staged migration | **REQUIRED** (inventory → validate → migrate → verify → cleanup) |
| Big-bang rename / mass delete / blind rewrite / re-upload all | **FORBIDDEN** |
| Delete legacy keys in this gate | **FORBIDDEN** |
| Leave 51 legacy assets unchanged now | **YES** |

---

## 10. AuthZ — LOCKED

Layered **fail-closed** (order matters):

1. Session / role / ownership  
2. Effective entitlement (`premium_entitlements` overlay; Account Level ≠ Premium)  
3. `E3_PUBLIC_AUDIO` — **only** for the proper Free Mix public path (AC-PE-12 class)  
4. Access Gate for beat catalog PLAYBACK / DOWNLOAD  
5. Capability per export tier (`EXPORT_BASIC_MP3` / `EXPORT_HQ_MP3` / `EXPORT_WAV`)  
6. Signed URL TTL (short-lived; purpose-specific where already defined)  
7. Private Storage (no anon/auth storage policies; service-mediated)

### Critical separations (LOCKED)

| Concept | Meaning |
|---------|---------|
| Public catalog preview | Access Gate PLAYBACK on published beats — **not** `E3_PUBLIC_AUDIO` |
| Authenticated Free Mix Basic | Free capabilities + may require `E3_PUBLIC_AUDIO` for public Free release path |
| Premium audio | Premium overlay capabilities — **does not depend on** `E3_PUBLIC_AUDIO` |
| Private artifacts | Always private `audio-artifacts` + owner/capability checks |

**`E3_PUBLIC_AUDIO` ≠ public bucket. Never.**

---

## 11. Free / Premium — LOCKED

### Catalog beats (Access Gate)

- Physical MASTER (+ fallback)
- PLAYBACK / DOWNLOAD purposes are access intents, not separate V1 files (OD-SA-03)

### E3 Mix / export (`audio_artifacts`)

| Tier | Free | Premium |
|------|------|---------|
| BASIC_MP3 | YES (subject to public gate / caps) | YES |
| HQ_MP3 | NO | YES |
| WAV | NO | YES |

Retention / quota baselines remain E3 OAD-03 STANDARD (see §14). STEMS remain deferred (E3 OAD-04) — out of Storage V1 expansion.

---

## 12. E3 Relationship — LOCKED

E3 **is** the foundation for:

```text
Mix → Master bake → Render job → Export → audio_artifacts → Signed download
```

E3 **does not** replace:

- `beat_audio_assets`
- `beat-audio` catalog library
- Recording `takes` / `take-audio`

E3 quality tiers (`BASIC_MP3` / `HQ_MP3` / `WAV`) remain **only** the domain of `audio_artifacts` unless a future product Owner Decision explicitly adds catalog derivatives.

---

## 13. Worker Architecture — LOCKED

```text
Contabo
  → claim (worker secret)
  → DB-resolved source keys (never client object_key)
  → download take-audio / beat-audio (service)
  → in-memory decode / bake
  → temporary os.tmpdir()/e3-mp3-* (encode/QC)
  → FFmpeg (libmp3lame) / WAV encode path
  → upload audio-artifacts (upsert:false)
  → DB finalize (READY artifact + SUCCEEDED job)
  → cleanup temp (finally); rollback object on fail paths
```

| Rule | Locked |
|------|--------|
| Contabo durable library | **NO** |
| Contabo SSOT audio | **NO** |
| Implementation change in this gate | **NO** |
| Canonical temp path in docs | `os.tmpdir()/e3-mp3-*` (not productizing `/tmp/render/{jobId}`) |

---

## 14. Retention — LOCKED

| Asset class | Retention |
|-------------|-----------|
| Beat MASTER | **Permanent** until replace / archive |
| Takes | Existing Account Level TTL + **existing** takes janitor |
| Artifacts Free | **48 h** |
| Artifacts Premium | **30 d** |
| Worker temp | Job-scoped |

Artifact active quotas (E3 OAD-03 baseline, unchanged by this freeze): Free **250 MiB** · Premium **2 GiB**.

---

## 15. Cleanup — LOCKED (policy only)

| Cleanup | Status under this freeze |
|---------|--------------------------|
| Takes janitor | **KEEP** (already exists) |
| Artifacts janitor | **REQUIRED** as future wave (OD-SA-05) — **NOT implemented now** |
| Worker temp `finally` | KEEP |
| Host temp sweep | Optional future worker-hardening wave |
| Orphan beat-audio GC | Inventory + dry-run first (OD-SA-08) — **no delete now** |

Artifacts janitor must be **idempotent** when implemented (AuthZ already honors `expires_at`).

---

## 16. Orphan Policy — LOCKED (OD-SA-08)

Audit-time evidence:

```text
beat-audio storage objects ≈ 86
beat_audio_assets rows     ≈ 56
potential orphans          ≈ 30
```

**NIE USUWAĆ TERAZ.**

Future wave only:

```text
inventory → classify → dry-run → Owner Review → Owner GO → delete
```

Blind delete / GC without dry-run + Owner GO = **FORBIDDEN**.

---

## 17. Backup — LOCKED (OD-SA-06 / OD-SA-07)

| Class | Policy |
|-------|--------|
| Primary store | Supabase Storage |
| Source / producer MASTER | Future archive/backup layer — **REQUIRED BEFORE SCALE** (concept YES; implement NOT now) |
| Generated Mix artifacts | **Regenerable** — default **no** separate backup (OD-SA-07) |
| Takes | TTL — default **no** backup |
| Contabo tmp | **Never** backup / never primary |
| Exceptions to Mix no-backup | Only by separate Owner Decision |

---

## 18. Migration Strategy — LOCKED (OD-SA-02)

Legacy USER keys remain as-is under this freeze.

Authorized future sequence only:

```text
DUAL-READ
  → inventory
  → validation
  → staged migration
  → verification
  → cleanup (only after verify + Owner GO)
```

**Forbidden:** big-bang rename · mass delete · blind rewrite · re-upload all files as first step.

---

## 19. Security — LOCKED principles

- All V1 media buckets **private**
- No permanent public master object URLs
- Signed URLs only after server AuthZ
- Fail-closed on missing/invalid flags and entitlement
- No client-chosen bucket / object_key / spoof paths
- Worker authenticated by `E3_RENDER_WORKER_SECRET` (server-only)
- Service role for mediated storage ops — never expose to client
- IDOR defenses: ownership binding on takes / mix / jobs / artifacts
- Dual-read must not weaken ownership binding during legacy period

---

## 20. Scaling — LOCKED guidance

V1 architecture (3 private buckets + existing tables) is the scale path. Contabo remains compute-only.

Before large scale:

1. Artifacts janitor (OD-SA-05)  
2. Orphan inventory discipline (OD-SA-08)  
3. Source MASTER backup/archive (OD-SA-06)  
4. Observability for object counts, quotas, signed URL volume, worker RAM  

Pricing forecasts require fresh provider research — not locked as numbers in this freeze.

---

## 21. Owner Decisions — LOCKED

| ID | Decision | Locked value |
|----|----------|--------------|
| **OD-SA-01** | Bucket model V1 | **TAK** — reuse `beat-audio` · `take-audio` · `audio-artifacts` · no mega-bucket |
| **OD-SA-02** | Legacy keys | **Dual-read → staged migration** · no big-bang · no delete in this gate |
| **OD-SA-03** | Beat derivatives | **MASTER + fallback V1** · no physical PLAYBACK/BASIC/HQ/WAV catalog files now |
| **OD-SA-04** | Artwork | **Defer** artwork bucket · `cover_ref` unchanged |
| **OD-SA-05** | Artifact janitor | **TAK** as future implementation wave · **not now** |
| **OD-SA-06** | Backup source MASTER | **TAK** conceptually · **REQUIRED BEFORE SCALE** · not now |
| **OD-SA-07** | Mix artifact backup | **NIE** as default · regenerable · exceptions need separate OD |
| **OD-SA-08** | Orphan beat-audio GC | **TAK** path · inventory + dry-run first · delete only after Owner GO |
| **OD-SA-09** | Audit document | **TAK** — [STORAGE_ARCH_01_AUDIT.md](./STORAGE_ARCH_01_AUDIT.md) |
| **OD-SA-10** | Design Freeze | **TAK** — this document freezes Storage Architecture V1 |

```text
OD-SA-01 = THREE EXISTING BUCKETS
OD-SA-02 = DUAL-READ THEN STAGED MIGRATION
OD-SA-03 = MASTER + FALLBACK (NO CATALOG DERIVATIVES)
OD-SA-04 = ARTWORK DEFERRED
OD-SA-05 = ARTIFACTS JANITOR REQUIRED (LATER)
OD-SA-06 = SOURCE MASTER BACKUP REQUIRED BEFORE SCALE (LATER)
OD-SA-07 = MIX ARTIFACTS NOT BACKED UP BY DEFAULT
OD-SA-08 = ORPHAN GC VIA DRY-RUN + OWNER GO
OD-SA-09 = AUDIT DOC KEPT
OD-SA-10 = DESIGN FREEZE COMPLETE
```

---

## 22. Out of Scope

- Implementation of any STORAGE-ARCH-02+ wave
- Creating/altering buckets, tables, RLS, Storage policies
- Migrating or deleting objects
- Running janitors against Production
- Worker / env / Vercel / Contabo mutations
- Deploy / commit / push under this gate alone (Owner may authorize docs commit separately)
- Rewriting historical E3 / PE / W6 decision records
- STEMS, payments, Premium Production E2E fixture work

---

## 23. Acceptance Criteria

STORAGE-ARCH-01 Design Freeze **COMPLETE** when:

1. OD-SA-01…10 recorded as LOCKED in this document  
2. Architecture C Storage layer frozen (Vercel / Supabase / Contabo roles)  
3. Three-bucket + DB KEEP model frozen  
4. Canonical + legacy key policy frozen  
5. AuthZ / Free-Premium / E3 relationship frozen  
6. Retention / cleanup / orphan / backup / migration policies frozen  
7. Future waves listed without Implementation GO  
8. No code/DB/Storage/env/worker/deploy mutations in this gate  
9. Audit SSOT document present (OD-SA-09)  

---

## 24. Future Waves (planning only — NOT AUTHORIZED)

| Wave | Name | Intent | Depends on |
|------|------|--------|------------|
| STORAGE-ARCH-01 | AUDIT + FREEZE | **DONE** (this pair of docs) | — |
| STORAGE-ARCH-02 | KEY FOUNDATION | Dual-read validators / binding harden | OD-SA-02 |
| STORAGE-ARCH-03 | ARTIFACTS JANITOR | Implement F-PE-04 class GC | OD-SA-05 + Owner GO |
| STORAGE-ARCH-04 | ORPHAN INVENTORY | Classify beat-audio orphans + dry-run | OD-SA-08 |
| STORAGE-ARCH-05 | ORPHAN DELETE | Delete only after dry-run + Owner GO | OD-SA-08 |
| STORAGE-ARCH-06 | STAGED KEY MIGRATION | Legacy → canonical after dual-read | OD-SA-02 |
| STORAGE-ARCH-07 | BACKUP / ARCHIVE DESIGN | Source MASTER backup before scale | OD-SA-06 |
| STORAGE-ARCH-08 | WORKER HARDENING | Retry loop / host tmp sweep (optional) | separate GO |
| STORAGE-ARCH-09 | ARTWORK (optional) | Only if future OD reopens OD-SA-04 | future OD |
| STORAGE-ARCH-10 | BEAT DERIVATIVES (optional) | Only if product OD reopens OD-SA-03 | future OD |
| STORAGE-ARCH-11 | PRODUCTION VERIFY | Post-implementation verification | prior waves |

**No wave above has Implementation GO from this freeze.**

---

## 25. Architecture Review Result

### Pre-freeze review: PASS WITH FINDINGS

Findings mapped to locked Owner Decisions / waves — not left unresolved as silent debt.

| Finding | Disposition under freeze |
|---------|--------------------------|
| AR-01 Legacy keys | OD-SA-02 · Wave 02/06 |
| AR-02 Artifacts janitor | OD-SA-05 · Wave 03 |
| AR-03 Orphan objects | OD-SA-08 · Wave 04/05 |
| AR-04 No catalog derivatives | OD-SA-03 · accepted for V1 |
| AR-05 Artwork | OD-SA-04 · deferred |
| AR-06 Backup | OD-SA-06/07 · Wave 07 |
| AR-07 Retry incomplete | Wave 08 (optional) |
| AR-08 Temp path docs | Aligned in §13 |

### Freeze-time Architecture Review

**Status: PASS** — Storage Architecture V1 is freezable with explicit deferred waves and zero implementation authorized.

```text
DESIGN FREEZE              = COMPLETE
STORAGE ARCHITECTURE V1    = LOCKED
IMPLEMENTATION             = NOT AUTHORIZED
COMMIT                     = NO (this gate)
PUSH                       = NO (this gate)
DEPLOY                     = NO
```

---

## Document control

| Field | Value |
|-------|-------|
| Canonical path | `docs/audits/STORAGE_ARCH_01_DESIGN_FREEZE.md` |
| Companion audit | `docs/audits/STORAGE_ARCH_01_AUDIT.md` |
| Language | Polish (Owner-facing) / technical identifiers English |
| Supersedes | — (new layer; does not supersede E3 architecture lock) |
| Next gate | Living SSOT reconciliation (FAR-02) · optional docs commit GO · STORAGE-ARCH-02 only after Implementation GO |
