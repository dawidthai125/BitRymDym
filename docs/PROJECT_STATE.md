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
| Community Wave 3 | **IMPLEMENTED** (submit + moderation; deploy pending this session) |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Production | GREEN (Wave 2); Wave 3 pending deploy verify |

Design Freeze: [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)

---

## 3. Current Phase

```text
COMMUNITY WAVE 1 = COMPLETE (DB/RLS/AuthZ) @ 609a05e
COMMUNITY WAVE 2 = COMPLETE (USER signed upload → READY) @ 9cfb3cf
COMMUNITY WAVE 3 = IMPLEMENTED (submit + moderation; APPROVED ≠ PUBLISHED)
COMMUNITY WAVE 4 = NOT STARTED (APPROVED → PUBLISHED)
```

### Wave 3 flow (frozen)

```text
USER DRAFT + MASTER READY → submit → PENDING_REVIEW
MODERATOR → APPROVE → APPROVED (not public)
         → REJECT + reason → REJECTED → USER → DRAFT → rework → resubmit
```

Routes: `/beats/upload` · `/account/beats` · `/admin/moderation`

---

## 4. Next Session Entry

```text
NEXT: COMMUNITY WAVE 4 — APPROVED → PUBLISHED
Do NOT let USER publish
Reuse publishApprovedUserBeat + READY gate
Public catalog + playback only after PUBLISHED
```

---

## 5. Last Session Closeout

**Sesja:** Community Wave 3 — submit + moderation (2026-09-27)

**Done:** submit/approve/reject READY revalidation; USER edit freeze; upload + my-beats UI; moderation queue + PlaybackShell; live RLS/E2E; docs.
**Out:** publish USER beat (Wave 4); public catalog for APPROVED.
