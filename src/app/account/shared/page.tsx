import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/site/site-header";
import { AuthError, requireUser } from "@/lib/auth/session";
import { listActiveGranteeGrantsFor } from "@/lib/grants/beat-access-grants";

export const metadata = {
  title: "Bity udostępnione · BitRymDym",
};

export default async function AccountSharedBeatsPage() {
  let context;
  try {
    context = await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    redirect("/account");
  }

  const grants = await listActiveGranteeGrantsFor(context);

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Bity udostępnione
          </h1>
          <p className="text-sm text-muted-foreground">
            Bity, na których właściciele umożliwili Ci nagrywanie. Wejdź w bit,
            aby nagrać. Udostępnienie nie daje dostępu do cudzych nagrań.
          </p>
        </header>

        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nie masz aktywnych udostępnień.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {grants.map((g) => (
              <li
                key={g.id}
                className="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="font-medium tracking-tight">{g.beatTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    Nagrywanie
                    {g.expiresAt
                      ? ` · wygasa ${new Date(g.expiresAt).toLocaleString()}`
                      : " · bezterminowy"}
                  </p>
                </div>
                <Link
                  href={`/beat/${g.beatId}`}
                  className="text-sm font-medium underline underline-offset-4"
                >
                  Otwórz i nagraj
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/account"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Konto
        </Link>
      </main>
    </div>
  );
}
