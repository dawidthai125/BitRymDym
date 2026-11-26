import { notFound, redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { ChatThread } from "@/components/support/chat-thread";
import Link from "@/components/ui/app-link";
import { AuthError, requireRole } from "@/lib/auth/session";
import { openStaffConversation } from "@/lib/support/support-service";

import { StatusButton } from "./status-button";

export const metadata = { title: "Rozmowa · Panel" };

const when = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" });

export default async function AdminSupportThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  try {
    await requireRole(["ADMIN"]);
  } catch (error) {
    if (error instanceof AuthError) redirect(error.code === "UNAUTHENTICATED" ? "/sign-in?next=%2Fadmin%2Fzgloszenia" : "/admin");
    throw error;
  }
  const conversation = await openStaffConversation(threadId);
  if (!conversation) notFound();
  const { info, thread, messages } = conversation;
  const facts: [string, string][] = [
    ["Od", `${info.author}${info.userNumber != null ? ` (ID: ${info.userNumber})` : ""}`],
    ["E-mail", info.email ?? "—"],
    ["Rodzaj", thread.kind === "bug" ? "Błąd" : "Opinia"],
    ["Założono", when.format(new Date(thread.createdAt))],
    ["Ze strony", info.page ?? "—"],
    ...(thread.kind === "bug" ? ([["Przeglądarka", info.browser ?? "—"]] as [string, string][]) : []),
  ];

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="space-y-4 py-8">
        <Link href="/admin/zgloszenia" className="inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline">← Wszystkie rozmowy</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="brd-display min-w-0 break-words text-2xl font-semibold tracking-tight">{thread.subject}</h1>
          <StatusButton threadId={thread.id} status={thread.status} />
        </div>
        <dl className="grid gap-x-6 gap-y-2 border-y border-[var(--brd-line)] py-3 text-sm sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-[var(--brd-mute)]">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
        <ChatThread key={thread.id} endpoint={`/api/admin/support/${thread.id}`} side="staff" initial={{ thread, messages }} />
      </PageFrame>
    </main>
  );
}
