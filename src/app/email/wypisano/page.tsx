import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PageFrame } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("account.notifications");
  return { title: t("wypisanoTytul"), robots: { index: false, follow: false } };
}

export default async function UnsubscribedPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const t = await getTranslations("account.notifications");
  const ok = (await searchParams).ok === "1";
  return (
    <AppShell>
      <main>
        <PageFrame className="max-w-xl py-16">
          <h1 className="text-2xl font-bold">{ok ? t("wypisanoTytul") : t("wypisanoBladTytul")}</h1>
          <p className="mt-3 text-[var(--brd-mute)]">{ok ? t("wypisanoOpis") : t("wypisanoBladOpis")}</p>
          <Link href="/account#powiadomienia" className="mt-6 inline-flex min-h-11 items-center underline underline-offset-4">{t("przejdzDoUstawien")}</Link>
        </PageFrame>
      </main>
    </AppShell>
  );
}
