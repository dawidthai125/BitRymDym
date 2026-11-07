import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { checkAccess } from "@/lib/auth/access-denial";
import { requireModerationAccess } from "@/lib/beats/service";
import { listPendingStudioSamples } from "@/lib/studio/samples/sample-service";
import { reviewStudioSampleAction } from "@/app/admin/samples/actions";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("admin.adminSamplesPage");
  return { title: t("metaTitle") };
}

export default async function AdminSamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const t = await getTranslations("admin.adminSamplesPage");
  const denial = await checkAccess(requireModerationAccess);
  if (denial === "UNAUTHENTICATED") redirect("/sign-in");
  if (denial === "FORBIDDEN") return null;

  const query = await searchParams;
  const pending = await listPendingStudioSamples();

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <header className="mb-6 space-y-2 border-b border-[var(--brd-line)] pb-6">
          <h1 className="brd-display text-2xl font-semibold tracking-tight">{t("tytul")}</h1>
          <p className="text-sm text-[var(--brd-mute)]">{t("opis")}</p>
        </header>
        {query.ok === "1" ? (
          <p className="mb-4 text-sm" role="status">
            {t("zapisano")}
          </p>
        ) : null}
        {query.error ? (
          <p className="mb-4 text-sm" role="alert">
            {t("blad")}: {query.error}
          </p>
        ) : null}
        {!pending.ok ? (
          <p className="text-sm text-[var(--brd-mute)]">{t("wylaczone")}</p>
        ) : pending.samples.length === 0 ? (
          <p className="text-sm text-[var(--brd-mute)]">{t("pusto")}</p>
        ) : (
          <ul className="space-y-4">
            {pending.samples.map((sample) => {
              const item = {
                id: sample.id,
                title: sample.title,
                kind: sample.kind,
                instrument: sample.instrument,
                seconds: (Number(sample.duration_ms) / 1000).toFixed(1),
                owner: `${sample.owner_id.slice(0, 8)}…`,
              };
              return (
              <li key={item.id} className="rounded border border-[var(--brd-line)] p-3">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-[var(--brd-mute)]">
                  {item.kind}
                  {item.instrument ? ` · ${item.instrument}` : ""}
                  {` · ${item.seconds}s`}
                  {` · ${item.owner}`}
                </p>
                <p className="mt-2">
                  <Link
                    className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                    href={`/api/admin/samples/${item.id}/play`}
                    target="_blank"
                  >
                    {t("odsluch")}
                  </Link>
                </p>
                <form action={reviewStudioSampleAction} className="mt-3 space-y-2">
                  <input type="hidden" name="sampleId" value={item.id} />
                  <label className="block text-xs text-[var(--brd-mute)]">
                    {t("notatka")}
                    <textarea
                      name="note"
                      maxLength={500}
                      className="mt-1 min-h-20 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-2 text-sm"
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="submit"
                      name="decision"
                      value="approve"
                      className="inline-flex min-h-11 items-center justify-center rounded border border-[var(--brd-line)] px-3 text-sm"
                    >
                      {t("zatwierdz")}
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="reject"
                      className="inline-flex min-h-11 items-center justify-center rounded border border-[var(--brd-line)] px-3 text-sm"
                    >
                      {t("odrzuc")}
                    </button>
                  </div>
                </form>
              </li>
              );
            })}
          </ul>
        )}
      </PageFrame>
    </main>
  );
}
