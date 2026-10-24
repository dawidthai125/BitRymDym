# Evidence — owner DRAFT asset SELECT + publish + mocked REC E2E (2026-10-24)

**Latest GO:** `GO_OWNER_DRAFT_ASSET_SELECT_POLICY`  
**Fixture path:** `Visual Fixture — Published Local Only` (created under `GO_REPLACEMENT_FIXTURE`, published after RLS fix).  
**Blocked original:** `Visual Fixture — Local Only` left APPROVED without attestation (unchanged).  
**OD-15 / OD-16:** remain **OPEN**  
**Sacred WIP** `recording-eligibility-service.ts`: not read.  
**`studio-editor.tsx` / `studio-service.ts` / `config.toml` / CAS / audio logic:** not edited.  
**Production / remote / `supabase start` / `db reset` / commit / push / deploy:** not done.

## Final statuses

| Check | Status |
|------|--------|
| RLS owner DRAFT SELECT | **PASS** |
| isolation second USER | **PASS** |
| isolation anon | **PASS** |
| submit | **PASS** |
| rights | **PASS** |
| moderation | **PASS** |
| publication | **PASS** |
| picker visibility (Moje) | **PASS** |
| recording gate lifted | **PASS** |
| conscious R arm | **PASS** |
| mocked REC start/stop | **PASS** |
| take save | **PASS** |
| archive take visibility | **PASS** |
| Motyw / theme round-trip | **PASS** |
| PNG IHDR | **PASS** |
| Docker | **PASS** |
| loopback Supabase `:54421` | **PASS** |
| production | **NOT RUN** |

Machine summary: `FINAL_STATUSES_2026-10-24.json`.  
GO write-up: `OWNER_DRAFT_ASSET_SELECT_POLICY_GO_RUN_2026-10-24.md`.

## RLS fix (product)

- Migration: `supabase/migrations/20261024201348_beat_audio_assets_owner_select.sql` (`supabase migration new`)
- Policy: `beat_audio_assets_select_own` — SELECT for authenticated beat owner via `beats.owner_id = auth.uid()`
- Harness: `src/lib/beats/beat-audio-assets-owner-select-local.test.ts` — **3/3 PASS** (`owner-select-rls-vitest-summary.json`)

## Product vs mock

**Product (confirmed after fix):**
- Owner can SELECT own beat assets including DRAFT → community submit finds active MASTER READY.
- Rights attestation + review close → staff approve → Opublikuj → **PUBLISHED**.
- Recording gate lifts only for **PUBLISHED**; conscious R → REC unlocks.

**Mock (harness only):**
- Playwright `addInitScript` Fake `MediaRecorder` + silent `getUserMedia`; blob from `src/lib/beats/fixtures/chromium-mediarecorder-opus.webm` (never played).
- Does not bypass rights, publish, or PUBLISHED gate.

## Workflow evidence (no ids / secrets)

| Step | Result |
|------|--------|
| Docker Engine | PASS |
| Supabase API loopback `127.0.0.1:54421` | PASS |
| Next temp `127.0.0.1:3460` + loopback env guard | PASS (stopped after run) |
| Owner SELECT RLS + peer/anon isolation | PASS |
| Rights + Wyślij do moderacji | PASS |
| Staff approve + Opublikuj | PASS |
| Picker Moje + gate lifted | PASS |
| Conscious R → mock REC → take → archive | PASS |
| `.env.local` restore | PASS (SHA-256 match); backup deleted from audit dir |
| Temp creds | wiped |

Primary report: `owner-select-policy-e2e-report.json`.

## Shots

| Pack | Files |
|------|--------|
| PUBLISHED-attached editor | `*-editor-published-attached-{desktop-1280x800,mobile-390x844}.png` |
| Archive-after-take | `*-archive-after-take-{desktop-1280x800,mobile-390x844}.png` |
| Earlier APPROVED-attached (pre-unblock) | `*-editor-approved-attached-*` retained |

IHDR: all published + archive packs 1280×800 / 390×844 — **PASS**.

## RO subagents (this GO)

- [RLS security review](45e718a4-cdc4-4306-b98b-705b320eeea0)
- [Beat→asset ownership map](e4f0d638-5764-4328-b8ca-d0c7022475b7)
- [Submit→REC regression checklist](e46e5ebb-cbfb-43e6-898d-9c17fd96d5b2)

Findings aligned with shipped `beat_audio_assets_select_own` and the PASS E2E path; no extra fix required from their reports.

## History notes

Earlier runs under this folder documented BLOCKED publish on the original APPROVED-without-attestation fixture and BLOCKED submit on the replacement DRAFT before the owner SELECT policy. Those reports remain as trail; statuses above supersede them for the GO path.
