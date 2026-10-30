import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminMaintenanceForm } from "@/components/admin/admin-maintenance-form";
import { PageFrame, StatusPill } from "@/components/brand/chrome";
import { intlTag, type AppLocale } from "@/i18n/config";
import { AuthError, requireRole } from "@/lib/auth/session";
import { loadSiteMaintenanceSettings } from "@/lib/site/maintenance-settings";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("maintenance.admin");
  return { title: t("metaTitle") };
}

/** Panel Administracyjny → Tryb prac (site on/off). ADMIN only. */
export default async function AdminSitePage() {
  const t = await getTranslations("maintenance.admin");
  try {
    await requireRole(["ADMIN"]);
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    redirect("/admin");
  }

  const settings = await loadSiteMaintenanceSettings();
  const locale = (await getLocale()) as AppLocale;
  const lastChange = settings.updatedAt
    ? new Intl.DateTimeFormat(intlTag(locale), {
        timeZone: "Europe/Warsaw",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(settings.updatedAt))
    : null;

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <header className="mb-8 space-y-3 border-b border-[var(--brd-line)] pb-6">
          <Link
            href="/admin"
            className="text-sm text-[var(--brd-mute)] underline-offset-4 hover:underline"
          >
            {t("pulpit")}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="brd-display text-3xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <StatusPill tone={settings.enabled ? "rec" : "ok"}>
              {settings.enabled ? t("statusOn") : t("statusOff")}
            </StatusPill>
          </div>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("intro")}</p>
          <p className="font-mono text-xs text-[var(--brd-mute)]">
            {lastChange ? t("lastChange", { when: lastChange }) : t("neverChanged")}
          </p>
        </header>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
          <AdminMaintenanceForm initial={settings} />
          <aside className="space-y-2 self-start border border-[var(--brd-line)] p-4 text-sm">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--brd-mute)]">
              {t("excludedTitle")}
            </h2>
            <p className="text-[var(--brd-ink-soft)]">{t("excludedBody")}</p>
          </aside>
        </div>
      </PageFrame>
    </main>
  );
}
