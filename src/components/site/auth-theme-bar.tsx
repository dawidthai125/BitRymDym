import { ThemeToggle } from "@/components/site/theme-toggle";

/** Minimal chrome for auth routes that omit SiteHeader. */
export function AuthThemeBar() {
  return (
    <div className="fixed right-4 top-4 z-50 sm:right-6 sm:top-5">
      <ThemeToggle />
    </div>
  );
}
