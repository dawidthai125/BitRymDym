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
| Community Wave 4 | **IMPLEMENTED** (staff publish APPROVED→PUBLISHED; deploy this session) |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Production | GREEN (Wave 3); Wave 4 pending deploy verify |

Design Freeze: [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)

---

## 3. Current Phase

```text
COMMUNITY WAVE 1 = COMPLETE @ 609a05e
COMMUNITY WAVE 2 = COMPLETE @ 9cfb3cf
COMMUNITY WAVE 3 = COMPLETE @ f5f6b4f
COMMUNITY WAVE 4 = IMPLEMENTED (ADMIN|MOD publish APPROVED USER → PUBLISHED)
COMMUNITY WAVE 5 = NOT STARTED (hardening / polish / rate-limit if any)
```

### Wave 4 flow

```text
USER APPROVED beat
  → staff (ADMIN|MODERATOR) + beats.publish
  → READY hard gate (active MASTER + user/ object key)
  → PUBLISHED
  → /beats · /beat/[id] · PlaybackShell · download (existing)
```

USER publish = DENY · MOD metadata edit = DENY

---

## 4. Next Session Entry

```text
NEXT: COMMUNITY WAVE 5 (if planned) — security polish / rate-limit / ops
Community loop end-to-end is LIVE after Wave 4 deploy verify
```

---

## 5. Last Session Closeout

**Sesja:** Community Wave 4 — staff publish APPROVED USER beats (2026-09-27)

**Done:** publishApprovedUserBeat gate-first; moderation APPROVED queue + Opublikuj; public catalog reuse; live E2E; docs.
**Out:** new lifecycle features; Premium/account-level publish bypass.
