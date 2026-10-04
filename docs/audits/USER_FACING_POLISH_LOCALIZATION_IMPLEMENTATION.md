# User-facing Polish localization — implementation notes

**Gate:** IMPLEMENTATION + LOCAL VERIFICATION (no deploy / no commit)
**Policy:** Polish-only user-facing copy. No i18n framework introduced.

## Central mapping

- Primary contract: `src/lib/ui/user-errors.ts`
  - `mapSupabaseAuthError` / `toUserFacingAuthError`
  - `toUserFacingError(domain)`
  - domain helpers: mix / grant / upload
- Existing safe helpers reused (no second system):
  - `toSafePlaybackErrorMessage` / `toSafeDownloadErrorMessage` → thin wrappers over central mapper
  - `toUserFacingTakeUploadError` → specialized take transport strings, fallback via central mapper (**never** `return message` for unknown English)

## Raw error leak prevention

- Auth actions map Supabase / AuthError before returning `AuthActionState.error`
- Global `src/app/error.tsx` never renders `error.message`
- Player / download / mix / grants / upload UI map at the presentation boundary
- Internal AuthError English strings may remain server-side; UI must not show them raw

## Product terminology allowed

Premium, FREE, BRONZE, SILVER, GOLD, MP3, WAV, HQ, BPM (and similar intentional product terms).

## Supabase Auth emails

Prepared Polish copy lives in
`docs/audits/USER_FACING_POLISH_LOCALIZATION_EMAIL_TEMPLATES.md`
as **EXTERNAL SUPABASE DASHBOARD CONFIGURATION** — Dashboard not changed in this gate.

## Explicit non-changes

- No capability matrix / Premium limits / Recording entitlement / AuthZ / RLS / DB / Storage / callback contract changes
- No production deploy, migrations, commit, or push in this gate
