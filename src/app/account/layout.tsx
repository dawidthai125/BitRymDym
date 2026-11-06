import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { AccountSectionNav } from "@/components/account/account-section-nav";
import { PageFrame } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import { getCurrentProfile } from "@/lib/auth/session";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getCurrentProfile();
  if (!context) redirect("/sign-in");
  const tr = await getTranslations("account.accountPage");
  return (
    <AppShell tone="studio">
      <PageFrame className="pt-8">
        <AccountSectionNav
          items={[
            { href: "/account/takes", label: tr("mojeNagrania") },
            { href: "/account/beats", label: tr("mojeBity") },
            { href: "/account/downloads", label: tr("eksportyIPobrania") },
            { href: "/account/shared", label: tr("udostepnione") },
          ]}
        />
      </PageFrame>
      {children}
    </AppShell>
  );
}
