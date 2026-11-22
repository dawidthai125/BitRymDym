"use client";

import type { PlaySession, SampekResult } from "@/lib/studio/play/play-types";
import { quickFix } from "@/lib/studio/play/sampek-edit";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Sampek — the sample assistant panel of "Graj". CONTRACT (the play studio relies on it):
 *  - session: the current recording (notes per layer).
 *  - canUseAi: Bronze+; deterministic fixes (quantize, scale, dynamics) work for everyone.
 *  - onPreview(session | null): the play studio auditions a proposed session (null = stop/back).
 *  - onApply(result): the user accepted; the studio replaces its session and shows result.changes.
 */
export function SampekPanel(props: {
  session: PlaySession;
  canUseAi: boolean;
  onPreview: (session: PlaySession | null) => void;
  onApply: (result: SampekResult) => void;
}) {
  const t = useTranslations("studio.sampekPanel");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: "quick" | "chords" | "bass" | "counter" | "variation") {
    setMessage(null);
    if (action === "quick") {
      const result = quickFix(props.session);
      props.onApply(result);
      setMessage(result.changes.join(" "));
      return;
    }
    if (!props.canUseAi) {
      setMessage(t("aiOdBronze"));
      return;
    }
    setBusy(action);
    try {
      const response = await fetch("/api/studio/play/sampek", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session: props.session, action }),
      });
      const body = (await response.json().catch(() => ({}))) as { result?: SampekResult; message?: string };
      if (!response.ok || !body.result) throw new Error(body.message ?? t("nieOdpowiedzial"));
      props.onApply(body.result);
      setMessage(body.result.changes.join(" "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("nieOdpowiedzial"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4 sm:p-5" aria-labelledby="sampek-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sampek-title" className="text-base font-semibold">{t("tytul")}</h2>
          <p className="mt-1 text-sm text-[var(--brd-ink-soft)]">{t("opis")}</p>
        </div>
        <button type="button" onClick={() => props.onPreview(null)} className="min-h-10 rounded-md border border-[var(--brd-line)] px-3 text-sm">{t("stopPodgladu")}</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void run("quick")} disabled={!!busy} className="min-h-10 rounded-md bg-[var(--brd-amber)] px-3 text-sm font-semibold text-[var(--brd-on-media)] disabled:opacity-50">{t("szybkaPoprawa")}</button>
        {(["chords", "bass", "counter", "variation"] as const).map((action) => (
          <button key={action} type="button" onClick={() => void run(action)} disabled={!!busy} className="min-h-10 rounded-md border border-[var(--brd-line)] px-3 text-sm disabled:opacity-50">
            {busy === action ? t("pracuje") : t(`akcja.${action}`)}
          </button>
        ))}
      </div>
      {message ? <p role="status" className="mt-3 text-sm text-[var(--brd-ink-soft)]">{message}</p> : null}
    </section>
  );
}
