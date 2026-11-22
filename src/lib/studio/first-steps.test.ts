import { describe, expect, it } from "vitest";

import { planFirstSteps } from "@/lib/studio/first-steps";

describe("planFirstSteps", () => {
  it("shows all steps open for a user with no projects", () => {
    const plan = planFirstSteps([]);
    expect(plan.show).toBe(true);
    if (!plan.show) return;
    expect(plan.steps.map((s) => s.id)).toEqual(["beat", "record", "mix", "master"]);
    expect(plan.steps.every((s) => !s.done)).toBe(true);
    expect(plan.steps[0]?.href).toBe("/beats");
    expect(plan.steps.slice(1).every((s) => s.href === null)).toBe(true);
  });

  it("marks the beat step done and links the project when it has a beat", () => {
    const plan = planFirstSteps([{ id: "p1", beatId: "b1" }]);
    expect(plan.show).toBe(true);
    if (!plan.show) return;
    expect(plan.steps[0]?.done).toBe(true);
    expect(plan.steps.slice(1).map((s) => s.href)).toEqual(["/studio/p/p1", "/studio/p/p1", "/studio/p/p1"]);
    expect(plan.steps.slice(1).every((s) => !s.done)).toBe(true);
  });

  it("keeps the beat step open for a project without a beat", () => {
    const plan = planFirstSteps([{ id: "p1", beatId: null }]);
    expect(plan.show && plan.steps[0]?.done).toBe(false);
  });

  it("hides the guide for users with several projects", () => {
    expect(planFirstSteps([{ id: "a", beatId: "b" }, { id: "c", beatId: null }]).show).toBe(false);
  });
});
