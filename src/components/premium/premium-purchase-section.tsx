import { getLocale, getTranslations } from "next-intl/server";

import { PLAN_ADDON_PRICE_PLN, PLAN_POLICY, type PaidTier } from "@/config/plan-policy";
import { PremiumCheckoutForm } from "@/components/premium/premium-checkout-form";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { getCurrentProfile } from "@/lib/auth/session";
import { tierBlocks } from "@/lib/payments/checkout-service";
import { checkoutBlock, isLivePaid } from "@/lib/payments/entitlement-grant";
import { loadAddonSnapshot, loadPlanSnapshot } from "@/lib/payments/snapshots";

const TIERS: PaidTier[] = ["BRONZE", "SILVER", "GOLD"];

function moneyFormat(locale: string) {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export async function PremiumPurchaseSection() {
  const locale = await getLocale();
  const tr = await getTranslations("account.premiumPage.checkout");
  const lang = locale === "en" ? "en" : "pl";
  const format = moneyFormat(lang);
  const prices = Object.fromEntries(
    TIERS.map((tier) => [
      tier,
      {
        month: format.format(PLAN_POLICY[tier].price.monthlyPln ?? 0),
        year: format.format(PLAN_POLICY[tier].price.yearlyPln ?? 0),
      },
    ]),
  ) as Record<PaidTier, { month: string; year: string }>;

  const context = await getCurrentProfile();
  let readFailed = false;
  let plan = null;
  let addon = null;
  if (context) {
    try {
      [plan, addon] = await Promise.all([loadPlanSnapshot(context.userId), loadAddonSnapshot(context.userId)]);
    } catch {
      readFailed = true;
    }
  }

  const now = new Date();
  const live = isLivePaid(plan, now) ? plan : null;
  const currentLine = live
    ? live.expiresAt
      ? tr("maszDo", { plan: live.tier, data: formatDate(live.expiresAt, lang) })
      : tr("maszBeztermin", { plan: live.tier })
    : null;

  return (
    <PremiumCheckoutForm
      loggedIn={!!context}
      signInHref={signInPathWithNext("/premium")}
      locale={lang}
      prices={prices}
      addonPrice={format.format(PLAN_ADDON_PRICE_PLN.reference_mastering.monthlyPln)}
      tierBlock={context && !readFailed ? tierBlocks(plan, addon, now) : { BRONZE: null, SILVER: null, GOLD: null }}
      addonBlock={context && !readFailed ? checkoutBlock({ kind: "addon", addon: "reference_mastering", period: "month" }, plan, addon, now) : null}
      currentLine={currentLine}
      readFailed={readFailed}
    />
  );
}

function formatDate(iso: string, locale: "pl" | "en"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    dateStyle: "long",
    timeZone: "Europe/Warsaw",
  }).format(date);
}
