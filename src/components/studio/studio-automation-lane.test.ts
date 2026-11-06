import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioAutomationLane, withLane } from "./studio-automation-lane";

const noop = () => undefined;
const props = {
  trackId: "t1",
  staticValue: -3,
  timelineLengthMs: 10_000,
  pxPerMs: 0.1,
  laneHeightPx: 144,
  onChangeParam: noop,
  onClose: noop,
  onCommit: noop,
};
const auto = { v: 1 as const, lanes: [{ param: "gainDb" as const, points: [{ t: 1000, v: -12 }, { t: 5000, v: 0 }] }] };

describe("automation lane — markup", () => {
  it("draws one focusable slider per point with a readable label", () => {
    const html = renderToStaticMarkup(createElement(StudioAutomationLane, { ...props, automation: auto, param: "gainDb" }));
    expect(html.match(/role="slider"/g)).toHaveLength(2);
    expect(html).toContain("-12.0 dB");
    expect(html).toContain('data-param="gainDb"');
    expect(html).toContain("polyline");
    // width = timeline length * zoom
    expect(html).toContain('width="1000"');
  });
  it("an empty lane shows the track's static value as a flat line and the hint", () => {
    const html = renderToStaticMarkup(createElement(StudioAutomationLane, { ...props, automation: undefined, param: "gainDb" }));
    expect(html).not.toContain('role="slider"');
    expect(html).toContain("studio-automation-toolbar");
  });
  it("shows only the lane of the chosen parameter", () => {
    const html = renderToStaticMarkup(createElement(StudioAutomationLane, { ...props, automation: auto, param: "pan" }));
    expect(html).not.toContain('role="slider"');
    expect(html).toContain('data-param="pan"');
  });
});

describe("automation lane — document helper", () => {
  it("withLane replaces one parameter and keeps the other", () => {
    const both = withLane(auto, "pan", [{ t: 0, v: 0.5 }]);
    expect(both.lanes.map((l) => l.param).sort()).toEqual(["gainDb", "pan"]);
    const replaced = withLane(both, "gainDb", [{ t: 100, v: -1 }]);
    expect(replaced.lanes.find((l) => l.param === "gainDb")!.points).toEqual([{ t: 100, v: -1 }]);
    expect(replaced.lanes.find((l) => l.param === "pan")!.points).toEqual([{ t: 0, v: 0.5 }]);
  });
  it("an empty point list removes that lane", () => {
    expect(withLane(auto, "gainDb", []).lanes).toEqual([]);
    expect(withLane(undefined, "pan", []).lanes).toEqual([]);
  });
});

describe("automation lane — editor wiring", () => {
  const editor = readFileSync("src/components/studio/studio-editor.tsx", "utf8");
  it("is Silver/Gold only and saves through the CAS PUT", () => {
    expect(editor).toContain("studioAdvancedRecordAllowed(trackCapacity.premiumTier)");
    expect(editor).toContain("/automation`");
    expect(editor).toContain('method: "PUT"');
    expect(editor).toContain("expectedDocumentVersion: expected, automation");
  });
  it("the overlay is drawn inside the track lane, after the clips", () => {
    expect(editor).toContain("renderLaneOverlay ? renderLaneOverlay(track) : null");
    expect(editor).toContain("renderLaneOverlay={(track) =>");
  });
});
