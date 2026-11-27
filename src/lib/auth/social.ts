/**
 * Google / Apple sign-in — pure rules (edge + client safe, no I/O).
 * A provider is shown only when listed in AUTH_SOCIAL_PROVIDERS ("google,apple"),
 * so the code can ship before the provider is configured in Supabase.
 */

export const SOCIAL_PROVIDERS = ["google", "apple"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const OAUTH_CALLBACK_FLOW = "oauth";
export const SOCIAL_FINISH_PATH = "/auth/finish";
/** Which provider this sign-in uses (set by /auth/oauth/start, read by the callback). */
export const OAUTH_PROVIDER_COOKIE = "brd_oauth_provider";
/** Custom URL scheme of the iOS app (ios-app/scripts/patch-ios.sh). */
export const APP_AUTH_SCHEME_URL = "bitrymdym://auth-callback";
/** Delete without a password: the provider sign-in must be this fresh. */
export const FRESH_SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

export const SOCIAL_REAUTH_REQUIRED_ERROR = "Zaloguj się ponownie przez Google lub Apple i usuń konto w ciągu 15 minut.";

const IOS_APP_UA = "BitRymDymApp/iOS";
/** Only iOS builds with the in-app browser plugins send this. */
const IOS_APP_AUTH_UA = "BrdAuth/";

export function parseSocialProvider(raw: unknown): SocialProvider | null {
  return typeof raw === "string" && (SOCIAL_PROVIDERS as readonly string[]).includes(raw)
    ? (raw as SocialProvider)
    : null;
}

export function enabledSocialProviders(input: {
  configured: string | null | undefined;
  userAgent: string | null | undefined;
}): SocialProvider[] {
  const ua = input.userAgent ?? "";
  // iOS app 1.0.0 would open the provider in Safari and the session would stay there.
  if (ua.includes(IOS_APP_UA) && !ua.includes(IOS_APP_AUTH_UA)) return [];
  const wanted = (input.configured ?? "").split(",").map((v) => v.trim().toLowerCase());
  return SOCIAL_PROVIDERS.filter((p) => wanted.includes(p));
}

type AuthUserShape = {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

function providersOf(user: AuthUserShape): string[] {
  const list = user.app_metadata?.providers;
  if (Array.isArray(list)) return list.filter((p): p is string => typeof p === "string");
  const one = user.app_metadata?.provider;
  return typeof one === "string" ? [one] : [];
}

/** Google / Apple account that never had an e-mail + password identity. */
export function isSocialOnlyUser(user: AuthUserShape): boolean {
  const providers = providersOf(user);
  return !providers.includes("email") && providers.some((p) => parseSocialProvider(p) !== null);
}

/** A new social account must pick a ksywka and accept the Regulamin before using the account. */
export function needsSocialProfileCompletion(user: AuthUserShape): boolean {
  return isSocialOnlyUser(user) && !user.user_metadata?.terms_version;
}

export function socialProviderOf(user: AuthUserShape): SocialProvider | null {
  for (const p of providersOf(user)) {
    const parsed = parseSocialProvider(p);
    if (parsed) return parsed;
  }
  return null;
}

export function isFreshSignIn(lastSignInAt: string | null | undefined, now = Date.now()): boolean {
  const at = Date.parse(lastSignInAt ?? "");
  return Number.isFinite(at) && now - at >= -60_000 && now - at < FRESH_SIGN_IN_WINDOW_MS;
}

/** Paths an unfinished social account may still open (finish form, callback, legal texts). */
export function pathAllowedBeforeCompletion(pathname: string): boolean {
  const path = pathname.replace(/^\/en(?=\/|$)/, "") || "/";
  return (
    path.startsWith("/auth/") ||
    ["/regulamin", "/polityka-prywatnosci", "/cookies"].some((p) => path === p || path.startsWith(`${p}/`))
  );
}
