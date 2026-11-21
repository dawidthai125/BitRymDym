import { isPlausibleIp } from "@/lib/security/client-ip";

const PAYU_HOSTS = new Set(["secure.payu.com", "secure.snd.payu.com"]);

/** Hosted PayU page. Safe in client components: no secrets, no Node crypto. */
export function isPayuRedirect(url: string): boolean {
  return payuHost(url) !== null;
}

/** Production checkout may open only the live host. Sandbox only the sandbox host. */
export function isPayuRedirectFor(url: string, sandbox: boolean): boolean {
  const host = payuHost(url);
  if (!host) return false;
  return host === (sandbox ? "secure.snd.payu.com" : "secure.payu.com");
}

function payuHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    if (!PAYU_HOSTS.has(parsed.hostname) || parsed.pathname === "" || parsed.pathname.includes("\\")) return null;
    return parsed.hostname;
  } catch {
    return null;
  }
}

/** Customer IP must be a plain IP literal (taken via `clientIpOrNull` in `@/lib/security/client-ip`). */
export function isCustomerIp(value: string): boolean {
  return isPlausibleIp(value);
}
