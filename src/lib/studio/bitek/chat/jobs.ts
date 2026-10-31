import {
  BITEK_MASTER_STYLES,
  BITEK_MASTER_TARGETS,
  BITEK_MIX_FIXES,
  BITEK_TRACK_FX,
  BITEK_TUNE_ROLES,
  type BitekChatContext,
  type BitekJob,
  type BitekLang,
  type BitekMasterStyle,
  type BitekMasterTarget,
  type BitekMixFixId,
  type BitekTrackFx,
} from "./types";

const VOCAL_ONLY: readonly BitekTrackFx[] = ["compressor", "highpass", "deesser", "gate"];

const FX_NAME: Record<BitekLang, Record<BitekTrackFx, string>> = {
  pl: { eq: "EQ", compressor: "kompresor", highpass: "filtr dolny", deesser: "de-esser", gate: "bramka" },
  en: { eq: "EQ", compressor: "compressor", highpass: "low cut", deesser: "de-esser", gate: "gate" },
};

const FIX_NAME: Record<BitekLang, Record<BitekMixFixId, string>> = {
  pl: {
    gain: "głośność",
    balance: "balans wokal/bit",
    compression: "kompresja",
    eq: "EQ",
    deesser: "sybilanty",
    denoise: "szum",
    panorama: "panorama",
    space: "przestrzeń",
  },
  en: {
    gain: "level",
    balance: "vocal/beat balance",
    compression: "compression",
    eq: "EQ",
    deesser: "sibilance",
    denoise: "noise",
    panorama: "panning",
    space: "space",
  },
};

const STYLE_NAME: Record<BitekLang, Record<BitekMasterStyle, string>> = {
  pl: { warm: "ciepły", bright: "jasny", loud: "głośny", dynamic: "dynamiczny" },
  en: { warm: "warm", bright: "bright", loud: "loud", dynamic: "dynamic" },
};

function isFix(v: unknown): v is BitekMixFixId {
  return typeof v === "string" && (BITEK_MIX_FIXES as readonly string[]).includes(v);
}
function isFx(v: unknown): v is BitekTrackFx {
  return typeof v === "string" && (BITEK_TRACK_FX as readonly string[]).includes(v);
}
function isStyle(v: unknown): v is BitekMasterStyle {
  return typeof v === "string" && (BITEK_MASTER_STYLES as readonly string[]).includes(v);
}
function isTarget(v: unknown): v is BitekMasterTarget {
  return typeof v === "string" && (BITEK_MASTER_TARGETS as readonly string[]).includes(v);
}

const TARGET_NAME: Record<BitekLang, Record<BitekMasterTarget, string>> = {
  pl: { streaming: "streaming (−14 LUFS)", youtube: "YouTube (−14 LUFS)", headphones: "słuchawki (−16 LUFS)", club: "klub (−9 LUFS)" },
  en: { streaming: "streaming (−14 LUFS)", youtube: "YouTube (−14 LUFS)", headphones: "headphones (−16 LUFS)", club: "club (−9 LUFS)" },
};

/** Drop jobs that do not match the current project. Labels are rebuilt here. */
export function validateBitekJobs(raw: unknown, ctx: BitekChatContext): BitekJob[] {
  if (!Array.isArray(raw) || ctx.step === "record") return [];
  const lang = ctx.lang;
  const out: BitekJob[] = [];
  for (const item of raw) {
    if (out.length >= 1) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (r.kind === "mixFix") {
      if (ctx.step !== "mix" || !ctx.analysis || ctx.analysis.stale) continue;
      if (!ctx.tracks.some((t) => t.hasAudio !== false)) continue;
      const fixes: BitekMixFixId[] = [];
      const list = Array.isArray(r.fixes) ? r.fixes : [];
      for (const f of list) {
        if (fixes.length >= 4 || !isFix(f) || fixes.includes(f)) continue;
        fixes.push(f);
      }
      if (!fixes.length) continue;
      const names = fixes.map((f) => FIX_NAME[lang][f]).join(", ");
      out.push({
        kind: "mixFix",
        fixes,
        label: lang === "pl" ? `Popraw z pomiaru: ${names}` : `Fix from the measurement: ${names}`,
      });
      continue;
    }
    if (r.kind === "trackFx") {
      if (ctx.step !== "mix" || typeof r.trackRef !== "string" || !isFx(r.effect)) continue;
      const track = ctx.tracks.find((t) => t.ref === r.trackRef);
      if (!track || track.hasAudio === false) continue;
      if (VOCAL_ONLY.includes(r.effect) && !BITEK_TUNE_ROLES.includes(track.role)) continue;
      if (track.effects?.includes(r.effect)) continue;
      const name = track.name.trim() || (lang === "pl" ? "Ślad" : "Track");
      out.push({
        kind: "trackFx",
        trackRef: track.ref,
        effect: r.effect,
        label: lang === "pl" ? `${name}: dodaj ${FX_NAME.pl[r.effect]}` : `${name}: add ${FX_NAME.en[r.effect]}`,
      });
      continue;
    }
    if (r.kind === "masterStyle") {
      if (ctx.step !== "master" || !ctx.master || !isStyle(r.style)) continue;
      out.push({
        kind: "masterStyle",
        style: r.style,
        label: lang === "pl" ? `Styl masteringu: ${STYLE_NAME.pl[r.style]}` : `Mastering style: ${STYLE_NAME.en[r.style]}`,
      });
      continue;
    }
    if (r.kind === "masterTarget") {
      if (ctx.step !== "master" || !ctx.master || !isTarget(r.target) || ctx.master.target === r.target) continue;
      out.push({
        kind: "masterTarget",
        target: r.target,
        label: lang === "pl" ? `Cel: ${TARGET_NAME.pl[r.target]}` : `Target: ${TARGET_NAME.en[r.target]}`,
      });
    }
  }
  return out;
}
