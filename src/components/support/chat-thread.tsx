"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { intlTag, resolveLocale } from "@/i18n/config";
import { BODY_MAX, isRead, pollDelayMs, type SupportMessage, type SupportSide, type SupportThread } from "@/lib/support/support-policy";
import { cn } from "@/lib/utils";

type Conversation = { thread: SupportThread; messages: SupportMessage[] };

/**
 * One conversation, messenger style: own messages on the right with ✓ / ✓✓, the other side on the left.
 * New messages arrive by polling, only while the page is visible.
 */
export function ChatThread({ endpoint, side, initial }: { endpoint: string; side: SupportSide; initial: Conversation }) {
  const t = useTranslations("support.chat");
  const tag = intlTag(resolveLocale(useLocale()));
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const quietSince = useRef(0);
  const count = data.messages.length;

  const refresh = useCallback(async () => {
    const res = await fetch(endpoint, { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? ((await res.json().catch(() => null)) as (Conversation & { result: string }) | null) : null;
    if (!json || json.result !== "ok") return;
    setData((current) => {
      if (json.messages.length !== current.messages.length) quietSince.current = Date.now();
      return { thread: json.thread, messages: json.messages };
    });
  }, [endpoint]);

  useEffect(() => {
    quietSince.current = Date.now();
    let timer: number | undefined;
    let stopped = false;
    const plan = () => {
      window.clearTimeout(timer);
      if (stopped || document.visibilityState !== "visible") return;
      timer = window.setTimeout(async () => {
        await refresh();
        plan();
      }, pollDelayMs(Date.now() - quietSince.current));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
      plan();
    };
    plan();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // Stay at the newest message (the list scrolls, not the page).
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [count]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) }).catch(() => null);
    if (res?.ok) {
      setDraft("");
      quietSince.current = Date.now();
      await refresh();
    } else {
      setError(res?.status === 429 ? t("limit") : res?.status === 401 ? t("signedOut") : t("failed"));
    }
    setSending(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // With a keyboard and mouse Enter sends and Shift+Enter breaks the line; on touch Enter breaks the line.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    event.preventDefault();
    void send();
  }

  const day = (iso: string) => new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" }).format(new Date(iso));
  const time = (iso: string) => new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }).format(new Date(iso));

  return (
    <div className="border border-[var(--brd-line)]" data-testid="support-chat">
      <ol ref={listRef} role="log" aria-live="polite" aria-label={t("log")} className="flex max-h-[55dvh] min-h-48 flex-col gap-2 overflow-y-auto p-3">
        {data.messages.map((message, index) => {
          const own = message.sender === side;
          const newDay = index === 0 || day(message.createdAt) !== day(data.messages[index - 1].createdAt);
          const read = own && isRead(message, data.thread);
          return (
            <li key={message.id} className="flex flex-col gap-2">
              {newDay ? <p className="self-center text-xs text-[var(--brd-mute)]" suppressHydrationWarning>{day(message.createdAt)}</p> : null}
              <div
                data-own={own ? "true" : "false"}
                className={cn(
                  "max-w-[85%] rounded-2xl border px-3 py-2",
                  own
                    ? "self-end rounded-br-sm border-[var(--brd-green)] bg-[color-mix(in_srgb,var(--brd-green)_14%,transparent)]"
                    : "self-start rounded-bl-sm border-[var(--brd-line)] bg-[var(--brd-paper-deep)]",
                )}
              >
                <p className="text-xs font-semibold text-[var(--brd-mute)]">
                  {own ? t("you") : side === "user" ? t("team") : t("user")}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-[var(--brd-ink)]">{message.body}</p>
                <p className="mt-1 text-right text-xs text-[var(--brd-mute)]" suppressHydrationWarning>
                  {time(message.createdAt)}
                  {own ? (
                    <span className={cn("ml-1", read && "text-[var(--brd-green)]")} title={t(read ? "read" : "sent")}>
                      <span aria-hidden="true">{read ? "✓✓" : "✓"}</span>
                      <span className="sr-only">{t(read ? "read" : "sent")}</span>
                    </span>
                  ) : null}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <form onSubmit={send} className="flex items-end gap-2 border-t border-[var(--brd-line)] p-2">
        <label htmlFor="support-reply" className="sr-only">{t("write")}</label>
        <textarea
          id="support-reply"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={BODY_MAX}
          placeholder={t("write")}
          className="min-h-11 min-w-0 flex-1 resize-y border border-[var(--brd-line)] bg-transparent px-3 py-2 text-base text-[var(--brd-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
        />
        <Button type="submit" disabled={sending || !draft.trim()} className="min-h-11">{t("send")}</Button>
      </form>
      {error ? <p role="alert" className="px-3 pb-2 text-sm text-[var(--brd-rec)]">{error}</p> : null}
    </div>
  );
}
