import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import Link from "@/components/ui/app-link";
import { AuthError, requireRole } from "@/lib/auth/session";
import { SUPPORT_KINDS } from "@/lib/support/support-policy";
import { listStaffThreads } from "@/lib/support/support-service";

export const metadata = { title: "Opinie i błędy · Panel" };

const KIND = { opinion: "Opinia", bug: "Błąd" } as const;
const when = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" });
const CHIP = "inline-flex min-h-10 items-center border px-3 text-sm";

/** Panel → Opinie i błędy. ADMIN only. */
export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ stan?: string; typ?: string }> }) {
  try {
    await requireRole(["ADMIN"]);
  } catch (error) {
    if (error instanceof AuthError) redirect(error.code === "UNAUTHENTICATED" ? "/sign-in?next=%2Fadmin%2Fzgloszenia" : "/admin");
    throw error;
  }
  const params = await searchParams;
  const status = params.stan === "zamkniete" ? "closed" : "open";
  const kind = SUPPORT_KINDS.find((k) => k === params.typ) ?? null;
  const threads = await listStaffThreads({ status, kind });
  const href = (s: string, k: string | null) => `/admin/zgloszenia?stan=${s}${k ? `&typ=${k}` : ""}`;
  const stan = status === "closed" ? "zamkniete" : "otwarte";
  const chip = (on: boolean) => `${CHIP} ${on ? "border-[var(--brd-amber)] font-semibold" : "border-[var(--brd-line)]"}`;

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="space-y-6 py-8">
        <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
          <h1 className="brd-display text-3xl font-semibold tracking-tight">Opinie i błędy</h1>
          <p className="text-sm text-[var(--brd-mute)]">Wiadomości od użytkowników. Odpowiedź trafia do ich konta i na e-mail.</p>
        </header>
        <nav aria-label="Filtry" className="flex flex-wrap gap-2">
          <Link href={href("otwarte", kind)} aria-current={status === "open" ? "page" : undefined} className={chip(status === "open")}>Otwarte</Link>
          <Link href={href("zamkniete", kind)} aria-current={status === "closed" ? "page" : undefined} className={chip(status === "closed")}>Zamknięte</Link>
          <Link href={href(stan, null)} className={chip(kind === null)}>Wszystko</Link>
          <Link href={href(stan, "bug")} className={chip(kind === "bug")}>Błędy</Link>
          <Link href={href(stan, "opinion")} className={chip(kind === "opinion")}>Opinie</Link>
        </nav>
        {threads.length === 0 ? (
          <p className="text-sm text-[var(--brd-mute)]">Nic tu nie ma.</p>
        ) : (
          <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link href={`/admin/zgloszenia/${thread.id}`} className="flex min-h-14 items-center justify-between gap-3 py-3 hover:underline">
                  <span className="min-w-0">
                    <span className={`block truncate ${thread.staffUnread > 0 ? "font-bold" : "font-medium"}`}>{thread.subject}</span>
                    <span className="block text-xs text-[var(--brd-mute)]">
                      {KIND[thread.kind]} · {thread.author}{thread.userNumber != null ? ` (ID: ${thread.userNumber})` : ""} · {when.format(new Date(thread.lastMessageAt))} · {thread.lastSender === "staff" ? "odpisane" : "czeka na odpowiedź"}
                    </span>
                  </span>
                  {thread.staffUnread > 0 ? (
                    <span className="shrink-0 rounded-full bg-[var(--brd-amber)] px-2 text-xs font-bold text-[var(--brd-on-amber,#1a1006)]">{thread.staffUnread} nowe</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageFrame>
    </main>
  );
}
