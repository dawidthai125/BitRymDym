import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { AuthThemeBar } from "@/components/site/auth-theme-bar";
import { getCurrentProfile } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgotPasswordPage");
  const context = await getCurrentProfile();
  if (context) {
    redirect("/account#security");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <AuthThemeBar />
      <h1 className="text-2xl font-semibold tracking-tight">{t("resetHasla")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("podajEMailPowiazany")}
      </p>
      <ForgotPasswordForm />
      <p className="text-sm text-muted-foreground">
        <Link
          href="/sign-in"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {t("wrocDoLogowania")}
        </Link>
      </p>
    </main>
  );
}
