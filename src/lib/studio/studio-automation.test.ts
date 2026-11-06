import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  AUTOMATION_LIMITS,
  AutomationValidationError,
  automationLane,
  emptyAutomation,
  evalAutomation,
  hasAutomation,
  parseAutomationForWrite,
  readAutomation,
  trackParamAt,
} from "./studio-automation";

const gain = (points: { t: number; v: number }[]) => ({ v: 1, lanes: [{ param: "gainDb", points }] });

describe("automation — evaluation", () => {
  const pts = [
    { t: 1000, v: 0 },
    { t: 3000, v: -6 },
    { t: 5000, v: 0 },
  ];
  it("falls back to the static value without points", () => {
    expect(evalAutomation(null, 500, -3)).toBe(-3);
    expect(evalAutomation([], 500, -3)).toBe(-3);
  });
  it("holds before the first and after the last point", () => {
    expect(evalAutomation(pts, 0, 9)).toBe(0);
    expect(evalAutomation(pts, 9000, 9)).toBe(0);
  });
  it("is linear between points and exact on them", () => {
    expect(evalAutomation(pts, 1000, 9)).toBe(0);
    expect(evalAutomation(pts, 2000, 9)).toBeCloseTo(-3, 6);
    expect(evalAutomation(pts, 3000, 9)).toBe(-6);
    expect(evalAutomation(pts, 4000, 9)).toBeCloseTo(-3, 6);
  });
  it("a single point is a constant", () => {
    expect(evalAutomation([{ t: 2000, v: -4 }], 0, 9)).toBe(-4);
    expect(evalAutomation([{ t: 2000, v: -4 }], 9999, 9)).toBe(-4);
  });
  it("binary search agrees with a linear scan on many points", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ t: i * 100, v: Math.sin(i / 7) * 10 }));
    const scan = (t: number) => {
      if (t <= many[0].t) return many[0].v;
      for (let i = 1; i < many.length; i++) {
        if (t <= many[i].t) return many[i - 1].v + ((many[i].v - many[i - 1].v) * (t - many[i - 1].t)) / (many[i].t - many[i - 1].t);
      }
      return many[many.length - 1].v;
    };
    for (let t = 0; t < 20500; t += 137) expect(evalAutomation(many, t, 0)).toBeCloseTo(scan(t), 9);
  });
  it("trackParamAt clamps to the parameter range and uses the static value without a lane", () => {
    expect(trackParamAt(null, "gainDb", 100, -2)).toBe(-2);
    expect(trackParamAt(readAutomation(gain([{ t: 0, v: 5 }])), "pan", 100, 0.25)).toBe(0.25);
    expect(trackParamAt(readAutomation(gain([{ t: 0, v: 5 }])), "gainDb", 100, 0)).toBe(5);
  });
});

describe("automation — read (tolerant)", () => {
  it("never throws and drops garbage", () => {
    expect(readAutomation(null)).toEqual(emptyAutomation());
    expect(readAutomation("x")).toEqual(emptyAutomation());
    expect(readAutomation({ v: 2, lanes: [] })).toEqual(emptyAutomation());
    const r = readAutomation({
      v: 1,
      lanes: [{ param: "gainDb", points: [{ t: 100, v: -1 }, { t: "x", v: 0 }, { t: -5, v: 0 }, null] }, { param: "bogus", points: [] }],
    });
    expect(r.lanes).toEqual([{ param: "gainDb", points: [{ t: 100, v: -1 }] }]);
  });
  it("sorts by time, dedups equal times (last wins) and clamps values", () => {
    const r = readAutomation(gain([{ t: 2000, v: 100 }, { t: 1000, v: -999 }, { t: 2000, v: -2 }]));
    expect(r.lanes[0].points).toEqual([
      { t: 1000, v: AUTOMATION_LIMITS.range.gainDb.min },
      { t: 2000, v: -2 },
    ]);
  });
});

describe("automation — write (strict)", () => {
  it("accepts a valid document and returns it normalised", () => {
    const r = parseAutomationForWrite({ v: 1, lanes: [{ param: "pan", points: [{ t: 500.4, v: 0.5 }, { t: 100, v: -2 }] }] });
    expect(r.lanes[0].points).toEqual([{ t: 100, v: -1 }, { t: 500, v: 0.5 }]);
    expect(hasAutomation(r)).toBe(true);
    expect(automationLane(r, "pan")?.points).toHaveLength(2);
    expect(automationLane(r, "gainDb")).toBeNull();
  });
  it("treats null / no lanes as empty", () => {
    expect(parseAutomationForWrite(null)).toEqual(emptyAutomation());
    expect(hasAutomation(parseAutomationForWrite({ v: 1, lanes: [] }))).toBe(false);
    expect(hasAutomation(parseAutomationForWrite({ v: 1, lanes: [{ param: "gainDb", points: [] }] }))).toBe(false);
  });
  const code = (raw: unknown) => {
    try {
      parseAutomationForWrite(raw);
      return "ok";
    } catch (e) {
      return e instanceof AutomationValidationError ? e.code : "other";
    }
  };
  it("rejects bad shape, params, points, duplicates and oversize input", () => {
    expect(code("x")).toBe("bad_shape");
    expect(code({ v: 2, lanes: [] })).toBe("bad_shape");
    expect(code({ v: 1, lanes: [{ param: "reverb", points: [] }] })).toBe("bad_param");
    expect(code(gain([{ t: "1", v: 0 } as unknown as { t: number; v: number }]))).toBe("bad_point");
    expect(code(gain([{ t: 0, v: Number.NaN }]))).toBe("bad_point");
    expect(code(gain([{ t: AUTOMATION_LIMITS.maxTimeMs + 1, v: 0 }]))).toBe("bad_point");
    expect(code({ v: 1, lanes: [{ param: "gainDb", points: [] }, { param: "gainDb", points: [] }] })).toBe("duplicate_lane");
    expect(code({ v: 1, lanes: [1, 2, 3].map(() => ({ param: "gainDb", points: [] })) })).toBe("too_many_lanes");
    expect(code(gain(Array.from({ length: AUTOMATION_LIMITS.maxPoints + 1 }, (_, i) => ({ t: i, v: 0 }))))).toBe("too_many_points");
  });
  it("a full lane stays under the byte guard", () => {
    const full = parseAutomationForWrite(gain(Array.from({ length: AUTOMATION_LIMITS.maxPoints }, (_, i) => ({ t: i * 1000, v: -12.345 }))));
    expect(JSON.stringify(full).length).toBeLessThan(AUTOMATION_LIMITS.maxBytes);
  });
});

describe("automation — wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("route is a CAS PUT behind the service", () => {
    const route = read("src/app/api/studio/projects/[projectId]/tracks/[trackId]/automation/route.ts");
    expect(route).toContain("export async function PUT");
    expect(route).toContain("expectedDocumentVersion");
    expect(route).toContain("applyStudioTrackAutomation");
  });
  it("service gates by plan, validates strictly and writes through the CAS RPC", () => {
    const src = read("src/lib/studio/studio-service.ts");
    expect(src).toContain("studioAdvancedRecordAllowed(product.premiumTier)");
    expect(src).toContain("parseAutomationForWrite(input.automation)");
    expect(src).toContain('"studio_cas_apply_automation"');
    expect(src).toContain("readAutomation(row.automation)");
  });
  it("migration is additive, CAS and service-role only", () => {
    const sql = read("supabase/migrations/20261106180000_studio_track_automation.sql");
    expect(sql).toContain("add column if not exists automation jsonb");
    expect(sql).toContain("studio_projects.document_version = p_expected");
    expect(sql).toContain("revoke all on function public.studio_cas_apply_automation");
    expect(sql).toContain("to service_role");
  });
});
