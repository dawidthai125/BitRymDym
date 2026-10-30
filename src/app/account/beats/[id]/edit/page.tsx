import { getLibText } from "@/i18n/get-lib-text";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageFrame, StatusPill } from "@/components/brand/chrome";
import { OwnerBeatEditForm } from "@/components/beats/owner-beat-edit-form";
import { AppShell } from "@/components/site/app-shell";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { AuthError } from "@/lib/auth/session";
import { isOwnerEditableStatus } from "@/lib/beats/owner-edit-policy";
import { getOwnUserBeatForEdit } from "@/lib/beats/service";
import { beatStatusLabelPl, beatStatusTone } from "@/lib/beats/status-labels";
import type { Beat } from "@/types/domain";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("account.accountBeatEditPage");
  return { title: t("metaTitle") };
}

/** User beats 2026-10-30 — owner edit: metadata, sharing, cover. */
export default async function AccountBeatEditPage({ params }: PageProps) {
  const tl = await getLibText();
  const t = await getTranslations("account.accountBeatEditPage");
  const { id } = await params;
  let beat: Beat;
  try {
    beat = await getOwnUserBeatForEdit(id);
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect(signInPathWithNext(`/account/beats/${id}/edit`));
    }
    if (error instanceof AuthError) notFound();
    throw error;
  }

  return (
    <AppShell tone="studio">
      <main className="pb-16">
        <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
          <header className="flex flex-col gap-3 border-b border-[var(--brd-line)] pb-6">
            <Link
              href="/account/beats"
              className="inline-flex min-h-11 w-fit items-center text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
            >
              {t("mojeBity")}
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="brd-display min-w-0 break-words text-3xl font-semibold tracking-tight sm:text-4xl">
                {t("edytuj", { title: tl(beat.title) })}
              </h1>
              <StatusPill tone={beatStatusTone(beat.status)}>
                {tl(beatStatusLabelPl(beat.status))}
              </StatusPill>
            </div>
            {beat.status === "PUBLISHED" ? (
              <Link
                href={`/beat/${beat.id}`}
                className="inline-flex min-h-11 w-fit items-center text-sm text-[var(--brd-green)] underline underline-offset-4"
              >
                {t("zobaczStroneBitu")}
              </Link>
            ) : null}
          </header>
          <OwnerBeatEditForm
            initial={{
              id: beat.id,
              title: beat.title,
              producer: beat.producer,
              description: beat.description,
              genre: beat.genre,
              style: beat.style,
              bpm: beat.bpm,
              key: beat.key,
              scale: beat.scale,
              tags: beat.tags,
              visibility: beat.visibility ?? "public",
              allowDownload: beat.allowDownload !== false,
              allowStudioUse: beat.allowStudioUse !== false,
              coverStatus: beat.coverStatus ?? "none",
              coverUpdatedAt: beat.coverUpdatedAt ?? null,
              coverRejectionReason: beat.coverRejectionReason ?? null,
              keyDetected: beat.keyDetected ?? null,
              keyConfidence: beat.keyConfidence ?? null,
              editable: isOwnerEditableStatus(beat.status),
              published: beat.status === "PUBLISHED",
            }}
          />
        </PageFrame>
      </main>
    </AppShell>
  );
}
