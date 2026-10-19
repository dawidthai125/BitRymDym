# Recording / Quick Take — architecture index

**Status:** Design Freeze **LOCKED** · Wave 1–5 **CLOSED** · D02 **SHIPPED / PRODUCTION VERIFIED** @ `e98ba52` · **P3 COMPLETE / PRODUCTION VERIFIED — GREEN** @ `dabbc936` · **Fala 3.5.1 CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** @ `c690831` (verify baseline `75bd80f`) · production app GREEN

**Canonical freeze:** [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md)  
**D02 CURRENT CONTRACT:** [PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md](../phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md) (Design Freeze COMPLETE · **SHIPPED** @ `e98ba52`)  
**D02 closeout:** [RECORDING_D02_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)  
**Fala 3.5.1 closeout (implementation):** [FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md](../audits/FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md) (historical pre-deploy label **NOT DEPLOYED** — superseded)  
**Fala 3.5.1 production verify plan:** [D_FALA_351_PRODUCTION_VERIFY_PLAN.md](../audits/D_FALA_351_PRODUCTION_VERIFY_PLAN.md)  
**Wave 3 closeout:** [RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md](../audits/RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md)  
**Wave 4 closeout:** [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md)  
**Wave 4 report:** [RECORDING_WAVE4_IMPLEMENTATION_REPORT.md](../audits/RECORDING_WAVE4_IMPLEMENTATION_REPORT.md)  
**Wave 5 closeout:** [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)

## P3 — Anonymous → Account Claim

**Status:** **COMPLETE / PRODUCTION VERIFIED — GREEN** @ `dabbc936` · deploy `dpl_Hd4QAwDkkw99FMiFhh8nJ1N6nvsR`

| Piece | Location |
|-------|----------|
| RPC `claim_anon_take_to_account` | `supabase/migrations/20261005211153_p3_claim_anon_take_to_account.sql` |
| Orchestrator | `src/lib/takes/anon-account-claim.ts` |
| Auth hooks | `src/lib/auth/actions.ts` (sign-in / sign-up session) · `tryClaimAnonTakeAfterAuth` |
| Studio banner | `src/app/account/page.tsx` `?claim=` |
| TTL/cap SSOT | **Premium Tier** → `getSamplePolicy` / `SAMPLE_POLICY_DEFAULTS` (**≠** Account Level / Rank / Role) |

```text
Anonymous Take → READY → successful sign-in/sign-up session
  → anonymous identity hash (brd_tk_aid) → latest eligible READY
  → Premium Tier getSamplePolicy (cap/TTL)
  → Storage COPY anon/{hashPrefix}/takes/{takeId}/mic.bin
  → claim_anon_take_to_account(...)  (SECURITY DEFINER · search_path=public · service_role-only
       · advisory locks anonymous→owner · READY/not deleted/not expired)
  → ownership transfer → user/{ownerId}/takes/{takeId}/mic.bin
  → DELETE anonymous source → clear brd_tk_aid (CLAIM_OK / IDEMPOTENT_REPLAY only)
  → /account?claim=...
```

**Storage protocol:** COPY → DB transfer → DELETE source · `take-audio` **private**
**Ownership XOR:** auth `owner_id NOT NULL` + `anonymous_token_hash NULL` · anon inverse
**Scope:** READY only · latest · cookie/browser-bound · no cross-device · no daily session spend · cap DENY · no silent replace · fail-open (claim ≠ login failure) · not in middleware
**Cookie production:** clear **CODE-VERIFIED** · full disposable E2E **NOT EXECUTED**
**Follow-up (non-blocking):** optional `p_take_id` RPC binding

## Wave 1 delivered

| Piece | Location |
|-------|----------|
| Table `takes` + enums + RLS | `supabase/migrations/20260927180000_recording_wave1_take_foundation.sql` |
| Private bucket `take-audio` | same migration |
| Object keys | `src/lib/takes/object-key.ts` |
| Config | `src/config/recording.ts` |

## Wave 2 delivered

| Piece | Location |
|-------|----------|
| Interim AuthZ | `src/lib/takes/authz.ts` |
| Session + finalize | `src/lib/takes/take-transport.ts` · `/api/takes/session` · `/api/takes/finalize` |
| MediaRecorder module | `src/lib/takes/media-recorder.ts` |
| Client upload helper | `src/lib/takes/client-upload.ts` |

## Wave 3 delivered

| Piece | Location |
|-------|----------|
| Recording UI state machine | `src/lib/takes/recording-ui-state.ts` |
| RecordingPanel | `src/components/takes/recording-panel.tsx` |
| Beat detail composition | `src/components/takes/beat-recording-surface.tsx` |
| PlaybackShell sync handle | `playFromStart` / `stopPlayback` / `setControlsLocked` |
| Take-only preview signed GET | `src/lib/takes/take-preview.ts` · `POST /api/takes/preview` |

**OD-W3 (CLOSED):** beat plays from 0 during capture · anon OUT of W3 wave · sibling panel (not merged reducer) · take-only preview (no dual-play).

## Wave 4 delivered (CLOSED @ `99c4815`)

| Piece | Location |
|-------|----------|
| Entitlement / retention / anti-abuse SSOT | `src/lib/takes/entitlement.ts` |
| Race-safe session claim | `claim_take_recording_session` + `take-transport.ts` |
| Shared owner AuthZ gate | `src/lib/takes/take-access.ts` |
| Own download | `take-download.ts` · `POST /api/takes/download` |
| Soft-delete | `take-delete.ts` · `POST /api/takes/delete` |
| Janitor | `takes-janitor.ts` · `GET /api/cron/takes-janitor` · `vercel.json` |
| Moje próbki | `/account/takes` · `list-own-takes.ts` |

**Entitlement:** BEGINNER `MIN(beat,30)` · PRO/LEGEND `MIN(beat,180)` — server only.  
**Retention:** BEGINNER 24h · PRO 10d · LEGEND 30d via `expires_at`.  
**Anti-abuse:** active READY caps + UTC day sessions + max 1 `PENDING_UPLOAD` (advisory lock).  
**Janitor:** Vercel Hobby daily cron `0 0 * * *` (00:00 UTC) + `CRON_SECRET` (not pg_cron). Expiry AuthZ remains immediate/server-side; janitor is cleanup only.

**Not in Wave 4:** Anonymous QT · shared grants · MIX/EXPORT · Track publish · payments/Premium · dual-play.

**Reuse:** Wave 2/3 transport + MediaRecorder + preview; Chromium WebM duration fallback (`9f6f006`) unchanged.

## Wave 5 — Shared Grants → RECORD (CLOSED / PRODUCTION VERIFIED @ `37892a6`)

| Piece | Location |
|-------|----------|
| Table `beat_access_grants` + create RPC (advisory lock) | `supabase/migrations/20260928140000_recording_wave5_beat_access_grants.sql` |
| ACTIVE predicate + max 20 | `src/config/beat-access-grants.ts` |
| Grant domain (service_role) | `src/lib/grants/beat-access-grants.ts` |
| RECORD AuthZ source label | `assertTakeRecordAccess` (+ optional `activeRecordGrant`) |
| Owner/grantee APIs | `/api/beats/[id]/grants` · revoke · `/api/account/grants` |
| UI | `BeatGrantsPanel` on Moje bity · `/account/shared` |

**Contract:** Shared Grants → RECORD only. No PLAYBACK/DOWNLOAD via grant. PUBLISHED RECORD without grant unchanged (W4). Non-PUBLISHED + grant = DENY. Grant ≠ take ACL. Revoke blocks new sessions only.

**Status:** **CLOSED / PRODUCTION VERIFIED** @ `37892a6` · https://www.bitrymdym.pl · [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)

## D02 — Anonymous Quick Take (CLOSED / IN V1 · SHIPPED / PRODUCTION VERIFIED @ `e98ba52`)

| Piece | Location |
|-------|----------|
| Claim RPC + PENDING unique + advisory lock `87245104` | `supabase/migrations/20260928160000_recording_d02_anon_take_claim.sql` |
| Identity cookie `brd_tk_aid` | `src/lib/takes/anonymous-identity.ts` · `src/config/recording.ts` |
| Token hash | `src/lib/takes/token-hash.ts` |
| Anon AuthZ / entitlement | `assertAnonTakeRecordAccess` · `computeAnonymousRecordingMaxSeconds` |
| Transport + preview | `anon-take-transport.ts` · `anon-take-preview.ts` |
| APIs | `/api/takes/anon/session` · `finalize` · `preview` |
| UI | `RecordingPanel` anonymous path · beat detail max SSOT |

**Contract:** TTL 7200s · max **15s** (P1 SAMPLE_POLICY) · caps 1/3/concurrent 1 · hash-only · PUBLISHED+READY master · preview YES · durable anon download NO · **anon→account claim = P3 IN** (auto after login/signup · Storage move · Premium Tier TTL/cap) · dual-play OUT · no grant APIs.

**W4/W5:** authenticated `claim_take_recording_session` and Shared Grants unchanged.

**Status:** **CLOSED / IN V1** · **SHIPPED** · **PRODUCTION VERIFIED** @ `e98ba52` · [RECORDING_D02_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)

## Fala 3.5.1 — Recording Experience + Dual Audio Timeline (CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN)

| Piece | Location |
|-------|----------|
| Live mic peaks / level | `useMicAnalyser` · `TakeMediaRecorder.getStream()` |
| Live MIC rail + Input Monitor | `brd-live-mic-waveform.tsx` · `brd-input-monitor.tsx` |
| BIT rail during REC | `PlaybackShell` Waveform + REC-panel Bit Waveform |
| READY_TAKE dual preview | `brd-take-preview-rail.tsx` · `take-preview-graph.ts` · `peaks-from-buffer.ts` |
| Waveform peaks / tone | `waveform.tsx` (`peaks?` · `tone: "take"` · `peaksFromSeed` retained) |

**Contract:** PlaybackShell remains BIT playback SSOT · no second audio engine · no native take `<audio controls>` · D02 / Storage / AuthZ / P1 / P2 / P3 unchanged.

```text
DESIGN FREEZE              = GO (Production Verification & Ship)
IMPLEMENTATION             = ALREADY SHIPPED @ c690831
PRODUCTION VERIFICATION    = PASS (D-V matrix)
PRODUCTION                 = GREEN
STATUS                     = CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN

Feature commit             = c690831
Historical plan baseline   = 42369c0
Actual verify baseline     = 75bd80f
Reason                     = production/repository tip advanced after subsequent docs-only reconciliation/deploy lineage
```

**Verify findings (non-blocking):** F351-V-01 LOW (first automated REC generic error · retry succeeded · no micro-patch) · F351-V-02 FALSE POSITIVE / NOT REPRODUCED (sticky-nav intercept = tooling artifact).

**Historical:** Implementation closeout (2026-10-02) recorded Owner **PRELIMINARY PASS** · Production **NOT DEPLOYED** — that label is **superseded** by dedicated production verify (2026-10-05). Closeout: [FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md](../audits/FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md) · Plan: [D_FALA_351_PRODUCTION_VERIFY_PLAN.md](../audits/D_FALA_351_PRODUCTION_VERIFY_PLAN.md)

## STU-14/15/16 — Local recording safety & recovery (Studio + Quick Take) — LOCAL ONLY · NOT COMMITTED · NOT DEPLOYED

Full behaviour description (format v2, ownership, lease, TTL, messages, browser limits, diagnostics): [README — Nagrywanie — wspólne lokalne zabezpieczenie i odzyskiwanie](../../README.md).

| Piece | Location |
|-------|----------|
| Recovery logic (save, list, recover, discard, lease) | `src/lib/takes/take-recording-recovery.ts` |
| IndexedDB adapter (reconnect after lost connection) | `src/lib/takes/take-recording-recovery-idb.ts` |
| Banner (both surfaces) | `src/components/takes/take-recording-recovery-banner.tsx` |
| Leave guard (Studio) | `src/components/studio/studio-leave-guard.ts` |
| Server upload window (STU-16) | `supabase/migrations/20261018120000_stu16_pending_upload_window.sql` · `src/lib/takes/takes-janitor.ts` · `TAKE_PENDING_UPLOAD_WINDOW_SECONDS` in `src/config/recording.ts` |
| Tests | `src/lib/studio/stu-14-recording-recovery.test.ts` · `stu-15-recovery-lease.test.ts` · `stu-15-recovery-idb.test.ts` · `stu-16-pending-upload-window.test.ts` · live: `src/lib/takes/stu16-pending-upload-window-live.test.ts` |

**Contract:** the lease is browser-only (IndexedDB transaction, 120 s, renewed every 30 s, max 15 min). Server-side duplicate protection stays `CONCURRENT_SESSION` + idempotent finalize of the same `takeId`. A local copy is deleted only after `READY` of the same `takeId`. RLS unchanged.

**STU-16 planes (do not collapse):**

| Plane | Status |
|-------|--------|
| **(1) Git** | Migration file + claim/janitor/config/tests **ON `main`** @ **`c2be3b0`** (`c2be3b0159deb02481dd402bd276ad35bf34b273`) · file `supabase/migrations/20261018120000_stu16_pending_upload_window.sql` |
| **(2) App deploy** | Code present in subsequent `main` production bundles by ancestry · **Vercel deployment commit SHA: NOT VERIFIED** |
| **(3) Production DB migration apply** | **VERIFIED BY READ-ONLY AUDIT** (2026-10-19) · project **`rzzxrgcdogkybkiidqgw`** · history version **`20261018154129`** / name **`stu16_pending_upload_window`** · live TTL **900 s** · checked defs/grants in audit scope (see below) · **≠** functional GREEN |
| **(4) Production functional verification** | **NOT VERIFIED** (no live E2E / concurrency / writing prod test in that audit) |

**A. Database migration apply (read-only audit evidence):** Supabase history lists `20261018154129` / `stu16_pending_upload_window`. Live `take_pending_upload_window_seconds()` returns **900**; app mirror `TAKE_PENDING_UPLOAD_WINDOW_SECONDS = 15 * 60`. Functions present with `search_path = ''`; claims `SECURITY DEFINER` + service_role guard; `release_stale_pending_take_reservations` `SECURITY INVOKER`; `EXECUTE` for `service_role` (also `postgres` in privilege check); `anon` / `authenticated` without EXECUTE in audit scope. Definition markers for window elapsed, storage `NOT EXISTS`, and advisory locks were present. Audit did **not** perform full byte-for-byte body compare vs the Git SQL file. Vercel runtime Supabase env was **not** independently re-compared.

**B. Mechanism-level verification (`SESSION_DAY_CAP` / window — from definitions, not live runtime):** retry/resume of the **same** `takeId` should not spend another day-cap slot when no new claim INSERT occurs · window expiry → `FAILED` / `PENDING_UPLOAD_WINDOW_ELAPSED` does **not** refund (UTC-day count by `created_at`, any status) · takeover that inserts a **new** claim spends one · day boundary = UTC · advisory locks on claim/janitor paths · day-cap check before new INSERT. These are **definition/mechanism** conclusions.

**C. Functional verification:** **NOT VERIFIED** — no production live E2E, concurrency test, or writing prod exercise in the 2026-10-19 audit. Do **not** treat mechanism-level evidence as empirical production PASS.

**D. Version drift (Git vs Supabase history):** Git file timestamp **`20261018120000`** · DB history version **`20261018154129`** (name `stu16_pending_upload_window`). Keep this drift visible for future migrate ops. Audit did **not** confirm a schema error from the timestamp difference alone. **No** repair, rewrite, or re-apply was performed.

**Server upload window (STU-16):** a `PENDING_UPLOAD` reservation blocks new sessions of the same actor (owner or guest hash) for 900 s of server time from `created_at` (`public.take_pending_upload_window_seconds()`; Owner length CLOSED 2026-10-18 — `OD-REC-PENDING-UPLOAD-TTL`; live prod TTL **900** confirmed by read-only audit). After the window, and only if `storage.objects` has no object for it, the next claim of the same actor marks it `FAILED` / `PENDING_UPLOAD_WINDOW_ELAPSED` inside the claim transaction under the per-actor advisory lock shared with finalize; the janitor does the same via `release_stale_pending_take_reservations(p_limit)` (`service_role` only, `SECURITY INVOKER`, `search_path = ''`) and removes objects uploaded after the release. A reservation whose object landed is never released. A failing claim (daily cap, `REPLACE_REQUIRED`, duplicate id) rolls the release back. **`SESSION_DAY_CAP` (contract + mechanism):** releasing a reservation after the window does **not** refund the daily session — the UTC-day counter counts every take row of the actor with `created_at` that day (any status, including `FAILED` / `PENDING_UPLOAD_WINDOW_ELAPSED`); a takeover is a new claim and spends another session. Local copy and `READY` takes are untouched by the window. **`SESSION_DAY_CAP` runtime/E2E verification: NOT VERIFIED** · **Concurrency verification: NOT VERIFIED**.

**`PENDING_UPLOAD` states:**

| State | Meaning | Client behaviour |
|-------|---------|------------------|
| active | upload of this `takeId` in progress in a tab holding the lease (inside the window) | other tabs show `BUSY`, no actions |
| recoverable | copy knows `takeId`, no live lease | finalize same `takeId` → `READY`, or 403 (`FAILED`, incl. released by the window) → one fresh upload |
| ambiguous | session response lost, `takeId` unknown | inside the window: `CONCURRENT_SESSION` → copy kept, message names the window; after it: next claim takes the slot over |
| stale | window elapsed, no object | released → `FAILED` `PENDING_UPLOAD_WINDOW_ELAPSED` (claim or janitor) |
| object landed | object exists, not finalized | kept until `expires_at`; finalize → `READY` |
| expired | past `expires_at` (= full retention TTL) | janitor removes; client never deletes by age |

**PASS criteria:** no false success (only server `READY` confirms) · no duplicate take per copy · copy survives every failure until `READY` or explicit discard · Polish messages without raw codes · discard needs confirmation (Escape cancels, focus restored) · one tab acts at a time.

**Verification:** Chromium only (390×844, 1440×900; synthetic / loopback audio, no physical mic). Safari / Firefox not tested.
