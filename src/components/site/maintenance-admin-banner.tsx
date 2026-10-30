import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";

import { MAINTENANCE_ADMIN_HEADER } from "@/lib/site/maintenance-gate";

/**
 * Slim notice for ADMINs browsing while maintenance mode is on.
 * The header is set by middleware only (client copies are stripped there),
 * so this costs no extra DB read per page.
 */
export async function MaintenanceAdminBanner() {
  const h = await headers();
  if (h.get(MAINTENANCE_ADMIN_HEADER) !== "1") return null;
  const t = await getTranslations("maintenance.banner");
  return (
    <div
      role="status"
      data-testid="maintenance-admin-banner"
      className="relative z-50 border-b border-[var(--tape-amber-deep)] bg-[var(--tape-amber)] text-[var(--tape-on-amber)]"
    >
      <div className="mx-auto flex w-full max-w-[var(--brd-max-wide)] flex-wrap items-center gap-x-3 gap-y-1 px-[max(1rem,env(safe-area-inset-left))] py-2 text-sm">
        <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.14em]">
          <span aria-hidden="true" className="size-2 rounded-full bg-[var(--tape-rec)] ring-2 ring-[var(--tape-on-amber)]/20" />
          {t("label")}
        </span>
        <span className="hidden min-w-0 flex-1 sm:inline">{t("body")}</span>
        <Link
          href="/admin/site"
          className="ml-auto inline-flex min-h-8 items-center font-semibold underline underline-offset-4"
        >
          {t("manage")}
        </Link>
      </div>
    </div>
  );
}
