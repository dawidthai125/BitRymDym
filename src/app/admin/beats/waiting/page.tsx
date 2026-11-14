import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminWaitingBeats } from "@/components/admin/admin-waiting-beats";
import { checkAccess } from "@/lib/auth/access-denial";
import { listWaitingGeneratedBeats } from "@/lib/beats/ai-beat/waiting";
import { requireAdminPlatformBeatsAccess } from "@/lib/beats/service";

export default async function AdminWaitingBeatsPage() {
  const t = await getTranslations("admin.adminBeatsWaitingPage");
  const ta = await getTranslations("admin.adminBeatsPage");
  const denial = await checkAccess(requireAdminPlatformBeatsAccess);
  if (denial === "UNAUTHENTICATED") redirect("/sign-in");
  if (denial === "FORBIDDEN") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">{ta("brakDostepu")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ta("brakUprawnieniaDoEdycji")}
        </p>
      </main>
    );
  }

  const beats = await listWaitingGeneratedBeats();

  return (
    <main className="mx-auto flex w-full max-w-[var(--brd-max-ops)] flex-col gap-6 px-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-16">
      <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
        <Link
          href="/admin/beats"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("lista")}
        </Link>
        <p className="brd-meta text-[11px] uppercase tracking-[0.2em] text-[var(--brd-mute)]">
          {ta("panelAdministracyjny")}
        </p>
        <h1 className="brd-display text-3xl font-semibold tracking-tight">{t("tytul")}</h1>
        <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("opis")}</p>
      </header>
      <AdminWaitingBeats beats={beats} />
    </main>
  );
}
