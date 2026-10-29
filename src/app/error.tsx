"use client";

import { useTranslations } from "next-intl";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common.error");
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("wystapilBlad")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("wystapilNieoczekiwanyBladSprobuj")}
      </p>
      <button
        type="button"
        className="w-fit rounded-lg border border-border px-3 py-1.5 text-sm"
        onClick={() => reset()}
      >
        {t("sprobujPonownie")}
      </button>
    </main>
  );
}
