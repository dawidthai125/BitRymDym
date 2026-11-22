import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { intlTag, resolveLocale } from "@/i18n/config";
import { listLeakBeats, listLeakChecks, type LeakBeatOption, type LeakCheckView } from "@/lib/admin/leak-checks";
import { AuthError } from "@/lib/auth/session";

import { LeakCheckForm } from "./leak-check-form";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("admin.adminLeaksPage");
  return { title: t("metaTitle") };
}

/** Panel Administracyjny → Wycieki: whose personal listen copy is a leaked file. ADMIN only. */
export default async function AdminLeaksPage() {
  const t = await getTranslations("admin.adminLeaksPage");
  const tag = intlTag(resolveLocale(await getLocale()));
  const when = new Intl.DateTimeFormat(tag, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" });

  let beats: LeakBeatOption[] = [];
  let checks: LeakCheckView[] = [];
  try {
    [beats, checks] = await Promise.all([listLeakBeats(), listLeakChecks()]);
  } catch (error) {
    if (error instanceof AuthError) redirect(error.code === "UNAUTHENTICATED" ? "/sign-in?next=%2Fadmin%2Fwycieki" : "/admin");
    throw error;
  }
  const running = checks.some((c) => c.status === "uploading" || c.status === "pending" || c.status === "working");

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <header className="mb-8 space-y-2 border-b border-[var(--brd-line)] pb-6">
          <h1 className="brd-display text-3xl font-semibold tracking-tight">{t("tytul")}</h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("opis")}</p>
        </header>
        <div className="space-y-10">
          <LeakCheckForm
            beats={beats}
            running={running}
            labels={{
              bit: t("bit"),
              wybierzBit: t("wybierzBit"),
              kopii: t("kopii"),
              plik: t("plik"),
              plikPodpowiedz: t("plikPodpowiedz"),
              sprawdz: t("sprawdz"),
              wysylanie: t("wysylanie"),
              bladDuzy: t("bladDuzy"),
              bladWysylki: t("bladWysylki"),
              wyslano: t("wyslano"),
            }}
          />
          <section aria-labelledby="wycieki-historia" className="space-y-4">
            <h2 id="wycieki-historia" className="brd-display text-xl font-semibold tracking-tight">{t("historia")}</h2>
            {checks.length === 0 ? (
              <p className="text-sm text-[var(--brd-ink-soft)]">{t("pusto")}</p>
            ) : (
              <ul className="space-y-3">
                {checks.map((c) => {
                  const best = c.matches[0];
                  return (
                    <li key={c.id} className="space-y-2 border border-[var(--brd-line)] p-4 text-sm">
                      <p className="font-medium">
                        {c.beatTitle} · <span className="break-all font-normal">{c.fileName}</span>
                      </p>
                      <p className="text-xs text-[var(--brd-mute)]">{when.format(new Date(c.createdAt))} · {t(`status.${c.status}`)}</p>
                      {c.status === "failed" ? <p>{t("nieUdalo")} ({c.errorCode ?? "?"})</p> : null}
                      {c.status === "done" && c.matches.length === 0 ? <p>{t("brakKopii")}</p> : null}
                      {c.status === "done" && best ? (
                        best.match ? (
                          <p className="font-semibold">
                            {t("znaleziono")}{" "}
                            <Link className="underline underline-offset-4" href={`/admin/users/${best.userId}`}>
                              {best.name ?? t("bezNazwy")}
                              {best.userNumber ? ` (nr ${best.userNumber})` : ""}
                            </Link>{" "}
                            · {t("pewnosc", { z: best.z })}
                          </p>
                        ) : (
                          <p>{t("nieZnaleziono", { z: best.z })}</p>
                        )
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="max-w-prose text-xs text-[var(--brd-mute)]">{t("uwaga")}</p>
          </section>
        </div>
      </PageFrame>
    </main>
  );
}
