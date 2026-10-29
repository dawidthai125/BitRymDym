import { useTranslations } from "next-intl";
import Link from "next/link";

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
