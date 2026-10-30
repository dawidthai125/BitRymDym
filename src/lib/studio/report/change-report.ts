/**
 * Gaps P1 #7 — per-track change report (pure, deterministic, shared by Mix + Master steps).
 *
 * Diffs two project documents (before → after an auto-fix / any mix change) and, when
 * available, the measured per-track loudness before / after. Output is i18n keys + params
 * (`studio.report.items.<key>`) so BITEK can say it in the first person in PL or EN.
 */
import type { StudioTrackRole } from "@/config/studio";
import type { MixMetrics } from "@/lib/studio/mix-analysis/metrics";
import { getStudioFxParamValue, STUDIO_FX_UI_META, type StudioFxInstance, type StudioFxType } from "@/lib/studio/studio-fx-chain";
import type { StudioProjectDocument, StudioTrackDto } from "@/lib/studio/studio-types";

export type ReportParamChange = { labelPl: string; unit: string; from: number; to: number };
export type ReportItem =
  | { key: "gainUp" | "gainDown"; params: { from: number; to: number; delta: number } }
  | { key: "panMove"; params: { from: number; to: number } }
  | { key: "muted" | "unmuted"; params: Record<string, never> }
  | { key: "fxAdded" | "fxRemoved" | "fxOn" | "fxOff"; params: { fx: StudioFxType } }
  | { key: "fxChanged"; params: { fx: StudioFxType; changes: ReportParamChange[] } }
  | { key: "loudnessMeasured"; params: { from: number; to: number; delta: number } };

export type TrackChangeReport = { trackId: string; name: string; role: StudioTrackRole; items: ReportItem[] };
export type ChangeReport = { tracks: TrackChangeReport[]; changedTracks: number; totalItems: number };

const EPS_DB = 0.05;
const EPS_PAN = 0.01;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function fxDiff(a: StudioFxInstance, b: StudioFxInstance): ReportParamChange[] {
  const out: ReportParamChange[] = [];
  for (const p of STUDIO_FX_UI_META[b.type].params) {
    const from = getStudioFxParamValue(a.params, p.path);
    const to = getStudioFxParamValue(b.params, p.path);
    if (Math.abs(from - to) > Math.max(1e-6, (p.step ?? 0) / 2)) out.push({ labelPl: p.labelPl, unit: p.unit, from: r2(from), to: r2(to) });
  }
  return out;
}

function trackItems(a: StudioTrackDto, b: StudioTrackDto): ReportItem[] {
  const items: ReportItem[] = [];
  const dg = b.gainDb - a.gainDb;
  if (Math.abs(dg) > EPS_DB) items.push({ key: dg > 0 ? "gainUp" : "gainDown", params: { from: r1(a.gainDb), to: r1(b.gainDb), delta: r1(Math.abs(dg)) } });
  if (Math.abs(b.pan - a.pan) > EPS_PAN) items.push({ key: "panMove", params: { from: r2(a.pan), to: r2(b.pan) } });
  if (a.muted !== b.muted) items.push({ key: b.muted ? "muted" : "unmuted", params: {} });
  const before = new Map(a.effectsChain.effects.map((e) => [e.id, e]));
  const after = new Map(b.effectsChain.effects.map((e) => [e.id, e]));
  for (const e of b.effectsChain.effects) {
    const prev = before.get(e.id);
    if (!prev || prev.type !== e.type) {
      items.push({ key: "fxAdded", params: { fx: e.type } });
      continue;
    }
    if (prev.enabled !== e.enabled) items.push({ key: e.enabled ? "fxOn" : "fxOff", params: { fx: e.type } });
    const changes = fxDiff(prev, e);
    if (changes.length) items.push({ key: "fxChanged", params: { fx: e.type, changes } });
  }
  for (const e of a.effectsChain.effects) {
    const next = after.get(e.id);
    if (!next || next.type !== e.type) items.push({ key: "fxRemoved", params: { fx: e.type } });
  }
  return items;
}

/** What changed per track between two documents (+ measured loudness when both analyses exist). */
export function buildChangeReport(p: {
  before: StudioProjectDocument;
  after: StudioProjectDocument;
  metricsBefore?: MixMetrics | null;
  metricsAfter?: MixMetrics | null;
}): ChangeReport {
  const prevById = new Map(p.before.tracks.map((t) => [t.id, t]));
  const lufs = (m: MixMetrics | null | undefined, id: string) => {
    const t = m?.tracks.find((x) => x.trackId === id);
    return t && t.hasAudio && Number.isFinite(t.integratedLufs) ? t.integratedLufs : null;
  };
  const tracks: TrackChangeReport[] = [];
  for (const t of [...p.after.tracks].sort((x, y) => x.sortOrder - y.sortOrder)) {
    const prev = prevById.get(t.id);
    if (!prev) continue;
    const items = trackItems(prev, t);
    const lb = lufs(p.metricsBefore, t.id);
    const la = lufs(p.metricsAfter, t.id);
    if (items.length && lb !== null && la !== null && Math.abs(la - lb) >= 0.1) items.push({ key: "loudnessMeasured", params: { from: r1(lb), to: r1(la), delta: r1(la - lb) } });
    if (items.length) tracks.push({ trackId: t.id, name: t.name, role: t.trackRole, items });
  }
  return { tracks, changedTracks: tracks.length, totalItems: tracks.reduce((n, t) => n + t.items.length, 0) };
}

/** Whole-song (mastering) report: what the master did vs the approved mix. */
export type MasterReportItem =
  | { key: "loudnessUp" | "loudnessDown"; params: { from: number; to: number; delta: number } }
  | { key: "peakTamed"; params: { from: number; to: number } }
  | { key: "peakOver"; params: { to: number } }
  | { key: "dynamics"; params: { from: number; to: number } }
  | { key: "setting"; params: { setting: string; value: number } }
  | { key: "style"; params: { style: string; intensity: number } }
  | { key: "target"; params: { target: string } };

export function buildMasterReport(p: {
  mix: { lufs: number; truePeakDb: number; lraLu: number } | null;
  master: { lufs: number; truePeakDb: number; lra?: number | null };
  target: string;
  /** The user's own slider settings only — a style's offsets are reported as one "style" line. */
  settings: Record<string, number>;
  style?: { id: string; intensity: number } | null;
  tpCeiling: number;
}): MasterReportItem[] {
  const items: MasterReportItem[] = [{ key: "target", params: { target: p.target } }];
  const mx = p.mix;
  if (mx && Number.isFinite(mx.lufs) && Number.isFinite(p.master.lufs)) {
    const d = p.master.lufs - mx.lufs;
    if (Math.abs(d) >= 0.1) items.push({ key: d > 0 ? "loudnessUp" : "loudnessDown", params: { from: r1(mx.lufs), to: r1(p.master.lufs), delta: r1(Math.abs(d)) } });
  }
  if (p.master.truePeakDb > p.tpCeiling + 0.05) items.push({ key: "peakOver", params: { to: r1(p.master.truePeakDb) } });
  else if (mx && mx.truePeakDb > p.tpCeiling + 0.05) items.push({ key: "peakTamed", params: { from: r1(mx.truePeakDb), to: r1(p.master.truePeakDb) } });
  if (mx && typeof p.master.lra === "number" && Number.isFinite(p.master.lra) && Number.isFinite(mx.lraLu) && Math.abs(p.master.lra - mx.lraLu) >= 0.5)
    items.push({ key: "dynamics", params: { from: r1(mx.lraLu), to: r1(p.master.lra) } });
  if (p.style && p.style.intensity > 0) items.push({ key: "style", params: { style: p.style.id, intensity: Math.round(p.style.intensity) } });
  for (const [k, v] of Object.entries(p.settings)) if (v) items.push({ key: "setting", params: { setting: k, value: v } });
  return items;
}
