# User-facing Polish localization — Supabase Auth email templates

**Status:** PREPARED (copy only)
**Supabase Dashboard:** NOT CHANGED
**Production:** UNCHANGED

These templates are **EXTERNAL SUPABASE DASHBOARD CONFIGURATION**.
They are not versioned as HTML in this repository. Owner applies them manually in Supabase Auth → Email Templates after review.

## Critical contracts (do not change)

- Confirmation callback path remains the existing Auth callback (`/auth/callback` via site URL helpers).
- Recovery callback path remains the existing recovery redirect (`flow=recovery` → `/auth/reset-password`).
- Keep Supabase variables: `{{ .TokenHash }}`, `{{ .SiteURL }}`, `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .Token }}` as required by each template.
- Do **not** alter `CONFIRMATION_EMAIL_CALLBACK_PATH` / `RECOVERY_EMAIL_CALLBACK_PATH` application constants when applying templates.

## Template list

| Template | Dashboard name | Polish ready |
|---|---|---|
| Confirm signup | Confirm signup | YES |
| Invite user | Invite user | YES |
| Magic Link | Magic Link | YES |
| Change Email Address | Change Email Address | YES |
| Reset Password | Reset Password | YES |
| Reauthentication | Reauthentication | YES |
| OTP / verification | OTP / Email verification (if enabled) | YES |

---

### 1) Confirm signup

**Subject:** Potwierdź konto w BitRymDym

**Body (HTML text):**

```
Cześć,

dziękujemy za rejestrację w BitRymDym.
Aby aktywować konto, potwierdź adres e-mail:

{{ .ConfirmationURL }}

Jeśli nie zakładałeś konta, zignoruj tę wiadomość.

BitRymDym
```

---

### 2) Invite user

**Subject:** Zaproszenie do BitRymDym

**Body:**

```
Cześć,

otrzymałeś zaproszenie do BitRymDym.
Zaakceptuj zaproszenie i ustaw dostęp tutaj:

{{ .ConfirmationURL }}

Jeśli nie spodziewałeś się tej wiadomości, zignoruj ją.

BitRymDym
```

---

### 3) Magic Link

**Subject:** Link do logowania — BitRymDym

**Body:**

```
Cześć,

użyj tego linku, aby zalogować się do BitRymDym:

{{ .ConfirmationURL }}

Link działa jednorazowo i wkrótce wygaśnie.
Jeśli nie prosiłeś o logowanie, zignoruj tę wiadomość.

BitRymDym
```

---

### 4) Change Email Address

**Subject:** Potwierdź nowy adres e-mail — BitRymDym

**Body:**

```
Cześć,

poproszono o zmianę adresu e-mail w BitRymDym.
Potwierdź nowy adres tutaj:

{{ .ConfirmationURL }}

Jeśli nie prosiłeś o zmianę, zignoruj tę wiadomość.

BitRymDym
```

---

### 5) Reset Password

**Subject:** Reset hasła — BitRymDym

**Body:**

```
Cześć,

otrzymaliśmy prośbę o reset hasła do konta BitRymDym.
Ustaw nowe hasło tutaj:

{{ .ConfirmationURL }}

Jeśli nie prosiłeś o reset, zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian.

BitRymDym
```

---

### 6) Reauthentication

**Subject:** Potwierdź tożsamość — BitRymDym

**Body:**

```
Cześć,

aby dokończyć wrażliwą operację w BitRymDym, potwierdź tożsamość:

{{ .ConfirmationURL }}

Jeśli nie wykonywałeś tej operacji, zignoruj wiadomość i rozważ zmianę hasła.

BitRymDym
```

---

### 7) OTP / verification

**Subject:** Kod weryfikacyjny — BitRymDym

**Body:**

```
Cześć,

Twój kod weryfikacyjny BitRymDym:

{{ .Token }}

Kod wkrótce wygaśnie. Nie udostępniaj go nikomu.

BitRymDym
```

---

## Apply notes (Owner)

1. Paste subjects/bodies into Supabase Dashboard Auth Email Templates.
2. Preserve existing redirect/SiteURL configuration.
3. Send one non-production test per template before production cutover.
4. Mark this doc APPLIED only after Dashboard change + smoke verify.
