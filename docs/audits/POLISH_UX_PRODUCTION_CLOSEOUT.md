# POLISH UX — MIX / MASTER / RECORDING / PLAYBACK — PRODUCTION CLOSEOUT

**Type:** Production closeout
**Date:** 2026-10-02
**Surface:** User-facing Polish UX + terminology · Mix / Master / Recording / Playback
**Status:** **CLOSED** · **PRODUCTION VERIFIED — PASS WITH EVIDENCE LIMITATIONS**

```text
POLISH UX                  = CLOSED / PRODUCTION VERIFIED — PASS WITH EVIDENCE LIMITATIONS @ 0afa29b
IMPLEMENTED                = YES
COMMITTED                  = YES
PUSHED                     = YES
DEPLOYED                   = YES
PRODUCTION VERIFIED        = PASS WITH EVIDENCE LIMITATIONS
NEXT WAVE                  = EXISTING BACKLOG / OWNER DECISION
```

**Decision CLOSED ≠ residual terminology SOFT-CLOSED.** This closeout records shipment + production verification evidence for commit `0afa29b` only.

Parent production application tip before this release: `2c4200b` (Wave A Account / Beats).

---

## 1. Production Evidence

| Field | Value |
|-------|--------|
| Production URL | https://www.bitrymdym.pl |
| **Application / Feature SHA** | `0afa29bff9c492fa36fc5b9dd416a09fe1c5d093` (`0afa29b`) |
| Commit message | `feat(ux): localize mix master recording ui` |
| GitHub Production deployment | `6815846706` |
| Vercel deployment | `dpl_9EDrc78ompk8B2QZk6tDwQurntus` |
| Deployment state | Ready / success |
| Alias | `www.bitrymdym.pl` → this deployment |
| Final verification | **PRODUCTION VERIFIED — PASS WITH EVIDENCE LIMITATIONS** |

### Exact product files in release `0afa29b` (9)

1. `src/components/mix/mix-panel.tsx`
2. `src/components/takes/recording-panel.tsx`
3. `src/components/takes/own-takes-list.tsx`
4. `src/components/player/playback-shell.tsx`
5. `src/lib/takes/client-upload.ts`
6. `src/lib/ui/labels.ts`
7. `src/app/beat/[id]/beat-detail-client.tsx`
8. `src/app/account/shared/page.tsx`
9. `src/lib/takes/d02-unit.test.ts`

---

## 2. Scope closed

| Item | Status |
|------|--------|
| Mix panel PL labels (EQ / dynamika / Master / Pro gates / export / Pobierz) | DONE / VERIFIED |
| Master panel PL labels (gain → głośność · clip protect · limiter · LUFS) | DONE / VERIFIED |
| Recording PL (`Nagraj nagranie` · `Rozpocznij` · `Zatrzymaj` · `Nagrywanie`) | DONE / VERIFIED |
| Playback PL (`Nagrywanie` · aria `Przebieg — przewiń utwór`) | DONE / VERIFIED |
| TAKE user-facing → `nagranie` (in-scope surfaces) | DONE / VERIFIED |
| Export status unknown fallback PL (`nieznany status eksportu`) | DONE / CODE |
| `formatExportError` always PL | DONE / CODE |
| `toUserFacingTakeUploadError` mapping before UI | DONE / CODE |
| Accessibility strings in scope | DONE / VERIFIED |
| KEEP industry terms (MIX · MASTER · Premium · Pro · EQ · LUFS · dB · dBFS · MP3 · WAV · REC) | DONE / VERIFIED |
| Remove user-facing `server-pro-v1` | DONE / VERIFIED |
| Audio engine / MediaRecorder / API contract / AuthZ / DB | UNCHANGED |

**MODERATOR note:** D02 unit Gate M UI contract expectation updated only for guest copy (`Gościnne nagranie`) — no AuthZ/TTL/caps assertions weakened.

---

## 3. Production verification matrix

| Test | Result |
|------|--------|
| Production SHA `0afa29b` | **PASS** |
| Vercel Ready / success · alias www | **PASS** |
| Anon public `/` · `/beats` · routing | **PASS** |
| Mix labels (authenticated Beat Detail with takes) | **PASS** |
| Master labels | **PASS** |
| Recording UI (`Nagraj nagranie` · `Rozpocznij` · mic-ready PL) | **PASS** |
| Playback (Play → Pauza · audio advancing) | **PASS** |
| Mobile 390px | **PASS** |
| Desktop 1440px | **PASS** |
| Runtime / critical requests smoke | **PASS** |
| Observed functional regression from `0afa29b` | **NONE** |
| Auth / RLS / Storage / API / DB / ENV / Infrastructure | **UNCHANGED** |
| Recording Stop during active REC | **NOT VERIFIED** — no new durable take |
| Export/API EN `json.error` passthrough | **NOT VERIFIED** — not observed live |
| Pro Master metering / Premium export UI | **NOT VERIFIED** — no Premium on smoke account |

Do **not** treat NOT VERIFIED rows as FAIL or as observed regression.

---

## 4. Evidence limitations (exact)

### A. Recording Stop during REC

**NOT VERIFIED**
Powód: uniknięto tworzenia nowego trwałego take.

### B. Export / API error passthrough

**NOT VERIFIED**
Potencjalny angielski `json.error` może nadal przejść do Mix poza `formatExportError` (pre-commit FINDING).
**Nie** przedstawiać jako zaobserwowaną regresję `0afa29b`.

### C. Premium metering

**NOT VERIFIED**
Konto użyte do smoke nie posiadało Premium.

---

## 5. Residual findings (OUT OF SCOPE of `0afa29b`)

Nie są regresją release’u. Nie implementowano w tym closeoucie.

| ID | Surface | Objaw | Status |
|----|---------|--------|--------|
| **F-UX-01** | Mix select options | `Próba · 7s` / `Próba · 10s` · źródło `src/app/beat/[id]/page.tsx` | OUT OF SCOPE / RESIDUAL TERMINOLOGY |
| **F-UX-02** | Beat Detail „O bicie” / „Licencja” | „nagrania próby” / „nagraj próbę” | OUT OF SCOPE / RESIDUAL TERMINOLOGY |
| **F-UX-03** | `/account/takes` header | „Twoje próby…” | OUT OF SCOPE / RESIDUAL TERMINOLOGY |
| **F-UX-04** | Mix / takes error UI | Potential EN API `json.error` passthrough | NOT OBSERVED LIVE / HARDENING CANDIDATE |

---

## 6. Security / architecture boundary

Release `0afa29b` **did not change**:

- DB / migrations
- RLS
- Storage
- Auth architecture / providers
- API contracts
- Audio engine / DSP / MediaRecorder / PlayerProvider core behavior
- Export pipeline / worker / ENV / DNS / infrastructure

Presentation-only UX language + client-side error string mapping before UI.

---

## 7. Release boundary

```text
IMPLEMENTED                = Polish UX release 0afa29b
PRODUCTION VERIFIED        = 0afa29b
RESIDUAL                   = F-UX-01…04 (terminology outside scope + error hardening candidate)
EVIDENCE LIMITATIONS       = REC stop / EN json.error / Premium metering
COMMIT 0afa29b             = CLOSED RELEASE (do not reopen for residual copy)
```

---

## 8. Continuity pointers

Living SSOT updated in the same docs closeout commit (after Owner docs GO):

- [PROJECT_STATE.md](../PROJECT_STATE.md)
- [MASTER_HANDOFF.md](../MASTER_HANDOFF.md)
- [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md)
- [CHANGELOG.md](../CHANGELOG.md)
- [README.md](../README.md)

```text
POLISH UX = CLOSED
NEXT WAVE = EXISTING BACKLOG / OWNER DECISION
```
