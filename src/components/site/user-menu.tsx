"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const initial = (displayName || email || "U").charAt(0).toUpperCase();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={cn(
          "inline-flex min-h-11 items-center gap-2 border border-[var(--brd-line)] px-2.5 text-sm",
          open && "border-[var(--brd-green)]",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
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
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 border border-[var(--brd-line)] bg-[var(--brd-paper)] py-1 shadow-sm"
        >
          <p className="border-b border-[var(--brd-line)] px-3 py-2 text-xs text-[var(--brd-mute)]">
            {email || displayName}
          </p>
          <MenuLink href="/studio" onNavigate={() => setOpen(false)}>
            Studio
          </MenuLink>
          <MenuLink href="/library" onNavigate={() => setOpen(false)}>
            Biblioteka
          </MenuLink>
          <MenuLink href="/profile" onNavigate={() => setOpen(false)}>
            Profil
          </MenuLink>
          <MenuLink href="/settings" onNavigate={() => setOpen(false)}>
            Ustawienia
          </MenuLink>
          {showUpload ? (
            <MenuLink href="/beats/upload" onNavigate={() => setOpen(false)}>
              Wrzuć bit
            </MenuLink>
          ) : null}
          {showAdmin ? (
            <MenuLink href="/admin" onNavigate={() => setOpen(false)}>
              Panel administratora
            </MenuLink>
          ) : null}
          <form action={signOutAction} className="border-t border-[var(--brd-line)]">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full px-3 py-2.5 text-left text-sm text-[var(--brd-ink)] hover:bg-[var(--brd-paper-deep)]"
            >
              Wyloguj
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
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
      role="menuitem"
      className="block px-3 py-2.5 text-sm text-[var(--brd-ink)] hover:bg-[var(--brd-paper-deep)]"
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}
