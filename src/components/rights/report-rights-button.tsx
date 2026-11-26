"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type Kind = "work" | "beat" | "sample";
const REASONS = ["copyright", "stolen_beat", "stolen_vocal", "other"] as const;

/** "Zgłoś naruszenie praw" under a public work, beat or sample (owner decision 2026-11-26). No account needed. */
export function ReportRightsButton({ kind, id }: { kind: Kind; id: string }) {
  const t = useTranslations("report");
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>(kind === "beat" ? "stolen_beat" : "copyright");
  const [details, setDetails] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [goodFaith, setGoodFaith] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const valid = details.trim().length >= 10 && name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) && goodFaith;

  async function send() {
    if (busy) return;
    if (!valid) return setNote(t("invalid"));
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, id, reason, details, name, email, goodFaith }),
      });
      const json = (await res.json().catch(() => ({}))) as { result?: string };
      if (json.result === "ok") {
        setSent(true);
        setNote(t("sent"));
      } else setNote(json.result === "limit" ? t("limit") : json.result === "invalid" ? t("invalid") : t("error"));
    } catch {
      setNote(t("error"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="inline-flex min-h-11 items-center text-xs text-[var(--brd-mute)] underline underline-offset-4" data-testid="report-rights-open" onClick={() => setOpen(true)}>
        {t("open")}
      </button>
    );
  }
  return (
    <section aria-labelledby={`${uid}-t`} data-testid="report-rights" className="flex max-w-xl flex-col gap-2 border border-[var(--brd-line)] p-3 text-sm">
      <h3 id={`${uid}-t`} className="font-semibold">{t("title")}</h3>
      {sent ? (
        <p role="status">{note}</p>
      ) : (
        <>
          <p className="text-xs text-[var(--brd-mute)]">{t("lead")}</p>
          <label className="flex flex-col gap-1" htmlFor={`${uid}-r`}>
            {t("reason")}
            <select id={`${uid}-r`} value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])} className="min-h-11 border border-[var(--brd-line)] bg-transparent px-2">
              {REASONS.map((r) => (
                <option key={r} value={r}>{t(`reasons.${r}`)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1" htmlFor={`${uid}-d`}>
            {t("details")}
            <textarea id={`${uid}-d`} value={details} maxLength={4000} rows={4} onChange={(e) => setDetails(e.target.value)} className="border border-[var(--brd-line)] bg-transparent p-2" />
          </label>
          <label className="flex flex-col gap-1" htmlFor={`${uid}-n`}>
            {t("name")}
            <input id={`${uid}-n`} value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} className="min-h-11 border border-[var(--brd-line)] bg-transparent px-2" />
          </label>
          <label className="flex flex-col gap-1" htmlFor={`${uid}-e`}>
            {t("email")}
            <input id={`${uid}-e`} type="email" value={email} maxLength={200} autoComplete="email" onChange={(e) => setEmail(e.target.value)} className="min-h-11 border border-[var(--brd-line)] bg-transparent px-2" />
          </label>
          <label className="flex min-h-11 items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={goodFaith} onChange={(e) => setGoodFaith(e.target.checked)} />
            <span>{t("goodFaith")}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" disabled={busy || !valid} onClick={() => void send()} data-testid="report-rights-send">
              {busy ? t("sending") : t("send")}
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
          </div>
          {note ? <p role="status" className="text-xs">{note}</p> : null}
        </>
      )}
    </section>
  );
}
