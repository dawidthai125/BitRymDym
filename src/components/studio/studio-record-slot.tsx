"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * One recording panel for the whole editor. It is rendered once into a DOM node that the editor
 * owns; a slot (inspector column, sheet, simple view) only shows that node. Moving between slots,
 * or having no slot for a moment, never unmounts the panel, so a recording cannot be cut or lost
 * by a tab, a step or the window width.
 */
export function useStudioRecordHost(): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // After hydration: the server renders no panel, so there is nothing to mismatch.
    const timer = window.setTimeout(() => {
      const el = document.createElement("div");
      el.dataset.studioRecordHost = "true";
      setHost(el);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return host;
}

export function StudioRecordSlot({ host }: { host: HTMLElement | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const slot = ref.current;
    if (!slot || !host) return;
    slot.appendChild(host);
    return () => {
      if (host.parentNode === slot) slot.removeChild(host);
    };
  }, [host]);
  return <div ref={ref} data-testid="studio-record-slot" />;
}
