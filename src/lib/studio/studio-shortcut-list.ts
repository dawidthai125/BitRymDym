/**
 * What the "?" list shows. Keep in step with the editor key handler; the transport rows are
 * checked against resolveStudioTransportKeyAction in the test.
 */

import type { StudioTransportKeyboardMode } from "@/lib/studio/transport-keyboard-mode";

export type StudioShortcutRow = {
  id:
    | "graj" | "nagraj" | "cofnij" | "ponow" | "poczatek" | "koniec" | "podziel" | "usun"
    | "przesun" | "przesun10" | "przesun20" | "przybliz" | "mikser" | "ekran" | "odznacz" | "lista";
  keys: string[];
};

export function studioShortcutRows(mode: StudioTransportKeyboardMode): StudioShortcutRow[] {
  const quick = mode === "quick_rec";
  return [
    { id: "graj", keys: quick ? ["P"] : ["space"] },
    { id: "nagraj", keys: quick ? ["space", "R"] : ["R"] },
    { id: "cofnij", keys: ["Ctrl + Z"] },
    { id: "ponow", keys: ["Ctrl + Shift + Z", "Ctrl + Y"] },
    { id: "poczatek", keys: ["Home"] },
    { id: "koniec", keys: ["End"] },
    { id: "podziel", keys: ["S"] },
    { id: "usun", keys: ["Delete", "Backspace"] },
    { id: "przesun", keys: ["←", "→"] },
    { id: "przesun10", keys: ["Shift + ←/→"] },
    { id: "przesun20", keys: ["Alt + ←/→"] },
    { id: "przybliz", keys: ["+", "−", "ctrl-wheel"] },
    { id: "mikser", keys: ["F9"] },
    { id: "ekran", keys: ["F"] },
    { id: "odznacz", keys: ["Esc"] },
    { id: "lista", keys: ["?"] },
  ];
}
