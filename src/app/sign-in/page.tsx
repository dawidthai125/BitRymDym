import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/auth-forms";
import { AuthThemeBar } from "@/components/site/auth-theme-bar";
import { safeNextPath, signUpPathWithNext } from "@/lib/auth/next-path";
import { getCurrentProfile } from "@/lib/auth/session";
import { MAINTENANCE_HEADER } from "@/lib/site/maintenance-gate";

type PageProps = { searchParams?: Promise<{ next?: string | string[] }> };

export default async function SignInPage({ searchParams }: PageProps) {
  const t = await getTranslations("auth.signInPage");
  const tm = await getTranslations("maintenance.signIn");
  // Set by middleware only while maintenance mode is on.
  const maintenance = (await headers()).get(MAINTENANCE_HEADER) === "1";
  const params = searchParams ? await searchParams : {};
  const next = safeNextPath(Array.isArray(params.next) ? params.next[0] : params.next);
  const context = await getCurrentProfile();
  if (context) {
    redirect(next ?? "/account");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <AuthThemeBar />
      <h1 className="text-2xl font-semibold tracking-tight">{t("zalogujSie")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("zalogujSieAbyKorzystac")}
      </p>
      {maintenance ? (
        <div
          role="status"
          data-testid="maintenance-sign-in-notice"
          className="border-l-4 border-[var(--tape-amber)] bg-[var(--tape-panel)] px-4 py-3 text-sm text-[var(--tape-cream)]"
        >
          <p className="font-semibold">{tm("noticeTitle")}</p>
          <p className="mt-1 text-[var(--tape-cream-soft)]">{tm("noticeBody")}</p>
        </div>
      ) : null}
      <SignInForm next={next} />
      {maintenance ? null : (
        <p className="text-sm text-muted-foreground">
          {t("nieMaszKonta")}{" "}
          <Link
            href={signUpPathWithNext(next)}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {t("zalozKonto")}
          </Link>
        </p>
      )}
    </main>
  );
}
