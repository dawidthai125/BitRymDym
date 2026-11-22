"use client";

import { PlayerProvider } from "@/components/player/player-provider";
import { StoreAppProvider } from "@/components/site/store-app-context";

export function ClientProviders({ children, storeApp = false }: { children: React.ReactNode; storeApp?: boolean }) {
  return (
    <StoreAppProvider storeApp={storeApp}>
      <PlayerProvider>{children}</PlayerProvider>
    </StoreAppProvider>
  );
}
