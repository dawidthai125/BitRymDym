"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function RewardClaimButton({
  id,
  claimed,
  label,
}: {
  id: string;
  claimed: boolean;
  label: string;
}) {
  const t = useTranslations("community.rewards");
  const [state, setState] = useState(claimed ? "already" : "idle");
  const [busy, setBusy] = useState(false);

  async function claim() {
    setBusy(true);
    const response = await fetch("/api/community/rewards/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const payload = (await response.json().catch(() => ({}))) as { result?: string };
    setBusy(false);
    setState(payload.result ?? "conflict");
  }

  const note =
    state === "ok" ? t("ok")
      : state === "perpetual" ? t("perpetual")
        : state === "pending_plan" ? t("pending_plan")
          : state === "conflict" || state === "invalid" ? t("conflict")
            : state === "wait" ? t("wait")
              : state === "already" ? t("already")
                : state === "off" ? t("off")
                  : null;

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs uppercase tracking-[0.12em] text-[var(--brd-mute)]">{label}</p>
      {state === "ok" || state === "already" ? (
        <p className="text-sm">{t("claimed")}</p>
      ) : (
        <button
          type="button"
          onClick={() => void claim()}
          disabled={busy}
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 disabled:opacity-50"
        >
          {t("claim")}
        </button>
      )}
      {note && state !== "already" ? <p role="status" className="text-sm">{note}</p> : null}
    </div>
  );
}
