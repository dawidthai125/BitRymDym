/**
 * Recording settings of this visit, per project. The panel may unmount between takes (Mix step,
 * another tab); the mode, count-in and monitoring the user chose must still be there afterwards.
 */
import type { SectionBars } from "@/lib/studio/recording/section-loop";
import { STUDIO_DEFAULT_COUNT_IN_BEATS, isStudioCountInBeats, type StudioCountInBeats } from "@/lib/studio/studio-daw-clock";

export type RecordSettings = {
  recMode: "single" | "loop" | "punch";
  sectionBars: SectionBars;
  sectionStartMs: number | null;
  punchLine: number;
  countInBeats: StudioCountInBeats;
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
  countInBeats: STUDIO_DEFAULT_COUNT_IN_BEATS,
  punchEnabled: false,
  punchInMs: 0,
  punchOutMs: 4000,
  monitorOn: false,
  monitorReverbOn: true,
};

const byProject = new Map<string, RecordSettings>();

const COUNT_IN_KEY = "brd.studio.countInBeats";

/** The count-in the user picked last time, in every project and after a reload. */
export function readCountInPreference(): StudioCountInBeats {
  try {
    const raw = globalThis.localStorage?.getItem(COUNT_IN_KEY);
    const value = raw == null ? NaN : Number(raw);
    return isStudioCountInBeats(value) ? value : STUDIO_DEFAULT_COUNT_IN_BEATS;
  } catch {
    return STUDIO_DEFAULT_COUNT_IN_BEATS;
  }
}

function writeCountInPreference(beats: StudioCountInBeats): void {
  try {
    globalThis.localStorage?.setItem(COUNT_IN_KEY, String(beats));
  } catch {
    // private mode: the choice still lasts for this visit
  }
}

export function readRecordSettings(projectId: string): RecordSettings {
  return byProject.get(projectId) ?? { ...DEFAULT_RECORD_SETTINGS, countInBeats: readCountInPreference() };
}

export function writeRecordSettings(projectId: string, settings: RecordSettings): void {
  const before = byProject.get(projectId)?.countInBeats ?? readCountInPreference();
  byProject.set(projectId, settings);
  if (settings.countInBeats !== before) writeCountInPreference(settings.countInBeats);
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
