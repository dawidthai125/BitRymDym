import type { ReactNode } from "react";

import { BrdLink } from "@/components/brand/brd-button";
import { getCurrentProfile } from "@/lib/auth/session";

/** "Załóż konto" for guests only: a signed-in user never sees a sign-up call (Owner 2026-11-22). */
export async function GuestSignUpLink({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile().catch(() => null);
  if (profile) return null;
  return (
    <BrdLink href="/sign-up" variant="secondary">
      {children}
    </BrdLink>
  );
}
