import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { ChatThread } from "@/components/support/chat-thread";
import Link from "@/components/ui/app-link";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { getCurrentProfile } from "@/lib/auth/session";
import { openOwnConversation } from "@/lib/support/support-service";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("support.page");
  return { title: t("title") };
}

export default async function SupportThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const session = await getCurrentProfile();
  if (!session) redirect(signInPathWithNext(`/account/support/${encodeURIComponent(threadId)}`));
  const conversation = await openOwnConversation(session.userId, threadId);
  if (!conversation) notFound();
  const t = await getTranslations("support.page");

  return (
    <main className="pb-16">
      <PageFrame className="flex max-w-3xl flex-col gap-4 py-8">
        <Link href="/account/support" className="inline-flex min-h-11 w-fit items-center text-sm text-[var(--brd-green)] hover:underline">
          {t("back")}
        </Link>
        <header className="space-y-1">
          <h1 className="brd-display break-words text-2xl font-semibold tracking-tight">{conversation.thread.subject}</h1>
          <p className="text-xs text-[var(--brd-mute)]">
            {t(`kind.${conversation.thread.kind}`)}
            {conversation.thread.status === "closed" ? ` · ${t("closedHint")}` : ""}
          </p>
        </header>
        <ChatThread key={threadId} endpoint={`/api/support/${conversation.thread.id}`} side="user" initial={conversation} />
        <p className="text-xs text-[var(--brd-mute)]">{t("replyHint")}</p>
      </PageFrame>
    </main>
  );
}
