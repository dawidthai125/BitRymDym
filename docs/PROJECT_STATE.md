# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point:** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) → [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) → ten plik.
**Updated:** 2026-10-14 — **SFM Implementation Design reconciled (docs-only)** · OD-SFM-ID-01…04 **ACCEPTED** · [design](./decisions/STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md) · [data](./decisions/STUDIO_FINAL_MIX_DATA_MODEL.md) · [rpc](./decisions/STUDIO_FINAL_MIX_RPC_SECURITY_CONTRACT.md) · [tests](./decisions/STUDIO_FINAL_MIX_TEST_MATRIX.md) · **NOT IMPLEMENTED** · **NO COMMIT/PUSH** · OD-04 / OD-SFM-ID-05…07 **OPEN** · prior F02b/F03b/Stages ACCEPTED · Sacred WIP protected

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
| **GITHUB MAIN TIP / origin/main (confirmed)** | **Studio Final Mix Product Contract ACCEPTED (docs-only)** — this commit · parent = prior tip (poller kill-switch / Contabo V1 history) · **≠** Implementation GO · **≠** Contabo enable · **≠** payments · verify with `git rev-parse origin/main` after fetch · other local worktrees may still be dirty / diverge |
| **STUDIO FINAL MIX PRODUCT CONTRACT** | **OWNER ACCEPTED** · [addendum](./decisions/STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md) · OD-SFM-08/12/14 CLOSED · **NOT IMPLEMENTED** |
| **SFM F-ADDENDUM / STAGES DF** | **OWNER ACCEPTED (docs)** · [F02b/F03b](./decisions/STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md) · [stages](./decisions/STUDIO_FINAL_MIX_VERSION_STAGES_DESIGN_FREEZE_PROPOSAL.md) · F02/F03 **SUPERSEDED SFM-only** · corrections A/B/C · **NOT IMPLEMENTED** · **OD-04 OPEN** |
| **SFM IMPLEMENTATION DESIGN** | **OWNER ACCEPTED (design docs)** · OD-SFM-ID-01…04 · [pack](./decisions/STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md) · separate SFM download route · multi AVAILABLE slots · `SFM_MIX` executor job · strict `granted_qualities` snapshot · **NOT IMPLEMENTED** · **≠** Implementation GO · OD-SFM-ID-05…07 + OD-04 **OPEN** |
| **PRIOR DOCS TIP (HISTORY)** | **`7d87380`** — Contabo poller Design Freeze · **`22c7d56`** — Final Mix GREEN §4G align · **`a1df783`** — GREEN VERIFIED closeout · **`dcd2308`** — FULL FIXTURE VERIFIED · **`51a37a2`** — empty-session · **`99bb10e`** I.18 · **`cee88f8`** FM criteria · **`e4971d2`** Stage J · **`2adb569`** PR #12 |
| **APP-CODE TIP (last-established in available evidence)** | **`ce2f0cc7ad7f5257577e858d64ca8531ebb35000` (`ce2f0cc`)** — Merge PR #5 (Studio delete×export-history) · last app-feature tip on `main` before docs tips · **≠** Git tip · **≠** independently freshly verified production app SHA |
| **REUSE / DO NOT DUPLICATE** | [architecture/REUSE_SSOT_MAP.md](./architecture/REUSE_SSOT_MAP.md) · SEARCH EXISTING FIRST |
| **SACRED WIP** | `src/lib/takes/recording-eligibility-service.ts` · SHA256 `5AE4C231…50EEECB9` · do not reset/clean |
| **APP FEATURE COMMIT (V2)** | `44f7cbd2671dd5ece6ea298cc78bfae9a0f7a7f5` (**`44f7cbd`**) — Studio Visual Parity V2 · **GREEN / RELEASE VERIFIED / CLOSED** |
| **PRODUCTION DEPLOYMENT (last-known I.48-A0)** | **`dpl_sAyrsHCfMVLFer669J2MgbbXbhGN`** · Production · **Ready** · SHA **`2adb569`** · URL `bitrymdym-m6ilfuqbp-…vercel.app` · evidence **I.48-A0** (cold-start RO) · **GO-A did not re-verify** · Ready ≠ functional app GREEN · **≠** current Git tip (docs-only advances) |
| **PRODUCTION GIT SHA (last-known I.48-A0)** | **`2adb569`** — last observed deploy SHA · **≠** current Git tip (`50d7788` / GO-A) · commit ≠ domain alias ≠ functional verify · prior **`f730a7a`** / `dpl_28oH…` = HISTORY (I.46-A10 / I.47) · prior **`df37048`** / `dpl_7Cp2gQ9…` = HISTORY (I.45EJ-R1) |
| **DOMAIN ALIASES (last-known from I.48-A0 inspect · NOT e2e)** | **`www.bitrymdym.pl`** · **`bitrymdym.vercel.app`** · **`bitrymdym.pl`** listed on Ready deploy · apex redirect e2e **NOT VERIFIED** (no HTTP in I.48) |
| **PRIOR PRODUCTION DEPLOY (HISTORY)** | `dpl_28oHcn3w146saZ6fNDFsiCQehUQP` @ `f730a7a` (I.46-A10 / I.47 snapshot) · `dpl_7Cp2gQ9BX3s8jVG9faL3LUjMgyt5` @ `df37048` (I.45EJ-R1) · `dpl_1P8ixpt…` @ `ce2f0cc` (PR #5) · `dpl_9YDCy…` @ `faf734b` (PR #4) · earlier `dpl_56FGH…` |
| **DUAL-PLANE NOTE** | Git tip (GO-A / `50d7788` parent) ≠ app-code tip `ce2f0cc` ≠ prod last-known `2adb569` / `dpl_sAyrsHC…` ≠ local dirty WIP ≠ feature V2 `44f7cbd` · docs-only tips do not prove app deploy · do not treat Ready as Final Mix GREEN · GO-A / I.48-A2/A3 did **not** re-verify deploy |
| **OPS NOTE (subject BOM)** | Commit `d515f3b` subject has UTF-8 BOM before `docs:` · Owner decision · **non-blocking** · do not amend without GO |
| **V2 VERIFY DEPLOY (HISTORY)** | `dpl_2ymzMb24QtrYxWBJWmdufeTaTqkR` @ `44f7cbd` — original V2 release gate · **superseded for live aliases** |
| **PREVIOUS PRODUCTION TIP (HISTORY)** | `dpl_FVcx…` @ `3a086ad` · `44f7cbd` / `dpl_2ymz…` · `4fa658d` — Phase 7.1.6 · `79bc69f` V1 · older: `3fccbf7` · `9abc1b6` · `8f6eeca` |
| **PRODUCTION URL** | https://www.bitrymdym.pl (canonical serve) · https://bitrymdym.pl (308→www) · https://bitrymdym.vercel.app |
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
| **NEXT UNIT** | **STOP — OWNER DECISION REQUIRED** — poller **IMPLEMENTED locally** · **NEXT:** GO-HOST-RO-CONTABO · GO-SYNC-CONTABO-POLL · canary · always-on · prod migration apply · do **not** enable poller · do **not** re-run `53398f9e-…` or `61b7cdf1-…` · Final Mix GREEN / WAIVE / OUT **unchanged** · P6.8 independent |
| **KNOWN WAIVER** | `e3-7-f-download-authz` / `EXPORT_WAV` · **PRE-EXISTING / OUT OF SCOPE / WAIVED BY OWNER** |
| **Fala 3.5.1 Recording Experience** | **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** @ `c690831` — [RECORDING.md](./architecture/RECORDING.md) |
| **P3 Anonymous → Account Claim** | **COMPLETE / PRODUCTION VERIFIED — GREEN** @ `dabbc936` — [RECORDING.md](./architecture/RECORDING.md) |
| **POLISH-01** | **CLOSED / PRODUCTION VERIFIED** @ `579acb3` · residual `1c63080` — [DF](./audits/POLISH-01_DESIGN_FREEZE.md) |
| **P0 PLATFORM master download deny** | **CLOSED / PRODUCTION VERIFIED** @ `fdfff71` — [closeout](./audits/P0_PLATFORM_MASTER_DOWNLOAD_DENY.md) |
| **P1 Sample Policy** | **CLOSED / PRODUCTION VERIFIED** @ `5927e35` — [matrix](./audits/P1_SAMPLE_POLICY_MATRIX.md) |
| **P2 Explicit Sample Replace** | **CLOSED / PRODUCTION VERIFIED** @ `943d81e` — [impl](./audits/P2_REPLACE_SAMPLE_IMPLEMENTATION.md) |
| **BPM / real beats** | **CLOSED / PRODUCTION VERIFIED** (17/17 import · 5 BPM corrections) |
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

---

## 3. Current Phase

```text
CURRENT PHASE                 = Studio Visual Parity V2 CLOSED / GREEN @ 44f7cbd
APP FEATURE COMMIT (V2)       = 44f7cbd · GREEN / RELEASE VERIFIED / CLOSED
PRODUCTION DEPLOYMENT (last-known I.48-A0) = dpl_sAyrsHCfMVLFer669J2MgbbXbhGN · Ready · SHA 2adb569 · ≠ current Git tip · GO-A did not re-verify
  aliases (last-known · NOT e2e) = www.bitrymdym.pl · bitrymdym.vercel.app · bitrymdym.pl · apex redirect e2e NOT VERIFIED
PRODUCTION GIT SHA (last-known I.48-A0) = 2adb569 · ≠ current Git tip (GO-A / parent 50d7788) · prior f730a7a / dpl_28oH… = HISTORY (I.46-A10) · prior df37048 / dpl_7Cp2gQ9… = HISTORY
  app-code tip (last-established evidence) = ce2f0cc / dpl_1P8ixpt… (PR #5) · ≠ fresh prod verify · ≠ Git tip
  prior deploy (HISTORY)      = dpl_28oH… @ f730a7a · dpl_7Cp2gQ9… @ df37048 · dpl_9YDCy… @ faf734b · dpl_56FGH…
  V2 verify deploy (HISTORY)  = dpl_2ymzMb24QtrYxWBJWmdufeTaTqkR @ 44f7cbd (superseded for aliases)
GITHUB MAIN TIP / origin/main = Final Mix Production GREEN closeout · parent dcd2308 · prior 51a37a2 / 99bb10e / cee88f8 / e4971d2 = HISTORY · local WIP may still dirty / diverge · verify remotely after fetch
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
