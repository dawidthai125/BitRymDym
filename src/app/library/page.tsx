import { useLibText } from "@/i18n/use-lib-text";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/site/app-shell";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { getCurrentProfile } from "@/lib/auth/session";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("beats.libraryPage");
  return { title: t("metaTitle") };
}

export default async function LibraryPage() {
  const t = await getTranslations("beats.libraryPage");
  const session = await getCurrentProfile();
  if (!session) redirect("/sign-in");

  return (
    <AppShell tone="studio">
      <main>
        <PageFrame className="py-10">
          <SectionLabel>{t("biblioteka")}</SectionLabel>
          <h1 className="brd-display mt-2 text-3xl font-semibold">
            {t("twojaBiblioteka")}
          </h1>
          <ul className="mt-8 divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
            <LibLink href="/studio/recordings" title={t("nagrania")} meta={t("twojeNagrania")} />
            <LibLink href="/library/downloads" title={t("pobrane")} meta={t("pobraneBity")} />
            <LibLink
              href="/library/favorites"
              title={t("ulubione")}
              meta={t("wkrotce")}
            />
            <LibLink href="/account/shared" title={t("udostepnione")} meta={t("bityOdInnych")} />
          </ul>
        </PageFrame>
      </main>
    </AppShell>
  );
}

function LibLink({
  href,
  title,
  meta,
}: {
  href: string;
  title: string;
  meta: string;
}) {
  const tl = useLibText();
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-12 items-center justify-between py-3 hover:text-[var(--brd-green)]"
      >
        <div>
          <p className="font-medium">{tl(title)}</p>
          <p className="text-sm text-[var(--brd-mute)]">{tl(meta)}</p>
        </div>
        <span aria-hidden>→</span>
      </Link>
    </li>
  );
}
