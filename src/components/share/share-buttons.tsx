"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";

import { SHARE_TARGETS, shareUrl } from "@/lib/share/share-links";

const noop = () => () => {};

/** Copy link + Facebook / X / WhatsApp (+ the system share sheet on phones). Plain links, no SDKs. */
export function ShareButtons({ url, text, testId = "share-buttons", compact = false }: { url: string; text: string; testId?: string; compact?: boolean }) {
  const t = useTranslations("common.share");
  const [copied, setCopied] = useState(false);
  // Client-only capability; false on the server so hydration matches.
  const canNative = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);
  const btn = "inline-flex min-h-9 items-center justify-center rounded-[2px] border border-[var(--brd-line)] px-3 text-sm font-medium hover:border-[var(--brd-ink)]";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {!compact ? <p className="text-sm font-semibold">{t("tytul")}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => void copy()} data-testid={`${testId}-copy`} aria-live="polite">{copied ? t("skopiowano") : t("kopiuj")}</button>
        {SHARE_TARGETS.map((s) => (
          <a key={s} href={shareUrl(s, url, text)} target="_blank" rel="noopener noreferrer" className={btn} data-testid={`${testId}-${s}`} aria-label={t("udostepnijW", { serwis: t(`serwis.${s}`) })}>
            {t(`serwis.${s}`)}
          </a>
        ))}
        {canNative ? (
          <button type="button" className={btn} onClick={() => void navigator.share({ url, text }).catch(() => {})} data-testid={`${testId}-native`}>{t("wiecej")}</button>
        ) : null}
      </div>
    </div>
  );
}
