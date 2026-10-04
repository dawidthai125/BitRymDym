import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthError } from "@/lib/auth/session";
import { requireAdminUsersListAccess } from "@/lib/admin/users-list";

export default async function AdminUsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdminUsersListAccess();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="brd-display text-2xl font-semibold tracking-tight">
          Brak dostępu
        </h1>
        <p className="mt-2 text-sm text-[var(--brd-mute)]">
          Lista użytkowników jest dostępna wyłącznie dla administratora.
        </p>
        <Link
          href="/admin/moderation"
          className="mt-6 inline-block text-sm underline underline-offset-4"
        >
          Moderacja
        </Link>
      </div>
    );
  }

  return children;
}
