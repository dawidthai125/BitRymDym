/**
 * Recording settings of this visit, per project. The panel may unmount between takes (Mix step,
 * another tab); the mode, count-in and monitoring the user chose must still be there afterwards.
 */
import type { SectionBars } from "@/lib/studio/recording/section-loop";
import type { StudioCountInBars } from "@/lib/studio/studio-daw-clock";

export type RecordSettings = {
  recMode: "single" | "loop" | "punch";
  sectionBars: SectionBars;
  sectionStartMs: number | null;
  punchLine: number;
  countInBars: StudioCountInBars;
  punchEnabled: boolean;
  punchInMs: number;
  punchOutMs: number;
  monitorOn: boolean;
  monitorReverbOn: boolean;
};

export const DEFAULT_RECORD_SETTINGS: RecordSettings = {
  recMode: "single",
  sectionBars: 4,
  sectionStartMs: null,
  punchLine: 0,
  countInBars: 1,
  punchEnabled: false,
  punchInMs: 0,
  punchOutMs: 4000,
  monitorOn: false,
  monitorReverbOn: true,
};

const byProject = new Map<string, RecordSettings>();

export function readRecordSettings(projectId: string): RecordSettings {
  return byProject.get(projectId) ?? DEFAULT_RECORD_SETTINGS;
}

export function writeRecordSettings(projectId: string, settings: RecordSettings): void {
  byProject.set(projectId, settings);
}

/** Track the take goes to: the user's pick in the panel, then the armed track (R), then the selected one. */
export function resolveRecordTrackId(input: {
  tracks: readonly { id: string; recordArmed: boolean }[];
  manualId: string | null;
  selectedId: string | null;
}): string {
  const has = (id: string | null) => id != null && input.tracks.some((t) => t.id === id);
  if (has(input.manualId)) return input.manualId!;
  const armed = input.tracks.filter((t) => t.recordArmed);
  if (armed.length > 0) return (armed.find((t) => t.id === input.selectedId) ?? armed[0]!).id;
  if (has(input.selectedId)) return input.selectedId!;
  return input.tracks[0]?.id ?? "";
}

/** The recorder starts this long before the beat position, so the first word is never cut. */
export const RECORD_LEAD_MS = 300;

/** How the count-in runs: over the beat when there is room before the start, else clicks alone. */
export function countInPlan(input: {
  startMs: number;
  countMs: number;
}): "none" | "transport" | "clicks" {
  if (input.countMs <= 0) return "none";
  return input.startMs >= input.countMs ? "transport" : "clicks";
}

/** During a count-in the playhead may only run forward to the start; anything else means the user moved it. */
export function countInPlayheadMoved(input: {
  playheadMs: number;
  fromMs: number;
  targetMs: number;
}): boolean {
  return input.playheadMs < input.fromMs - 250 || input.playheadMs > input.targetMs + 1500;
}
