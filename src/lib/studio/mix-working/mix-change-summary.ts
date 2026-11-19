/**
 * Mix history, plain words (pure). Turns the raw field diff of two mix revisions into short Polish
 * sentences, e.g. "Wokal: głośność +3,5 → +5,5 dB", "Wokal: dodano efekt Pogłos (ilość 22%)".
 * No ids, no JSON. Track names come from the open project; unknown ids stay "Ścieżka".
 */
import type { MixWorkingFieldChange } from "@/lib/studio/mix-working/mix-working-diff";

type Chain = { effects?: Array<{ id?: string; type?: string; enabled?: boolean; params?: Record<string, unknown> }> } | null | undefined;

const EFFECT_NAME: Record<string, string> = {
  eq: "EQ",
  spectrum: "Spektrum",
  compressor: "Kompresor",
  limiter: "Limiter",
  reverb: "Pogłos",
  delay: "Echo",
  highpass: "Odcięcie dołu",
  deesser: "Ścisz syki",
  gate: "Bramka szumu",
  tune: "Strojenie",
  rider: "Wyrównanie głośności",
  harmony: "Harmonia",
  voice: "Zmiana głosu",
  saturate: "Ciepło",
  pocket: "Miejsce na rap",
  sidechain: "Ściszanie bitu pod wokal",
};

const PARAM_NAME: Record<string, string> = {
  mix: "ilość",
  decaySeconds: "czas pogłosu (s)",
  timeMs: "czas (ms)",
  feedback: "powtórzenia",
  ratio: "kompresja",
  thresholdDb: "próg (dB)",
  attackMs: "atak (ms)",
  releaseMs: "zwolnienie (ms)",
  makeupDb: "wyrównanie (dB)",
  frequencyHz: "częstotliwość (Hz)",
  gainDb: "wzmocnienie (dB)",
  q: "szerokość",
  amount: "ilość",
  color: "barwa",
  depth: "głębokość",
  drive: "ciepło",
  low: "dół",
  mid: "środek",
  high: "góra",
};

const PERCENT_KEYS = new Set(["mix", "feedback", "amount", "depth", "drive"]);

const nf = (n: number, digits = 1) => {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return (Object.is(r, -0) ? 0 : r).toString().replace(".", ",");
};
const signed = (n: number) => `${n > 0 ? "+" : ""}${nf(n)}`;

function panText(p: number): string {
  const r = Math.round(p * 100);
  if (r === 0) return "środek";
  return r < 0 ? `L${-r}` : `P${r}`;
}

function flatten(prefix: string, value: unknown, out: Record<string, number | string | boolean>): void {
  if (value === null || value === undefined) return;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    out[prefix] = value;
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) flatten(prefix ? `${prefix}.${k}` : k, v, out);
  }
}

function paramLabel(path: string): string {
  return path
    .split(".")
    .map((p) => PARAM_NAME[p] ?? p)
    .join(" · ");
}

function paramValue(path: string, v: number | string | boolean): string {
  if (typeof v === "boolean") return v ? "tak" : "nie";
  if (typeof v === "string") return v;
  const key = path.split(".").pop() ?? path;
  if (PERCENT_KEYS.has(key) && Math.abs(v) <= 1.0001) return `${Math.round(v * 100)}%`;
  return nf(v, 2);
}

function effectName(type: string | undefined): string {
  return (type && EFFECT_NAME[type]) || type || "efekt";
}

/** Effect-by-effect sentences for one track or the master. */
export function summarizeChainChange(before: Chain, after: Chain, owner: string): string[] {
  const out: string[] = [];
  const b = before?.effects ?? [];
  const a = after?.effects ?? [];
  const keyOf = (e: { id?: string; type?: string }) => e.id ?? e.type ?? "";
  const bMap = new Map(b.map((e) => [keyOf(e), e]));
  const aMap = new Map(a.map((e) => [keyOf(e), e]));
  for (const e of a) {
    const prev = bMap.get(keyOf(e));
    const name = effectName(e.type);
    if (!prev) {
      const flat: Record<string, number | string | boolean> = {};
      flatten("", e.params, flat);
      const main = Object.entries(flat)
        .filter(([k]) => k.split(".").pop() === "mix" || k === "amount" || k === "depth")
        .slice(0, 1)
        .map(([k, v]) => ` (${paramLabel(k)} ${paramValue(k, v)})`)
        .join("");
      out.push(`${owner}: dodano efekt ${name}${main}${e.enabled === false ? " (wyłączony)" : ""}`);
      continue;
    }
    if (prev.enabled !== e.enabled) {
      out.push(`${owner}: efekt ${name} ${e.enabled === false ? "wyłączony" : "włączony"}`);
    }
    const pf: Record<string, number | string | boolean> = {};
    const nf2: Record<string, number | string | boolean> = {};
    flatten("", prev.params, pf);
    flatten("", e.params, nf2);
    const diffs: string[] = [];
    for (const k of new Set([...Object.keys(pf), ...Object.keys(nf2)])) {
      if (pf[k] === nf2[k]) continue;
      if (pf[k] === undefined || nf2[k] === undefined) continue;
      diffs.push(`${paramLabel(k)} ${paramValue(k, pf[k]!)} → ${paramValue(k, nf2[k]!)}`);
    }
    if (diffs.length) {
      const shown = diffs.slice(0, 4).join(", ");
      out.push(`${owner}: ${name}: ${shown}${diffs.length > 4 ? ` i ${diffs.length - 4} więcej` : ""}`);
    }
  }
  for (const e of b) {
    if (!aMap.has(keyOf(e))) out.push(`${owner}: usunięto efekt ${effectName(e.type)}`);
  }
  if (out.length === 0) out.push(`${owner}: zmieniono kolejność lub ustawienia efektów`);
  return out;
}

export function summarizeMixChanges(changes: readonly MixWorkingFieldChange[], trackNames: Readonly<Record<string, string>> = {}): string[] {
  const out: string[] = [];
  for (const c of changes) {
    if (c.path === "project.masterGainDb" && typeof c.before === "number" && typeof c.after === "number") {
      out.push(`Master: głośność ${signed(c.before)} → ${signed(c.after)} dB`);
      continue;
    }
    if (c.path === "project.masterPan" && typeof c.before === "number" && typeof c.after === "number") {
      out.push(`Master: panorama ${panText(c.before)} → ${panText(c.after)}`);
      continue;
    }
    if (c.path === "project.masterFxChain") {
      out.push(...summarizeChainChange(c.before as Chain, c.after as Chain, "Master"));
      continue;
    }
    const m = /^tracks\.([^.]+)\.(gainDb|pan|muted|solo|effectsChain)$/.exec(c.path);
    if (!m) {
      out.push(c.path);
      continue;
    }
    const name = trackNames[m[1]!] ?? "Ścieżka";
    const field = m[2]!;
    if (field === "gainDb" && typeof c.before === "number" && typeof c.after === "number") {
      out.push(`${name}: głośność ${signed(c.before)} → ${signed(c.after)} dB (${signed(c.after - c.before)})`);
    } else if (field === "pan" && typeof c.before === "number" && typeof c.after === "number") {
      out.push(`${name}: panorama ${panText(c.before)} → ${panText(c.after)}`);
    } else if (field === "muted") {
      out.push(`${name}: ${c.after ? "wyciszony" : "dźwięk włączony"}`);
    } else if (field === "solo") {
      out.push(`${name}: solo ${c.after ? "włączone" : "wyłączone"}`);
    } else {
      out.push(...summarizeChainChange(c.before as Chain, c.after as Chain, name));
    }
  }
  return out;
}
