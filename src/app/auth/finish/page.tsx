import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { FinishSocialSignupForm } from "@/components/auth/finish-social-form";
import { safeNextPath } from "@/lib/auth/next-path";
import { getSessionUser } from "@/lib/auth/session";
import { needsSocialProfileCompletion } from "@/lib/auth/social";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("auth.finishPage");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function FinishSocialSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(Array.isArray(params.next) ? params.next[0] : params.next);
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (!needsSocialProfileCompletion(user)) redirect(next ?? "/account");
  const t = await getTranslations("auth.finishPage");

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{t("tytul")}</h1>
      <p className="text-sm text-muted-foreground">{t("opis")}</p>
      <FinishSocialSignupForm next={next} />
    </main>
  );
}
