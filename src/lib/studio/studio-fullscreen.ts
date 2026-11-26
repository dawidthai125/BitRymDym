/**
 * Studio full-screen mode (owner order 2026-11-26). Pure helpers; the component is
 * src/components/studio/studio-fullscreen-toggle.tsx.
 *
 * Full screen = the site chrome (header, footer, bottom nav, sticky player, notices) is hidden by the
 * class below on <html>, and where the browser allows it the page also asks for real full screen
 * (Fullscreen API). iPhone Safari has no Fullscreen API for pages: there only the chrome is hidden.
 * Nothing is remounted, so a running recording or playback goes on.
 */

export const STUDIO_FULL_CLASS = "brd-studio-full";

/** Phone turned sideways: a short, touch-first screen in landscape. */
export const STUDIO_LANDSCAPE_PHONE_QUERY = "(orientation: landscape) and (max-height: 500px) and (pointer: coarse)";

type KeyLike = {
  key: string;
  repeat?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  defaultPrevented?: boolean;
};

/**
 * "F" toggles full screen. Not while typing, not with modifiers (Ctrl+F is the browser's search) and
 * not when another part already used the key (the Studio keyboard instrument plays F as a note).
 */
export function isFullscreenToggleKey(e: KeyLike, typing: boolean): boolean {
  if (typing || e.defaultPrevented || e.repeat) return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return e.key === "f" || e.key === "F";
}
