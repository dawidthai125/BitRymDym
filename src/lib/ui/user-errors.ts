/**
 * Central user-facing Polish error mapping.
 * Never surface raw Supabase / Postgres / AuthError English to the UI.
 *
 * Domain helpers (playback/download/take) may specialize; all must end here
 * or return an explicit Polish string — never pass through unknown English.
 */

export type UserFacingErrorDomain =
  | "auth"
  | "playback"
  | "download"
  | "recording"
  | "mix"
  | "render"
  | "grant"
  | "upload"
  | "generic";

const GENERIC_BY_DOMAIN: Record<UserFacingErrorDomain, string> = {
  auth: "Nie udało się wykonać tej operacji. Spróbuj ponownie.",
  playback: "Nie udało się odtworzyć audio.",
  download: "Nie udało się pobrać pliku.",
  recording: "Nie udało się nagrać. Spróbuj ponownie.",
  mix: "Nie udało się wykonać operacji miksu. Spróbuj ponownie.",
  render: "Nie udało się wykonać eksportu. Spróbuj ponownie.",
  grant: "Nie udało się zarządzać dostępem. Spróbuj ponownie.",
  upload: "Nie udało się przesłać pliku. Spróbuj ponownie.",
  generic: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.",
};

/** Already-safe Polish (diacritics or known PL product words). */
export function looksLikePolishUserMessage(message: string): boolean {
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(message)) return true;
  return /\b(nagrania|nagranie|mikrofon|sesji|podgląd|hasło|hasła|konto|konta|e-mail|plik|pobrań|odtworzyć|zaloguj|spróbuj|niedostęp|wymaga|anulowan|gotowe|przesył)\b/i.test(
    message,
  );
}

/**
 * Map Supabase Auth API messages → Polish (anti-enumeration where needed).
 */
export function mapSupabaseAuthError(
  message: string | null | undefined,
): string {
  if (!message) {
    return "Nie udało się zalogować. Spróbuj ponownie.";
  }
  const lower = message.toLowerCase();

  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid email or password") ||
    lower.includes("wrong password") ||
    lower.includes("invalid credentials")
  ) {
    return "Nieprawidłowy e-mail lub hasło.";
  }
  if (
    lower.includes("email not confirmed") ||
    lower.includes("email_not_confirmed")
  ) {
    return "Potwierdź adres e-mail, zanim się zalogujesz.";
  }
  if (
    lower.includes("user already registered") ||
    lower.includes("already been registered") ||
    lower.includes("email address is already")
  ) {
    // Anti-enumeration-friendly generic for signup hard failures.
    return "Nie udało się założyć konta. Spróbuj ponownie lub zaloguj się.";
  }
  if (
    lower.includes("password") &&
    (lower.includes("weak") ||
      lower.includes("least") ||
      lower.includes("characters") ||
      lower.includes("short"))
  ) {
    return "Hasło nie spełnia wymagań bezpieczeństwa.";
  }
  if (
    lower.includes("invalid email") ||
    lower.includes("unable to validate email") ||
    lower.includes("email address") && lower.includes("invalid")
  ) {
    return "Podaj prawidłowy adres e-mail.";
  }
  if (
    lower.includes("expired") ||
    lower.includes("otp_expired") ||
    lower.includes("token has expired")
  ) {
    return "Link wygasł. Poproś o nowy.";
  }
  if (
    lower.includes("invalid") &&
    (lower.includes("token") ||
      lower.includes("otp") ||
      lower.includes("recovery") ||
      lower.includes("link"))
  ) {
    return "Link jest nieprawidłowy lub wygasł. Poproś o nowy.";
  }
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("over_request_rate")
  ) {
    return "Zbyt wiele prób. Spróbuj ponownie za chwilę.";
  }
  if (
    lower.includes("supabase is not configured") ||
    lower.includes("supabase not configured") ||
    lower.includes("next_public_supabase")
  ) {
    return "Logowanie jest chwilowo niedostępne.";
  }
  if (looksLikePolishUserMessage(message)) {
    return message;
  }
  return "Nie udało się wykonać operacji logowania. Spróbuj ponownie.";
}

type AuthErrorLike = {
  code?: string;
  message?: string;
  name?: string;
};

export function toUserFacingAuthError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const auth = error as AuthErrorLike;
    const code = String(auth.code ?? "");
    const msg = String(auth.message ?? "");
    if (code === "UNAUTHENTICATED") {
      return "Musisz być zalogowany.";
    }
    if (code === "NOT_FOUND") {
      return toUserFacingError(msg, "generic");
    }
    if (code === "CONFLICT") {
      return toUserFacingError(msg, "generic");
    }
    if (code === "FORBIDDEN") {
      return toUserFacingError(msg, "generic");
    }
  }
  if (error instanceof Error) {
    return mapSupabaseAuthError(error.message);
  }
  return "Nie udało się wykonać tej operacji. Spróbuj ponownie.";
}

/**
 * Universal mapper for user-visible errors.
 * Prefer domain-specific helpers when available; they call this for fallbacks.
 */
export function toUserFacingError(
  raw: string | null | undefined,
  domain: UserFacingErrorDomain = "generic",
): string {
  if (!raw || !String(raw).trim()) {
    return GENERIC_BY_DOMAIN[domain];
  }
  const message = String(raw).trim();
  const lower = message.toLowerCase();

  if (looksLikePolishUserMessage(message)) {
    return message;
  }

  // Auth / session
  if (
    lower.includes("authentication required") ||
    lower.includes("unauthenticated") ||
    lower.includes("sign in required") ||
    lower.includes("not authenticated")
  ) {
    return "Musisz być zalogowany.";
  }
  if (
    lower.includes("insufficient role") ||
    lower.includes("missing permission")
  ) {
    return "Nie masz uprawnień do tej operacji.";
  }
  if (
    lower.includes("invalid login") ||
    lower.includes("invalid credentials") ||
    lower.includes("wrong password")
  ) {
    return "Nieprawidłowy e-mail lub hasło.";
  }
  if (
    lower.includes("supabase is not configured") ||
    lower.includes("supabase not configured")
  ) {
    return domain === "auth"
      ? "Logowanie jest chwilowo niedostępne."
      : "Usługa jest chwilowo niedostępna.";
  }

  // Recording / takes
  if (
    lower.includes("daily recording") ||
    lower.includes("daily anonymous recording") ||
    (lower.includes("session limit") && lower.includes("recording"))
  ) {
    return "Osiągnięto dzienny limit sesji nagrań.";
  }
  if (
    lower.includes("active ready take limit") ||
    lower.includes("ready take limit")
  ) {
    return "Osiągnięto limit gotowych nagrań.";
  }
  if (
    lower.includes("another recording session") ||
    lower.includes("another anonymous recording")
  ) {
    return "Inna sesja nagrywania jest już w toku.";
  }
  if (
    lower.includes("recording is not allowed") ||
    lower.includes("recording is only allowed")
  ) {
    return "Nagrywanie nie jest dostępne dla tego bitu.";
  }
  if (
    lower.includes("anonymous take identity") ||
    lower.includes("take identity required")
  ) {
    return "Nie udało się rozpocząć nagrania gościa.";
  }
  if (lower.includes("invalid beat duration")) {
    return "Nieprawidłowa długość bitu do nagrywania.";
  }
  if (
    lower.includes("take session expired") ||
    (lower.includes("take") && lower.includes("expired"))
  ) {
    return "Sesja nagrania wygasła.";
  }
  if (lower.includes("take not found")) {
    return "Nie znaleziono nagrania.";
  }
  if (lower.includes("not take owner")) {
    return "To nagranie nie należy do Ciebie.";
  }
  if (
    lower.includes("no ready audio") &&
    lower.includes("recording")
  ) {
    return "Bit nie ma gotowego audio do nagrywania.";
  }
  if (lower.includes("duration could not be verified")) {
    return "Nie udało się zweryfikować długości nagrania.";
  }
  if (lower.includes("microphone permission denied")) {
    return "Brak dostępu do mikrofonu.";
  }

  // Downloads
  if (
    lower.includes("daily download limit") ||
    (lower.includes("download") && lower.includes("limit reached"))
  ) {
    return "Osiągnięto dzienny limit pobrań. Spróbuj ponownie jutro.";
  }

  // Playback / audio access
  if (
    lower.includes("audio access denied") ||
    lower.includes("access denied")
  ) {
    return domain === "download"
      ? "Brak dostępu do pobrania."
      : "Brak dostępu do odsłuchu.";
  }
  if (
    lower.includes("audio niedostępne") ||
    ((domain === "playback" || domain === "download") &&
      (lower.includes("no ready") || lower.includes("missing")))
  ) {
    return "Audio niedostępne dla tego bitu.";
  }
  if (lower.includes("no ready audio asset")) {
    return "Audio niedostępne dla tego bitu.";
  }
  if (lower.includes("invalid purpose") || lower.includes("invalid access purpose")) {
    return "Nieprawidłowy tryb dostępu do audio.";
  }
  if (lower.includes("audio action failed")) {
    return GENERIC_BY_DOMAIN.playback;
  }
  if (
    lower.includes("failed to create signed url") ||
    lower.includes("signed url")
  ) {
    return domain === "download"
      ? "Link do pobrania wygasł. Spróbuj ponownie."
      : "Sesja odtwarzania wygasła. Spróbuj ponownie.";
  }

  // Mix / render / premium capability
  if (
    lower.includes("mix is not enabled") ||
    lower.includes("e3_mix_enabled")
  ) {
    return "Miks jest chwilowo niedostępny.";
  }
  if (
    lower.includes("public free audio is not released") ||
    lower.includes("e3_public_audio")
  ) {
    return "Miks jest chwilowo niedostępny.";
  }
  if (
    lower.includes("render jobs are not enabled") ||
    lower.includes("e3_render_jobs")
  ) {
    return "Eksport jest chwilowo niedostępny. Spróbuj później.";
  }
  if (
    lower.includes("missing audio capability") ||
    lower.includes("authentication required for audio capability")
  ) {
    return "Ta funkcja wymaga Premium lub odpowiednich uprawnień.";
  }
  if (lower.includes("premium required")) {
    return "Ten format wymaga Premium.";
  }
  if (lower.includes("daily render limit")) {
    return "Osiągnięto dzienny limit eksportów.";
  }
  if (lower.includes("concurrent render limit")) {
    return "Masz już trwający eksport. Poczekaj na zakończenie.";
  }
  if (
    lower.includes("export timeout") ||
    (lower.includes("timeout") &&
      (lower.includes("export") || domain === "mix" || domain === "render"))
  ) {
    return "Eksport trwa zbyt długo. Spróbuj ponownie.";
  }
  if (lower.includes("export cancelled") || /export\s+cancelled/i.test(message)) {
    return "Eksport został anulowany.";
  }
  if (/export\s+failed/i.test(message) || /export\s+FAILED/i.test(message)) {
    return "Eksport nie powiódł się. Spróbuj ponownie.";
  }
  if (/CANCELLED/i.test(message) && (domain === "mix" || domain === "render")) {
    return "Eksport został anulowany.";
  }
  if (/FAILED/i.test(message) && (domain === "mix" || domain === "render")) {
    return "Eksport nie powiódł się. Spróbuj ponownie.";
  }
  if (
    lower.includes("artifact storage quota") ||
    lower.includes("quota exceeded")
  ) {
    return "Osiągnięto limit miejsca na eksporty. Usuń stare pliki lub spróbuj później.";
  }
  if (lower.includes("beat is not available for mix")) {
    return "Ten bit nie jest dostępny do miksu.";
  }
  if (lower.includes("artifact not found")) {
    return "Plik eksportu jest niedostępny.";
  }
  if (lower.includes("artifact expired")) {
    return "Plik eksportu wygasł.";
  }
  if (lower.includes("take was deleted") || lower.includes("take is not ready for render")) {
    return "Nagranie nie jest gotowe do eksportu.";
  }

  // Grants
  if (lower.includes("cannot grant access to yourself")) {
    return "Nie możesz przyznać dostępu samemu sobie.";
  }
  if (lower.includes("only the beat owner")) {
    return "Tylko właściciel bitu może zarządzać dostępem.";
  }
  if (lower.includes("active grant already exists")) {
    return "Ten użytkownik ma już aktywny dostęp.";
  }
  if (lower.includes("active grant limit")) {
    return "Osiągnięto limit aktywnych dostępów.";
  }
  if (lower.includes("grantee user not found")) {
    return "Nie znaleziono użytkownika.";
  }
  if (lower.includes("grant not found")) {
    return "Nie znaleziono uprawnienia dostępu.";
  }
  if (lower.includes("expiresat must be")) {
    return "Data wygaśnięcia musi być w przyszłości.";
  }
  if (lower.includes("list grants failed") || lower.includes("create grant failed")) {
    return GENERIC_BY_DOMAIN.grant;
  }

  // Upload
  if (
    lower.includes("upload session failed") ||
    lower.includes("upload failed") ||
    lower.includes("binary upload")
  ) {
    return GENERIC_BY_DOMAIN.upload;
  }
  if (lower.includes("finalize failed")) {
    return "Nie udało się zakończyć przesyłania.";
  }

  // Generic HTTP-ish
  if (lower.includes("not found") || lower.includes("beat not found")) {
    return "Nie znaleziono zasobu.";
  }
  if (
    lower.includes("forbidden") ||
    lower.includes("denied") ||
    lower.includes("unauthorized")
  ) {
    return "Brak uprawnień do tej operacji.";
  }
  if (
    lower.includes("network") ||
    lower.includes("failed to fetch") ||
    lower.includes("timeout")
  ) {
    return "Błąd sieci. Spróbuj ponownie.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Zbyt wiele prób. Spróbuj ponownie za chwilę.";
  }

  return GENERIC_BY_DOMAIN[domain];
}

export function toUserFacingMixError(raw: string | null | undefined): string {
  return toUserFacingError(raw, "mix");
}

export function toUserFacingGrantError(raw: string | null | undefined): string {
  return toUserFacingError(raw, "grant");
}

export function toUserFacingUploadError(raw: string | null | undefined): string {
  return toUserFacingError(raw, "upload");
}

export function toUserFacingUnknown(error: unknown, domain: UserFacingErrorDomain = "generic"): string {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return toUserFacingAuthError(error);
  }
  if (error instanceof Error) {
    if (domain === "auth") {
      return mapSupabaseAuthError(error.message);
    }
    return toUserFacingError(error.message, domain);
  }
  return GENERIC_BY_DOMAIN[domain];
}
