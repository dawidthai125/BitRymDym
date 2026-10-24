# Read-only — unblock path for `Visual Fixture — Local Only` (2026-10-24)

**Scope:** recognition only. No data/role/status/rights mutations. No new users. No SQL patches, seeds, `supabase start` / `db reset`, production, or remote Supabase.  
**Sacred WIP** `recording-eligibility-service.ts`: not read.  
**`studio-editor.tsx` / `studio-service.ts` / audio-CAS / `supabase/config.toml`:** not opened.  
**Git:** dirty WIP preserved (no reset/clean/stash/sync).  
**Skills:** research-and-planning.  
**RO control:** [RO beat status machine](f885fd84-2cc5-4720-815f-cb5aef153a92).

## Fixture snapshot (read-only probe)

| Fact | Value |
|------|--------|
| Status | `APPROVED` |
| Ownership | `USER` |
| `beat_rights_basis` rows | **0** |
| Active MASTER READY | **yes** |
| Local `@localhost.local` roles | USER×2, MODERATOR×2, **ADMIN×0** |
| Mutations in this recognition | **NONE** |

## Check results

| # | Question | Status | Finding |
|---|----------|--------|---------|
| 1 | Existing local ADMIN, or documented ADMIN without DB mutation? | **FAIL** / **BLOCKED** | Live local Auth: **0 ADMIN**. Documented bootstrap (`supabase/seed.local.e2e.sql`, `docs/phases/PHASE_1_9_DESIGN_FREEZE.md`) requires creating a user in Studio **and** setting `profiles.role = 'ADMIN'` via Dashboard SQL / service-role — i.e. **profile mutation**, not an app UI path. App cannot self-promote (`prevent_privilege_escalation`). |
| 2 | Staff UI APPROVED → DRAFT? Required role/status? | **FAIL** | **APPROVED → DRAFT is forbidden for all actors** (`ADMIN_BEAT_TRANSITIONS` / `USER_BEAT_TRANSITIONS`). Matrix allows **ADMIN only**: APPROVED → REJECTED or PUBLISHED. **MODERATOR** may APPROVED → PUBLISHED only. Staff UI on APPROVED shows only **„Opublikuj”** (`ModerationDecisionControls`) — **no** reject/draft control. Community `rejectUserBeat` accepts **only** `PENDING_REVIEW` → REJECTED. Owner `returnRejectedToDraft` only from **REJECTED**. |
| 3 | Exact rights statement before publish | **PASS** (spec clear) | Version `USER_RIGHTS_STATEMENT_VERSION` = `proposal-2026-10-19`. UI checkbox on `/beats/upload`: *„Oświadczam, że mam prawa do tego nagrania i do sampli w nim użytych albo mam zgodę uprawnionych. Rozumiem, że to oświadczenie nie zastępuje weryfikacji i że BitRymDym może wstrzymać publikację.”* Persist: `beat_rights_basis` (`basis_kind=user_attestation`, checksum = active MASTER, `statement_version`, `accepted_at`) on **submit**, not on approve/publish. Publish also needs: no open blocking review, no blocked hash, no unresolved closed outcome, READY MASTER, living owner. |
| 4 | Later UI path DRAFT → attestation → moderation → PUBLISHED? | **PASS** (if DRAFT reachable) | `/beats/upload` → checkbox + **„Wyślij do moderacji”** → `PENDING_REVIEW` → `/admin/moderation/[id]` **„Zatwierdź”** → (close open review if any) → **„Opublikuj”**. Non-owner MODERATOR/ADMIN. **Blocked today** because fixture cannot re-enter DRAFT via UI. |
| 5 | Fixture stays local; no real/remote user audio? | **PASS** | Prior visual evidence: title *Local Only*; short **silent** generated WAV in local `beat-audio` only. No production/remote asset required for this fixture. |

## Intended vs available recovery

```text
Intended product sequence (matrix):
  ADMIN: APPROVED → REJECTED (reason)
  Owner:  REJECTED → DRAFT („Popraw i wyślij ponownie”)
  Owner:  DRAFT → attest + submit → PENDING_REVIEW
  Staff:  approve → (close review?) → Opublikuj → PUBLISHED

Available today (local inventory + UI):
  MODERATOR: Opublikuj only → fails (no attestation)
  Owner:     cannot submit (not DRAFT); cannot draft-recover from APPROVED
  ADMIN:     none local; even with ADMIN, reject-from-APPROVED UI/wrapper gap
             (matrix YES, rejectUserBeat + moderation UI NO)
```

**Overall unblock via existing UI only:** **BLOCKED**

## Minimal Owner action to proceed

Choose **one** gated unlock (not performed in this recognition):

1. **Preferred product-legal:** Owner GO for a **local ADMIN** (or ADMIN UI that actually performs APPROVED→REJECTED with reason), then normal owner DRAFT → attest → staff approve → publish — still using existing silent local MASTER (no new remote audio).  
2. **Alternate gated:** Owner GO for a **one-time local recovery** of this fixture only (role/status/rights) under AGENTS bramka — out of scope for agents without that GO.  
3. **Not sufficient alone:** promoting/creating MODERATOR, closing reviews, or re-clicking Opublikuj — attestation cannot be written while status remains APPROVED.

## Sources (no secrets)

- Code: `src/lib/beats/validation.ts`, `service.ts` (`submitUserBeat` / `rejectUserBeat` / `publishApprovedUserBeat` / `returnRejectedUserBeatToDraft`), `rights-policy.ts`, `rights-records.ts`, `moderation-decision-controls.tsx`, `user-upload-beat-form.tsx`
- Docs: `supabase/seed.local.e2e.sql`, `docs/phases/PHASE_1_9_DESIGN_FREEZE.md`, prior visual fixture README (silent local MASTER)
- Live read-only: `_probe-admin-ro.mjs` output (role counts + fixture kinds only)
- RO subagent: [RO beat status machine](f885fd84-2cc5-4720-815f-cb5aef153a92)
