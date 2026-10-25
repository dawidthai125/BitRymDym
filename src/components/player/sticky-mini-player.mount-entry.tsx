/**
 * Test-only IIFE entry: mount real StickyMiniPlayer under isolated MountPlayerProvider.
 * Bundled by sticky-mini-player.mount-host.ts — not an app route.
 */
import { createRoot, type Root } from "react-dom/client";

import { StickyMiniPlayer } from "@/components/player/sticky-mini-player";
import { MountPlayerProvider } from "@/components/player/sticky-mini-player.mount-stubs";

export type StickyMountApi = {
  mount: (hostId?: string) => void;
  unmount: () => void;
};

declare global {
  interface Window {
    __BRD_STICKY_MOUNT__?: StickyMountApi;
  }
}

let root: Root | null = null;

function mount(hostId = "sticky-mount-root"): void {
  const el = document.getElementById(hostId);
  if (!el) {
    throw new Error(`mount host #${hostId} missing`);
  }
  if (root) {
    root.unmount();
    root = null;
  }
  root = createRoot(el);
  root.render(
    <MountPlayerProvider>
      <StickyMiniPlayer />
    </MountPlayerProvider>,
  );
}

function unmount(): void {
  root?.unmount();
  root = null;
}

window.__BRD_STICKY_MOUNT__ = { mount, unmount };
