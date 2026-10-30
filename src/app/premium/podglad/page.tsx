import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { PremiumCheckoutForm } from "@/components/premium/premium-checkout-form";
import { PremiumReturnView, type ReturnState } from "@/components/premium/premium-return-view";
import { AppShell } from "@/components/site/app-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Podgląd płatności", robots: { index: false, follow: false } };

const RETURN_STATES: Record<string, ReturnState> = {
  pending: { status: "pending" },
  paid: { status: "paid", product: "Silver", until: "30 grudnia 2026" },
  failed: { status: "failed" },
  skipped: { status: "skipped", reason: "downgrade" },
};

/**
 * Local UI preview. Production always 404s. Dev needs P24_UI_PREVIEW=1.
 * `?stan=pending|paid|failed|skipped` shows the return page.
 */
export default async function PaymentPreviewPage({ searchParams }: { searchParams?: Promise<{ stan?: string }> }) {
  if (process.env.NODE_ENV === "production" || process.env.P24_UI_PREVIEW !== "1") notFound();
  const params = searchParams ? await searchParams : {};
  const state = params.stan ? RETURN_STATES[params.stan] : undefined;
  if (params.stan) {
    if (!state) notFound();
    return <PremiumReturnView state={state} />;
  }
  return (
    <AppShell tone="public">
      <main>
        <PageFrame className="max-w-3xl py-8">
          <SectionLabel>Podgląd</SectionLabel>
          <h1 className="brd-display mt-2 text-3xl font-semibold">Płatność — podgląd UI</h1>
          <PremiumCheckoutForm
            loggedIn
            signInHref="/sign-in?next=%2Fpremium"
            locale="pl"
            prices={{
              BRONZE: { month: "14,99 zł", year: "119 zł" },
              SILVER: { month: "29,99 zł", year: "239 zł" },
              GOLD: { month: "49,99 zł", year: "399 zł" },
            }}
            addonPrice="14,99 zł"
            tierBlock={{ BRONZE: "DOWNGRADE", SILVER: null, GOLD: null }}
            addonBlock={null}
            currentLine="Masz Silver do 30 listopada 2026."
            readFailed={false}
          />
        </PageFrame>
      </main>
    </AppShell>
  );
}
