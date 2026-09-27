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
| **Recording Wave 3** | **DEPLOYED / NOT CLOSED** @ `507f78f` — production finalize BLOCKED |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Production | Deployed Wave 3 @ `507f78f`; catalog/auth/playback GREEN; take finalize DURATION_PROBE_FAILED on real MediaRecorder WebM/Opus |

Freeze: [PHASE_RECORDING_DESIGN_FREEZE.md](./phases/PHASE_RECORDING_DESIGN_FREEZE.md)  
Wave 3 readiness: [RECORDING_WAVE3_READINESS_AUDIT.md](./audits/RECORDING_WAVE3_READINESS_AUDIT.md)  
Wave 3 closeout: [RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md](./audits/RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md)

---

## 3. Current Phase

```text
RECORDING WAVE 3 = DEPLOYED @ 507f78f · NOT CLOSED
BLOCKER = MediaRecorder WebM/Opus duration probe fail-closed on finalize
```

---

## 4. Next Session Entry

```text
NEXT: OWNER DECISION on Wave 3 production blocker
BLOCKER: music-metadata cannot read duration from Chromium MediaRecorder WebM/Opus
→ finalize fail-closed (DURATION_PROBE_FAILED); READY_TAKE / take preview not reached on prod
Do NOT hotfix without Owner GO
Do NOT implement Anonymous Quick Take / shared grants without Owner GO
```

---

## 5. Out of scope reminders

**Out of Wave 3 (correct):** anonymous QT · shared grants · Access Gate RECORD productization · entitlement engine · janitor · anti-abuse · own take download · dual-play preview · MIX/EXPORT.
