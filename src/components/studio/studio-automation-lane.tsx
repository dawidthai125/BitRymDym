"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  AUTOMATION_LIMITS,
  type AutomationParam,
  type AutomationPoint,
  type StudioAutomationV1,
  automationLane,
  clampAutomationValue,
  emptyAutomation,
  parseAutomationForWrite,
} from "@/lib/studio/studio-automation";

type Props = {
  trackId: string;
  automation: StudioAutomationV1 | undefined;
  /** Static value used while the lane has no points (the track's gain in dB or pan). */
  staticValue: number;
  param: AutomationParam;
  timelineLengthMs: number;
  pxPerMs: number;
  laneHeightPx: number;
  disabled?: boolean;
  onChangeParam: (param: AutomationParam) => void;
  onClose: () => void;
  /** Persist the whole automation document (one CAS write per gesture). */
  onCommit: (next: StudioAutomationV1) => void;
};

const PAD = 8;
const POINT_R = 6;
const MIN_GAP_MS = 20;

/** Replace one parameter's lane in the document (an empty lane is dropped). */
export function withLane(auto: StudioAutomationV1 | undefined, param: AutomationParam, points: AutomationPoint[]): StudioAutomationV1 {
  const others = (auto ?? emptyAutomation()).lanes.filter((l) => l.param !== param);
  const lanes = points.length ? [...others, { param, points }] : others;
  return { v: 1, lanes };
}

/** Value range shown vertically: top = max, bottom = min. */
function range(param: AutomationParam) {
  return AUTOMATION_LIMITS.range[param];
}

/**
 * Gain / pan envelope editor over one track lane (Silver/Gold). Click empty space to add a point, drag a point
 * to move it, double-click (or Delete) to remove it, arrow keys nudge the focused point. Drags are local; one
 * write happens when the pointer is released.
 */
export function StudioAutomationLane({
  trackId,
  automation,
  staticValue,
  param,
  timelineLengthMs,
  pxPerMs,
  laneHeightPx,
  disabled = false,
  onChangeParam,
  onClose,
  onCommit,
}: Props) {
  const t = useTranslations("studio.automation");
  const serverPoints = useMemo(() => automationLane(automation, param)?.points ?? [], [automation, param]);
  const [draft, setDraft] = useState<AutomationPoint[] | null>(null);
  const draftRef = useRef<AutomationPoint[] | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragIndex = useRef<number | null>(null);
  const points = draft ?? serverPoints;

  // A fresh server value (after the write, undo, another tab) replaces the local draft.
  useEffect(() => {
    if (dragIndex.current === null) {
      draftRef.current = null;
      setDraft(null);
    }
  }, [serverPoints]);

  const widthPx = Math.max(1, Math.round(timelineLengthMs * pxPerMs));
  const { min, max } = range(param);
  const yOf = (v: number) => PAD + ((max - clampAutomationValue(param, v)) / (max - min)) * (laneHeightPx - 2 * PAD);
  const valueAtY = (y: number) => clampAutomationValue(param, max - ((y - PAD) / (laneHeightPx - 2 * PAD)) * (max - min));
  const xOf = (ms: number) => ms * pxPerMs;
  const msAtX = (x: number) => Math.min(timelineLengthMs, Math.max(0, Math.round(x / pxPerMs / 10) * 10));
  const round = (v: number) => Math.round(v * 100) / 100;

  const commit = (next: AutomationPoint[]) => {
    try {
      onCommit(parseAutomationForWrite(withLane(automation, param, next)));
    } catch {
      // invalid shape: keep the server value
    }
    draftRef.current = null;
    setDraft(null);
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const polyline = useMemo(() => {
    if (points.length === 0) {
      const y = yOf(staticValue);
      return `0,${y} ${widthPx},${y}`;
    }
    const first = points[0];
    const last = points[points.length - 1];
    return [`0,${yOf(first.v)}`, ...points.map((p) => `${xOf(p.t)},${yOf(p.v)}`), `${widthPx},${yOf(last.v)}`].join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, staticValue, widthPx, pxPerMs, laneHeightPx, param]);

  const label = param === "gainDb" ? t("glosnosc") : t("pan");
  const fmt = (v: number) => (param === "gainDb" ? `${v > 0 ? "+" : ""}${v.toFixed(1)} dB` : v === 0 ? t("srodek") : `${v < 0 ? "L" : "R"} ${Math.abs(Math.round(v * 100))}`);

  return (
    <div className="absolute inset-0 z-[3]" data-testid="studio-automation-lane" data-track-id={trackId} data-param={param}>
      <svg
        ref={svgRef}
        width={widthPx}
        height={laneHeightPx}
        className="absolute left-0 top-0 touch-none"
        role="group"
        aria-label={t("aria", { param: label })}
        onPointerDown={(e) => {
          if (disabled || (e.target as Element).tagName === "circle") return;
          e.stopPropagation();
          const { x, y } = local(e);
          const ms = msAtX(x);
          if (points.some((p) => Math.abs(p.t - ms) < MIN_GAP_MS)) return;
          if (points.length >= AUTOMATION_LIMITS.maxPoints) return;
          const next = [...points, { t: ms, v: round(valueAtY(y)) }].sort((a, b) => a.t - b.t);
          commit(next);
        }}
      >
        <rect x={0} y={0} width={widthPx} height={laneHeightPx} fill="var(--brd-paper)" fillOpacity={0.45} />
        <line x1={0} x2={widthPx} y1={yOf(param === "gainDb" ? 0 : 0)} y2={yOf(param === "gainDb" ? 0 : 0)} stroke="var(--brd-line)" strokeDasharray="4 4" />
        <polyline points={polyline} fill="none" stroke="var(--brd-amber)" strokeWidth={2} pointerEvents="none" />
        {points.map((p, i) => (
          <circle
            key={`${p.t}-${i}`}
            cx={xOf(p.t)}
            cy={yOf(p.v)}
            r={POINT_R}
            fill="var(--brd-amber)"
            stroke="var(--brd-ink)"
            strokeWidth={1.5}
            tabIndex={0}
            role="slider"
            aria-label={t("punkt", { n: i + 1, v: fmt(p.v) })}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={p.v}
            className="cursor-grab"
            onPointerDown={(e) => {
              if (disabled) return;
              e.stopPropagation();
              (e.currentTarget as unknown as Element).setPointerCapture?.(e.pointerId);
              dragIndex.current = i;
              draftRef.current = points.map((q) => ({ ...q }));
              setDraft(draftRef.current);
            }}
            onPointerMove={(e) => {
              if (dragIndex.current !== i || !draftRef.current) return;
              const { x, y } = local(e);
              const cur = draftRef.current;
              const prevT = i > 0 ? cur[i - 1].t + MIN_GAP_MS : 0;
              const nextT = i < cur.length - 1 ? cur[i + 1].t - MIN_GAP_MS : timelineLengthMs;
              const t2 = Math.min(Math.max(msAtX(x), prevT), Math.max(prevT, nextT));
              const next = cur.map((q, k) => (k === i ? { t: t2, v: round(valueAtY(y)) } : q));
              draftRef.current = next;
              setDraft(next);
            }}
            onPointerUp={(e) => {
              if (dragIndex.current !== i) return;
              (e.currentTarget as unknown as Element).releasePointerCapture?.(e.pointerId);
              dragIndex.current = null;
              const next = draftRef.current;
              if (next) commit(next);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (disabled) return;
              commit(points.filter((_, k) => k !== i));
            }}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                commit(points.filter((_, k) => k !== i));
                return;
              }
              const step = param === "gainDb" ? 0.5 : 0.05;
              const dir = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
              if (dir === 0) return;
              e.preventDefault();
              commit(points.map((q, k) => (k === i ? { ...q, v: round(clampAutomationValue(param, q.v + dir * step)) } : q)));
            }}
          />
        ))}
      </svg>
      <div className="sticky left-1 top-1 z-[4] inline-flex flex-wrap items-center gap-1 rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] p-1 text-[11px]" data-testid="studio-automation-toolbar">
        <Button type="button" size="sm" variant={param === "gainDb" ? "default" : "outline"} className="h-7 min-h-7 px-2" aria-pressed={param === "gainDb"} onClick={() => onChangeParam("gainDb")}>
          {t("glosnosc")}
        </Button>
        <Button type="button" size="sm" variant={param === "pan" ? "default" : "outline"} className="h-7 min-h-7 px-2" aria-pressed={param === "pan"} onClick={() => onChangeParam("pan")}>
          {t("pan")}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 min-h-7 px-2" disabled={disabled || points.length === 0} onClick={() => commit([])}>
          {t("wyczysc")}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 min-h-7 px-2" onClick={onClose}>
          {t("gotowe")}
        </Button>
        <span className="px-1 text-[var(--brd-mute)]">{points.length ? t("licznik", { n: points.length }) : t("podpowiedz")}</span>
      </div>
    </div>
  );
}

