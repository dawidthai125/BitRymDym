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
  /** Short technical label, e.g. "odcięcie dołu 100 Hz". */
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
        // The notes carry the size only; a trim always goes down.
        chip(`głośność −${s(p.db)} dB`);
        break;
      case "gainMasterDown":
      case "gainMasterUp":
        out.push({ id: `${n.key}-${i}`, track: null, label: `master ${n.key === "gainMasterUp" ? "+" : "−"}${s(p.db)} dB` });
        break;
      case "balanceVocalUp":
        out.push({ id: `${n.key}-${i}-v`, track: null, label: `wokal +${s(p.up)} dB` });
        out.push({ id: `${n.key}-${i}-b`, track: null, label: `bit −${s(p.down)} dB` });
        break;
      case "balanceVocalDown":
        out.push({ id: `${n.key}-${i}-v`, track: null, label: `wokal −${s(p.down)} dB` });
        out.push({ id: `${n.key}-${i}-b`, track: null, label: `bit +${s(p.up)} dB` });
        break;
      case "balanceVocalOnlyUp":
        out.push({ id: `${n.key}-${i}-v`, track: null, label: `wokal +${s(p.up)} dB` });
        break;
      case "balanceVocalOnlyDown":
        out.push({ id: `${n.key}-${i}-v`, track: null, label: `wokal −${s(p.down)} dB` });
        break;
      case "balanceBeatOnlyDown":
        out.push({ id: `${n.key}-${i}-b`, track: null, label: `bit −${s(p.down)} dB` });
        break;
      case "balanceSideDown":
      case "balanceSideUp":
        chip(`poziom ${n.key === "balanceSideUp" ? "+" : "−"}${s(p.db)} dB`);
        break;
      case "compLead":
      case "compSide":
        chip(`kompresja ${s(p.ratio)}:1`);
        break;
      case "duck":
        out.push({ id: `${n.key}-${i}`, track: null, label: "bit −2.5 dB pod wokalem" });
        break;
      case "eqBeatCut":
        chip(`EQ −${s(p.db)} dB @ 2.5 kHz`);
        break;
      case "eqVocalHighpass":
        chip(`odcięcie dołu ${s(p.hz)} Hz`);
        break;
      case "eqMud":
        chip(`EQ −${s(p.db)} dB @ 200–350 Hz`);
        break;
      case "eqVocalPresence":
        chip("EQ: mniej mułu, +2 dB blasku");
        break;
      case "deesserSoft":
        chip("sybilanty delikatnie");
        break;
      case "deesserStrong":
        chip("sybilanty mocno");
        break;
      case "denoiseGate":
        chip(`bramka szumu ≤${s(p.db)} dB`);
        break;
      case "denoiseRumble":
        chip(`odcięcie dudnienia ${s(p.hz)} Hz`);
        break;
      case "panLeadCenter":
        chip("panorama: środek");
        break;
      case "panLeft":
        chip(`panorama: lewo ${s(p.pct)}%`);
        break;
      case "panRight":
        chip(`panorama: prawo ${s(p.pct)}%`);
        break;
      case "spaceLead":
      case "spaceSide":
        chip(`echo ${s(p.note)} / ${s(p.ms)} ms`);
        break;
      case "pocket":
        out.push({ id: `${n.key}-${i}`, track: null, label: "kieszeń + ściszanie bitu pod wokal" });
        break;
      case "rider":
        out.push({ id: `${n.key}-${i}`, track: null, label: "wyrównanie głośności wokalu" });
        break;
      case "harmony":
        out.push({ id: `${n.key}-${i}`, track: null, label: "harmonia" });
        break;
      case "voice":
        out.push({ id: `${n.key}-${i}`, track: null, label: "zmiana głosu" });
        break;
      case "tune":
        out.push({ id: `${n.key}-${i}`, track: null, label: "lekki pitch" });
        break;
      case "chainFull":
        chip("limit efektów na ścieżce");
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
