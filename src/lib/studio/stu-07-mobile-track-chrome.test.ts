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
const editor = readFileSync(
  join(root, "src/components/studio/studio-editor.tsx"),
  "utf8",
);

describe("STU-07-A — track header hit targets on narrow chrome", () => {
  it("keeps a minimum width on the track select control", () => {
    const selectAt = editor.indexOf('data-testid="studio-track-header-select"');
    expect(selectAt).toBeGreaterThan(0);
    const window = editor.slice(Math.max(0, selectAt - 480), selectAt + 40);
    expect(window).toMatch(/min-w-\[4\.5rem\]/);
  });

  it("moves reorder controls to a denser second row (not 6×44 on row 1)", () => {
    expect(editor).toMatch(
      /h-9 min-h-9 min-w-9[\s\S]{0,220}?Przenieś ścieżkę w górę/,
    );
    expect(editor).toMatch(
      /220px header cannot fit name \+ M\/S\/R \+ ↑↓⋮/,
    );
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
