# GO_REPLACEMENT_FIXTURE run — 2026-10-24

**GO:** `GO_REPLACEMENT_FIXTURE` (executed).  
**Skills:** research-and-planning, testing-and-verification.  
**RO:** [publish workflow](b6e5a1ab-53d1-4a8e-9db8-2a686f172814) (title/`audio`/rights checkbox → **Wyślij do moderacji**; after submit close **Zamknij sprawę not_run** before **Zatwierdź** → **Opublikuj**), [mock REC map](233cd533-7c1d-46d9-9008-f2ba98359144) (harness FakeMediaRecorder + `chromium-mediarecorder-opus.webm`; PASS = R armed → ● Nagraj → stop → Nagranie gotowe → ✓ Zachowaj → `/account/takes` non-empty).  
**Note:** RO sequence was not reached — run stopped at owner submit (RLS / MASTER READY assert).  
**No** Sacred WIP / `studio-editor.tsx` / `studio-service.ts` / migrations / config edits / commit / push / deploy.  
**No** SQL status/rights patches; no new users; blocked original fixture not mutated.

## What was done (UI only)

| Step | Result |
|------|--------|
| Docker + loopback Supabase `:54421` | PASS |
| Next `127.0.0.1:3460` + loopback env guard | PASS (stopped after) |
| Real form login existing USER + MODERATOR | PASS |
| Create `Visual Fixture — Published Local Only` via `/beats/upload` | PASS (DRAFT) |
| Local soft-click WAV (`audio/wav`, 4 s, ≤50 MiB) for BPM allowlist | PASS (analyze radios present) |
| Finalize UI banner „Wersja robocza zapisana · audio gotowe” | Observed |
| Active READY MASTER (service-role read-only probe) | Present |
| Rights checkbox + **Wyślij do moderacji** | **BLOCKED** — server: `Submit requires an active MASTER READY audio asset.` |
| Moderacja / Opublikuj | **NOT RUN** |
| Studio picker / mock REC / take / archive | **NOT RUN** |
| Original `Visual Fixture — Local Only` | Left **APPROVED**, attestation still absent |

## Root cause (product/schema, not mock)

`beat_audio_assets` RLS (migration `20260925220000_phase_1_5_audio_storage.sql`) allows SELECT for:

- rows whose beat is **PUBLISHED**, or  
- **staff** (`is_staff()`),

and **does not** grant USER owners SELECT on their own DRAFT/PENDING assets.

`submitUserBeat` → `assertActiveMasterReadyForCommunityTransition` queries assets with the **user** session client → empty rows for DRAFT owner → false “no READY master” even when a READY active MASTER exists (confirmed via read-only service probe).

List UI therefore omits **Oświadczenie i wysyłka** (`activeMasterReady: false`).

Fix requires Owner-gated **migration/policy** (or code change to assert via admin client) — **out of scope** for this GO (no SQL / no app code).

## Evidence artifacts

- `replacement-*.json` reports in this folder  
- `_local-soft-click-4s.wav` (local generated; near-silent clicks for BPM)  
- `_silent-3s-local.wav` (pure silence; unused after BPM risk)  
- Draft beat remains in local DB as DRAFT (not published; not deleted)

## Status table

| Check | Status |
|------|--------|
| rights (attestation submit) | **BLOCKED** |
| moderation | **NOT RUN** |
| publication | **BLOCKED** |
| picker visibility | **NOT RUN** |
| recording gate lifted | **NOT RUN** |
| conscious R | **NOT RUN** |
| mock REC start/stop | **NOT RUN** |
| take save | **NOT RUN** |
| archive take | **NOT RUN** |
| Motyw / theme round-trip | **NOT VERIFIED** (not reached) |
| IHDR shots | **NOT RUN** |
| Docker | **PASS** |
| loopback Supabase | **PASS** |
| production | **NOT RUN** |

## Minimal Owner next GO

One of:

1. **GO** for additive local/prod migration: owner SELECT on `beat_audio_assets` for own USER beats (non-published included), then re-run submit→mod→publish→REC; or  
2. **GO** for narrow code fix: community MASTER assert via service-role/admin after AuthZ (still no SQL status patch); or  
3. Accept BLOCKED until schema matches intended community Wave 2 owner visibility.

`.env.local` restored (hash match); temp creds wiped; Next `:3460` stopped.
