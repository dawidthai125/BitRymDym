/**
 * SFM billing day — Europe/Warsaw calendar day with DST-safe bounds.
 * Must NOT use utcDayWindowStart (beat/TAKE domain).
 */

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type WarsawStamp = {
  ymd: string;
  hour: number;
  minute: number;
  second: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatWarsawStamp(date: Date): WarsawStamp {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return {
    ymd: `${pick("year")}-${pick("month")}-${pick("day")}`,
    hour: Number(pick("hour")),
    minute: Number(pick("minute")),
    second: Number(pick("second")),
  };
}

/** Calendar day bucket YYYY-MM-DD in Europe/Warsaw. */
export function warsawDayBucket(now: Date = new Date()): string {
  return formatWarsawStamp(now).ymd;
}

/**
 * UTC Instant of local midnight (00:00:00) on the given Warsaw civil day.
 */
export function warsawLocalMidnightUtc(
  year: number,
  month: number,
  day: number,
): Date {
  const ymd = `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
  // Warsaw offset ∈ {+1,+2}; probe a window around expected UTC midnights.
  const windowStart =
    Date.UTC(year, month - 1, day, 0, 0, 0, 0) - 4 * 3600 * 1000;
  for (let offsetMin = 0; offsetMin <= 6 * 60; offsetMin += 1) {
    const candidate = new Date(windowStart + offsetMin * 60 * 1000);
    const local = formatWarsawStamp(candidate);
    if (
      local.ymd === ymd &&
      local.hour === 0 &&
      local.minute === 0 &&
      local.second === 0
    ) {
      return candidate;
    }
  }
  throw new Error(`Could not resolve Warsaw midnight for ${ymd}`);
}

/**
 * Inclusive local midnight → exclusive next local midnight, as UTC Instants.
 * Handles 23h (spring DST) and 25h (autumn DST) Warsaw days.
 */
export function warsawDayBoundsUtc(dayYmd: string): {
  start: Date;
  end: Date;
} {
  const match = YMD_RE.exec(dayYmd);
  if (!match) {
    throw new Error(`Invalid Warsaw day bucket: ${dayYmd}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = warsawLocalMidnightUtc(year, month, day);

  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const end = warsawLocalMidnightUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
  return { start, end };
}

/** True iff instant falls in [start, end) for the Warsaw calendar day. */
export function isInstantInWarsawDay(now: Date, dayYmd: string): boolean {
  const { start, end } = warsawDayBoundsUtc(dayYmd);
  const t = now.getTime();
  return t >= start.getTime() && t < end.getTime();
}

/** Duration of Warsaw civil day in milliseconds (23h / 24h / 25h). */
export function warsawDayDurationMs(dayYmd: string): number {
  const { start, end } = warsawDayBoundsUtc(dayYmd);
  return end.getTime() - start.getTime();
}
