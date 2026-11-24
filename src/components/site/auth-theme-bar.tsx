import { ThemeToggle } from "@/components/site/theme-toggle";

/** Minimal chrome for auth routes that omit SiteHeader. Scrolls away with the page: fixed, it covered form fields on phones. */
export function AuthThemeBar() {
  return (
    <div className="absolute right-4 top-4 z-50 sm:right-6 sm:top-5">
      <ThemeToggle />
    </div>
  );
}
