import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { AbstractIntlMessages } from "next-intl";

/** Studio and admin copy is about half the catalog. Public pages do not ship it. */
const OMIT_ON_PUBLIC = new Set(["studio", "admin"]);

export async function publicClientMessages(): Promise<AbstractIntlMessages> {
  const messages = await getMessages();
  const light: AbstractIntlMessages = {};
  for (const [key, value] of Object.entries(messages)) {
    if (OMIT_ON_PUBLIC.has(key)) continue;
    light[key] = value as AbstractIntlMessages[string];
  }
  return light;
}

/** Nested provider replaces messages, so these routes pass the full catalog. */
export async function FullClientMessages({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
  );
}
