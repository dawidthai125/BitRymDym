/**
 * UI-only presentation layer for believable music catalog.
 * Does NOT mutate DB. Maps beatId → fictional display fields.
 */

export type DemoBeatTemplate = {
  title: string;
  producer: string;
  genre: string;
  bpm: number;
  key: string;
  durationLabel: string;
  mood: string;
};

/** Large pool — unique titles across typical published catalogs */
export const DEMO_BEAT_TEMPLATES: readonly DemoBeatTemplate[] = [
  { title: "Nocny kurs", producer: "Kubi", genre: "Hip-Hop", bpm: 92, key: "Am", durationLabel: "3:12", mood: "Nocny" },
  { title: "Beton i deszcz", producer: "Mira Beats", genre: "Boom Bap", bpm: 88, key: "Dm", durationLabel: "2:48", mood: "Ciężki" },
  { title: "Szybki świt", producer: "North Tape", genre: "Trap", bpm: 140, key: "F#m", durationLabel: "2:21", mood: "Ostry" },
  { title: "Cisza przed", producer: "Halo Room", genre: "Lo-Fi", bpm: 76, key: "C", durationLabel: "3:40", mood: "Spokojny" },
  { title: "Piąte piętro", producer: "Kreska", genre: "Drill", bpm: 142, key: "Gm", durationLabel: "2:55", mood: "Napięty" },
  { title: "Latarnia", producer: "Two Rivers", genre: "Soul Rap", bpm: 96, key: "Em", durationLabel: "3:05", mood: "Ciepły" },
  { title: "Po sezonie", producer: "Okno 12", genre: "Alt Hip-Hop", bpm: 102, key: "Bm", durationLabel: "3:28", mood: "Melancholijny" },
  { title: "Brudny monolog", producer: "Szary Most", genre: "Underground", bpm: 90, key: "Am", durationLabel: "2:37", mood: "Surowy" },
  { title: "Echoes", producer: "Kaas", genre: "Hip-Hop", bpm: 94, key: "Fm", durationLabel: "3:01", mood: "Głęboki" },
  { title: "After Hours", producer: "North Tape", genre: "R&B Rap", bpm: 86, key: "Em", durationLabel: "2:54", mood: "Nocny" },
  { title: "Night Ride", producer: "Mira Beats", genre: "Trap", bpm: 138, key: "C#m", durationLabel: "2:33", mood: "Ostry" },
  { title: "No Signal", producer: "Two Rivers", genre: "Experimental", bpm: 78, key: "Dm", durationLabel: "3:18", mood: "Surowy" },
  { title: "Concrete Dreams", producer: "Kaas", genre: "Boom Bap", bpm: 91, key: "Gm", durationLabel: "3:08", mood: "Ciężki" },
  { title: "Midnight Drive", producer: "Halo Room", genre: "Trap", bpm: 135, key: "Bm", durationLabel: "2:41", mood: "Nocny" },
  { title: "Lost Signals", producer: "Okno 12", genre: "Lo-Fi", bpm: 82, key: "C", durationLabel: "3:22", mood: "Spokojny" },
  { title: "Urban Stories", producer: "Kubi", genre: "Hip-Hop", bpm: 95, key: "Am", durationLabel: "3:00", mood: "Ciepły" },
  { title: "Glass Floor", producer: "Kreska", genre: "Drill", bpm: 144, key: "Fm", durationLabel: "2:29", mood: "Napięty" },
  { title: "Tape Delay", producer: "Szary Most", genre: "Underground", bpm: 87, key: "Em", durationLabel: "2:52", mood: "Surowy" },
  { title: "River Mouth", producer: "Two Rivers", genre: "Soul Rap", bpm: 98, key: "Dm", durationLabel: "3:15", mood: "Ciepły" },
  { title: "Cold Lobby", producer: "North Tape", genre: "Boom Bap", bpm: 89, key: "Am", durationLabel: "2:58", mood: "Melancholijny" },
  { title: "Red Light", producer: "Mira Beats", genre: "Trap", bpm: 148, key: "G#m", durationLabel: "2:18", mood: "Ostry" },
  { title: "Paper Town", producer: "Halo Room", genre: "Alt Hip-Hop", bpm: 104, key: "F", durationLabel: "3:33", mood: "Spokojny" },
  { title: "Smoke Room", producer: "Kaas", genre: "Lo-Fi", bpm: 74, key: "Cm", durationLabel: "3:45", mood: "Nocny" },
  { title: "Low Battery", producer: "Okno 12", genre: "Experimental", bpm: 110, key: "Bm", durationLabel: "2:47", mood: "Surowy" },
  { title: "Steel Stairs", producer: "Kreska", genre: "Drill", bpm: 140, key: "Dm", durationLabel: "2:36", mood: "Napięty" },
  { title: "Yellow Cab", producer: "Kubi", genre: "Hip-Hop", bpm: 93, key: "Em", durationLabel: "3:09", mood: "Ciepły" },
  { title: "Dust Jacket", producer: "Szary Most", genre: "Boom Bap", bpm: 85, key: "Am", durationLabel: "3:02", mood: "Ciężki" },
  { title: "Blue Hour", producer: "Two Rivers", genre: "R&B Rap", bpm: 80, key: "F#m", durationLabel: "3:20", mood: "Melancholijny" },
  { title: "Gridlock", producer: "North Tape", genre: "Trap", bpm: 150, key: "Cm", durationLabel: "2:12", mood: "Ostry" },
  { title: "Quiet Engine", producer: "Mira Beats", genre: "Lo-Fi", bpm: 72, key: "G", durationLabel: "3:50", mood: "Spokojny" },
  { title: "Last Platform", producer: "Halo Room", genre: "Underground", bpm: 88, key: "Bm", durationLabel: "2:44", mood: "Surowy" },
  { title: "Window Seat", producer: "Okno 12", genre: "Soul Rap", bpm: 97, key: "Am", durationLabel: "3:11", mood: "Ciepły" },
  { title: "Blackout Verse", producer: "Kaas", genre: "Hip-Hop", bpm: 90, key: "Dm", durationLabel: "2:59", mood: "Głęboki" },
  { title: "Neon Exit", producer: "Kreska", genre: "Drill", bpm: 146, key: "Em", durationLabel: "2:25", mood: "Napięty" },
  { title: "Salt Air", producer: "Two Rivers", genre: "Alt Hip-Hop", bpm: 108, key: "C", durationLabel: "3:26", mood: "Spokojny" },
  { title: "Static Choir", producer: "Szary Most", genre: "Experimental", bpm: 84, key: "Fm", durationLabel: "3:07", mood: "Surowy" },
  { title: "Harbor Fog", producer: "North Tape", genre: "Boom Bap", bpm: 86, key: "Gm", durationLabel: "3:14", mood: "Melancholijny" },
  { title: "Copper Wire", producer: "Mira Beats", genre: "Trap", bpm: 136, key: "Am", durationLabel: "2:39", mood: "Ostry" },
  { title: "Soft Perimeter", producer: "Halo Room", genre: "Lo-Fi", bpm: 70, key: "Em", durationLabel: "4:02", mood: "Spokojny" },
  { title: "Roof Access", producer: "Kubi", genre: "Hip-Hop", bpm: 96, key: "Bm", durationLabel: "3:04", mood: "Nocny" },
  { title: "Idle Hands", producer: "Okno 12", genre: "Underground", bpm: 91, key: "Dm", durationLabel: "2:50", mood: "Surowy" },
  { title: "Second Shift", producer: "Kaas", genre: "Boom Bap", bpm: 88, key: "F#m", durationLabel: "3:00", mood: "Ciężki" },
  { title: "Ashtray Moon", producer: "Szary Most", genre: "Soul Rap", bpm: 94, key: "Cm", durationLabel: "3:19", mood: "Ciepły" },
  { title: "Tunnel Vision", producer: "Kreska", genre: "Drill", bpm: 141, key: "Am", durationLabel: "2:31", mood: "Napięty" },
  { title: "Pale Signal", producer: "Two Rivers", genre: "R&B Rap", bpm: 83, key: "G", durationLabel: "3:16", mood: "Melancholijny" },
  { title: "Freight Line", producer: "North Tape", genre: "Trap", bpm: 134, key: "Em", durationLabel: "2:43", mood: "Ostry" },
  { title: "Ivory Noise", producer: "Mira Beats", genre: "Lo-Fi", bpm: 78, key: "Am", durationLabel: "3:38", mood: "Spokojny" },
  { title: "Dock Number", producer: "Halo Room", genre: "Alt Hip-Hop", bpm: 106, key: "Dm", durationLabel: "3:21", mood: "Głęboki" },
  { title: "Broken Meter", producer: "Okno 12", genre: "Experimental", bpm: 112, key: "Bm", durationLabel: "2:56", mood: "Surowy" },
  { title: "North Wall", producer: "Kubi", genre: "Hip-Hop", bpm: 93, key: "Gm", durationLabel: "3:06", mood: "Ciężki" },
  { title: "Amber Delay", producer: "Kaas", genre: "Soul Rap", bpm: 99, key: "F", durationLabel: "3:13", mood: "Ciepły" },
  { title: "Side Entrance", producer: "Szary Most", genre: "Underground", bpm: 87, key: "Cm", durationLabel: "2:46", mood: "Surowy" },
  { title: "False Dawn", producer: "Kreska", genre: "Trap", bpm: 139, key: "F#m", durationLabel: "2:27", mood: "Napięty" },
  { title: "Milk Glass", producer: "Two Rivers", genre: "Boom Bap", bpm: 90, key: "Em", durationLabel: "3:10", mood: "Spokojny" },
  { title: "Cargo Hold", producer: "North Tape", genre: "Hip-Hop", bpm: 95, key: "Am", durationLabel: "2:57", mood: "Nocny" },
  { title: "Thin Ice", producer: "Mira Beats", genre: "Drill", bpm: 143, key: "Dm", durationLabel: "2:34", mood: "Ostry" },
  { title: "Quiet Ledger", producer: "Halo Room", genre: "Lo-Fi", bpm: 75, key: "Bm", durationLabel: "3:42", mood: "Melancholijny" },
  { title: "Wireframe", producer: "Okno 12", genre: "Experimental", bpm: 118, key: "C", durationLabel: "2:49", mood: "Surowy" },
  { title: "Open Mic", producer: "Kaas", genre: "Hip-Hop", bpm: 92, key: "Em", durationLabel: "3:03", mood: "Ciepły" },
  { title: "Far Platform", producer: "Szary Most", genre: "Alt Hip-Hop", bpm: 101, key: "Am", durationLabel: "3:25", mood: "Głęboki" },
] as const;

const TECHNICAL_TITLE =
  /\b(d02|d03|e3|target|fixture|test|mock|wave\s*\d|recording\s*target|w6|pe-|go\s*#)\b/i;

export function isTechnicalTitle(value: string): boolean {
  return TECHNICAL_TITLE.test(value);
}

export function hashToIndex(seed: string, modulo: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % Math.max(1, modulo);
}

export function demoTemplateForId(beatId: string): DemoBeatTemplate {
  return DEMO_BEAT_TEMPLATES[
    hashToIndex(beatId, DEMO_BEAT_TEMPLATES.length)
  ]!;
}

export function artworkVariantForId(beatId: string): number {
  return hashToIndex(beatId, 12);
}

export type PresentedBeat = {
  id: string;
  title: string;
  producer: string;
  genre: string;
  mood: string;
  key: string;
  bpm: number;
  durationSeconds: number;
  artworkVariant: number;
};

type PresentableInput = {
  id: string;
  title: string;
  producer?: string | null;
  genre?: string | null;
  style?: string | null;
  bpm: number;
  key?: string | null;
  scale?: string | null;
  durationSeconds: number;
};

function toPresented(
  raw: PresentableInput,
  demo: DemoBeatTemplate,
): PresentedBeat {
  return {
    id: raw.id,
    title: demo.title,
    producer: demo.producer,
    genre: demo.genre,
    mood: demo.mood,
    key: demo.key,
    bpm: raw.bpm > 0 ? raw.bpm : demo.bpm,
    durationSeconds: raw.durationSeconds > 0 ? raw.durationSeconds : 180,
    artworkVariant: artworkVariantForId(raw.id),
  };
}

/**
 * Always overlay fictional display fields for public UI.
 * Keeps real id + durationSeconds for audio.
 */
export function presentBeat(raw: PresentableInput): PresentedBeat {
  return toPresented(raw, demoTemplateForId(raw.id));
}

/**
 * Assign templates with de-duplication within a list when pool allows.
 * Order of `raw` is preserved.
 */
export function presentBeats(raw: PresentableInput[]): PresentedBeat[] {
  const pool = DEMO_BEAT_TEMPLATES.length;
  const sortedIds = [...raw].map((b) => b.id).sort();
  const assigned = new Map<string, number>();
  const used = new Set<number>();

  for (const id of sortedIds) {
    let idx = hashToIndex(id, pool);
    if (used.has(idx) && used.size < pool) {
      for (let step = 1; step < pool; step += 1) {
        const next = (idx + step) % pool;
        if (!used.has(next)) {
          idx = next;
          break;
        }
      }
    }
    used.add(idx);
    assigned.set(id, idx);
  }

  const presented = raw.map((beat) => {
    const idx = assigned.get(beat.id) ?? hashToIndex(beat.id, pool);
    return toPresented(beat, DEMO_BEAT_TEMPLATES[idx]!);
  });

  // Avoid identical cover art on adjacent rows (presentation-only).
  const visualCount = 12;
  let prevArt = -1;
  return presented.map((beat) => {
    let art = beat.artworkVariant % visualCount;
    if (art === prevArt) {
      art = (art + 1 + hashToIndex(beat.id + ":art", visualCount - 1)) % visualCount;
      if (art === prevArt) art = (art + 1) % visualCount;
    }
    prevArt = art;
    return art === beat.artworkVariant ? beat : { ...beat, artworkVariant: art };
  });
}

export const CATALOG_GENRES = [
  "Hip-Hop",
  "Boom Bap",
  "Trap",
  "Lo-Fi",
  "Drill",
  "Soul Rap",
  "Alt Hip-Hop",
  "Underground",
  "R&B Rap",
  "Experimental",
] as const;

export const CATALOG_MOODS = [
  "Nocny",
  "Ciężki",
  "Ostry",
  "Spokojny",
  "Napięty",
  "Ciepły",
  "Melancholijny",
  "Głęboki",
  "Surowy",
] as const;

export const CATALOG_KEYS = [
  "C",
  "Cm",
  "Am",
  "Em",
  "Dm",
  "Bm",
  "Fm",
  "Gm",
  "F#m",
  "C#m",
] as const;
