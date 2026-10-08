# AUD-01 — IMPLEMENTATION REPORT

**Date:** 2026-10-08  
**Owner GO IMPLEMENT:** confirmed (MVP tabs / output / mic)  
**Commit:** **NOT PERFORMED** (awaiting separate Owner GO)  
**Push / deploy:** **NOT PERFORMED**

---

## Beat Selection

| Item | Result |
|------|--------|
| empty state | CTA **„+ Wybierz bit”** when `no_beat` (replaces dead „Brak bitu…” transport) |
| catalog | **YES** — `listPublishedBeats` via `GET /api/studio/beat-picker?tab=catalog` |
| my beats | **YES** — `listOwnUserBeats` · `tab=mine` |
| downloads | **YES** — `listMyDownloadHistory` · `tab=downloads` |
| favorites | **NO** (MVP) — no tab, no DB |
| saved | **NO** (MVP) — no tab, no DB |
| project binding | **SSOT** `studio_projects.beat_id` updated by `attachBeatToStudioProjectFor` + BEAT_REF clip reseed on BEAT track |

**Flow:** modal `StudioBeatPicker` → `POST /api/studio/projects/:id/beat` `{ beatId }` → document refresh → transport remount key includes `beatId`.

---

## Microphone

| Item | Result |
|------|--------|
| default | **Automatycznie — urządzenie systemowe** (`selectedDeviceId = null` → unconstrained GUM) |
| manual / Advanced | **Zaawansowane ustawienia audio** expands full `audioinput` list |
| tester | **Auto** held stream on IDLE/READY via `acquireMicStream` + existing `useMicAnalyser` + `BrdInputMonitor` |
| signal states | silent / quiet / good / hot / clip (existing analyser) → PL status copy |
| permissions | denied/blocked → user-facing PL; no raw JS exceptions |
| unavailable | `NO_INPUT_DEVICE` / UNAVAILABLE copy preserved |

Prepare/record contract unchanged: eligibility → probe → READY → `TakeMediaRecorder`.

---

## Output

| Item | Result |
|------|--------|
| desktop | Picker **only if** `AudioContext.setSinkId` feature-detected **and** not mobile-like |
| mobile | **Automatic only** — system/browser routing copy |
| automatic fallback | Unsupported / mobile → no fake device list |
| setSinkId | `StudioAudioEngine.setOutputSinkId` → existing Studio `AudioContext` (no second engine) |
| unsupported | UI: „Automatyczny — urządzenie systemowe…” |

---

## Architecture

| Invariant | Status |
|-----------|--------|
| StudioAudioEngine | **ONE** per editor (unchanged class; sink method added) |
| AudioContext (Studio) | **ONE** product context; mic tester still uses existing short-lived analyser context (no destination) |
| StudioTransportProvider | **ONE**; exposes `setOutputSinkId` |
| duplicate engines created | **NO** |
| E3 / Render / Storage / Auth / RLS | **UNTOUCHED** |
| favorites/saved DB | **NONE** |

---

## Tests

| Suite | Result |
|-------|--------|
| `aud-01-studio-audio-beat.test.ts` | **11 PASS** |
| `p5-8-devices.test.ts` (Automatic selection) | **14 PASS** |
| `pr-v1-architecture-guards.test.ts` | **PASS** |
| `p6-6-1-track-meter.test.ts` | **PASS** |
| `tsc --noEmit` | **PASS** |
| eslint (AUD-01 touchpaths) | **PASS** |

---

## Scope — files changed

**New**
- `src/app/api/studio/projects/[projectId]/beat/route.ts`
- `src/app/api/studio/beat-picker/route.ts`
- `src/components/studio/studio-beat-picker.tsx`
- `src/lib/studio/studio-output-devices.ts`
- `src/hooks/use-studio-output-devices.ts`
- `src/lib/studio/aud-01-studio-audio-beat.test.ts`
- `docs/audits/AUD_01_IMPLEMENTATION_REPORT.md`

**Modified**
- `src/lib/studio/studio-service.ts` — `attachBeatToStudioProject(For)`
- `src/components/studio/studio-editor.tsx` — CTA + picker + remount key
- `src/components/studio/studio-recording-panel.tsx` — Automatic / Advanced / live tester / output
- `src/components/studio/studio-transport-provider.tsx` — `setOutputSinkId`
- `src/lib/studio/studio-audio-engine.ts` — `setOutputSinkId` / sink apply
- `src/lib/studio/studio-input-devices.ts` — Automatic = null selection
- `src/hooks/use-studio-input-devices.ts` — null selection API
- `src/lib/studio/p5-8-devices.test.ts` — Automatic expectations

**DB / Storage / Auth / RLS / migrations:** none  
**WIP:** preserved (no commit / no push)

---

## FINAL STATUS

```text
AUD-01 IMPLEMENTATION COMPLETE (local)
Commit: WAITING FOR OWNER GO
Push / deploy: NOT PERFORMED
GREEN for local tests + typecheck + lint on allowlist
```

**NEXT:** Owner GO before commit.
