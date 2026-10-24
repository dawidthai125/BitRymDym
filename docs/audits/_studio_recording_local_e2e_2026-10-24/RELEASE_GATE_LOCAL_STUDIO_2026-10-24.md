# Release gate — local Studio (2026-10-24)

**Mode:** read-only. No code / migration / config edits. No commit / push / deploy.  
**Skills:** research-and-planning, security-review, testing-and-verification, frontend-ux.  
**Primary evidence:** on-disk migration, vitest summary, E2E JSON, PNG IHDR, `git` name-only status (no Sacred WIP content).  
**RO corroboration (completed, no contradiction):**  
- [RLS security gate](6f09d513-7dc5-45fc-b20f-fcd0ccbe47de) — owner SELECT PASS; peer/anon + staff/PUBLISHED PASS from docs; production NOT_RUN; residual: table SELECT ≠ storage auth.  
- [E2E + record_armed gate](bd1f9e3b-6b07-479a-84b9-24dcede845ba) — E2E statuses match; seed `record_armed: false` in `studio-service.ts`; mock harness-only.  
- [visual + WIP boundaries](29595f92-80d1-43a3-a53e-e288f1c741ff) — visual/IHDR PASS; `studio-editor.tsx` dirty (**FAIL** “untouched”); Sacred WIP present, not inspected; Owner GO candidates = migration + owner-select test + this audit dir.  
**Prior RO (same GO trail):** [RLS security review](45e718a4-cdc4-4306-b98b-705b320eeea0), [ownership map](e4f0d638-5764-4328-b8ca-d0c7022475b7), [submit→REC checklist](e46e5ebb-cbfb-43e6-898d-9c17fd96d5b2).  
**Sacred WIP** `src/lib/takes/recording-eligibility-service.ts`: not read, not searched, not diffed, not hashed.

---

## 1. RLS owner-DRAFT-asset migration

**File:** `supabase/migrations/20261024201348_beat_audio_assets_owner_select.sql`

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| Ownership via `beats.owner_id` | **PASS** | `EXISTS (… FROM public.beats b WHERE b.id = beat_audio_assets.beat_id AND b.owner_id IS NOT NULL AND b.owner_id = (SELECT auth.uid()))` |
| SELECT-only | **PASS** | `FOR SELECT` / `TO authenticated`; comment + vitest `policy_select_only_no_write` |
| No blanket DRAFT open | **PASS** | Predicate keys off owner, not `status` |
| Peer USER / anon cut off (non-PUBLISHED) | **PASS** | `owner-select-rls-vitest-summary.json` — isolation test PASS; notes: DRAFT isolation pre-publish; APPROVED fixture peer=0 / anon=0 post-publish |
| Staff + PUBLISHED non-regression | **PASS** | Baseline `20260925220000_phase_1_5_audio_storage.sql` still defines `beat_audio_assets_select_published` + `_select_staff`; new migration additive only; vitest expects peer ≥1 on PUBLISHED catalog |

**Not re-run in this gate:** live vitest / Docker (prior summary `result: PASS` accepted as file evidence).

---

## 2. Default `record_armed`

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| New project seeds unarmed | **PASS** | `src/lib/studio/studio-service.ts` `createStudioProjectFor` seeds BEAT + VOCAL with `record_armed: false` (diff vs HEAD: VOCAL `true` → `false` + comment) |
| Conscious R arms selected track | **PASS** | `recording-local-e2e-report.json` `defaultR.status=PASS` (all `aria-pressed=false`); `consciousArm.status=PASS` (armedIdx 0); later `owner-select-policy-e2e-report.json` `consciousR=PASS` |
| Editor as seed source | N/A | `recording-local-e2e-report.json` `defaultRFix`: seed was in `studio-service.ts`; editor had no default-true |

**Note:** `r-state-recapture.json` shows an earlier `consciousArmOk: false` capture; superseded by `recording-local-e2e-report.json` and the published-path E2E.

---

## 3. `owner-select-policy-e2e-report.json`

| Step | Status (file) |
|------|----------------|
| rights | PASS |
| submit | PASS |
| moderation | PASS |
| publication | PASS |
| picker | PASS |
| recordingGateLifted | PASS |
| consciousR | PASS |
| mockRec | PASS |
| takeSave | PASS |
| archive | PASS |
| themeRoundTrip | PASS |
| motywPlacement | PASS |
| ihdr | PASS |
| production | NOT_RUN |
| defects | `[]` |

**Fixture:** `Visual Fixture — Published Local Only`. Blocked original left untouched (`blockedLeftUntouched: true`).

---

## 4. Visual / Motyw / IHDR

**Authoritative pack (post-publish + archive)** — report IHDR all `ok: true`; disk re-read matches:

| File | IHDR |
|------|------|
| `dark-editor-published-attached-desktop-1280x800.png` | 1280×800 |
| `light-editor-published-attached-desktop-1280x800.png` | 1280×800 |
| `dark-editor-published-attached-mobile-390x844.png` | 390×844 |
| `light-editor-published-attached-mobile-390x844.png` | 390×844 |
| `dark-archive-after-take-desktop-1280x800.png` | 1280×800 |
| `light-archive-after-take-desktop-1280x800.png` | 1280×800 |
| `dark-archive-after-take-mobile-390x844.png` | 390×844 |
| `light-archive-after-take-mobile-390x844.png` | 390×844 |

**Default-R / unarmed / conscious-arm packs** also present with matching IHDR on sampled files.  
**Motyw round-trip:** PASS in E2E (`themeRoundTrip`, `motywPlacement`).

---

## 5. WIP boundaries (`git status --porcelain` / `git diff --name-only`)

| Boundary | Verdict | Evidence |
|----------|---------|----------|
| Sacred WIP omitted from this gate | **PASS** (process) | Path listed dirty `M`; gate did not read/diff/hash it |
| `studio-editor.tsx` untouchable / clean | **FAIL vs HEAD** | `M src/components/studio/studio-editor.tsx` present in dirty tree. Not opened in this gate. Prior evidence claims seed fix was in `studio-service.ts`, but file is still modified → cannot claim “nietknięty” relative to last commit |
| Unintended / mixed WIP | **Present** | Large dirty set: auth, premium retention, mix-working, takes tests, `supabase/config.toml`, package files, many unrelated audits. Out of local Studio RLS+R-default scope |

---

## Verdict table

| Gate item | Status |
|-----------|--------|
| local functional Studio | **PASS** |
| RLS security | **PASS** |
| visual Studio | **PASS** |
| audio mock limitation | MediaRecorder/getUserMedia harness-only (`owner-select-policy-e2e-report.json`); does **not** bypass product PUBLISHED gate or rights; no Play/export of masters in harness |
| production | **NOT RUN** |
| commit / push / deploy | **NOT RUN** |

### Exact paths requiring a separate Owner GO to commit (this Studio local fix)

Minimal intentional set (do **not** include Sacred WIP, `config.toml`, or unrelated dirty modules):

1. `supabase/migrations/20261024201348_beat_audio_assets_owner_select.sql`
2. `src/lib/beats/beat-audio-assets-owner-select-local.test.ts`
3. `docs/audits/_studio_recording_local_e2e_2026-10-24/` (evidence + this release-gate report; exclude ephemeral runtime leftovers if any: `_next-3460.*`, wiped creds paths)

**Requires Owner decision / careful split (mixed dirty file):**

4. `src/lib/studio/studio-service.ts` — contains the `record_armed: true → false` seed hunk **and** unrelated Mix Working / other WIP in the same file; whole-file commit is **not** a clean single-scope change without Owner review or hunk-scoped GO.

**Dirty but out of “commit this fix” recommendation unless Owner explicitly expands scope:**

5. `src/components/studio/studio-editor.tsx` — modified vs HEAD; not verified content here; not required for RLS policy; seed default lives in `studio-service.ts`.

**Must remain excluded from any standard commit of this gate:**

- `src/lib/takes/recording-eligibility-service.ts` (Sacred WIP)
- `supabase/config.toml` and other unrelated modified/untracked paths outside the list above
