import Link from "next/link";

import { SignInForm } from "@/components/auth/auth-forms";
import { getCurrentProfile } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function SignInPage() {
  const context = await getCurrentProfile();
  if (context) {
    redirect("/account");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Zaloguj się</h1>
      <p className="text-sm text-muted-foreground">
        Minimalny flow techniczny Phase 1.3 — nie jest to finalny UX marki.
      </p>
      <SignInForm />
      <p className="text-sm text-muted-foreground">
        Nie masz konta?{" "}
        <Link href="/sign-up" className="underline underline-offset-4">
          Załóż konto
        </Link>
      </p>
    </main>
  );
}
