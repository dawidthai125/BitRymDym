import { MobileBottomNav } from "@/components/site/mobile-bottom-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import {
  MAIN_CONTENT_ID,
  MAIN_CONTENT_LANDMARK_CLASS,
} from "@/components/site/skip-to-main";
import { StickyMiniPlayer } from "@/components/player/sticky-mini-player";
import { TermsNotice } from "@/components/legal/terms-notice";
import { getCurrentProfile } from "@/lib/auth/session";
import { termsNoticeDue } from "@/lib/legal/legal-config";
import { cn } from "@/lib/utils";

/**
 * Public/studio shell for Beat Detail and related surfaces.
 * Uses committed SiteHeader (no `tone` prop — C2 M2 closure).
 * `tone` is retained only for shell chrome (padding / sticky / bottom nav).
 */
export async function AppShell({
  children,
  tone = "public",
  className,
  compactFooter = false,
  chromeless = false,
}: {
  /** No site header, bottom menu or mini player: the screen has its own way out (Studio project). */
  chromeless?: boolean;
  children: React.ReactNode;
  /** One-line footer for work screens (Studio project). */
  compactFooter?: boolean;
  tone?: "public" | "studio" | "admin";
  className?: string;
}) {
  const session = await getCurrentProfile();
  const isAdminChrome = tone === "admin";

  return (
    <div data-app-shell className={cn("min-h-dvh", className)}>
      {chromeless ? null : <SiteHeader />}
      {/*
        Skip target is a div: AppShell children already render their own main landmark.
        Nesting another main landmark would be invalid HTML.
      */}
      <div
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className={cn(
          MAIN_CONTENT_LANDMARK_CLASS,
          !isAdminChrome &&
            !chromeless &&
            // Room for the bottom nav (phone) and, only while it is on screen, the sticky player.
            "pb-[calc(3.75rem+env(safe-area-inset-bottom)+1rem)] lg:pb-2 [[data-app-shell]:has([data-sticky-player])_&]:pb-[calc(3.75rem+env(safe-area-inset-bottom)+10rem)] lg:[[data-app-shell]:has([data-sticky-player])_&]:pb-28",
        )}
      >
        {/* Not over a Studio project: that screen has no room to spare. */}
        {session && !compactFooter && termsNoticeDue(session.profile.createdAt) ? <TermsNotice /> : null}
        {children}
        <SiteFooter compact={compactFooter} />
      </div>
      {!isAdminChrome && !chromeless ? (
        <>
          <StickyMiniPlayer />
          <MobileBottomNav isAuthenticated={Boolean(session)} />
        </>
      ) : null}
    </div>
  );
}
