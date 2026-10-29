import { useTranslations } from "next-intl";
import Link from "next/link";

import { AdminCreateBeatForm } from "@/components/admin/admin-create-beat-form";

export default function AdminNewBeatPage() {
  const t = useTranslations("admin.adminBeatsNewPage");
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16">
      <header className="space-y-2">
        <Link
          href="/admin/beats"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("lista")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t("nowyBitPlatformowy")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("tworzyWersjeRoboczaBitu")}
        </p>
      </header>
      <AdminCreateBeatForm />
    </main>
  );
}
