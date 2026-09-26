import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  CONFIRMATION_COPY,
  parseConfirmationStatus,
} from "@/lib/auth/confirmation";
import { cn } from "@/lib/utils";

type ConfirmedPageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function AuthConfirmedPage({
  searchParams,
}: ConfirmedPageProps) {
  const params = await searchParams;
  const status = parseConfirmationStatus(params.status);
  const copy = CONFIRMATION_COPY[status];
  const isSuccess = status === "success";

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium tracking-tight text-muted-foreground">
        BitRymDym
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href="/sign-in" className={cn(buttonVariants())}>
          Zaloguj się
        </Link>
        {isSuccess ? (
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Przejdź do strony głównej
          </Link>
        ) : (
          <Link
            href="/sign-up"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Załóż konto ponownie
          </Link>
        )}
      </div>
    </main>
  );
}
