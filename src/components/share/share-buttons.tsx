"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";

import { SHARE_TARGETS, shareUrl, tryNativeShare } from "@/lib/share/share-links";

const noop = () => () => {};

/**
 * System share sheet first on phones (Web Share API → Instagram, WhatsApp, Messenger…), then copy link
 * + Facebook / X / WhatsApp. If the share sheet fails, the link is copied instead. Plain links, no SDKs.
 */
export function ShareButtons({ url, text, title, testId = "share-buttons", compact = false }: { url: string; text: string; title?: string; testId?: string; compact?: boolean }) {
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

  async function share() {
    const r = await tryNativeShare(navigator, { url, text, ...(title ? { title } : {}) });
    if (r === "unsupported" || r === "failed") await copy();
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {!compact ? <p className="text-sm font-semibold">{t("tytul")}</p> : null}
      <div className="flex flex-wrap gap-2">
        {canNative ? (
          <button type="button" className={`${btn} border-[var(--brd-ink)] font-semibold`} onClick={() => void share()} data-testid={`${testId}-native`}>{t("natywnie")}</button>
        ) : null}
        <button type="button" className={btn} onClick={() => void copy()} data-testid={`${testId}-copy`} aria-live="polite">{copied ? t("skopiowano") : t("kopiuj")}</button>
        {SHARE_TARGETS.map((s) => (
          <a key={s} href={shareUrl(s, url, text)} target="_blank" rel="noopener noreferrer" className={btn} data-testid={`${testId}-${s}`} aria-label={t("udostepnijW", { serwis: t(`serwis.${s}`) })}>
            {t(`serwis.${s}`)}
          </a>
        ))}
      </div>
    </div>
  );
}
