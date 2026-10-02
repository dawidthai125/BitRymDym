/**
 * Local visual-prototype demo photography catalog.
 * UI-only — no Storage, no CDN, no DB.
 */

export type DemoVisualId =
  | "studio-mic"
  | "booth"
  | "night-drive"
  | "console"
  | "headphones"
  | "tape"
  | "city-window"
  | "concrete"
  | "vocalist"
  | "underground"
  | "studio-desk"
  | "texture";

export type DemoVisual = {
  id: DemoVisualId;
  src: string;
  alt: string;
  /** Suggested object-position for crops */
  focus: string;
};

export const DEMO_VISUALS: readonly DemoVisual[] = [
  {
    id: "studio-mic",
    src: "/demo/visual/brd-studio-mic.jpg",
    alt: "Mikrofon studyjny",
    focus: "center",
  },
  {
    id: "booth",
    src: "/demo/visual/brd-booth.jpg",
    alt: "Kabina nagraniowa",
    focus: "center",
  },
  {
    id: "night-drive",
    src: "/demo/visual/brd-night-drive.jpg",
    alt: "Nocna jazda przez miasto",
    focus: "center bottom",
  },
  {
    id: "console",
    src: "/demo/visual/brd-console.jpg",
    alt: "Konsoleta mikserska",
    focus: "center",
  },
  {
    id: "headphones",
    src: "/demo/visual/brd-headphones.jpg",
    alt: "Słuchawki studyjne",
    focus: "center",
  },
  {
    id: "tape",
    src: "/demo/visual/brd-tape.jpg",
    alt: "Taśma analogowa",
    focus: "center",
  },
  {
    id: "city-window",
    src: "/demo/visual/brd-city-window.jpg",
    alt: "Nocne miasto za oknem",
    focus: "center",
  },
  {
    id: "concrete",
    src: "/demo/visual/brd-concrete.jpg",
    alt: "Betonowa faktura",
    focus: "center",
  },
  {
    id: "vocalist",
    src: "/demo/visual/brd-vocalist.jpg",
    alt: "Sylwetka przy mikrofonie",
    focus: "center top",
  },
  {
    id: "underground",
    src: "/demo/visual/brd-underground.jpg",
    alt: "Podziemne przejście",
    focus: "center",
  },
  {
    id: "studio-desk",
    src: "/demo/visual/brd-studio-desk.jpg",
    alt: "Biurko w studiu",
    focus: "center",
  },
  {
    id: "texture",
    src: "/demo/visual/brd-texture.jpg",
    alt: "Tekstura fotograficzna",
    focus: "center",
  },
] as const;

const BY_ID = Object.fromEntries(
  DEMO_VISUALS.map((v) => [v.id, v]),
) as Record<DemoVisualId, DemoVisual>;

export function getDemoVisual(id: DemoVisualId): DemoVisual {
  return BY_ID[id];
}

/** Deterministic artwork visual for a beat id */
export function demoVisualForBeatId(beatId: string): DemoVisual {
  let h = 2166136261;
  for (let i = 0; i < beatId.length; i += 1) {
    h ^= beatId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = (h >>> 0) % DEMO_VISUALS.length;
  return DEMO_VISUALS[idx]!;
}

export function artworkVariantToVisual(variant: number): DemoVisual {
  const idx =
    ((variant % DEMO_VISUALS.length) + DEMO_VISUALS.length) %
    DEMO_VISUALS.length;
  return DEMO_VISUALS[idx]!;
}
