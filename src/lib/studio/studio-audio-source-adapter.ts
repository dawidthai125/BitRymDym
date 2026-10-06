/**
 * P5.10 source adapter registry.
 * Engine core must not switch on sourceKind for mix/scheduling.
 */

import type { StudioClipSourceKind } from "@/config/studio";
import type { StudioEngineClip } from "@/lib/studio/studio-audio-schedule";
import type { StudioAudioErrorCode } from "@/lib/studio/studio-audio-errors";

export type StudioResolvedSource = {
  url: string;
  expiresAt: number;
};

export type StudioSourceResolveResult =
  | { ok: true; source: StudioResolvedSource }
  | { ok: false; code: StudioAudioErrorCode };

export type StudioSourceAdapter = {
  kind: StudioClipSourceKind;
  resolve(clip: StudioEngineClip): Promise<StudioSourceResolveResult>;
};

export type StudioUrlResolver = (
  id: string,
) => Promise<StudioResolvedSource | null>;

export type StudioSourceAdapterRegistry = {
  get(kind: StudioClipSourceKind): StudioSourceAdapter | undefined;
  kinds(): StudioClipSourceKind[];
};

export function createStudioSourceAdapterRegistry(
  adapters: readonly StudioSourceAdapter[],
): StudioSourceAdapterRegistry {
  const map = new Map<StudioClipSourceKind, StudioSourceAdapter>();
  for (const adapter of adapters) {
    map.set(adapter.kind, adapter);
  }
  return {
    get(kind) {
      return map.get(kind);
    },
    kinds() {
      return [...map.keys()];
    },
  };
}

export function createBeatRefSourceAdapter(
  resolveBeatUrl: StudioUrlResolver,
): StudioSourceAdapter {
  return {
    kind: "BEAT_REF",
    async resolve(clip) {
      const beatId = clip.sourceBeatId;
      if (!beatId) {
        return { ok: false, code: "AUDIO_SOURCE_UNAVAILABLE" };
      }
      const source = await resolveBeatUrl(beatId);
      if (!source?.url) {
        return { ok: false, code: "AUDIO_SOURCE_UNAVAILABLE" };
      }
      return { ok: true, source };
    },
  };
}

export function createTakeSourceAdapter(
  resolveTakeUrl: StudioUrlResolver,
): StudioSourceAdapter {
  return {
    kind: "TAKE",
    async resolve(clip) {
      const takeId = clip.sourceTakeId;
      if (!takeId) {
        return { ok: false, code: "AUDIO_SOURCE_UNAVAILABLE" };
      }
      const source = await resolveTakeUrl(takeId);
      if (!source?.url) {
        return { ok: false, code: "AUDIO_SOURCE_UNAVAILABLE" };
      }
      return { ok: true, source };
    },
  };
}

/** Registered stub — ARTIFACT playback is not shipped in P5.10. */
export function createArtifactSourceAdapter(): StudioSourceAdapter {
  return {
    kind: "ARTIFACT",
    async resolve() {
      return { ok: false, code: "AUDIO_SOURCE_UNAVAILABLE" };
    },
  };
}

export function createDefaultStudioSourceAdapters(params: {
  resolveBeatUrl: StudioUrlResolver;
  resolveTakeUrl: StudioUrlResolver;
}): StudioSourceAdapter[] {
  return [
    createBeatRefSourceAdapter(params.resolveBeatUrl),
    createTakeSourceAdapter(params.resolveTakeUrl),
    createArtifactSourceAdapter(),
  ];
}
