/**
 * Gaps P0 #4 — "Zostaw / Cofnij" decisions on applied BITEK changes.
 * Stored as BITEK store rows kind "note" with meta.bitekChange (project
 * memory) or in sessionStorage (session memory). The latest decision row
 * per reply wins; the latest applied/kept change feeds `lastChange`.
 */
import type { BitekStoredMessage } from "@/lib/studio/bitek/store/messages";

import { BITEK_LIMITS, BITEK_MASTER_REF, type BitekChange, type BitekProposalParam } from "./types";

export type BitekDecision = "applied" | "kept" | "undone";

export type BitekStoredChange = {
  /** Proposal index within the reply. */
  i: number;
  /** Real track id, or "master" (stable across track reorder, unlike refs). */
  target: string;
  param: BitekProposalParam;
  from: number | boolean;
  to: number | boolean;
};

export type BitekChangeMeta = { entryId: string; decision: BitekDecision; changes: BitekStoredChange[] };

const DECISIONS: ReadonlySet<string> = new Set(["applied", "kept", "undone"]);

export function readBitekChangeMeta(m: BitekStoredMessage): BitekChangeMeta | null {
  if (m.kind !== "note") return null;
  const raw = (m.meta as { bitekChange?: unknown }).bitekChange;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.entryId !== "string" || typeof r.decision !== "string" || !DECISIONS.has(r.decision) || !Array.isArray(r.changes)) {
    return null;
  }
  const changes = r.changes
    .filter((c): c is BitekStoredChange => {
      if (!c || typeof c !== "object") return false;
      const x = c as Record<string, unknown>;
      const okVal = (v: unknown) => typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
      return typeof x.i === "number" && typeof x.target === "string" && typeof x.param === "string" && okVal(x.from) && okVal(x.to);
    })
    .slice(0, BITEK_LIMITS.maxProposals);
  return { entryId: r.entryId, decision: r.decision as BitekDecision, changes };
}

export const isBitekDecisionNote = (m: BitekStoredMessage) => readBitekChangeMeta(m) !== null;

/** Latest decision per reply id. */
export function bitekDecisionsByEntry(messages: readonly BitekStoredMessage[]): Map<string, BitekChangeMeta> {
  const out = new Map<string, BitekChangeMeta>();
  for (const m of messages) {
    const meta = readBitekChangeMeta(m);
    if (meta) out.set(meta.entryId, meta);
  }
  return out;
}

/** The change relative asks refer to: the newest decision row, unless it was undone. */
export function lastBitekChange(messages: readonly BitekStoredMessage[]): BitekChangeMeta | null {
  for (let k = messages.length - 1; k >= 0; k -= 1) {
    const meta = readBitekChangeMeta(messages[k]);
    if (!meta) continue;
    return meta.decision === "undone" || meta.changes.length === 0 ? null : meta;
  }
  return null;
}

/** Stored change (track ids) → model-facing lastChange (refs of the current doc). */
export function toContextLastChange(meta: BitekChangeMeta | null, trackIdByRef: Record<string, string>): BitekChange[] | null {
  if (!meta) return null;
  const refById = new Map(Object.entries(trackIdByRef).map(([ref, id]) => [id, ref] as const));
  const out: BitekChange[] = [];
  for (const c of meta.changes) {
    const trackRef = c.target === BITEK_MASTER_REF ? BITEK_MASTER_REF : refById.get(c.target);
    if (!trackRef) continue;
    out.push({ trackRef, param: c.param, from: c.from, to: c.to });
  }
  return out.length ? out : null;
}
