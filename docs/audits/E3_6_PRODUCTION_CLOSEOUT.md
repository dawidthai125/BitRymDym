# E3.6 — BASIC MP3 EXPORT — PRODUCTION CLOSEOUT

**Type:** Post-release / documentation closeout (docs only)
**Date:** 2026-09-29
**Application / Production SHA:** `183b2a4a7ea3cc8be7f0ac337e75e915ffdae0b9`
**Production deployment:** `dpl_D5EfHdSSahouFftf5HK35wKSHmts`
**Production URL:** https://www.bitrymdym.pl
**Previous Production:** `fbece37cf9756f35d36bab3561ea27633a8ad41e` (E3.5)
**Commit message:** `feat(audio): implement E3.6 basic mp3 export`

```text
E3.1 → E3.6              = CLOSED / PRODUCTION VERIFIED
E3.6 DELIVERY            = SHIPPED
PRODUCTION VERIFY        = PASS
E3 FLAGS                 = DARK (UNSET)
E3_RENDER_WORKER_SECRET  = UNSET
PRODUCTION RENDER        = NOT ENABLED / NOT EXECUTED
POST-RELEASE / CLOSEOUT  = THIS DOCUMENT (docs-only; await Owner docs-commit GO)
APPLICATION              = 183b2a4
PRODUCTION               = 183b2a4
```

---

## Chronology (preserved)

```text
E3.1 Foundation @ 35e1eaa
→ E3.2 Effective entitlement @ 24e50ac
→ E3.3 Mix Session + Basic client @ 8283bd0
→ E3.4 Master Basic @ 69dc9d1
→ E3.5 Render Jobs + Worker Adapter @ fbece37
→ E3.6 Basic MP3 (source auth · bake · native FFmpeg · signed download · thin Free Export UX) @ 183b2a4
→ PRODUCTION VERIFY PASS → POST-RELEASE DOCUMENTATION CLOSEOUT (this doc)
```

Architecture Hybrid C + OAD-01…07 remain **LOCKED**. Do not rewrite historical “Implementation GO = NOT YET” freeze-era banners as false for that gate.

---

## Scope shipped (E3.6)

**IN:**

| Wave slice | Delivery |
|------------|----------|
| E3.6-A | Source authorization / resolution (`jobId` → DB only) |
| E3.6-B | `server-basic-v1` PCM bake |
| E3.6-C | Native/system FFmpeg + libmp3lame on **EXTERNAL worker** (**OD-E36-04 = OPTION C**) · real Basic MP3 **128 kbps stereo** + QC |
| E3.6-E | Signed artifact download API (private `audio-artifacts`) |
| E3.6-F | Thin Free Export UX |
| Lifecycle | Final Truth READY artifact path · EXTERNAL worker script · Fake-complete remains domain/CI only |

**OUT / NOT claimed:**

- Production enablement of render service
- Setting `E3_RENDER_WORKER_SECRET`
- Public Free Audio (`E3_PUBLIC_AUDIO`)
- STEMS / `artifact_kind`
- Premium Pro path / 320 kbps / WAV (later waves — not scoped here)
- Live Supabase Full E2E with real Production encode

---

## OD-E36-04 (LOCKED)

```text
OD-E36-04 = OPTION C

Native/system FFmpeg + libmp3lame
on the EXTERNAL worker host.

FFmpeg is NOT an npm dependency of the Next.js application.
Encode runs on the EXTERNAL worker — not in a Vercel Route Handler.
```

Do **not** reopen or replace this decision in documentation closeout.

---

## Production Verify results (canonical)

| Area | Result |
|------|--------|
| Deployment identity = `183b2a4` | **PASS** (`dpl_D5EfHdSSahouFftf5HK35wKSHmts` · Ready) |
| Smoke `/` · `/beats` | **PASS** · 200 · 5xx = NONE |
| `E3_*` feature flags Production | **UNSET** (DARK) |
| `E3_RENDER_WORKER_SECRET` | **UNSET** |
| Anonymous job API | **401** |
| Worker claim / fake-complete (no secret) | **403** |
| Production `render_jobs` created by verify | **NO** (count = 0) |
| Production `audio_artifacts` created by verify | **NO** (count = 0) |
| `audio-artifacts` bucket | **private** · empty · no new buckets |
| Production real render / encode | **NOT EXECUTED** |
| D02 / W1–W5 regression (smoke + data intact) | **PASS** |

---

## Production safety state (mandatory)

```text
E3_RENDER_JOBS_ENABLED = UNSET
E3_MIX_ENABLED = UNSET
E3_PUBLIC_AUDIO = UNSET
E3_RENDER_WORKER_SECRET = UNSET
```

E3.6 code is on Production. E3 is **not** an active Production rendering service while DARK.

---

## INFO findings (non-blockers · Owner Verification + Production Verify = PASS)

| ID | Note |
|----|------|
| **INFO-01** | Live Supabase Full E2E **not** executed. Production remained dark. |
| **INFO-02** | Free Export completion requires a running EXTERNAL worker script. |
| **INFO-03** | G5 loudness uses soft RMS makeup — not full ITU-R BS.1770 LUFS. |
| **INFO-04** | Fake-complete remains a domain/CI mechanism — not Final Truth. |
| **INFO-05** | E3.6 uses native/system FFmpeg + libmp3lame on EXTERNAL worker per OD-E36-04 = C. |

Do **not** present INFO-01…05 as blockers for this closeout.

---

## Application vs docs boundary

| Layer | SHA / note |
|-------|------------|
| **APPLICATION / PRODUCTION** | `183b2a4` |
| **Previous Production** | `fbece37` (rollback available via prior Vercel Production deployment) |
| **DOCS CLOSEOUT** | docs-only change set (await Owner docs-commit GO) — **not** an application deployment |

Future docs-only tip commits must **not** be treated as a new application SHA unless Owner Production GO redeploys.

---

## Related documents

| Doc | Role |
|-----|------|
| [PROJECT_STATE.md](../PROJECT_STATE.md) | Living project state |
| [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) | Cold-start continuity |
| [CHANGELOG.md](../CHANGELOG.md) | Change history |
| [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](../architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) | Architecture lock + OAD |
| [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](../architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md) | Wave plan + delivery status |
| [E3_FULL_AUDIO_ARCHITECTURE_ADDENDUM.md](../architecture/E3_FULL_AUDIO_ARCHITECTURE_ADDENDUM.md) | Architecture options evidence |

---

```text
E3.6 POST-RELEASE CLOSEOUT = COMPLETE (docs prepared)
NEXT = DOCUMENTATION OWNER REVIEW → (separate) Owner docs-commit GO
NEXT FEATURE = DO NOT AUTO-SELECT
```
