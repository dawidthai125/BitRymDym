import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrdButton, BrdLink } from "@/components/brand/brd-button";
import {
  PageFrame,
  SectionLabel,
  StatusPill,
} from "@/components/brand/chrome";
import {
  ChangeEmailForm,
  ChangePasswordForm,
  DeleteAccountForm,
} from "@/components/auth/auth-forms";
import { DisplayNameForm } from "@/components/auth/display-name-form";
import { AppShell } from "@/components/site/app-shell";
import { formatAccountPlanDisplay } from "@/lib/account/account-plan-display";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { ConsumeEmailChangeNotice } from "@/components/auth/consume-email-change-notice";
import { EmailChangeNotice } from "@/components/auth/email-change-notice";
import { signOutAction } from "@/lib/auth/actions";
import { resolveEmailChangeNoticeDisplay } from "@/lib/auth/email-change";
import { readEmailChangeNotice } from "@/lib/auth/email-change-notice";
import { canAccessAdminNav } from "@/lib/auth/permissions";
import { getCurrentProfile, getSessionUser } from "@/lib/auth/session";
import { formatProfileWithUserNumber } from "@/lib/auth/types";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import {
  listOwnTakes,
  takeRecentNonDeletedTakes,
} from "@/lib/takes/list-own-takes";
import { formatDurationSeconds } from "@/lib/beats/public";
import {
  labelAccountLevel,
  labelRecordingMode,
  labelTakeStatus,
} from "@/lib/ui/labels";

/**
 * Artist Studio — action space, not a developer debug panel.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string }>;
}) {
  const tr = await getTranslations("account.accountPage");
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
    redirect("/sign-in");
  }

  const params = await searchParams;
  const claimParam = params.claim;
  const claimBanner =
    claimParam === "ok" || claimParam === "cap" || claimParam === "error"
      ? claimParam
      : null;
  const authUser = await getSessionUser();
  const signedEmailChangeStatus = await readEmailChangeNotice();
  const emailChangeStatus = resolveEmailChangeNoticeDisplay({
    signedStatus: signedEmailChangeStatus,
    pendingNewEmail: authUser?.new_email,
    sessionReadable: true,
  });

  const showAdminNav = canAccessAdminNav(context.profile.role);
  // Profile surface: exclude soft-deleted at query (not slice-then-filter).
  // /account/takes keeps includeDeleted default for lifecycle visibility.
  let takes: Awaited<ReturnType<typeof listOwnTakes>> = [];
  try {
    takes = await listOwnTakes({ includeDeleted: false });
  } catch {
    takes = [];
  }
  const recentTakes = takeRecentNonDeletedTakes(takes, 5);
  const readyCount = takes.filter((t) => t.displayStatus === "READY").length;
  const displayName =
    context.profile.displayName?.trim() || tr("tworca");
  const userNumberLabel =
    context.profile.userNumber != null
      ? String(context.profile.userNumber)
      : "—";

  // Premium SSOT — same resolver as Admin / EXPORT_WAV (own user only).
  let planDisplay = formatAccountPlanDisplay({
    premiumTier: "FREE",
    premiumActive: false,
    premiumExpiresAt: null,
    loadError: true,
  });
  try {
    const product = await resolveProductEntitlementForAuthContext(context);
    planDisplay = formatAccountPlanDisplay({
      premiumTier: product.premiumTier,
      premiumActive: product.premiumActive,
      premiumExpiresAt: product.premiumExpiresAt,
    });
  } catch {
    planDisplay = formatAccountPlanDisplay({
      premiumTier: "FREE",
      premiumActive: false,
      premiumExpiresAt: null,
      loadError: true,
    });
  }

  return (
    <AppShell tone="studio">
      <main className="pb-16">
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
              <BrdLink href="/account/takes" variant="secondary">
                {tr("mojeNagrania")}
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

          <div className="mb-10 flex flex-wrap gap-2">
            <StudioChip href="/account/takes" label={tr("mojeNagrania")} />
            <StudioChip href="/account/beats" label={tr("mojeBity")} />
            <StudioChip href="/account/downloads" label={tr("eksportyIPobrania")} />
            <StudioChip href="/account/shared" label={tr("udostepnione")} />
          </div>

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
                  <div className="mt-6">
                    <BrdLink href="/beats">{tr("idzDoKatalogu")}</BrdLink>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
                  {recentTakes.map((take) => (
                    <li
                      key={take.id}
                      className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div className="min-w-0 space-y-2">
                        <p className="brd-display truncate text-lg font-semibold">
                          {take.beatTitle || "Bit"}
                        </p>
                        <p className="flex gap-3 text-sm text-[var(--brd-mute)]">
                          <span>{labelRecordingMode(take.recordingMode)}</span>
                          <span className="brd-data text-[var(--brd-ink-soft)]">
                            {take.durationSeconds != null
                              ? formatDurationSeconds(take.durationSeconds)
                              : "—"}
                          </span>
                        </p>
                      </div>
                      <StatusPill
                        tone={
                          take.displayStatus === "READY" ? "ok" : "neutral"
                        }
                      >
                        {labelTakeStatus(take.displayStatus)}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              )}

              <section className="pt-8">
                <SectionLabel className="mb-3">{tr("twojaBiblioteka")}</SectionLabel>
                <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
                  <LibraryRow
                    href="/account/takes"
                    title={tr("nagrania")}
                    meta={tr("gotowych", { v0: readyCount })}
                  />
                  <LibraryRow
                    href="/account/downloads"
                    title={tr("pobraneBity")}
                    meta={tr("twojePobrania")}
                  />
                  <LibraryRow
                    href="/account/beats"
                    title={tr("mojeBity")}
                    meta={tr("wgraneIWModeracji")}
                  />
                </ul>
              </section>
            </section>

            <aside className="space-y-8">
              <section
                id="profil"
                className="scroll-mt-24 space-y-4 border border-[var(--brd-line)] p-5"
              >
                <SectionLabel>{tr("profil")}</SectionLabel>
                <div>
                  <p className="brd-display text-2xl font-semibold">
                    {formatProfileWithUserNumber(
                      displayName,
                      context.profile.userNumber,
                    )}
                  </p>
                  <p className="mt-1 text-sm text-[var(--brd-mute)]">
                    {labelAccountLevel(context.profile.accountLevel)}
                  </p>
                </div>

                <dl className="space-y-3 border-y border-[var(--brd-line)] py-4 text-sm">
                  <div>
                    <dt className="text-xs text-[var(--brd-mute)]">
                      {tr("ksywka")}
                    </dt>
                    <dd className="mt-1 text-[var(--brd-ink)]">{displayName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--brd-mute)]">
                      {tr("idUzytkownika")}
                    </dt>
                    <dd className="brd-data mt-1 text-[var(--brd-ink)]">{userNumberLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--brd-mute)]">
                      {tr("eMail")}
                    </dt>
                    <dd className="mt-1 break-all text-[var(--brd-ink)]">
                      {context.email ?? "—"}
                    </dd>
                  </div>
                </dl>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Stat label={tr("nagrania")} value={String(takes.length)} />
                  <Stat label={tr("gotowe")} value={String(readyCount)} />
                </dl>

                <DisplayNameForm
                  initialDisplayName={context.profile.displayName ?? ""}
                />

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
                </div>

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

              <section
                id="security"
                className="scroll-mt-24 space-y-4 border border-[var(--brd-line)] p-5"
              >
                <SectionLabel>{tr("bezpieczenstwo")}</SectionLabel>
                {emailChangeStatus ? (
                  <EmailChangeNotice status={emailChangeStatus} />
                ) : null}
                {signedEmailChangeStatus ? <ConsumeEmailChangeNotice /> : null}
                <ChangeEmailForm currentEmail={context.email ?? ""} />
                <ChangePasswordForm />
                <p className="text-sm text-[var(--brd-mute)]">
                  {tr("niePamietaszHasla")}{" "}
                  <Link
                    href="/forgot-password"
                    className="text-[var(--brd-green)] underline-offset-4 hover:underline"
                  >
                    {tr("resetPrzezEMail")}
                  </Link>
                </p>
              </section>

              <section
                id="danger"
                className="scroll-mt-24 space-y-4 border border-[var(--brd-line)] p-5"
              >
                <SectionLabel>{tr("usuwanieKonta")}</SectionLabel>
                <DeleteAccountForm />
              </section>
            </aside>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}

function StudioChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center border border-[var(--brd-line)] px-4 text-sm text-[var(--brd-ink)] hover:border-[var(--brd-green)] hover:text-[var(--brd-green)]"
    >
      {label}
    </Link>
  );
}

function LibraryRow({
  href,
  title,
  meta,
}: {
  href: string;
  title: string;
  meta: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-11 items-center justify-between gap-3 py-4 hover:text-[var(--brd-green)]"
      >
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-[var(--brd-mute)]">{meta}</p>
        </div>
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0">
          <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </Link>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--brd-mute)]">
        {label}
      </dt>
      <dd className="brd-data mt-1 text-lg text-[var(--brd-ink)]">{value}</dd>
    </div>
  );
}
