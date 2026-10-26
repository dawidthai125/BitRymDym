import { MobileBottomNav } from "@/components/site/mobile-bottom-nav";
import { SiteHeader } from "@/components/site/site-header";
import {
  MAIN_CONTENT_ID,
  MAIN_CONTENT_LANDMARK_CLASS,
} from "@/components/site/skip-to-main";
import { StickyMiniPlayer } from "@/components/player/sticky-mini-player";
import { getCurrentProfile } from "@/lib/auth/session";
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
}: {
  children: React.ReactNode;
  tone?: "public" | "studio" | "admin";
  className?: string;
}) {
  const session = await getCurrentProfile();
  const isAdminChrome = tone === "admin";

  return (
    <div data-app-shell className={cn("min-h-dvh", className)}>
      <SiteHeader />
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
            "pb-[calc(3.75rem+env(safe-area-inset-bottom)+3.5rem)] lg:pb-16",
        )}
      >
        {children}
      </div>
      {!isAdminChrome ? (
        <>
          <StickyMiniPlayer />
          <MobileBottomNav isAuthenticated={Boolean(session)} />
        </>
      ) : null}
    </div>
  );
}
