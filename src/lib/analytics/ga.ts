/**
 * Google Analytics 4 in the browser (one place). Nothing happens before consent, on a staff
 * device or in the store apps (there loadAnalytics is never called, so events are dropped).
 */
import { analyticsAllowed, analyticsCookieNames, GA_MEASUREMENT_ID } from "@/lib/analytics/consent";

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } & Record<string, unknown>;

/** Events sent to GA4. No account id, e-mail, order id or address is ever sent. */
export type AnalyticsEvent =
  | { name: "sign_up"; params: { method: "email" } }
  | { name: "beat_play"; params: { beat_id: string; beat_title: string } }
  | { name: "purchase"; params: PurchaseEvent };
export type PurchaseEvent = { currency: "PLN"; value: number; items: { item_name: string; quantity: 1; price: number }[] };

export function purchaseEvent(itemName: string, amountGrosz: number): PurchaseEvent {
  const value = Math.round(amountGrosz) / 100;
  return { currency: "PLN", value, items: [{ item_name: itemName, quantity: 1, price: value }] };
}

const MAX_PENDING = 20;
let pending: AnalyticsEvent[] = [];

export function loadAnalytics(nonce: string | undefined): void {
  const w = window as unknown as GtagWindow;
  if (w.gtag || !analyticsAllowed(document.cookie)) return;
  w.dataLayer = w.dataLayer || [];
  // gtag reads `arguments`, not an array (same as Google's snippet).
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  w.gtag("js", new Date());
  w.gtag("config", GA_MEASUREMENT_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
  for (const e of pending) w.gtag("event", e.name, e.params);
  pending = [];
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  if (nonce) script.nonce = nonce;
  document.head.appendChild(script);
}

/** Sends one event, or keeps it until Analytics loads on this page. Never throws. */
export function trackEvent(event: AnalyticsEvent): void {
  try {
    if (!analyticsAllowed(document.cookie)) return;
    const w = window as unknown as GtagWindow;
    if (w.gtag) w.gtag("event", event.name, event.params);
    else if (pending.length < MAX_PENDING) pending.push(event);
  } catch {
    // Statistics must never break the page.
  }
}

export function expireAnalyticsCookies(): void {
  const host = window.location.hostname;
  const parts = host.split(".");
  const domains = ["", host, `.${parts.slice(-2).join(".")}`];
  for (const name of analyticsCookieNames(document.cookie)) {
    for (const d of domains) {
      document.cookie = `${name}=; Path=/; Max-Age=0${d ? `; Domain=${d}` : ""}`;
    }
  }
}

/** Google's own opt-out switch for a tag that is already running on this page. */
export function stopAnalyticsOnThisPage(): void {
  (window as unknown as GtagWindow)[`ga-disable-${GA_MEASUREMENT_ID}`] = true;
  pending = [];
}
