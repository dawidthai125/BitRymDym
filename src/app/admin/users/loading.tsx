import { useTranslations } from "next-intl";
import { PageFrame } from "@/components/brand/chrome";

export default function AdminUsersLoading() {
  const t = useTranslations("admin.adminUsersLoading");
  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <h1 className="brd-display mt-2 text-3xl font-semibold tracking-tight">
          {t("uzytkownicy")}
        </h1>
        <p className="mt-6 text-sm text-[var(--brd-mute)]">{t("ladowanie")}</p>
      </PageFrame>
    </main>
  );
}
