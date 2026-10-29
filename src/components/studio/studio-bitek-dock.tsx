"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

export type BitekMood = "happy" | "thinking" | "alert" | "done";

export type BitekBubbleAction = { id: string; label: string; onClick: () => void; primary?: boolean };

/** What BITEK says right now: 1–3 short sentences + optional details. */
export type BitekBubble = {
  /** Stable id of the situation; closing the bubble hides it until the key changes. */
  key: string;
  mood: BitekMood;
  text: string;
  details?: string[];
  actions?: BitekBubbleAction[];
  /** Full figure (welcome). */
  hero?: boolean;
};

export const BITEK_AUTO_COLLAPSE_MS = 6000;
/** On phones the bubble spans the width of the screen — action bubbles fold too, a bit later. */
export const BITEK_AUTO_COLLAPSE_MOBILE_ACTIONS_MS = 9000;
const MOBILE_QUERY = "(max-width: 1023.98px)";

export const BITEK_MOOD_SRC: Record<BitekMood, string> = {
  happy: "/bitek/bitek-happy.webp",
  thinking: "/bitek/bitek-thinking.webp",
  alert: "/bitek/bitek-alert.webp",
  done: "/bitek/bitek-done.webp",
};

/**
 * Stage 2b — BITEK the raccoon: floating avatar (corner of Studio), speech
 * bubble overlay (aria-live) and the chat panel overlay. Nothing here takes
 * space in the page layout.
 */
export function StudioBitekDock({
  bubble,
  mood,
  minimized,
  dismissedKey,
  onMinimizedChange,
  onDismiss,
  chat,
  chatOpen,
  onChatOpenChange,
}: {
  bubble: BitekBubble | null;
  mood: BitekMood;
  minimized: boolean;
  dismissedKey: string | null;
  onMinimizedChange: (minimized: boolean) => void;
  onDismiss: (key: string) => void;
  chat: ReactNode;
  chatOpen: boolean;
  onChatOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("studio.bitek.dock");
  const bubbleId = useId();
  const chatTitleId = useId();
  const avatarRef = useRef<HTMLButtonElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  /** Bubbles without actions fold into the "restore" pill after a few seconds so they never cover the page. */
  const [autoCollapsedKey, setAutoCollapsedKey] = useState<string | null>(null);
  const autoCollapsed = Boolean(bubble && autoCollapsedKey === bubble.key);
  const visible =
    bubble && bubble.key !== dismissedKey && !minimized && !autoCollapsed && !chatOpen ? bubble : null;
  const showDetails = Boolean(visible && detailsFor === visible.key);
  const hasNews = Boolean(bubble && bubble.key !== dismissedKey && (minimized || autoCollapsed));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const hasActions = Boolean(visible?.actions?.length);
  const autoCollapseKey = visible && !visible.hero && (!hasActions || isMobile) ? visible.key : null;

  useEffect(() => {
    if (!autoCollapseKey || showDetails) return;
    const ms = hasActions ? BITEK_AUTO_COLLAPSE_MOBILE_ACTIONS_MS : BITEK_AUTO_COLLAPSE_MS;
    const id = window.setTimeout(() => setAutoCollapsedKey(autoCollapseKey), ms);
    return () => window.clearTimeout(id);
  }, [autoCollapseKey, showDetails, hasActions]);

  /**
   * Publish the space the dock takes at the bottom of the viewport (--bitek-dock-h) so the
   * studio can pad its content and every control can be scrolled above the bubble.
   */
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const update = () => {
      const r = el.getBoundingClientRect();
      const h = r.height > 0 ? Math.ceil(window.innerHeight - r.top + 12) : 0;
      root.style.setProperty("--bitek-dock-h", `${Math.max(0, h)}px`);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    update();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty("--bitek-dock-h");
    };
  }, []);

  useEffect(() => {
    if (!chatOpen) return;
    chatRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [chatOpen]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (chatOpen) {
        onChatOpenChange(false);
        avatarRef.current?.focus();
      } else if (visible) {
        onDismiss(visible.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatOpen, visible, onChatOpenChange, onDismiss]);

  return (
    <div
      ref={rootRef}
      data-testid="studio-bitek-dock"
      data-mood={mood}
      className="pointer-events-none fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-2 lg:right-5 lg:bottom-5"
    >
      {chatOpen ? (
        <div
          ref={chatRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={chatTitleId}
          data-testid="studio-bitek-chat-panel"
          className="bitek-pop pointer-events-auto flex max-h-[min(70vh,36rem)] w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2 overflow-y-auto rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3 shadow-2xl"
        >
          <header className="flex items-center gap-2">
            <p id={chatTitleId} className="brd-display min-w-0 flex-1 text-base leading-none">{t("czatTytul")}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-9"
              aria-label={t("zamknijCzat")}
              data-testid="studio-bitek-chat-close"
              onClick={() => {
                onChatOpenChange(false);
                avatarRef.current?.focus();
              }}
            >
              ✕
            </Button>
          </header>
          {chat}
        </div>
      ) : null}

      <section
        id={bubbleId}
        aria-live="polite"
        aria-label={t("aria")}
        className="pointer-events-auto flex flex-col items-end"
      >
        {visible ? (
          <div
            key={visible.key}
            data-testid="studio-bitek-bubble"
            data-bubble-key={visible.key}
            data-mood={visible.mood}
            className="bitek-pop relative flex w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-2 rounded-[2px] border border-[var(--brd-line)] border-l-4 border-l-[var(--brd-amber)] bg-[var(--brd-paper)] p-3 text-sm shadow-2xl"
          >
            {visible.hero ? (
              // eslint-disable-next-line @next/next/no-img-element -- static tiny asset, no optimizer needed
              <img src="/bitek/bitek-hero.webp" alt="" width={240} height={240} className="mx-auto size-40 sm:size-48" />
            ) : null}
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1" data-testid="studio-bitek-bubble-text">{visible.text}</p>
              <div className="-mt-1 -mr-1 flex shrink-0">
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-[2px] text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
                  aria-label={t("minimalizuj")}
                  data-testid="studio-bitek-bubble-minimize"
                  onClick={() => onMinimizedChange(true)}
                >
                  –
                </button>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-[2px] text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
                  aria-label={t("zamknij")}
                  data-testid="studio-bitek-bubble-close"
                  onClick={() => onDismiss(visible.key)}
                >
                  ✕
                </button>
              </div>
            </div>
            {visible.details?.length ? (
              <>
                <button
                  type="button"
                  className="self-start text-xs underline underline-offset-2"
                  aria-expanded={showDetails}
                  aria-controls={`${bubbleId}-details`}
                  data-testid="studio-bitek-bubble-details-toggle"
                  onClick={() => setDetailsFor(showDetails ? null : visible.key)}
                >
                  {showDetails ? t("ukryjSzczegoly") : t("szczegoly", { count: visible.details.length })}
                </button>
                {showDetails ? (
                  <ul
                    id={`${bubbleId}-details`}
                    data-testid="studio-bitek-bubble-details"
                    className="flex max-h-56 list-disc flex-col gap-1 overflow-y-auto pl-5 text-xs"
                  >
                    {visible.details.map((d, i) => (
                      <li key={`${i}-${d.slice(0, 12)}`}>{d}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {visible.actions?.map((a) => (
                <Button
                  key={a.id}
                  type="button"
                  size="sm"
                  variant={a.primary ? "default" : "outline"}
                  className="min-h-9"
                  data-testid={`studio-bitek-action-${a.id}`}
                  onClick={a.onClick}
                >
                  {a.label}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-9"
                data-testid="studio-bitek-open-chat"
                onClick={() => onChatOpenChange(true)}
              >
                {t("pogadaj")}
              </Button>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--brd-mute)]">— BITEK</span>
            </div>
          </div>
        ) : null}
      </section>

      <div className="pointer-events-auto flex items-center gap-2">
        {hasNews ? (
          <button
            type="button"
            className="bitek-pop rounded-full border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3 py-1.5 text-xs shadow-lg"
            data-testid="studio-bitek-restore"
            onClick={() => {
              setAutoCollapsedKey(null);
              onMinimizedChange(false);
            }}
          >
            {t("maCos")}
          </button>
        ) : null}
        <button
          ref={avatarRef}
          type="button"
          data-testid="studio-bitek-avatar"
          data-mood={mood}
          aria-label={chatOpen ? t("zamknijCzat") : t("otworzCzat")}
          aria-expanded={chatOpen}
          className="bitek-avatar relative grid size-14 place-items-center rounded-full border-2 border-[var(--brd-amber)] bg-[#0d0b08] shadow-xl lg:size-20"
          onClick={() => onChatOpenChange(!chatOpen)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static tiny asset */}
          <img src={BITEK_MOOD_SRC[mood]} alt="" width={80} height={80} className="size-full rounded-full" />
          {hasNews ? <span aria-hidden className="absolute top-0 right-0 size-3 rounded-full bg-[var(--brd-rec)]" /> : null}
        </button>
      </div>
    </div>
  );
}
