import Link from "next/link";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/auth-forms";
import { getCurrentProfile } from "@/lib/auth/session";

export default async function SignUpPage() {
  const context = await getCurrentProfile();
  if (context) {
    redirect("/account");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Załóż konto</h1>
      <p className="text-sm text-muted-foreground">
        Nowe konto: rola USER + poziom BEGINNER_RAPPER (OD-19). Pierwszy ADMIN
        tylko przez manual / operator-controlled bootstrap poza signup (OD-20).
      </p>
      <SignUpForm />
      <p className="text-sm text-muted-foreground">
        Masz już konto?{" "}
        <Link href="/sign-in" className="underline underline-offset-4">
          Zaloguj się
        </Link>
      </p>
    </main>
  );
}
