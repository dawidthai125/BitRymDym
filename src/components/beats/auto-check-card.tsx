import {
  autoCheckBadge,
  OUTCOME_LABELS_PL,
  PROVIDER_LABELS_PL,
  readCheckResults,
  safeMatchHref,
  vocalRanges,
} from "@/lib/beats/auto-check/presentation";
import type { AutoCheckRow } from "@/lib/beats/auto-check/records";

const TONE: Record<string, string> = {
  ok: "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
  danger: "border-destructive/50 text-destructive",
  warn: "border-amber-500/50 text-amber-700 dark:text-amber-400",
  neutral: "border-border text-muted-foreground",
};

export function AutoCheckBadge({ check }: { check: AutoCheckRow | null | undefined }) {
  const b = autoCheckBadge(check);
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[b.tone]}`}>
      {b.label}
    </span>
  );
}

export function AutoCheckCard({ check }: { check: AutoCheckRow | null | undefined }) {
  if (!check) {
    return (
      <p className="text-sm text-muted-foreground">
        Brak automatycznego sprawdzenia dla tego bitu. Zatwierdzenie jest zablokowane.
      </p>
    );
  }
  const { recognition, vocal } = readCheckResults(check.results);
  const ranges = vocal ? vocalRanges(vocal.windows ?? []) : [];
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <AutoCheckBadge check={check} />
        <span className="text-muted-foreground">
          {check.finished_at
            ? `zakończono ${new Date(check.finished_at).toLocaleString("pl-PL")}`
            : `zlecono ${new Date(check.created_at).toLocaleString("pl-PL")}`}
          {check.error_code ? ` · kod: ${check.error_code}` : ""}
        </span>
      </div>
      {check.summary_pl ? <p>{check.summary_pl}</p> : null}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {Object.entries(check.providers ?? {}).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{PROVIDER_LABELS_PL[k] ?? k}</dt>
            <dd>{OUTCOME_LABELS_PL[String(v)] ?? String(v)}</dd>
          </div>
        ))}
        {check.recognition_score != null ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Najwyższy wynik dopasowania</dt>
            <dd>{Number(check.recognition_score).toFixed(2)}</dd>
          </div>
        ) : null}
        {check.vocal_ratio != null ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Udział okien z wokalem</dt>
            <dd>{(Number(check.vocal_ratio) * 100).toFixed(1)}%</dd>
          </div>
        ) : null}
      </dl>

      {recognition.some((r) => r.matches?.length) ? (
        <div className="space-y-1">
          <p className="font-medium">Dopasowania</p>
          <ul className="space-y-1">
            {recognition.flatMap((r) =>
              (r.matches ?? []).map((m, i) => {
                const href = safeMatchHref(m.url);
                const label = [m.title ?? m.ref ?? "bez tytułu", m.artist].filter(Boolean).join(" — ");
                return (
                  <li key={`${r.provider}-${i}`} className="flex flex-wrap gap-2">
                    <span className="text-muted-foreground">{PROVIDER_LABELS_PL[r.provider] ?? r.provider}:</span>
                    {href ? (
                      <a href={href} className="underline underline-offset-4" target={href.startsWith("/") ? undefined : "_blank"} rel="noreferrer noopener">
                        {label}
                      </a>
                    ) : (
                      <span>{label}</span>
                    )}
                    <span className="text-muted-foreground">
                      wynik {m.score.toFixed(2)}
                      {m.matchedSeconds != null ? ` · ${m.matchedSeconds}s` : ""}
                      {m.offsetSeconds != null ? ` · przesunięcie ${m.offsetSeconds}s` : ""}
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
          <p className="font-medium">Fragmenty z wokalem</p>
          <p className="text-muted-foreground">{ranges.join(", ")}</p>
        </div>
      ) : null}

      {check.appeal_requested_at ? (
        <div className="space-y-1 rounded-lg border border-border p-3">
          <p className="font-medium">
            Odwołanie właściciela ({new Date(check.appeal_requested_at).toLocaleString("pl-PL")})
          </p>
          {check.appeal_note ? <p className="whitespace-pre-wrap">{check.appeal_note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
