import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthError, requireRole } from "@/lib/auth/session";

/**
 * PLATFORM ops remain ADMIN-only. Parent /admin layout allows MODERATOR
 * for moderation routes; this nested layout closes PLATFORM surfaces.
 */
export default async function AdminPlatformBeatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("admin.adminBeatsLayout");
  try {
    await requireRole(["ADMIN"]);
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">{t("brakDostepu")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("operacjeBitowPlatformySa")}
        </p>
        <Link
          href="/admin/moderation"
          className="mt-6 inline-block text-sm underline underline-offset-4"
        >
          {t("moderacjaBitow")}
        </Link>
      </div>
    );
  }

  return children;
}
