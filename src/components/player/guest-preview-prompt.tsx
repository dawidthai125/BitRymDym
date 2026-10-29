"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { signInPathWithNext } from "@/lib/auth/next-path";

/**
 * Guest preview cap reached (GUEST_POLICY.previewSeconds). Fixed bubble above
 * the mini player; works the same on desktop and mobile.
 */
export function GuestPreviewPrompt({
  seconds,
  onClose,
}: {
  seconds: number;
  onClose: () => void;
}) {
  const t = useTranslations("common.guestPreview");
  const pathname = usePathname() ?? "/";
  return (
    <div
      role="status"
      data-testid="guest-preview-prompt"
      className="fixed inset-x-3 bottom-24 z-[60] mx-auto max-w-md rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4 text-[var(--brd-ink)] shadow-xl sm:bottom-28"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{t("tytul", { s: seconds })}</p>
          <p className="text-sm text-[var(--brd-ink-soft)]">{t("opis")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("zamknij")}
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-lg text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
        >
          ×
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link
          href={signInPathWithNext(pathname)}
          data-testid="guest-preview-sign-in"
          className="inline-flex min-h-11 items-center rounded-[var(--brd-r-cta)] bg-[var(--brd-ink)] px-4 text-sm font-medium text-[var(--brd-paper)]"
        >
          {t("zaloguj")}
        </Link>
        <Link href="/sign-up" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
          {t("zalozKonto")}
        </Link>
      </div>
    </div>
  );
}
