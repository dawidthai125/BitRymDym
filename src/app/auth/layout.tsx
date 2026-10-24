import { AuthThemeBar } from "@/components/site/auth-theme-bar";

/**
 * Auth callback result pages (/auth/*) have no SiteHeader —
 * reuse AuthThemeBar so theme toggle stays reachable without editing page WIP.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <AuthThemeBar />
      {children}
    </>
  );
}
