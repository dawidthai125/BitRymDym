import type {
  StudioClipSourceKind,
  StudioProjectStatus,
  StudioTrackRole,
  StudioTrackType,
} from "@/config/studio";
import type { StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import type { StudioMarkerDto } from "@/lib/studio/studio-markers-state";

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
  /** Stage 0 — musical role (wokal główny, adlib, …). */
  trackRole: StudioTrackRole;
  sortOrder: number;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  recordArmed: boolean;
  inputDeviceHint: string | null;
  outputRoute: string;
  effectsChain: StudioFxChainV1;
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
  /** Approved Scratch DJ v1. Optional on older documents / fixtures. */
  scratchCueMs?: number;
  scratchReverse?: boolean;
  scratchRate?: number;
};

export type StudioProjectDocument = {
  project: StudioProjectSummary & {
    timeSignatureNum: number;
    timeSignatureDen: number;
    masterGainDb: number;
    masterPan: number;
    masterFxChain: StudioFxChainV1;
    documentVersion: number;
    schemaVersion: number;
  };
  tracks: StudioTrackDto[];
  clips: StudioClipDto[];
  /** A3/P7 lite. Optional on older documents until service maps the column. */
  markers?: StudioMarkerDto[];
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
