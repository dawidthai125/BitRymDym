/**
 * Test-only IIFE entry: mount real BeatsCatalogClient (filters sheet + trap).
 * Bundled by beats-catalog-filters.mount-host.ts — not an app route.
 */
import { createRoot, type Root } from "react-dom/client";

import { BeatsCatalogClient } from "@/components/brand/beats-catalog-client";
import type { PresentedBeat } from "@/lib/ui/demo-beats";

const FIXTURE: PresentedBeat[] = [
  {
    id: "mount-beat-1",
    title: "Mount Fixture",
    producer: "Probe",
    genre: "Trap",
    mood: null,
    key: "Am",
    bpm: 140,
    durationSeconds: 30,
    artworkVariant: 0,
  },
];

export type BeatsCatalogFiltersMountApi = {
  mount: (hostId?: string) => void;
  unmount: () => void;
};

declare global {
  interface Window {
    __BRD_BEATS_FILTERS_MOUNT__?: BeatsCatalogFiltersMountApi;
  }
}

let root: Root | null = null;

function mount(hostId = "beats-filters-mount-root"): void {
  const el = document.getElementById(hostId);
  if (!el) throw new Error(`mount host #${hostId} missing`);
  if (root) {
    root.unmount();
    root = null;
  }
  root = createRoot(el);
  root.render(<BeatsCatalogClient beats={FIXTURE} />);
}

function unmount(): void {
  root?.unmount();
  root = null;
}

window.__BRD_BEATS_FILTERS_MOUNT__ = { mount, unmount };
