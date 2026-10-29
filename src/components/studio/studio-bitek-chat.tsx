"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { BitekClientContext } from "@/lib/studio/bitek/chat/client-context";
import {
  bitekDecisionsByEntry,
  isBitekDecisionNote,
  lastBitekChange,
  toContextLastChange,
  type BitekDecision,
  type BitekStoredChange,
} from "@/lib/studio/bitek/chat/decisions";
import { BITEK_LIMITS, BITEK_MASTER_REF, type BitekChatResult, type BitekMasterSetting, type BitekProposal } from "@/lib/studio/bitek/chat/types";
import type { BitekStoredMessage } from "@/lib/studio/bitek/store/messages";
import type { BitekProjectStore } from "@/components/studio/use-bitek-project";

export type BitekApplyProposal = (trackId: string, patch: Record<string, number | boolean>) => void;

type Entry =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; provider: BitekChatResult["provider"] | null; proposals: BitekProposal[]; note: boolean; backToMix: boolean };

function entriesFromStore(messages: readonly BitekStoredMessage[]): Entry[] {
  const out: Entry[] = [];
  for (const m of messages) {
    if (m.kind === "state" || isBitekDecisionNote(m)) continue;
    if (m.kind === "chat" && m.role === "user") {
      out.push({ id: m.id, role: "user", content: m.content });
      continue;
    }
    const meta = m.meta as { provider?: BitekChatResult["provider"]; proposals?: BitekProposal[]; backToMix?: boolean };
    out.push({
      id: m.id,
      role: "assistant",
      content: m.content,
      provider: m.kind === "chat" ? (meta.provider ?? "rules") : null,
      proposals: m.kind === "chat" && Array.isArray(meta.proposals) ? meta.proposals : [],
      note: m.kind !== "chat",
      backToMix: m.kind === "chat" && meta.backToMix === true,
    });
  }
  return out.slice(-60);
}

/** BITEK chat: history per project (DB), typing indicator, "Apply" buttons for validated proposals. */
export function StudioBitekChat({
  projectId,
  getContext,
  onApplyProposal,
  disabled,
  store,
  onBusyChange,
  onApplyMasterProposal,
  onBackToMix,
}: {
  /** Stage 3 — whole-song setting proposals (trackRef "master"). */
  onApplyMasterProposal?: (key: BitekMasterSetting, value: number) => void;
  /** Stage 3 — shown under a Mastering reply that needs Mix work. */
  onBackToMix?: () => void;
  projectId: string;
  getContext: () => BitekClientContext;
  onApplyProposal: BitekApplyProposal;
  disabled?: boolean;
  store: BitekProjectStore;
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useTranslations("studio.bitek.chat");
  const inputId = useId();
  const entries = entriesFromStore(store.messages);
  const decisions = bitekDecisionsByEntry(store.messages);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [entries.length, busy]);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const tooLong = text.length > BITEK_LIMITS.messageMaxChars;

  async function send() {
    const message = text.trim();
    if (!message || busy || tooLong) return;
    const history = store.messages
      .filter((m) => m.kind === "chat")
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));
    store.addLocal([{ id: crypto.randomUUID(), role: "user", kind: "chat", content: message, meta: {}, createdAt: new Date().toISOString() }]);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const { context, trackIdByRef } = getContext();
      // Conversational mode: "więcej / za dużo / cofnij" act on the last change the user applied.
      const lastChange = toContextLastChange(lastBitekChange(store.messages), trackIdByRef);
      const res = await fetch("/api/studio/bitek/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, context: { ...context, lastChange }, projectId }),
      });
      if (res.status === 429) {
        setError(t("limit"));
        return;
      }
      const json = (await res.json()) as Partial<BitekChatResult> & {
        success?: boolean;
        messageIds?: { user?: string; assistant?: string };
      };
      if (!res.ok || !json.success || typeof json.reply !== "string") {
        setError(t("blad"));
        return;
      }
      store.addLocal([
        {
          // DB id when saved, so Zostaw/Cofnij decisions stay attached to this reply after a reload.
          id: typeof json.messageIds?.assistant === "string" ? json.messageIds.assistant : crypto.randomUUID(),
          role: "assistant",
          kind: "chat",
          content: json.reply as string,
          meta: { provider: json.provider ?? "rules", proposals: Array.isArray(json.proposals) ? json.proposals : [], ...(json.backToMix ? { backToMix: true } : {}) },
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch {
      setError(t("blad"));
    } finally {
      setBusy(false);
      // Keep focus in the chat after the reply (the input was disabled while waiting).
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function recordDecision(entryId: string, decision: BitekDecision, changes: BitekStoredChange[], labels: string[]) {
    const key = decision === "applied" ? "notatkaZastosowano" : decision === "kept" ? "notatkaZostawiono" : "notatkaCofnieto";
    store.append(
      [{ kind: "note", content: t(key, { labels: labels.join("; ").slice(0, 400) }), meta: { bitekChange: { entryId, decision, changes } } }],
      // Session memory (Free): decisions stay in this tab like the chat itself.
      { localOnly: store.memory === "session" },
    );
  }

  /** Apply one value to a track or the whole song; returns the value it had before. */
  function applyValue(target: string, param: BitekProposal["param"], value: number | boolean): number | boolean | null {
    const { context, trackIdByRef } = getContext();
    if (target === BITEK_MASTER_REF) {
      if (!onApplyMasterProposal || typeof value !== "number") return null;
      const from = context.master?.settings[param as BitekMasterSetting] ?? 0;
      onApplyMasterProposal(param as BitekMasterSetting, value);
      return from;
    }
    const ref = Object.keys(trackIdByRef).find((r) => trackIdByRef[r] === target);
    const track = context.tracks.find((x) => x.ref === ref);
    if (!track) return null;
    const from = param === "gainDb" ? track.gainDb : param === "pan" ? track.pan : param === "muted" ? track.muted : null;
    if (from === null) return null;
    onApplyProposal(target, { [param]: value });
    return from;
  }

  function apply(entry: Extract<Entry, { role: "assistant" }>, index: number, p: BitekProposal) {
    // Map the model-facing ref back to a real track id on the client, against the *current* doc.
    const target = p.trackRef === BITEK_MASTER_REF ? BITEK_MASTER_REF : getContext().trackIdByRef[p.trackRef];
    if (!target) return;
    const from = applyValue(target, p.param, p.value);
    if (from === null) return;
    const prev = decisions.get(entry.id);
    const kept = prev && prev.decision !== "undone" ? prev.changes.filter((c) => c.i !== index) : [];
    const changes = [...kept, { i: index, target, param: p.param, from, to: p.value }];
    recordDecision(entry.id, "applied", changes, changes.map((c) => entry.proposals[c.i]?.label ?? p.label));
  }

  function keep(entry: Extract<Entry, { role: "assistant" }>) {
    const d = decisions.get(entry.id);
    if (!d) return;
    recordDecision(entry.id, "kept", d.changes, d.changes.map((c) => entry.proposals[c.i]?.label ?? ""));
  }

  function undo(entry: Extract<Entry, { role: "assistant" }>) {
    const d = decisions.get(entry.id);
    if (!d) return;
    for (const c of [...d.changes].reverse()) applyValue(c.target, c.param, c.from);
    recordDecision(entry.id, "undone", d.changes, d.changes.map((c) => entry.proposals[c.i]?.label ?? ""));
  }

  return (
    <div className="flex flex-col gap-2" data-testid="studio-bitek-chat">
      <p className="text-xs text-[var(--brd-mute)]">{t("info")}</p>
      <ol
        ref={listRef}
        aria-live="polite"
        aria-relevant="additions"
        className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1"
      >
        {entries.length === 0 ? (
          <li className="border-l-2 border-l-[var(--brd-amber)] pl-2 text-sm">{t("powitanie")}</li>
        ) : null}
        {entries.map((e) =>
          e.role === "user" ? (
            <li key={e.id} data-testid="studio-bitek-chat-user" className="self-end max-w-[90%] rounded-[2px] bg-[var(--brd-recess)] px-2 py-1 text-sm">
              <span className="sr-only">{t("ty")}: </span>
              {e.content}
            </li>
          ) : (
            <li key={e.id} data-testid={e.note ? "studio-bitek-chat-note" : "studio-bitek-chat-reply"} data-provider={e.provider ?? "note"} className="flex flex-col gap-1 border-l-2 border-l-[var(--brd-amber)] pl-2 text-sm">
              <span>{e.content}</span>
              {e.proposals.length ? (
                <ul className="flex flex-col gap-1.5">
                  {e.proposals.map((p, i) => {
                    const d = decisions.get(e.id);
                    const done = Boolean(d && d.decision !== "undone" && d.changes.some((c) => c.i === i));
                    return (
                      <li key={`${p.trackRef}-${p.param}`} className="flex flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs">{p.label || `${p.trackRef} ${p.param} ${String(p.value)}`}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant={done ? "outline" : "default"}
                            className="min-h-9"
                            disabled={done || disabled}
                            aria-label={t("propozycjaAria", { label: p.label || p.param })}
                            data-testid="studio-bitek-apply"
                            onClick={() => apply(e, i, p)}
                          >
                            {done ? "✓" : t("zastosuj")}
                          </Button>
                        </div>
                        {p.why ? (
                          <span data-testid="studio-bitek-why" className="text-xs text-[var(--brd-mute)]">
                            {p.why}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                  <BitekDecisionRow
                    decision={decisions.get(e.id)?.decision ?? null}
                    disabled={disabled}
                    onKeep={() => keep(e)}
                    onUndo={() => undo(e)}
                  />
                </ul>
              ) : null}
              {e.backToMix && onBackToMix ? (
                <Button type="button" size="sm" variant="outline" className="min-h-9 self-start" data-testid="studio-bitek-back-to-mix" onClick={onBackToMix}>
                  ← {t("wrocDoMixu")}
                </Button>
              ) : null}
              <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--brd-mute)]">
                {e.provider ? t(`dostawca.${e.provider}`) : t("notatka")}
              </span>
            </li>
          ),
        )}
        {busy ? (
          <li data-testid="studio-bitek-typing" className="text-sm italic text-[var(--brd-mute)]">
            {t("pisze")}
          </li>
        ) : null}
      </ol>
      {error ? (
        <p role="alert" className="border-l-2 border-l-[var(--brd-rec)] pl-2 text-sm">
          {error}
        </p>
      ) : null}
      <form
        className="flex flex-col gap-1"
        onSubmit={(ev) => {
          ev.preventDefault();
          void send();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {t("inputLabel")}
        </label>
        <div className="flex gap-1">
          <input
            id={inputId}
            ref={inputRef}
            data-testid="studio-bitek-input"
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            placeholder={t("placeholder")}
            aria-invalid={tooLong || undefined}
            aria-describedby={`${inputId}-count`}
            maxLength={BITEK_LIMITS.messageMaxChars + 50}
            autoComplete="off"
            className="h-9 min-w-0 flex-1 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-recess)] px-2 text-sm"
          />
          <Button type="submit" size="sm" className="min-h-9" disabled={busy || !text.trim() || tooLong} data-testid="studio-bitek-send">
            {t("wyslij")}
          </Button>
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--brd-mute)]">
          <span id={`${inputId}-count`} className={tooLong ? "text-[var(--brd-rec)]" : undefined}>
            {tooLong ? t("zaDlugie", { max: BITEK_LIMITS.messageMaxChars }) : t("licznik", { n: text.length, max: BITEK_LIMITS.messageMaxChars })}
          </span>
          <span data-testid="studio-bitek-memory" data-memory={store.memory}>
            {store.memory === "session" ? t("zapisSesja") : store.available ? t("zapisProjekt") : t("zapisLokalny")}
          </span>
        </div>
      </form>
    </div>
  );
}

/** After "Zastosuj": keep it or roll it back (Cofnij re-applies the values from before). */
function BitekDecisionRow({
  decision,
  disabled,
  onKeep,
  onUndo,
}: {
  decision: BitekDecision | null;
  disabled?: boolean;
  onKeep: () => void;
  onUndo: () => void;
}) {
  const t = useTranslations("studio.bitek.chat");
  if (!decision) return null;
  if (decision === "kept") {
    return (
      <li data-testid="studio-bitek-decision" data-decision="kept" className="text-xs text-[var(--brd-mute)]">
        ✓ {t("zostawione")}
      </li>
    );
  }
  if (decision === "undone") {
    return (
      <li data-testid="studio-bitek-decision" data-decision="undone" className="text-xs text-[var(--brd-mute)]">
        ↺ {t("cofniete")}
      </li>
    );
  }
  return (
    <li data-testid="studio-bitek-decision" data-decision="applied" className="flex flex-wrap items-center gap-2">
      <span className="text-xs">{t("pasuje")}</span>
      <Button type="button" size="sm" className="min-h-9" disabled={disabled} data-testid="studio-bitek-keep" onClick={onKeep}>
        {t("zostaw")}
      </Button>
      <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={disabled} data-testid="studio-bitek-undo" onClick={onUndo}>
        {t("cofnij")}
      </Button>
    </li>
  );
}
