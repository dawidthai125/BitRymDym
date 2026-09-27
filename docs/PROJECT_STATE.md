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
| **Recording Wave 1** | **CLOSED** @ `dd2ffd7` |
| **Recording Wave 2** | **CLOSED** @ `2ab3e3e` (production GREEN) |
| **Recording Wave 3** | **CLOSED** @ `9f6f006` (production GREEN · real Chromium WebM/Opus E2E PASS) |
| **Recording Wave 4** | **IMPLEMENTED / READY_FOR_OWNER_REVIEW** (not committed · not deployed) |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Production | GREEN @ Wave 3 hotfix `9f6f006` (Wave 4 remote migration applied; app not deployed) |

Freeze: [PHASE_RECORDING_DESIGN_FREEZE.md](./phases/PHASE_RECORDING_DESIGN_FREEZE.md)  
Wave 3 closeout: [RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md](./audits/RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md)  
Wave 4 report: [RECORDING_WAVE4_IMPLEMENTATION_REPORT.md](./audits/RECORDING_WAVE4_IMPLEMENTATION_REPORT.md)

---

## 3. Current Phase

```text
RECORDING WAVE 3 = CLOSED / PRODUCTION VERIFIED @ 9f6f006
RECORDING WAVE 4 = IMPLEMENTED — READY_FOR_OWNER_REVIEW (no commit/push/deploy yet)
Anonymous QT / shared grants = Wave 5+ (OUT of W4)
```

---

## 4. Next Session Entry

```text
NEXT: Owner Review of Wave 4 → explicit GO for COMMIT / PUSH / DEPLOY
Set CRON_SECRET on Vercel before relying on janitor schedule
Do NOT reopen Wave 3 duration probe without evidence of regression
Do NOT implement Anonymous QT / shared grants without Owner GO (W5+)
```

---

## 5. Out of scope reminders

**Out of Wave 4 (correct):** anonymous QT · shared grants · Access Gate RECORD for grants · MIX/EXPORT · Track publish · payments/Premium · dual-play preview.
