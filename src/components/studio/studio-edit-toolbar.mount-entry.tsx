/**
 * Test-only IIFE entry: mount real StudioEditToolbar (real Button).
 * Bundled by studio-edit-toolbar.mount-host.ts — not an app route.
 */
import { createRoot, type Root } from "react-dom/client";
import { withIntl } from "@/test/intl-test-provider";

import { StudioEditToolbar } from "@/components/studio/studio-edit-toolbar";
import { forbiddenToolbarAction } from "@/components/studio/studio-edit-toolbar.mount-stubs";

export type StudioToolbarMountApi = {
  mount: (hostId?: string) => void;
  unmount: () => void;
};

declare global {
  interface Window {
    __BRD_STUDIO_TOOLBAR_MOUNT__?: StudioToolbarMountApi;
  }
}

let root: Root | null = null;

function throwAction(name: string) {
  return () => forbiddenToolbarAction(name);
}

function mount(hostId = "studio-toolbar-mount-root"): void {
  const el = document.getElementById(hostId);
  if (!el) throw new Error(`mount host #${hostId} missing`);
  if (root) {
    root.unmount();
    root = null;
  }
  root = createRoot(el);
  root.render(withIntl(
    <StudioEditToolbar
      timelineMode="seek"
      recordingLocked={false}
      pending={false}
      hasSelectedClip={true}
      atTrackCapacity={false}
      showUpgradeCta={true}
      trackCount={2}
      maxTracks={8}
      premiumTier="FREE"
      inspectorOverlayOpen={false}
      inspectorPanelId="mount-inspector"
      mixerOpen={false}
      mixerPanelId="mount-mixer"
      snapPreset="off"
      onSeekMode={throwAction("seek")}
      onEditMode={throwAction("edit")}
      onSplit={throwAction("split")}
      onDeleteClip={throwAction("delete")}
      onAddTrack={throwAction("addTrack")}
      onToggleInspector={throwAction("inspector")}
      onToggleMixer={throwAction("mixer")}
      onSnapCycle={throwAction("snap")}
      onZoomOut={throwAction("zoomOut")}
      onZoomIn={throwAction("zoomIn")}
      onFit={throwAction("fit")}
    />,
  ));
}

function unmount(): void {
  root?.unmount();
  root = null;
}

window.__BRD_STUDIO_TOOLBAR_MOUNT__ = { mount, unmount };
