import { useTranslations } from "next-intl";
export default function Loading() {
  const t = useTranslations("common.loading");
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl items-center px-6">
      <p className="text-sm text-muted-foreground">{t("ladowanie")}</p>
    </main>
  );
}
