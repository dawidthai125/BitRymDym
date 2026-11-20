import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { AdminSampleGenerator } from "@/components/admin/admin-sample-generator";
import { PageFrame } from "@/components/brand/chrome";
import { checkAccess } from "@/lib/auth/access-denial";
import { requireRole } from "@/lib/auth/session";
import { listPublishedBeats } from "@/lib/beats/service";
import { LIVE_SAMPLE_INSTRUMENTS, SAMPLE_INSTRUMENTS, SAMPLE_TYPES } from "@/lib/studio/samples/sample-policy";
import { SAMPLE_PRESETS } from "@/lib/studio/samples/sample-generator";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("admin.adminSampleGenerator");
  return { title: t("tytul") };
}

export default async function AdminSampleGeneratorPage() {
  const denial = await checkAccess(() => requireRole(["ADMIN"]));
  if (denial === "UNAUTHENTICATED") redirect("/sign-in");
  if (denial === "FORBIDDEN") return null;
  const t = await getTranslations("admin.adminSampleGenerator");
  const tl = await getTranslations("studio.sampleLab");
  const beats = await listPublishedBeats({ catalogLane: "all" }).catch(() => []);
  const label = (id: string) => (tl.has(`instrument.${id}`) ? tl(`instrument.${id}`) : id);
  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <header className="mb-6 space-y-2 border-b border-[var(--brd-line)] pb-6">
          <h1 className="brd-display text-2xl font-semibold tracking-tight">{t("tytul")}</h1>
          <p className="text-sm text-[var(--brd-mute)]">{t("opis")}</p>
        </header>
        <AdminSampleGenerator
          presets={SAMPLE_PRESETS.map((p) => ({ id: p.id, types: [...p.types], pitched: p.pitched, group: p.drums || !p.pitched ? "drums" : p.instrument === "bass" || p.instrument === "live_bass" ? "bass" : "melody" }))}
          beats={beats.map((b) => ({ id: b.id, title: b.title, bpm: b.bpm ?? null }))}
          instruments={[...SAMPLE_INSTRUMENTS, ...LIVE_SAMPLE_INSTRUMENTS].map((o) => ({ id: o.id, label: label(o.id) }))}
          types={SAMPLE_TYPES.map((id) => ({ id, label: tl.has(`typ.${id}`) ? tl(`typ.${id}`) : id }))}
        />
      </PageFrame>
    </main>
  );
}
