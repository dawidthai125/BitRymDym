"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { BrdButton, BrdLink } from "@/components/brand/brd-button";
import { PurchaseConsent } from "@/components/legal/consent-checkbox";
import type { PaidTier } from "@/config/plan-policy";
import type { CheckoutBlock } from "@/lib/payments/entitlement-grant";
import { isP24Redirect } from "@/lib/payments/p24-url";

const TIERS: PaidTier[] = ["BRONZE", "SILVER", "GOLD"];

type Code =
  | "PAYMENTS_OFF"
  | "CONSENT"
  | "EMAIL"
  | "INVALID"
  | "RATE"
  | "PROVIDER"
  | "ORIGIN"
  | "LOGIN"
  | CheckoutBlock;

export function PremiumCheckoutForm({
  loggedIn,
  signInHref,
  locale,
  prices,
  addonPrice,
  tierBlock,
  addonBlock,
  currentLine,
  readFailed,
}: {
  loggedIn: boolean;
  signInHref: string;
  locale: "pl" | "en";
  prices: Record<PaidTier, { month: string; year: string }>;
  addonPrice: string;
  tierBlock: Record<PaidTier, CheckoutBlock | null>;
  addonBlock: CheckoutBlock | null;
  currentLine: string | null;
  readFailed: boolean;
}) {
  const t = useTranslations("account.premiumPage.checkout");
  const [tier, setTier] = useState<PaidTier>(TIERS.find((item) => tierBlock[item] === null) ?? "GOLD");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [consent, setConsent] = useState({ acceptTerms: false, immediatePerformance: false });
  const [pending, setPending] = useState<"plan" | "addon" | null>(null);
  const [error, setError] = useState<Code | null>(null);

  const planBlocked = tierBlock[tier];
  const consentOk = consent.acceptTerms && consent.immediatePerformance;

  async function pay(product: { kind: "plan"; tier: PaidTier; period: "month" | "year" } | { kind: "addon"; addon: "reference_mastering" }) {
    setError(null);
    if (!consentOk) {
      setError("CONSENT");
      return;
    }
    setPending(product.kind === "plan" ? "plan" : "addon");
    try {
      const response = await fetch("/api/payments/p24/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ product, consent, locale }),
      });
      const payload = (await response.json()) as { ok?: boolean; code?: Code; redirectUrl?: string };
      if (!response.ok || !payload.ok || !payload.redirectUrl || !isP24Redirect(payload.redirectUrl)) {
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
        </ul>
        {currentLine ? <p className="mt-3 text-sm font-medium text-[var(--brd-ink)]">{currentLine}</p> : null}
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
                    {blocked ? <span className="mt-0.5 block text-xs text-[var(--brd-mute)]">{t(`blok.${blocked}`)}</span> : null}
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

        <PurchaseConsent value={consent} onChange={setConsent} />

        {error ? <p role="alert" className="text-sm text-[var(--brd-rec)]">{t(`blad.${error}`)}</p> : null}

        {loggedIn ? (
          <BrdButton type="submit" disabled={!!planBlocked || readFailed || pending !== null || !consentOk} data-testid="premium-checkout-submit">
            {pending === "plan" ? t("czekam") : t("place")}
          </BrdButton>
        ) : (
          <BrdLink href={signInHref} data-testid="premium-checkout-signin">{t("zalogujSie")}</BrdLink>
        )}
      </form>

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
        {loggedIn ? (
          <BrdButton type="submit" variant="secondary" disabled={!!addonBlock || readFailed || pending !== null || !consentOk} data-testid="premium-addon-submit">
            {pending === "addon" ? t("czekam") : t("dodatekPrzycisk")}
          </BrdButton>
        ) : null}
      </form>
    </div>
  );
}
