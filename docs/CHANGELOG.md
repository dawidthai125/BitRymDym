# Changelog

Wszystkie istotne zmiany dokumentacji i (później) aplikacji.

Format: data, zakres, skrót.

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
