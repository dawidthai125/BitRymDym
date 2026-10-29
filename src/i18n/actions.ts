"use server";

import { cookies } from "next/headers";

import { LOCALE_COOKIE, resolveLocale } from "./config";

export async function setLocaleAction(value: string): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE, resolveLocale(value), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
