"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { beatGenerationPercent } from "@/lib/beats/ai-beat/generation-progress";

const fieldClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm";
const REVIEW = "Oceń ten bit technicznie na podstawie zapisanych faktów.";

type ChatItem = {
  role: "user" | "assistant";
  content: string;
  hidden?: boolean;
};

type PollBody = {
  generationId: string;
  title: string;
  description: string;
  bpm: number | null;
  style: string | null;
  opis: string | null;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const json = (await res.json()) as unknown;
    return json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function AdminBeatBitek({
  beatId,
  autoReview = false,
  onRevised,
}: {
  beatId: string;
  autoReview?: boolean;
  onRevised?: (beatId: string) => void;
}) {
  const t = useTranslations("admin.adminBeatsGeneratePage");
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [question, setQuestion] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [talking, setTalking] = useState(false);
  const [revisionPhase, setRevisionPhase] = useState<"starting" | "waiting" | null>(null);
  const [revisionPolls, setRevisionPolls] = useState(0);
  const live = useRef(true);
  const reviewed = useRef<string | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  async function ask(content: string, hidden: boolean) {
    const text = content.replace(/\s+/g, " ").trim();
    if (!text || lock.current) return;
    lock.current = true;
    setError(null);
    setTalking(true);
    const next = [...chat, { role: "user" as const, content: text, hidden }];
    setChat(next);
    try {
      const res = await fetch("/api/admin/beats/generate/bitek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "talk",
          beatId,
          messages: next.map((item) => ({ role: item.role, content: item.content })),
        }),
      });
      const json = await readJson(res);
      if (!live.current) return;
      const reply = textOf(json.reply);
      if (!res.ok || !reply) {
        setError(textOf(json.error) || t("bitekBlad"));
        return;
      }
      setChat((current) => [...current, { role: "assistant", content: reply }]);
    } catch {
      if (live.current) setError(t("bitekBlad"));
    } finally {
      lock.current = false;
      if (live.current) setTalking(false);
    }
  }

  useEffect(() => {
    if (!autoReview || reviewed.current === beatId) return;
    reviewed.current = beatId;
    void ask(REVIEW, true);
    // The opening review runs once per beat. Later questions use the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReview, beatId]);

  async function revise() {
    const text = note.replace(/\s+/g, " ").trim();
    if (!text || lock.current) return;
    lock.current = true;
    setError(null);
    setNotice(null);
    setRevisionPhase("starting");
    setRevisionPolls(0);
    try {
      const startRes = await fetch("/api/admin/beats/generate/bitek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revise", beatId, note: text }),
      });
      const startJson = await readJson(startRes);
      if (!live.current) return;
      const generationId = textOf(startJson.generationId);
      const description = textOf(startJson.description);
      if (!startRes.ok || !generationId || !description) {
        setRevisionPhase(null);
        setError(textOf(startJson.error) || t("bitekBlad"));
        return;
      }
      const pollBody: PollBody = {
        generationId,
        title: textOf(startJson.title),
        description,
        bpm: typeof startJson.bpm === "number" ? startJson.bpm : null,
        style: typeof startJson.style === "string" ? startJson.style : null,
        opis: typeof startJson.opis === "string" ? startJson.opis : null,
      };
      setRevisionPhase("waiting");
      const deadline = Date.now() + 4 * 60 * 1000;
      let polls = 0;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        if (!live.current) return;
        const resultRes = await fetch("/api/admin/beats/generate/result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pollBody),
        });
        const resultJson = await readJson(resultRes);
        if (!live.current) return;
        if (!resultRes.ok || resultJson.success === false) {
          setRevisionPhase(null);
          setError(textOf(resultJson.error) || t("bitekBlad"));
          return;
        }
        if (resultJson.status === "pending") {
          polls += 1;
          setRevisionPolls(polls);
          continue;
        }
        if (resultJson.status === "ready" && textOf(resultJson.beatId)) {
          setRevisionPhase(null);
          setNote("");
          setNotice(t("bitekGotowa"));
          onRevised?.(textOf(resultJson.beatId));
          return;
        }
      }
      setRevisionPhase(null);
      setError(t("czasMinal"));
    } catch {
      if (!live.current) return;
      setRevisionPhase(null);
      setError(t("bitekBlad"));
    } finally {
      lock.current = false;
    }
  }

  const busy = talking || revisionPhase !== null;
  const percent =
    revisionPhase === null ? null : beatGenerationPercent(revisionPhase, revisionPolls);
  const visible = chat.filter((item) => !item.hidden);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t("bitekTytul")}</h3>
        <p className="text-xs text-muted-foreground">{t("bitekFakty")}</p>
      </div>

      {visible.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {visible.map((item, index) => (
            <li
              key={`${item.role}-${index}`}
              className="text-sm break-words"
            >
              <span className="text-muted-foreground">
                {item.role === "assistant" ? t("bitekTytul") : t("bitekTy")}:{" "}
              </span>
              {item.content}
            </li>
          ))}
        </ul>
      ) : null}

      {talking ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("bitekMysli")}
        </p>
      ) : null}

      {percent !== null ? (
        <div className="flex flex-col gap-1">
          <div
            className="h-2 overflow-hidden rounded-full border border-border bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t("postep")}
          >
            <div className="h-full bg-foreground" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("procent", { percent })}
          </p>
        </div>
      ) : null}

      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">{t("bitekPytanie")}</span>
        <textarea
          className={`${fieldClass} min-h-16`}
          value={question}
          maxLength={500}
          disabled={busy}
          placeholder={t("bitekPlaceholder")}
          onChange={(event) => setQuestion(event.target.value)}
        />
      </label>
      <div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={busy || question.trim() === ""}
          onClick={() => {
            const text = question;
            setQuestion("");
            void ask(text, false);
          }}
        >
          {t("bitekWyslij")}
        </Button>
      </div>

      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">{t("bitekPoprawka")}</span>
        <textarea
          className={`${fieldClass} min-h-16`}
          value={note}
          maxLength={400}
          disabled={busy}
          placeholder={t("bitekPoprawkaPlaceholder")}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <p className="text-xs text-muted-foreground">{t("bitekNowa")}</p>
      <div>
        <Button
          type="button"
          className="min-h-11"
          disabled={busy || note.trim() === ""}
          onClick={() => void revise()}
        >
          {t("bitekPopraw")}
        </Button>
      </div>

      {notice ? (
        <p className="text-sm" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
