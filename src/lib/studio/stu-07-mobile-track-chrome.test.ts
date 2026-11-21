/**
 * STU-07 — mobile Studio track chrome + timeline fit (narrow viewport).
 * Source contracts; runtime layout verified in browser / CDP.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  contentWidthPx,
  fitPxPerMs,
  STUDIO_TIMELINE_DEFAULT_PX_PER_MS,
  timelineContentOverflowsViewport,
} from "@/lib/studio/studio-timeline-view";

const root = process.cwd();
const editor = (readFileSync(join(root, "src/components/studio/studio-editor.tsx"), "utf8") +
    readFileSync(join(root, "src/components/studio/studio-timeline.tsx"), "utf8") +
    readFileSync(join(root, "src/components/studio/studio-daw-layout.ts"), "utf8"));

describe("STU-07-A — track header hit targets on narrow chrome", () => {
  it("keeps a minimum width on the track select control", () => {
    const selectAt = editor.indexOf('data-testid="studio-track-header-select"');
    expect(selectAt).toBeGreaterThan(0);
    const window = editor.slice(Math.max(0, selectAt - 480), selectAt + 40);
    expect(window).toMatch(/min-w-\[4\.5rem\]/);
  });

  it("keeps reorder and the track menu at 44px on a second row", () => {
    expect(editor).toMatch(
      /h-11 min-h-11 min-w-11 shrink-0 px-0[\s\S]{0,220}?Przenieś ścieżkę w górę/,
    );
    expect(editor).toMatch(
      /Phone header is full width, so row 2 can be 44px/,
    );
    expect(editor).toMatch(
      /Do not put name \+ M\/S\/R \+ ↑↓⋮ on one row \(6×44\)/,
    );
  });

  it("stacks the track list above a full-width lane on a phone", () => {
    expect(editor).toMatch(/flex-col sm:flex-row/);
    // Audit 2026-11-21: natural heights on a phone — only the lane scrolls, sideways.
    expect(editor).toMatch(/"w-full border-b sm:h-auto sm:max-h-none sm:w-\[272px\]/);
    expect(editor).not.toMatch(/max-sm:h-\[min\(28rem/);
    expect(editor).toMatch(/overflow-x-auto overflow-y-hidden touch-pan-x sm:overflow-y-auto/);
    expect(editor).toMatch(/syncVerticalScroll/);
  });

  it("auto-fits overflowing timeline when the user has not zoomed", () => {
    expect(editor).toMatch(/userAdjustedZoomRef/);
    expect(editor).toMatch(/timelineContentOverflowsViewport/);
    expect(editor).toMatch(/maybeAutoFit/);
    expect(editor).toMatch(/ResizeObserver/);
  });
});

describe("STU-07-B — fit math on phone-width lane", () => {
  it("default density overflows a ~150px lane for a 60s project", () => {
    expect(
      timelineContentOverflowsViewport(
        60_000,
        150,
        STUDIO_TIMELINE_DEFAULT_PX_PER_MS,
      ),
    ).toBe(true);
  });

  it("fit + viewport-aware content width no longer overflows the lane", () => {
    const viewport = 150;
    const fitted = fitPxPerMs(60_000, viewport);
    const width = contentWidthPx(60_000, fitted, { viewportWidthPx: viewport });
    expect(width).toBeLessThanOrEqual(viewport);
    expect(
      timelineContentOverflowsViewport(60_000, viewport, fitted),
    ).toBe(false);
  });
});
