"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { BODY_MAX, SUBJECT_MAX, SUBJECT_MIN, SUPPORT_KINDS, type SupportKind } from "@/lib/support/support-policy";
import { cn } from "@/lib/utils";

const FIELD = "w-full border border-[var(--brd-line)] bg-transparent px-3 text-base text-[var(--brd-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]";

export function NewThreadForm({ initialKind, fromPage }: { initialKind: SupportKind; fromPage: string | null }) {
  const t = useTranslations("support.form");
  const router = useRouter();
  const [kind, setKind] = useState<SupportKind>(initialKind);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A new footer link may switch the kind while the form stays mounted.
  const [kindProp, setKindProp] = useState(initialKind);
  if (kindProp !== initialKind) {
    setKindProp(initialKind);
    setKind(initialKind);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    if (subject.trim().length < SUBJECT_MIN || !body.trim()) {
      setError(t("incomplete", { min: SUBJECT_MIN }));
      return;
    }
    setSending(true);
    setError(null);
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, subject, body, page: fromPage }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { result?: string; threadId?: string } | null;
    if (json?.result === "ok" && json.threadId) {
      router.push(`/account/support/${json.threadId}`);
      router.refresh();
      return;
    }
    setSending(false);
    setError(res?.status === 429 ? t("limit") : res?.status === 401 ? t("signedOut") : t("failed"));
  }

  return (
    <form onSubmit={submit} className="space-y-4 border border-[var(--brd-line)] p-4" data-testid="support-new">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t("kindLegend")}</legend>
        {SUPPORT_KINDS.map((k) => (
          <label
            key={k}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center border px-4 text-sm has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-[var(--brd-amber)]",
              kind === k ? "border-[var(--brd-green)] text-[var(--brd-green)]" : "border-[var(--brd-line)] text-[var(--brd-ink)]",
            )}
          >
            <input type="radio" name="support-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {t(`kind.${k}`)}
          </label>
        ))}
      </fieldset>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("subject")}</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={SUBJECT_MAX} required className={cn(FIELD, "min-h-11")} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("body")}</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={BODY_MAX} required rows={5} placeholder={t(`hint.${kind}`)} className={cn(FIELD, "py-2")} />
      </label>
      <p className="text-xs text-[var(--brd-mute)]">
        {t(kind === "bug" ? "sentWithBug" : "sentWithOpinion")}
        {fromPage ? ` ${t("fromPage", { page: fromPage })}` : ""} {t("noSecrets")}
      </p>
      <Button type="submit" disabled={sending} className="min-h-11">{t(sending ? "sending" : "send")}</Button>
      {error ? <p role="alert" className="text-sm text-[var(--brd-rec)]">{error}</p> : null}
    </form>
  );
}
