import Link from "next/link";
import { redirect } from "next/navigation";

import { DisplayNameForm } from "@/components/auth/display-name-form";
import { signOutAction } from "@/lib/auth/actions";
import { getCurrentProfile } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export default async function AccountPage() {
  const env = getSupabasePublicEnv();
  if (!env.isConfigured) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">Konto</h1>
        <p className="text-sm text-muted-foreground">
          Supabase nie jest skonfigurowane lokalnie. Uzupełnij `.env.local` na
          podstawie `.env.example`, zastosuj migrację SQL, potem wróć tutaj.
        </p>
        <Link href="/" className="text-sm underline underline-offset-4">
          Strona główna
        </Link>
      </main>
    );
  }

  const context = await getCurrentProfile();
  if (!context) {
    redirect("/sign-in");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Konto</h1>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{context.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Rola</dt>
          <dd>{context.profile.role}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Poziom konta</dt>
          <dd>{context.profile.accountLevel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Uprawnienia (z roli)</dt>
          <dd className="break-all">
            {context.permissions.length > 0
              ? context.permissions.join(", ")
              : "(brak — standardowy USER)"}
          </dd>
        </div>
      </dl>

      <DisplayNameForm
        initialDisplayName={context.profile.displayName ?? ""}
      />

      <form action={signOutAction}>
        <Button type="submit" variant="outline">
          Wyloguj
        </Button>
      </form>

      <Link href="/" className="text-sm underline underline-offset-4">
        Strona główna
      </Link>
    </main>
  );
}
