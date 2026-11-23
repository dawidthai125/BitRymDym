import { getTranslations } from "next-intl/server";
import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { SampleLab, type LabBeat } from "@/components/studio/sample-lab/sample-lab";
import { AppShell } from "@/components/site/app-shell";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { AuthError, requireUser } from "@/lib/auth/session";
import { toPublicCatalogItem } from "@/lib/beats/public";
import { listPublishedBeats } from "@/lib/beats/service";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("studio.sampleLab");
  return { title: t("metaTitle") };
}

/** Sample Lab — live instruments, manual virtual instruments, loops and one-shots. */
export default async function SampleLabPage() {
  const t = await getTranslations("studio.sampleLab");
  // Manual playing is for every signed-in user. Saving a recording / import needs Silver+ and
  // Sampek AI needs Bronze+ (the server enforces both; the page says it before the work).
  let canRecord = false;
  let canUseAi = false;
  try {
    const auth = await requireUser();
    const tier = (await resolveProductEntitlementForAuthContext(auth)).premiumTier;
    canRecord = tier === "SILVER" || tier === "GOLD";
    canUseAi = tier !== "FREE" || auth.profile.role === "ADMIN" || auth.profile.role === "MODERATOR";
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect(signInPathWithNext("/studio/sample"));
    }
    redirect("/account");
  }

  const beats: LabBeat[] = (await listPublishedBeats({ limit: 100 }))
    .map(toPublicCatalogItem)
    .filter((b) => b.bpm > 0)
    .map((b) => ({ id: b.id, title: b.title, bpm: b.bpm, key: b.key ?? null }));

  return (
    <AppShell tone="studio">
      <main data-brd-surface="control-room" data-surface="tape" className="min-h-[calc(100dvh-4.5rem)] pb-16">
        <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
          <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
            <h1 className="brd-display text-4xl tracking-tight sm:text-6xl">{t("tytul")}</h1>
            <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("opis")}</p>
          </header>
          <SampleLab beats={beats} canRecord={canRecord} canUseAi={canUseAi} />
          <Link href="/studio" className="text-sm text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline">
            {t("wrocDoStudio")}
          </Link>
        </PageFrame>
      </main>
    </AppShell>
  );
}
