import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/auth-forms";
import { AuthThemeBar } from "@/components/site/auth-theme-bar";
import { getCurrentProfile } from "@/lib/auth/session";

export default async function SignInPage() {
  const t = await getTranslations("auth.signInPage");
  const context = await getCurrentProfile();
  if (context) {
    redirect("/account");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <AuthThemeBar />
      <h1 className="text-2xl font-semibold tracking-tight">{t("zalogujSie")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("zalogujSieAbyKorzystac")}
      </p>
      <SignInForm />
      <p className="text-sm text-muted-foreground">
        {t("nieMaszKonta")}{" "}
        <Link
          href="/sign-up"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {t("zalozKonto")}
        </Link>
      </p>
    </main>
  );
}
