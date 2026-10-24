# GO_OWNER_DRAFT_ASSET_SELECT_POLICY — 2026-10-24

**GO:** `GO_OWNER_DRAFT_ASSET_SELECT_POLICY` (executed).  
**Scope:** Additive local RLS owner SELECT on `beat_audio_assets`; re-run replacement fixture submit→mod→publish→mock REC.  
**Constraints honored:** loopback Supabase only; no `db reset` / `supabase start` / seeds / SQL status patches; no Sacred WIP; no `studio-editor.tsx` / `studio-service.ts` / `config.toml` / audio-CAS; dirty WIP preserved; no commit / push / deploy.

## RO subagents (read-only; no edits / no Sacred WIP / no secrets)

- [RLS security review](45e718a4-cdc4-4306-b98b-705b320eeea0) — gap confirmed (published + staff only); minimal additive owner SELECT via `beats.owner_id = auth.uid()`; acceptance: owner DRAFT, peer=0, anon=0, staff/PUBLISHED intact, SELECT-only.
- [Beat→asset ownership map](e4f0d638-5764-4328-b8ca-d0c7022475b7) — ownership on `beats.owner_id` only; join `a.beat_id = b.id`; do not use `created_by`.
- [Submit→REC regression checklist](e46e5ebb-cbfb-43e6-898d-9c17fd96d5b2) — steps 0–8 (MASTER assert → rights → not_run close → approve → publish → Moje → gate → mock REC → archive).

Implemented policy and E2E match all three; no further code change from these reports.

## Root cause (confirmed)

Existing SELECT policies were `beat_audio_assets_select_published` + `beat_audio_assets_select_staff` only. USER owner session could not see DRAFT MASTER READY → `assertActiveMasterReadyForCommunityTransition` failed with “Submit requires an active MASTER READY…”.

## Fix

- Migration via `supabase migration new`: `supabase/migrations/20261024201348_beat_audio_assets_owner_select.sql`
- Policy `beat_audio_assets_select_own` — `FOR SELECT TO authenticated` — `EXISTS` beat where `owner_id = (SELECT auth.uid())`
- No INSERT/UPDATE/DELETE changes; staff + published policies untouched; no admin-client bypass

## Verification

| Check | Status | Evidence |
|------|--------|----------|
| RLS owner SELECT (incl. pre-publish DRAFT) | **PASS** | vitest 3/3; E2E submit after policy |
| Peer USER isolation (non-PUBLISHED) | **PASS** | vitest on APPROVED fixture |
| Anon isolation (non-PUBLISHED) | **PASS** | vitest |
| PUBLISHED catalog / staff policies | **PASS** | peer sees PUBLISHED assets; staff policy unchanged |
| rights → submit → mod → publish | **PASS** | `owner-select-policy-e2e-report.json` |
| picker / recording gate / R / mock REC / take / archive | **PASS** | same report + published/archive shots |
| Motyw / IHDR | **PASS** | 8 PNGs IHDR ok |
| Docker / loopback `:54421` | **PASS** | |
| production | **NOT RUN** | |
| Original `Visual Fixture — Local Only` | untouched (APPROVED, no attestation) | |

## Artifacts

- `owner-select-policy-e2e-report.json`
- `owner-select-rls-vitest-summary.json`
- `*-editor-published-attached-*.png`, `*-archive-after-take-*.png`
- Harness: `_e2e-publish-and-rec.mjs` (Fake MediaRecorder; no Play/export/delete)

## Cleanup

`.env.local` restored byte-exact (SHA-256 match to pre-task backup); backup removed from audit dir; temp creds wiped; Next task process on `:3460` stopped.
