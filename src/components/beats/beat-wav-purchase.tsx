"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { BrdButton, BrdLink } from "@/components/brand/brd-button";
import Link from "next/link";
import { PurchaseConsent } from "@/components/legal/consent-checkbox";
import { requestPurchasedBeatWavAction } from "@/lib/beats/purchased-wav-action";
import { isPayuRedirect } from "@/lib/payments/payu-url";

type PayCode = "CONSENT" | "EMAIL" | "INVALID" | "RATE" | "PROVIDER" | "OWNED" | "OPEN" | "LOGIN" | "denied" | "missing";

export function BeatWavPurchase({
  beatId,
  title,
  price,
  owned,
  paymentsOn,
  fileReady,
  signedIn,
  signInHref,
  locale,
}: {
  beatId: string;
  title: string;
  price: string;
  owned: boolean;
  paymentsOn: boolean;
  fileReady: boolean;
  signedIn: boolean;
  signInHref: string;
  locale: "pl" | "en";
}) {
  const t = useTranslations("beats.beatWav");
  const [consent, setConsent] = useState({ acceptTerms: false, immediatePerformance: false });
  const [pending, setPending] = useState<"pay" | "file" | null>(null);
  const [error, setError] = useState<PayCode | null>(null);
  const consentOk = consent.acceptTerms && consent.immediatePerformance;

  async function download() {
    setError(null);
    setPending("file");
    try {
      const result = await requestPurchasedBeatWavAction(beatId);
      if (!result.ok) {
        setError(result.code === "login" ? "LOGIN" : result.code);
        setPending(null);
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.download = `${title || "bit"}.wav`;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setPending(null);
    } catch {
      setError("missing");
      setPending(null);
    }
  }

  async function pay() {
    setError(null);
    if (!consentOk) {
      setError("CONSENT");
      return;
    }
    setPending("pay");
    try {
      const response = await fetch("/api/payments/p24/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          product: { kind: "beat", beatId },
          consent,
          locale,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; code?: PayCode; redirectUrl?: string };
      if (!response.ok || !payload.ok || !payload.redirectUrl || !isPayuRedirect(payload.redirectUrl)) {
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
    <div id="zakup" data-testid="beat-wav-purchase" className="max-w-xl space-y-3 border border-[var(--brd-line)] p-4">
      <p className="text-sm font-semibold text-[var(--brd-ink)]">{price}</p>
      <p className="text-sm leading-relaxed text-[var(--brd-ink-soft)]">{t("opis", { cena: price })}</p>
      {owned ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--brd-ink)]">{t("masz")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <BrdButton type="button" variant="primary" disabled={pending === "file"} onClick={() => void download()} data-testid="beat-wav-download">
              {pending === "file" ? t("pobieranie") : t("pobierz")}
            </BrdButton>
            <Link href="/beats?katalog=moj" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
              {t("katalog")}
            </Link>
            <Link href={`/studio?beatId=${encodeURIComponent(beatId)}`} className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--brd-green)] underline underline-offset-4">
              {t("nagraj")}
            </Link>
          </div>
        </div>
      ) : !fileReady ? (
        <p className="text-sm text-[var(--brd-mute)]">{t("brakPliku")}</p>
      ) : !signedIn ? (
        <BrdLink href={signInHref}>{t("zaloguj")}</BrdLink>
      ) : !paymentsOn ? (
        <p className="text-sm text-[var(--brd-mute)]">{t("wylaczone")}</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            void pay();
          }}
        >
          <PurchaseConsent value={consent} onChange={setConsent} product="beat" />
          <BrdButton type="submit" variant="primary" disabled={pending === "pay" || !consentOk} data-testid="beat-wav-buy">
            {pending === "pay" ? t("placenie") : t("kup")}
          </BrdButton>
        </form>
      )}
      {error ? (
        <p role="alert" className="text-sm text-[var(--brd-rec)]">
          {t(`blad.${error}`)}
        </p>
      ) : null}
    </div>
  );
}
