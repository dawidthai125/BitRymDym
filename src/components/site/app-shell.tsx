import { MobileBottomNav } from "@/components/site/mobile-bottom-nav";
import { SiteHeader } from "@/components/site/site-header";
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
    <div className={cn("min-h-dvh", className)}>
      <SiteHeader />
      <div
        className={cn(
          !isAdminChrome &&
            "pb-[calc(3.75rem+env(safe-area-inset-bottom)+3.5rem)] md:pb-16",
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
