import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { AccountSectionNav } from "@/components/account/account-section-nav";
import { FullClientMessages } from "@/i18n/client-messages";
import { PageFrame } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import { getCurrentProfile } from "@/lib/auth/session";
import { countUserUnread } from "@/lib/support/support-service";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getCurrentProfile();
  if (!context) redirect("/sign-in");
  const tr = await getTranslations("account.accountPage");
  const tt = await getTranslations("account.tabs");
  const unread = await countUserUnread(context.userId).catch(() => 0);
  return (
    <FullClientMessages>
    <AppShell tone="studio">
      <PageFrame className="pt-8">
        <AccountSectionNav
          label={tr("twojeStudio")}
          tabLabels={{
            overview: tt("overview"),
            takes: tt("takes"),
            library: tt("library"),
            works: tt("works"),
            settings: tt("settings"),
            // New replies show as a number on the tab.
            support: unread > 0 ? `${tt("support")} (${unread})` : tt("support"),
          }}
          pageLabels={{
            favorites: tt("favorites"),
            downloads: tt("downloads"),
            purchased: tt("purchased"),
            shared: tt("shared"),
            catalog: tt("catalog"),
            beats: tt("beats"),
            settings: tt("account"),
            publicProfile: tt("publicProfile"),
          }}
        />
      </PageFrame>
      {children}
    </AppShell>
    </FullClientMessages>
  );
}
