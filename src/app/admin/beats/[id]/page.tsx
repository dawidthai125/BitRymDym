import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminAudioUploadForm } from "@/components/admin/admin-audio-upload-form";
import { AdminLifecycleControls } from "@/components/admin/admin-lifecycle-controls";
import { AdminMetadataForm } from "@/components/admin/admin-metadata-form";
import { AuthError } from "@/lib/auth/session";
import { getBeatAudioPublicInfo } from "@/lib/beats/audio-service";
import { getPlatformBeatForAdmin } from "@/lib/beats/service";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminBeatDetailPage({ params }: PageProps) {
  const { id } = await params;

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
          ← Lista
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {beat.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {beat.status} · PLATFORM · owner_id={beat.ownerId ?? "null"}
        </p>
        {beat.status === "PUBLISHED" ? (
          <Link
            href={`/beat/${beat.id}`}
            className="inline-block text-sm underline underline-offset-4"
          >
            Otwórz publiczną stronę →
          </Link>
        ) : null}
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium tracking-tight">Lifecycle</h2>
        <AdminLifecycleControls
          beatId={beat.id}
          status={beat.status}
          activeMasterReady={audio.activeMasterReady}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium tracking-tight">Audio MASTER</h2>
        <AdminAudioUploadForm
          beatId={beat.id}
          activeMasterReady={audio.activeMasterReady}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium tracking-tight">Metadata</h2>
        <AdminMetadataForm beat={beat} />
      </section>
    </main>
  );
}
