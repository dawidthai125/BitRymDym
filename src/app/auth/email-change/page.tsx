import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { ConsumeEmailChangeNotice } from "@/components/auth/consume-email-change-notice";
import { EmailChangeNotice } from "@/components/auth/email-change-notice";
import { buttonVariants } from "@/components/ui/button";
import { resolveEmailChangeNoticeDisplay } from "@/lib/auth/email-change";
import { readEmailChangeNotice } from "@/lib/auth/email-change-notice";
import { cn } from "@/lib/utils";

export default async function EmailChangeResultPage() {
  const t = await getTranslations("auth.authEmailChangePage");
  const signedStatus = await readEmailChangeNotice();
  const status = resolveEmailChangeNoticeDisplay({
    signedStatus,
    pendingNewEmail: null,
    sessionReadable: false,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium tracking-tight text-muted-foreground">
        {t("bitrymdym")}
      </p>
      {status ? <EmailChangeNotice status={status} /> : (
        <p className="text-sm text-muted-foreground">
          {t("nieMaTuNowego")}
        </p>
      )}
      {signedStatus ? <ConsumeEmailChangeNotice /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href="/account" className={cn(buttonVariants(), "min-h-11")}>
          {t("wrocDoKonta")}
        </Link>
        <Link
          href="/sign-in"
          className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}
        >
          {t("zalogujSie")}
        </Link>
      </div>
    </main>
  );
}
