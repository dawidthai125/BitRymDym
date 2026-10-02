"use client";

import { PlayerProvider } from "@/components/player/player-provider";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <PlayerProvider>{children}</PlayerProvider>;
}
