import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { NewThreadForm } from "@/components/support/new-thread-form";
import Link from "@/components/ui/app-link";
import { intlTag, resolveLocale } from "@/i18n/config";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { getCurrentProfile } from "@/lib/auth/session";
import { cleanPagePath } from "@/lib/support/support-policy";
import { listOwnThreads } from "@/lib/support/support-service";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("support.page");
  return { title: t("title") };
}

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ new?: string; from?: string }> }) {
  const params = await searchParams;
  const session = await getCurrentProfile();
  if (!session) redirect(signInPathWithNext("/account/support"));
  const t = await getTranslations("support.page");
  const tag = intlTag(resolveLocale(await getLocale()));
  const threads = await listOwnThreads(session.userId).catch(() => null);
  const when = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Warsaw" });

  return (
    <main className="pb-16">
      <PageFrame className="flex max-w-3xl flex-col gap-8 py-10">
        <header className="space-y-2">
          <h1 className="brd-display text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("lead")}</p>
        </header>

        <NewThreadForm initialKind={params.new === "bug" ? "bug" : "opinion"} fromPage={cleanPagePath(params.from)} />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("mine")}</h2>
          {threads === null ? (
            <p role="alert" className="text-sm text-[var(--brd-rec)]">{t("listFailed")}</p>
          ) : threads.length === 0 ? (
            <p className="text-sm text-[var(--brd-mute)]">{t("empty")}</p>
          ) : (
            <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <Link href={`/account/support/${thread.id}`} className="flex min-h-14 items-center justify-between gap-3 py-3 hover:text-[var(--brd-green)]">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{thread.subject}</span>
                      <span className="block text-xs text-[var(--brd-mute)]">
                        {t(`kind.${thread.kind}`)} · {t(thread.status === "closed" ? "closed" : thread.lastSender === "staff" ? "answered" : "waiting")} · {when.format(new Date(thread.lastMessageAt))}
                      </span>
                    </span>
                    {thread.userUnread > 0 ? (
                      <span className="shrink-0 rounded-full bg-[var(--brd-amber)] px-2 text-xs font-bold text-[var(--brd-on-amber,#1a1006)]">
                        {t("unread", { n: thread.userUnread })}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageFrame>
    </main>
  );
}
