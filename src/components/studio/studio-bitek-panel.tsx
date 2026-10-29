"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { StudioBitekChat, type BitekApplyProposal } from "@/components/studio/studio-bitek-chat";

import { Button } from "@/components/ui/button";
import {
  bitekRulesBrain,
  type BitekAction,
  type BitekBrain,
  type BitekState,
} from "@/lib/studio/bitek/bitek-guide";
import type { BitekClientContext } from "@/lib/studio/bitek/chat/client-context";

export type StudioBitekChatProps = {
  projectId: string;
  getContext: () => BitekClientContext;
  onApplyProposal: BitekApplyProposal;
  disabled?: boolean;
};

const TONE_CLASS: Record<string, string> = {
  info: "border-l-[var(--brd-line)]",
  ok: "border-l-[var(--brd-green)]",
  warn: "border-l-[var(--brd-rec)]",
  tip: "border-l-[var(--brd-amber)]",
};

/**
 * Stage 1 — BITEK v1 panel (rule-based guide). `brain` is the seam for the
 * stage-2b language model; the chat input is rendered disabled ("soon").
 */
export function StudioBitekPanel({
  state,
  onAction,
  compact: compactProp = false,
  brain = bitekRulesBrain,
  chat,
}: {
  state: BitekState;
  onAction: (action: BitekAction) => void;
  compact?: boolean;
  brain?: BitekBrain;
  chat?: StudioBitekChatProps;
}) {
  const t = useTranslations("studio.bitek");
  const [expanded, setExpanded] = useState(false);
  const compact = compactProp && !expanded;
  const messages = brain.guide(state);
  const shown = compact ? messages.slice(0, 1) : messages;
  return (
    <section
      data-testid="studio-bitek-panel"
      data-bitek-brain={brain.kind}
      aria-label={t("panelAria")}
      className={
        compact
          ? "flex flex-wrap items-center gap-2 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2 py-1.5"
          : "flex flex-col gap-2 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3"
      }
    >
      <header className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--brd-amber)] font-mono text-xs font-bold text-[#1a1006]"
        >
          B
        </span>
        <div className="min-w-0">
          <p className="brd-display text-base leading-none tracking-wide">{t("nazwa")}</p>
          {compact ? null : <p className="text-xs text-[var(--brd-mute)]">{t("podtytul")}</p>}
        </div>
      </header>
      <ul
        aria-live="polite"
        className={compact ? "flex min-w-0 flex-1 flex-wrap items-center gap-2" : "flex flex-col gap-2"}
      >
        {shown.map((m) => (
          <li
            key={m.id}
            data-testid="studio-bitek-message"
            data-bitek-key={m.key}
            className={`flex min-w-0 flex-wrap items-center gap-2 border-l-2 pl-2 text-sm ${TONE_CLASS[m.tone]}`}
          >
            <span className="min-w-0 flex-1">{t(`msg.${m.key}`, m.params ?? {})}</span>
            {m.action ? (
              <Button
                type="button"
                size="sm"
                variant={m.action === "goMix" ? "default" : "outline"}
                className="min-h-9"
                data-testid={`studio-bitek-action-${m.action}`}
                onClick={() => onAction(m.action as BitekAction)}
              >
                {t(`akcja.${m.action}`)}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {chat && compactProp ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-9"
          aria-expanded={expanded}
          data-testid="studio-bitek-toggle-chat"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t("chat.zwin") : t("chat.otworz")}
        </Button>
      ) : null}
      {chat && !compact ? <StudioBitekChat {...chat} /> : null}
    </section>
  );
}
