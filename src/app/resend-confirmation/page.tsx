import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { ResendConfirmationForm } from "@/components/auth/resend-confirmation-form";
import { AuthThemeBar } from "@/components/site/auth-theme-bar";
import Link from "@/components/ui/app-link";
import { getCurrentProfile } from "@/lib/auth/session";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("auth.resendConfirmation");
  return { title: t("metaTitle"), robots: { index: false, follow: true } };
}

export default async function ResendConfirmationPage() {
  const t = await getTranslations("auth.resendConfirmation");
  if (await getCurrentProfile()) redirect("/account");

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <AuthThemeBar />
      <h1 className="text-2xl font-semibold tracking-tight">{t("tytul")}</h1>
      <p className="text-sm text-muted-foreground">{t("opis")}</p>
      <ResendConfirmationForm />
      <p className="text-sm text-muted-foreground">
        <Link href="/sign-in" className="inline-flex min-h-11 items-center underline underline-offset-4">
          {t("wrocDoLogowania")}
        </Link>
      </p>
    </main>
  );
}
