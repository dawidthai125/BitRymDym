"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { signInPathWithNext } from "@/lib/auth/next-path";
import { cn } from "@/lib/utils";
import type { PremiumTier } from "@/types/premium";

/**
 * unavailable: never downloadable (PLATFORM catalogue original), no CTA.
 * owner: the beat's author chose listen-only / no Studio use, no CTA.
 */
export type LockReason = "guest" | "plan" | "unavailable" | "owner";

const TIER_LABEL: Record<PremiumTier, string> = {
  FREE: "Free",
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
};

type LockedActionProps = {
  /** guest → sign-in link; plan → plans link with the lowest plan that unlocks it. */
  reason: LockReason;
  /** Button content (stays visible, the action is locked). */
  children: ReactNode;
  /** Lowest plan that unlocks the action (plan reason). Default Bronze. */
  minTier?: PremiumTier;
  /** Copy variant. Default "download". */
  action?: "download" | "record" | "track";
  className?: string;
  buttonClassName?: string;
  testId?: string;
  /** Extra data attributes for existing test hooks. */
  dataAttrs?: Record<string, string>;
};

/**
 * Visible-but-locked action (Owner 2026-10-29). The button stays focusable
 * (aria-disabled, not disabled) so keyboard users get the same bubble that
 * hover shows on desktop and a tap shows on mobile. The server enforces the
 * lock independently — this is presentation only.
 */
export function LockedAction({
  reason,
  children,
  minTier = "BRONZE",
  action = "download",
  className,
  buttonClassName,
  testId,
  dataAttrs,
}: LockedActionProps) {
  const t = useTranslations("common.planLocks");
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const text =
    reason === "unavailable"
      ? t("platformDownload")
      : reason === "owner"
      ? action === "record"
        ? t("ownerStudio")
        : t("ownerDownload")
      : reason === "guest"
      ? action === "record"
        ? t("guestRecord")
        : t("guestDownload")
      : action === "track"
        ? t("planTrack", { plan: TIER_LABEL[minTier] })
        : t("planDownload", { plan: TIER_LABEL[minTier] });

  return (
    <span
      ref={wrapRef}
      className={cn("relative inline-flex", className)}
      // Hover only for a real mouse: a tap also emits compat mouseenter/leave,
      // which would close the bubble right after it opened.
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setOpen(false);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        data-testid={testId}
        data-locked={reason}
        {...dataAttrs}
        className={cn(
          "inline-flex min-h-11 min-w-11 cursor-not-allowed items-center justify-center gap-1.5 rounded-[var(--brd-r-cta,0.375rem)] border border-[var(--brd-line)] bg-transparent px-4 text-sm font-medium text-[var(--brd-mute)] outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]",
          buttonClassName,
        )}
        onFocus={() => setOpen(true)}
        onClick={(e) => {
          // Tap opens (focus may already have); outside tap / Escape closes.
          e.preventDefault();
          setOpen(true);
        }}
      >
        <span aria-hidden>🔒</span>
        {children}
      </button>
      {open ? (
        <span
          id={tipId}
          role="status"
          data-testid={testId ? `${testId}-tip` : "locked-action-tip"}
          className="absolute bottom-full left-0 z-50 mb-2 w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3 py-2 text-left text-xs leading-snug text-[var(--brd-ink)] shadow-lg"
        >
          {text}{" "}
          {reason === "guest" ? (
            <Link
              href={signInPathWithNext(pathname)}
              className="font-medium text-[var(--brd-green)] underline underline-offset-2"
            >
              {t("guestLink")}
            </Link>
          ) : reason === "unavailable" || reason === "owner" ? null : (
            <Link
              href="/premium"
              className="font-medium text-[var(--brd-green)] underline underline-offset-2"
            >
              {t("planLink")}
            </Link>
          )}
        </span>
      ) : null}
    </span>
  );
}
