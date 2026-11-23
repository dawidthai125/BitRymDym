/**
 * Analytics consent (pure, client-safe). Google Analytics 4 loads only after the
 * visitor accepts statistics cookies (RODO + Prawo komunikacji elektronicznej).
 * Store apps (Google Play / App Store) never load analytics.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || "G-DN860754XQ";

export const CONSENT_COOKIE = "brd_consent";
/** 12 months, then we ask again. */
export const CONSENT_MAX_AGE_S = 60 * 60 * 24 * 365;

export type ConsentChoice = "all" | "necessary";

export function parseConsent(cookieHeader: string | null | undefined): ConsentChoice | null {
  const match = (cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]+)`));
  const value = match?.[1];
  return value === "all" || value === "necessary" ? value : null;
}

export function consentCookie(choice: ConsentChoice, secure: boolean): string {
  return `${CONSENT_COOKIE}=${choice}; Path=/; Max-Age=${CONSENT_MAX_AGE_S}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** GA cookie names to expire when consent is withdrawn (_ga, _ga_<container>). */
export function analyticsCookieNames(cookieHeader: string): string[] {
  return cookieHeader
    .split(";")
    .map((c) => c.trim().split("=")[0])
    .filter((name) => name === "_ga" || name.startsWith("_ga_") || name === "_gid");
}
