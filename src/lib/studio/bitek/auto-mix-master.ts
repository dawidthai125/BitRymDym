/**
 * Gold-only BITEK AUTO MIX-MASTERING.
 * The switch is local. The mix and the master still go through the existing
 * autofix and the existing master render. Nothing here starts by itself:
 * the studio starts a run only after the user clicks.
 */

import { bitekAutoMixMasterForTier } from "@/config/plan-policy";
import type { PremiumTier } from "@/types/premium";

const OPTION_KEY = "brd.bitek.autoMixMaster.v1";
const MIX_KEY = "brd.bitek.autoMix.v1";
const MASTER_KEY = "brd.bitek.autoMaster.v1";
const MAX_AGE_MS = 15 * 60 * 1000;

/** Two measured passes, same cap as the mix step giving up after two rounds. */
export const AUTO_MIX_MAX_ROUNDS = 2;

const VOCAL_ROLES = new Set(["lead_vocal", "adlib", "double", "backing"]);

export type AutoMixMaterialInput = {
  beatId?: string | null;
  tracks: readonly { id: string; trackType?: string | null; trackRole?: string | null }[];
  clips: readonly { trackId: string; durationMs: number }[];
};

export type AutoMixMaterial = { vocal: boolean; beat: boolean; ready: boolean };

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const optionListeners = new Set<() => void>();

function emitOption(): void {
  for (const listener of optionListeners) listener();
}

function browserLocal(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function browserSession(): StorageLike | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

/** Stored "1" counts only on Gold. Any other tier is off. */
export function bitekAutoMixMasterEnabled(tier: PremiumTier, stored: string | null): boolean {
  return bitekAutoMixMasterForTier(tier) && stored === "1";
}

export function subscribeBitekAutoMixMaster(listener: () => void): () => void {
  optionListeners.add(listener);
  return () => optionListeners.delete(listener);
}

export function readBitekAutoMixMaster(tier: PremiumTier, storage: StorageLike | null = browserLocal()): boolean {
  let stored: string | null = null;
  try {
    stored = storage?.getItem(OPTION_KEY) ?? null;
  } catch {
    stored = null;
  }
  return bitekAutoMixMasterEnabled(tier, stored);
}

export function writeBitekAutoMixMaster(enabled: boolean, storage: StorageLike | null = browserLocal()): void {
  try {
    storage?.setItem(OPTION_KEY, enabled ? "1" : "0");
    emitOption();
  } catch {
    // Private mode — the switch still flips for this render via the caller.
  }
}

function clipOn(input: AutoMixMaterialInput, trackId: string): boolean {
  return input.clips.some((clip) => clip.trackId === trackId && clip.durationMs > 0);
}

/** Raw vocal (lead, else ad-lib / double / backing) plus a beat. */
export function autoMixMasterMaterial(input: AutoMixMaterialInput): AutoMixMaterial {
  const vocal = input.tracks.some((track) => track.trackRole != null && VOCAL_ROLES.has(track.trackRole) && clipOn(input, track.id));
  const beat =
    Boolean(input.beatId) ||
    input.tracks.some(
      (track) =>
        (track.trackType === "BEAT" || track.trackRole === "beat" || track.trackRole === "instrument") &&
        clipOn(input, track.id),
    );
  return { vocal, beat, ready: vocal && beat };
}

export function autoMixRecordOffer(input: {
  enabled: boolean;
  recording: boolean;
  vocal: boolean;
  beat: boolean;
}): "hidden" | "need-both" | "need-vocal" | "need-beat" | "ready" {
  if (!input.enabled || input.recording) return "hidden";
  if (input.vocal && input.beat) return "ready";
  if (!input.vocal && !input.beat) return "need-both";
  if (!input.vocal) return "need-vocal";
  return "need-beat";
}

export type AutoMixStep = "wait" | "analyze" | "fix" | "ask" | "stop";

/** What the mix step does on the next tick of one auto run. */
export function nextAutoMixStep(input: {
  hasFreshAnalysis: boolean;
  running: boolean;
  fixing: boolean;
  canApply: boolean;
  opsLeft: number;
  fixSeq: number;
  failed: boolean;
}): AutoMixStep {
  if (input.failed) return "stop";
  if (input.running || input.fixing) return "wait";
  if (!input.hasFreshAnalysis) return "analyze";
  if (!input.canApply || input.fixSeq >= AUTO_MIX_MAX_ROUNDS || input.opsLeft <= 0) return "ask";
  return "fix";
}

export type AutoMasterStep = "wait" | "apply-clarity" | "master" | "stop";

/**
 * Master render starts only after the mix bounce, a fresh preview and the
 * server quota check. Clarity moves land first, then one makeMaster.
 */
export function nextAutoMasterStep(input: {
  phase: "clarity" | "commit";
  mixReady: boolean;
  previewFresh: boolean;
  serverLoaded: boolean;
  blocked: boolean;
  hasClarityMoves: boolean;
}): AutoMasterStep {
  if (!input.mixReady || !input.previewFresh || !input.serverLoaded) return "wait";
  if (input.blocked) return "stop";
  if (input.phase === "clarity" && input.hasClarityMoves) return "apply-clarity";
  return "master";
}

type Handoff = { projectId: string; at: number };

function readHandoff(key: string, projectId: string, storage: StorageLike | null, now: number): Handoff | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Handoff>;
    if (parsed.projectId !== projectId) return null;
    if (typeof parsed.at !== "number" || now - parsed.at > MAX_AGE_MS || parsed.at > now + 60_000) return null;
    return { projectId, at: parsed.at };
  } catch {
    return null;
  }
}

function writeHandoff(key: string, projectId: string, storage: StorageLike | null, at: number): void {
  try {
    storage?.setItem(key, JSON.stringify({ projectId, at }));
  } catch {
    // ignore
  }
}

export function saveAutoMixHandoff(projectId: string, at = Date.now(), storage: StorageLike | null = browserSession()): void {
  writeHandoff(MIX_KEY, projectId, storage, at);
}

export function readAutoMixHandoff(projectId: string, now = Date.now(), storage: StorageLike | null = browserSession()): Handoff | null {
  return readHandoff(MIX_KEY, projectId, storage, now);
}

export function clearAutoMixHandoff(storage: StorageLike | null = browserSession()): void {
  try {
    storage?.removeItem(MIX_KEY);
  } catch {
    // ignore
  }
}

export function saveAutoMasterHandoff(projectId: string, at = Date.now(), storage: StorageLike | null = browserSession()): void {
  writeHandoff(MASTER_KEY, projectId, storage, at);
}

export function readAutoMasterHandoff(projectId: string, now = Date.now(), storage: StorageLike | null = browserSession()): Handoff | null {
  return readHandoff(MASTER_KEY, projectId, storage, now);
}

export function clearAutoMasterHandoff(storage: StorageLike | null = browserSession()): void {
  try {
    storage?.removeItem(MASTER_KEY);
  } catch {
    // ignore
  }
}
