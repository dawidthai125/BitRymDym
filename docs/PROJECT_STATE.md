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
| Community Wave 2 | **IMPLEMENTED** (USER signed audio transport) |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Production | GREEN (Wave 2 deploy this session) |

Design Freeze: [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)

---

## 3. Current Phase

```text
COMMUNITY WAVE 1 = COMPLETE (DB/RLS/AuthZ)
COMMUNITY WAVE 2 = IMPLEMENTED (USER signed upload → READY)
COMMUNITY WAVE 3+ = NOT STARTED (submit / moderation UI / publish UI)
```

### Wave 2 flow (frozen)

```text
USER → createUserBeat (DRAFT)
  → POST /api/beats/audio/session
  → signed PUT → private beat-audio
  → object key user/{ownerId}/{beatId}/{assetId}/master.bin
  → POST /api/beats/audio/analyze
  → finalizeUserBeatWithMasterAction
  → MASTER READY · beat remains DRAFT
```

---

## 4. Next Session Entry

```text
NEXT: COMMUNITY WAVE 3 — submit + moderation queue
Do NOT open Storage INSERT for authenticated clients
Reuse READY gate + Wave 1 transitions
```

---

## 5. Last Session Closeout

**Sesja:** Community Wave 2 — USER signed audio transport (2026-09-27)

**Done:** user session/analyze/finalize; object key user/; asset trigger USER support; live E2E bpm-120-steady; docs.
**Out:** submit UI, moderation UI, publish UI.
