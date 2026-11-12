import { useTranslations } from "next-intl";

/**
 * Short, plain-language summary of §7 of the terms (Bit licence). Display only:
 * the legal text lives in src/content/legal/terms.ts and stays the source of truth.
 */
export function LicenseSummary({ className }: { className?: string }) {
  const t = useTranslations("common.licenseSummary");
  const rows: Array<{ key: string; ok: boolean }> = [
    { key: "publikacja", ok: true },
    { key: "streaming", ok: true },
    { key: "monetyzacja", ok: true },
    { key: "kredyt", ok: true },
    { key: "contentId", ok: false },
    { key: "reklama", ok: false },
    { key: "sprzedazBitu", ok: false },
    { key: "autorstwo", ok: false },
  ];
  return (
    <section className={className} aria-label={t("tytul")} data-testid="license-summary">
      <h2 className="text-sm font-medium text-[var(--brd-ink)]">{t("tytul")}</h2>
      <p className="mt-1 text-xs text-[var(--brd-mute)]">{t("opis")}</p>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--brd-mute)]">
            <th className="py-1 pr-2 font-normal">{t("kolumnaCo")}</th>
            <th className="py-1 font-normal">{t("kolumnaStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-[var(--brd-line)]">
              <td className="py-1.5 pr-2 text-[var(--brd-ink)]">{t(`wiersz.${r.key}`)}</td>
              <td className="py-1.5 text-[var(--brd-ink-soft)]">
                {r.ok ? t("wolno") : t("zgoda")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-[var(--brd-mute)]">
        {t("stopka")}{" "}
        <a href="/regulamin" className="underline underline-offset-4">
          {t("regulamin")}
        </a>
      </p>
    </section>
  );
}
