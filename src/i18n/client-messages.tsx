import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { AbstractIntlMessages } from "next-intl";

/** Studio and admin copy is about half the catalog. Public pages do not ship it. */
const OMIT_ON_PUBLIC = new Set(["studio", "admin"]);

/**
 * Namespaces that public pages ship only in part: the listed subtrees are the
 * ones client components on public routes read (`useTranslations`). Server
 * components read the full catalog via `getTranslations`, so they need nothing
 * here. Account routes (/account, /beat, /studio, /admin) nest a provider with
 * the full `account` tree. Guarded by `client-messages.test.ts`.
 */
export const PUBLIC_PARTIAL_NAMESPACES: Readonly<Record<string, readonly string[]>> = {
  // PremiumCheckoutForm on /premium.
  account: ["premiumPage.checkout"],
};

function omitNamespaces(
  messages: AbstractIntlMessages,
  omit: ReadonlySet<string>,
): AbstractIntlMessages {
  const light: AbstractIntlMessages = {};
  for (const [key, value] of Object.entries(messages)) {
    if (omit.has(key)) continue;
    light[key] = value as AbstractIntlMessages[string];
  }
  return light;
}

function pickPath(
  source: AbstractIntlMessages,
  target: AbstractIntlMessages,
  path: readonly string[],
): void {
  const [head, ...rest] = path;
  const value = source[head];
  if (value === undefined) return;
  if (rest.length === 0 || typeof value === "string") {
    target[head] = value;
    return;
  }
  const child = (target[head] ?? {}) as AbstractIntlMessages;
  target[head] = child;
  pickPath(value, child, rest);
}

/** Pure selector behind {@link publicClientMessages} (exported for tests). */
export function selectPublicClientMessages(
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  const light = omitNamespaces(
    messages,
    new Set([...OMIT_ON_PUBLIC, ...Object.keys(PUBLIC_PARTIAL_NAMESPACES)]),
  );
  for (const [namespace, paths] of Object.entries(PUBLIC_PARTIAL_NAMESPACES)) {
    for (const path of paths) {
      pickPath(messages, light, [namespace, ...path.split(".")]);
    }
  }
  return light;
}

export async function publicClientMessages(): Promise<AbstractIntlMessages> {
  return selectPublicClientMessages(await getMessages());
}

/** Nested provider replaces messages, so these routes pass the full catalog. */
export async function FullClientMessages({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
  );
}

/** Admin chrome: drop the large Studio dictionary (~84KB) from the client payload. */
export async function AdminClientMessages({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={omitNamespaces(messages, new Set(["studio"]))}>
      {children}
    </NextIntlClientProvider>
  );
}

/** Studio chrome: drop Admin dictionary from the client payload. */
export async function StudioClientMessages({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={omitNamespaces(messages, new Set(["admin"]))}>
      {children}
    </NextIntlClientProvider>
  );
}
