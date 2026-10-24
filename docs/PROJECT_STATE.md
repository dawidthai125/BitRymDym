# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point:** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) → [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) → ten plik.
**Updated:** 2026-10-24 — **Studio / theme / RLS session consolidated** · Git tip **`35543c8`** (parent **`1e75fd3`**) · functional map [PROJECT_FUNCTIONAL_MAP.md](./PROJECT_FUNCTIONAL_MAP.md) · handoffs [handoffs/](./handoffs/) · public deploy+smoke **PASS** · admin auth visual **PASS** · prod USER RLS / audio-REC / migracje **NOT VERIFIED / NOT RUN** · OD-15/OD-16 **OPEN** · Premium Retention **HOLD** · Sacred WIP **PRESERVE** · dirty WIP **PRESERVE** · [CHANGELOG 2026-10-24](./CHANGELOG.md)
**Prior (2026-10-19) STU-16 LIMITED PRODUCTION PASS + consolidated audit (docs-only):** status **`STU-16 LIMITED PRODUCTION PASS`** (≠ Production GREEN) · controlled prod E2E on QA `418a6a91-…` / beat `fd1f8593-…` / fixture `chromium-mediarecorder-opus.webm`: **F-A1 READY**, **F-B2 `CONCURRENT_SESSION`**, **F-B1 idempotent finalize**, soft-delete cleanup PASS · day-cap post-retry **2/3** FREE (no refund) · tip parent before that docs = **`0a565c0`** · live docs dpl last-known **`dpl_31mzSUMaSfd4kQJ7G9EV3t2pXfRK` @ `0a565c0`** · app tip **`d12e38e`** · local live **17/17** remains last documented (TTL via backdate) · **Evidence V2 PASS:** XP ledger · SQL semantic parity · Cron schedule `0 0 * * *` · **Still NOT VERIFIED:** janitor Cron fire · wall-clock 900 s · concurrency load · SQL byte-for-byte · see §2 **STU-16** + [CHANGELOG 2026-10-19](./CHANGELOG.md)
**Prior (2026-10-17) Waves 2–5 change set (commit `de65ff9`, pushed with docs `1d33d3b`; deployed `dpl_1g2NnoZGx4sZTDASfLUKbQVvWoJS` READY):** **Security Wave 5** on top of Wave 4: transactional `finalize_beat_master_asset` (beat metadata + MASTER swap all-or-nothing, idempotent replay, service-role only) for USER / PLATFORM finalize and ADMIN replace · analyze no longer writes the beat · migration **applied in production 2026-10-17 and verified read-only** (history `20261017193713 beat_master_finalize_atomic`; repo file `20261017140000`) · app code **deployed** · local tests T1–T10 **PASS** (atomicity suite 28/28) · production finalize path **NOT VERIFIED** (no real production call yet) · see row **SECURITY WAVE 5 (LOCAL)** and [CHANGELOG 2026-10-17 — Security Wave 5: app code deployed](./CHANGELOG.md) · before it, **Security Wave 4** on top of Wave 3: grants API on the shared error classifier · beat ownership checked before any grantee lookup · invalid `expiresAt` → 400 · MASTER activation race (`23505`) → `CONFLICT` · Wave 3 "DRAFT-only" doc corrected · **deployed in `de65ff9` · not production verified** · see row **SECURITY WAVE 4 (LOCAL)** and [CHANGELOG 2026-10-17 — Security Wave 4](./CHANGELOG.md) · before it, **Security Audit Wave 3** on top of Wave 2: shared beat error classifier for USER audio API + server actions · checked / pinned MASTER asset swap with restore · finalize accepts only a pending MASTER · **deployed in `de65ff9` · not production verified** · see row **SECURITY AUDIT WAVE 3 (LOCAL)** and [CHANGELOG 2026-10-17 — Security Audit Wave 3](./CHANGELOG.md) · before it, **Security Audit Wave 2** on top of `a91714a`: admin beats API error contract + `/admin/moderation/[id]` classification + malformed beat id = not found · race-safe `patchUserDraftMetadataAfterAuthz` (REJECTED rework enabled) · admin audio transport permission / asset-state hardening · **deployed in `de65ff9` · not production verified** · see row **SECURITY AUDIT WAVE 2 (LOCAL)** and [CHANGELOG 2026-10-17 — Security Audit Wave 2](./CHANGELOG.md)
**Prior update:** 2026-10-17 — **Admin auth denials**: audit of all `/admin/**` routes · fix in the commit after `4b56651`: `/admin/beats`, `/admin/beats/[id]`, `/admin/moderation` no longer log expected `UNAUTHENTICATED` / `FORBIDDEN` as `error` (`checkAccess(guard)` before data; ADMIN without `beats.edit` gets "Brak dostępu") · other `/admin/**` routes **NO ISSUE FOUND** · access rules unchanged · canonical record [CHANGELOG 2026-10-17 — Admin auth denials](./CHANGELOG.md)
**Prior update:** 2026-10-17 — **Auth denial logging fix in production**: code `b574937` (`/admin/users`) · production verify **PASS WITH LIMITATIONS** · [CHANGELOG 2026-10-17 — Auth error logging](./CHANGELOG.md) · before that **F1-C security fix in production** (code `fc85705`, see **SECURITY F1-C** row) · earlier update below kept for SFM context
**Earlier update:** 2026-10-16 — **SFM KIND_REJECT code on `main`** @ **`69e50d0`** (ancestor of current tip **`5212933`**, parent **`81c2496`**) · repo migration `20261016120000_sfm_reject_executor_job_kind.sql` in that commit · Git file **≠** database apply · live CAS/concurrency **NOT CONFIRMED** · staging E2E **NOT CONFIRMED** · `SFM_VERSIONS_V1` runtime, SFM poller activity, Contabo **NOT RE-VERIFIED IN THIS STAGE** · **OD-SFM-WORKER-ORPHAN-TIMEOUT OPEN** · see [CHANGELOG](./CHANGELOG.md)

---

## 1. Project Identity

| Pole | Wartość |
|------|---------|
| Nazwa | BitRymDym |
| Cel | Platforma muzyczna (rap / hip-hop / bity): odsłuch, pobieranie, Quick Take → społeczność i współpraca |
| Owner / Product Owner | Prezes Dawid |

---

## 2. Current Repository / Production Planes

| Pole | Wartość |
|------|---------|
| Canonical branch | `main` |
| **SESSION VERIFY 2026-10-24 (Studio / RLS / theme delivery)** | **Living tip `35543c8`** = `fix(studio): start vocal tracks unarmed` · parent **`1e75fd3`** = `fix(rls): owner SELECT on beat_audio_assets for own DRAFT masters` · pushed to `origin/main` (re-check `ls-remote`) · dirty WIP **PRESERVE** (Premium Retention HOLD · Sacred WIP · mixed Studio) · **Production:** GitHub Deployments Production @ **`35543c8`** state **`success`** (2026-10-24) · public smoke **PASS** · admin authenticated visual **PASS** · `vercel inspect` CLI OAuth **NOT RUN** · prod USER RLS / REC / migracje **NOT VERIFIED / NOT RUN** · map → [PROJECT_FUNCTIONAL_MAP.md](./PROJECT_FUNCTIONAL_MAP.md) · evidence → [audits/_studio_recording_local_e2e_2026-10-24/](./audits/_studio_recording_local_e2e_2026-10-24/) |
| **GITHUB MAIN TIP / origin/main (living)** | **`35543c8`** (re-verify `git ls-remote`) · ancestry includes **`1e75fd3`** (RLS owner SELECT + local Studio audit pack) · prior theme docs tips remain HISTORY · **app-feature last documented BPM:** **`d12e38e`** · **SFM Production GREEN NOT CLAIMED** |
| **LOCAL DIRTY / UNTRACKED (preserve)** | Large mixed WIP as of 2026-10-24: Studio mix-working · Premium Retention (migrations `20261022120000`/`20261022130000`/`20261024120000` + `scripts/premium-retention-pg-gate/` + fencing contract) · audits/scripts · `supabase/config.toml` ports · Sacred WIP path may show modified — **preserve** · **Premium Retention = HOLD** (not on origin · not applied remotely · not activated) · detail → [PREMIUM_RETENTION_FENCING_CONTRACT.md](./decisions/PREMIUM_RETENTION_FENCING_CONTRACT.md) |
| **SFM PLANES (do not collapse)** | **(1) Code on `main`:** through **`5212933`** (parent **`81c2496`**; no SFM path changed through Git tip `1d33d3b`) · HTTP surface introduced at **`2f7050e`** · dedicated poller commit **`d3c99e3`** · KIND_REJECT code + repo migration `20261016120000_sfm_reject_executor_job_kind.sql` at **`69e50d0`** · Git file **≠** database apply · **(2) Staging deployment SHA:** **NOT RE-VERIFIED IN THIS STAGE** · **(3) Staging schema:** **NOT RE-VERIFIED IN THIS STAGE** · **(4) Staging SFM worker activity:** **NOT RE-VERIFIED IN THIS STAGE** · **(5) Prod app:** current deployment per Vercel (see **PRODUCTION DEPLOYMENT**) · SFM code already in production before F1-C (auto-deploys `81c2496` / `5212933` / `4ca9c2d`) · SFM HTTP/runtime behaviour and `SFM_VERSIONS_V1` **NOT VERIFIED** (F1-C smoke only) · **(6) Prod DB:** prior SSOT claimed SFM A–D via MCP (`20261015…` ≠ local `20261014…`) — **no remote re-verify in this stage** |
| **STUDIO FINAL MIX PRODUCT CONTRACT** | **OWNER ACCEPTED** · [addendum](./decisions/STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md) · OD-SFM-08/12/14 CLOSED · **product cutover NOT DONE** (flag default OFF · no staging/prod E2E GREEN for SFM Versions) · code planes → **SFM CODE STATUS** / **SFM PLANES** |
| **SFM F-ADDENDUM / STAGES DF** | **OWNER ACCEPTED (docs)** · [F02b/F03b](./decisions/STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md) · [stages](./decisions/STUDIO_FINAL_MIX_VERSION_STAGES_DESIGN_FREEZE_PROPOSAL.md) · F02/F03 **SUPERSEDED SFM-only** · corrections A/B/C · **CODE ON MAIN** for A/B1/C/D + HTTP · **≠** product cutover · **OD-04 OPEN** |
| **SFM IMPLEMENTATION DESIGN** | **OWNER ACCEPTED (design docs)** · OD-SFM-ID-01…04 + **OD-SFM-ID-07 CLOSED** · [pack](./decisions/STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md) · kinds `SFM_MIX_PREPARE`/`SFM_MASTER_BAKE`/`SFM_QUALITY_ENCODE` · separate `claim_next_sfm_job` (service_role) · fail-closed `mapJobKind` · **Stages A/B1/C/D + OD-06 + HTTP surface = CODE ON MAIN** · Contabo STUDIO poller **does not** claim SFM kinds · **OD-SFM-ID-05 + OD-04 OPEN** · OD-SFM-ID-06 cutover semantics **not production-verified** |
| **SFM CODE STATUS (living planes)** | **A** foundation `7fb5dcb` · **B1** grants/Warsaw day `a4ea89c` · **C** executor + `claim_next_sfm_job` `7dd4265` · **D** encode/artifacts/promote/retention `18c2c6a` · **OD-06** download AuthZ `cd582ea` + UI `sfmVersionId` route `bf34767` · worker bake libs `2d3514c` · **HTTP surface** Accept / version status / stages start / grants / encode / job status / download introduced @ **`2f7050e`** · last SFM-relevant tip **`5212933`** (ancestry; living Git tip = SESSION VERIFY / `origin/main` — see **GITHUB MAIN TIP**) · poller commit **`d3c99e3`** · KIND_REJECT **`69e50d0`** (repo migration file **≠** database apply) · **local unit tests (publish evidence):** `npx vitest run src/lib/sfm` **200 PASS** at HTTP-surface publish (report evidence; **≠** re-run in this docs GO) · prior **143 PASS** evidence @ `e8d2127` = HISTORY · **`SFM_VERSIONS_V1` runtime:** **NOT RE-VERIFIED IN THIS STAGE** · **staging E2E:** **NOT CONFIRMED** · **staging deployment SHA:** **NOT RE-VERIFIED IN THIS STAGE** · **SFM worker activity:** **NOT RE-VERIFIED IN THIS STAGE** (poller code is in Git @ `d3c99e3`; that is not a host reading) · **prod app deploy of tip:** **NOT RE-VERIFIED** (last-known **`2adb569`**) · **prod DB:** SFM A–D via MCP (`20261015…` ≠ local `20261014…`) — prior SSOT claim; **no remote re-verify here** · **SFM Production GREEN:** **NOT CLAIMED** |
| **PRIOR DOCS / APP TIPS (HISTORY)** | Docs SSOT reconcile (parent **`e8d2127`**) · **`e8d2127`** SFM type/poller · **`2d3514c`** SFM worker bake · **`bfed53d`** migration drift guardrail · **`7d87380`** Contabo poller DF · **`22c7d56`** Final Mix GREEN §4G · **`a1df783`** GREEN VERIFIED · **`dcd2308`** FULL FIXTURE · **`51a37a2`** empty-session · **`99bb10e`** I.18 · **`cee88f8`** FM criteria · **`e4971d2`** Stage J · **`2adb569`** PR #12 |
| **APP-CODE TIP (last-established in available evidence)** | **SFM app code on `main` through `5212933` (parent `81c2496`; no SFM path changed since)** · HTTP surface **`2f7050e`**, poller **`d3c99e3`**, KIND_REJECT **`69e50d0`** = ancestry · prior polish **`e8d2127`** / bake **`2d3514c`** = ancestry · prior non-SFM app-feature tip **`ce2f0cc`** (PR #5) remains HISTORY for Studio delete×export · security fix **F1-C `fc85705`** on top · auth denial logging fix **`b574937`** on top · admin auth denials fix `a91714a` (child of `4b56651`) on top · Security Waves 2–5 **`de65ff9`** on top (deployed via `1d33d3b`) · production app code ≡ **`b574937`** as of audit 2026-10-17 ~13:31Z (HISTORY; current: see **PRODUCTION DEPLOYMENT**) |
| **REUSE / DO NOT DUPLICATE** | [architecture/REUSE_SSOT_MAP.md](./architecture/REUSE_SSOT_MAP.md) · SEARCH EXISTING FIRST |
| **SACRED WIP** | `src/lib/takes/recording-eligibility-service.ts` · SHA256 `5AE4C2311704DCDAE51CE36D8E69E1CA162F0C55AB14866EB30E73DC50EEECB9` · **MATCH** re-verified **2026-10-24** (hash only) · do not open / edit / stage / reset / clean · local worktree may still show this path as modified alongside other user dirty files — **preserve**; not part of BPM UX commits |
| **BPM CONFLICT LABELING UX** | **CLOSED** 2026-10-19 · code **`d12e38e`** · files `bpm-uncertainty-ui.ts` + `.test.ts` only · functional deploy HISTORY **`dpl_6K73CZWphFdfPz4JjrvLapERTjwT`** READY (2026-10-19 ~06:09 +0200; correlated with `d12e38e` push) · live aliases later served by docs auto-deploy (see **PRODUCTION DEPLOYMENT**) — app code for this fix remains `d12e38e` · labels `Hipoteza {n} BPM` · score hint only if margin `>= 0.05` · no index-based „główna/alternatywna” · CONFLICT keeps null recommendation + required selection · **91/91** BPM suites PASS (session evidence; not re-run in SSOT reconcile) · isolated WAV-6 model+SSR **PASS** · **NOT:** live prod CONFLICT UI · Playwright form E2E · DSP/resolver/metadata change · [design §6.1](./architecture/BPM_UNCERTAINTY_UX_DESIGN.md) · [CHANGELOG 2026-10-19](./CHANGELOG.md) |
| **WAV-6 TEMPO (separate)** | Production stored BPM **65** · offline/analyze signal ~**99–101** · reason class **`RATIO_1_5_AMBIGUITY`** · **OPEN** for Owner listen / optional data correction · **unchanged** in labeling session · **≠** UX closeout · do **not** claim 100 as ground truth |
| **STU-16 PENDING_UPLOAD WINDOW** | **Code + migration file ON `main`** @ **`c2be3b0`** · Git file `supabase/migrations/20261018120000_stu16_pending_upload_window.sql` · **Production DB migration apply: VERIFIED BY READ-ONLY AUDIT** (2026-10-19) · project **`rzzxrgcdogkybkiidqgw`** · history **`20261018154129`** / `stu16_pending_upload_window` · Git vs DB timestamp drift noted · prod TTL **900** · defs/grants checked in audit scope · **not** full byte-for-byte SQL vs Git · **Local live integration: VERIFIED PASS 17/17** (2026-10-19) · `npx vitest run --config vitest.integration.config.ts src/lib/takes/stu16-pending-upload-window-live.test.ts` · exit 0 · covers claim / retry same `takeId` / `CONCURRENT_SESSION` / window+object / janitor / takeover / parallel claim (1 winner) / actor isolation / anon / finalize idempotency / claim∥finalize / janitor∥claim / READY / RPC grants / catalog TTL / day-cap rollback / `SESSION_DAY_CAP` spend semantics · TTL exercised via **`created_at` backdate**, not wall-clock 900 s · local stack started from backup **without** `db reset` · Auth health HTTP 200 on **`127.0.0.1:54421`** · **Local host ports (WIP `supabase/config.toml`, not in this docs commit):** API **54421** · DB **54422** · shadow **54420** · Studio **54423** · Inbucket **54324** — moved off Windows excluded TCP **54224–54323** (do **not** assume API is still `54321`) · **Status: `STU-16 LIMITED PRODUCTION PASS` (2026-10-19)** — controlled GO on dedicated QA USER (not Owner): F-A1 claim→upload→READY · F-B2 `409 CONCURRENT_SESSION` · F-B1 idempotent finalize · soft-delete cleanup by exact `takeId`/`object_key` · fixture A `chromium-mediarecorder-opus.webm` (43 589 B, duration 3 s) · prior WAV ~0.25 s → `DURATION_PROBE_FAILED` explained by `Math.round` below `BEAT_DURATION_MIN` (1), not “WAV broken” · day-cap after retry **2/3** FREE (soft-delete no refund) · **≠** Production GREEN · **Evidence V2 PASS:** XP ledger · SQL semantic parity · Cron schedule · **Still NOT VERIFIED:** janitor Cron fire (next natural **2026-10-20 00:00Z**) · wall-clock 900 s · concurrency load · SQL byte-for-byte · [RECORDING.md](./architecture/RECORDING.md) · [CHANGELOG 2026-10-19](./CHANGELOG.md) |
| **SECURITY F1-C (profiles privilege hardening)** | **IN PRODUCTION** · code **`fc85705`** · repo file `20261017120000_f1c_profiles_privilege_hardening.sql` ↔ prod history **`20261017081616 f1c_profiles_privilege_hardening`** (MCP apply; version drift expected, do not rewrite) · prod catalog read-back (function, ACL, RLS, triggers) **PASS** · local tests 91/91 **PASS** · prod HTTP smoke **PASS** · **NOT VERIFIED:** prod `display_name` save via UI · prod sign-up E2E · F2 (`current_user` in award/admin RPCs) **OPEN / separate analysis** · canonical record: [CHANGELOG 2026-10-17 — F1-C production deployment reconciled](./CHANGELOG.md) · design: [AUTHORIZATION.md](./architecture/AUTHORIZATION.md) |
| **AUTH DENIAL LOGGING (`/admin/**`)** | **`/admin/users`: IN PRODUCTION** · code **`b574937`** · prod verify (read-only, anonymous only) **PASS WITH LIMITATIONS** · route audit `/account/takes` · `/beats/upload` · `/studio` · `/account/beats` **NO ISSUE FOUND** · [CHANGELOG — Auth error logging](./CHANGELOG.md) · **`/admin/beats`, `/admin/beats/[id]`, `/admin/moderation`: FIXED** in the commit after `4b56651` · `checkAccess(guard)` (`src/lib/auth/access-denial.ts`) with exported guards `requireAdminPlatformBeatsAccess` / `requireModerationAccess` · other `AuthError` codes and non-auth errors still propagate · access rules unchanged · local tests 548 PASS / 7 skipped · local matrix 8 routes × 4 roles: 16 → 0 `AuthError` log lines · rest of `/admin/**` **NO ISSUE FOUND** · production state of this fix: verify the deployment (see **PRODUCTION DEPLOYMENT**) · **NOT VERIFIED:** signed-in USER / MODERATOR / ADMIN in production · prod logging of real unexpected errors · [CHANGELOG — Admin auth denials](./CHANGELOG.md) · rule: [AUTHORIZATION.md](./architecture/AUTHORIZATION.md) Next.js note |
| **SECURITY AUDIT WAVE 2 (LOCAL)** | **DEPLOYED — not production verified** (Git: part of Waves 2–5 commit `de65ff9`, deployed via `1d33d3b` / `dpl_1g2NnoZGx4sZTDASfLUKbQVvWoJS`) (base `a91714a`) · **(A)** `patchUserDraftMetadataAfterAuthz`: ownership check correct (`ownerId` always from session); stale `status` / `rejection_reason` write on a read→write race + silent 0-row success + documented REJECTED rework blocked — **FIXED locally** (metadata-only UPDATE pinned to the read status, 0 rows → `CONFLICT`) · **(B)** `/api/admin/beats/**`: `NOT_FOUND`/`CONFLICT` → 401 and raw DB/storage messages as 400 without logs — **FIXED locally** (`adminBeatAudioApiErrorResponse` — renamed in Wave 3 —, `BeatRequestError`, `authErrorHttpStatus`; unexpected → logged generic 500) · analyze partial asset write before the `beats.edit` denial and master `complete` activating non-pending / non-MASTER assets — **FIXED locally** · **(C)** `/admin/moderation/[id]`: viewer denial vs hidden content conflated, malformed id → error page — **FIXED locally** (`checkAccess` + `loadBeat` uuid guard; owner-identity denial → masked id) · Vitest 177/198 files (21 live / `.env.local` files excluded) 2374 PASS / 0 failed · typecheck / build PASS · full `npm run lint` FAIL only on 43 pre-existing errors in untouched files; changed files lint-clean · **production at the time of the Wave 2 audit: `a91714a`** (read-only check: Ready, 0 error / 0 warning logs in retained window) · **NOT VERIFIED:** signed-in roles in production · ADMIN runtime of API error paths · [CHANGELOG — Security Audit Wave 2](./CHANGELOG.md) |
| **SECURITY AUDIT WAVE 3 (LOCAL)** | **DEPLOYED — not production verified** (Git: part of Waves 2–5 commit `de65ff9`, deployed via `1d33d3b` / `dpl_1g2NnoZGx4sZTDASfLUKbQVvWoJS`) (on top of the Wave 2 tree) · **(A)** `/api/beats/audio/**`: `CONFLICT`/`NOT_FOUND` → 401, raw DB / storage / JSON-parse text as 400, no logs — **FIXED locally** (shared `beatAudioApiErrorResponse` in `src/lib/beats/beat-operation-error.ts`, uuid / body validation → 400) · **(B)** server actions returned raw `error.message` without logs — **FIXED locally** (`beatActionErrorMessage`; authored messages kept, unexpected → generic + log) · **(C)** `markAssetFailed` / MASTER swap ignored write errors, had no state pins, 0 rows = success, failed activation left no active MASTER — **FIXED locally** (checked + pinned writes, 0 rows → `CONFLICT`, restore of the previous MASTER); **non-atomic window remains** (owner decision: transactional RPC) · **(D)** finalize could re-activate a REPLACED / READY asset; PLATFORM finalize lacked up-front `beats.edit` — **FIXED locally** · Vitest 180 files (21 live / `.env.local` files excluded) 2489 PASS / 0 failed · typecheck / build PASS · changed files lint-clean; full lint FAIL only on the 43 pre-existing errors · [CHANGELOG — Security Audit Wave 3](./CHANGELOG.md) |
| **SECURITY WAVE 4 (LOCAL)** | **DEPLOYED — not production verified** (Git: part of Waves 2–5 commit `de65ff9`, deployed via `1d33d3b` / `dpl_1g2NnoZGx4sZTDASfLUKbQVvWoJS`) (on top of the Wave 3 tree) · **(H1)** grants APIs returned raw DB / `22P02` / JSON-parse / RPC text as 400 without logs — **FIXED locally** (shared `beatApiErrorResponse`; uuid / body validation → 400; unexpected → generic 500 + log; also `/api/account/grants`) · **(H2)** grantee looked up before beat ownership (user / display-name existence probe) — **FIXED locally** (`createBeatAccessGrantForGrantee`: validate → ownership → lookup → RPC) · **(H3)** invalid / past `expiresAt` and ambiguous name → 403 — **FIXED locally** (400) · **(E2)** MASTER race without a previous asset → 500 — **FIXED locally** (`23505` on activation only → `CONFLICT`) · **(E3)** Wave 3 "DRAFT-only" wording — **corrected** (DRAFT or REJECTED) · **(E1)** metadata written before activation, kept on a lost race — **documented, not changed** (owner decision: transactional RPC) · Vitest 181 files (21 live / `.env.local` files excluded) 2539 PASS / 0 failed · typecheck / build PASS · 32 changed + new code files lint-clean; full lint FAIL only on the 43 pre-existing errors · [CHANGELOG — Security Wave 4](./CHANGELOG.md) |
| **SECURITY WAVE 5 (LOCAL)** | **CODE DEPLOYED — production path NOT VERIFIED** (Git: commit `de65ff9`, parent `a91714a`, pushed with docs `1d33d3b`; deployment `dpl_1g2NnoZGx4sZTDASfLUKbQVvWoJS` @ `1d33d3b` READY) (on top of the Wave 4 tree) · new migration `20261017140000_beat_master_finalize_atomic.sql` — **applied in production 2026-10-17** via MCP `apply_migration` (history `20261017193713 beat_master_finalize_atomic`; one transaction; read-back: INVOKER, `search_path=""`, `EXECUTE` only `postgres` / `service_role`, `anon` / `authenticated` none) — record: [CHANGELOG — Security Wave 5: production migration applied](./CHANGELOG.md) · local tests T1–T10 **PASS** through the app on local Supabase (incl. atomicity suite 28/28) — record: [CHANGELOG — Security Wave 5: app code deployed](./CHANGELOG.md) · **no real production call of the finalize path yet**; a controlled production check needs its own Owner GO · **(E1)** beat metadata written before activation + analyze writing title / duration to the beat — **FIXED locally** (analyze writes only the pending asset; metadata committed with the swap) · **(E2)** non-atomic MASTER swap — **FIXED locally** (`finalize_beat_master_asset`: one transaction, lock order beat → asset → previous MASTER, idempotent replay, `service_role`-only INVOKER, `search_path = ''`) for USER finalize, PLATFORM finalize, ADMIN replace (replace now commits measured duration; unmeasurable / > 210 s → 400 + asset FAILED) · atomicity / rollback / concurrency proven on **local Postgres 17.6**: 28/28 (opt-in `BEAT_FINALIZE_LOCAL_DB_TEST=1`), lock-removal mutation fails 3 · Vitest safe subset 181 files PASS + 1 skipped (local-PG suite without opt-in; 21 live / `.env.local` files excluded) 2559 PASS / 0 failed · typecheck / build PASS · 33 changed + new code files lint-clean; full lint FAIL only on the 43 pre-existing errors · full `npm test` not run · [CHANGELOG — Security Wave 5](./CHANGELOG.md) |
| **APP FEATURE COMMIT (V2)** | `44f7cbd2671dd5ece6ea298cc78bfae9a0f7a7f5` (**`44f7cbd`**) — Studio Visual Parity V2 · **GREEN / RELEASE VERIFIED / CLOSED** |
| **PRODUCTION DEPLOYMENT** | **Model:** Vercel auto-deploys every push to `main`, **including docs-only commits** · re-verify with `vercel inspect www.bitrymdym.pl` (if CLI requires OAuth without credentials → **abort login**; use GitHub Deployments API) · **2026-10-24 tip `35543c8`:** GitHub Production deployment **success** · public routes smoke **PASS** · admin auth visual **PASS** · Ready ≠ full product GREEN · aliases **`www.bitrymdym.pl`** / **`bitrymdym.pl`** / **`bitrymdym.vercel.app`** · **HISTORY last STU-16 docs dpl:** `dpl_31mz…` @ `0a565c0` (2026-10-19) |
| **PRODUCTION GIT SHA** | **Living tip (2026-10-24):** **`35543c8`** (includes Studio unarmed VOCAL + ancestry `1e75fd3` RLS) · re-check `ls-remote` · prior app-feature BPM tip **`d12e38e`** remains HISTORY for that UX · Ready ≠ STU-16 Production GREEN |
| **DOMAIN ALIASES** | **`www.bitrymdym.pl`** · **`bitrymdym.pl`** · **`bitrymdym.vercel.app`** · audit 2026-10-17 ~13:31Z: both custom domains resolved to `dpl_HuQEcftsjTDPZCmazbTqCS57n5HX` @ `b574937` (snapshot, HISTORY; earlier snapshot `dpl_ChczaN3…` @ `61d3655`) · re-verify with `vercel inspect <domain>` · apex `bitrymdym.pl/admin/users` answered 308 `Location: https://www.bitrymdym.pl/admin/users` (other apex paths not checked) |
| **PRIOR PRODUCTION DEPLOY (HISTORY)** | `dpl_28oHcn3w146saZ6fNDFsiCQehUQP` @ `f730a7a` (I.46-A10 / I.47 snapshot) · `dpl_7Cp2gQ9BX3s8jVG9faL3LUjMgyt5` @ `df37048` (I.45EJ-R1) · `dpl_1P8ixpt…` @ `ce2f0cc` (PR #5) · `dpl_9YDCy…` @ `faf734b` (PR #4) · earlier `dpl_56FGH…` |
| **DUAL-PLANE NOTE** | **2026-10-17:** F1-C implementation **`fc85705`** ≠ deployment SHA (docs-only commits auto-deploy; app code unchanged; verify via Vercel) · prod DB F1-C history version `20261017081616` ≠ repo file `20261017120000` · **SFM context:** SFM code (through **`5212933`**, parent **`81c2496`**) is in the prod bundle by ancestry ≠ staging deploy (**NOT RE-VERIFIED IN THIS STAGE**) ≠ staging schema (**NOT RE-VERIFIED IN THIS STAGE**) ≠ staging SFM worker activity (**NOT RE-VERIFIED IN THIS STAGE**) ≠ local dirty WIP ≠ feature V2 `44f7cbd` · repo code ≠ database apply ≠ runtime flag ≠ Contabo SFM bake · deployed ≠ functional SFM Production GREEN · staging ≠ prod schema assumed · pre-F1-C prod deploy `dpl_EPPiqjt…` @ `4ca9c2d` · older `dpl_sAyrsHC…` @ `2adb569` = HISTORY |
| **OPS NOTE (subject BOM)** | Commit `d515f3b` subject has UTF-8 BOM before `docs:` · Owner decision · **non-blocking** · do not amend without GO |
| **V2 VERIFY DEPLOY (HISTORY)** | `dpl_2ymzMb24QtrYxWBJWmdufeTaTqkR` @ `44f7cbd` — original V2 release gate · **superseded for live aliases** |
| **PREVIOUS PRODUCTION TIP (HISTORY)** | `dpl_FVcx…` @ `3a086ad` · `44f7cbd` / `dpl_2ymz…` · `4fa658d` — Phase 7.1.6 · `79bc69f` V1 · older: `3fccbf7` · `9abc1b6` · `8f6eeca` |
| **PRODUCTION URL** | https://www.bitrymdym.pl (canonical serve) · https://bitrymdym.pl (308→www) · https://bitrymdym.vercel.app |
| **Local Studio verification environment** | **WSL2 + Docker Desktop** · lokalny Supabase loopback API **`127.0.0.1:54421`** (DB **54422** · nie zakładaj 54321) · tymczasowy Next **`127.0.0.1:3460`** · po teście **`.env.local` bajt w bajt** · fixture/credentials **tylko lokalnie** (nie prod, nie commit WAV/creds/PID/logów) · bez `db reset` / seedów / migracji prod bez osobnego GO Ownera · local REC E2E = **mock** MediaRecorder · szczegóły → [PROJECT_FUNCTIONAL_MAP.md](./PROJECT_FUNCTIONAL_MAP.md) · [audits/_studio_recording_local_e2e_2026-10-24/](./audits/_studio_recording_local_e2e_2026-10-24/) |
| **STUDIO / RLS SESSION (2026-10-24)** | Owner SELECT policy **`1e75fd3`** · VOCAL unarmed **`35543c8`** · local E2E mock REC **PASS** · prod public+admin visual **PASS** · prod USER RLS / REC / migracje **NOT VERIFIED / NOT RUN** |
| **STUDIO VISUAL PARITY V2** | **GREEN / RELEASE VERIFIED / CLOSED** @ `44f7cbd` · verify history `dpl_2ymz…` · aliases `dpl_56FGH…` · AC-12 PASS · AC-13 PASS · [freeze](./decisions/STUDIO_VISUAL_PARITY_V2_DESIGN_FREEZE.md) |
| **STUDIO BASELINE** | **Visual Parity V2 CLOSED / GREEN** @ `44f7cbd` · **Phase 7.1.6 CLOSED / GREEN** @ `4fa658d` · **7.1.5 Shell Polish CLOSED / GREEN** @ `3fccbf7` · **7.1.4 Mixer Dock CLOSED / GREEN** @ `9abc1b6` · **7.1.3 Inspector CLOSED / GREEN** @ `8f6eeca` · **V1 CLOSED / GREEN** · **P6.7 CLOSED / GREEN** · List UX/Delete **PRODUCTION VERIFIED** · Checkbox **PRODUCTION VERIFIED** · P6.6 GREEN · P6.5 Scenario A **PROVEN** · Scenario B **BLOCKED / INCONCLUSIVE** |
| **CATALOG** | **GREEN** · **17** PLATFORM PUBLISHED · public ↔ admin **MATCH** |
| **STORAGE** | **GREEN** · beat-audio **17** platform · orphans **0** · take-audio KEEP Dawid retained · test-user Storage cleaned (PHASE 3) |
| **SECURITY** | **GREEN** · Studio API **401** unauth · `studio_cas_*` anon/auth **DENIED** · service_role **ALLOWED** |
| **MOBILE** | **TECHNICALLY READY — DEVICE CERTIFICATION PENDING** · P0/P1 **0** · P2 **2** · P3 **5** |
| **LAST STUDIO VERIFY** | Studio Visual Parity V2 **GREEN** @ `44f7cbd` · prior 7.1.6 @ `4fa658d` · 7.1.5 @ `3fccbf7` · 7.1.4 @ `9abc1b6` · 7.1.3 @ `8f6eeca` · Checkbox @ `836679a` · V1 @ `56b629e` |
| **Phase 7.1.6 Auto Save + CAS** | **CLOSED / PRODUCTION VERIFIED — GREEN** @ `4fa658d` · dpl `dpl_6sai…` · feature `89ee919` · correction `4fa658d` · migration `20261008192141` · [closeout](./audits/P7_1_6_AUTO_SAVE_CAS_PRODUCTION_CLOSEOUT.md) |
| **Phase 7.1.5 Shell Polish** | **CLOSED / PRODUCTION VERIFIED — GREEN** @ `3fccbf7` (ancestry) · dpl `dpl_2E7J…` · feature `f891bce` · Escape fix `3fccbf7` · [closeout](./audits/P7_1_5_SHELL_POLISH_PRODUCTION_CLOSEOUT.md) |
| **Phase 7.1.4 Mixer Dock** | **CLOSED / PRODUCTION VERIFIED — GREEN** @ `9abc1b6` (ancestry) · OD-P7.1.4-01…04=A · [freeze](./decisions/P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md) · [closeout](./audits/P7_1_4_MIXER_DOCK_PRODUCTION_CLOSEOUT.md) |
| **Phase 7.1.3 Inspector IA** | **CLOSED / PRODUCTION GREEN** @ `8f6eeca` (do not reopen) |
| **D02 (anon claim live harness)** | **CLOSED** @ `44dc22c` — **TEST ONLY** (not a production app change) |
| **P5.7 Architecture Audit** | **COMPLETE — GO WITH CONDITIONS** — [audit](./architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md) |
| **P5.9 Architecture Audit** | **COMPLETE — GO WITH CONDITIONS** — [audit](./architecture/P5_9_STUDIO_ARCHITECTURE_AUDIT.md) |
| **P5.10 Studio Audio Engine** | **PRODUCTION VERIFIED — GREEN** @ `9c2a958` — [freeze](./decisions/P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md) |
| **P6.1 FX persist / validation** | **COMPLETE** · RPC hotfix **`57ef69e`** — qualify `studio_projects.document_version` |
| **P6.2 Track FX graph** | **PRODUCTION VERIFIED — GREEN** @ `23d3be8` |
| **P6.3 Master FX graph** | **PRODUCTION VERIFIED — GREEN** @ `350303e` |
| **P6.4.1 Master Gain/Pan + Track documentVersion** | **PRODUCTION VERIFIED — GREEN** @ `9f93606` · [P6.4 freeze](./decisions/P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md) |
| **P6.4.2 Shared FX UI Foundation** | **PRODUCTION VERIFIED — GREEN** @ `320907a` · [P6.4 freeze](./decisions/P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md) |
| **P6.4.3 Mix UX polish & integration** | **PRODUCTION VERIFIED — GREEN** @ `f261ea8` · served `0kfptvapkfp-m.js` · [P6.4 freeze](./decisions/P6_4_STUDIO_FX_UI_MIX_UX_DESIGN_FREEZE.md) |
| **P6.5 Studio Audio Quality Metering** | **IMPLEMENTATION COMPLETE · PRODUCTION DEPLOYED** @ `2258bdb` · **Scenario A PROVEN** · **Scenario B BLOCKED / INCONCLUSIVE** (browser/CDP · not GREEN · **do not reopen**) · [freeze](./decisions/P6_5_STUDIO_AUDIO_QUALITY_METERING_DESIGN_FREEZE.md) · [audit](./architecture/P6_5_STUDIO_AUDIO_QUALITY_METERING_ARCHITECTURE_AUDIT.md) |
| **P6.6 On-demand Track Peak Metering** | **PRODUCTION VERIFIED — GREEN** @ `c825e42` · dpl `dpl_3s3fAnvrpNVSwJcdhV8J1SZtc9g9` · P6.6.1 `a8a3337` · P6.6.2/3 `c825e42` · [freeze](./decisions/P6_6_STUDIO_TRACK_METERING_DESIGN_FREEZE.md) · [audit](./architecture/P6_6_STUDIO_ARCHITECTURE_AUDIT.md) |
| **P6.7 Clip Fades** | **PRODUCTION VERIFIED — GREEN** @ `06c60b5` · dpl `dpl_CpGUtwjDbvXdJ8oEuDyDFjQ1UgNp` · P6.7.1 runtime · P6.7.2 CAS · P6.7.3 UI · P6.7.x Trim/Split · P6.7.4 gate · DB RPCs fades/geometry_fades/split · [audit](./architecture/P6_7_CLIP_FADES_ARCHITECTURE_AUDIT.md) · [freeze](./decisions/P6_7_CLIP_FADES_DESIGN_FREEZE.md) |
| **P0 studio_cas_* EXECUTE** | **CLOSED / PRODUCTION VERIFIED GREEN** · migration `20261007073533` `p0_studio_cas_client_execute_revoke` · repo file `20261007140000_…` · anon/authenticated **DENIED** · service_role **ALLOWED** · P6.7 feature **unchanged CLOSED** · [CHANGELOG](./CHANGELOG.md) |
| **POST-RECORDING / VOCAL PRODUCTION V1** | **PRODUCTION VERIFIED — GREEN · CLOSED** @ `56b629e` (ancestry) · [gate](./audits/POST_RECORDING_EDITING_VOCAL_PRODUCTION_V1_PRODUCTION_GATE.md) |
| **STUDIO PROJECT LIST UX / DELETE** | **PRODUCTION VERIFIED — GREEN · CLOSED** @ `2c4b416` (ancestry) · [gate](./audits/STUDIO_PROJECT_LIST_UX_DELETE_PRODUCTION_GATE.md) · **does not** claim empty-project delete retest after PR #5 |
| **STUDIO DELETE × EXPORT HISTORY (Variant A)** | **PRODUCTION VERIFIED (narrow)** @ `ce2f0cc` / PR #5 / `dpl_1P8ixpt…` · I.45CV: project with `render_jobs`/`audio_artifacts` → HTTP **409** + PL copy · project + deps retained · empty-project happy-path delete **NOT TESTED** · soft-delete **OUT** |
| **STUDIO CUSTOM CHECKBOX UX** | **PRODUCTION VERIFIED — GREEN · CLOSED** @ `836679a` · [gate](./audits/STUDIO_PROJECT_CHECKBOX_UX_PRODUCTION_GATE.md) |
| **P4 CORE** | **SHIPPED** @ `bface6c` ⊂ `836679a` · local `context?` / `p4-live-verify` = **LOCAL WIP · NOT BASELINE** |
| **P4.6 TAKE_EXPORT** | **CLOSED / PRODUCTION VERIFIED / LIVE E2E VERIFIED / GREEN** @ `a72fed9` (ancestry) / `dpl_8PDy…` · Contabo **STOPPED/DISABLED** after controlled E2E — [closeout](./audits/P4_6_PRODUCTION_CLOSEOUT.md) |
| **SA-07** | Design Freeze **COMPLETE** · AWS **BLOCKED** · local untracked = **NOT PRODUCTION** |
| **STUDIO_EXPORT (Final Mix)** | **APP DEPLOYED** (ancestry PR #4 @ `faf734b`) · app-code tip **`ce2f0cc`** / prior `dpl_1P8ixpt…` · Git tip = **Final Mix Production GREEN closeout** (parent **`dcd2308`** · prior **`51a37a2`** / **`99bb10e`** / **`cee88f8`** / **`2adb569`** I.48 HISTORY) · prod last-known **`2adb569`** / `dpl_sAyrsHC…` (**I.48-A0** · Ready · **≠** Git tip) · **Final Mix GREEN criteria FROZEN** ([GO-FM-CRITERIA](./decisions/FINAL_MIX_PRODUCTION_GREEN_CRITERIA_FREEZE.md)) · **Final Mix Production GREEN: VERIFIED** ([closeout](./audits/FINAL_MIX_PRODUCTION_GREEN_CLOSEOUT.md) · frozen IN only) · **Stage J: CLOSED** · **FULL FIXTURE VERIFIED PASS** ([closeout](./audits/FINAL_MIX_FULL_FIXTURE_VERIFIED_CLOSEOUT.md) · artifact `21d98be2-…` · RIFF/WAVE · 10,584,044 B) · **Empty-session production PASS** ([closeout](./audits/STUDIO_EXPORT_EMPTY_SESSION_PRODUCTION_CLOSEOUT.md) · job `dac8ccb9-…`) · **I.18 local ON MAIN** · **IN all PASS** · **IN open:** none · **WAIVE:** Contabo always-on · bit-perfect PCM · P6.8 · prior: I.45BK/BM/BO + I.45BY `61b7cdf1-…` — **do not re-run** · I.45CV **PRODUCTION VERIFIED** (409 only) · **OUT:** full IDOR · apex · empty-project delete · Studio migration CLOSED claim · [J2](./audits/I45EX_J2_DOWNLOAD_AUTHZ_GATE_CLOSEOUT.md) · [bake freeze](./decisions/STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md) |
| **Contabo E3 worker (last-known)** | Host `vmi3622761` · persistent service **disabled/inactive** · oneshot path last-known · **≠** continuous-mode on host · **Continuous poller V1 code: IMPLEMENTED / LOCAL TESTS PASS** ([impl](./audits/CONTABO_CONTINUOUS_WORKER_V1_IMPLEMENTATION.md) · [freeze](./decisions/CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md) · OD-CWP-01…08) · Contabo sync **NOT DONE** · production deployment **NOT DONE** · host verification **NOT DONE** · canary **NOT RUN** · always-on **NOT ENABLED** · migration not applied to production · API-outside-closure **OPEN** · selective pipeline tip `@faf734b` last-known |
| **NEXT UNIT** | **STOP — OWNER DECISION REQUIRED** — SFM code **ON MAIN** through tip **`5212933`** (parent **`81c2496`**; HTTP surface **`2f7050e`**, poller **`d3c99e3`**, KIND_REJECT **`69e50d0`** = ancestry; repo migration **≠** database apply) · Contabo STUDIO poller code **IMPLEMENTED locally** · **ordered SFM GOs (independent; one GO ≠ next):** **A** this SSOT docs reconcile · **B** dedicated SFM worker host wiring (**NOT RE-VERIFIED IN THIS STAGE**; do not extend STUDIO poller) · **C** staging read-only verification · **D** migration reconcile after RO evidence · **E** staging E2E only after critical gates + separate GO · also OPEN: Contabo STUDIO GO-HOST-RO / GO-SYNC / canary / always-on · **OD-04** · **OD-SFM-ID-05** · do **not** enable SFM flag or SFM worker without GO · do **not** re-run `53398f9e-…` or `61b7cdf1-…` · Final Mix (STUDIO_EXPORT) GREEN / WAIVE / OUT **unchanged** · P6.8 independent · **≠** SFM Versions Production GREEN |
| **KNOWN WAIVER** | `e3-7-f-download-authz` / `EXPORT_WAV` · **PRE-EXISTING / OUT OF SCOPE / WAIVED BY OWNER** |
| **Fala 3.5.1 Recording Experience** | **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** @ `c690831` — [RECORDING.md](./architecture/RECORDING.md) |
| **P3 Anonymous → Account Claim** | **COMPLETE / PRODUCTION VERIFIED — GREEN** @ `dabbc936` — [RECORDING.md](./architecture/RECORDING.md) |
| **POLISH-01** | **CLOSED / PRODUCTION VERIFIED** @ `579acb3` · residual `1c63080` — [DF](./audits/POLISH-01_DESIGN_FREEZE.md) |
| **P0 PLATFORM master download deny** | **CLOSED / PRODUCTION VERIFIED** @ `fdfff71` — [closeout](./audits/P0_PLATFORM_MASTER_DOWNLOAD_DENY.md) |
| **P1 Sample Policy** | **CLOSED / PRODUCTION VERIFIED** @ `5927e35` — [matrix](./audits/P1_SAMPLE_POLICY_MATRIX.md) |
| **P2 Explicit Sample Replace** | **CLOSED / PRODUCTION VERIFIED** @ `943d81e` — [impl](./audits/P2_REPLACE_SAMPLE_IMPLEMENTATION.md) |
| **BPM / real beats** | Catalog import **CLOSED / PRODUCTION VERIFIED** (historical 17/17 · corrections) · **CONFLICT labeling UX CLOSED** @ `d12e38e` (see **BPM CONFLICT LABELING UX**) · **WAV-6 tempo OPEN / separate** (stored 65 · signal ~99–101 · unchanged) |
| **USER-FACING POLISH (historical)** | CLOSED @ `ffe723b` — **superseded living tip by POLISH-01** |
| **ADMIN USER MANAGEMENT** | W3 @ `237a86f` · W4 @ `ddcee65` · **CLOSED / PRODUCTION VERIFIED** |
| **CREATOR PROGRESS W1 / W2-A / W2-B** | PRODUCTION VERIFIED (W2-B WITH NON-BLOCKING FINDING) — still in tree |
| **USER-ID-01** | **CLOSED / PRODUCTION VERIFIED — GREEN** · reconciled after PHASE 3 cleanup · Dawid=`1` / ADMIN · next=`2` · production users=`1` |
| **PHASE 3 USER CLEANUP** | **COMPLETE / GREEN** (2026-10-08) · deleted **421** test accounts · KEEP Dawid · one-time sequence reset → next=`2` · **not** normal reuse |
| **ACCOUNT / PROFILE-01** | **PRODUCTION VERIFIED — GREEN** |
| **ARCH-04/05 orphan GC** | **CLOSED / VERIFIED** · live **11 / 8 / 3 / 0 / 0** |
| **FAR-01** | SOAK COMPLETE / CONTAMINATED · retirement NOT EXECUTED · **NOT CLOSED** |
| **DEF-01** | CLOSED / PRODUCTION VERIFIED @ `fbc696f` |
| **HIBP** | DEFERRED / ACCEPTED RISK |
| **STORAGE-ARCH-01** | LOCKED · Hybrid C |
| **STORAGE-ARCH-07 / Local Layer-2** | DESIGN FREEZE COMPLETE · **43/43 RESTORE VERIFIED** · AWS DEFERRED |
| **E3** | PRODUCTION VERIFIED — GREEN |
| **Worker** | Contabo EXTERNAL COMPUTE · persistent **disabled/inactive** · I.45DR narrow canary via transient oneshot **PASS** · pipeline tip-aligned `@faf734b` (I.45BV) · markers I.45CF (selective · ≠ full tree) · flag TRUE last-confirmed I.45DO/DR · not always-on · capability GREEN · bootstrap history `92496d4` |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| **MIGRATION HISTORY GUARDRAIL** | **ACTIVE (2026-10-15)** · registry drift is **project-wide** (audit: **43** name-matched divergent versions · **10** aligned) · SFM A–D on prod via MCP under remote `20261015…` vs local files `20261014…` · **do not assume staging schema ≡ prod** · **`supabase db push` / `migration up` / `migration repair` BLOCKED** until full alignment Owner GO · partial SFM repair **does not** unlock push · do not mix MCP apply vs CLI push without same-GO history closeout · future migrations: file → local test → **separate Owner GO apply** → verify history + objects · preserves I.27/I.28 · [CHANGELOG](./CHANGELOG.md) |

---

## 2c. Connections / infrastructure matrix (living · no secrets)

**Rule:** env var **names** only. Never paste keys, JWTs, connection strings with passwords, or SSH private material. Re-verify live status before claiming CURRENTLY VERIFIED.

| System | Purpose | How / where | Last status | Class | Forbidden without Owner GO |
|--------|---------|-------------|-------------|-------|----------------------------|
| GitHub `dawidthai125/BitRymDym` | Source of truth for `main` | `git ls-remote origin refs/heads/main` | tip = local HEAD (0/0; re-check) · reconcile merge **`4b14ac9`** | CURRENTLY VERIFIED (equality) | force-push · history rewrite · unrelated dirty sync |
| Local git worktree | Agent working copy | `C:\Users\dawid\Desktop\BitRymDym\bitrymdym` · branch `main` · HEAD = origin | dirty WIP **PRESERVE** · ahead/behind **0/0** | CURRENTLY VERIFIED | `reset --hard` · `clean` · stash of Sacred/unrelated WIP |
| Vercel Production | App hosting · aliases | Project BitRymDym · auto-deploy on `main` push (incl. docs) · `vercel inspect www.bitrymdym.pl` | last documented READY **`dpl_31mz…` @ `0a565c0`** (2026-10-19) · tip **`800f611` deploy NOT RE-VERIFIED** | LAST DOCUMENTED / NOT RE-VERIFIED | manual promote · secret rotation · claiming GREEN from Ready alone |
| Production URLs | Public site | `https://www.bitrymdym.pl` · apex `https://bitrymdym.pl` (308→www last-known) · `https://bitrymdym.vercel.app` | URLs documented · apex e2e NOT VERIFIED | LAST DOCUMENTED | treating vercel.app as canonical Auth Site URL |
| Supabase project | Auth · DB · Storage | project ref **`rzzxrgcdogkybkiidqgw`** · Dashboard / MCP read-only when authenticated | migrations registry drift ACTIVE · `db push` BLOCKED | LAST DOCUMENTED | prod `db push` · migration repair · Storage wipe · secret dump |
| Local Supabase | Dev / integration | WIP ports API **54421** · DB **54422** · shadow **54420** · Studio **54423** · Inbucket **54324** · `supabase/config.toml` may be dirty | ports remapped off Windows excluded TCP 54224–54323 | LAST DOCUMENTED (local WIP) | pointing Vitest at prod Storage · assuming API still 54321 |
| Contabo VPS | E3 EXTERNAL compute | host last-known **`vmi3622761`** · SSH last-known (RO session **2026-10-16**, not re-probed 2026-10-24): `ubuntu@161.97.72.197` · path `/opt/bitrymdym-e3-worker` · key path name `~/.ssh/bitrymdym-e3-contabo` (Owner machine; never paste key) · env file path `/etc/bitrymdym-e3-worker/worker.env` (names only in docs) · persistent systemd **disabled/inactive** · [CONTABO continuous freeze](./decisions/CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md) | sync / host verify / canary / always-on **NOT DONE** | LAST DOCUMENTED · live SSH **NOT VERIFIED** this session | enable always-on · SSH restart · claim continuous-mode · dump `worker.env` |
| Oracle / other VPS audits | Pre-purchase / capacity notes | `docs/audits/E3_*` · `infra/oracle/…` (untracked/local) | historical / prepurchase | HISTORICAL / UNKNOWN for live ops | treating audit as live provisioned host |
| Storage buckets | Durable media | beat-audio · take-audio · audio-artifacts (product) | beat-audio **17** platform · orphans **0** last-known | LAST DOCUMENTED | orphan delete without allowlist GO · prod audio egress in Cursor |
| Cron / janitor | Takes janitor | `/api/cron/takes-janitor` · schedule last-known `0 0 * * *` · `CRON_SECRET` | schedule PASS · fire NOT VERIFIED | LAST DOCUMENTED | invoking prod cron without GO · logging secret |
| Premium Retention cron | Retention worker (HOLD) | `/api/cron/premium-retention` · **not** in `vercel.json` · needs `PREMIUM_RETENTION_WORKER_JWT` | HOLD · local WIP only | NOT IMPLEMENTED on origin / NOT ACTIVATED | minting prod JWT · applying retention migrations · activating cleanup |

**Read-only verification sketch:** `git ls-remote` · `git status --short --branch` · `vercel inspect <alias>` · Supabase Dashboard SQL read-only / MCP list (no writes) · Contabo: Owner SSH only — agent must not invent access.

**Escalation:** if any connection fails or contradicts this table → mark `NOT VERIFIED`, stop mutating prod, ask Owner.

---

## 2b. Migration history — hard bans (living)

```text
db push / migration up (prod)     = BLOCKED until full local↔remote version alignment (Owner GO)
migration repair / history rewrite = BLOCKED without separate Owner GO
re-apply migration SQL            = BLOCKED
partial SFM-only repair           = does NOT unlock db push
staging schema ≠ assumed prod     = staging must be verified separately (RO GO)
SFM_VERSIONS_V1 / deploy / worker = unchanged — still require their own Owner GOs
I.27 / I.28                       = PRESERVED (no push until aligned · optional rename-to-match-prod)
Security Wave 5 (20261017140000)  = migration APPLIED in prod 2026-10-17 as 20261017193713 (MCP apply_migration, Owner GO) + verified read-only · do NOT re-apply · do NOT repair history to align versions · de65ff9 pushed with docs 1d33d3b under Owner GO → dpl_1g2NnoZGx4sZTDASfLUKbQVvWoJS READY · production finalize path NOT exercised (needs its own Owner GO) · F1-C drift (prod 20261017081616 vs repo 20261017120000) left as is · record: CHANGELOG 2026-10-17 — Security Wave 5: production migration applied
```

---

## 3. Current Phase

```text
CURRENT PHASE                 = Studio Visual Parity V2 CLOSED / GREEN @ 44f7cbd
APP FEATURE COMMIT (V2)       = 44f7cbd · GREEN / RELEASE VERIFIED / CLOSED
PRODUCTION DEPLOYMENT (last-known I.48-A0) = HISTORICAL SNAPSHOT — see §2 for current state · dpl_sAyrsHCfMVLFer669J2MgbbXbhGN · Ready · SHA 2adb569 · ≠ current Git tip · GO-A did not re-verify
  aliases (last-known · NOT e2e) = www.bitrymdym.pl · bitrymdym.vercel.app · bitrymdym.pl · apex redirect e2e NOT VERIFIED
PRODUCTION GIT SHA (last-known I.48-A0) = HISTORICAL SNAPSHOT — see §2 for current state · 2adb569 · ≠ current Git tip (GO-A / parent 50d7788) · prior f730a7a / dpl_28oH… = HISTORY (I.46-A10) · prior df37048 / dpl_7Cp2gQ9… = HISTORY
  app-code tip (last-established evidence) = HISTORICAL SNAPSHOT — see §2 for current state · ce2f0cc / dpl_1P8ixpt… (PR #5) · ≠ fresh prod verify · ≠ Git tip
  prior deploy (HISTORY)      = dpl_28oH… @ f730a7a · dpl_7Cp2gQ9… @ df37048 · dpl_9YDCy… @ faf734b · dpl_56FGH…
  V2 verify deploy (HISTORY)  = dpl_2ymzMb24QtrYxWBJWmdufeTaTqkR @ 44f7cbd (superseded for aliases)
GITHUB MAIN TIP / origin/main = HISTORICAL SNAPSHOT — see §2 for current state · this docs SSOT reconcile · parent e8d2127 (SFM A/B1/C/D+OD-06 CODE ON MAIN) · ≠ prod deploy 2adb569 · ≠ SFM_VERSIONS_V1 ON · ≠ SFM Production GREEN · local WIP may still dirty / diverge · verify remotely after fetch
CATALOG                       = GREEN · 17 PLATFORM PUBLISHED · public ↔ admin MATCH
STORAGE                       = GREEN · beat-audio 17 platform · orphans 0 · take-audio KEEP Dawid retained · test-user Storage cleaned (PHASE 3)
SECURITY                      = GREEN · Studio API 401 · studio_cas_* ACL
MOBILE                        = TECHNICALLY READY — DEVICE CERTIFICATION PENDING
P0 / P1 / P2 / P3             = 0 / 0 / 2 / 5
STUDIO VISUAL PARITY V2       = GREEN / RELEASE VERIFIED / CLOSED @ 44f7cbd
                              · follow-ups 01–04 NON-BLOCKING
                              · freeze: decisions/STUDIO_VISUAL_PARITY_V2_DESIGN_FREEZE.md
PHASE 7.1.6                   = CLOSED / PRODUCTION VERIFIED — GREEN @ 4fa658d (ancestry)
                              · feature LAND 89ee919 · correction LAND 4fa658d
                              · Persist Orchestrator · CLEAN/DIRTY/SAVING/SAVE_FAILED/CONFLICT
                              · retry 1s/3s/8s · 409 non-retryable · Zapisz teraz · beforeunload
                              · CAS completeness + wiring · migration 20261008192141 (not re-run)
                              · interactive mutations NOT SAFELY MUTATED (safety gate)
                              · closeout: audits/P7_1_6_AUTO_SAVE_CAS_PRODUCTION_CLOSEOUT.md
PHASE 7.1.5                   = CLOSED / PRODUCTION VERIFIED — GREEN @ 3fccbf7 (ancestry)
                              · feature LAND f891bce · Escape fix LAND 3fccbf7
                              · closeout: audits/P7_1_5_SHELL_POLISH_PRODUCTION_CLOSEOUT.md
P6.8                          = NOT STARTED · OWNER DECISION REQUIRED
P4 CORE                       = SHIPPED @ bface6c ⊂ 836679a
P4.6 TAKE_EXPORT              = CLOSED / GREEN @ a72fed9 (ancestry)
P4 LOCAL WIP                  = context? + p4-live-verify · NOT PRODUCTION · NOT BASELINE
SA-07                         = DESIGN FREEZE COMPLETE · AWS BLOCKED · local WIP NOT PRODUCTION
LAST STUDIO VERIFY            = Studio Visual Parity V2 GREEN @ 44f7cbd
PHASE 7.1.4 MIXER DOCK        = CLOSED / PRODUCTION GREEN @ 9abc1b6 (ancestry · do not reopen)
                              · OD-P7.1.4-01…04 = A
                              · freeze: decisions/P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md
                              · closeout: audits/P7_1_4_MIXER_DOCK_PRODUCTION_CLOSEOUT.md
PHASE 7.1.3 INSPECTOR IA      = CLOSED / PRODUCTION GREEN @ 8f6eeca · DO NOT REOPEN
P6.7 DB MIGRATIONS (prod ID)  = 20261007061035 · 20261007061049 (historical)
V1 DB MIGRATIONS (prod ID)    = 20261007080752 · 20261007080758 · 20261007080800 (historical)
P6.7 RPCs                     = studio_cas_apply_clip_fades · geometry_fades · split
V1 RPCs                       = studio_cas_apply_clip_gain_mute · duplicate · delete
P6.5 Scenario A               = PASS / PROVEN (Live Peak)
P6.5 Scenario B               = BLOCKED / INCONCLUSIVE · DO NOT REOPEN
P6.6                          = PRODUCTION VERIFIED — GREEN @ c825e42 (ancestry)
P6.7                          = PRODUCTION VERIFIED — GREEN · CLOSED @ 06c60b5 (ancestry)
V1                            = PRODUCTION VERIFIED — GREEN · CLOSED @ 56b629e (ancestry)
KNOWN WAIVER                  = e3-7-f EXPORT_WAV · PRE-EXISTING / WAIVED
KNOWN LIMITATION              = limiter IMPLEMENTATION LIMITATION · reverb synthetic IR · delay no BPM sync
                              · P5.10 TAKE preview may fail · wave4-live PRE-EXISTING / OUT-OF-SCOPE
                              · LUFS / True Peak / spectrum / AudioWorklet OUT of P6.6

STUDIO P5 (canonical table):
  P5.1 Studio foundation                 = PRODUCTION VERIFIED — GREEN
  P5.2 Transport                         = PRODUCTION VERIFIED — GREEN
  P5.3 Clip Edit Operations              = PRODUCTION VERIFIED — GREEN
  P5.4 Timeline UX & Editing Foundation  = PRODUCTION VERIFIED — GREEN
  P5.5 Recording Foundation              = PRODUCTION VERIFIED — GREEN
  P5.6 Studio Take Workflow              = PRODUCTION VERIFIED — GREEN
       finalize ≠ place                  = FROZEN
  P5.7 Architecture Audit                = GO WITH CONDITIONS (audit · not impl)
       audit                             = docs/architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md
  P5.8 Studio Devices / Input Foundation = PRODUCTION VERIFIED — GREEN @ 95e04ff
       freeze                            = docs/decisions/P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md
  P5.9 Architecture Audit                = GO WITH CONDITIONS (post–P5.8)
       audit                             = docs/architecture/P5_9_STUDIO_ARCHITECTURE_AUDIT.md
  P5.10 Studio Audio Engine / Multi-Source Playback
                                         = PRODUCTION VERIFIED — GREEN @ 9c2a958
       freeze                            = docs/decisions/P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md
  P6.1 FX persist / validation / CAS     = COMPLETE · RPC hotfix 57ef69e
  P6.2 Track FX graph                    = PRODUCTION VERIFIED — GREEN @ 23d3be8
  P6.3 Master FX graph                    = PRODUCTION VERIFIED — GREEN @ 350303e
  P6.4.1 Master Gain/Pan + Track docVer   = PRODUCTION VERIFIED — GREEN @ 9f93606
  P6.4.2 Shared FX UI Foundation          = PRODUCTION VERIFIED — GREEN @ 320907a
  P6.4.3 Mix UX polish & integration      = PRODUCTION VERIFIED — GREEN @ f261ea8
  P6.5 Studio Audio Quality Metering
                                         = IMPLEMENTATION COMPLETE · PRODUCTION DEPLOYED @ 2258bdb
                                         · SCENARIO A PROVEN · SCENARIO B BLOCKED / INCONCLUSIVE
                                         · DO NOT REOPEN Scenario B · not reclassified as GREEN
       freeze                            = docs/decisions/P6_5_STUDIO_AUDIO_QUALITY_METERING_DESIGN_FREEZE.md
       audit                             = docs/architecture/P6_5_STUDIO_AUDIO_QUALITY_METERING_ARCHITECTURE_AUDIT.md
  P6.6 On-demand Track Peak Metering
                                         = PRODUCTION VERIFIED — GREEN @ c825e42
                                         · P6.6.1 a8a3337 · P6.6.2/3 c825e42
                                         · dpl dpl_3s3fAnvrpNVSwJcdhV8J1SZtc9g9
       freeze                            = docs/decisions/P6_6_STUDIO_TRACK_METERING_DESIGN_FREEZE.md
       audit                             = docs/architecture/P6_6_STUDIO_ARCHITECTURE_AUDIT.md
  P6.7 Clip Fades                        = PRODUCTION VERIFIED — GREEN @ 06c60b5 · CLOSED
       freeze                            = docs/decisions/P6_7_CLIP_FADES_DESIGN_FREEZE.md
       audit                             = docs/architecture/P6_7_CLIP_FADES_ARCHITECTURE_AUDIT.md
  Phase 7.1.3 Inspector IA               = CLOSED / PRODUCTION GREEN @ 8f6eeca
  Phase 7.1.4 Mixer Dock                 = CLOSED / PRODUCTION GREEN @ 9abc1b6 (ancestry)
       freeze                            = docs/decisions/P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md
       closeout                          = docs/audits/P7_1_4_MIXER_DOCK_PRODUCTION_CLOSEOUT.md
  Phase 7.1.6 Auto Save + CAS            = CLOSED / PRODUCTION GREEN @ 4fa658d
       closeout                          = docs/audits/P7_1_6_AUTO_SAVE_CAS_PRODUCTION_CLOSEOUT.md
  Phase 7.1.5 Shell Polish + Escape      = CLOSED / PRODUCTION GREEN @ 3fccbf7 (ancestry)
       closeout                          = docs/audits/P7_1_5_SHELL_POLISH_PRODUCTION_CLOSEOUT.md
  POST-RECORDING V1                      = PRODUCTION VERIFIED — GREEN · CLOSED @ 56b629e
       gate                              = docs/audits/POST_RECORDING_EDITING_VOCAL_PRODUCTION_V1_PRODUCTION_GATE.md
  D02 live harness                       = CLOSED @ 44dc22c · TEST ONLY

FALA 3.5.1                    = CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN @ c690831
P3                            = COMPLETE / PRODUCTION VERIFIED — GREEN @ dabbc936 · UNCHANGED
  Follow-up                   = p_take_id hardening · NON-BLOCKING
POLISH-01                     = CLOSED / PRODUCTION VERIFIED
P0 / P1 / P2 (recording security track) = CLOSED / PRODUCTION VERIFIED · UNCHANGED
BPM                           = CLOSED / PRODUCTION VERIFIED
ARCH-05                       = CLOSED / VERIFIED · live 11/8/3/0/0
ADMIN W0–W4                   = CLOSED / PRODUCTION VERIFIED
USER-ID-01                    = CLOSED / PRODUCTION VERIFIED — GREEN
  production users / profiles = 1 / 1
  Owner                       = Dawid · ADMIN · user_number 1 · UUID fdf04726-e971-42a7-9d46-8b9bdd099c23
  next registration           = user_number 2 (seq last_value=1 / is_called=true)
  PHASE 3 cleanup             = COMPLETE / GREEN · 421 deleted · one-time Owner setval · normal DELETE ≠ reuse

LOCAL WINDOWS Layer-2         = C:\BitRymDym-Backup\
  full backup                 = local-layer2-full-20261005T040146Z-42d6212b · 43/43
  restore drill               = local-restore-20261005T040831Z-76ca3678 · 43/43 PASS
VPS Layer-1                   = 43/43 BACKED UP · Contabo ≠ durable SSOT
AWS Object Lock               = DEFERRED

CURRENT                       = Studio Visual Parity V2 CLOSED / GREEN @ 44f7cbd
                              · Git tip = Final Mix Production GREEN closeout · parent dcd2308 · prior 51a37a2 / 99bb10e / cee88f8 / 2adb569 = HISTORY
                              · Final Mix GREEN criteria FROZEN · decisions/FINAL_MIX_PRODUCTION_GREEN_CRITERIA_FREEZE.md
                              · Final Mix Production GREEN: VERIFIED · audits/FINAL_MIX_PRODUCTION_GREEN_CLOSEOUT.md (frozen IN only)
                              · Stage J: CLOSED · audits/STAGE_J_FINAL_CLOSURE.md
                              · FULL FIXTURE VERIFIED PASS · audits/FINAL_MIX_FULL_FIXTURE_VERIFIED_CLOSEOUT.md (artifact 21d98be2-…)
                              · Empty-session production gate PASS · audits/STUDIO_EXPORT_EMPTY_SESSION_PRODUCTION_CLOSEOUT.md
                              · I.18 local evidence ON MAIN · audits/STUDIO_EXPORT_I18_EMPTY_SESSION_INTEGRATION.md
                              · IN all PASS: Stage J · I.45DR · J2 · object_key · P5/P6 JSON · I.18 tip · empty-session prod · FULL FIXTURE
                              · IN open blockers: none
                              · WAIVE for GREEN: Contabo always-on · bit-perfect PCM · P6.8
                              · OUT: full IDOR · apex · empty-project delete · Studio migration CLOSED claim
                              · I.13F tip MISSING ON MAIN (≠ automatic GREEN IN)
                              · prod last-known dpl_sAyrsHC… @ 2adb569 (I.48-A0 · Ready · ≠ Git tip)
                              · aliases www + bitrymdym.vercel.app + bitrymdym.pl last-known · apex redirect e2e NOT VERIFIED
                              · app-code tip ce2f0cc · GREEN ≠ Contabo always-on / bit-perfect / P6.8 / OUT
                              · STUDIO_EXPORT app DEPLOYED · persistent Contabo disabled/inactive
                              · 7.1.6 / 7.1.5 / 7.1.4 / 7.1.3 / P4.6 / Checkbox / List UX / V1 / P6.7 CLOSED / GREEN
NEXT GATE                     = STOP — OWNER DECISION REQUIRED
                              · Contabo continuous poller V1 IMPLEMENTED / LOCAL TESTS PASS · audits/CONTABO_CONTINUOUS_WORKER_V1_IMPLEMENTATION.md
                              · Contabo sync NOT DONE · production deployment NOT DONE · host verification NOT DONE · canary NOT RUN · always-on NOT ENABLED
                              · NEXT = GO-HOST-RO-CONTABO · GO-SYNC · canary · always-on · prod migration apply
                              · Final Mix Production GREEN VERIFIED (frozen IN) · P6.8 / OUT independent
                              · do NOT expand GREEN to WAIVE/OUT claims
                              · do NOT auto-enable Contabo poller / always-on
                              · do NOT re-run SUCCEEDED jobs 53398f9e… or 61b7cdf1…
                              · do NOT land dirty I.13F without dedicated GO · do NOT invent evidence from code
                              · P6.8 NOT STARTED · Contabo always-on WAIVED for GREEN (Ops GO separate)
                              · markers I.45CF done · DEPLOYED_COMMIT = reference tip not full-tree
                              · V2 follow-ups NON-BLOCKING · do NOT auto-open EPIC / payments
                              · do NOT reopen V2 / 7.1.6 / 7.1.5 / 7.1.4 / 7.1.3 / V1 / P6.7 / P6.6 / P6.5 Scenario B / P4.6
                              · do NOT permanently enable Contabo / claim continuous-mode without Owner GO
                              · do NOT re-run SUCCEEDED jobs 53398f9e… or 61b7cdf1…
                              · do NOT claim Contabo full-tree = tip · API-outside-closure drift remains OPEN
                              · do NOT claim empty-project delete PRODUCTION VERIFIED (I.45CV out of scope)
                              · do NOT commit P4 local seam / SA-07 untracked / Sacred WIP without Owner GO
                              · do NOT invent Phase 7.1.7 scope without Owner GO
P6.7 ARCHITECTURE AUDIT       = GO WITH CONDITIONS (historical) · CLOSED BY FREEZE+IMPL
P6.7 DESIGN FREEZE            = GO (historical) · living status GREEN
P6.7 IMPLEMENTATION           = COMPLETE · PRODUCTION VERIFIED — GREEN
V1 IMPLEMENTATION             = COMPLETE · PRODUCTION VERIFIED — GREEN · CLOSED

CREATOR PROGRESS W2-B         = PRODUCTION VERIFIED WITH NON-BLOCKING FINDING @ d86b4df
  P2-2 / P2-3 / P2-4 (W2-B debt) = OPEN
  Mix / Render live           = DEFERRED
OD-04 / OD-07                 = OPEN (payments / Premium prices)
FAR-01                        = NOT CLOSED (ops contaminated soak — not product NEXT)
```

### 3.1 Architecture living lock

```text
Durable media                = Supabase Storage (beat-audio · take-audio · audio-artifacts)
Metadata SSOT                = Supabase PostgreSQL
Application                  = Vercel / Next.js
EXTERNAL COMPUTE             = Contabo VPS (FFmpeg ephemeral) · persistent disabled/inactive (I.45BW/DR) · I.45DR transient canary PASS · not always-on
Role ≠ Account Level ≠ Creator Rank ≠ Premium Tier
Premium SSOT                 = resolveProductEntitlement + PREMIUM_TIER_MATRIX
Sample Policy SSOT           = getSamplePolicy + SAMPLE_POLICY_DEFAULTS + sample_policy_settings
P3 claim TTL/cap             = Premium Tier via getSamplePolicy (NOT Account Level)
UI labels SSOT               = src/lib/ui/labels.ts (+ status-labels re-export)

Studio audio boundary        = StudioTransport != PlayerProvider
                             = StudioAudioEngine != PlayerProvider
                             = StudioAudioEngine != E3 Mix product graph
P5.10 Studio playback        = StudioTransport → StudioAudioEngine
                             · one engine per Studio editor
                             · AudioContext + Track Node + Master Node
                             · scheduler planVoicesAtPlayhead (all audible Clips)
                             · overlap = MIX (first-wins removed from transport path)
                             · persist/UI clock = integer ms
                             · runtime clock = AudioContext.currentTime + epoch
                             · STOP = playhead 0 (existing FSM)
                             · mix SSOT = Web Audio graph (not HTMLAudioElement.volume)
                             · gainDbToLinearVolume · isTrackAudible · normalizePan
P5.8 Device / Input          = enumerateDevices · permission states · selectedDeviceId
                             · localStorage bitrymdym.studio.selectedAudioInputDeviceId
                             · devicechange recording-safe · ideal deviceId + stale fallback
                             · useMicAnalyser → BrdInputMonitor (no second analyser)
                             · Device state ≠ recording state · UNCHANGED in P5.10
P6 product FX / Mix / Master = P6.1–P6.4.3 PRODUCTION VERIFIED — GREEN
                             · P6.5 Master metering SHIPPED @ 2258bdb
                             · P6.5 Scenario A PROVEN · Scenario B BLOCKED / INCONCLUSIVE
                             · P6.6 On-demand Track Peak PRODUCTION VERIFIED — GREEN @ c825e42
                             · P6.7 Clip Fades PRODUCTION VERIFIED — GREEN @ 06c60b5 · CLOSED
                             · POST-RECORDING V1 PRODUCTION VERIFIED — GREEN @ 56b629e · CLOSED
                             · topology: Track Pan → 0|1 Track Analyser → Σ → … → Master Analyser
                             · engine foundation EXISTS (P5.10 GREEN)
                             · Automation / Autotune = NOT READY
                             · P6.7 = Clip GainNode fades · set_fades CAS · Trim/Split inherit
                             · V1 = Clip Gain/Mute · Duplicate · CAS Move/Delete · ClipEditPanel
                             · next = STOP (do not start P6.8 · Owner decides)
P7 creative tracks           = track enum reserved READY WITH REFACTOR
                             · capabilities + additive source kinds before expansion
                             · instrument engines = NOT READY
E3 Mix graph                 = beat Mix/Master product path — isolated from Studio engine
                             · two Web Audio product surfaces OK (not two Studio engines)
Studio ARTIFACT playback     = adapter stub / unavailable (non-blocking)
Studio document_version      = column exists · Phase 7.1.6 Auto Save + CAS Completeness CLOSED / GREEN @ 4fa658d
Track capabilities           = future Track Type + Capabilities (P5.7 H1) · not implemented
```

### 3.1d P5.10 production gate (final)

```text
StudioAudioEngine exists / one engine per editor / AudioContext     = PASS
Multi-source scheduler (Beat+Take / Take+Take / Beat+many Takes)    = PASS (unit)
Overlap = mix · pickTakeClipAtPlayhead not on transport path        = PASS
Shared clock PLAY/PAUSE/STOP/SEEK · STOP playhead 0                 = PASS
Track/Master graph · gain/mute/solo/pan in graph                    = PASS
PlayerProvider isolation · E3 Mix isolation · recording unchanged   = PASS
Served JS 0p8mql3sjqfx_.js contains StudioAudioEngine               = PASS
Cache: Skipping build cache · SHA = GitHub commit = served bundle   = PASS
typecheck PASS · P5.10 lint PASS · build PASS · 187 unit (P5.10=19) = PASS

KNOWN VERIFICATION LIMITATION:
  Production Beat PLAY/PAUSE/STOP worked (playhead advanced; STOP → 00:00.000)
  One parallel TAKE fixture returned "Nie udało się odtworzyć nagrania"
  Beat continued (fail-closed). Live overlap of two healthy Takes A+B
  was not executed on that fixture. Scheduling/mix covered by unit tests.
  Not a P5.10 blocker — Production Gate formally GREEN.

Security:
  Engine has no ownerId / objectKey
  Beat URLs = requestBeatAudioAccessAction
  Take URLs = POST /api/takes/preview
  Live IDOR was not rerun in this gate (inherited P3/P4/P5 boundaries)
```

### 3.1e P5.10 deployment / cache protection (release note)

```text
Production SHA        = 9c2a958
Canonical deploy      = dpl_L7pB5A8iuY8CKipxbLsGEVLESZTC
GitHub clone          = Commit 9c2a958
Build                 = Skipping build cache (16.4s compile)
HTML                  = no-store / MISS
Served chunk          = 0p8mql3sjqfx_.js
  YES = StudioAudioEngine · AUDIO_SYNC_FAILED · createMediaElementSource · createStereoPanner
  NO  = pickTakeClipAtPlayhead · takeAudioRef
Lesson (P5.8 regression protection) = verify served artifact, not only SHA/Ready
```

### 3.1b P5.8 production gate (final)

```text
Device discovery / Permissions / Default / Explicit selection = PASS
localStorage / Stale fallback / devicechange                  = PASS
Recording + device change / Input monitor                     = PASS
P5.5 recording regression / finalize ≠ place                  = PASS
Security / Privacy / Mobile 390×844 / PlayerProvider          = PASS
P3 / P4 / P5.1–P5.6 / D02 / automated regression              = PASS

Physical permission Deny/Blocked = NOT TESTABLE IN CURRENT ENVIRONMENT (not FAIL)
Physical hot-plug                = NOT TESTABLE IN CURRENT ENVIRONMENT (not FAIL)
```

### 3.1c P5.8 deployment / build-cache incident (release note)

```text
Initial deploy claimed SHA 95e04ff but served pre-P5.8 Studio device JS
Root cause = stale Vercel build cache (from docs-only 67f4b4e)
Recovery   = redeploy without build cache
Final dpl  = dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S
Lesson     = Production Gate must verify served artifact for critical UI changes
             (not only deployment SHA / Ready status)
Type       = deployment/build-cache incident · NOT an application source bug
```

### 3.2 Backup / recovery separation (living)

```text
DATABASE RECOVERY:
  Historical local PostgreSQL dump EXISTS
  Path: C:\BitRymDym-recovery\bitrymdym-production-pre-account-profile-01.dump
  Excludes: Storage object bytes
  Restore: NOT VERIFIED
  SSOT: docs/audits/HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md

STORAGE DISASTER RECOVERY:
  VPS Layer-1 = 43/43 BACKED UP
  Local Windows Layer-2 = 43/43 RESTORE VERIFIED
    backup id  = local-layer2-full-20261005T040146Z-42d6212b
    restore id = local-restore-20261005T040831Z-76ca3678
  AWS Object Lock = DEFERRED
  ARCH-05 = CLOSED / VERIFIED · live Storage 11 (USER 8 · PLATFORM 3 · ORPHAN 0)
  Local/VPS retained evidence = 43/43 (incl. 32 deleted orphans)
  Backup ≠ Storage SSOT ≠ VPS
```

---

## 4. CLOSED / OPEN / DEFERRED / WAIVED

### CLOSED / PRODUCTION VERIFIED (selected)

- **P5.10** Studio Audio Engine / Multi-Source Playback @ `9c2a958` — **PRODUCTION VERIFIED — GREEN** · dpl `dpl_L7pB5A8iuY8CKipxbLsGEVLESZTC`
- **P5.8** Studio Devices / Input Foundation @ `95e04ff` — **PRODUCTION VERIFIED — GREEN** · dpl `dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S`
- **P5.1–P5.6** Studio foundation → Take Workflow — **PRODUCTION VERIFIED — GREEN**
- **D02** live harness — **CLOSED** @ `44dc22c` (**TEST ONLY**)
- **P5.9** Architecture Audit — **COMPLETE · GO WITH CONDITIONS** (audit · not impl)
- **P5.7** Architecture Audit — **COMPLETE · GO WITH CONDITIONS** (audit · not impl)
- **P3** Anonymous → Account Claim @ `dabbc936`
- POLISH-01 (+ residual `1c63080`)
- P0 PLATFORM master download deny
- P1 Sample Policy
- P2 Explicit Sample Replace
- BPM / real beats
- Recording Waves 1–5 / D02 (product decision; harness debt closed separately @ `44dc22c`)
- ADMIN W0–W4
- USER-ID-01 · ACCOUNT/PROFILE-01
- ARCH-05
- E3 (GREEN; HQ/WAV assert waived separately)
- USER-FACING POLISH @ `ffe723b` (historical tip)

### OPEN

- **No authorized next Studio product unit** — Studio Visual Parity V2 CLOSED / GREEN @ `44f7cbd` · **STOP — OWNER DECISION REQUIRED** · V2 follow-ups NON-BLOCKING · **P6.8 NOT STARTED / OWNER DECISION**
- **RCA-02 Studio waveform / media (FOLLOW-UP 01):** **HISTORICAL ISSUE NOT REPRODUCED** on local project `d07f3011-…` · root cause **NOT ESTABLISHED** · not a global RCA close · [RCA_02_STUDIO_WAVEFORM_MEDIA.md](./audits/RCA_02_STUDIO_WAVEFORM_MEDIA.md)
- OD-04 / OD-07 (payments / Premium prices)
- W2-B debt P2-2 / P2-3 / P2-4
- FAR-01 closeout / retirement (ops)
- OD-09 / OD-15 / OD-16 and other long-horizon OPEN decisions
- **P3 follow-up:** `p_take_id` hardening — **NON-BLOCKING** (not a product gate)
- P5.7 conditions still tracked: H1 capabilities before P7 track expansion · H2 Auto Save / `document_version` contract **SHIPPED** via Phase 7.1.6 (H4 product FX foundation **SHIPPED** through P6.4–P6.7)

### DEFERRED

- Messaging · comments · voting · payments · Premium catalog product · STEMS
- External Object Storage
- Artifact janitor · Gold 90d PRODUCTION · Mix/Render live E2E (W2-B deferred)
- AWS immutable DR

### KNOWN WAIVERS

| Item | Status |
|------|--------|
| `e3-7-f-download-authz` · `EXPORT_WAV` | PRE-EXISTING / OUT OF SCOPE / **WAIVED BY OWNER** |

---

## 4A. I.47 Session Closure (2026-10-12) — HISTORY

```text
SESSION                       = I.47 — documentation-only session closure + cold-start handoff
DONE (I.46 chain)             = PR #10 merged @ 522e514 (J2 docs closeout)
                              · PR #11 merged @ f730a7a (docs SSOT tip/plane · six docs files)
                              · I.46-A10 production deploy confirm: dpl_28oH… Ready @ f730a7a
                              · aliases www + bitrymdym.vercel.app + bitrymdym.pl assigned (I.46-A10)
NOT VERIFIED / NOT CLAIMED    = apex redirect e2e · functional app GREEN · Final Mix GREEN
                              · Contabo always-on · P6.8 · object_key live probe · Stage J full close
GATES (unchanged semantics)   = J2 PASS/CLOSED · Stage J OPEN · Final Mix NOT VERIFIED/NOT GREEN
                              · P6.8 NOT STARTED · object_key live probe NOT EXECUTED
                              · Contabo always-on OPEN/NOT VERIFIED · apex redirect e2e NOT VERIFIED
SAFE NEXT START               = Owner GO on remaining Stage J / Final Mix gates vs P6.8
                              · use FINAL_COLD_START §12 MASTER PROMPTS · isolated worktree · no dirty-main sync
I.47 SCOPE                    = docs only · no code · no HTTP · no Contabo · no deploy · no commit without GO
NOTE (post-I.48)              = PR #12 later merged I.47 docs onto main as tip 2adb569 · living tip/deploy rows superseded by §4B
```

## 4B. I.48 Tip/Plane Reconcile (2026-10-13)

```text
SESSION                       = I.48 — docs-only tip/plane reconcile after PR #12 (isolated worktree)
GITHUB MAIN TIP               = 2adb569 (PR #12 · Merge docs/i47-session-closure-handoff)
PRODUCTION DEPLOY (I.48-A0)   = dpl_sAyrsHCfMVLFer669J2MgbbXbhGN · Ready · SHA 2adb569
                              · I.48-A2/A3 do NOT re-verify · Ready ≠ functional GREEN ≠ Final Mix GREEN
PRIOR TIP/DEPLOY (HISTORY)    = f730a7a / dpl_28oH… (I.46-A10 / I.47 snapshot)
APP-CODE TIP                  = ce2f0cc (unchanged · last-established evidence)
GATES (unchanged)             = J2 PASS/CLOSED · Stage J OPEN · Final Mix NOT VERIFIED/NOT GREEN
                              · P6.8 NOT STARTED · object_key live probe NOT EXECUTED
                              · Contabo always-on OPEN/NOT VERIFIED · apex redirect e2e NOT VERIFIED
                              · Empty-session Production NOT VERIFIED · FX/PCM parity NOT VERIFIED
                              · Empty-project delete NOT VERIFIED
I.48 SCOPE                    = docs allowlist only · no code · no commit/push/PR/deploy in A3 · no dirty-main sync
```

## 4C. object_key reject-only live probe (2026-10-13)

```text
SESSION                       = Stage J object_key reject-only documentation closeout
EVIDENCE                      = Owner-supplied session reports (not committed repo artifacts)
                              · Owner A: P1, P2 (21 keys alone), P8, P9 — report 24/24 PASS
                              · P4 unauthenticated — PASS · HTTP 403
                              · P3 Other B user_number 469 · object_key=x — PASS · HTTP 403
                                · message includes "Client must not supply object_key as render source."
                                · hasUrl=false · single GET only
object_key reject-only (tested scope) = PASS — P1–P4, P8–P9
P5 / P6                       = NOT EXECUTED / OUT OF SCOPE
FIXTURE VERIFIED              = NOT CONFIRMED
J2 Download AuthZ             = PASS / CLOSED (separate gate · I.45EX-A16/A17/A18)
Stage J                       = OPEN
Full Final Mix Production GREEN = NOT VERIFIED
P6.8 / Contabo always-on      = unchanged (NOT STARTED · OPEN / NOT VERIFIED)
CLOSEOUT                      = audits/STAGE_J_OBJECT_KEY_REJECT_ONLY_PROBE_CLOSEOUT.md
NOTE                          = ≠ owner happy-path download · ≠ full fixture · ≠ Stage J close · ≠ Final Mix GREEN
                              · I.47/I.48 history rows above remain true for those sessions
```

## 4D. GO-A Stage J docs integrity (2026-10-13) — A2

```text
SESSION                       = Stage J docs integrity · tip/plane reconcile + evidence-link hygiene (A2)
GIT TIP                       = this GO-A commit · parent 50d7788 · prior d69a5fe / 2adb569 = HISTORY
PROD DEPLOY                   = last-known I.48-A0 dpl_sAyrsHC… @ 2adb569 · ≠ Git tip · no fresh verify
object_key reject-only        = PASS (unchanged · bake freeze living row aligned)
P5/P6 / FIXTURE / Stage J / Final Mix GREEN / P6.8 / Contabo always-on = unchanged
I.18 / I.13F files on main    = MISSING ON CURRENT MAIN
                              · HISTORICAL LOCAL EVIDENCE — NOT COMMITTED (dirty local ?? only)
                              · do NOT treat broken tip links as available evidence
A2 CHOICE                     = rewrite living refs · do NOT land dirty I.18/I.13F files
SCOPE                         = docs only · no code · no prod HTTP · no Contabo · no P5/P6
```

## 4E. P5/P6 owner download probe (2026-10-13)

```text
SESSION                       = Stage J P5/P6 owner download probe documentation closeout
EVIDENCE                      = prior probe session report (not re-executed in this docs unit)
ARTIFACT                      = c596e7bc-a031-4df8-a17b-31c4fd2cce8b
HISTORICAL JOB                = 61b7cdf1-0dfa-41aa-a493-e4f438d09131 — not re-run
P5                            = PASS — GET …/download · HTTP 200 · success=true · qualityTier=WAV · hasUrl=true
P6                            = PASS — GET …/download?foo=1 · HTTP 200 · same functional shape · hasUrl=true
SCOPE LIMIT                   = endpoint JSON response only · ≠ WAV byte download · ≠ signed URL open
FULL FIXTURE VERIFIED         = NOT CONFIRMED
object_key reject-only        = PASS — separate prior scope (do not merge)
J2 Download AuthZ             = PASS / CLOSED (separate gate)
Stage J                       = OPEN
Full Final Mix Production GREEN = NOT VERIFIED
P6.8 / Contabo always-on      = unchanged (NOT STARTED · OPEN / NOT VERIFIED)
CLOSEOUT                      = audits/STAGE_J_P5_P6_OWNER_DOWNLOAD_PROBE_CLOSEOUT.md
```

## 4F. Stage J closure criteria freeze (GO-SJ-CRITERIA · 2026-10-13) — HISTORY

```text
SESSION                       = GO-SJ-CRITERIA — freeze Stage J CLOSED allowlist (docs only)
DECISION                      = decisions/STAGE_J_CLOSURE_CRITERIA_FREEZE.md
HISTORICAL Stage J at freeze  = OPEN (criteria frozen · closeout = separate GO — now applied in §4G)
IN (required for Stage J CLOSED) — all documented PASS at freeze time
  · I.45DR · J2 · object_key · P5 JSON · P6 JSON
WAIVE                         = byte-level WAV/RIFF for c596e7bc-… · ≠ FULL FIXTURE VERIFIED
OUT                           = empty-session prod · always-on · P6.8 · full PCM · Final Mix GREEN · full IDOR · apex · empty-project delete
APPLIED BY                    = GO-SJ-DOCS-CLOSE · audits/STAGE_J_FINAL_CLOSURE.md · living Stage J = CLOSED (§4G)
```

## 4G. Stage J final closure (GO-SJ-DOCS-CLOSE · 2026-10-13)

```text
SESSION                       = GO-SJ-DOCS-CLOSE — Stage J evidence-gate closeout (docs only)
CLOSEOUT                      = audits/STAGE_J_FINAL_CLOSURE.md
CRITERIA                      = decisions/STAGE_J_CLOSURE_CRITERIA_FREEZE.md
Stage J                       = CLOSED
IN (satisfied · not re-probed)
  · I.45DR narrow Contabo WAV canary = PASS
  · J2 Download AuthZ = PASS / CLOSED
  · object_key reject-only (narrow) = PASS
  · P5 owner download endpoint = PASS (JSON only)
  · P6 owner download ?foo=1 = PASS (JSON only)
WAIVE                         = byte-level WAV/RIFF for c596e7bc-a031-4df8-a17b-31c4fd2cce8b (Stage J WAIVE · ≠ Final Mix gate #7)
FULL FIXTURE VERIFIED         = PASS (after Stage J · audits/FINAL_MIX_FULL_FIXTURE_VERIFIED_CLOSEOUT.md · artifact 21d98be2-…)
Final Mix Production GREEN    = VERIFIED (after Stage J · audits/FINAL_MIX_PRODUCTION_GREEN_CLOSEOUT.md · frozen IN only · ≠ Contabo always-on / bit-perfect / P6.8 / OUT)
OUT (independent statuses · living)
  · empty-session production probe = PASS (after Stage J close · audits/STUDIO_EXPORT_EMPTY_SESSION_PRODUCTION_CLOSEOUT.md)
  · Contabo always-on / persistent worker = OPEN / NOT VERIFIED · disabled/inactive
  · P6.8 = NOT STARTED
  · full Live↔Offline PCM = NOT full parity
  · Final Mix Production GREEN = NOT VERIFIED
  · full IDOR beyond J2 = NOT CLAIMED
  · apex redirect e2e = NOT VERIFIED
  · empty-project delete = NOT TESTED / NOT VERIFIED
SCOPE                         = docs only · no prod HTTP · no WAV · no Contabo · no app code
NEXT                          = Owner GO — Final Mix Production GREEN docs closeout / Contabo Ops / P6.8 · ≠ claim GREEN from Stage J or FULL FIXTURE alone
```

## 4H. Final Mix Production GREEN criteria freeze (GO-FM-CRITERIA · 2026-10-13)

```text
SESSION                       = GO-FM-CRITERIA — freeze Final Mix Production GREEN allowlist (docs only)
DECISION                      = decisions/FINAL_MIX_PRODUCTION_GREEN_CRITERIA_FREEZE.md
Final Mix Production GREEN    = VERIFIED (living · after GREEN closeout §4I · frozen IN only)
IN already satisfied (historical · do not re-run)
  · Stage J CLOSED
  · I.45DR PASS
  · J2 PASS / CLOSED
  · object_key reject-only PASS
  · P5/P6 JSON PASS (≠ WAV bytes · ≠ FULL FIXTURE VERIFIED)
IN satisfied since GO-LAND-I18-PUBLISH (tip)
  · I.18 tip evidence = ON MAIN · audits/STUDIO_EXPORT_I18_EMPTY_SESSION_INTEGRATION.md (historical local PASS 2026-10-10)
IN satisfied — empty-session production closeout
  · I.18 empty-session production probe = PASS · audits/STUDIO_EXPORT_EMPTY_SESSION_PRODUCTION_CLOSEOUT.md · job dac8ccb9-…
IN satisfied — FULL FIXTURE VERIFIED closeout
  · FULL FIXTURE VERIFIED = PASS · audits/FINAL_MIX_FULL_FIXTURE_VERIFIED_CLOSEOUT.md · artifact 21d98be2-…
IN open blockers
  · none (all IN PASS under freeze)
GREEN closeout applied
  · Final Mix Production GREEN = VERIFIED · audits/FINAL_MIX_PRODUCTION_GREEN_CLOSEOUT.md · frozen IN only
WAIVE (not required for GREEN · unchanged)
  · Contabo always-on / persistent worker (Ops GO separate · remains disabled/inactive)
  · bit-perfect Live↔Offline PCM (I.14-01 functional stands)
  · P6.8 / independent epics
OUT (independent · unchanged)
  · full IDOR beyond J2
  · apex redirect e2e
  · empty-project delete
  · Studio migration CLOSED claim
I.13F tip evidence            = MISSING ON CURRENT MAIN · ≠ automatic GREEN IN
NOTE                          = GREEN = frozen IN allowlist only · ≠ Contabo always-on · ≠ bit-perfect PCM · ≠ P6.8 · ≠ OUT
NEXT                          = Owner decision — Contabo Ops / P6.8 / OUT items · do not expand GREEN scope
```

## 4I. Final Mix Production GREEN closeout (GO-FINAL-MIX-PRODUCTION-GREEN-CLOSEOUT · 2026-10-13)

```text
SESSION                       = GO-FINAL-MIX-PRODUCTION-GREEN-CLOSEOUT — docs-only GREEN living claim
CLOSEOUT                      = audits/FINAL_MIX_PRODUCTION_GREEN_CLOSEOUT.md
CRITERIA                      = decisions/FINAL_MIX_PRODUCTION_GREEN_CRITERIA_FREEZE.md
PREFLIGHT TIP                 = dcd23080e1adbc951f0c1b58224bcf24248860b8 (FULL FIXTURE VERIFIED)
Final Mix Production GREEN    = VERIFIED (frozen IN only)
IN                            = all PASS (Stage J · I.45DR · J2 · object_key · P5/P6 · empty-session prod · FULL FIXTURE · I.18 tip)
WAIVE / OUT                   = unchanged
SCOPE                         = docs only · no prod HTTP · no Contabo · no WAV · no app code
```

## 5. Next Session Entry

```text
NEXT SESSION ENTRY = Read FINAL_COLD_START_HANDOFF.md
                 → MASTER_HANDOFF.md / this PROJECT_STATE
                 → Confirm GitHub main tip / origin/main = Final Mix Production GREEN closeout tip (parent dcd2308 · verify remotely after fetch)
                 → Confirm Final Mix GREEN criteria FROZEN · decisions/FINAL_MIX_PRODUCTION_GREEN_CRITERIA_FREEZE.md
                 → Confirm Final Mix Production GREEN = VERIFIED · audits/FINAL_MIX_PRODUCTION_GREEN_CLOSEOUT.md (frozen IN only)
                 → Confirm Stage J: CLOSED · audits/STAGE_J_FINAL_CLOSURE.md
                 → Confirm FULL FIXTURE VERIFIED PASS · audits/FINAL_MIX_FULL_FIXTURE_VERIFIED_CLOSEOUT.md
                 → Confirm empty-session production gate PASS · audits/STUDIO_EXPORT_EMPTY_SESSION_PRODUCTION_CLOSEOUT.md
                 → Confirm I.18 local evidence ON MAIN · audits/STUDIO_EXPORT_I18_EMPTY_SESSION_INTEGRATION.md
                 → Confirm IN open blockers: none
                 → Confirm WAIVE: Contabo always-on · bit-perfect PCM · P6.8 (do NOT claim as GREEN side effects)
                 → OUT keep independent: full IDOR · apex · empty-project delete · Studio migration CLOSED claim
                 → Treat I.13F evidence path as MISSING ON CURRENT MAIN (do NOT land dirty copy without dedicated GO)
                 → Treat prod dpl_sAyrsHCfMVLFer669J2MgbbXbhGN @ SHA 2adb569 as last-known I.48-A0 (Ready) · ≠ Git tip
                 → Treat prior dpl_28oH… @ f730a7a as HISTORY (I.46-A10 / I.47)
                 → Treat aliases www + bitrymdym.vercel.app + bitrymdym.pl as last-known (I.48-A0) · apex redirect e2e NOT VERIFIED
                 → Confirm app-code tip ce2f0cc / prior dpl_1P8ixpt… = last-established in available evidence (≠ Git tip · ≠ fresh prod verify)
                 → Read FINAL_COLD_START §12 MASTER PROMPTS for ChatGPT / Cursor cold-start
                 → Do NOT sync/clean dirty local main (Sacred WIP protected · last-known large WIP)
                 → Confirm APP FEATURE COMMIT (V2) = 44f7cbd · GREEN / RELEASE VERIFIED / CLOSED
                 → Confirm V2 verify history dpl_2ymz… @ 44f7cbd (not live alias)
                 → Confirm V2 follow-ups 01–04 = NON-BLOCKING (do not auto-implement)
                 → Confirm Sacred WIP SHA256 = 5AE4C2311704DCDAE51CE36D8E69E1CA162F0C55AB14866EB30E73DC50EEECB9
                 → Read architecture/REUSE_SSOT_MAP.md before any Studio/audio/persist change
                 → Confirm Phase 7.1.6 / 7.1.5 / 7.1.4 / 7.1.3 remain CLOSED (do not reopen)
                 → Confirm Catalog 17 · Storage orphans 0 · Security GREEN
                 → Confirm Mobile = TECHNICALLY READY — DEVICE CERTIFICATION PENDING
                 → Confirm Contabo worker = STOPPED / DISABLED
                 → P5.1–P5.6 / P5.8 / P5.10 GREEN · P6.1–P6.4.3 / P6.6 / P6.7 GREEN · V1 GREEN
                 → P6.5 Scenario A PROVEN · Scenario B BLOCKED / INCONCLUSIVE (do not reopen)
                 → NEXT GATE = STOP — OWNER DECISION REQUIRED (Final Mix GREEN closeout docs · no auto EPIC / payments)
                 → SEARCH EXISTING FIRST · DO NOT DUPLICATE engine/player/orchestrator/CAS/selection
                 → Do NOT reimplement V2 / Auto Save/CAS / 7.1.6 / Escape / 7.1.5 / 7.1.4 / 7.1.3 / V1 / P6.7 / P6.6 / P4.6
                 → Do NOT commit P4 context? seam / SA-07 untracked / Sacred WIP without Owner GO
                 → Do NOT call punch “P5.7” / “P5.9” / “P5.10”
                 → p_take_id = NON-BLOCKING follow-up only (do not auto-implement)
                 → Do NOT reopen closed epics without new evidence
                 → Do NOT fix EXPORT_WAV in product scope without separate Owner GO
                 → Do NOT clean dirty WIP without Owner GO
                 → Do NOT force-redeploy without evidence SHA mismatch
```

---

## 6. Decision vs Delivery (selected recent)

| ID / Track | Decision | Delivery |
|------------|----------|----------|
| Phase 7.1.6 Auto Save + CAS | Owner GO | **CLOSED / PRODUCTION VERIFIED — GREEN** @ `4fa658d` |
| Phase 7.1.5 Shell Polish + Escape | Owner GO | **CLOSED / PRODUCTION VERIFIED — GREEN** @ `3fccbf7` (ancestry) |
| OD-P7.1.4-01…04 | **CLOSED / ACCEPTED** (A/A/A/A) | Phase 7.1.4 Mixer Dock **CLOSED / GREEN** @ `9abc1b6` (ancestry) |
| Phase 7.1.3 Inspector IA | CLOSED | **CLOSED / PRODUCTION GREEN** @ `8f6eeca` (do not reopen)
| OD-PL-01…06 | **CLOSED / ACCEPTED** | POLISH-01 **CLOSED / PRODUCTION VERIFIED** @ `579acb3` + residual `1c63080` |
| P0 PLATFORM deny | Owner GO | **CLOSED / PRODUCTION VERIFIED** @ `fdfff71` |
| P1 Sample Policy | Owner GO | **CLOSED / PRODUCTION VERIFIED** @ `5927e35` |
| P2 Explicit Replace | OD-P2-01…07 CLOSED | **CLOSED / PRODUCTION VERIFIED** @ `943d81e` |
| ARCH-05 | Owner GO delete | **CLOSED / VERIFIED** |
| OD-08 Premium tiers | CLOSED | W2-A/B in tree |
| P3 | OD-P3-01…11 CLOSED / IMPLEMENTED | **COMPLETE / PRODUCTION VERIFIED — GREEN** @ `dabbc936` |
| P5.6 Take Workflow | Design Freeze GO | **PRODUCTION VERIFIED — GREEN** |
| P5.8 Devices / Input | Design Freeze GO | **PRODUCTION VERIFIED — GREEN** @ `95e04ff` · dpl `dpl_2RhUDg…` |
| P5.9 Architecture Audit | GO WITH CONDITIONS | Audit artifact only — [P5_9…](./architecture/P5_9_STUDIO_ARCHITECTURE_AUDIT.md) |
| P5.10 Studio Audio Engine | Design Freeze GO WITH CONDITIONS | **PRODUCTION VERIFIED — GREEN** @ `9c2a958` · dpl `dpl_L7pB5A8…` |
| P5.7 Architecture Audit | GO WITH CONDITIONS | Audit artifact only — [P5_7…](./architecture/P5_7_STUDIO_ARCHITECTURE_AUDIT.md) |
| D02 harness | CLOSED | **TEST ONLY** @ `44dc22c` |

---

## 7. Out of scope / deferred (living)

STEMS · payments / Premium catalog · recording Premium overlay · Gold 90d PRODUCTION · audio-artifacts janitor · `/ranks` / `/premium` UI · billing · W2-B Mix/Render live · W4 remaining Admin P2 (last-admin TOCTOU · no durable idempotency · live last-admin concurrency · published USER beat retain · migration timestamp drift) · **P3 `p_take_id` hardening** until separate Owner GO (NON-BLOCKING) · **P6** product FX/routing/buses/automation/mix/master (engine foundation = P5.10 GREEN) · **P7** samples/scratch/instruments/pitch/stretch/reverse/loop · Studio punch/pre-roll/count-in/metronome/BPM/quantization · capability system (document-only until freeze) · DB device preferences (P5.8 = localStorage only). Phase 7.1.6 Auto Save + CAS Completeness = **SHIPPED / GREEN** @ `4fa658d`.

---

## 8. Local worktree note

Typical residue (**nie czyścić / nie stage'ować bez GO**): `.agents/` · `.cursor/` · `skills-lock.json` · `infra/oracle/` · `.env*` · secrets · backup artifacts · cleanup scripts · untracked audits WIP.

**Nigdy:** `git add .` / `-A` / `-u` — tylko exact allowlist.
