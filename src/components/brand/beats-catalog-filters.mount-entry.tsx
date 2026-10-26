/**
 * Test-only IIFE entry: mount real BeatsCatalogClient inside AppShell-shaped chrome.
 * Bundled by beats-catalog-filters.mount-host.ts — not an app route.
 */
/* eslint-disable @next/next/no-html-link-for-pages -- fixture markers for AX probe, not app navigation */

import type { ReactNode } from "react";
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
  {
    id: "mount-beat-2",
    title: "River Flow",
    producer: "Probe",
    genre: "Drill",
    mood: null,
    key: "Gm",
    bpm: 128,
    durationSeconds: 30,
    artworkVariant: 1,
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

function ShellFixture({ children }: { children: ReactNode }) {
  return (
    <div data-app-shell>
      <header>
        <a href="/">BitRymDym</a>
        <button type="button">Motyw</button>
        <a href="/sign-in">Konto</a>
      </header>
      <nav aria-label="Główna">
        <a href="/beats">Bity</a>
        <a href="/studio">Studio</a>
      </nav>
      <div id="main-content">{children}</div>
      <nav aria-label="Nawigacja mobilna">
        <a href="/beats">Bity</a>
        <a href="/studio">Studio</a>
        <a href="/account">Profil</a>
      </nav>
    </div>
  );
}

function mount(hostId = "beats-filters-mount-root"): void {
  const el = document.getElementById(hostId);
  if (!el) throw new Error(`mount host #${hostId} missing`);
  if (root) {
    root.unmount();
    root = null;
  }
  root = createRoot(el);
  root.render(
    <ShellFixture>
      <BeatsCatalogClient beats={FIXTURE} />
    </ShellFixture>,
  );
}

function unmount(): void {
  root?.unmount();
  root = null;
}

window.__BRD_BEATS_FILTERS_MOUNT__ = { mount, unmount };
