/**
 * "Pierwsze kroki" on the Studio landing page: when to show the guide and which steps are done.
 * Pure — uses only the project list the page already loads (no extra queries).
 */

/** Show the guide while the user has at most this many projects. */
export const FIRST_STEPS_MAX_PROJECTS = 1;
export const FIRST_STEPS_STORAGE_KEY = "brd:studio:first-steps-hidden";

export type FirstStepId = "beat" | "record" | "mix" | "master";

export type FirstStep = {
  id: FirstStepId;
  done: boolean;
  /** Where the step's button leads; null = no button. */
  href: string | null;
};

export type FirstStepsPlan = { show: false } | { show: true; steps: FirstStep[] };

type ProjectLike = { id: string; beatId: string | null };

export function planFirstSteps(projects: readonly ProjectLike[]): FirstStepsPlan {
  if (projects.length > FIRST_STEPS_MAX_PROJECTS) return { show: false };
  const project = projects[0] ?? null;
  const projectHref = project ? `/studio/p/${project.id}` : null;
  const hasBeat = projects.some((p) => p.beatId != null);
  return {
    show: true,
    steps: [
      { id: "beat", done: hasBeat, href: "/beats" },
      { id: "record", done: false, href: projectHref },
      { id: "mix", done: false, href: projectHref },
      { id: "master", done: false, href: projectHref },
    ],
  };
}
