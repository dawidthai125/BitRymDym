# Evidence — logged-in theme chrome (2026-10-24)

**Scope requested:** Studio, `/account/takes`, account + downloads, settings, library — dark/light × desktop/mobile, toggle next to account menu.  
**OD-15 / OD-16:** remain **OPEN**  
**Sacred WIP / `studio-editor.tsx` / recording / audio / CAS / migrations:** untouched

## Verdict

| Route group | Status | Reason |
|-------------|--------|--------|
| Studio (hub + editor) | **NOT VERIFIED** | No authorized session |
| `/account/takes` | **NOT VERIFIED** | No authorized session |
| `/account`, `/account/downloads` | **NOT VERIFIED** | No authorized session |
| `/settings` | **NOT VERIFIED** | No authorized session |
| `/library` (+ favorites/downloads links) | **NOT VERIFIED** | No authorized session |
| Production UI smoke / deploy claim | **NOT RUN** | Out of scope; no prod evidence this session |

**Screenshots of logged-in chrome:** **not produced** (would require spoofing the auth gate or a real session).

## Session probe (no spoof)

| Check | Result |
|-------|--------|
| Playwright fresh context → `GET /studio` | Redirect `http://localhost:3456/sign-in` · **0** cookies · **0** auth cookie names |
| Cursor IDE browser → `GET /account` | Lands on `/sign-in` (empty form; Motyw toggle present) |
| Docker / `supabase status` | **BLOCKED** — `docker` not on PATH · local stack cannot start |
| App `.env.local` Supabase host | `*.supabase.co` (remote) — not loopback fixture stack |
| `.env.local.e2e` | Loopback template present, but local Supabase **not running** |
| Checked-in Playwright `storageState` / auth fixture for browser | **UNAVAILABLE** (read-only audit of e2e scripts/docs) |

Creating disposable Auth users against the remote project solely for theme screenshots was **not** done (egress / ordinary-dev practice; not an authorized local fixture session).

## What remains true from prior packs

- Public + auth-form dark/light chrome and Motyw placement by **Zaloguj**: prior PASS — `_visual_theme_global_routes_2026-10-24/`
- Toggle by **UserMenu** when logged in: **code order** in `site-header.tsx` (ThemeToggle immediately before UserMenu) — **not visually confirmed** without session

## Unblock (Owner)

1. Start **local** Supabase (Docker) + app pointed at loopback, **or** provide an existing disposable local/fixture login for `localhost` only.  
2. Re-run capture: dark/light × 1280×800 / 390×844 for `/studio`, `/account/takes`, `/account`, `/account/downloads`, `/settings`, `/library` with assert Motyw before account menu · muted audio · no Play.
