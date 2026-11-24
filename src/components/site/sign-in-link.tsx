"use client";

import { useSyncExternalStore, type ComponentProps } from "react";

import Link from "@/components/ui/app-link";
import { currentSignInHref } from "@/lib/site/sign-in-href";

/** Re-read before a click or Enter: a catalogue changes the address without a navigation. */
function subscribe(onChange: () => void) {
  window.addEventListener("pointerdown", onChange, true);
  window.addEventListener("focusin", onChange, true);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("pointerdown", onChange, true);
    window.removeEventListener("focusin", onChange, true);
    window.removeEventListener("popstate", onChange);
  };
}

/** Link to /sign-in that returns to the current page (a passed href is ignored). Server HTML has the bare address, so hydration matches. */
export function SignInLink(props: Omit<ComponentProps<typeof Link>, "href"> & { href?: string }) {
  const href = useSyncExternalStore(subscribe, currentSignInHref, () => "/sign-in");
  return <Link {...props} href={href} />;
}
