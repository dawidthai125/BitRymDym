"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Safari on iPhone and iPad zooms the whole page into any field below 16 px and stays zoomed. maximum-scale=1
 * turns only that off: iOS ignores it for pinch zoom. Not on Android, where it would block pinch zoom.
 */
export function IosFocusZoom() {
  const pathname = usePathname();
  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!ios || !meta || meta.content.includes("maximum-scale")) return;
    meta.content += ", maximum-scale=1";
  }, [pathname]);
  return null;
}
