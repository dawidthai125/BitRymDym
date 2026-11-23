import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "@/components/ui/app-link";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getTranslations("meta.pages");
  return { title: { absolute: m("notFoundTitle") } };
}

export default function NotFound() {
  const t = useTranslations("common.notFound");
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nieZnaleziono")}</h1>
      <p className="text-sm text-muted-foreground">{t("taStronaNieIstnieje")}</p>
      <Link href="/" className="text-sm underline underline-offset-4">
        {t("wrocNaStroneGlowna")}
      </Link>
    </main>
  );
}
