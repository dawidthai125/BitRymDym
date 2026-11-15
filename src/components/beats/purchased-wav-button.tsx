"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { BrdButton } from "@/components/brand/brd-button";
import { requestPurchasedBeatWavAction } from "@/lib/beats/purchased-wav-action";

type WavCode = "LOGIN" | "denied" | "missing";

/** Download of a wav the signed-in user already bought. Not the original-master button. */
export function PurchasedWavButton({ beatId, title }: { beatId: string; title: string }) {
  const t = useTranslations("beats.beatWav");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<WavCode | null>(null);

  async function download() {
    setError(null);
    setPending(true);
    try {
      const result = await requestPurchasedBeatWavAction(beatId);
      if (!result.ok) {
        setError(result.code === "login" ? "LOGIN" : result.code);
        setPending(false);
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.download = `${title || "bit"}.wav`;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setPending(false);
    } catch {
      setError("missing");
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <BrdButton type="button" variant="primary" disabled={pending} onClick={() => void download()} data-testid="purchased-wav-download">
        {pending ? t("pobieranie") : t("pobierz")}
      </BrdButton>
      {error ? (
        <span role="alert" className="text-sm text-[var(--brd-rec)]">
          {t(`blad.${error}`)}
        </span>
      ) : null}
    </span>
  );
}
