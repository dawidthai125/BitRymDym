/**
 * Finished-track catalogue. A ranking entry forces ratings and comments.
 * Catalogue-only listings may allow either, both, or neither.
 * The half-year prize is one year of Gold for 1st place. The winner turns it on.
 */

import { warsawPeriod, zonedMidnight, COMMUNITY_ZONE } from "@/lib/community/ranking-policy";

export type WorkBoardPeriod = "week" | "month" | "all";
export type EngageKind = "beat" | "sample" | "work";

export type WorkConsents = {
  allowRatings: boolean;
  allowComments: boolean;
  inRankings: boolean;
};

export type WorkWindow = {
  key: string;
  start: Date;
  end: Date;
  closed: boolean;
};

const TITLE_MAX = 80;

export function engageKind(value: unknown): EngageKind | null {
  return value === "beat" || value === "sample" || value === "work" ? value : null;
}

export function normalizeWorkConsents(input: WorkConsents): WorkConsents {
  if (input.inRankings) {
    return { allowRatings: true, allowComments: true, inRankings: true };
  }
  return {
    allowRatings: input.allowRatings,
    allowComments: input.allowComments,
    inRankings: false,
  };
}

export function cleanWorkTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 1 || text.length > TITLE_MAX) return null;
  return text;
}

export function workWindow(now: Date, period: WorkBoardPeriod, timeZone = COMMUNITY_ZONE): WorkWindow {
  if (period === "week" || period === "month") {
    const window = warsawPeriod(now, period, timeZone);
    return { key: window.key, start: window.start, end: window.end, closed: window.closed };
  }
  return {
    key: "all",
    start: new Date(0),
    end: new Date(now.getTime() + 1),
    closed: false,
  };
}

export function warsawHalfYear(now: Date, timeZone = COMMUNITY_ZONE): { key: string; year: number; half: 1 | 2; start: Date; end: Date } {
  const month = warsawPeriod(now, "month", timeZone);
  const [yearText, monthText] = month.key.split("-");
  const year = Number(yearText);
  const monthNum = Number(monthText);
  const half: 1 | 2 = monthNum <= 6 ? 1 : 2;
  const start = zonedMidnight(year, half === 1 ? 1 : 7, 1, timeZone);
  const end = half === 1 ? zonedMidnight(year, 7, 1, timeZone) : zonedMidnight(year + 1, 1, 1, timeZone);
  return { key: `${year}-H${half}`, year, half, start, end };
}
