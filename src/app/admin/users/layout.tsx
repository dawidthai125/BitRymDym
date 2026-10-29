import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthError } from "@/lib/auth/session";
import { requireAdminUsersListAccess } from "@/lib/admin/users-list";

export default async function AdminUsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("admin.adminUsersLayout");
  try {
    await requireAdminUsersListAccess();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="brd-display text-2xl font-semibold tracking-tight">
          {t("brakDostepu")}
        </h1>
        <p className="mt-2 text-sm text-[var(--brd-mute)]">
          {t("listaUzytkownikowJestDostepna")}
        </p>
        <Link
          href="/admin/moderation"
          className="mt-6 inline-block text-sm underline underline-offset-4"
        >
          {t("moderacja")}
        </Link>
      </div>
    );
  }

  return children;
}
