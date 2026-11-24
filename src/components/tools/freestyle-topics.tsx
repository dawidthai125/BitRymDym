"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { draw, FREESTYLE_TOPICS, FREESTYLE_WORDS } from "@/lib/tools/freestyle";
import { toolInput, toolPanel, toolPrimary, toolSecondary } from "@/components/tools/tool-ui";

const MODES = [
  { id: "topic", label: "Temat", source: FREESTYLE_TOPICS, count: 1 },
  { id: "words3", label: "3 słowa", source: FREESTYLE_WORDS, count: 3 },
  { id: "word", label: "1 słowo", source: FREESTYLE_WORDS, count: 1 },
] as const;
type ModeId = (typeof MODES)[number]["id"];
const INTERVALS = [10, 15, 20, 30, 45, 60];

/** Random freestyle topics / words, with an optional timer that changes them by itself. */
export function FreestyleTopics() {
  const [modeId, setModeId] = useState<ModeId>("topic");
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [seconds, setSeconds] = useState(20);
  const [left, setLeft] = useState<number | null>(null);
  const bags = useRef<Partial<Record<ModeId, readonly string[]>>>({});

  const next = useCallback((id: ModeId) => {
    const mode = MODES.find((m) => m.id === id)!;
    const result = draw<string>(bags.current[id] ?? [], mode.source, mode.count);
    bags.current[id] = result.bag;
    setPicked(result.picked);
  }, []);

  const running = left !== null;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setLeft((v) => (v === null ? null : v - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (left !== 0) return;
    const id = window.setTimeout(() => {
      next(modeId);
      setLeft(seconds);
    }, 0);
    return () => window.clearTimeout(id);
  }, [left, modeId, next, seconds]);

  const choose = (id: ModeId) => {
    setModeId(id);
    next(id);
    if (running) setLeft(seconds);
  };

  return (
    <section className={toolPanel} aria-label="Losowanie tematów do freestyle" data-testid="tool-freestyle">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Co losować">
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={modeId === m.id} onClick={() => choose(m.id)} className={modeId === m.id ? toolPrimary : toolSecondary}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="brd-display mt-6 min-h-24 break-words text-4xl leading-tight text-[var(--brd-ink)] sm:text-5xl" aria-live="polite" data-testid="freestyle-result">
        {picked.length ? picked.join(" · ") : "Kliknij Losuj"}
      </p>
      {running ? <p className="brd-meta text-sm text-[var(--brd-mute)]">Zmiana za {left} s</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${toolPrimary} min-w-32`}
          onClick={() => {
            next(modeId);
            if (running) setLeft(seconds);
          }}
          data-testid="freestyle-draw"
        >
          Losuj
        </button>
        <button
          type="button"
          className={toolSecondary}
          onClick={() => {
            if (running) return setLeft(null);
            if (picked.length === 0) next(modeId);
            setLeft(seconds);
          }}
        >
          {running ? "Zatrzymaj zmiany" : "Zmieniaj sam"}
        </button>
        <label className="flex items-center gap-2 text-sm text-[var(--brd-ink-soft)]">
          co
          <select
            className={toolInput}
            value={seconds}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSeconds(v);
              if (running) setLeft(v);
            }}
          >
            {INTERVALS.map((s) => (
              <option key={s} value={s}>{s} s</option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs text-[var(--brd-mute)]">{FREESTYLE_TOPICS.length} tematów i {FREESTYLE_WORDS.length} słów. Nic się nie powtarza, dopóki lista się nie skończy.</p>
    </section>
  );
}
