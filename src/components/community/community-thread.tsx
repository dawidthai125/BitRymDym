"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

type ThreadComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

type Props = {
  kind: "beat" | "sample";
  targetId: string;
  signedIn: boolean;
  own: boolean;
  enabled: boolean;
  commentsOpen: boolean;
  average: number | null;
  count: number;
  mine: number | null;
  comments: ThreadComment[];
};

export function CommunityThread(props: Props) {
  const t = useTranslations("community.thread");
  const off = useTranslations("community");
  const [stars, setStars] = useState(props.mine);
  const [count, setCount] = useState(props.count);
  const [average, setAverage] = useState(props.average);
  const [comments, setComments] = useState(props.comments);
  const [note, setNote] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function rate(value: number) {
    setBusy(true);
    setNote(null);
    const response = await fetch("/api/community/rate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: props.kind, id: props.targetId, stars: value }),
    });
    const payload = (await response.json().catch(() => ({}))) as { result?: string };
    setBusy(false);
    if (payload.result === "ok") {
      setStars(value);
      if (props.mine == null && stars == null) setCount((n) => n + 1);
      setAverage((current) => {
        const base = current ?? 0;
        const nextCount = props.mine == null && stars == null ? count + 1 : count || 1;
        const previousMine = stars ?? props.mine ?? 0;
        const had = stars != null || props.mine != null;
        const sum = had ? base * count - previousMine + value : base * count + value;
        return sum / nextCount;
      });
      setNote(t("saved"));
      return;
    }
    setNote(payload.result === "own" ? t("own") : payload.result === "off" ? off("off") : t("invalid"));
  }

  async function sendComment(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    const response = await fetch("/api/community/comment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: props.kind, id: props.targetId, body }),
    });
    const payload = (await response.json().catch(() => ({}))) as { result?: string };
    setBusy(false);
    if (payload.result === "ok") {
      setComments((current) => [
        ...current,
        { id: `local-${current.length}`, author: t("you"), body: body.trim(), createdAt: new Date().toISOString() },
      ]);
      setBody("");
      setNote(t("saved"));
      return;
    }
    setNote(
      payload.result === "limit"
        ? t("limit")
        : payload.result === "closed"
          ? t("commentsOff")
          : payload.result === "off"
            ? off("off")
            : t("invalid"),
    );
  }

  if (!props.enabled) {
    return <p className="text-sm text-[var(--brd-mute)]">{off("off")}</p>;
  }

  return (
    <section aria-labelledby={`community-${props.targetId}`} className="mt-8 space-y-4 border-t border-[var(--brd-line)] pt-4">
      <h2 id={`community-${props.targetId}`} className="font-poster text-lg font-bold uppercase tracking-[0.08em]">
        {props.commentsOpen ? t("comments") : t("rate")}
      </h2>
      <p className="text-sm text-[var(--brd-ink-soft)]">
        {average != null ? t("average", { score: average.toFixed(1), count }) : t("empty")}
      </p>
      {props.signedIn ? (
        <fieldset className="flex flex-wrap items-center gap-2" disabled={busy || props.own}>
          <legend className="sr-only">{t("rate")}</legend>
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center border border-[var(--brd-line)] px-2 text-sm">
              <input
                type="radio"
                name={`stars-${props.targetId}`}
                value={value}
                checked={stars === value}
                onChange={() => void rate(value)}
                className="sr-only"
              />
              <span aria-hidden="true">{value}</span>
              <span className="sr-only">{value}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm">
          <Link href="/sign-in" className="underline underline-offset-4">{t("signIn")}</Link>
        </p>
      )}
      {props.own ? <p className="text-sm text-[var(--brd-mute)]">{t("own")}</p> : null}
      {props.commentsOpen ? null : <p className="text-sm text-[var(--brd-mute)]">{t("commentsOff")}</p>}
      {props.commentsOpen && props.signedIn ? (
        <form onSubmit={(event) => void sendComment(event)} className="space-y-2">
          <label className="block text-sm" htmlFor={`comment-${props.targetId}`}>{t("comment")}</label>
          <textarea
            id={`comment-${props.targetId}`}
            value={body}
            maxLength={500}
            rows={3}
            onChange={(event) => setBody(event.target.value)}
            className="w-full border border-[var(--brd-line)] bg-transparent px-3 py-2 text-sm text-[var(--brd-ink)]"
          />
          <button type="submit" disabled={busy || body.trim().length === 0} className="inline-flex min-h-11 items-center px-3 text-sm underline underline-offset-4 disabled:opacity-50">
            {t("send")}
          </button>
        </form>
      ) : null}
      {note ? <p role="status" className="text-sm">{note}</p> : null}
      {props.commentsOpen && comments.length > 0 ? (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="border-b border-[var(--brd-line)] pb-3">
              <p className="text-xs text-[var(--brd-mute)]">{comment.author}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--brd-ink)]">{comment.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
