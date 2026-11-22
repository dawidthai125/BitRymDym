"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { BrdButton, BrdLink } from "@/components/brand/brd-button";
import { PurchaseConsent } from "@/components/legal/consent-checkbox";
import type { PaidTier, PlanPack } from "@/config/plan-policy";
import { planChangeKind, type CheckoutBlock, type PlanSnapshot } from "@/lib/payments/entitlement-grant";
import { isP24Redirect } from "@/lib/payments/p24-url";
import { isPayuRedirect } from "@/lib/payments/payu-url";

const TIERS: PaidTier[] = ["BRONZE", "SILVER", "GOLD"];

/** Anonymous funnel counter (/admin/lejek). Fire-and-forget: never delays or blocks payment. */
function countBuyClick(body: { product: "plan" | "addon" | PlanPack; tier?: PaidTier }) {
  try {
    void fetch("/api/funnel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "buy_click", ...body }),
      keepalive: true,
      credentials: "omit",
    }).catch(() => {});
  } catch {
    // Counting is best effort.
  }
}

type Code =
  | "PAYMENTS_OFF"
  | "CONSENT"
  | "EMAIL"
  | "INVALID"
  | "RATE"
  | "PROVIDER"
  | "ORIGIN"
  | "LOGIN"
  | "PROMO"
  | CheckoutBlock;

/** Starter offer as shown (prices formatted on the server from money.ts checkoutPrice). */
export type StarterPackView = {
  hoursLeft: number;
  packs: Partial<Record<PlanPack, { price: string; regular: string }>>;
};

export function PremiumCheckoutForm({
  loggedIn,
  signInHref,
  signUpHref,
  locale,
  prices,
  addonPrice,
  packPrices,
  youtubeUnits,
  starter = null,
  youtubeBlock,
  tierBlock,
  addonBlock,
  currentLine,
  nextLine,
  livePlan,
  readFailed,
}: {
  loggedIn: boolean;
  signInHref: string;
  /** Guest CTA: new account → starter discount on the first pack (no amounts here — Omnibus). */
  signUpHref: string;
  locale: "pl" | "en";
  prices: Record<PaidTier, { month: string; year: string }>;
  addonPrice: string;
  packPrices: Record<PlanPack, string>;
  youtubeUnits: number;
  starter?: StarterPackView | null;
  youtubeBlock: CheckoutBlock | null;
  tierBlock: Record<PaidTier, CheckoutBlock | null>;
  addonBlock: CheckoutBlock | null;
  currentLine: string | null;
  nextLine: string | null;
  livePlan: PlanSnapshot;
  readFailed: boolean;
}) {
  const t = useTranslations("account.premiumPage.checkout");
  const [tier, setTier] = useState<PaidTier>(TIERS.find((item) => tierBlock[item] === null) ?? "GOLD");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [consent, setConsent] = useState({ acceptTerms: false, immediatePerformance: false });
  // 2026-11-22: add-on and packs have their own consent next to their buttons. Before, they
  // read the plan's consent far above, and with a "starts later" plan selected the
  // immediate-performance box was hidden, so packs could never be bought.
  const [extraConsent, setExtraConsent] = useState({ acceptTerms: false, immediatePerformance: false });
  const [pending, setPending] = useState<"plan" | "addon" | PlanPack | null>(null);
  const [error, setError] = useState<Code | null>(null);
  const [errorScope, setErrorScope] = useState<"plan" | "extra">("plan");

  const planBlocked = tierBlock[tier];
  const change = planChangeKind(livePlan, tier, new Date());
  const startsLater = change === "later";
  function changeFor(item: PaidTier) {
    return planChangeKind(livePlan, item, new Date());
  }
  const consentOk = consent.acceptTerms && (startsLater || consent.immediatePerformance);
  const nowConsentOk = extraConsent.acceptTerms && extraConsent.immediatePerformance;

  async function pay(
    product:
      | { kind: "plan"; tier: PaidTier; period: "month" | "year" }
      | { kind: "addon"; addon: "reference_mastering" }
      | { kind: "pack"; pack: PlanPack },
  ) {
    setError(null);
    setErrorScope(product.kind === "plan" ? "plan" : "extra");
    const productConsent = product.kind === "plan" ? consent : extraConsent;
    if (product.kind === "plan" ? !consentOk : !nowConsentOk) {
      setError("CONSENT");
      if (product.kind !== "plan") document.getElementById("pakiety")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setPending(product.kind === "plan" ? "plan" : product.kind === "addon" ? "addon" : product.pack);
    countBuyClick(product.kind === "plan" ? { product: "plan", tier: product.tier } : { product: product.kind === "addon" ? "addon" : product.pack });
    try {
      const response = await fetch("/api/payments/p24/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        // `starter` never sets a price: it only asks the server to refuse when the shown discount is gone.
        body: JSON.stringify({ product, consent: productConsent, locale, ...(product.kind === "pack" && starter?.packs[product.pack] ? { starter: true } : {}) }),
      });
      const payload = (await response.json()) as { ok?: boolean; code?: Code; redirectUrl?: string };
      if (!response.ok || !payload.ok || !payload.redirectUrl || (!isP24Redirect(payload.redirectUrl) && !isPayuRedirect(payload.redirectUrl))) {
        setError(payload.code ?? "PROVIDER");
        setPending(null);
        return;
      }
      window.location.assign(payload.redirectUrl);
    } catch {
      setError("PROVIDER");
      setPending(null);
    }
  }

  return (
    <div data-testid="premium-checkout" className="mt-8 flex flex-col gap-8 border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4 sm:p-6">
      <div>
        <h2 id="premium-buy" className="brd-display text-xl font-semibold tracking-tight sm:text-2xl">{t("naglowek")}</h2>
        <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--brd-ink-soft)]">{t("lead")}</p>
        <ul className="mt-3 max-w-[62ch] list-disc space-y-1 pl-5 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
          <li>{t("regulaJednorazowo")}</li>
          <li>{t("regulaPrzedluzenie")}</li>
          <li>{t("regulaWyzszy")}</li>
          <li>{t("regulaNizszy")}</li>
          <li>{t("regulaKolejka")}</li>
        </ul>
        {currentLine ? <p className="mt-3 text-sm font-medium text-[var(--brd-ink)]">{currentLine}</p> : null}
        {nextLine ? <p className="mt-1 text-sm text-[var(--brd-ink)]">{nextLine}</p> : null}
        {readFailed ? <p role="alert" className="mt-3 text-sm text-[var(--brd-rec)]">{t("nieSprawdze")}</p> : null}
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!loggedIn || readFailed || planBlocked || pending) return;
          void pay({ kind: "plan", tier, period });
        }}
      >
        <fieldset>
          <legend className="text-sm font-medium">{t("plan")}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {TIERS.map((item) => {
              const blocked = tierBlock[item];
              return (
                <label key={item} className={`flex min-h-11 items-center gap-3 border px-3 py-2 text-sm ${tier === item ? "border-[var(--brd-green)] bg-[var(--brd-green-wash)]" : "border-[var(--brd-line)]"} ${blocked ? "opacity-60" : ""}`}>
                  <input
                    type="radio"
                    name="premium-tier"
                    value={item}
                    checked={tier === item}
                    onChange={() => setTier(item)}
                    className="size-4 accent-[var(--brd-green)]"
                    data-testid={`premium-tier-${item}`}
                  />
                  <span>
                    <span className="font-medium">{item}</span>
                    {blocked ? <span className="mt-0.5 block text-xs text-[var(--brd-mute)]">{t(`blok.${blocked}`)}</span> : (
                      <span className="mt-0.5 block text-xs text-[var(--brd-mute)]">
                        {changeFor(item) === "extend" ? t("przedluzasz") : changeFor(item) === "upgrade" ? t("odRazu") : changeFor(item) === "later" ? t("odDnia") : null}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">{t("okres")}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(["month", "year"] as const).map((item) => (
              <label key={item} className={`flex min-h-11 items-center gap-3 border px-3 py-2 text-sm ${period === item ? "border-[var(--brd-green)] bg-[var(--brd-green-wash)]" : "border-[var(--brd-line)]"}`}>
                <input type="radio" name="premium-period" value={item} checked={period === item} onChange={() => setPeriod(item)} className="size-4 accent-[var(--brd-green)]" data-testid={`premium-period-${item}`} />
                <span>{item === "month" ? t("miesiac") : t("rok")}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <p className="font-mono text-2xl" data-testid="premium-checkout-price">
          {period === "month" ? prices[tier].month : prices[tier].year}
          <span className="text-sm text-[var(--brd-mute)]"> {period === "month" ? t("zaMiesiac") : t("zaRok")}</span>
        </p>

        <PurchaseConsent value={consent} onChange={setConsent} startsLater={startsLater} />

        {error && errorScope === "plan" ? <p role="alert" className="text-sm text-[var(--brd-rec)]">{t(`blad.${error}`)}</p> : null}

        {loggedIn ? (
          <BrdButton type="submit" disabled={!!planBlocked || readFailed || pending !== null || !consentOk} data-testid="premium-checkout-submit">
            {pending === "plan" ? t("czekam") : change === "extend" ? t("placePrzedluz") : change === "upgrade" ? t("placeWyzej") : change === "later" ? t("placeNizej") : t("place")}
          </BrdButton>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <BrdLink href={signInHref} className="py-2 text-center" data-testid="premium-checkout-signin">{t("zalogujSie")}</BrdLink>
            <BrdLink href={signUpHref} variant="secondary" className="py-2 text-center" data-testid="premium-checkout-signup">{t("zalozKontoStart")}</BrdLink>
          </div>
        )}
      </form>

      <div className="flex flex-col gap-3 border-t border-[var(--brd-line)] pt-6">
        <h3 className="text-base font-semibold">{t("pakietTytul")}</h3>
        <p className="max-w-[62ch] text-sm leading-relaxed text-[var(--brd-ink-soft)]">{t("pakietOpis")}</p>
        {starter ? (
          <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="premium-starter-offer">
            <span className="inline-flex items-center rounded-full border border-[var(--brd-amber)] px-2 py-0.5 text-xs font-semibold text-[var(--brd-amber)]">{t("startOdznaka")}</span>
            <span>{t("startLinia", { h: starter.hoursLeft })}</span>
          </p>
        ) : null}
        {loggedIn ? (
          <div id="pakiety" className="scroll-mt-24" data-testid="premium-extra-consent">
            <PurchaseConsent value={extraConsent} onChange={setExtraConsent} />
          </div>
        ) : null}
        {(["take", "master", "youtube"] as const).map((pack) => {
          const blocked = pack === "youtube" ? youtubeBlock : null;
          const promo = blocked ? undefined : starter?.packs[pack];
          return (
          <form
            key={pack}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            onSubmit={(event) => {
              event.preventDefault();
              if (!loggedIn || readFailed || pending || blocked) return;
              void pay({ kind: "pack", pack });
            }}
          >
            {promo ? (
              <div className="text-sm" data-testid={`premium-pack-${pack}-starter`}>
                <p>
                  {pack === "youtube" ? t("pakietYoutube", { n: youtubeUnits }) : t(pack === "take" ? "pakietTake" : "pakietMaster")}
                  <s className="ml-2 font-mono text-[var(--brd-mute)]"><span className="sr-only">{t("startRegularna")} </span>{promo.regular}</s>
                  <span className="ml-2 font-mono font-semibold">{promo.price}</span>
                  <span className="ml-2 text-xs font-semibold text-[var(--brd-amber)]">{t("startOdznaka")}</span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--brd-mute)]">{t("startOmnibus", { cena: promo.regular })}</p>
              </div>
            ) : (
              <p className="text-sm">
                {pack === "youtube" ? t("pakietYoutube", { n: youtubeUnits }) : t(pack === "take" ? "pakietTake" : "pakietMaster")}
                {packPrices[pack] ? <span className="ml-2 font-mono">{packPrices[pack]}</span> : null}
              </p>
            )}
            {blocked ? <p className="text-sm text-[var(--brd-mute)]">{t(`blok.${blocked}`)}</p> : null}
            {loggedIn ? (
              <BrdButton type="submit" variant="secondary" disabled={!!blocked || readFailed || pending !== null} data-testid={`premium-pack-${pack}`}>
                {pending === pack ? t("czekam") : t("pakietPrzycisk")}
              </BrdButton>
            ) : null}
          </form>
          );
        })}
        {error && errorScope === "extra" ? <p role="alert" className="text-sm text-[var(--brd-rec)]">{t(`blad.${error}`)}</p> : null}
      </div>
      <form
        className="flex flex-col gap-3 border-t border-[var(--brd-line)] pt-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!loggedIn || readFailed || addonBlock || pending) return;
          void pay({ kind: "addon", addon: "reference_mastering" });
        }}
      >
        <h3 className="text-base font-semibold">{t("dodatekTytul")}</h3>
        <p className="max-w-[62ch] text-sm leading-relaxed text-[var(--brd-ink-soft)]">{t("dodatekOpis")}</p>
        <p className="font-mono text-xl">{addonPrice}<span className="text-sm text-[var(--brd-mute)]"> {t("zaMiesiac")}</span></p>
        {addonBlock ? <p className="text-sm text-[var(--brd-mute)]">{t(`blok.${addonBlock}`)}</p> : null}
        {!addonBlock && loggedIn ? <p className="text-xs text-[var(--brd-mute)]">{t("zgodyWyzej")}</p> : null}
        {loggedIn ? (
          <BrdButton type="submit" variant="secondary" disabled={!!addonBlock || readFailed || pending !== null} data-testid="premium-addon-submit">
            {pending === "addon" ? t("czekam") : t("dodatekPrzycisk")}
          </BrdButton>
        ) : null}
      </form>

    </div>
  );
}
