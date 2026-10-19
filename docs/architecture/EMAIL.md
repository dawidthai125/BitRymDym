# E-mail BitRymDym

**SSOT treści i głosu wiadomości do użytkowników.**
Bezpieczeństwo zmiany adresu, callback i sesja: [AUTHORIZATION.md](./AUTHORIZATION.md).
Kontrakt linku signup i recovery: `CONFIRMATION_EMAIL_CALLBACK_PATH` oraz `RECOVERY_EMAIL_CALLBACK_PATH` w `src/lib/auth/confirmation.ts`.

Historyczny audit z 2026-10-04 (`docs/audits/USER_FACING_POLISH_LOCALIZATION_EMAIL_TEMPLATES.md`) opisuje ówczesny stan Dashboardu. Nie wklejać z niego treści, jeśli ten dokument podaje nowszą wersję. Kontrakt `token_hash` dla signup i recovery zostaje.

Szablony Auth **nie są** w repozytorium. Wklejenie do Dashboardu wymaga osobnego GO. Ten plik ich nie włącza i nic nie wysyła.

## 1. Język i głos

- Temat, treść, CTA, stopka i ostrzeżenie są po polsku.
- Ton: bezpośredni, luźny, jak rozmowa w studiu. Bez wulgaryzmów i bez dokładania slangu do każdego zdania.
- Nazwy: `BitRymDym`, `adres e-mail`, `konto`, `potwierdź`.
- CTA opisuje czynność z linku.
- Mail bezpieczeństwa mówi, co się zaczęło, czy operacja już się skończyła, co kliknąć i co zrobić, gdy użytkownik tego nie zaczynał.
- Nie obiecywać czasu życia linku. Nie obiecywać, że jeden klik kończy zmianę adresu. Nie obiecywać usunięcia opublikowanych utworów.
- Placeholdery Supabase zostają dosłownie: `{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .Token }}`, `{{ .NewEmail }}`, `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .Data }}`, `{{ .RedirectTo }}`.

## 2. Inwentaryzacja

Odczyt Dashboardu: 2026-10-19, projekt `rzzxrgcdogkybkiidqgw`, sesja zalogowana, bez zapisu. Produkcja aplikacji: commit `0a565c02a66264ff92f41ed09e1446524f17bbf3`, bez kodu ACCT-EMAIL.

| ID | Wiadomość | Kanał | Źródło | Uruchomienie | Aktywna | Język dziś | Status | Działanie |
|---|---|---|---|---|---|---|---|---|
| AUTH-01 | Potwierdzenie rejestracji | Supabase Auth | Dashboard | `signUp` | tak | polski, formalny | `POLISH — STYLE UPDATE` | wkleić propozycję po GO |
| AUTH-02 | Reset hasła | Supabase Auth | Dashboard | `resetPasswordForEmail` | tak | polski, formalny | `POLISH — STYLE UPDATE` | wkleić propozycję po GO |
| AUTH-03 | Zmiana adresu | Supabase Auth | Dashboard | lokalny `updateUser`, niewdrożony | szablon jest; produkt na produkcji nie | angielski, `{{ .ConfirmationURL }}` | `NON-POLISH — NEEDS TRANSLATION` | wkleić propozycję razem z deployem kodu |
| AUTH-04 | Zaproszenie | Supabase Auth | Dashboard | brak `inviteUserByEmail` | nie w aplikacji | angielski | `NON-POLISH — NEEDS TRANSLATION` | nie włączać |
| AUTH-05 | Magic link | Supabase Auth | Dashboard | brak `signInWithOtp` | nie w aplikacji | angielski | `NON-POLISH — NEEDS TRANSLATION` | nie włączać |
| AUTH-06 | Kod reautoryzacji | Supabase Auth | Dashboard | aplikacja używa hasła | nie w aplikacji | angielski | `NON-POLISH — NEEDS TRANSLATION` | nie włączać |
| AUTH-07 | Hasło zmienione | Supabase Auth | Dashboard, przełącznik wyłączony | powiadomienie | nie | angielski, odczytany | `INACTIVE / LEGACY` | nie włączać |
| AUTH-08–13 | Pozostałe powiadomienia konta | Supabase Auth | lista szablonów, 6 przełączników wyłączonych | powiadomienie | nie | `NOT VERIFIED` | `INACTIVE / LEGACY` | nie włączać, nie zgadywać treści |
| APP-01 | Usunięcie konta przez administratora | Resend | `src/lib/email/admin-account-deletion-mail.ts` | `adminDeleteUserAction` | tak, gdy jest adres i env | polski, głos marki w kodzie lokalnym | `POLISH + BRAND VOICE` w lokalnym kodzie | deploy osobnym GO; produkcja nadal ma starą treść |
| APP-02 | Płatności | brak w `src` | — | — | `NOT PRESENT IN REPOSITORY` | — | `NOT PRESENT IN REPOSITORY` | brak |
| APP-03 | Edge Functions | brak katalogu `supabase/functions` | — | — | `NOT PRESENT IN REPOSITORY` | — | `NOT VERIFIED` poza repo | brak |

`RESEND_API_KEY` i `RESEND_FROM_EMAIL` istnieją jako nazwy w produkcji Vercel. Wartości nie były odczytywane.

## 3. AUTH-01 — propozycja, Dashboard

**Konfiguracja:** Authentication → Emails → Confirm sign up.
**Placeholdery:** `{{ .SiteURL }}`, `{{ .TokenHash }}`.
**Nie używać:** `{{ .ConfirmationURL }}`.
**Stan:** propozycja. Dashboard 2026-10-19 ma formalną polską wersję z tym samym linkiem.

Temat: `Potwierdź adres e-mail — BitRymDym`

```html
<h2>Potwierdź adres e-mail</h2>
<p>Siema! Konto w BitRymDym czeka na ten jeden krok.</p>
<p>Kliknij poniżej, żeby dokończyć rejestrację. Bez tego nie wejdziesz do studia.</p>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup">
    Potwierdź adres e-mail
  </a>
</p>
<p>Jeśli to nie Ty zakładałeś konto, zignoruj wiadomość. Nic nie zostanie włączone.</p>
<p>BitRymDym</p>
```

## 4. AUTH-02 — propozycja, Dashboard

**Konfiguracja:** Reset password.
**Placeholdery:** `{{ .SiteURL }}`, `{{ .TokenHash }}`.
**Nie używać:** `{{ .ConfirmationURL }}`.
Aplikacja dodatkowo ustawia `redirectTo` z `flow=recovery`. To nie jest treść szablonu.

Temat: `Ustaw nowe hasło — BitRymDym`

```html
<h2>Ustaw nowe hasło</h2>
<p>Ktoś poprosił o nowe hasło do konta BitRymDym.</p>
<p>Sama wiadomość hasła nie zmienia. Kliknij link i ustaw je w BitRymDym.</p>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">
    Ustaw nowe hasło
  </a>
</p>
<p>Jeśli to nie Ty, zignoruj wiadomość. Dotychczasowe hasło zostaje.</p>
<p>BitRymDym</p>
```

## 5. AUTH-03 — propozycja, Dashboard

**Konfiguracja:** Change email address.
**Placeholdery:** `{{ .NewEmail }}`, `{{ .SiteURL }}`, `{{ .TokenHash }}`.
**Link:** ten sam wzorzec co signup i recovery, z `type=email_change`. Szablon zmiany adresu udostępnia `{{ .TokenHash }}`. Auth buduje oba maile z typem `email_change` i osobnym hashem dla starej i nowej skrzynki. `verifyOtp` dostaje tylko `token_hash` i `type`. Pierwsze potwierdzenie OTP wraca bez sesji; aplikacja pokazuje wtedy komunikat 1/2, nie sukces. Brak `new_email` bez odczytanej flagi Secure email change zostaje stanem niejednoznacznym, nie 2/2. Wynik jedzie w jednorazowym podpisanym ciasteczku httpOnly i jest kasowany po pokazaniu. Parametr URL nie jest dowodem potwierdzenia.
**Nie obiecywać**, że jedno kliknięcie kończy zmianę. Publiczne `GET /auth/v1/settings` nie zawiera Secure email change. Drugie potwierdzenie wraca zwykłą sesją, tak samo jak jedyne potwierdzenie przy wyłączonej fladze, więc sama sesja nie jest dowodem 2/2. Komunikat 2/2 wymaga serwerowej zmiennej `AUTH_SECURE_EMAIL_CHANGE=on`, ustawionej dopiero po sprawdzeniu, że w Dashboardzie Secure email change jest włączone. Inna wartość zostawia stan niejednoznaczny.

Temat: `Potwierdź zmianę adresu — BitRymDym`

```html
<h2>Potwierdź zmianę adresu</h2>
<p>Ktoś rozpoczął zmianę adresu logowania w BitRymDym na {{ .NewEmail }}.</p>
<p>Ten link potwierdza tylko Twoją część. Adres zmienia się dopiero, gdy wymagane skrzynki potwierdzą wiadomość.</p>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change">
    Potwierdź zmianę adresu
  </a>
</p>
<p>Jeśli to nie Ty, nic nie klikaj. Adres logowania zostaje.</p>
<p>BitRymDym</p>
```

PKCE z kodu (`emailRedirectTo` = `/auth/callback?flow=email_change`) zostaje w aplikacji. Szablon OTP nie zastępuje tego parametru.

## 6. AUTH-04–06 — warunkowe, nie włączać

Aplikacja ich nie wysyła. Propozycje są gotowe na później. Nie zmieniać metod logowania.

**AUTH-04** Invite user. Temat: `Zaproszenie do BitRymDym`. Placeholdery: `{{ .SiteURL }}`, `{{ .TokenHash }}`.

```html
<h2>Zaproszenie do BitRymDym</h2>
<p>Masz zaproszenie do konta w BitRymDym. Kliknij link, żeby je przyjąć. Bez tego konta nie będzie.</p>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite">
    Przyjmij zaproszenie
  </a>
</p>
<p>Jeśli nie spodziewasz się zaproszenia, zignoruj wiadomość.</p>
<p>BitRymDym</p>
```

**AUTH-05** Magic link. Temat: `Link do wejścia — BitRymDym`. Placeholdery: `{{ .SiteURL }}`, `{{ .TokenHash }}`.

```html
<h2>Link do wejścia</h2>
<p>Masz jednorazowy link do BitRymDym. Kliknij go, żeby wejść. Działa raz.</p>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink">
    Wejdź do BitRymDym
  </a>
</p>
<p>Jeśli to nie Ty prosiłeś o wejście, zignoruj wiadomość.</p>
<p>BitRymDym</p>
```

**AUTH-06** Reauthentication. Aplikacja potwierdza hasłem, nie tym kodem. Temat: `Kod do potwierdzenia — BitRymDym`. Placeholder: `{{ .Token }}`.

```html
<h2>Kod do potwierdzenia</h2>
<p>Zanim pójdzie dalej wrażliwa operacja na koncie, wpisz ten kod w BitRymDym:</p>
<p><strong>{{ .Token }}</strong></p>
<p>Nie podawaj go nikomu. Jeśli to nie Ty, zignoruj wiadomość.</p>
<p>BitRymDym</p>
```

## 7. AUTH-07–13

Przełączniki powiadomień na liście szablonów były wyłączone (2026-10-19). AUTH-07 (hasło zmienione) ma angielski temat „Your password was changed” i angielską treść. Treści AUTH-08–13 nie były otwierane: `NOT VERIFIED`. Nie włączać ich w tym pakiecie.

## 8. APP-01 — wdrożone w lokalnym kodzie

**Konfiguracja:** `CODE` — `src/lib/email/admin-account-deletion-mail.ts`. Wysyłka: Resend, `EXTERNAL PROVIDER`.
**Produkcja:** stara treść, dopóki nie będzie deployu.
**Temat:** `Konto w BitRymDym zostało usunięte`.

Treść mówi, że usunięcie już się stało, wiadomość go nie cofa, podaje powód tylko gdy jest niepusty i nie obiecuje skasowania opublikowanych utworów. Powód jest escapowany w HTML.

## 9. Wdrożenie po zgodzie Ownera

1. Przegląd tego dokumentu i diffu kodu.
2. Osobna zgoda na commit i push.
3. Osobna zgoda na deploy kodu ACCT-EMAIL i APP-01.
4. Osobna zgoda na wklejenie AUTH-01, AUTH-02 i AUTH-03 w Dashboardzie. Nie zapisywać innych szablonów i nie włączać powiadomień.
5. Osobne GO na QA zmiany adresu na koncie QA, obie skrzynki, bez wklejania linków z tokenami do czatu.
