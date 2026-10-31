/** Pure geometry for the draggable, resizable BITEK dock. */

export const BITEK_FRAME_KEY = "brd.bitek.dockFrame.v1";

export const BITEK_CHAT_MIN = { w: 280, h: 220 };
export const BITEK_CHAT_MAX = { w: 560, h: 640 };
export const BITEK_FRAME_MARGIN = 8;

export type BitekFrame = { x: number; y: number; w: number; h: number };
export type BitekViewport = { w: number; h: number };
export type BitekRect = { x: number; y: number; w: number; h: number };

const listeners = new Set<() => void>();
let memory: BitekFrame | null | undefined;

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeBitekFrame(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readBitekFrame(): BitekFrame | null {
  if (memory !== undefined) return memory;
  memory = null;
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = JSON.parse(localStorage.getItem(BITEK_FRAME_KEY) ?? "null") as Partial<BitekFrame> | null;
    const x = raw?.x;
    const y = raw?.y;
    const w = raw?.w;
    const h = raw?.h;
    if (typeof x !== "number" || typeof y !== "number" || typeof w !== "number" || typeof h !== "number") return null;
    if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
    memory = { x, y, w, h };
  } catch {
    memory = null;
  }
  return memory ?? null;
}

export function writeBitekFrame(next: BitekFrame | null): void {
  memory = next;
  try {
    if (next) localStorage.setItem(BITEK_FRAME_KEY, JSON.stringify(next));
    else localStorage.removeItem(BITEK_FRAME_KEY);
  } catch {
    // Private mode — the in-memory position still holds for this tab.
  }
  emit();
}

/** Floating Stop on phones while recording. Desktop has no such button. */
export function floatingStopRect(viewport: BitekViewport): BitekRect | null {
  if (viewport.w >= 1024) return null;
  const w = 200;
  const h = 56;
  const bottom = 5.25 * 16;
  return { x: viewport.w / 2 - w / 2, y: viewport.h - bottom - h, w, h };
}

function intersects(a: BitekRect, b: BitekRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function clampBitekFrame(
  frame: BitekFrame,
  viewport: BitekViewport,
  options: { recording?: boolean; mobile?: boolean } = {},
): BitekFrame {
  const margin = BITEK_FRAME_MARGIN;
  const maxW = Math.min(BITEK_CHAT_MAX.w, Math.max(BITEK_CHAT_MIN.w, viewport.w - margin * 2));
  const maxH = Math.min(BITEK_CHAT_MAX.h, Math.max(BITEK_CHAT_MIN.h, viewport.h - margin * 2));
  const w = Math.min(maxW, Math.max(BITEK_CHAT_MIN.w, frame.w));
  const h = Math.min(maxH, Math.max(BITEK_CHAT_MIN.h, frame.h));
  let x = Math.min(viewport.w - margin - 48, Math.max(margin, frame.x));
  let y = Math.min(viewport.h - margin - 48, Math.max(margin, frame.y));
  if (options.recording) {
    const stop = floatingStopRect(viewport);
    if (stop && intersects({ x, y, w: Math.min(w, 280), h: 72 }, stop)) {
      y = Math.max(margin, stop.y - 80);
    }
  }
  if (options.mobile) {
    x = margin;
    y = Math.min(y, viewport.h - margin - 64);
  }
  return { x, y, w, h };
}
