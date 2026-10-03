import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { getCurrentProfile } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function ForgotPasswordPage() {
  const context = await getCurrentProfile();
  if (context) {
    redirect("/account#security");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Reset hasła</h1>
      <p className="text-sm text-muted-foreground">
        Podaj e-mail powiązany z kontem. Wyślemy link do ustawienia nowego hasła.
      </p>
      <ForgotPasswordForm />
      <p className="text-sm text-muted-foreground">
        <Link
          href="/sign-in"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Wróć do logowania
        </Link>
      </p>
    </main>
  );
}
