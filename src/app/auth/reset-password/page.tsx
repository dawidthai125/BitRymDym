import Link from "next/link";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { passwordRecoverySealMatches } from "@/lib/auth/password-recovery-seal-cookie";
import { getSessionUser } from "@/lib/auth/session";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Recovery landing after a successful /auth/callback recovery exchange.
 * Requires the session user and a server-signed recovery seal for that user.
 */
export default async function ResetPasswordPage() {
  const env = getSupabasePublicEnv();
  if (!env.isConfigured) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">Reset hasła</h1>
        <p className="text-sm text-muted-foreground">
          Konfiguracja lokalna jest niekompletna.
        </p>
      </main>
    );
  }

  const user = await getSessionUser();
  if (!user) {
    redirect("/forgot-password");
  }

  let sealMatches = false;
  try {
    sealMatches = await passwordRecoverySealMatches(user.id);
  } catch {
    sealMatches = false;
  }
  if (!sealMatches) {
    redirect("/forgot-password");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Nowe hasło</h1>
      <p className="text-sm text-muted-foreground">
        Ustaw nowe hasło dla swojego konta.
      </p>
      <ResetPasswordForm />
      <p className="text-sm text-muted-foreground">
        <Link
          href="/sign-in"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Anuluj i zaloguj się
        </Link>
      </p>
    </main>
  );
}
