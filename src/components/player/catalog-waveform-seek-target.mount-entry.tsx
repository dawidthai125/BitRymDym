/**
 * Test-only IIFE entry: mount real Waveform (catalog / sticky density).
 * Bundled by catalog-waveform-seek-target.mount-host.ts — not an app route.
 */
import { createRoot, type Root } from "react-dom/client";

import { Waveform } from "@/components/brand/waveform";

export type CatalogWaveformMountOpts = {
  heightClassName?: string;
  density?: "catalog" | "sticky";
};

export type CatalogWaveformMountApi = {
  mount: (opts?: CatalogWaveformMountOpts, hostId?: string) => void;
  unmount: () => void;
};

declare global {
  interface Window {
    __BRD_CATALOG_WAVEFORM_MOUNT__?: CatalogWaveformMountApi;
  }
}

let root: Root | null = null;

function mount(
  opts?: CatalogWaveformMountOpts,
  hostId = "catalog-waveform-mount-root",
): void {
  const el = document.getElementById(hostId);
  if (!el) {
    throw new Error(`mount host #${hostId} missing`);
  }
  if (root) {
    root.unmount();
    root = null;
  }
  const density = opts?.density ?? "catalog";
  root = createRoot(el);
  root.render(
    <Waveform
      seed="catalog-mount-fixture"
      progress={0.35}
      interactive
      density={density}
      heightClassName={opts?.heightClassName}
    />,
  );
}

function unmount(): void {
  root?.unmount();
  root = null;
}

window.__BRD_CATALOG_WAVEFORM_MOUNT__ = { mount, unmount };
