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
| Rola ChatGPT | Chief Product Architect, Technical Architect, UX/UI Architect, Reviewer, autor promptów |
| Rola Cursor Agent | Agent implementacyjny |

---

## 2. Current Repository State

| Pole | Wartość |
|------|---------|
| Repo | https://github.com/dawidthai125/BitRymDym |
| Local workspace | `C:\Users\dawid\Desktop\BitRymDym\bitrymdym` |
| Canonical branch | `main` |
| Canonical HEAD (pre-Wave-1 push) | `47643c2` |
| Community Wave 1 | **IMPLEMENTED** (DB/RLS/Trigger/AuthZ) |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Production app | **VERIFIED GREEN** @ `47643c2` (Wave 1 deploy pending this session) |

Community Design Freeze: [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md) — **READY / OWNER GO** · Wave 1 **IMPLEMENTED**.

---

## 3. Current Phase

```text
FOUNDATION LOOP = GREEN
PHASE 1.9 = CLOSED / LOCKED
COMMUNITY DESIGN FREEZE = READY / OWNER GO
COMMUNITY WAVE 1 = IMPLEMENTED (DB / RLS / Trigger / AuthZ)
COMMUNITY WAVE 2+ = NOT STARTED (upload UI / transport / moderation UI)
```

| Etap | Status |
|------|--------|
| Community Design Freeze | **READY / OWNER GO** |
| Wave 1 DB/RLS/Trigger/AuthZ | **IMPLEMENTED** |
| Wave 2 user signed upload | **NOT STARTED** |
| Wave 3 submit/moderation UI | **NOT STARTED** |
| Wave 4 staff publish UI / catalog | **NOT STARTED** |
| Wave 5 E2E/security prod | **NOT STARTED** |

**CLOSED community OD:** OD-COMMUNITY-01 … OD-COMMUNITY-05.

---

## 4. Wave 1 delivered

- Column `beats.rejection_reason`
- Permission `beats.publish` (ADMIN + MODERATOR)
- USER ← `beats.create`
- RLS: USER insert own DRAFT; USER update own; MOD review + publish USER
- Trigger: USER self-insert + own transitions; MOD reject reason; ownership immutability
- Service: `createUserBeat`, `submitUserBeat`, `approveUserBeat`, `rejectUserBeat`, `publishApprovedUserBeat`, `archiveOwnUserBeat`
- Publish hard gate ownership-aware (`assertPublishHardGate`)
- Object key validator accepts `user/{ownerId}/{beatId}/{assetId}/….bin`
- **No** UI routes · **No** Storage INSERT open · **No** community transport yet

---

## 5. Next Session Entry

```text
NEXT: COMMUNITY WAVE 2 — user signed upload / analyze / finalize
Follow Design Freeze + Wave 1 AuthZ contracts
Do NOT open Storage INSERT for authenticated clients
```

---

## 6. Last Session Closeout

**Sesja:** Community Wave 1 — DB/RLS/Trigger/AuthZ (2026-09-27)

**Done:** migration + AuthZ + tests + live RLS + docs.
**Next:** Wave 2 after Owner GO (or continue if already authorized in epic waves).
