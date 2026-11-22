"use client";

import { createContext, useContext } from "react";

/**
 * Store-app flag for client components. The value comes from the server (root layout,
 * `isStoreApp()` reads the httpOnly `brd_app` cookie), so SSR and hydration agree and
 * hidden purchase UI never reaches the HTML.
 */
const StoreAppContext = createContext(false);

export function StoreAppProvider({ storeApp, children }: { storeApp: boolean; children: React.ReactNode }) {
  return <StoreAppContext.Provider value={storeApp}>{children}</StoreAppContext.Provider>;
}

/** True inside the Google Play / App Store app: no prices, no buying, no plan links. */
export function useStoreApp(): boolean {
  return useContext(StoreAppContext);
}

/** Renders children only outside the store app (usable from Server Components too). */
export function StoreAppHidden({ children }: { children: React.ReactNode }) {
  return useStoreApp() ? null : <>{children}</>;
}
