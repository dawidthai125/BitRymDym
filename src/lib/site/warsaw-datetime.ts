/**
 * `<input type="datetime-local">` ⇄ ISO, always in Europe/Warsaw (admins may
 * sit in another time zone; the maintenance page shows Polish time).
 */
const ZONE = "Europe/Warsaw";

function warsawParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    y: get("year"),
    mo: get("month"),
    d: get("day"),
    h: get("hour"),
    mi: get("minute"),
  };
}

/** ISO → "YYYY-MM-DDTHH:mm" in Warsaw time ("" for null/invalid). */
export function isoToWarsawLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const p = warsawParts(ms);
  return `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}`;
}

/** "YYYY-MM-DDTHH:mm" read as Warsaw wall-clock time → ISO (null if empty/invalid). */
export function warsawLocalInputToIso(value: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ms = wall;
  // Two passes settle the zone offset (handles DST boundaries).
  for (let i = 0; i < 2; i++) {
    const p = warsawParts(ms);
    const seen = Date.UTC(+p.y, +p.mo - 1, +p.d, +p.h, +p.mi);
    ms += wall - seen;
  }
  return new Date(ms).toISOString();
}
