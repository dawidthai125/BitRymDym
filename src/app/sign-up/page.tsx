import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/auth-forms";
import { AuthThemeBar } from "@/components/site/auth-theme-bar";
import { safeNextPath, signInPathWithNext } from "@/lib/auth/next-path";
import { getCurrentProfile } from "@/lib/auth/session";

type PageProps = { searchParams?: Promise<{ next?: string | string[] }> };

export default async function SignUpPage({ searchParams }: PageProps) {
  const t = await getTranslations("auth.signUpPage");
  const params = searchParams ? await searchParams : {};
  const next = safeNextPath(Array.isArray(params.next) ? params.next[0] : params.next);
  const context = await getCurrentProfile();
  if (context) {
    redirect(next ?? "/account");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <AuthThemeBar />
      <h1 className="text-2xl font-semibold tracking-tight">{t("zalozKonto")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("zakladaszKontoTworcyPo")}
      </p>
      <SignUpForm next={next} />
      <p className="text-sm text-muted-foreground">
        {t("maszJuzKonto")}{" "}
        <Link
          href={next ? signInPathWithNext(next) : "/sign-in"}
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {t("zalogujSie")}
        </Link>
      </p>
    </main>
  );
}
