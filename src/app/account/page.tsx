import { getLibText } from "@/i18n/get-lib-text";
import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";

import { BrdButton, BrdLink } from "@/components/brand/brd-button";
import {
  PageFrame,
  SectionLabel,
} from "@/components/brand/chrome";
import { WorkPrizeDesk } from "@/components/account/work-prize-desk";
import { OwnStudioTracks } from "@/components/account/own-studio-tracks";
import { ReferralDesk } from "@/components/account/referral-desk";
import { RewardDesk } from "@/components/community/reward-desk";
import { PaymentSuccessDialog } from "@/components/premium/payment-success-dialog";
import { TrackPurchase } from "@/components/premium/track-purchase";
import { paymentSuccess, PAYMENT_SUCCESS_PARAM } from "@/lib/payments/return-state";
import { OwnTakesList } from "@/components/takes/own-takes-list";
import { listPurchasedBeatIds } from "@/lib/beats/purchased-catalog";
import { formatAccountPlanDisplay } from "@/lib/account/account-plan-display";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { signOutAction } from "@/lib/auth/actions";
import { canAccessAdminNav } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/session";
import { AccountHashRedirect } from "@/components/account/account-hash-redirect";
import { resolveLocale } from "@/i18n/config";
import { getLocale, getTranslations } from "next-intl/server";
import { formatProfileWithUserNumber } from "@/lib/auth/types";
import { isStoreApp } from "@/lib/site/store-app-server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import {
  listOwnTakes,
  takeRecentNonDeletedTakes,
} from "@/lib/takes/list-own-takes";
import { labelAccountLevel } from "@/lib/ui/labels";

/**
 * Artist Studio — action space, not a developer debug panel.
 */
export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("account.accountPage");
  return { title: t("twojeStudio") };
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string; [PAYMENT_SUCCESS_PARAM]?: string | string[] }>;
}) {
  const tl = await getLibText();
  const tr = await getTranslations("account.accountPage");
  const storeApp = await isStoreApp();
  const env = getSupabasePublicEnv();
  if (!env.isConfigured) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6">
        <h1 className="brd-display text-2xl font-semibold">{tr("studio")}</h1>
        <p className="text-sm text-[var(--brd-mute)]">
          {tr("konfiguracjaLokalnaJestNiekompletna")}
        </p>
        <Link href="/" className="text-sm underline underline-offset-4">
          {tr("stronaGlowna")}
        </Link>
      </main>
    );
  }

  const context = await getCurrentProfile();
  if (!context) {
    redirect(signInPathWithNext("/account"));
  }
  const params = await searchParams;
  const claimParam = params.claim;
  const payment = await paymentSuccess(params[PAYMENT_SUCCESS_PARAM], context.userId);
  const claimBanner =
    claimParam === "ok" || claimParam === "cap" || claimParam === "error"
      ? claimParam
      : null;
  const showAdminNav = canAccessAdminNav(context.profile.role);
  // Profile surface: exclude soft-deleted at query (not slice-then-filter).
  // /account/takes keeps includeDeleted default for lifecycle visibility.
  let takes: Awaited<ReturnType<typeof listOwnTakes>> = [];
  try {
    takes = await listOwnTakes({ includeDeleted: false, limit: 5 });
  } catch {
    takes = [];
  }
  const recentTakes = takeRecentNonDeletedTakes(takes, 5);
  const purchasedBeatIds: string[] = await listPurchasedBeatIds(context.userId).catch(() => []);
  const locale = resolveLocale(await getLocale());
  const displayName =
    context.profile.displayName?.trim() || tr("tworca");
  // Premium SSOT — same resolver as Admin / EXPORT_WAV (own user only).
  let planDisplay = formatAccountPlanDisplay({
    locale,
    premiumTier: "FREE",
    premiumActive: false,
    premiumExpiresAt: null,
    loadError: true,
  });
  try {
    const product = await resolveProductEntitlementForAuthContext(context);
    planDisplay = formatAccountPlanDisplay({
      locale,
      premiumTier: product.premiumTier,
      premiumActive: product.premiumActive,
      premiumExpiresAt: product.premiumExpiresAt,
      prize: product.premiumSource === "work_prize",
    });
  } catch {
    planDisplay = formatAccountPlanDisplay({
      locale,
      premiumTier: "FREE",
      premiumActive: false,
      premiumExpiresAt: null,
      loadError: true,
    });
  }

  return (
      <main className="pb-16">
        {payment ? <PaymentSuccessDialog message={payment.message} param={PAYMENT_SUCCESS_PARAM} /> : null}
        {payment?.purchase ? <TrackPurchase purchase={payment.purchase} /> : null}
        <AccountHashRedirect />
        <PageFrame className="py-10 sm:py-14">
          <header className="mb-10 grid gap-6 border-b border-[var(--brd-line)] pb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-3">
              <h1 className="brd-display text-4xl font-semibold tracking-tight sm:text-5xl">
                {tr("twojeStudio")}
              </h1>
              <p className="max-w-prose text-sm text-[var(--brd-ink-soft)] sm:text-base">
                {tr("nagrywajOdsluchujIRozwijaj")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BrdLink href="/beats">{tr("noweNagranie")}</BrdLink>
              <BrdLink href="/studio" variant="secondary">
                {tr("studio")}
              </BrdLink>
            </div>
          </header>

          {claimBanner === "ok" ? (
            <div
              className="mb-8 border border-[var(--brd-line)] bg-[var(--brd-paper)] px-4 py-3 text-sm text-[var(--brd-ink)]"
              role="status"
            >
              {tr("nagranieZostaloZapisaneNa")}{" "}
              <Link
                href="/account/takes"
                className="underline underline-offset-4 hover:text-[var(--brd-green)]"
              >
                {tr("mojeNagrania")}
              </Link>
            </div>
          ) : null}
          {claimBanner === "cap" ? (
            <div
              className="mb-8 border border-[var(--brd-line)] bg-[var(--brd-paper)] px-4 py-3 text-sm text-[var(--brd-ink)]"
              role="status"
            >
              {tr("nieUdaloSieZapisac")}
            </div>
          ) : null}
          {claimBanner === "error" ? (
            <div
              className="mb-8 border border-[var(--brd-line)] bg-[var(--brd-paper)] px-4 py-3 text-sm text-[var(--brd-ink)]"
              role="alert"
            >
              {tr("nieUdaloSiePrzeniesc")}
            </div>
          ) : null}

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.85fr)]">
            <section className="space-y-4">
              <div className="flex items-baseline justify-between gap-3">
                <SectionLabel>{tr("ostatnieNagrania")}</SectionLabel>
                <Link
                  href="/account/takes"
                  className="text-sm text-[var(--brd-green)] hover:underline"
                >
                  {tr("wszystkie")}
                </Link>
              </div>

              {recentTakes.length === 0 ? (
                <div className="border border-[var(--brd-line)] px-5 py-10">
                  <p className="brd-display text-xl font-semibold">
                    {tr("jeszczeCicho")}
                  </p>
                  <p className="mt-2 text-sm text-[var(--brd-mute)]">
                    {tr("wybierzBitINagraj")}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <BrdLink href="/beats">{tr("idzDoKatalogu")}</BrdLink>
                    <BrdLink href="/nagrywarka" variant="secondary">{tr("programWindows")}</BrdLink>
                  </div>
                </div>
              ) : (
                <OwnTakesList items={recentTakes} variant="dashboard" purchasedBeatIds={purchasedBeatIds} />
              )}

              <OwnStudioTracks userId={context.userId} />

            </section>

            <aside className="space-y-8">
              <section
                id="profil"
                className="scroll-mt-24 space-y-4 border border-[var(--brd-line)] p-5"
              >
                <SectionLabel>{tr("profil")}</SectionLabel>
                <div>
                  <p className="brd-display text-2xl font-semibold">
                    {tl(formatProfileWithUserNumber(
                      displayName,
                      context.profile.userNumber,
                    ))}
                  </p>
                  <p className="mt-1 text-sm text-[var(--brd-mute)]">
                    {tl(labelAccountLevel(context.profile.accountLevel))}
                  </p>
                </div>

                <div>
                  <SectionLabel className="mb-2">{tr("twojPlan")}</SectionLabel>
                  <p
                    className="text-sm text-[var(--brd-ink-soft)]"
                    data-testid="account-plan-summary"
                    data-premium-tier={planDisplay.tierLabel}
                    data-premium-active={
                      planDisplay.premiumActive ? "true" : "false"
                    }
                    data-plan-verified={
                      planDisplay.verified ? "true" : "false"
                    }
                  >
                    {planDisplay.summary}
                  </p>
                  {/* Store apps show no purchase links. */}
                  {storeApp ? null : (
                    <Link
                      href="/premium"
                      className="inline-flex min-h-11 items-center text-sm text-[var(--brd-green)] underline-offset-4 hover:underline"
                    >
                      {tr("zobaczPlany")}
                    </Link>
                  )}
                </div>

                <div className="flex flex-col">
                  <Link
                    href="/account/settings#profil"
                    className="inline-flex min-h-11 items-center text-sm text-[var(--brd-green)] underline-offset-4 hover:underline"
                  >
                    {tr("zmienKsywke")}
                  </Link>
                  <Link
                    href="/account/profil"
                    className="inline-flex min-h-11 items-center text-sm text-[var(--brd-green)] underline-offset-4 hover:underline"
                  >
                    {tr("profilPubliczny")}
                  </Link>
                </div>

                <RewardDesk userId={context.userId} />

                <WorkPrizeDesk userId={context.userId} />

                {showAdminNav ? (
                  <Link
                    href="/admin"
                    className="inline-flex min-h-11 items-center text-sm text-[var(--brd-green)] underline-offset-4 hover:underline"
                  >
                    {tr("panelAdministracyjny")}
                  </Link>
                ) : null}

                <form action={signOutAction}>
                  <BrdButton type="submit" variant="secondary" className="w-full">
                    {tr("wyloguj")}
                  </BrdButton>
                </form>
              </section>

              <ReferralDesk userId={context.userId} />
            </aside>
          </div>

        </PageFrame>
      </main>
  );
}
