"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brd-paper)]";

type UserMenuProps = {
  displayName: string;
  email: string | null;
  showAdmin: boolean;
  showUpload: boolean;
};

export function UserMenu({
  displayName,
  email,
  showAdmin,
  showUpload,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const initial = (displayName || email || "U").charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;

    function onDoc(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      const panel = panelRef.current;
      const hadFocusInside =
        panel &&
        document.activeElement instanceof Node &&
        panel.contains(document.activeElement);
      setOpen(false);
      if (hadFocusInside) {
        buttonRef.current?.focus();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "inline-flex min-h-11 items-center gap-2 border border-[var(--brd-line)] px-2.5 text-sm",
          focusRing,
          open && "border-[var(--brd-green)]",
        )}
        aria-label={`Menu konta: ${displayName}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="inline-flex size-7 items-center justify-center bg-[var(--brd-green)] text-xs text-[var(--brd-paper)]"
          aria-hidden
        >
          {initial}
        </span>
        <span className="hidden max-w-[8rem] truncate sm:inline">
          {displayName}
        </span>
      </button>

      {open ? (
        <div
          id={panelId}
          ref={panelRef}
          className="absolute right-0 z-50 mt-2 w-56 border border-[var(--brd-line)] bg-[var(--brd-paper)] py-1 shadow-sm"
        >
          <p className="border-b border-[var(--brd-line)] px-3 py-2 text-xs text-[var(--brd-mute)]">
            {email || displayName}
          </p>
          <nav aria-label="Menu konta" className="flex flex-col">
            <AccountNavLink href="/studio" onNavigate={() => setOpen(false)}>
              Studio
            </AccountNavLink>
            <AccountNavLink href="/premium" onNavigate={() => setOpen(false)}>
              Premium
            </AccountNavLink>
            <AccountNavLink href="/library" onNavigate={() => setOpen(false)}>
              Biblioteka
            </AccountNavLink>
            <AccountNavLink href="/profile" onNavigate={() => setOpen(false)}>
              Profil
            </AccountNavLink>
            <AccountNavLink href="/settings" onNavigate={() => setOpen(false)}>
              Ustawienia
            </AccountNavLink>
            {showUpload ? (
              <AccountNavLink
                href="/beats/upload"
                onNavigate={() => setOpen(false)}
              >
                Wrzuć bit
              </AccountNavLink>
            ) : null}
            {showAdmin ? (
              <AccountNavLink href="/admin" onNavigate={() => setOpen(false)}>
                Panel administratora
              </AccountNavLink>
            ) : null}
          </nav>
          <form action={signOutAction} className="border-t border-[var(--brd-line)]">
            <button
              type="submit"
              className={cn(
                "flex min-h-11 w-full items-center px-3 py-2.5 text-left text-sm text-[var(--brd-ink)] hover:bg-[var(--brd-paper-deep)]",
                focusRing,
              )}
            >
              Wyloguj
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function AccountNavLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-11 items-center px-3 py-2.5 text-sm text-[var(--brd-ink)] hover:bg-[var(--brd-paper-deep)]",
        focusRing,
      )}
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}
