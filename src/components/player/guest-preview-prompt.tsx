"use client";

import Link from "@/components/ui/app-link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { signInPathWithNext, signUpPathWithNext } from "@/lib/auth/next-path";

/**
 * Free-lane preview cap reached (GUEST_POLICY.previewSeconds). Fixed bubble
 * above the mini player. Guests see sign-in; signed-in users get Studio CTA
 * (catalog still plays the short cut — full clean listen is Studio / purchase).
 */
export function GuestPreviewPrompt({
  seconds,
  onClose,
  variant = "ended",
  beatId,
}: {
  seconds: number;
  onClose: () => void;
  /** "unavailable": the beat has no 20 s guest preview asset yet. */
  variant?: "ended" | "unavailable";
  beatId?: string | null;
}) {
  const t = useTranslations("common.guestPreview");
  const pathname = usePathname() ?? "/";
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Lazy: the bubble lives in the root layout (PlayerProvider), so a static
    // import would ship supabase-js (GoTrue/Realtime) on every public page.
    void import("@/lib/supabase/client")
      .then(({ createSupabaseBrowserClient }) =>
        createSupabaseBrowserClient().auth.getSession(),
      )
      .then(({ data }) => {
        if (!cancelled) setSignedIn(Boolean(data.session?.user));
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const studioHref = beatId
    ? `/studio?beatId=${encodeURIComponent(beatId)}`
    : "/studio";

  return (
    <div
      role="status"
      data-testid="guest-preview-prompt"
      data-variant={variant}
      data-audience={signedIn ? "signed-in" : "guest"}
      className="fixed inset-x-3 bottom-[calc(3.75rem+env(safe-area-inset-bottom)+10.5rem)] z-[35] mx-auto max-w-md rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4 text-[var(--brd-ink)] shadow-xl lg:bottom-44"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">
            {variant === "unavailable"
              ? signedIn
                ? t("brakPodgladuKonto")
                : t("brakPodgladu")
              : t("tytul", { s: seconds })}
          </p>
          <p className="text-sm text-[var(--brd-ink-soft)]">
            {variant === "unavailable"
              ? signedIn
                ? t("brakOpisKonto")
                : t("brakOpis")
              : signedIn
                ? t("opisKonto")
                : t("opis")}
          </p>
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
        {signedIn ? (
          <Link
            href={studioHref}
            data-testid="guest-preview-studio"
            className="inline-flex min-h-11 items-center rounded-[var(--brd-r-cta)] bg-[var(--brd-ink)] px-4 text-sm font-medium text-[var(--brd-paper)]"
          >
            {t("otworzStudio")}
          </Link>
        ) : (
          <>
            <Link
              href={signInPathWithNext(pathname)}
              data-testid="guest-preview-sign-in"
              className="inline-flex min-h-11 items-center rounded-[var(--brd-r-cta)] bg-[var(--brd-ink)] px-4 text-sm font-medium text-[var(--brd-paper)]"
            >
              {t("zaloguj")}
            </Link>
            <Link
              href={signUpPathWithNext(pathname)}
              className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
            >
              {t("zalozKonto")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
