import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { AbstractIntlMessages } from "next-intl";

/** Studio and admin copy is about half the catalog. Public pages do not ship it. */
const OMIT_ON_PUBLIC = new Set(["studio", "admin"]);

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

export async function publicClientMessages(): Promise<AbstractIntlMessages> {
  const messages = await getMessages();
  return omitNamespaces(messages, OMIT_ON_PUBLIC);
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
