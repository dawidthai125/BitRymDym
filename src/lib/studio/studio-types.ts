import type {
  StudioClipSourceKind,
  StudioProjectStatus,
  StudioTrackType,
} from "@/config/studio";

export type StudioProjectSummary = {
  id: string;
  title: string;
  status: StudioProjectStatus;
  tempoBpm: number;
  timelineLengthMs: number;
  beatId: string | null;
  updatedAt: string;
  createdAt: string;
};

export type StudioTrackDto = {
  id: string;
  projectId: string;
  name: string;
  trackType: StudioTrackType;
  sortOrder: number;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  recordArmed: boolean;
  inputDeviceHint: string | null;
  outputRoute: string;
};

export type StudioClipDto = {
  id: string;
  trackId: string;
  sourceKind: StudioClipSourceKind;
  sourceTakeId: string | null;
  sourceBeatId: string | null;
  sourceArtifactId: string | null;
  timelineStartMs: number;
  durationMs: number;
  sourceOffsetMs: number;
  gainDb: number;
  muted: boolean;
  fadeInMs: number;
  fadeOutMs: number;
};

export type StudioProjectDocument = {
  project: StudioProjectSummary & {
    timeSignatureNum: number;
    timeSignatureDen: number;
    masterGainDb: number;
    masterPan: number;
    documentVersion: number;
    schemaVersion: number;
  };
  tracks: StudioTrackDto[];
  clips: StudioClipDto[];
};

/** Compact READY Take row for Studio place-from-library (P5.6). */
export type StudioPlaceableTakeDto = {
  id: string;
  displayTitle: string;
  beatId: string;
  durationSeconds: number | null;
  createdAt: string;
  /** True when Take belongs to the project's beat (preferred in picker). */
  sameBeat: boolean;
};
