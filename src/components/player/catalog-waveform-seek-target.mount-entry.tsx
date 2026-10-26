/**
 * Test-only IIFE entry: mount real Waveform (catalog / sticky density).
 * Bundled by catalog-waveform-seek-target.mount-host.ts — not an app route.
 */
import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Waveform } from "@/components/brand/waveform";

const FIXTURE_PROGRESS = 0.35;

export type CatalogWaveformMountOpts = {
  heightClassName?: string;
  density?: "catalog" | "sticky";
  /** When true: wires onSeekRatio, tracks progress, exposes __BRD_CATALOG_WAVEFORM_SEEK__. */
  wireSeekCallback?: boolean;
};

export type CatalogWaveformMountApi = {
  mount: (opts?: CatalogWaveformMountOpts, hostId?: string) => void;
  unmount: () => void;
};

declare global {
  interface Window {
    __BRD_CATALOG_WAVEFORM_MOUNT__?: CatalogWaveformMountApi;
    __BRD_CATALOG_WAVEFORM_SEEK__?: {
      calls: number[];
      lastRatio: number;
    };
  }
}

let root: Root | null = null;

function CatalogWaveformMountTree({
  opts,
}: {
  opts?: CatalogWaveformMountOpts;
}) {
  const density = opts?.density ?? "catalog";
  const wireSeek = opts?.wireSeekCallback ?? false;
  const [progress, setProgress] = useState(FIXTURE_PROGRESS);

  useEffect(() => {
    if (!wireSeek) return;
    window.__BRD_CATALOG_WAVEFORM_SEEK__ = {
      calls: [],
      lastRatio: FIXTURE_PROGRESS,
    };
    return () => {
      delete window.__BRD_CATALOG_WAVEFORM_SEEK__;
    };
  }, [wireSeek]);

  const handleSeekRatio = (ratio: number) => {
    setProgress(ratio);
    const seek = window.__BRD_CATALOG_WAVEFORM_SEEK__;
    if (seek) {
      seek.calls.push(ratio);
      seek.lastRatio = ratio;
    }
  };

  return (
    <Waveform
      seed="catalog-mount-fixture"
      progress={wireSeek ? progress : FIXTURE_PROGRESS}
      interactive
      density={density}
      heightClassName={opts?.heightClassName}
      onSeekRatio={wireSeek ? handleSeekRatio : undefined}
      aria-label={wireSeek ? "Przebieg: Mount Fixture" : undefined}
    />
  );
}

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
  root = createRoot(el);
  root.render(<CatalogWaveformMountTree opts={opts} />);
}

function unmount(): void {
  root?.unmount();
  root = null;
  delete window.__BRD_CATALOG_WAVEFORM_SEEK__;
}

window.__BRD_CATALOG_WAVEFORM_MOUNT__ = { mount, unmount };
