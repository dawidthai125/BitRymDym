# User-facing Polish localization — FINAL CLOSEOUT

**Epic:** USER-FACING POLISH LOCALIZATION  
**Status:** **CLOSED**  
**Production:** **VERIFIED GREEN**  
**Final app SHA:** `ffe723b7235a53fd79853ccc4a399dbfb6281a76`  
**Final deployment:** `dpl_FkuQKRm6JE6gNqZkCopE4UmvUviM`  
**Policy:** Polish-only user-facing copy. No i18n framework introduced.  
**SSOT for this epic:** this document · email templates: [USER_FACING_POLISH_LOCALIZATION_EMAIL_TEMPLATES.md](./USER_FACING_POLISH_LOCALIZATION_EMAIL_TEMPLATES.md)

---

## 1. Final verdict

| Field | Value |
|-------|--------|
| Epic status | **CLOSED** |
| Production | **VERIFIED GREEN** |
| Application SHA | `ffe723b` |
| Deployment | `dpl_FkuQKRm6JE6gNqZkCopE4UmvUviM` · Ready · aliases `www.bitrymdym.pl` / `bitrymdym.pl` |
| P0 | **0** |
| P1 | **0** |
| P2 | **0** (both residual chrome findings **CLOSED**) |
| DB | **UNCHANGED** |
| Storage | **UNCHANGED** |
| Auth templates during final deploy gate | **UNCHANGED** |

### P2 findings (CLOSED)

| ID | Observed | Resolution | Status |
|----|----------|------------|--------|
| P2 #1 | `/` chrome `Workspace` | → `Studio` (reuse existing section label) | **CLOSED** @ `ffe723b` |
| P2 #2 | `/beats` mood filter `Raw` | → reuse UI taxonomy `Surowy` (`demo-beats` presentation only) | **CLOSED** @ `ffe723b` |

### Commit trail

| SHA | Role |
|-----|------|
| `4ebd1d3` | `feat(i18n): localize user-facing experience in Polish` — primary app localization |
| `ffe723b` | `fix(i18n): remove residual polish chrome leaks` — P2 Workspace/Raw · **final production tip** |

---

## 2. Production evidence (final verification)

| Surface | Result |
|---------|--------|
| Production identity (`ffe723b` / `dpl_FkuQKRm6JE6gNqZkCopE4UmvUviM`) | **PASS** |
| `/` | **PASS** (HTTP 200 · chrome `Studio` · no user-facing `Workspace`) |
| `/beats` | **PASS** (HTTP 200 · mood `Surowy` · no user-facing `Raw`) |
| `/sign-in` | **PASS** (Polish UI · invalid credentials → `Nieprawidłowy e-mail lub hasło.`) |
| `/sign-up` | **PASS** (Polish UI · no Phase/OD scaffold · mismatch → Polish alert) |
| `/forgot-password` | **PASS** (Polish UI · anti-enumeration success copy) |
| Auth observed UI flows | **PASS** |
| Recording (guest surface) | **PASS** |
| Player | **PASS** |
| Download (guest CTA) | **PASS** |
| Mix guest gate | **PASS** |
| Not found (`/this-page-does-not-exist`) | **PASS** (`Ta strona nie istnieje.`) |
| English leak residual (final P2 scope) | **0** |

Accepted product exceptions (unchanged): **MASTER** · **Rec** · English API JSON transport when not rendered.

---

## 3. Evidence limitations (not FAIL)

### Authenticated deep paths — not fully exercised

No controlled session/credentials for role-gated deep E2E in verification gates:

- `/account` (authenticated panels)
- authenticated studio / takes upload error paths
- authenticated mix/render entitlement errors
- grants
- admin / moderation

**Classification:** EVIDENCE LIMITATION — not an application FAIL.

### Supabase Auth email inbox E2E

```text
SUPABASE AUTH EMAIL E2E = BLOCKED — NO INBOX ACCESS
```

**Reason:** agent had no controlled BitRymDym test mailbox.

**Dashboard configuration (separate from inbox E2E):** Confirm signup + Reset password Polish subjects/bodies applied; TokenHash callback contract verified configurationally; `ConfirmationURL` unused for those two flows. See [EMAIL_TEMPLATES](./USER_FACING_POLISH_LOCALIZATION_EMAIL_TEMPLATES.md).

**Classification:** EVIDENCE LIMITATION — not an application FAIL. Do **not** report as PASS inbox E2E.

---

## 4. Implementation notes (retained)

### Central mapping

- Primary contract: `src/lib/ui/user-errors.ts`
  - `mapSupabaseAuthError` / `toUserFacingAuthError`
  - `toUserFacingError(domain)`
  - domain helpers: mix / grant / upload
- Existing safe helpers reused (no second system):
  - `toSafePlaybackErrorMessage` / `toSafeDownloadErrorMessage` → thin wrappers over central mapper
  - `toUserFacingTakeUploadError` → specialized take transport strings, fallback via central mapper (**never** `return message` for unknown English)

### Raw error leak prevention

- Auth actions map Supabase / AuthError before returning `AuthActionState.error`
- Global `src/app/error.tsx` never renders `error.message`
- Player / download / mix / grants / upload UI map at the presentation boundary
- Internal AuthError English strings may remain server-side; UI must not show them raw

### Product terminology allowed

Premium, FREE, BRONZE, SILVER, GOLD, MP3, WAV, HQ, BPM (and similar intentional product terms).

### Explicit non-changes (epic)

- No capability matrix / Premium limits / Recording entitlement / AuthZ / RLS / DB / Storage / callback contract changes for localization itself
- Final deploy gate did not mutate DB, Storage, or Auth templates

---

## 5. Closeout integrity

| Item | Status |
|------|--------|
| Docs closeout | **THIS DOCUMENT** |
| New production deploy from docs commit | **FORBIDDEN / NOT DONE** |
| Production application SHA after docs push | **must remain** `ffe723b` |
| Next epic | **Owner direction only** — not started by this closeout |
