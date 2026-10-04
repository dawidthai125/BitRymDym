# User-facing Polish localization — Supabase Auth email templates

**Epic:** USER-FACING POLISH LOCALIZATION — **CLOSED** (app UX)  
**Email inbox E2E:** **BLOCKED — NO INBOX ACCESS** (evidence limitation — not app FAIL)  
**Dashboard Confirm + Reset:** **APPLIED** · configurationally verified (Polish subjects/bodies · TokenHash contract · ConfirmationURL absent)  
**Applied timestamp (UTC):** 2026-10-04T09:20:00Z (approx.)  
**Final production app SHA:** `ffe723b` · deployment `dpl_FkuQKRm6JE6gNqZkCopE4UmvUviM`  
**Auth templates during final deploy gate:** **UNCHANGED**  
**Epic closeout SSOT:** [USER_FACING_POLISH_LOCALIZATION_IMPLEMENTATION.md](./USER_FACING_POLISH_LOCALIZATION_IMPLEMENTATION.md)

Templates are **EXTERNAL SUPABASE DASHBOARD CONFIGURATION**.
They are not versioned as HTML in this repository.

**Do not treat Dashboard apply as real inbox E2E PASS.**

---

## 1. Callback contracts (VERIFIED — do not change)

| Contract | Value |
|---|---|
| Site URL (production) | `https://bitrymdym.pl` |
| App signup `emailRedirectTo` | `https://bitrymdym.pl/auth/callback` (`getAuthEmailRedirectTo`) |
| App recovery `redirectTo` | `https://bitrymdym.pl/auth/callback?flow=recovery` (`getAuthPasswordResetRedirectTo`) |
| Confirm signup template path | `CONFIRMATION_EMAIL_CALLBACK_PATH` = `/auth/callback?token_hash={{ .TokenHash }}&type=signup` |
| Reset password template path | `RECOVERY_EMAIL_CALLBACK_PATH` = `/auth/callback?token_hash={{ .TokenHash }}&type=recovery` |
| Post-confirm UX | `/auth/confirmed` (+ `CONFIRMATION_COPY` already Polish) |
| Post-recovery UX | `/auth/reset-password` |

### Recovery flow (must stay intact)

```
requestPasswordResetAction
  → resetPasswordForEmail(email, { redirectTo: .../auth/callback?flow=recovery })
  → email (Reset Password template)
  → OTP link: /auth/callback?token_hash={{ .TokenHash }}&type=recovery
     (PKCE fallback: /auth/callback?code=…&flow=recovery)
  → verifyOtp / exchangeCodeForSession
  → keep session → /auth/reset-password
  → updatePasswordAfterResetAction
```

**CRITICAL:** Confirm signup + Reset password templates MUST use `{{ .TokenHash }}` links to BitRymDym `/auth/callback`.
Do **NOT** use `{{ .ConfirmationURL }}` for those two product-critical templates (cross-browser / prefetch; locked by `confirmation.test.ts`).

Do **NOT** change: `token_hash`, `type=recovery`, `type=signup`, `flow=recovery`, `/auth/callback`, `/auth/reset-password`.

---

## 2. Email template inventory

| # | Dashboard template | Product uses today? | Configure now? | Link required? | Required variables | Risk if wrong |
|---|---|---|---|---|---|---|
| 1 | Confirm signup | **YES** (`signUp` + email confirm) | **YES — REQUIRED** | YES | `SiteURL`, `TokenHash` | Broken signup activation |
| 2 | Reset password | **YES** (forgot/reset password) | **YES — REQUIRED** | YES | `SiteURL`, `TokenHash` | Broken recovery (current EN mail) |
| 3 | Change email address | **NO** (no product `updateUser({ email })`) | READY / optional | YES | `NewEmail`, `SiteURL`, `TokenHash` (or ConfirmationURL) | Low until feature ships |
| 4 | Magic Link | **NO** (password auth only; no `signInWithOtp`) | READY / unused | YES | `SiteURL`, `TokenHash` | Low — not sent by product |
| 5 | Invite user | **NO** (no `inviteUserByEmail`) | READY / unused | YES | `SiteURL`, `TokenHash` | Low — not sent by product |
| 6 | Reauthentication | **NO** (step-up uses **password** `reauthenticateWithPassword`, not email OTP) | READY / unused | OTP code | `Token` | Low — not sent by product |
| 7 | OTP / verification | **NO** as standalone login OTP | READY / unused | OTP code | `Token` | Low — not product login path |

**Branding (EXTERNAL CONFIGURATION):**

- From name: `BitRymDym`
- Reply-To: keep current Dashboard value — do not invent an address in this gate
- Logo / HTML chrome: deferred — not required for copy cutover

---

## 3. Final Polish subjects

| Template | Subject |
|---|---|
| Confirm signup | Potwierdź adres e-mail — BitRymDym |
| Reset password | Ustaw nowe hasło — BitRymDym |
| Change email address | Potwierdź nowy adres e-mail — BitRymDym |
| Magic Link | Link do logowania — BitRymDym |
| Invite user | Zaproszenie do BitRymDym |
| Reauthentication | Kod weryfikacyjny — BitRymDym |
| OTP / verification | Kod weryfikacyjny — BitRymDym |

---

## 4. Final Polish email copy (HTML bodies)

Paste into Supabase Dashboard → Authentication → Email Templates.
Keep Go template variables exactly as written.

### 4.1 Confirm signup — REQUIRED

**CTA label:** Potwierdź adres e-mail
**Href (locked):** `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup`

```html
<h2>Potwierdź adres e-mail</h2>
<p>Dziękujemy za rejestrację w BitRymDym.</p>
<p>Aby dokończyć zakładanie konta, potwierdź swój adres e-mail:</p>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup">
    Potwierdź adres e-mail
  </a>
</p>
<p>Jeśli nie zakładałeś konta w BitRymDym, zignoruj tę wiadomość.</p>
<p>BitRymDym</p>
```

**Variables:** `{{ .SiteURL }}`, `{{ .TokenHash }}`
**Do not use:** `{{ .ConfirmationURL }}` for this template.

---

### 4.2 Reset password — REQUIRED (priority)

**CTA label:** Ustaw nowe hasło
**Href (locked):** `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`

```html
<h2>Ustaw nowe hasło</h2>
<p>Otrzymaliśmy prośbę o zmianę hasła do konta BitRymDym.</p>
<p>Kliknij poniższy przycisk, aby bezpiecznie ustawić nowe hasło:</p>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">
    Ustaw nowe hasło
  </a>
</p>
<p>Link prowadzi do BitRymDym i wkrótce wygaśnie.</p>
<p>Jeśli to nie Ty prosiłeś o zmianę hasła, zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian.</p>
<p>BitRymDym</p>
```

**Variables:** `{{ .SiteURL }}`, `{{ .TokenHash }}`
**Do not use:** `{{ .ConfirmationURL }}` for this template.
**Do not alter:** `type=recovery`, `token_hash`.

App-side PKCE marker remains separate: `redirectTo=…/auth/callback?flow=recovery` (set by application code — not this template).

---

### 4.3 Change email address — CONFIGURATION READY / NOT CURRENTLY USED

Product does not expose change-email UI today. Configure for consistency if Owner wants Polish-ready Dashboard.

**CTA:** Potwierdź nowy adres e-mail
**Href (aligned with callback):** `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change`

```html
<h2>Potwierdź nowy adres e-mail</h2>
<p>Poproszono o zmianę adresu e-mail konta BitRymDym na:</p>
<p><strong>{{ .NewEmail }}</strong></p>
<p>Aby potwierdzić zmianę, kliknij:</p>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change">
    Potwierdź nowy adres e-mail
  </a>
</p>
<p>Jeśli nie wykonywałeś tej operacji, zignoruj wiadomość — adres e-mail nie zostanie zmieniony.</p>
<p>BitRymDym</p>
```

**Variables:** `{{ .NewEmail }}`, `{{ .SiteURL }}`, `{{ .TokenHash }}`

---

### 4.4 Magic Link — CONFIGURATION READY / NOT CURRENTLY USED

Password login is the product path. No magic-link UI.

```html
<h2>Zaloguj się do BitRymDym</h2>
<p>Użyj poniższego linku, aby zalogować się do BitRymDym:</p>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink">
    Zaloguj się do BitRymDym
  </a>
</p>
<p>Link działa jednorazowo i wkrótce wygaśnie.</p>
<p>Jeśli nie prosiłeś o logowanie, zignoruj tę wiadomość.</p>
<p>BitRymDym</p>
```

**Variables:** `{{ .SiteURL }}`, `{{ .TokenHash }}`

---

### 4.5 Invite user — CONFIGURATION READY / NOT CURRENTLY USED

No invite API usage in product.

```html
<h2>Zaproszenie do BitRymDym</h2>
<p>Otrzymałeś zaproszenie do BitRymDym.</p>
<p>Aby przyjąć zaproszenie i dokończyć dostęp, kliknij:</p>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite">
    Przyjmij zaproszenie
  </a>
</p>
<p>Jeśli nie spodziewałeś się tej wiadomości, zignoruj ją.</p>
<p>BitRymDym</p>
```

**Variables:** `{{ .SiteURL }}`, `{{ .TokenHash }}`

---

### 4.6 Reauthentication — CONFIGURATION READY / NOT CURRENTLY USED

BitRymDym step-up auth uses **current password**, not email OTP. This Dashboard template is unused by product flows.

```html
<h2>Kod weryfikacyjny</h2>
<p>Użyj poniższego kodu, aby potwierdzić operację w BitRymDym:</p>
<p><strong>{{ .Token }}</strong></p>
<p>Kod wkrótce wygaśnie. Nie udostępniaj go nikomu.</p>
<p>Jeśli nie wykonywałeś tej operacji, zignoruj wiadomość.</p>
<p>BitRymDym</p>
```

**Variables:** `{{ .Token }}`
**Subject may also include:** `{{ .Token }} jest Twoim kodem — BitRymDym` (optional)

---

### 4.7 OTP / verification — CONFIGURATION READY / NOT CURRENTLY USED

Not used as primary login. Same body as reauthentication OTP style if Dashboard exposes a separate OTP template:

```html
<h2>Kod weryfikacyjny</h2>
<p>Twój kod weryfikacyjny BitRymDym:</p>
<p><strong>{{ .Token }}</strong></p>
<p>Kod wkrótce wygaśnie. Nie udostępniaj go nikomu.</p>
<p>BitRymDym</p>
```

**Variables:** `{{ .Token }}`

---

## 5. Required Supabase variables (safety)

| Variable | Used in | Notes |
|---|---|---|
| `{{ .SiteURL }}` | Confirm, Reset, Change, Magic, Invite | Must resolve to `https://bitrymdym.pl` in production Auth settings |
| `{{ .TokenHash }}` | Confirm, Reset, Change, Magic, Invite | Opaque hash — never log; never hardcode |
| `{{ .Token }}` | Reauth / OTP | 6-digit code — never log |
| `{{ .NewEmail }}` | Change email | Display only |
| `{{ .Email }}` | optional personalization | Do not require |
| `{{ .ConfirmationURL }}` | **FORBIDDEN** for Confirm signup + Reset password in BitRymDym | Breaks locked TokenHash contract |
| `{{ .RedirectTo }}` | optional | App already sets redirectTo in code for signup/recovery |

**Never place in templates:** service role key, anon key, CRON_SECRET, passwords, raw tokens, test secrets.

---

## 6. Dashboard configuration — APPLIED

Executed on Production project `rzzxrgcdogkybkiidqgw` via authenticated Management API (`PATCH /v1/projects/.../config/auth`), verified by subsequent `GET`.

| Field | Applied value |
|---|---|
| Confirm subject | `Potwierdź adres e-mail — BitRymDym` |
| Confirm CTA / href | `Potwierdź adres e-mail` → `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup` |
| Reset subject | `Ustaw nowe hasło — BitRymDym` |
| Reset CTA / href | `Ustaw nowe hasło` → `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery` |
| `{{ .ConfirmationURL }}` on Confirm/Reset | **ABSENT** (PASS) |
| Site URL | `https://bitrymdym.pl` (verified; not changed) |
| Redirect allow-list | includes `https://bitrymdym.pl/**` and `https://www.bitrymdym.pl/**` (verified; not changed) |
| Unused templates (Change/Magic/Invite/Reauth/OTP) | **NOT CHANGED** |

Bodies match §4.1 / §4.2 of this document.

---

## 7. Security notes

- Prefer TokenHash deep links to `/auth/callback` for product-critical mails (prefetch-safe relative to ConfirmationURL consumption).
- Templates must not embed secrets or environment keys.
- Anti-enumeration UX for forgot-password stays in the app (always-success message) — email body must not reveal whether an account exists beyond delivery itself.
- Application Auth logic, RLS, DB, Storage remain untouched by this gate.

---

## 8. Owner verification checklist

Dashboard template configuration:

- [x] Site URL = `https://bitrymdym.pl`
- [x] Redirect allow-list includes BitRymDym callback wildcards
- [x] Confirm signup subject/body Polish; CTA = „Potwierdź adres e-mail”
- [x] Confirm signup href = `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup`
- [x] Reset password subject/body Polish; CTA = „Ustaw nowe hasło”
- [x] Reset password href = `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`
- [x] Neither Confirm nor Reset uses `{{ .ConfirmationURL }}`
- [x] No secrets in template bodies
- [x] Unused templates left unchanged

Inbox E2E (evidence limitation — epic app UX still CLOSED):

```text
SUPABASE AUTH EMAIL E2E = BLOCKED — NO INBOX ACCESS
```

- [ ] Recovery (when controlled inbox available): forgot-password → Polish subject/body → CTA → `/auth/callback` → `/auth/reset-password` → new password → login
- [ ] Confirm signup (dedicated fixture only): Polish subject/body → `/auth/confirmed` → cleanup fixture only

---

## 9. Gate status

| Item | Status |
|---|---|
| Dashboard Confirm + Reset | **APPLIED** (configurationally verified) |
| Unused templates | **NOT CHANGED** |
| Real inbox E2E | **BLOCKED — NO INBOX ACCESS** |
| Final production app | `ffe723b` · `dpl_FkuQKRm6JE6gNqZkCopE4UmvUviM` |
| Auth templates on final deploy gate | **UNCHANGED** |
| Epic USER-FACING POLISH LOCALIZATION | **CLOSED** — [closeout](./USER_FACING_POLISH_LOCALIZATION_IMPLEMENTATION.md) |

**Optional Owner follow-up (not blocking epic close):** controlled-inbox Confirm + Recovery E2E when mailbox access exists.
