"use client";

import NextLink from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * Use instead of next/link. next/link loads every visible link in the background: one page view
 * made 60-93 server requests, and that used up the Vercel CPU limit (2026-11-23). Here a link
 * loads when the visitor points at it, focuses it or touches it. `prefetch={false}` keeps it off.
 */
export default function AppLink({
  prefetch,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: ComponentProps<typeof NextLink>) {
  const [intent, setIntent] = useState(false);
  return (
    <NextLink
      {...props}
      prefetch={intent ? prefetch : false}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
