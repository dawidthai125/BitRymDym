"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

const SCROLL_STEP_PX = 40;

type OverflowXScrollRegionProps = {
  className?: string;
  /** Używane tylko gdy region ma poziomy overflow (tabIndex + role=region). */
  ariaLabel: string;
  children: ReactNode;
};

function measureOverflow(el: HTMLDivElement): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

export function OverflowXScrollRegion({
  className,
  ariaLabel,
  children,
}: OverflowXScrollRegionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  const updateOverflow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setOverflowing(measureOverflow(el));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    updateOverflow();

    const ro = new ResizeObserver(() => {
      updateOverflow();
    });
    ro.observe(el);

    const onWindowResize = () => {
      updateOverflow();
    };
    window.addEventListener("resize", onWindowResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, [updateOverflow]);

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (!overflowing) return;

    const el = ref.current;
    if (!el) return;

    const maxScroll = el.scrollWidth - el.clientWidth;

    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        el.scrollLeft = Math.min(el.scrollLeft + SCROLL_STEP_PX, maxScroll);
        break;
      case "ArrowLeft":
        event.preventDefault();
        el.scrollLeft = Math.max(el.scrollLeft - SCROLL_STEP_PX, 0);
        break;
      case "Home":
        event.preventDefault();
        el.scrollLeft = 0;
        break;
      case "End":
        event.preventDefault();
        el.scrollLeft = maxScroll;
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={ref}
      className={cn(
        className,
        overflowing &&
          "outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-green-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brd-paper)]",
      )}
      onKeyDown={handleKeyDown}
      {...(overflowing
        ? { tabIndex: 0, role: "region" as const, "aria-label": ariaLabel }
        : {})}
    >
      {children}
    </div>
  );
}
