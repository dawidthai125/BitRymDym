/**
 * Transport / strip glyphs drawn as SVG (no unicode symbols in chrome).
 * Decorative only: every caller keeps its own aria-label / title.
 */
type GlyphName =
  | "play"
  | "pause"
  | "stop"
  | "loop"
  | "metronome"
  | "up"
  | "down"
  | "more"
  | "chevron-up"
  | "chevron-down"
  | "undo"
  | "redo";

const PATHS: Record<GlyphName, React.ReactNode> = {
  play: <path d="M5 3.5v9l8-4.5-8-4.5z" fill="currentColor" />,
  pause: (
    <>
      <rect x="4" y="3.5" width="2.75" height="9" fill="currentColor" />
      <rect x="9.25" y="3.5" width="2.75" height="9" fill="currentColor" />
    </>
  ),
  stop: <rect x="4" y="4" width="8" height="8" fill="currentColor" />,
  loop: (
    <path
      d="M3.5 8a4.5 4.5 0 0 1 7.7-3.2M12.5 8a4.5 4.5 0 0 1-7.7 3.2M11.5 2.5v2.6H8.9M4.5 13.5v-2.6h2.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
    />
  ),
  metronome: (
    <path
      d="M6 2.5h4l2.5 11h-9L6 2.5zM8 11l3.5-6.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="miter"
    />
  ),
  up: <path d="M8 3.5 3.5 9h3v3.5h3V9h3L8 3.5z" fill="currentColor" />,
  down: <path d="M8 12.5 12.5 7h-3V3.5h-3V7h-3L8 12.5z" fill="currentColor" />,
  more: (
    <>
      <rect x="7" y="2.5" width="2" height="2" fill="currentColor" />
      <rect x="7" y="7" width="2" height="2" fill="currentColor" />
      <rect x="7" y="11.5" width="2" height="2" fill="currentColor" />
    </>
  ),
  "chevron-up": (
    <path d="M3.5 10.5 8 6l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
  ),
  undo: (
    <path
      d="M5.5 3.5 2.5 6.5l3 3M2.5 6.5h7a4 4 0 0 1 0 8H7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
    />
  ),
  redo: (
    <path
      d="M10.5 3.5l3 3-3 3M13.5 6.5h-7a4 4 0 0 0 0 8H9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
    />
  ),
  "chevron-down": (
    <path d="M3.5 5.5 8 10l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
  ),
};

export function StudioGlyph({
  name,
  className = "size-4",
}: {
  name: GlyphName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

/** Round REC lamp — the one neon accent on the console. */
export function StudioRecLamp() {
  return <span aria-hidden="true" className="studio-rec-lamp" />;
}
