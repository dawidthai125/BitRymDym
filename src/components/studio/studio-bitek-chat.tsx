"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { BitekClientContext } from "@/lib/studio/bitek/chat/client-context";
import { BITEK_LIMITS, type BitekChatResult, type BitekProposal } from "@/lib/studio/bitek/chat/types";
import type { BitekStoredMessage } from "@/lib/studio/bitek/store/messages";
import type { BitekProjectStore } from "@/components/studio/use-bitek-project";

export type BitekApplyProposal = (trackId: string, patch: Record<string, number | boolean>) => void;

type Entry =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; provider: BitekChatResult["provider"] | null; proposals: BitekProposal[]; note: boolean };

function entriesFromStore(messages: readonly BitekStoredMessage[]): Entry[] {
  const out: Entry[] = [];
  for (const m of messages) {
    if (m.kind === "state") continue;
    if (m.kind === "chat" && m.role === "user") {
      out.push({ id: m.id, role: "user", content: m.content });
      continue;
    }
    const meta = m.meta as { provider?: BitekChatResult["provider"]; proposals?: BitekProposal[] };
    out.push({
      id: m.id,
      role: "assistant",
      content: m.content,
      provider: m.kind === "chat" ? (meta.provider ?? "rules") : null,
      proposals: m.kind === "chat" && Array.isArray(meta.proposals) ? meta.proposals : [],
      note: m.kind !== "chat",
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
}: {
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
  const [applied, setApplied] = useState<Record<string, number[]>>({});
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
      const { context } = getContext();
      const res = await fetch("/api/studio/bitek/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, context, projectId }),
      });
      if (res.status === 429) {
        setError(t("limit"));
        return;
      }
      const json = (await res.json()) as Partial<BitekChatResult> & { success?: boolean };
      if (!res.ok || !json.success || typeof json.reply !== "string") {
        setError(t("blad"));
        return;
      }
      store.addLocal([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          kind: "chat",
          content: json.reply as string,
          meta: { provider: json.provider ?? "rules", proposals: Array.isArray(json.proposals) ? json.proposals : [] },
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

  function apply(entryId: string, index: number, p: BitekProposal) {
    // Map the model-facing ref back to a real track id on the client, against the *current* doc.
    const trackId = getContext().trackIdByRef[p.trackRef];
    if (!trackId) return;
    onApplyProposal(trackId, { [p.param]: p.value });
    setApplied((prev) => ({ ...prev, [entryId]: [...(prev[entryId] ?? []), index] }));
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
                <ul className="flex flex-col gap-1">
                  {e.proposals.map((p, i) => {
                    const done = (applied[e.id] ?? []).includes(i);
                    return (
                      <li key={`${p.trackRef}-${p.param}`} className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs">{p.label || `${p.trackRef} ${p.param} ${String(p.value)}`}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant={done ? "outline" : "default"}
                          className="min-h-9"
                          disabled={done || disabled}
                          aria-label={t("propozycjaAria", { label: p.label || p.param })}
                          data-testid="studio-bitek-apply"
                          onClick={() => apply(e.id, i, p)}
                        >
                          {done ? "✓" : t("zastosuj")}
                        </Button>
                      </li>
                    );
                  })}
                  {applied[e.id]?.length ? <li className="text-xs text-[var(--brd-mute)]">{t("zastosowano")}</li> : null}
                </ul>
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
          <span>{store.available ? t("zapisProjekt") : t("zapisLokalny")}</span>
        </div>
      </form>
    </div>
  );
}
