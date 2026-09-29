# Changelog

Wszystkie istotne zmiany dokumentacji i (później) aplikacji.

Format: data, zakres, skrót.

---

## 2026-09-29 — E3.6 BASIC MP3 EXPORT — POST-RELEASE CLOSEOUT (DOCS)

**Status:** **E3.1 → E3.6 CLOSED / PRODUCTION VERIFIED** @ `183b2a4` · **E3 = DARK** · docs reconciliation · **no app/DB/env/deploy in this closeout**

- Application / Production = `183b2a4a7ea3cc8be7f0ac337e75e915ffdae0b9` (`feat(audio): implement E3.6 basic mp3 export`)
- Production deployment = `dpl_D5EfHdSSahouFftf5HK35wKSHmts` · URL https://www.bitrymdym.pl · Production Verify = **PASS**
- Previous Production = `fbece37` (E3.5 Render Jobs)
- **E3.6 shipped:** source authorization/resolution · `server-basic-v1` bake · real Basic MP3 **128 kbps stereo** · **OD-E36-04 = C** native/system FFmpeg + libmp3lame on **EXTERNAL worker** (FFmpeg **not** an app npm dependency) · QC · signed download · thin Free Export UX · Final Truth READY artifact path · tests
- **Production safety (unchanged / DARK):** `E3_RENDER_JOBS_ENABLED` / `E3_MIX_ENABLED` / `E3_PUBLIC_AUDIO` = **UNSET** · `E3_RENDER_WORKER_SECRET` = **UNSET** · Production real render **NOT ENABLED / NOT EXECUTED**
- History preserved: E3.1 @ `35e1eaa` → E3.2 @ `24e50ac` → E3.3 @ `8283bd0` → E3.4 @ `69dc9d1` → E3.5 @ `fbece37` → E3.6 @ `183b2a4`
- Closeout: [E3_6_PRODUCTION_CLOSEOUT.md](./audits/E3_6_PRODUCTION_CLOSEOUT.md)
- Architecture continuity: [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) · [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](./architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md)
- INFO (non-blockers): Live Full E2E not executed · Free Export needs EXTERNAL worker process · G5 soft RMS (not full BS.1770) · Fake-complete ≠ Final Truth · native FFmpeg per OD-E36-04
- D02 @ `e98ba52` · W1–W5 @ prior SHAs — unchanged
- Docs-only tip may advance after Owner docs-commit GO — **do not** redeploy docs as application
- Next = **OWNER DIRECTION / READY FOR NEXT AUDIT** (do **not** auto-select E3.7+)

---

## 2026-09-28 — D02 ANONYMOUS QUICK TAKE — POST-RELEASE CLOSEOUT (DOCS)

**Status:** **D02 CLOSED / IN V1** · **SHIPPED** · **PRODUCTION VERIFIED** @ `e98ba52` · docs reconciliation · **no app/DB/deploy**

- Application / Production = `e98ba52c610b4c6dee8f69aa76f734b6cbe898ab` (`feat: add d02 anonymous quick take`)
- Production Verify = GREEN · Closeout: [RECORDING_D02_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)
- Contract addendum reconciled: [PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md](./phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md)
- Preserve NOT EXECUTED: post-expiry live · 3/day · missing READY-master case · W4/W5 full interactive · mobile 390/412
- POST-RELEASE FINDING: anonymous verify artifacts TTL-bound (MEDIUM=1) — no delete feature in closeout
- OUT unchanged: anon→account claim · durable anon download · MIX/EXPORT/TRACK/PAYMENTS/PREMIUM/SOCIAL/DUAL-PLAY · grant PLAYBACK|DOWNLOAD
- Wave 5 @ `37892a6` unchanged · W4 ownership path unchanged
- Docs-only tip may advance after Owner docs-commit GO — **do not** redeploy docs as application
- Next = **OWNER DIRECTION / READY FOR NEXT AUDIT**

---

## 2026-09-28 — D02 ANONYMOUS QUICK TAKE — DESIGN FREEZE ADDENDUM

**Status (freeze gate — historical):** **DESIGN FREEZE COMPLETE** · Implementation GO was **NONE** at freeze time · Architecture Review was next gate · **no app/DB/config change in that docs step**

- Canonical: [PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md](./phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md)
- At freeze: D02 CLOSED / IN V1 · delivery still NOT SHIPPED
- Frozen: TTL 7200s · max 30s · caps 1/3/concurrent 1 · dedicated take identity ≠ `brd_dl_aid`
- Preview YES (short-lived signed) · durable download NO · anon→account claim NO · PUBLISHED only · dual-play OUT
- Wave 5 / MIX / EXPORT / Track / Payments / grant PLAYBACK|DOWNLOAD = OUT
- **Later:** Implementation + Production Verify completed @ `e98ba52` — see Post-Release Closeout entry above

---

## 2026-09-28 — RECORDING WAVE 5: PRODUCTION VERIFIED / CLOSED

**Status:** **CLOSED / PRODUCTION GREEN** @ `37892a6adca1ac3b4bf68a06af248ca38bbcc177`

- Scope: Shared Grants → RECORD only (`beat_access_grants`)
- OWNER VERIFICATION = PASS · PRODUCTION VERIFY = PASS
- Production URL: https://www.bitrymdym.pl
- D03 decision unchanged CLOSED / IN Recording EPIC · delivery = SHIPPED / PRODUCTION VERIFIED
- D02 Anonymous QT at Wave 5 closeout: CLOSED / IN V1 · delivery then NOT SHIPPED / DEFERRED *(later shipped @ `e98ba52`)*
- Security continuity: P1-B/P1-C CLOSED · P1-A HIBP BLOCKED · Wave 5 AuthZ/IDOR/RLS PASS · Take ACL unchanged
- Closeout: [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)
- Known INFO: React hydration warning on `/beat/[id]` (non-blocker)
- Migration timestamp drift = P2 OPS (deferred)
- Docs-only tip may advance after this closeout — **do not** redeploy docs without Owner Production GO
- Next at Wave 5 closeout = **OWNER DIRECTION / READY FOR NEXT AUDIT** (no auto EPIC)

---

## 2026-09-28 — RECORDING WAVE 5 IMPLEMENTATION (LOCAL · PRE-COMMIT)

**Status:** Implementation complete locally · remote DB migration applied · **COMMIT/PUSH/DEPLOY = NONE** · production app remains `99c4815`

- Scope: Shared Grants → RECORD only (`beat_access_grants`)
- D03 decision unchanged CLOSED / IN EPIC; delivery implemented pending Owner Verification
- OUT unchanged: PLAYBACK/DOWNLOAD via grant · Anon QT · MIX/EXPORT · Payments · take sharing
- AuthZ: `assertTakeRecordAccess` + grant domain; PUBLISHED RECORD without grant preserved (W4)
- APIs: `/api/beats/[id]/grants` · revoke · `/api/account/grants`
- UI: Moje bity grant panel · `/account/shared`
- Next: **OWNER VERIFICATION** → then commit GO

---

## 2026-09-28 — P1 SECURITY HARDENING CLOSEOUT (DOCS)

**Status:** documentation continuity after P1-B/P1-C · **no app deploy** · production app remains `99c4815`

- Git / origin/main = `b4199ef` (`security: harden definer grants and updated_at search path`)
- **P1-B** selective DEFINER EXECUTE REVOKE = **CLOSED** / VERIFIED / committed+pushed
- **P1-C** `set_updated_at` (`search_path` + `pg_catalog.now()`) = **CLOSED** / VERIFIED / committed+pushed
- Remote DB contains P1-B + P1-C hardening
- **P1-A HIBP** = **BLOCKED** — Owner Dashboard action required (not enabled)
- Security = **GREEN WITH WARNINGS** · CRITICAL=0 · HIGH=0 · MEDIUM residual = HIBP disabled
- Migration timestamp drift local↔remote = **P2 OPS** (not P1 blocker)
- Wave 5 = **NOT IMPLEMENTED** / **NO IMPLEMENTATION GO**

---

## 2026-09-28 — DOCUMENTATION CONTINUITY RECONCILIATION

**Status:** documentation only (Owner GO: docs continuity) · **no app / DB / env / deploy**

- Added canonical cold-start entry [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)
- Entry points: MASTER_HANDOFF → PROJECT_STATE → SSOT / architecture / audits
- Clarified production app `99c4815` ≠ git docs tip (prior tip `406ff5b`; do not auto-align)
- Next = **OWNER DIRECTION / COLD START AUDIT** (Wave 5 = **no** automatic GO)
- Decision ≠ delivery: D02/D03 decisions unchanged; delivery NOT SHIPPED; no Implementation GO
- Continuity rule: documentation ≠ proof of shipped implementation; code/schema = evidence
- Deferred (not done here): freeze / SYSTEM_ARCHITECTURE §9 / SSOT §18 / OPEN_DECISIONS D02–D03 wording sync — awaits Owner clarification

---

## 2026-09-28 — RECORDING WAVE 4: PRODUCTION VERIFIED / CLOSED

**Status:** **CLOSED / PRODUCTION GREEN** @ `99c4815e26b224cb66e221831687b0688bf20476`

- Production deploy Ready · aliased https://www.bitrymdym.pl
- Smoke + live W4 E2E (BEGINNER record→download→delete, caps, IDOR) PASS
- PRO/LEGEND entitlement snapshots PASS; Chromium WebM/Opus regression PASS
- Janitor: Hobby daily `0 0 * * *`; unauthorized cron 401 PASS; scheduled run PENDING_SCHEDULE
- Closeout: [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md)
- OUT remains: anon QT · grants · MIX/EXPORT · payments

---

## 2026-09-28 — RECORDING WAVE 4: HOBBY-COMPATIBLE DAILY JANITOR CRON

**Status:** hotfix (Wave 4 still OPEN — not CLOSED)

- Vercel Hobby rejects hourly cron; schedule changed to `0 0 * * *` (00:00 UTC daily)
- Expiry AuthZ unchanged (immediate DENY); janitor remains cleanup/lifecycle only
- No business-logic / schema / AuthZ / entitlement changes

---

## 2026-09-27 — RECORDING WAVE 4: ENTITLEMENT / RETENTION / JANITOR / ANTI-ABUSE / DOWNLOAD / MOJE PRÓBKI

**Status:** **IMPLEMENTED / READY_FOR_OWNER_REVIEW** — COMMIT / PUSH / DEPLOY = NOT PERFORMED · production still @ `9f6f006`

- Entitlement SSOT: BEGINNER 30s · PRO/LEGEND `MIN(beat,180)` (`entitlement.ts` + session/finalize)
- Retention: account-level `expires_at`; AuthZ DENY when expired
- Anti-abuse race-safe: `claim_take_recording_session` (advisory_xact_lock) + unique PENDING per owner
- Janitor: Vercel Hobby daily cron `0 0 * * *` → `GET /api/cron/takes-janitor` (`CRON_SECRET`) — take-audio only; expiry AuthZ remains immediate
- Own take download: `POST /api/takes/download` signed GET TTL 300s
- Soft-delete: `POST /api/takes/delete` → DELETED + deleted_at
- UI: `/account/takes` Moje próbki (preview / download / delete)
- Migration: `20260927220000_recording_wave4_session_claim.sql` (applied remote)
- Tests: wave4-unit + wave4-live; full `src/lib/takes` regression PASS
- Report: [RECORDING_WAVE4_IMPLEMENTATION_REPORT.md](./audits/RECORDING_WAVE4_IMPLEMENTATION_REPORT.md)
- OUT: anon QT · grants · MIX/EXPORT · publish · payments

---

## 2026-09-27 — RECORDING WAVE 3: DURATION HOTFIX PRODUCTION VERIFIED / CLOSED

**Status:** **CLOSED / PRODUCTION VERIFIED** @ `9f6f006c4dbb3354260ca2f5479c18952f8a713a`

- Blocker discovered on `507f78f`: Chromium timesliced WebM/Opus → music-metadata `format.duration` missing → finalize `DURATION_PROBE_FAILED`
- Hotfix: `fix(recording): support chromium webm duration fallback` @ `9f6f006`
- RCA: [RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md](./audits/RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md)
- Production E2E: real MediaRecorder `audio/webm;codecs=opus` + timeslice 250 → upload → decode fallback duration → READY_TAKE → signed take-only preview PASS

---

## 2026-09-27 — RECORDING WAVE 3: PRODUCTION BLOCKER RCA + HOTFIX

**Status:** superseded by production verify CLOSED @ `9f6f006`

- RCA: [RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md](./audits/RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md)
- Cause: timesliced Chromium MediaRecorder WebM omits Info.Duration; music-metadata ignores Clusters
- Fix: server-side `audio-decode` PCM fallback when EBML/WebM lacks metadata duration (client duration still untrusted)
- Fixture: `src/lib/beats/fixtures/chromium-mediarecorder-opus.webm`

---

## 2026-09-27 — RECORDING WAVE 3: PLAYER INTEGRATION + TAKE PREVIEW

**Status:** **DEPLOYED** @ `507f78fb03347683c847d5b0a0d76a3fffe1827d` · **PRODUCTION VERIFY NOT CLOSED**

- Sibling `RecordingPanel` + `BeatRecordingSurface` on beat detail
- Pure `recording-ui-state` machine (separate from `reducePlayback`)
- Thin PlaybackShell sync: playFromStart(0) + stop + controls lock (OD-W3-01)
- Take-only preview via `POST /api/takes/preview` owner signed GET (OD-W3-04)
- Anonymous QT OUT (OD-W3-02); interim AuthZ unchanged (auth + PUBLISHED)
- Tests: wave3-unit + wave3-live preview AuthZ
- Closeout: [RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md](./audits/RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md)
- OUT: dual-play, anon, grants, entitlements, download, MIX/EXPORT
- **Prod verify:** UI START/STOP/CANCEL + upload PASS; finalize **FAIL** — `DURATION_PROBE_FAILED` on real Chromium MediaRecorder `audio/webm; Opus` (music-metadata returns no `format.duration`). READY_TAKE / take preview not reached. Blocker — no hotfix without Owner GO.

---

## 2026-09-27 — RECORDING WAVE 2: TRANSPORT + MEDIARECORDER

**Status:** **IMPLEMENTED** (Owner review / commit pending)

- Take session = existing `takes` row (`PENDING_UPLOAD` → `READY`)
- MediaRecorder / getUserMedia module (`src/lib/takes/media-recorder.ts`)
- Signed upload + finalize for private `take-audio` (`/api/takes/session`, `/api/takes/finalize`)
- Interim AuthZ: authenticated + PUBLISHED beat; max = `MIN(beat, 180)`
- Duration probe fail-closed (OD-W2-04); no client duration trust
- Tests: wave2-unit + wave2-live security matrix
- Closeout: [RECORDING_WAVE2_IMPLEMENTATION_CLOSEOUT.md](./audits/RECORDING_WAVE2_IMPLEMENTATION_CLOSEOUT.md)
- OUT: PlaybackShell Record, QT product UI, anon, entitlements, janitor

---

## 2026-09-27 — RECORDING WAVE 1: TAKE FOUNDATION

**Status:** **IMPLEMENTED** (Owner review / commit pending)

- New domain table `takes` (not extending `beat_audio_assets`)
- Enums: `take_status`, `take_recording_mode`
- RLS: owner SELECT own non-deleted; client mutations DENY (service_role only)
- Private bucket `take-audio` (client Storage INSERT/SELECT DENY)
- Object key helpers + `src/config/recording.ts` retention/anti-abuse constants
- Tests: wave1-foundation unit + live RLS/storage
- Migration: `20260927180000_recording_wave1_take_foundation.sql` (applied remote)
- OUT: MediaRecorder, Record UI, upload transport API, shared grants, janitor

---

## 2026-09-27 — RECORDING / QUICK TAKE DESIGN FREEZE v1.0 LOCKED

**Status:** **DESIGN FREEZE LOCKED** · Owner D01–D08 / OD-REC-01…08 **CLOSED** · **IMPLEMENTATION NONE**

- Canonical: [PHASE_RECORDING_DESIGN_FREEZE.md](./phases/PHASE_RECORDING_DESIGN_FREEZE.md)
- RECORD ≠ PLAYBACK ≠ DOWNLOAD; anon QT IN V1; shared grants IN EPIC; hybrid Account Level + future Premium
- Retention: BEGINNER 24h · PRO 10d · LEGEND 30d; anti-abuse caps locked; own take download YES (anon no durable DL)
- MIC TAKE ≠ mix; MIX/EXPORT OUT (OD-14); `MIN(beat, entitlement, 180)` server-enforced
- Next: Wave 1 Implementation AUDIT/PLAN only after separate Owner GO

---

## 2026-09-27 — COMMUNITY WAVE 5: HARDENING + EPIC CLOSEOUT

**Status:** **IMPLEMENTED / VERIFIED** · EPIC **COMPLETE / LOCKED**

- Submit cooldown: `beats.last_submitted_at` + trigger (60s) + service `assertSubmitCooldown`
- Cleared on `REJECTED → DRAFT` (legitimate rework allowed)
- Security regression suite (AuthZ/IDOR/READY/Storage/public visibility)
- Live E2E: cooldown DENY · reject/rework · approve · publish · public · PLATFORM regression
- Audit/telemetry: DOWNLOAD_EVENT remains SSOT for downloads; beat lifecycle audit **deferred** (invariants enforced without new framework)
- Migration: `community_wave5_submit_cooldown`

---

## 2026-09-27 — COMMUNITY WAVE 4: STAFF PUBLISH APPROVED USER BEATS

**Status:** **IMPLEMENTED / VERIFIED** · ADMIN + MODERATOR · USER DENY · READY hard gate first

- `publishApprovedUserBeat`: `beats.publish` → APPROVED USER only → READY+object-key gate → `PUBLISHED`
- Moderation UI: tabs W moderacji / Zaakceptowane · `Opublikuj` (no metadata edit)
- Public reuse: `/beats` · `/beat/[id]` · PlaybackShell · Access Gate · download / My Downloads
- USER: status Opublikowany · CTA `Zobacz bit`
- Tests: community-wave4 unit A–R + live E2E; PLATFORM regression PASS
- No new migration (Wave 1 MOD publish RLS reused)

---

## 2026-09-27 — COMMUNITY WAVE 3: SUBMIT + MODERATION

**Status:** **IMPLEMENTED / VERIFIED** · APPROVED ≠ PUBLISHED · Wave 4 publish still pending

- Submit: `submitUserBeat` DRAFT→PENDING_REVIEW (own USER + active MASTER READY revalidated)
- Moderation: `approveUserBeat` / `rejectUserBeat` (+ required `rejection_reason`); queue `/admin/moderation`
- USER UI: `/beats/upload`, `/account/beats`; Polish status labels; resubmit after REJECTED→DRAFT
- MOD playback via existing PlaybackShell + Access Gate (staff non-public PLAYBACK)
- Migration `community_wave3_user_edit_freeze`: USER metadata edits only DRAFT/REJECTED
- Tests: community-wave3 unit + live RLS/E2E; APPROVED not in public catalog
- Wave 4 remaining: APPROVED→PUBLISHED UI/flow (service already exists)

---

## 2026-09-27 — COMMUNITY WAVE 2: USER SIGNED AUDIO TRANSPORT

**Status:** **IMPLEMENTED / VERIFIED** · Storage INSERT still **DENY** · beat stays **DRAFT**

- Reuse Audio Transport V1: signed upload → analyze → finalize → MASTER READY
- Routes: `POST /api/beats/audio/session`, `POST /api/beats/audio/analyze`, `finalizeUserBeatWithMasterAction`
- Object key: `user/{ownerId}/{beatId}/{assetId}/master.bin` (server-chosen)
- Migration `community_wave2_user_audio`: asset trigger allows USER beats with `user/{ownerId}/` prefix
- Replacement: new PENDING → READY activates; previous MASTER → REPLACED
- Live E2E: `bpm-120-steady.wav` → duration 30 · BPM 120 · no 413 · DRAFT retained
- IDOR / AuthZ unit tests + PLATFORM transport regression preserved

---

## 2026-09-27 — COMMUNITY WAVE 1: OWNERSHIP / RLS / AUTHZ FOUNDATION

**Status:** **IMPLEMENTED** · Design Freeze honored · UI/transport **OUT**

- Migration `community_wave1_ownership`: `rejection_reason`, USER `beats.create`, `beats.publish` (ADMIN+MODERATOR), RLS insert/update, trigger rewrite
- App: ownership-aware `assertPublishHardGate`; USER/MOD transition matrix; community service contracts; `user/` object key validator
- Tests: community-wave1 contracts A–T + IDOR; total suite GREEN
- Live RLS: USER own insert/select; foreign/PLATFORM/PUBLISHED insert DENY; MOD reject+reason / approve; ADMIN PLATFORM insert regression
- Storage INSERT remains default deny

---

## 2026-09-27 — COMMUNITY BEAT UPLOAD + MODERATION — DESIGN FREEZE

**Status:** Design Freeze **READY / OWNER GO** · Implementation **NONE** · Migration **NONE**

- Owner GO closed OD-COMMUNITY-01…05 (staff publish; rejection_reason; USER `beats.create`; all account levels upload; USER archive own PUBLISHED)
- Frozen: USER ownership + lifecycle DRAFT→PENDING_REVIEW→APPROVED→PUBLISHED; USER never publishes; reuse `beat-audio` + signed upload; object key `user/{ownerId}/{beatId}/{assetId}/master.bin`
- Docs: [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)
- Baseline: `47643c2` · Production GREEN · Phase 1.9 CLOSED

---

## 2026-09-27 — EPIC-A: PHASE 1.9 CLOSEOUT + PUBLISH HARD GATE

**Status:** Implementation **COMPLETE** on `main` @ `47643c2` · Phase 1.9 **CLOSED / LOCKED** · Production **VERIFIED GREEN**

- Server: `transitionBeatStatus(…, PUBLISHED)` requires PLATFORM + active MASTER READY (same `beat_id`); create no longer inserts as PUBLISHED
- UI publish gate preserved; GAP-PUBLISH-READY **CLOSED**
- Docs reconciled; production verify GREEN @ `47643c2`

---

## 2026-09-27 — AUDIO TRANSPORT V1 (SIGNED BINARY UPLOAD)

**Status:** Design Freeze **APPROVED** · Implementation **CLOSED / PRODUCTION VERIFIED** @ `73e213c`

- Gap: base64 Server Action vs Next.js 1 MB body limit blocked >1 MB WAV E2E
- Decision: **signed binary upload** to private `beat-audio` (not bodySizeLimit-as-fix; not RH multipart as sole path)
- DRAFT-beat-first · BPM V1 unchanged (`471dd5b`)
- Live E2E localhost + production: `bpm-120-steady.wav` ~2.52 MiB → session → signed upload → analyze → finalize · no HTTP 413 · BPM 120 AUTO_SUGGEST
- Docs: [PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md](./phases/PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md) · [AUDIO_TRANSPORT.md](./architecture/AUDIO_TRANSPORT.md)

---

## 2026-09-27 — BPM PRODUCTION IMPLEMENTATION V1

**Status:** **IMPLEMENTED** on `main` · **ACCURACY NOT CERTIFIED** · Phase 1.9 **NOT CLOSED**

- Platform Beat create: A=`tempo()` + B=`combTempo()` → C_NEAR → RULE B → AUTO_SUGGEST | MANUAL_REQUIRED
- Server re-probe + `resolveCreateBpm`; client BPM untrusted; user override allowed (1–300)
- DB unchanged (`beats.bpm` only); no telemetry / confidence columns
- Docs: [PHASE_BPM_DESIGN_FREEZE.md](./phases/PHASE_BPM_DESIGN_FREEZE.md) · [BPM_AUTO_DETECTION.md](./architecture/BPM_AUTO_DETECTION.md)

---

## 2026-09-26 — SCOPE B — BPM AUTO-DETECTION (RESEARCH → V1)

**Status:** Research + Design Freeze completed; production wiring shipped as V1 above · **NOT accuracy-certified**

- Detector: `@audio/beat` signal analysis (not ID3); decode WAV/MP3 via `audio-decode`; FLAC/AAC/M4A → manual BPM
- Experiments V2–V5 + Design Freeze precede production resolver (C_NEAR + RULE B)
- Benchmark fixtures remain outside git; accuracy Owner-gated

---

## 2026-09-26 — SCOPE A — AUDIO-FIRST PLATFORM BEAT UPLOAD (LOCAL)

**Status:** Scope A **IMPLEMENTED locally** · BPM auto (**Scope B**) **DEFERRED** · Phase 1.9 **NOT CLOSED** · **NO COMMIT / NO PUSH**

- `/admin/beats/new`: audio-first UX — select file → server `music-metadata` duration → title suggestion → manual BPM/metadata → CREATE DRAFT + existing MASTER upload pipeline
- `duration_seconds`: server source of truth (`Math.round` float → int); range 1–180; no hardcoded 120; manual duration input removed
- Title: pure `suggestTitleFromFilename` (editable); BPM: manual only, no default 140, no detector
- Dependency: `music-metadata` (server-only / `serverExternalPackages`); no Access Gate / RLS / AuthZ / GAP-PUBLISH-READY changes
- Scope B (BPM auto-detection): **DEFERRED — Owner GO required**
- Next: Owner uses audio-first create → READY → UI publish → agent live E2E

---

## 2026-09-26 — PHASE 1.9 — FIRST PLATFORM BEAT (BLOCKED ON OPERATOR UI)

**Status:** Cold-start **PASS** · ADMIN **PASS** · First beat **BLOCKED** (no ADMIN browser session for agent) · Phase **NOT CLOSED**

- Live: ADMIN=1 · beats=0 · PUBLISHED=0 · READY=0 · events=0 · `beat-audio` private
- No new architecture; REUSE Phase 1.7 admin UI + 1.5 Access Gate + 1.8A downloads
- Agent cannot complete create/upload/publish without Owner ADMIN login + MASTER file via UI
- Fixture (outside git): `../bitrymdym-fixtures/phase19-master-tone.wav` (5s tone WAV)
- Local uncommitted: admin nav „Panel administratora”; Phase 1.9 docs drift updates
- Next: Owner creates + publishes first PLATFORM beat → agent resumes live E2E

---

## 2026-09-26 — AUTH PRODUCTION CANONICAL URL FIX (IN PROGRESS)

**Status:** Code + Vercel env updated · **Supabase Auth Site URL = HUMAN OPERATOR REQUIRED** · Phase 1.9 still PARTIAL

- Canonical production origin: `https://bitrymdym.pl`
- Code: `getSiteUrl()` / `getAuthEmailRedirectTo()`; `signUp` passes `emailRedirectTo` → `/account`
- Production guard: `VERCEL_ENV=production` never falls back to `*.vercel.app`
- Vercel Production env: `NEXT_PUBLIC_SITE_URL=https://bitrymdym.pl` set
- Custom SMTP / branded sender: **OUT** (future Owner GO)
- Supabase Dashboard still required:
  - Site URL → `https://bitrymdym.pl`
  - Redirect allow-list: `https://bitrymdym.pl/**`, `https://www.bitrymdym.pl/**`, localhost, preview wildcards
- Deploy of this commit required before production signup sends BitRymDym redirects from app `emailRedirectTo`

---

## 2026-09-26 — PHASE 1.9 — DESIGN FREEZE APPROVED / IMPLEMENTATION IN PROGRESS

**Status:** DESIGN FREEZE **APPROVED / LOCKED** · IMPLEMENTATION **IN PROGRESS** · PRODUCTION BOOTSTRAP **PENDING** (not CLOSED)

- Candidate: Operator Production Enablement (OD-20 manual ADMIN + first PLATFORM beat + live E2E)
- Freeze: [PHASE_1_9_DESIGN_FREEZE.md](./phases/PHASE_1_9_DESIGN_FREEZE.md)
- Runbook: [PRODUCTION_BOOTSTRAP.md](./runbooks/PRODUCTION_BOOTSTRAP.md)
- No app/DB/bootstrap code; no migration; OD-20 unchanged
- Live baseline pre-bootstrap: ADMIN/PUBLISHED/READY/users/beats = 0
- Next: Human operator executes runbook → production verify → closeout
- FOLLOW-UP: stale drift in `PHASE_1_FOUNDATION.md` + root `README.md` (not fixed in this phase unless Owner expands docs GO)

---

## 2026-09-26 — PHASE 1.8A — CLOSED / LOCKED (production verified)

**Status:** **COMPLETE / CLOSED / LOCKED** @ `fd87f23` on `main` / `origin/main`

- Commit: `fd87f23` — `feat(downloads): complete phase 1.8a download productization`
- Push: COMPLETE → `origin/main`
- Production deploy: Vercel **success**; live marker Phase 1.8A on bitrymdym.pl / www / vercel.app
- Production Verify: **PASS** (homepage, sign-in/up, `/account/downloads` anon → sign-in gate, security smoke)
- Live Download E2E: **NOT VERIFIED** (`published_count=0`, `admin_count=0` / OD-20) — non-blocking
- Next: **COLD-START AUDIT (next Foundation candidate)**

---

## 2026-09-26 — PHASE 1.8A — DOCUMENTATION CLOSEOUT COMPLETE

**Status:** IMPLEMENTATION AUDIT PASS · DOCUMENTATION CLOSEOUT COMPLETE · **READY FOR OWNER REVIEW** (not CLOSED)

- Design Freeze: [PHASE_1_8A_DESIGN_FREEZE.md](./phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED
- OD-05 = 2 / UTC day · OD-06 = 4 / UTC day · OD-17 = signed URL SUCCESS → finalize event
- Flow: AUTH → AUTHZ → READY → RESERVATION (TTL 120s, not an event) → signed URL → FINALIZE → `beat_download_events`
- Audit: OD-17 / reservation / crash safety / concurrency / grants / RLS / security PASS; tests **84/84**
- Known non-blocking: no live RLS/concurrency integration tests; Live E2E NOT VERIFIED (`published_count=0`, `admin_count=0`)
- Homepage stale “Download OUT” copy corrected
- Phase **NOT CLOSED**; not committed / not pushed
- Next: OWNER REVIEW → COMMIT → PUSH → PRODUCTION VERIFY

---

## 2026-09-26 — PHASE 1.8A — IMPLEMENTATION FIX (OD-17 reservation)

**Status:** IMPLEMENTATION COMPLETE (fix) — uncommitted — **READY FOR IMPLEMENTATION AUDIT**

- Root cause addressed: provisional event-before-URL rejected
- Model: `beat_download_reservations` (ephemeral) ≠ `beat_download_events` (final OD-17)
- Flow: AuthZ → reserve → signed URL SUCCESS → finalize event
- Least-privilege: revoked anon/authenticated DML on events; reservations client-denied
- Dropped `claim_beat_download_slot`; RPCs service_role only
- Migration: `phase_1_8a_download_reservation` applied remote
- Phase **NOT CLOSED**

---

## 2026-09-26 — PHASE 1.8A — IMPLEMENTATION COMPLETE (not CLOSED)

**Status:** IMPLEMENTATION COMPLETE — local / uncommitted — **READY FOR IMPLEMENTATION AUDIT**

- Design Freeze: [PHASE_1_8A_DESIGN_FREEZE.md](./phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED
- Migrations: `phase_1_8a_download_events`, `phase_1_8a_claim_rpc_grants` (applied remote)
- Table: `beat_download_events` + RLS (own SELECT); claim RPC service_role only
- Config SSOT: `src/config/downloads.ts` (anon=2, user=4, UTC day)
- Access Gate REUSE: DOWNLOAD branch + atomic limit claim + event
- UI: Download CTA on `/beat/[id]`; Moje pobrane `/account/downloads`
- OD-05 / OD-06 / OD-17 CLOSED interim; OD-13 / OD-04 OUT
- Tests 59/59; lint / typecheck / build PASS
- Live Download E2E: **NOT VERIFIED** (empty catalog / no ADMIN)
- Phase **NOT CLOSED**; not committed / not pushed

---

## 2026-09-26 — PHASE 1.7 — COMPLETE / CLOSED / LOCKED

**Status:** COMPLETE / COMMITTED / PUSHED — `ed499ee` on `main` / `origin/main`

- Commit: `ed499ee` — `feat(admin): complete phase 1.7 platform content ops`
- Design Freeze: [PHASE_1_7_DESIGN_FREEZE.md](./phases/PHASE_1_7_DESIGN_FREEZE.md) — APPROVED / LOCKED
- Routes: `/admin`, `/admin/beats`, `/admin/beats/new`, `/admin/beats/[id]`
- REUSE: createPlatformBeat, updateBeatMetadata, uploadPlatformBeatAudio, lifecycle `DRAFT → PUBLISHED`, Access Gate PLAYBACK
- UI Publish gate: READY MASTER required; GAP-PUBLISH-READY server hard rule preserved
- Production: **GREEN / VERIFIED** (Vercel PASS)
- Production smoke: public/auth/routing/security/regression **PASS**
- Live Admin E2E: **NOT VERIFIED** — OD-20 / `admin_count=0` (non-blocking)
- Published Content E2E: **NOT VERIFIED** — `published_count=0` (non-blocking)
- Audit infrastructure GAP preserved; OD-04 … OD-18 remain OPEN
- Next: Cold-Start Audit for next Foundation candidate

---

## 2026-09-26 — PHASE 1.6 — COMPLETE / CLOSED / LOCKED

**Status:** COMPLETE / COMMITTED / PUSHED — `39be430` on `main` / `origin/main`

- Commit: `39be430` — `feat(beats): complete phase 1.6 playback surface`
- Design Freeze: [PHASE_1_6_DESIGN_FREEZE.md](./phases/PHASE_1_6_DESIGN_FREEZE.md) — APPROVED / LOCKED
- Routes: `/beats` (PUBLISHED-only catalog), `/beat/[id]` (PUBLISHED-only detail + PlaybackShell)
- Playback via existing Access Gate (`PLAYBACK` only); signed PLAYBACK URL
- Hard OUT: DOWNLOAD UI / limits / counters / audit; Quick Take; waveform engine
- Production: **GREEN / VERIFIED**
- OD-04 … OD-18 remain OPEN
- Downloads remain **PARTIAL**; Quick Take **NOT STARTED**
- Next: Phase 1.7 Cold-Start candidates → Owner Design Freeze selection

---

## 2026-09-26 — PHASE 1.5 — COMPLETE / LOCKED

**Status:** COMPLETE / COMMITTED / PUSHED — `0ec0be0` on `main` / `origin/main`

- Commit: `0ec0be0` — `feat(audio): complete phase 1.5 private storage and access gate`
- Design Freeze: `0e5c491`
- Migration `20260925220000_phase_1_5_audio_storage.sql` / live `phase_1_5_audio_storage`
- Private bucket `beat-audio`; `beat_audio_assets`; Access Gate; signed URL PLAYBACK 120s / DOWNLOAD 300s
- Unit 28/28; live Storage/RLS/signed URL PASS; pre-commit audit PASS
- OD-12 remains OPEN; player/limits/Quick Take/community/payments out of scope
- Next: Phase 1.6 Cold-Start Audit

---

## 2026-09-26 — PHASE 1.5 — PRIVATE AUDIO STORAGE + ACCESS GATE (IMPLEMENTATION)

**Status:** superseded by COMPLETE / LOCKED entry above (`0ec0be0`)

- Migration `20260925220000_phase_1_5_audio_storage.sql` applied live (`phase_1_5_audio_storage`)
- Private bucket `beat-audio`; table `beat_audio_assets`; no audio columns on `beats`
- Object keys opaque `.bin`; interim MIME allow-list + 50 MiB (OD-12 OPEN)
- Access Gate: anonymous / authenticated / admin upload paths; signed URL PLAYBACK 120s / DOWNLOAD 300s
- ADMIN PLATFORM upload only; USER/MODERATOR upload DENY; MODERATOR download DENY
- Unit 28 PASS; live Storage/RLS/signed URL PASS; lint / typecheck / build PASS
- Out of scope: player, limits, Quick Take, community upload, watermark, payments

---

## 2026-09-26 — PHASE 1.5 — DESIGN FREEZE LOCKED

- Commit: `0e5c491` — `docs(phase-1.5): freeze private audio storage architecture`
- Document: `docs/phases/PHASE_1_5_DESIGN_FREEZE.md`
- Pushed to `origin/main`

---

## 2026-09-25 — PHASE 1.4 — BEATS DOMAIN FOUNDATION (COMPLETE / LOCKED)

**Status:** COMPLETE / COMMITTED / PUSHED — `6cb1e9a` on `main` / `origin/main`

- Migration `20260925130000_phase_1_4_beats.sql` applied live on `rzzxrgcdogkybkiidqgw` (additive; no `db reset`)
- `beat_status` / `beat_ownership_type` enums; `public.beats` metadata table (no audio columns)
- Ownership integrity (PLATFORM⇒null owner; USER⇒required owner); status transition guards; prefer ARCHIVE
- RLS: published public read; admin write; moderator review path; ownership/status protected
- Domain: `Beat` / `BeatStatus` / `BeatOwnershipType`; central validator + transitions; `src/lib/beats/*`
- Unit 21/21 PASS; live RLS PASS; lint / typecheck / build PASS
- Docs: `BEATS.md` + PROJECT_STATE / PHASE_1 / SYSTEM_ARCHITECTURE / AUTHORIZATION / README
- Out of scope: Storage, player, downloads, Quick Take, community upload, payments
- OD-04…OD-18 remain OPEN (OD-12 OPEN)
- Next: Phase 1.5 Design Freeze (NOT STARTED)

---

## 2026-09-25 — PHASE 1.3 — DOCUMENTATION LOCK CLOSEOUT

- Docs aligned to canonical `main` @ `efe3f71`
- Phase 1.3 marked **COMPLETE / LOCKED**
- Ready for Phase 1.4 planning (no implementation in this closeout)

---

## 2026-09-25 — PHASE 1.3 — COMMIT + MAIN PROMOTION

- Commit: `efe3f71` — `feat(auth): complete phase 1.3 identity and rls`
- Branch: `cursor/phase-1-3-auth` pushed; fast-forward promoted to `main` / `origin/main`
- Identity / Auth foundation: profiles, roles, account levels, permissions, authorization helpers
- RLS + privilege escalation protection
- Live Supabase verification PASS (project `rzzxrgcdogkybkiidqgw`)
- Excluded from commit: `.env.local`, `.agents/`, `.cursor/`, `skills-lock.json`, `supabase/.temp/`

---

## 2026-09-25 — PHASE 1.3 — FINAL PRE-COMMIT AUDIT PASS

- Git: `.env.local` ignored; no secrets in diff
- Code/security review PASS (Role ≠ AccountLevel; no auto-admin; service role server-only)
- Lint / typecheck / unit / build PASS
- Status: **OWNER REVIEW COMPLETE** — **READY TO COMMIT** (commit/push not performed)

**Commit hygiene notes (non-blocking):** decide whether to include `.agents/`, `skills-lock.json`, `.cursor/mcp.json`, and `scripts/_live_verify_phase13.mjs` in the Phase 1.3 commit; `supabase/.temp/` now gitignored.

---

## 2026-09-25 — PHASE 1.3 — LIVE SUPABASE VERIFICATION PASS

- Supabase MCP configured (`.cursor/mcp.json` + user mcp) for project `rzzxrgcdogkybkiidqgw`
- MCP authenticated; identity migration applied via `apply_migration` (no `db reset`)
- Live Auth: profile auto-create → `USER` + `BEGINNER_RAPPER`
- Live RLS: own read ALLOW; cross-user DENY; display_name ALLOW; role/account_level escalation DENY
- Permission catalog writes DENY; Auth sign-in / session / sign-out PASS
- Unit 6/6 PASS; lint / typecheck / build PASS
- Status: **READY FOR OWNER REVIEW** (not locked; commit/push not performed)

---

## 2026-09-25 — PHASE 1.3 — CLI ACCESS RECOVERY ATTEMPT

- Diagnosed: CLI credential in Windows Credential Manager belongs to a different Supabase account
- Visible projects: unrelated only (not BitRymDym)
- `supabase link --project-ref rzzxrgcdogkybkiidqgw` → privilege denied
- Agent shell is non-TTY → interactive `supabase login` impossible
- Blocker narrowed to: **SUPABASE_ACCESS_TOKEN** from BitRymDym-owning account
- Migration / live Auth/RLS: still not executed

---

## 2026-09-25 — PHASE 1.3 — LIVE SUPABASE VERIFICATION (PARTIAL)

- `.env.local` created locally (gitignored) for project `rzzxrgcdogkybkiidqgw`
- Auth API health: OK
- Identity migration: **NOT APPLIED** (CLI link denied for this project; no DB password / Management token)
- Live Auth/RLS suite: **NOT RUN**
- Result: **BLOCKED** — awaiting migration apply path from Owner

**Static security audit:** PASS · **Unit:** PASS · **Live RLS:** BLOCKED

---

## 2026-09-25 — PHASE 1.3 — LIVE SUPABASE VERIFICATION ATTEMPT

- Runtime check performed: `.env.local` absent; no BitRymDym project linked
- Local Docker Supabase unavailable
- Unrelated CLI-visible org projects: not used
- Migration / live Auth / live RLS: **not executed**
- Result: **SUPABASE RUNTIME UNAVAILABLE** / **BLOCKED**

**Static security audit:** PASS · **Unit:** PASS · **Live RLS:** BLOCKED

---

## 2026-09-25 — PHASE 1.3 — OWNER DECISIONS CLOSED

- OD-19 closed
- BEGINNER_RAPPER approved as signup default
- OD-20 closed
- no automatic first-admin mechanism
- manual/operator-controlled admin bootstrap
- live Supabase verification remains pending

**Static security audit:** PASS · **Live RLS:** BLOCKED (credentials)

---

## 2026-09-25 — PHASE 1.3 — AUTH + USERS / ROLES / PERMISSIONS / PROFILES

**Status:** PENDING OWNER REVIEW

- Supabase Auth integration (sign-up / sign-in / sign-out) — minimal UI
- `profiles` + trigger on Auth user create (default role `USER`)
- Roles: ADMIN / MODERATOR / USER; Account levels: working SSOT names
- Permission catalog seeded from SSOT §36 examples; role mapping ADMIN + MODERATOR
- Server authorization helpers (`requireUser` / `requireRole` / `requirePermission`)
- RLS + privilege-escalation trigger in SQL migration
- Unit tests for authorization helpers
- Docs: AUTHORIZATION.md; OD-19 / OD-20 initially OPEN (closed in later entry same day)
- Live Supabase project credentials: not configured in agent environment

**Not included:** Beats, tracks, audio, Quick Take, downloads, payments, admin panel, auto-admin bootstrap.

---

## 2026-09-25 — PHASE 1.2 — APPLICATION SCAFFOLD / TECHNICAL BOOTSTRAP

**Status:** LOCKED (Owner APPROVED)

- Next.js 16 App Router + TypeScript + Tailwind CSS v4
- shadcn/ui baseline (minimal `Button` + utils) as technical base only
- BitRymDym Design System foundation (`src/styles/tokens.css`, `src/components/brand`)
- Supabase client integration stubs (`src/lib/supabase/*`) — no schema / Auth / RLS / Storage
- `.env.example` placeholders only
- Base application shell `/` + `loading` / `error` / `not-found`
- Domain type foundation (`Role` ≠ `AccountLevel`)
- Validation: lint PASS, typecheck PASS, build PASS
- Documentation updated (PROJECT_STATE, PHASE_1, APPLICATION_SCAFFOLD, architecture)

**Not included:** Auth, Users, Roles, Permissions, Profiles, beats, player, Quick Take, downloads, payments, production Supabase setup.

---

## 2026-09-25 — Foundation Documentation Baseline LOCKED

- OD-01 closed
- OD-02 closed
- OD-03 closed
- System Architecture documented
- Project State established
- Documentation Continuity Rule established
- Foundation documentation approved by Owner
- No application implementation started

**Foundation Documentation Baseline:** LOCKED
**Application implementation:** not started.

---

## 2026-09-25 — Foundation documentation closeout (pre-lock)

- OD-01 CLOSED / ACCEPTED (frontend stack)
- OD-02 CLOSED / ACCEPTED (Next.js application server)
- OD-03 CLOSED / ACCEPTED (Supabase infrastructure)
- System architecture baseline udokumentowany (`docs/architecture/SYSTEM_ARCHITECTURE.md`)
- Documentation Continuity Rule ustanowiona (`docs/DOCUMENTATION_CONTINUITY.md`)
- Project State utworzony (`docs/PROJECT_STATE.md`)
- Aktualizacja OPEN_DECISIONS, DECISION_LOG, SSOT (zgodność z OD-01–03), PHASE_1, docs README
