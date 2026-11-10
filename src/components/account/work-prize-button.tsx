"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function WorkPrizeButton({
  action,
  label,
}: {
  action: "activate" | "resume";
  label: string;
}) {
  const t = useTranslations("community.works");
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const response = await fetch("/api/account/prize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, accept: true }),
    });
    const payload = (await response.json().catch(() => ({}))) as { result?: string };
    setBusy(false);
    const result = payload.result ?? "conflict";
    if (result === "ok") {
      setNote(t("prizeSaved"));
      router.refresh();
      return;
    }
    setNote(result === "wait" ? t("prizeWait") : result === "off" ? t("prizeOff") : t("prizeConflict"));
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 disabled:opacity-50"
      >
        {label}
      </button>
      {note ? <p role="status" className="text-sm">{note}</p> : null}
    </div>
  );
}
