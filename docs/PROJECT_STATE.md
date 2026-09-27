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
| Community Upload + Moderation EPIC | **COMPLETE / LOCKED** @ `c5e1f17` |
| Recording Design Freeze | **LOCKED** |
| **Recording Wave 1** | **IMPLEMENTED** (await Owner commit/review) |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Production | GREEN (Wave 1 migration applied remote; app deploy pending Owner commit) |

Freeze: [PHASE_RECORDING_DESIGN_FREEZE.md](./phases/PHASE_RECORDING_DESIGN_FREEZE.md)  
Wave 1 audit: [RECORDING_WAVE1_IMPLEMENTATION_AUDIT.md](./audits/RECORDING_WAVE1_IMPLEMENTATION_AUDIT.md)

---

## 3. Current Phase

```text
RECORDING WAVE 1 = TAKE DOMAIN + DB + RLS + take-audio FOUNDATION
MediaRecorder / player Record / upload transport = NOT STARTED (Wave 2+)
```

---

## 4. Next Session Entry

```text
NEXT: OWNER REVIEW of Wave 1 → then Recording Wave 2 (transport / MediaRecorder) only with Owner GO
Do NOT implement MediaRecorder / Record UI without Wave 2 GO
Do NOT reopen Community epic without Owner GO
```

---

## 5. Last Session Closeout

**Sesja:** Recording Wave 1 implementation (2026-09-27)

**Done:** `takes` table + RLS owner SELECT · private `take-audio` bucket · object-key helpers · config constants · unit/live foundation tests · remote migration applied.
**Out of scope (correct):** MediaRecorder, player Record, upload session API, shared grants, janitor cron.
