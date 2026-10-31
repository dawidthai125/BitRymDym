/**
 * How many LU the master may move to reach a loudness target.
 *
 * The loudness fader is NOT this step. It is an offset on the target
 * (−3…+3, see MASTER_SETTING_MAX). Makeup the renderer applies is
 * (target LUFS + offset) − measured LUFS. Adding the raw gap onto the
 * fader and clamping it to +3 is what made “−18 → −14” show up as +3.
 *
 * True peak only limits the step when the full gap would pass the ceiling.
 * The limiter in masterPreview holds the peak at that ceiling either way.
 */

export type MasterLoudnessLimit = "truePeak" | "knob";

export type MasterLoudnessDecision = {
  /** LU actually applied (target − measured, after limits). */
  step: number;
  /** targetLufs − measuredLufs, before limits. */
  ideal: number;
  /** Loudness fader to set (−3…+3) so the renderer’s goal matches `step`. */
  offset: number;
  changesKnob: boolean;
  limit: MasterLoudnessLimit | null;
  /** True peak if the full ideal step were applied. Null when we are turning down or have no peak. */
  predictedPeakDb: number | null;
  reply: string;
};

const KNOB_MIN = -3;
const KNOB_MAX = 3;

const roundHalf = (n: number) => Math.round(n * 2) / 2;
/** Largest 0.5 step that does not exceed `n` (n ≥ 0). */
const floorHalf = (n: number) => Math.floor(n * 2 + 1e-9) / 2;

const fmtSigned = (n: number) => `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${Math.abs(roundHalf(n))}`;
const fmtPlain = (n: number) => `${n < 0 ? "\u2212" : ""}${Math.abs(roundHalf(n))}`;

export function planMasterLoudnessStep(input: {
  measuredLufs: number;
  targetLufs: number;
  truePeakDb: number | null;
  ceilingDb: number;
}): { step: number; ideal: number; limit: "truePeak" | null; predictedPeakDb: number | null } {
  const ideal = roundHalf(input.targetLufs - input.measuredLufs);
  if (ideal <= 0 || input.truePeakDb === null || !Number.isFinite(input.truePeakDb)) {
    return { step: ideal, ideal, limit: null, predictedPeakDb: null };
  }
  const predictedPeakDb = roundHalf(input.truePeakDb + ideal);
  const headroom = input.ceilingDb - input.truePeakDb;
  if (ideal <= headroom + 1e-9) {
    return { step: ideal, ideal, limit: null, predictedPeakDb };
  }
  const step = Math.max(0, floorHalf(headroom));
  return { step, ideal, limit: "truePeak", predictedPeakDb };
}

export function resolveMasterLoudness(input: {
  measuredLufs: number;
  targetLufs: number;
  truePeakDb: number | null;
  ceilingDb: number;
  currentOffset: number;
  lang: "pl" | "en";
  /** Grammatical name, e.g. "streamingu" / "streaming". */
  targetName: string;
}): MasterLoudnessDecision {
  const acoustic = planMasterLoudnessStep(input);
  const rawOffset = roundHalf(acoustic.step - acoustic.ideal);
  const offset = Math.min(KNOB_MAX, Math.max(KNOB_MIN, rawOffset));
  const knobLimited = offset !== rawOffset;
  const step = knobLimited ? roundHalf(acoustic.ideal + offset) : acoustic.step;
  const limit: MasterLoudnessLimit | null = acoustic.limit ?? (knobLimited ? "knob" : null);
  const current = roundHalf(input.currentOffset);
  const changesKnob = offset !== current;
  const reply = formatMasterLoudnessReply({
    lang: input.lang,
    targetName: input.targetName,
    measuredLufs: input.measuredLufs,
    targetLufs: input.targetLufs,
    truePeakDb: input.truePeakDb,
    ceilingDb: input.ceilingDb,
    ideal: acoustic.ideal,
    step,
    predictedPeakDb: acoustic.predictedPeakDb,
    limit,
    currentOffset: current,
    offset,
    changesKnob,
  });
  return {
    step,
    ideal: acoustic.ideal,
    offset,
    changesKnob,
    limit,
    predictedPeakDb: acoustic.predictedPeakDb,
    reply,
  };
}

function formatMasterLoudnessReply(p: {
  lang: "pl" | "en";
  targetName: string;
  measuredLufs: number;
  targetLufs: number;
  truePeakDb: number | null;
  ceilingDb: number;
  ideal: number;
  step: number;
  predictedPeakDb: number | null;
  limit: MasterLoudnessLimit | null;
  currentOffset: number;
  offset: number;
  changesKnob: boolean;
}): string {
  const pl = p.lang === "pl";
  const measured = fmtPlain(p.measuredLufs);
  const target = fmtPlain(p.targetLufs);
  const knob = p.changesKnob
    ? pl
      ? ` Suwak głośności: ${fmtSigned(p.currentOffset)} → ${fmtSigned(p.offset)}.`
      : ` Loudness fader: ${fmtSigned(p.currentOffset)} → ${fmtSigned(p.offset)}.`
    : pl
      ? ` Suwak głośności zostaje na ${fmtSigned(p.currentOffset)}.`
      : ` The loudness fader stays at ${fmtSigned(p.currentOffset)}.`;

  if (p.limit === "truePeak" && p.truePeakDb !== null && p.predictedPeakDb !== null) {
    const peak = fmtPlain(p.truePeakDb);
    const ceiling = fmtPlain(p.ceilingDb);
    const predicted = fmtPlain(p.predictedPeakDb);
    return pl
      ? `Pomiar całości to ${measured} LUFS, cel ${p.targetName} to ${target}, czyli brakuje ${fmtSigned(p.ideal)} LU. Podnoszę o ${fmtSigned(p.step)}, nie ${fmtSigned(p.ideal)}, bo szczyt jest ${peak} dBTP, a sufit ${ceiling}. Pełne ${fmtSigned(p.ideal)} doszłoby do ${predicted} dBTP — resztę ściąłby limiter.${knob}`
      : `The song measures ${measured} LUFS and the ${p.targetName} target is ${target}, so the gap is ${fmtSigned(p.ideal)} LU. I'm raising it by ${fmtSigned(p.step)}, not ${fmtSigned(p.ideal)}, because the peak is ${peak} dBTP and the ceiling is ${ceiling}. The full ${fmtSigned(p.ideal)} would land at ${predicted} dBTP — the limiter would shave the rest.${knob}`;
  }
  if (p.limit === "knob") {
    return pl
      ? `Pomiar całości to ${measured} LUFS, cel ${p.targetName} to ${target}, czyli brakuje ${fmtSigned(p.ideal)} LU. Ustawiam suwak na ${fmtSigned(p.offset)}, nie na ${fmtSigned(p.ideal)}, bo kończy się na ${fmtSigned(p.offset > 0 ? KNOB_MAX : KNOB_MIN)}. Zostaje ${fmtSigned(p.step)} LU.`
      : `The song measures ${measured} LUFS and the ${p.targetName} target is ${target}, so the gap is ${fmtSigned(p.ideal)} LU. I'm setting the fader to ${fmtSigned(p.offset)}, not ${fmtSigned(p.ideal)}, because it stops at ${fmtSigned(p.offset > 0 ? KNOB_MAX : KNOB_MIN)}. That leaves ${fmtSigned(p.step)} LU.`;
  }
  if (p.step < 0) {
    return pl
      ? `Pomiar całości to ${measured} LUFS, a cel ${p.targetName} to ${target}. Ściszam o ${Math.abs(p.step)} LU, do ${target}. W dół limiter nie wchodzi.${knob}`
      : `The song measures ${measured} LUFS and the ${p.targetName} target is ${target}. I'm turning it down by ${Math.abs(p.step)} LU, to ${target}. Turning down doesn't hit the limiter.${knob}`;
  }
  if (p.step === 0) {
    return pl
      ? `Pomiar całości to ${measured} LUFS i cel ${p.targetName} (${target}) już się zgadza. Suwaka nie ruszam.`
      : `The song measures ${measured} LUFS and the ${p.targetName} target (${target}) already matches. I'm not moving the fader.`;
  }
  const peakNote =
    p.truePeakDb !== null
      ? pl
        ? ` Szczyt ${fmtPlain(p.truePeakDb)} dBTP ma zapas do sufitu ${fmtPlain(p.ceilingDb)}, więc limiter tego nie ścina.`
        : ` The peak ${fmtPlain(p.truePeakDb)} dBTP has room under the ${fmtPlain(p.ceilingDb)} ceiling, so the limiter won't shave it.`
      : "";
  return pl
    ? `Pomiar całości to ${measured} LUFS, cel ${p.targetName} to ${target}. Podnoszę o ${fmtSigned(p.step)} LU, do ${target}.${peakNote}${knob}`
    : `The song measures ${measured} LUFS and the ${p.targetName} target is ${target}. I'm raising it by ${fmtSigned(p.step)} LU, to ${target}.${peakNote}${knob}`;
}
