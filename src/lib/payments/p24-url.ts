const P24_HOSTS = new Set(["sandbox.przelewy24.pl", "secure.przelewy24.pl"]);

/** Hosted payment page only. Safe to import from client components (no secrets, no Node crypto). */
export function isP24Redirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && P24_HOSTS.has(parsed.hostname) && parsed.pathname.startsWith("/trnRequest/");
  } catch {
    return false;
  }
}
