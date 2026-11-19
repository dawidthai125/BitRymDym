/**
 * A model reply must not contradict the change it proposes ("Podgłośniam wokal" above a button that
 * lowers it). The validated proposal is the truth; when the wording points the other way, the reply
 * (and a contradicting "why") is rebuilt from the validated proposals by the server.
 */
import { buildBitekProposalWhy } from "./proposals";
import type { BitekChatContext, BitekChatResult } from "./types";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");

const UP = /podglosn|podkrec|glosniej|dolo|wzmoc|podnosz|podniose|louder|turn(ing)? (it )?up|rais(e|ing)|boost/;
const DOWN = /sciszam|scisze|sciszyl|przycisz|zmniejsz|ciszej|obniz|quieter|turn(ing)? (it )?down|lower|reduc/;

type Direction = "up" | "down" | "mixed" | "none";

function gainDirection(result: BitekChatResult, ctx: BitekChatContext): Direction {
  let up = false;
  let down = false;
  for (const p of result.proposals) {
    if (p.param !== "gainDb" || typeof p.value !== "number") continue;
    const track = ctx.tracks.find((t) => t.ref === p.trackRef);
    if (!track) continue;
    if (p.value > track.gainDb) up = true;
    else if (p.value < track.gainDb) down = true;
  }
  return up && down ? "mixed" : up ? "up" : down ? "down" : "none";
}

/** True when `text` says the opposite of `dir` and never says the right thing. */
function contradicts(text: string, dir: Direction): boolean {
  if (dir !== "up" && dir !== "down") return false;
  const m = norm(text);
  const saysUp = UP.test(m);
  const saysDown = DOWN.test(m);
  return dir === "up" ? saysDown && !saysUp : saysUp && !saysDown;
}

export function withConsistentWording(result: BitekChatResult, ctx: BitekChatContext): BitekChatResult {
  if (ctx.step !== "mix" || result.proposals.length === 0) return result;
  const dir = gainDirection(result, ctx);
  let reply = result.reply;
  let changed = false;
  if (contradicts(reply, dir)) {
    const labels = result.proposals.map((p) => p.label).filter(Boolean).join("; ");
    reply =
      ctx.lang === "pl"
        ? `Proponuję: ${labels}. Kliknij „Zastosuj” i posłuchaj. Jak za dużo, cofnij (Ctrl+Z).`
        : `Proposal: ${labels}. Hit "Apply" and listen. Undo with Ctrl+Z if it is too much.`;
    changed = true;
  }
  const proposals = result.proposals.map((p) => {
    if (p.param !== "gainDb" || typeof p.value !== "number" || !p.why) return p;
    const track = ctx.tracks.find((t) => t.ref === p.trackRef);
    if (!track) return p;
    const own: Direction = p.value > track.gainDb ? "up" : p.value < track.gainDb ? "down" : "none";
    if (!contradicts(p.why, own)) return p;
    changed = true;
    return { ...p, why: buildBitekProposalWhy(track, p.param, p.value, ctx.lang) };
  });
  return changed ? { ...result, reply, proposals } : result;
}
