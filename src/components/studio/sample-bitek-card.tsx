"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { PlacementScope, SamplePlacementPlan } from "@/lib/studio/samples/sample-bitek-plan";
import { cn } from "@/lib/utils";

export type BitekPreview = (sampleId: string, scope: PlacementScope) => Promise<{ ok: true; plan: SamplePlacementPlan } | { ok: false; message: string }>;
export type BitekApply = (sampleId: string, scope: PlacementScope) => Promise<{ ok: true } | { ok: false; message: string }>;

/** Bitek's proposal for one sample: what changes and where it goes. Nothing happens until "Zastosuj". */
export function SampleBitekCard({
  sampleId,
  preview,
  apply,
  onClose,
}: {
  sampleId: string;
  preview: BitekPreview;
  apply: BitekApply;
  onClose: (done: boolean) => void;
}) {
  const tr = useTranslations("studio.studioRecordingPanel");
  const [scope, setScope] = useState<PlacementScope>("once");
  const [plan, setPlan] = useState<SamplePlacementPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    preview(sampleId, scope).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setPlan(res.plan);
        setError(null);
      } else setError(res.message);
    });
    return () => {
      alive = false;
    };
  }, [sampleId, scope, preview]);

  async function go() {
    setBusy(true);
    const res = await apply(sampleId, scope);
    setBusy(false);
    if (res.ok) onClose(true);
    else setError(res.message);
  }

  const e = plan?.explain;
  const semis = e?.key?.semitones ?? 0;
  return (
    <div className="col-span-2 space-y-2 rounded border border-[var(--brd-amber)]/60 bg-[var(--brd-paper-deep)]/40 p-2" role="group" aria-label={tr("bitekSampelTytul")}>
      <p className="text-xs font-semibold text-[var(--brd-ink)]">{tr("bitekSampelTytul")}</p>
      <div role="radiogroup" className="grid grid-cols-3 gap-1">
        {(["once", "section", "song"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={scope === s}
            onClick={() => setScope(s)}
            className={cn(
              "min-h-9 rounded border px-1 text-xs",
              scope === s ? "border-[var(--brd-amber)] bg-[var(--brd-amber)] font-semibold text-[var(--brd-on-media)]" : "border-[var(--brd-line)] text-[var(--brd-ink-soft)]",
            )}
          >
            {tr(`bitekZakres_${s}`)}
          </button>
        ))}
      </div>
      {error ? <p className="text-xs text-[var(--brd-rec)]" role="alert">{error}</p> : null}
      {!plan && !error ? <p className="text-xs text-[var(--brd-ink-soft)]">{tr("bitekLiczy")}</p> : null}
      {plan && e ? (
        <ul className="space-y-1 text-xs text-[var(--brd-ink)]">
          <li>
            {tr("bitekMiejsce", { takt: e.startBar, n: e.repeats })}
            {e.section ? ` · ${tr(`bitekSekcja_${e.section}`)}` : ""}
          </li>
          <li>
            {e.tempo
              ? tr("bitekTempo", { z: Math.round(e.tempo.from), na: Math.round(e.tempo.to), proc: Math.round((1 / e.tempo.stretch - 1) * 100) })
              : tr("bitekTempoBez")}
            {e.tempo && e.tempo.feel !== "same" ? ` · ${tr(`bitekFeel_${e.tempo.feel}`)}` : ""}
          </li>
          <li>
            {e.key
              ? e.key.applied
                ? tr("bitekTonacja", { z: e.key.from, na: e.key.to, pol: `${semis > 0 ? "+" : ""}${semis}` })
                : tr("bitekTonacjaPlan", { z: e.key.from, na: e.key.to })
              : tr("bitekTonacjaBez")}
          </li>
          <li>{tr("bitekGlosnosc", { db: e.gainDb })}</li>
        </ul>
      ) : null}
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={!plan || busy}
          onClick={() => void go()}
          className="min-h-10 rounded bg-[var(--brd-amber)] text-xs font-semibold text-[var(--brd-on-media)] disabled:opacity-40"
        >
          {busy ? tr("bitekWstawia") : tr("bitekZastosuj")}
        </button>
        <button type="button" onClick={() => onClose(false)} className="min-h-10 rounded border border-[var(--brd-line)] text-xs">
          {tr("bitekAnuluj")}
        </button>
      </div>
    </div>
  );
}
