# Changelog

Wszystkie istotne zmiany dokumentacji i (później) aplikacji.

Format: data, zakres, skrót.

---

## 2026-09-26 — PHASE 1.6 — PUBLISHED BEATS + PLAYBACK SHELL (LOCAL IMPLEMENTATION)

**Status:** IMPLEMENTED locally — Design Freeze APPROVED / LOCKED — **not committed**

- Freeze: `docs/phases/PHASE_1_6_DESIGN_FREEZE.md`
- Routes: `/beats` (PUBLISHED catalog), `/beat/[id]` (detail + Playback Shell)
- Playback via existing Access Gate (`PLAYBACK` only); no second signed-URL service
- Hard OUT: DOWNLOAD UI, Quick Take, waveform engine
- Unit 40/40; lint / typecheck / build PASS
- Prior docs reconciliation (Phase 1.5 stale pointers) included in dirty tree
- Next: Implementation Audit → commit / push

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
