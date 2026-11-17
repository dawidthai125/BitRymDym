/**
 * Nova-style technical chips from MixAutofix notes (pure).
 * Friendly BITEK copy stays in i18n; this is the Cryo-style parameter line.
 */

import type { MixAutofixNote } from "@/lib/studio/mix-autofix/plan";

export type MixTechChip = {
  /** Stable id for tests / keys. */
  id: string;
  /** Track name when the note is per-track; null for master / whole-mix. */
  track: string | null;
  /** Short technical label, e.g. "HPF 100 Hz". */
  label: string;
};

const s = (v: string | number | undefined) => (v == null ? "" : String(v));

/** One chip per note that maps to a measurable FX / control change. */
export function techChipsFromAutofixNotes(notes: readonly MixAutofixNote[]): MixTechChip[] {
  const out: MixTechChip[] = [];
  notes.forEach((n, i) => {
    const p = n.params;
    const track = typeof p.track === "string" ? p.track : null;
    const chip = (label: string) => {
      out.push({ id: `${n.key}-${i}`, track, label });
    };
    switch (n.key) {
      case "gainClipTrack":
      case "gainTrimTrack":
        chip(`gain ${s(p.db)} dB`);
        break;
      case "gainMasterDown":
      case "gainMasterUp":
        out.push({ id: `${n.key}-${i}`, track: null, label: `master ${s(p.db)} dB` });
        break;
      case "balanceVocalUp":
        out.push({ id: `${n.key}-${i}-v`, track: null, label: `vocal +${s(p.up)} dB` });
        out.push({ id: `${n.key}-${i}-b`, track: null, label: `beat −${s(p.down)} dB` });
        break;
      case "balanceVocalDown":
        out.push({ id: `${n.key}-${i}-v`, track: null, label: `vocal −${s(p.down)} dB` });
        out.push({ id: `${n.key}-${i}-b`, track: null, label: `beat +${s(p.up)} dB` });
        break;
      case "balanceSideDown":
      case "balanceSideUp":
        chip(`level ${n.key === "balanceSideUp" ? "+" : "−"}${s(p.db)} dB`);
        break;
      case "compLead":
      case "compSide":
        chip(`comp ${s(p.ratio)}:1`);
        break;
      case "eqBeatCut":
        chip(`EQ −${s(p.db)} dB @ 2.5 kHz`);
        break;
      case "eqVocalHighpass":
        chip(`HPF ${s(p.hz)} Hz`);
        break;
      case "eqVocalPresence":
        chip("EQ mud − / presence +2 dB");
        break;
      case "deesserSoft":
        chip("de-esser soft");
        break;
      case "deesserStrong":
        chip("de-esser strong");
        break;
      case "denoiseGate":
        chip(`gate ≤${s(p.db)} dB`);
        break;
      case "denoiseRumble":
        chip(`rumble HPF ${s(p.hz)} Hz`);
        break;
      case "panLeadCenter":
        chip("pan C");
        break;
      case "panLeft":
        chip(`pan L ${s(p.pct)}%`);
        break;
      case "panRight":
        chip(`pan R ${s(p.pct)}%`);
        break;
      case "spaceLead":
      case "spaceSide":
        chip(`delay ${s(p.note)} / ${s(p.ms)} ms`);
        break;
      case "pocket":
        out.push({ id: `${n.key}-${i}`, track: null, label: "pocket + duck" });
        break;
      case "rider":
        out.push({ id: `${n.key}-${i}`, track: null, label: "rider" });
        break;
      case "harmony":
        out.push({ id: `${n.key}-${i}`, track: null, label: "harmony" });
        break;
      case "voice":
        out.push({ id: `${n.key}-${i}`, track: null, label: "voice" });
        break;
      case "tune":
        out.push({ id: `${n.key}-${i}`, track: null, label: "tune light" });
        break;
      case "chainFull":
        chip("FX chain full");
        break;
      default:
        break;
    }
  });
  return out;
}

/** Group chips under track headings for the Nova log panel. */
export function groupTechChipsByTrack(chips: readonly MixTechChip[]): {
  track: string | null;
  chips: MixTechChip[];
}[] {
  const order: (string | null)[] = [];
  const map = new Map<string | null, MixTechChip[]>();
  for (const c of chips) {
    if (!map.has(c.track)) {
      map.set(c.track, []);
      order.push(c.track);
    }
    map.get(c.track)!.push(c);
  }
  return order.map((track) => ({ track, chips: map.get(track)! }));
}
