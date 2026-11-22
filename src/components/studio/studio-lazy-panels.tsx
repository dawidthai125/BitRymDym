"use client";

/**
 * Lazy (next/dynamic) boundaries for Studio panels that are not visible when a project opens:
 * Mix / Mastering steps, BITKA chat, FX sheet, clip spectrogram, and the record-step
 * lyrics card / Sample Lab desk / play keys. One canonical place for the loaders, so a
 * prefetch (intent or idle) warms exactly the chunk the boundary later renders.
 *
 * Rendering logic stays in the original modules; this file only defers their download.
 * All are `ssr: false`: none of them is on screen on the first server render, and they
 * touch window / Web Audio / canvas.
 */

import dynamic from "next/dynamic";
import { useEffect } from "react";

const loadMixStep = () => import("@/components/studio/studio-mix-step");
const loadMasterStep = () => import("@/components/studio/studio-master-step");
const loadBitekChat = () => import("@/components/studio/studio-bitek-chat");
const loadFxChainEditor = () => import("@/components/studio/studio-fx-chain-editor");
const loadClipSpectrogram = () => import("@/components/studio/studio-clip-spectrogram");
const loadLyricsCard = () => import("@/components/studio/studio-lyrics-card");
const loadSampleDesk = () => import("@/components/studio/studio-sample-desk");
const loadPlayKeys = () => import("@/components/studio/studio-play-keys");

/** Placeholder in the shape of the route `loading.tsx` skeleton (border block, no text). */
function panelPlaceholder(heightClass: string) {
  function StudioLazyPanelPlaceholder() {
    return (
      <div
        aria-busy="true"
        data-testid="studio-lazy-panel-loading"
        className={`${heightClass} border border-[var(--brd-line)]`}
      />
    );
  }
  return StudioLazyPanelPlaceholder;
}

export const StudioMixStep = dynamic(() => loadMixStep().then((m) => m.StudioMixStep), {
  ssr: false,
  loading: panelPlaceholder("h-64"),
});

export const StudioMasterStep = dynamic(() => loadMasterStep().then((m) => m.StudioMasterStep), {
  ssr: false,
  loading: panelPlaceholder("h-64"),
});

export const StudioBitekChat = dynamic(() => loadBitekChat().then((m) => m.StudioBitekChat), {
  ssr: false,
  loading: panelPlaceholder("h-24"),
});

/** Sheet + editor share one module; the sheet renders null while closed, so both wait for open. */
export const StudioFxSheet = dynamic(() => loadFxChainEditor().then((m) => m.StudioFxSheet), {
  ssr: false,
});

export const StudioFxChainEditor = dynamic(() => loadFxChainEditor().then((m) => m.StudioFxChainEditor), {
  ssr: false,
});

export const StudioClipSpectrogram = dynamic(
  () => loadClipSpectrogram().then((m) => m.StudioClipSpectrogram),
  { ssr: false },
);

export const StudioLyricsCard = dynamic(() => loadLyricsCard().then((m) => m.StudioLyricsCard), {
  ssr: false,
  loading: panelPlaceholder("h-24"),
});

export const StudioSampleDesk = dynamic(() => loadSampleDesk().then((m) => m.StudioSampleDesk), {
  ssr: false,
  loading: panelPlaceholder("h-24"),
});

export const StudioPlayKeys = dynamic(() => loadPlayKeys().then((m) => m.StudioPlayKeys), {
  ssr: false,
});

let stepPanelsPrefetched = false;

/** Warm the Mix / Mastering / Sample chunks (step-nav hover, focus, touch). Idempotent. */
export function prefetchStudioStepPanels(): void {
  if (stepPanelsPrefetched) return;
  stepPanelsPrefetched = true;
  void Promise.all([loadMixStep(), loadMasterStep(), loadSampleDesk(), loadPlayKeys()]).catch(() => {
    stepPanelsPrefetched = false;
  });
}

let idlePanelsPrefetched = false;

function prefetchAllStudioPanels(): void {
  if (idlePanelsPrefetched) return;
  idlePanelsPrefetched = true;
  prefetchStudioStepPanels();
  void Promise.all([loadBitekChat(), loadFxChainEditor(), loadClipSpectrogram(), loadLyricsCard()]).catch(() => {
    idlePanelsPrefetched = false;
  });
}

/**
 * Renders nothing. Once the editor is interactive and the main thread is idle, warms every
 * lazy panel chunk so the first open of a panel does not wait on the network.
 */
export function StudioLazyPanelsIdlePrefetch() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(prefetchAllStudioPanels, { timeout: 8000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(prefetchAllStudioPanels, 3000);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
