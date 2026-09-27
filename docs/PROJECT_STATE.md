# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point dla nowego agenta.**

---

## 1. Project Identity

| Pole | Wartość |
|------|---------|
| Nazwa | BitRymDym |
| Cel | Platforma muzyczna (rap / hip-hop / bity): odsłuch, pobieranie, test flow (Quick Take) → społeczność i współpraca |
| Owner / Product Owner | Prezes Dawid |

---

## 2. Current Repository State

| Pole | Wartość |
|------|---------|
| Canonical branch | `main` |
| Community Wave 1 | **COMPLETE** @ `609a05e` |
| Community Wave 2 | **COMPLETE** @ `9cfb3cf` |
| Community Wave 3 | **COMPLETE** @ `f5f6b4f` |
| Community Wave 4 | **COMPLETE** @ `b47767b` |
| Community Wave 5 | **IMPLEMENTED** (hardening + closeout; deploy this session) |
| **Community Upload + Moderation EPIC** | **COMPLETE / LOCKED** (pending final SHA after deploy) |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Production | GREEN |

Design Freeze: [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)

---

## 3. Current Phase

```text
COMMUNITY UPLOAD + MODERATION EPIC = COMPLETE / LOCKED
WAVE 1 = ownership / RLS / AuthZ @ 609a05e
WAVE 2 = USER signed audio transport @ 9cfb3cf
WAVE 3 = submit + moderation @ f5f6b4f
WAVE 4 = staff publish APPROVED→PUBLISHED @ b47767b
WAVE 5 = hardening (submit cooldown) + security closeout
```

### Final lifecycle

```text
USER: DRAFT → (READY) → PENDING_REVIEW → [REJECTED → DRAFT]* → APPROVED
STAFF: APPROVED → PUBLISHED
Public: only PUBLISHED · Access Gate · download limits unchanged
```

---

## 4. Next Session Entry

```text
NEXT: outside Community epic (QT / Tracks / etc. only with new Owner GO)
Do NOT reopen community publish/moderation without Owner GO
```

---

## 5. Last Session Closeout

**Sesja:** Community Wave 5 — hardening + epic closeout (2026-09-27)

**Done:** 60s per-beat submit cooldown (column + trigger + service); security regression suite; full live loop E2E; docs LOCKED.
**Deferred:** full lifecycle audit telemetry framework; global per-user submit flood across many beats; resubmit rate beyond 60s per beat.
