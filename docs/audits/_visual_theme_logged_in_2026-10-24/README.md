# Evidence — logged-in theme chrome (2026-10-24)

**Goal:** dark/light + Motyw before UserMenu after a **real** localhost login.  
**OD-15 / OD-16:** remain **OPEN**  
**Sacred WIP / `studio-editor.tsx` / recording / audio / CAS / migrations / deploy:** untouched  
**Auth spoof (DOM / cookies / storageState / post-load `data-theme`):** **not used**

## Overall: BLOCKED

No authorized localhost session and no runnable local Supabase (Docker absent). Logged-in visual PASS is **not** claimed.

## Session unlock attempts (this run)

| Step | Result |
|------|--------|
| Existing localhost auth fixture / Playwright storageState | **None** (repo search; nothing checked in) |
| `docker` / `podman` on PATH | **Absent** (`where` empty) |
| `C:\Program Files\Docker\Docker\Docker Desktop.exe` | **Absent** |
| Uninstall registry `*Docker*` | **Absent** |
| `http://127.0.0.1:54321` | **DOWN** |
| App `http://localhost:3456` | **UP** (points at remote Supabase in `.env.local` — **not** used for fixture user creation) |
| `_w2_ui_e2e_setup.mjs` against `.env.local` | **Skipped** (reads non-loopback; not localhost-only harness) |
| `db reset` / migrations / seeds | **Not run** (forbidden in this task; also unnecessary — stack never started) |

Owner doc already records Docker prerequisite: [LOCAL_BPM_E2E_ENVIRONMENT.md](../LOCAL_BPM_E2E_ENVIRONMENT.md).

## Gate probe (fresh Playwright, no cookies)

All targets redirect to `/sign-in` · `cookieCount: 0` · see `probe-no-session.json`.

| Route | Final URL | Logged-in visual |
|-------|-----------|------------------|
| `/studio` | `/sign-in` | **BLOCKED** |
| `/account/takes` | `/sign-in` | **BLOCKED** |
| `/account` | `/sign-in` | **BLOCKED** |
| `/account/downloads` | `/sign-in` | **BLOCKED** |
| `/settings` | `/sign-in` | **BLOCKED** |
| `/library` | `/sign-in` | **BLOCKED** |

**Dark/light × 1280×800 / 390×844 logged-in PNGs:** **NOT RUN** (no session)  
**IHDR of logged-in shots:** **N/A**  
**Toggle next to UserMenu (visual):** **NOT VERIFIED**  
**Theme persistence after login (storage ≡ data-theme ≡ `.dark`):** **NOT RUN**

## Code-only note (not a visual PASS)

`src/components/site/site-header.tsx`: `ThemeToggle` immediately before `UserMenu` when `session` is set — confirmed by read-only review only.

## Unblock (Owner)

1. Install/start **Docker Desktop** until `docker version` works.  
2. `supabase start` → fill `.env.local.e2e` from `supabase status -o env` (loopback only).  
3. Point local Next at that env; create disposable Auth user **only** on local stack (Studio or Auth Admin).  
4. Re-run capture into this folder: dark/light × desktop/mobile for the six routes; assert Motyw before account menu; mute audio; no Play/REC; no secrets in git.

## Controls actually run

| Control | Status |
|---------|--------|
| Docker / local Supabase availability | **FAIL** → session path **BLOCKED** |
| Playwright gated-route redirect probe | **PASS** (evidence of no session) |
| Logged-in screenshot pack | **NOT RUN** |
| Vitest / lint for this pack | **NOT RUN** (docs-only) |
| Production smoke / deploy claim | **NOT RUN** |
