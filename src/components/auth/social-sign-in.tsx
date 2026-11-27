"use client";

import { useTranslations } from "next-intl";
import { useState, type MouseEvent } from "react";

import { safeNextPath } from "@/lib/auth/next-path";
import { APP_AUTH_SCHEME_URL, OAUTH_CALLBACK_FLOW, type SocialProvider } from "@/lib/auth/social";

type AppPlugins = {
  Browser?: { open: (o: { url: string }) => Promise<void>; close: () => Promise<void> };
  App?: { addListener: (event: "appUrlOpen", cb: (e: { url: string }) => void) => unknown };
};

/** Capacitor injects its plugins into the remote page of the iOS app only. */
function appPlugins(): AppPlugins | null {
  const plugins = (window as unknown as { Capacitor?: { Plugins?: AppPlugins } }).Capacitor?.Plugins;
  return plugins?.Browser && plugins.App ? plugins : null;
}

let appListenerAdded = false;

function listenForAppReturn(plugins: AppPlugins) {
  if (appListenerAdded) return;
  appListenerAdded = true;
  plugins.App!.addListener("appUrlOpen", ({ url }) => {
    if (!url.startsWith(APP_AUTH_SCHEME_URL)) return;
    const params = new URL(url).searchParams;
    const out = new URLSearchParams({ flow: OAUTH_CALLBACK_FLOW });
    const code = params.get("code");
    if (code) out.set("code", code);
    const next = safeNextPath(params.get("next"));
    if (next) out.set("next", next);
    void plugins.Browser!.close().catch(() => {});
    window.location.assign(`/auth/callback?${out}`);
  });
}

function startHref(provider: SocialProvider, next: string | null): string {
  const q = new URLSearchParams({ provider });
  if (next) q.set("next", next);
  return `/auth/oauth/start?${q}`;
}

async function openInApp(event: MouseEvent<HTMLAnchorElement>, onError: () => void) {
  const plugins = appPlugins();
  if (!plugins) return; // Web / Android: a normal navigation.
  event.preventDefault();
  const href = event.currentTarget.getAttribute("href")!;
  try {
    listenForAppReturn(plugins);
    const res = await fetch(`${href}&app=1`, { credentials: "same-origin", cache: "no-store" });
    const body = (await res.json()) as { url: string | null };
    if (!body.url) throw new Error("no url");
    await plugins.Browser!.open({ url: body.url });
  } catch {
    onError();
  }
}

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="size-5 shrink-0">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const AppleMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className="size-5 shrink-0">
    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
  </svg>
);

/** "Continue with Google / Apple" — one set of buttons for sign-in and sign-up. */
export function SocialSignIn({
  providers,
  next = null,
  divider = true,
}: {
  providers: readonly SocialProvider[];
  next?: string | null;
  divider?: boolean;
}) {
  const t = useTranslations("auth.social");
  const [failed, setFailed] = useState(false);
  if (providers.length === 0) return null;
  const base = "flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border px-4 text-sm font-semibold";
  const style: Record<SocialProvider, string> = {
    google: "border-[#747775] bg-white text-[#1f1f1f]",
    apple: "border-white bg-black text-white",
  };
  // Apple first: App Store guideline 4.8 wants it at least as prominent.
  const ordered = [...providers].sort((a) => (a === "apple" ? -1 : 1));
  return (
    <div className="flex w-full max-w-sm flex-col gap-3" data-testid="social-sign-in">
      {ordered.map((p) => (
        // Plain anchor on purpose: the route answers with a redirect to the provider (no prefetch).
        <a key={p} href={startHref(p, next)} rel="nofollow" className={`${base} ${style[p]}`} data-testid={`social-${p}`} onClick={(e) => { setFailed(false); void openInApp(e, () => setFailed(true)); }}>
          {p === "google" ? <GoogleMark /> : <AppleMark />}
          {t(p === "google" ? "google" : "apple")}
        </a>
      ))}
      {failed ? <p className="text-sm text-destructive" role="alert">{t("blad")}</p> : null}
      {divider ? (
        <p className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {t("lub")}
          <span className="h-px flex-1 bg-border" />
        </p>
      ) : null}
    </div>
  );
}
