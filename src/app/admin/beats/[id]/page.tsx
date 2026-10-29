import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminAudioUploadForm } from "@/components/admin/admin-audio-upload-form";
import { AdminLifecycleControls } from "@/components/admin/admin-lifecycle-controls";
import { AdminMetadataForm } from "@/components/admin/admin-metadata-form";
import { AdminPlatformOpsExportButton } from "@/components/admin/admin-platform-ops-export-button";
import { checkAccess } from "@/lib/auth/access-denial";
import { AuthError } from "@/lib/auth/session";
import { getBeatAudioPublicInfo } from "@/lib/beats/audio-service";
import {
  getPlatformBeatForAdmin,
  requireAdminPlatformBeatsAccess,
} from "@/lib/beats/service";
import { labelBeatStatus } from "@/lib/ui/labels";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminBeatDetailPage({ params }: PageProps) {
  const t = await getTranslations("admin.adminBeatsPage");
  const { id } = await params;

  // getPlatformBeatForAdmin also throws FORBIDDEN for non-PLATFORM beats, so the
  // viewer denial is resolved from the guard alone, before loading the beat.
  const denial = await checkAccess(requireAdminPlatformBeatsAccess);
  if (denial === "UNAUTHENTICATED") redirect("/sign-in");
  if (denial === "FORBIDDEN") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">{t("brakDostepu")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("brakUprawnieniaDoEdycji")}
        </p>
      </main>
    );
  }

  let beat;
  try {
    beat = await getPlatformBeatForAdmin(id);
  } catch (error) {
    if (error instanceof AuthError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const audio = await getBeatAudioPublicInfo(beat.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16">
      <header className="space-y-2">
        <Link
          href="/admin/beats"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("lista")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {beat.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {labelBeatStatus(beat.status)} {t("bitPlatformowy")}
          {audio.activeMasterReady ? t("audioGotowe") : t("brakAudio")}
        </p>
        {beat.status === "PUBLISHED" ? (
          <Link
            href={`/beat/${beat.id}`}
            className="inline-block text-sm underline underline-offset-4"
          >
            {t("otworzPublicznaStrone")}
          </Link>
        ) : null}
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium tracking-tight">{t("statusPublikacji")}</h2>
        <AdminLifecycleControls
          beatId={beat.id}
          status={beat.status}
          activeMasterReady={audio.activeMasterReady}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium tracking-tight">{t("audioMaster")}</h2>
        <AdminAudioUploadForm
          beatId={beat.id}
          activeMasterReady={audio.activeMasterReady}
        />
        <AdminPlatformOpsExportButton
          beatId={beat.id}
          title={beat.title}
          activeMasterReady={audio.activeMasterReady}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium tracking-tight">{t("metadane")}</h2>
        <AdminMetadataForm beat={beat} />
      </section>
    </main>
  );
}
