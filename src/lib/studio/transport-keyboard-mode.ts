/**
 * Studio transport keyboard modes.
 * - quick_rec: Space/R = record, P = play (current Owner muscle memory)
 * - standard_daw: Space = play/pause, R = record (DAW default)
 */

export const STUDIO_TRANSPORT_KEYBOARD_MODES = ["quick_rec", "standard_daw"] as const;
export type StudioTransportKeyboardMode =
  (typeof STUDIO_TRANSPORT_KEYBOARD_MODES)[number];

export const STUDIO_TRANSPORT_KEYBOARD_MODE_KEY =
  "brd.studio.transportKeyboardMode";

export const DEFAULT_STUDIO_TRANSPORT_KEYBOARD_MODE: StudioTransportKeyboardMode =
  "quick_rec";

export function isStudioTransportKeyboardMode(
  value: unknown,
): value is StudioTransportKeyboardMode {
  return value === "quick_rec" || value === "standard_daw";
}

export function parseStudioTransportKeyboardMode(
  raw: unknown,
): StudioTransportKeyboardMode {
  return isStudioTransportKeyboardMode(raw)
    ? raw
    : DEFAULT_STUDIO_TRANSPORT_KEYBOARD_MODE;
}

export function readStudioTransportKeyboardMode(
  storage: Pick<Storage, "getItem"> | null | undefined,
): StudioTransportKeyboardMode {
  if (!storage) return DEFAULT_STUDIO_TRANSPORT_KEYBOARD_MODE;
  try {
    return parseStudioTransportKeyboardMode(
      storage.getItem(STUDIO_TRANSPORT_KEYBOARD_MODE_KEY),
    );
  } catch {
    return DEFAULT_STUDIO_TRANSPORT_KEYBOARD_MODE;
  }
}

export function writeStudioTransportKeyboardMode(
  storage: Pick<Storage, "setItem"> | null | undefined,
  mode: StudioTransportKeyboardMode,
): void {
  if (!storage) return;
  try {
    storage.setItem(STUDIO_TRANSPORT_KEYBOARD_MODE_KEY, mode);
  } catch {
    // private mode / quota — keep in-memory only
  }
}

export type StudioTransportKeyAction = "record" | "play" | null;

/** Map a key event to transport action for the active mode. */
export function resolveStudioTransportKeyAction(params: {
  mode: StudioTransportKeyboardMode;
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): StudioTransportKeyAction {
  if (params.metaKey || params.ctrlKey || params.altKey) return null;
  const space =
    params.key === " " || params.code === "Space" || params.key === "Spacebar";
  const r = params.key === "r" || params.key === "R";
  const p = params.key === "p" || params.key === "P";

  if (params.mode === "standard_daw") {
    if (space) return "play";
    if (r) return "record";
    return null;
  }

  // quick_rec
  if (space || r) return "record";
  if (p) return "play";
  return null;
}

/* Live store for useSyncExternalStore (audit 2026-11-21: no setState-in-effect on mount). */
const keyboardModeListeners = new Set<() => void>();
/** Session value when localStorage refuses writes (private mode / quota). */
let keyboardModeMemory: StudioTransportKeyboardMode | null = null;

export function subscribeStudioTransportKeyboardMode(listener: () => void): () => void {
  keyboardModeListeners.add(listener);
  return () => {
    keyboardModeListeners.delete(listener);
  };
}

export function readStudioTransportKeyboardModeLive(): StudioTransportKeyboardMode {
  if (keyboardModeMemory) return keyboardModeMemory;
  return readStudioTransportKeyboardMode(typeof window === "undefined" ? null : window.localStorage);
}

export function setStudioTransportKeyboardModeLive(mode: StudioTransportKeyboardMode): void {
  keyboardModeMemory = mode;
  writeStudioTransportKeyboardMode(typeof window === "undefined" ? null : window.localStorage, mode);
  for (const listener of keyboardModeListeners) listener();
}
