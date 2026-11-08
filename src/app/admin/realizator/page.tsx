import Link from "next/link";
import { redirect } from "next/navigation";

import { EngineerAnswerForm } from "@/components/admin/engineer-answer-form";
import { PageFrame } from "@/components/brand/chrome";
import { canAccessAdminNav, canAccessModerationNav } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Kolejka realizatora" };

type OpenRequest = { id: string; body: string; created_at: string | null };

export default async function AdminEngineerQueuePage() {
  const context = await getCurrentProfile();
  const role = context?.profile.role;
  const showPlatform = canAccessAdminNav(role);
  const showModeration = canAccessModerationNav(role);

  if (!showPlatform && showModeration) {
    redirect("/admin/moderation");
  }
  if (!showPlatform && !showModeration) {
    redirect("/sign-in");
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_engineer_requests")
    .select("id, body, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as OpenRequest[];

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <header className="mb-8 space-y-2 border-b border-[var(--brd-line)] pb-6">
          <Link
            href="/admin"
            className="text-sm text-[var(--brd-mute)] underline-offset-4 hover:underline"
          >
            Pulpit
          </Link>
          <h1 className="brd-display text-3xl font-semibold tracking-tight">Kolejka realizatora</h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
            Otwarte zgłoszenia. Odpowiedź zapisuje się przy zgłoszeniu. Użytkownik widzi ją na stronie Realizator.
          </p>
        </header>
        {error ? (
          <p className="text-sm text-[var(--brd-ink-soft)]">Nie udało się odczytać kolejki.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--brd-ink-soft)]">Brak otwartych zgłoszeń.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((row) => (
              <li key={row.id} className="border border-[var(--brd-line)] p-4">
                <p className="text-xs text-[var(--brd-mute)]">
                  {row.created_at ? new Date(row.created_at).toLocaleString("pl-PL") : "—"}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--brd-ink)]">{row.body}</p>
                <EngineerAnswerForm requestId={row.id} />
              </li>
            ))}
          </ul>
        )}
      </PageFrame>
    </main>
  );
}
