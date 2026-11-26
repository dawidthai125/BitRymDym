"use client";

/**
 * The five groups of the Studio full view: Nagrywanie · Brzmienie · Tekst · Dodaj · Więcej.
 * Bottom bar below xl, tabs of the right panel on desktop. Presentational: the editor owns the state.
 */

import { useCallback, useLayoutEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AudioLines, Ellipsis, Mic, Plus, Type } from "lucide-react";

import { StudioMarkersPanel } from "@/components/studio/studio-markers-panel";
import { StudioLyricsCard } from "@/components/studio/studio-lazy-panels";
import { STUDIO_GROUPS, type StudioGroup } from "@/lib/studio/studio-feature-finder";

const ICONS: Record<StudioGroup, typeof Mic> = {
  record: Mic,
  sound: AudioLines,
  text: Type,
  add: Plus,
  more: Ellipsis,
};

type GroupButtonsProps = {
  active: StudioGroup | null;
  /** A take is running: only the recording group may be opened. */
  recordingLocked: boolean;
  onOpen: (group: StudioGroup) => void;
};

/** Phones and tablets: a bar fixed to the bottom of the screen. */
export function StudioDockBar({ active, recordingLocked, onOpen }: GroupButtonsProps) {
  const t = useTranslations("studio.groups");
  return (
    <nav
      aria-label={t("aria")}
      data-testid="studio-dock-bar"
      data-studio-dock=""
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 gap-1 border-t border-[var(--brd-line)] bg-[var(--brd-paper)] px-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] pt-1 xl:hidden"
    >
      {STUDIO_GROUPS.map((group) => {
        const Icon = ICONS[group];
        return (
          <button
            key={group}
            type="button"
            data-testid={`studio-dock-${group}`}
            aria-pressed={active === group}
            disabled={recordingLocked && group !== "record"}
            className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded text-[11px] font-medium disabled:opacity-40 ${
              active === group ? "bg-[var(--brd-ink)] text-[var(--brd-paper)]" : "text-[var(--brd-ink)]"
            }`}
            onClick={() => onOpen(group)}
          >
            <Icon aria-hidden className={`size-5 ${group === "record" && active !== group ? "text-[var(--brd-rec)]" : ""}`} />
            <span className="max-w-full truncate">{t(group)}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Desktop: the same five groups as tabs above the right panel. */
export function StudioGroupTabs({ active, recordingLocked, onOpen, hidden }: GroupButtonsProps & { hidden: boolean }) {
  const t = useTranslations("studio.groups");
  return (
    <div
      role="tablist"
      aria-label={t("aria")}
      data-testid="studio-inspector-visual-tabs"
      hidden={hidden}
      className={`${hidden ? "hidden" : "grid"} grid-cols-5 gap-0.5 border-b border-[var(--brd-line)] pb-2`}
    >
      {STUDIO_GROUPS.map((group) => {
        const Icon = ICONS[group];
        return (
          <button
            key={group}
            type="button"
            role="tab"
            aria-selected={active === group}
            data-testid={`studio-group-tab-${group}`}
            disabled={recordingLocked && group !== "record"}
            className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded border px-0 text-[9.5px] font-medium tracking-tight disabled:opacity-40 ${
              active === group
                ? "border-[var(--brd-green)] bg-[color-mix(in_srgb,var(--brd-bg)_80%,var(--brd-green)_20%)] text-[var(--brd-ink)]"
                : "border-[var(--brd-line)] bg-[var(--brd-paper)] text-[var(--brd-mute)]"
            }`}
            onClick={() => onOpen(group)}
          >
            <Icon aria-hidden className="size-4" />
            <span className="max-w-full truncate">{t(group)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One large entry of the "Dodaj" and "Więcej" groups. */
export function StudioGroupRow({
  title,
  hint,
  disabled,
  testId,
  onClick,
}: {
  title: string;
  hint?: string;
  disabled?: boolean;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      className="flex min-h-12 w-full items-center justify-between gap-3 rounded border border-[var(--brd-line)] px-3 py-2 text-left disabled:opacity-50"
      onClick={onClick}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--brd-ink)]">{title}</span>
        {hint ? <span className="block text-xs text-[var(--brd-mute)]">{hint}</span> : null}
      </span>
      <span aria-hidden className="text-[var(--brd-mute)]">→</span>
    </button>
  );
}

export function StudioGroupSection({ title, children, anchor }: { title: string; children: ReactNode; anchor?: string }) {
  return (
    <section className="space-y-2" data-record-focus={anchor}>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brd-mute)]">{title}</h3>
      {children}
    </section>
  );
}

type MarkersProps = ComponentProps<typeof StudioMarkersPanel>;

/** "Tekst": lyrics with AI help, then verse and chorus markers on the timeline. */
export function StudioTextGroup(props: MarkersProps) {
  const t = useTranslations("studio.groups");
  // The markers panel reloads when these callbacks change: keep them stable across editor renders.
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const getExpected = useCallback(() => latest.current.getExpectedDocumentVersion(), []);
  const enqueue = useCallback<MarkersProps["enqueuePersistAsync"]>((executor) => latest.current.enqueuePersistAsync(executor), []);
  const ack = useCallback((value: unknown) => latest.current.onDocumentVersionAck?.(value) ?? latest.current.getExpectedDocumentVersion(), []);
  return (
    <div className="space-y-4" data-testid="studio-text-group">
      <StudioGroupSection title={t("tekstUtworu")} anchor="lyrics">
        <StudioLyricsCard
          projectId={props.projectId}
          getPlayheadMs={props.getPlayheadMs}
          mode="single"
          loopStartMs={null}
          punchLine={null}
        />
      </StudioGroupSection>
      <StudioGroupSection title={t("zwrotkiIRefreny")} anchor="markers">
        <StudioMarkersPanel
          projectId={props.projectId}
          getExpectedDocumentVersion={getExpected}
          enqueuePersistAsync={enqueue}
          getPlayheadMs={props.getPlayheadMs}
          onSeek={props.onSeek}
          onDocumentVersionAck={ack}
          tempoBpm={props.tempoBpm}
        />
      </StudioGroupSection>
    </div>
  );
}
