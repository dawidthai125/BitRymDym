import { useLibText } from "@/i18n/use-lib-text";
import { useLocale, useTranslations } from "next-intl";
import { StatusPill } from "@/components/brand/chrome";
import {
  autoCheckBadge,
  OUTCOME_LABELS_PL,
  PROVIDER_LABELS_PL,
  readCheckResults,
  safeMatchHref,
  vocalRanges,
} from "@/lib/beats/auto-check/presentation";
import type { AutoCheckRow } from "@/lib/beats/auto-check/records";
import { intlTag, resolveLocale } from "@/i18n/config";

const LED: Record<string, "ok" | "rec" | "warn" | "neutral"> = {
  ok: "ok",
  danger: "rec",
  warn: "warn",
  neutral: "neutral",
};

export function AutoCheckBadge({ check }: { check: AutoCheckRow | null | undefined }) {
  const tl = useLibText();
  const b = autoCheckBadge(check);
  return <StatusPill tone={LED[b.tone] ?? "neutral"}>{tl(b.label)}</StatusPill>;
}

export function AutoCheckCard({ check }: { check: AutoCheckRow | null | undefined }) {
  const tl = useLibText();
  const t = useTranslations("beats.autoCheckCard");
  const tag = intlTag(resolveLocale(useLocale()));
  if (!check) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("brakAutomatycznegoSprawdzeniaDla")}
      </p>
    );
  }
  const { recognition, vocal } = readCheckResults(check.results);
  const ranges = vocal ? vocalRanges(vocal.windows ?? []) : [];
  return (
    <div className="brd-rack-module space-y-4 text-sm" data-testid="auto-check-card">
      <span aria-hidden="true" className="brd-rack-screws" />
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--brd-line)] pb-3">
        <AutoCheckBadge check={check} />
        <span className="brd-data text-xs text-muted-foreground">
          {tl(check.finished_at
            ? t("zakonczono", { v0: new Date(check.finished_at).toLocaleString(tag) })
            : t("zlecono", { v0: new Date(check.created_at).toLocaleString(tag) }))}
          {tl(check.error_code ? t("kod", { v0: check.error_code }) : "")}
        </span>
      </div>
      {check.summary_pl ? <p>{tl(check.summary_pl)}</p> : null}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-0 sm:grid-cols-2">
        {Object.entries(check.providers ?? {}).map(([k, v]) => (
          <div key={k} className="brd-readout flex justify-between gap-3">
            <dt className="text-muted-foreground">{tl(PROVIDER_LABELS_PL[k] ?? k)}</dt>
            <dd className="brd-data">{tl(OUTCOME_LABELS_PL[String(v)] ?? String(v))}</dd>
          </div>
        ))}
        {check.recognition_score != null ? (
          <div className="brd-readout flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("najwyzszyWynikDopasowania")}</dt>
            <dd className="brd-data">{tl(Number(check.recognition_score).toFixed(2))}</dd>
          </div>
        ) : null}
        {check.vocal_ratio != null ? (
          <div className="brd-readout flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("udzialOkienZWokalem")}</dt>
            <dd className="brd-data">{tl((Number(check.vocal_ratio) * 100).toFixed(1))}%</dd>
          </div>
        ) : null}
      </dl>

      {recognition.some((r) => r.matches?.length) ? (
        <div className="space-y-1">
          <p className="font-medium">{t("dopasowania")}</p>
          <ul className="space-y-1">
            {recognition.flatMap((r) =>
              (r.matches ?? []).map((m, i) => {
                const href = safeMatchHref(m.url);
                const label = [m.title ?? m.ref ?? t("bezTytulu"), m.artist].filter(Boolean).join(" — ");
                return (
                  <li key={`${r.provider}-${i}`} className="flex flex-wrap gap-2">
                    <span className="text-muted-foreground">{tl(PROVIDER_LABELS_PL[r.provider] ?? r.provider)}:</span>
                    {href ? (
                      <a href={href} className="underline underline-offset-4" target={href.startsWith("/") ? undefined : "_blank"} rel="noreferrer noopener">
                        {tl(label)}
                      </a>
                    ) : (
                      <span>{tl(label)}</span>
                    )}
                    <span className="brd-data text-muted-foreground">
                      {t("wynik")}{" "}{tl(m.score.toFixed(2))}
                      {tl(m.matchedSeconds != null ? ` · ${m.matchedSeconds}s` : "")}
                      {tl(m.offsetSeconds != null ? t("przesuniecieS", { v0: m.offsetSeconds }) : "")}
                    </span>
                  </li>
                );
              }),
            )}
          </ul>
        </div>
      ) : null}

      {ranges.length ? (
        <div className="space-y-1">
          <p className="font-medium">{t("fragmentyZWokalem")}</p>
          <p className="brd-data text-muted-foreground">{tl(ranges.join(", "))}</p>
        </div>
      ) : null}

      {check.appeal_requested_at ? (
        <div className="space-y-1 border border-[var(--brd-line)] bg-[var(--brd-recess)] p-3">
          <p className="font-medium">
            {t("odwolanieWlasciciela")}{tl(new Date(check.appeal_requested_at).toLocaleString(tag))})
          </p>
          {check.appeal_note ? <p className="whitespace-pre-wrap">{tl(check.appeal_note)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
