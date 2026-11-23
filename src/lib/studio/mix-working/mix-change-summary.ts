/**
 * Mix history, plain words (pure). Turns the raw field diff of two mix revisions into short Polish
 * sentences, e.g. "Wokal: głośność +3,5 → +5,5 dB", "Wokal: dodano efekt Pogłos (ilość 22%)".
 * No ids, no JSON. Track names come from the open project; unknown ids stay "Ścieżka".
 */
import { STUDIO_FX_UI_META, type StudioFxType } from "@/lib/studio/studio-fx-chain";
import type { MixWorkingFieldChange } from "@/lib/studio/mix-working/mix-working-diff";

type Chain = { effects?: Array<{ id?: string; type?: string; enabled?: boolean; params?: Record<string, unknown> }> } | null | undefined;

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

const PARAM_NAME_EN: Record<string, string> = {
  mix: "amount", decaySeconds: "reverb time (s)", timeMs: "time (ms)", feedback: "repeats", ratio: "compression",
  thresholdDb: "threshold (dB)", attackMs: "attack (ms)", releaseMs: "release (ms)", makeupDb: "make-up (dB)",
  frequencyHz: "frequency (Hz)", gainDb: "gain (dB)", q: "width", amount: "amount", color: "color", depth: "depth",
  drive: "warmth", low: "low", mid: "mid", high: "high",
};

/** Language of the sentences; `label` translates the effect names of the editor (lib-text in the UI). */
export type ChangeTextOptions = { lang?: "pl" | "en"; label?: (pl: string) => string };

const WORDS = {
  pl: {
    volume: "głośność", pan: "panorama", centre: "środek", left: "L", right: "P", added: "dodano efekt", removed: "usunięto efekt",
    off: "wyłączony", on: "włączony", effect: "efekt", yes: "tak", no: "nie", more: (n: number) => ` i ${n} więcej`,
    order: "zmieniono kolejność lub ustawienia efektów", track: "Ścieżka", muted: "wyciszony", unmuted: "dźwięk włączony",
    soloOn: "solo włączone", soloOff: "solo wyłączone",
  },
  en: {
    volume: "volume", pan: "pan", centre: "centre", left: "L", right: "R", added: "added effect", removed: "removed effect",
    off: "off", on: "on", effect: "effect", yes: "yes", no: "no", more: (n: number) => ` and ${n} more`,
    order: "effect order or settings changed", track: "Track", muted: "muted", unmuted: "unmuted",
    soloOn: "solo on", soloOff: "solo off",
  },
} as const;

const PERCENT_KEYS = new Set(["mix", "feedback", "amount", "depth", "drive"]);

type Text = { w: (typeof WORDS)["pl" | "en"]; lang: "pl" | "en"; label: (pl: string) => string };

const textOf = (o: ChangeTextOptions | undefined): Text => {
  const lang = o?.lang ?? "pl";
  return { w: WORDS[lang], lang, label: o?.label ?? ((x) => x) };
};

const nf = (n: number, x: Text, digits = 1) => {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  const text = (Object.is(r, -0) ? 0 : r).toString();
  return x.lang === "en" ? text : text.replace(".", ",");
};
const signed = (n: number, x: Text) => `${n > 0 ? "+" : ""}${nf(n, x)}`;

function panText(p: number, x: Text): string {
  const r = Math.round(p * 100);
  if (r === 0) return x.w.centre;
  return r < 0 ? `${x.w.left}${-r}` : `${x.w.right}${r}`;
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

function paramLabel(path: string, x: Text): string {
  const names = x.lang === "en" ? PARAM_NAME_EN : PARAM_NAME;
  return path
    .split(".")
    .map((p) => names[p] ?? p)
    .join(" · ");
}

function paramValue(path: string, v: number | string | boolean, x: Text): string {
  if (typeof v === "boolean") return v ? x.w.yes : x.w.no;
  if (typeof v === "string") return v;
  const key = path.split(".").pop() ?? path;
  if (PERCENT_KEYS.has(key) && Math.abs(v) <= 1.0001) return `${Math.round(v * 100)}%`;
  return nf(v, x, 2);
}

/** The same names as in the effects editor. */
function effectName(type: string | undefined, x: Text): string {
  const meta = type ? STUDIO_FX_UI_META[type as StudioFxType] : undefined;
  return meta ? x.label(meta.labelPl) : type || x.w.effect;
}

/** Effect-by-effect sentences for one track or the master. */
export function summarizeChainChange(before: Chain, after: Chain, owner: string, options?: ChangeTextOptions): string[] {
  const x = textOf(options);
  const out: string[] = [];
  const b = before?.effects ?? [];
  const a = after?.effects ?? [];
  const keyOf = (e: { id?: string; type?: string }) => e.id ?? e.type ?? "";
  const bMap = new Map(b.map((e) => [keyOf(e), e]));
  const aMap = new Map(a.map((e) => [keyOf(e), e]));
  for (const e of a) {
    const prev = bMap.get(keyOf(e));
    const name = effectName(e.type, x);
    if (!prev) {
      const flat: Record<string, number | string | boolean> = {};
      flatten("", e.params, flat);
      const main = Object.entries(flat)
        .filter(([k]) => k.split(".").pop() === "mix" || k === "amount" || k === "depth")
        .slice(0, 1)
        .map(([k, v]) => ` (${paramLabel(k, x)} ${paramValue(k, v, x)})`)
        .join("");
      out.push(`${owner}: ${x.w.added} ${name}${main}${e.enabled === false ? ` (${x.w.off})` : ""}`);
      continue;
    }
    if (prev.enabled !== e.enabled) {
      out.push(`${owner}: ${x.w.effect} ${name} ${e.enabled === false ? x.w.off : x.w.on}`);
    }
    const pf: Record<string, number | string | boolean> = {};
    const nf2: Record<string, number | string | boolean> = {};
    flatten("", prev.params, pf);
    flatten("", e.params, nf2);
    const diffs: string[] = [];
    for (const k of new Set([...Object.keys(pf), ...Object.keys(nf2)])) {
      if (pf[k] === nf2[k]) continue;
      if (pf[k] === undefined || nf2[k] === undefined) continue;
      diffs.push(`${paramLabel(k, x)} ${paramValue(k, pf[k]!, x)} → ${paramValue(k, nf2[k]!, x)}`);
    }
    if (diffs.length) {
      const shown = diffs.slice(0, 4).join(", ");
      out.push(`${owner}: ${name}: ${shown}${diffs.length > 4 ? x.w.more(diffs.length - 4) : ""}`);
    }
  }
  for (const e of b) {
    if (!aMap.has(keyOf(e))) out.push(`${owner}: ${x.w.removed} ${effectName(e.type, x)}`);
  }
  if (out.length === 0) out.push(`${owner}: ${x.w.order}`);
  return out;
}

export function summarizeMixChanges(changes: readonly MixWorkingFieldChange[], trackNames: Readonly<Record<string, string>> = {}, options?: ChangeTextOptions): string[] {
  const x = textOf(options);
  const out: string[] = [];
  for (const c of changes) {
    if (c.path === "project.masterGainDb" && typeof c.before === "number" && typeof c.after === "number") {
      out.push(`Master: ${x.w.volume} ${signed(c.before, x)} → ${signed(c.after, x)} dB`);
      continue;
    }
    if (c.path === "project.masterPan" && typeof c.before === "number" && typeof c.after === "number") {
      out.push(`Master: ${x.w.pan} ${panText(c.before, x)} → ${panText(c.after, x)}`);
      continue;
    }
    if (c.path === "project.masterFxChain") {
      out.push(...summarizeChainChange(c.before as Chain, c.after as Chain, "Master", options));
      continue;
    }
    const m = /^tracks\.([^.]+)\.(gainDb|pan|muted|solo|effectsChain)$/.exec(c.path);
    if (!m) {
      out.push(c.path);
      continue;
    }
    const name = trackNames[m[1]!] ?? x.w.track;
    const field = m[2]!;
    if (field === "gainDb" && typeof c.before === "number" && typeof c.after === "number") {
      out.push(`${name}: ${x.w.volume} ${signed(c.before, x)} → ${signed(c.after, x)} dB (${signed(c.after - c.before, x)})`);
    } else if (field === "pan" && typeof c.before === "number" && typeof c.after === "number") {
      out.push(`${name}: ${x.w.pan} ${panText(c.before, x)} → ${panText(c.after, x)}`);
    } else if (field === "muted") {
      out.push(`${name}: ${c.after ? x.w.muted : x.w.unmuted}`);
    } else if (field === "solo") {
      out.push(`${name}: ${c.after ? x.w.soloOn : x.w.soloOff}`);
    } else {
      out.push(...summarizeChainChange(c.before as Chain, c.after as Chain, name, options));
    }
  }
  return out;
}
