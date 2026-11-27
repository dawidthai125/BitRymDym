import { getTranslations } from "next-intl/server";
import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";

import {
  ChangeEmailForm,
  ChangePasswordForm,
  DeleteAccountForm,
} from "@/components/auth/auth-forms";
import { ConsumeEmailChangeNotice } from "@/components/auth/consume-email-change-notice";
import { DisplayNameForm } from "@/components/auth/display-name-form";
import { EmailChangeNotice } from "@/components/auth/email-change-notice";
import { NotificationPreferencesForm } from "@/components/account/notification-preferences-form";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { LanguageSwitcher } from "@/components/site/language-switcher";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { resolveEmailChangeNoticeDisplay } from "@/lib/auth/email-change";
import { readEmailChangeNotice } from "@/lib/auth/email-change-notice";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { isFreshSignIn, isSocialOnlyUser, socialProviderOf } from "@/lib/auth/social";
import { socialProvidersForRequest } from "@/lib/auth/social-server";
import { signOutAction } from "@/lib/auth/actions";
import { getCurrentProfile, getSessionUser } from "@/lib/auth/session";
import { notifyEnv } from "@/lib/email/notify/config";
import { DEFAULT_PREFERENCES, readPreferences } from "@/lib/email/notify/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("account.settingsPage");
  return { title: t("metaTitle") };
}

const CARD = "scroll-mt-24 space-y-4 border border-[var(--brd-line)] p-5";

/** One place for everything that changes the account: name, sign-in, e-mails, look, deletion. */
export default async function AccountSettingsPage() {
  const context = await getCurrentProfile();
  if (!context) redirect(signInPathWithNext("/account/settings"));
  const t = await getTranslations("account.settingsPage");
  const tr = await getTranslations("account.accountPage");
  const tn = await getTranslations("account.notifications");
  const tl = await getTranslations("language");
  const notificationPrefs = await readPreferences(createSupabaseAdminClient(), context.userId).catch(() => DEFAULT_PREFERENCES);
  const authUser = await getSessionUser();
  // Google / Apple account: no password to change or to confirm with.
  const passwordless = authUser ? isSocialOnlyUser(authUser) : false;
  const provider = authUser ? socialProviderOf(authUser) : null;
  const needsFreshSignIn = passwordless && !isFreshSignIn(authUser?.last_sign_in_at);
  const offered = passwordless ? await socialProvidersForRequest() : [];
  const ts = await getTranslations("auth.social");
  const signedEmailChangeStatus = await readEmailChangeNotice();
  const emailChangeStatus = resolveEmailChangeNoticeDisplay({
    signedStatus: signedEmailChangeStatus,
    pendingNewEmail: authUser?.new_email,
    sessionReadable: true,
  });

  return (
    <main className="pb-16">
      <PageFrame className="flex max-w-3xl flex-col gap-6 py-10">
        <h1 className="brd-display text-3xl font-semibold tracking-tight sm:text-4xl">{t("ustawienia")}</h1>

        <section id="profil" className={CARD}>
          <SectionLabel>{tr("profil")}</SectionLabel>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--brd-mute)]">{tr("eMail")}</dt>
              <dd className="mt-1 break-all text-[var(--brd-ink)]">{context.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--brd-mute)]">{tr("idUzytkownika")}</dt>
              <dd className="brd-data mt-1 text-[var(--brd-ink)]">{context.profile.userNumber ?? "—"}</dd>
            </div>
          </dl>
          <DisplayNameForm initialDisplayName={context.profile.displayName ?? ""} />
          <Link
            href="/account/profil"
            className="inline-flex min-h-11 items-center text-sm text-[var(--brd-green)] underline-offset-4 hover:underline"
          >
            {tr("profilPubliczny")}
          </Link>
        </section>

        <section id="security" className={CARD}>
          <SectionLabel>{tr("bezpieczenstwo")}</SectionLabel>
          {emailChangeStatus ? <EmailChangeNotice status={emailChangeStatus} /> : null}
          {signedEmailChangeStatus ? <ConsumeEmailChangeNotice /> : null}
          {passwordless ? (
            <p className="text-sm text-[var(--brd-ink-soft)]" data-testid="social-account-note">
              {ts("kontoBezHasla", { dostawca: provider === "apple" ? "Apple" : "Google" })}
            </p>
          ) : (
            <>
              <ChangeEmailForm currentEmail={context.email ?? ""} />
              <ChangePasswordForm />
              <p className="text-sm text-[var(--brd-mute)]">
                {tr("niePamietaszHasla")}{" "}
                <Link href="/forgot-password" className="text-[var(--brd-green)] underline-offset-4 hover:underline">
                  {tr("resetPrzezEMail")}
                </Link>
              </p>
            </>
          )}
        </section>

        <section id="powiadomienia" className={CARD}>
          <SectionLabel>{tn("tytul")}</SectionLabel>
          <NotificationPreferencesForm initialPrefs={notificationPrefs} active={notifyEnv(process.env).enabled} />
          <p className="text-xs text-[var(--brd-mute)]">{tn("informacja")}</p>
        </section>

        <section id="wyglad" aria-labelledby="settings-theme" className={CARD}>
          <h2 id="settings-theme" className="text-lg font-semibold tracking-tight">{t("motyw")}</h2>
          <ThemeToggle />
          <h2 id="settings-language" className="text-lg font-semibold tracking-tight">{tl("label")}</h2>
          <p className="text-sm text-[var(--brd-ink-soft)]">{tl("hint")}</p>
          <LanguageSwitcher />
        </section>

        <section id="danger" className={CARD}>
          <SectionLabel>{tr("usuwanieKonta")}</SectionLabel>
          {needsFreshSignIn ? (
            // Signed in too long ago: sign out, then sign in again with the provider.
            <div className="space-y-3 text-sm">
              <p className="text-[var(--brd-ink-soft)]">{ts("usuwanieZalogujPonownie")}</p>
              <form action={signOutAction}>
                <button type="submit" className="min-h-11 underline underline-offset-4">
                  {ts("wyloguj")}
                </button>
              </form>
              {offered.length === 0 ? <p className="text-[var(--brd-mute)]">{ts("usuwanieNaStronie")}</p> : null}
            </div>
          ) : (
            <DeleteAccountForm passwordless={passwordless} />
          )}
        </section>
      </PageFrame>
    </main>
  );
}
