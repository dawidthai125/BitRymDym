"use client";

/**
 * Recording P0 — latency calibration, section loop / punch line, take lanes
 * with comping. Presentational cards + small client stores; the capture flow
 * itself stays in StudioRecordingPanel.
 */

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  LATENCY_HIGH_WARN_MS,
  MANUAL_OFFSET_MAX_MS,
  MANUAL_OFFSET_MIN_MS,
  clampManualOffset,
  estimateLatencyFromContext,
  latencyDeviceKey,
  latencyWarning,
  loadLatencyProfiles,
  newerLatencyProfile,
  parseLatencyProfile,
  resolveCompensationMs,
  saveLatencyProfile,
  type LatencyProfile,
  type LatencyWarning,
} from "@/lib/studio/recording/latency";
import {
  SECTION_BAR_OPTIONS,
  type MsRange,
  type SectionBars,
} from "@/lib/studio/recording/section-loop";
import {
  laneLines,
  normalizeLaneComp,
  parseTakeLane,
  passCovers,
  type LanePass,
  type TakeLane,
} from "@/lib/studio/recording/comping";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";

const field =
  "mt-1 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--brd-ink)]";

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// ── Latency store ──────────────────────────────────────────────────────────

export type LatencyState = {
  deviceKey: string;
  profile: LatencyProfile | null;
  compensationMs: number;
  baseMs: number;
  source: "calibrated" | "estimate";
  warning: LatencyWarning;
  save: (patch: Partial<Omit<LatencyProfile, "deviceKey" | "updatedAt">>) => void;
  reset: () => void;
};

export function useStudioLatency(params: {
  inputLabel: string | null;
  outputLabel: string | null;
  /** Lazily read; may initialise the shared Studio context. */
  readContextEstimate: () => number | null;
  signedIn: boolean;
}): LatencyState {
  const { inputLabel, outputLabel, readContextEstimate, signedIn } = params;
  const deviceKey = latencyDeviceKey({ inputLabel, outputLabel });
  const [profiles, setProfiles] = useState<Record<string, LatencyProfile>>({});
  const [estimateMs, setEstimateMs] = useState(30);
  const readRef = useRef(readContextEstimate);
  useEffect(() => {
    readRef.current = readContextEstimate;
  });

  useEffect(() => {
    let cancelled = false;
    // Browser copy first (after hydration), then the profile copy wins if newer.
    void Promise.resolve().then(() => {
      if (!cancelled) setProfiles(loadLatencyProfiles(browserStorage()));
    });
    if (!signedIn) return () => {
      cancelled = true;
    };
    void fetch("/api/studio/latency")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { profiles?: unknown[] } | null) => {
        if (cancelled || !body?.profiles) return;
        setProfiles((local) => {
          const next = { ...local };
          for (const raw of body.profiles!) {
            const remote = parseLatencyProfile(raw);
            if (!remote) continue;
            const winner = newerLatencyProfile(next[remote.deviceKey] ?? null, remote);
            if (winner) next[remote.deviceKey] = winner;
          }
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      const v = readRef.current();
      if (!cancelled && v != null) setEstimateMs(v);
    });
    return () => {
      cancelled = true;
    };
  }, [deviceKey]);

  const profile = profiles[deviceKey] ?? null;
  const resolved = resolveCompensationMs({ profile, contextEstimateMs: estimateMs });
  const warning = latencyWarning({
    labels: [inputLabel, outputLabel],
    compensationMs: resolved.baseMs,
    calibrated: resolved.source === "calibrated",
  });

  const persist = useCallback(
    (next: LatencyProfile) => {
      setProfiles((all) => ({ ...all, [next.deviceKey]: next }));
      saveLatencyProfile(browserStorage(), next);
      if (signedIn) {
        void fetch("/api/studio/latency", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: next }),
        }).catch(() => undefined);
      }
    },
    [signedIn],
  );

  const save = useCallback<LatencyState["save"]>(
    (patch) => {
      const base: LatencyProfile = profile ?? {
        deviceKey,
        roundTripMs: null,
        manualOffsetMs: 0,
        method: "manual",
        spreadMs: null,
        updatedAt: new Date().toISOString(),
      };
      persist({
        ...base,
        ...patch,
        manualOffsetMs: clampManualOffset(patch.manualOffsetMs ?? base.manualOffsetMs),
        deviceKey,
        updatedAt: new Date().toISOString(),
      });
    },
    [deviceKey, persist, profile],
  );

  const reset = useCallback(() => {
    persist({
      deviceKey,
      roundTripMs: null,
      manualOffsetMs: 0,
      method: "manual",
      spreadMs: null,
      updatedAt: new Date().toISOString(),
    });
  }, [deviceKey, persist]);

  return {
    deviceKey,
    profile,
    compensationMs: resolved.totalMs,
    baseMs: resolved.baseMs,
    source: resolved.source,
    warning,
    save,
    reset,
  };
}

export function contextLatencyEstimate(ctx: unknown): number | null {
  if (!ctx || typeof ctx !== "object") return null;
  return estimateLatencyFromContext(ctx as { outputLatency?: number; baseLatency?: number });
}

// ── Take lane store ────────────────────────────────────────────────────────

const LANES_KEY = (projectId: string) => `brd.studio.lanes.v1.${projectId}`;

export type TakeLaneStore = {
  lanes: TakeLane[];
  /** Server table present (false → browser-only copy). */
  serverBacked: boolean;
  put: (lane: TakeLane) => Promise<TakeLane>;
  remove: (laneId: string) => Promise<void>;
  replaceLocal: (lane: TakeLane) => void;
};

export function useTakeLanes(projectId: string, signedIn: boolean): TakeLaneStore {
  const [lanes, setLanes] = useState<TakeLane[]>([]);
  const [serverBacked, setServerBacked] = useState(false);

  const writeLocal = useCallback(
    (next: TakeLane[]) => {
      try {
        browserStorage()?.setItem(LANES_KEY(projectId), JSON.stringify(next.slice(-64)));
      } catch {
        // quota — lanes still live in memory this session
      }
    },
    [projectId],
  );

  useEffect(() => {
    let local: TakeLane[] = [];
    try {
      const raw = JSON.parse(browserStorage()?.getItem(LANES_KEY(projectId)) ?? "[]");
      if (Array.isArray(raw)) local = raw.map(parseTakeLane).filter((l): l is TakeLane => Boolean(l));
    } catch {
      local = [];
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setLanes(local);
    });
    if (!signedIn) return () => {
      cancelled = true;
    };
    void fetch(`/api/studio/projects/${projectId}/record/lanes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { available?: boolean; lanes?: unknown[] } | null) => {
        if (cancelled || !body) return;
        if (body.available) {
          setServerBacked(true);
          const remote = (body.lanes ?? [])
            .map(parseTakeLane)
            .filter((l): l is TakeLane => Boolean(l));
          setLanes(remote);
          writeLocal(remote);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId, signedIn, writeLocal]);

  const replaceLocal = useCallback(
    (lane: TakeLane) => {
      setLanes((all) => {
        const next = [...all.filter((l) => l.id !== lane.id), lane];
        writeLocal(next);
        return next;
      });
    },
    [writeLocal],
  );

  const put = useCallback(
    async (lane: TakeLane) => {
      replaceLocal(lane);
      if (!signedIn) return lane;
      try {
        const r = await fetch(`/api/studio/projects/${projectId}/record/lanes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lane }),
        });
        const body = (await r.json().catch(() => null)) as { lane?: unknown; available?: boolean } | null;
        const saved = parseTakeLane(body?.lane);
        if (r.ok && saved) {
          setServerBacked(Boolean(body?.available));
          replaceLocal(saved);
          return saved;
        }
      } catch {
        // offline — local copy kept
      }
      return lane;
    },
    [projectId, replaceLocal, signedIn],
  );

  const remove = useCallback(
    async (laneId: string) => {
      setLanes((all) => {
        const next = all.filter((l) => l.id !== laneId);
        writeLocal(next);
        return next;
      });
      if (!signedIn) return;
      await fetch(
        `/api/studio/projects/${projectId}/record/lanes?laneId=${encodeURIComponent(laneId)}`,
        { method: "DELETE" },
      ).catch(() => undefined);
    },
    [projectId, signedIn, writeLocal],
  );

  return { lanes, serverBacked, put, remove, replaceLocal };
}

// ── Cards ──────────────────────────────────────────────────────────────────

export type CalibrationUi =
  | { status: "idle" }
  | { status: "running"; mode: "click" | "clap"; beat: number; total: number }
  | { status: "done"; latencyMs: number; spreadMs: number }
  | { status: "failed"; reason: "NO_SIGNAL" | "TOO_FEW" | "UNSTABLE" | "ERROR" };

export function StudioLatencyCard(props: {
  latency: LatencyState;
  calibration: CalibrationUi;
  disabled: boolean;
  onCalibrate: (mode: "click" | "clap") => void;
  onCancel: () => void;
  /** Bumped by BITEK actions → open the card and bring it into view. */
  openSignal?: number;
}) {
  const t = useTranslations("studio.recTools");
  const { latency, calibration } = props;
  const [open, setOpen] = useState(false);
  const [seenSignal, setSeenSignal] = useState(props.openSignal ?? 0);
  if ((props.openSignal ?? 0) !== seenSignal) {
    setSeenSignal(props.openSignal ?? 0);
    setOpen(true);
  }
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!props.openSignal) return;
    rootRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [props.openSignal]);
  const manual = latency.profile?.manualOffsetMs ?? 0;
  const running = calibration.status === "running";
  return (
    <div
      ref={rootRef}
      className="space-y-2 rounded border border-[var(--brd-line)] p-2"
      data-testid="studio-latency-card"
      data-source={latency.source}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[var(--brd-ink)]">{t("opoznienie")}</p>
        <button
          type="button"
          className="text-xs text-[var(--brd-accent,inherit)] underline-offset-2 hover:underline"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open || running}
        >
          {open || running ? t("zwin") : t("kalibruj")}
        </button>
      </div>
      <p className="text-sm text-[var(--brd-ink)]" role="status">
        {t("korekta", { ms: latency.compensationMs })}{" "}
        <span className="text-xs text-[var(--brd-mute)]">
          {latency.source === "calibrated" ? t("zrodloKalibracja") : t("zrodloSzacunek")}
        </span>
      </p>
      {latency.warning ? (
        <p className="text-xs text-amber-500" data-testid="studio-latency-warning">
          {latency.warning === "bluetooth"
            ? t("ostrzezenieBluetooth")
            : t("ostrzezenieWysokie", { ms: latency.baseMs, limit: LATENCY_HIGH_WARN_MS })}
        </p>
      ) : null}
      {open || running ? (
        <div className="space-y-2">
          <p className="text-[11px] text-[var(--brd-mute)]">{t("kalibracjaInstrukcja")}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              size="sm"
              disabled={props.disabled || running}
              onClick={() => props.onCalibrate("click")}
            >
              {running && calibration.mode === "click"
                ? t("mierze", { beat: calibration.beat, total: calibration.total })
                : t("testKlikow")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={props.disabled || running}
              onClick={() => props.onCalibrate("clap")}
            >
              {running && calibration.mode === "clap"
                ? t("klaszcz", { beat: calibration.beat, total: calibration.total })
                : t("testKlaskania")}
            </Button>
          </div>
          {running ? (
            <Button type="button" size="sm" variant="secondary" className="w-full" onClick={props.onCancel}>
              {t("przerwij")}
            </Button>
          ) : null}
          <p className="text-[11px] text-[var(--brd-mute)]">{t("klaskanieInstrukcja")}</p>
          {calibration.status === "done" ? (
            <p className="text-xs text-emerald-500" role="status">
              {t("wynik", { ms: Math.round(calibration.latencyMs), spread: calibration.spreadMs.toFixed(1) })}
            </p>
          ) : null}
          {calibration.status === "failed" ? (
            <p className="text-xs text-destructive" role="alert">
              {t(`blad.${calibration.reason}`)}
            </p>
          ) : null}
          <label className="block text-xs text-[var(--brd-mute)]">
            {t("recznaKorekta", { ms: manual > 0 ? `+${manual}` : String(manual) })}
            <input
              type="range"
              className="mt-1 w-full"
              min={MANUAL_OFFSET_MIN_MS}
              max={MANUAL_OFFSET_MAX_MS}
              step={1}
              value={manual}
              disabled={running}
              onChange={(e) => latency.save({ manualOffsetMs: Number(e.target.value) })}
              aria-label={t("recznaKorektaAria")}
            />
          </label>
          <p className="text-[11px] text-[var(--brd-mute)]">{t("recznaPodpowiedz")}</p>
          {latency.profile ? (
            <button
              type="button"
              className="text-[11px] text-[var(--brd-mute)] underline"
              onClick={latency.reset}
            >
              {t("resetuj")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type RecToolsMode = "single" | "loop" | "punch";

export function StudioRecModeCard(props: {
  mode: RecToolsMode;
  onMode: (m: RecToolsMode) => void;
  bars: SectionBars;
  onBars: (b: SectionBars) => void;
  section: MsRange | null;
  onSectionFromPlayhead: () => void;
  lines: MsRange[];
  punchLine: number;
  onPunchLine: (i: number) => void;
  disabled: boolean;
  lockedReason: string | null;
}) {
  const t = useTranslations("studio.recTools");
  const modes: RecToolsMode[] = ["single", "loop", "punch"];
  return (
    <div className="space-y-2 rounded border border-[var(--brd-line)] p-2" data-testid="studio-rec-mode">
      <p className="text-xs font-medium text-[var(--brd-ink)]">{t("trybNagrania")}</p>
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label={t("trybNagrania")}>
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={props.mode === m}
            disabled={props.disabled || (m !== "single" && Boolean(props.lockedReason))}
            onClick={() => props.onMode(m)}
            className={`min-h-9 rounded border px-2 text-xs ${
              props.mode === m
                ? "border-[var(--brd-ink)] bg-[var(--brd-ink)] text-[var(--brd-bg)]"
                : "border-[var(--brd-line)] text-[var(--brd-ink)]"
            } disabled:opacity-50`}
          >
            {t(`tryb.${m}`)}
          </button>
        ))}
      </div>
      {props.lockedReason ? (
        <p className="text-[11px] text-[var(--brd-mute)]">{props.lockedReason}</p>
      ) : null}
      {props.mode !== "single" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-[var(--brd-mute)]">
              {t("dlugoscSekcji")}
              <select
                className={field}
                value={props.bars}
                disabled={props.disabled}
                onChange={(e) => props.onBars(Number(e.target.value) as SectionBars)}
              >
                {SECTION_BAR_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {t("taktow", { n: b })}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                disabled={props.disabled}
                onClick={props.onSectionFromPlayhead}
              >
                {t("odGlowicy")}
              </Button>
            </div>
          </div>
          {props.section ? (
            <p className="text-xs text-[var(--brd-ink)]" data-testid="studio-rec-section">
              {t("sekcja", {
                from: formatStudioTimeMs(props.section.startMs),
                to: formatStudioTimeMs(props.section.endMs),
              })}
            </p>
          ) : (
            <p className="text-xs text-[var(--brd-mute)]">{t("brakSekcji")}</p>
          )}
          {props.mode === "punch" && props.lines.length > 0 ? (
            <label className="block text-xs text-[var(--brd-mute)]">
              {t("linijka")}
              <select
                className={field}
                value={props.punchLine}
                disabled={props.disabled}
                onChange={(e) => props.onPunchLine(Number(e.target.value))}
              >
                {props.lines.map((l, i) => (
                  <option key={l.startMs} value={i}>
                    {t("linijkaN", { n: i + 1, from: formatStudioTimeMs(l.startMs) })}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="text-[11px] text-[var(--brd-mute)]">
            {props.mode === "loop" ? t("petlaPodpowiedz") : t("punchPodpowiedz")}
          </p>
        </>
      ) : null}
    </div>
  );
}

export function StudioCountdown(props: { beatsLeft: number | null; label: string }) {
  if (props.beatsLeft == null) return null;
  return (
    <div
      className="flex items-center justify-center gap-3 rounded border border-destructive/60 bg-destructive/10 p-3"
      role="status"
      aria-live="assertive"
      data-testid="studio-rec-countdown"
    >
      <span className="text-4xl font-semibold tabular-nums text-destructive">{props.beatsLeft}</span>
      <span className="text-xs text-[var(--brd-ink)]">{props.label}</span>
    </div>
  );
}

function passLabel(t: ReturnType<typeof useTranslations>, p: LanePass): string {
  return t(`pass.${p.kind}`, { n: p.number });
}

export function StudioTakeLanesCard(props: {
  lanes: TakeLane[];
  busy: boolean;
  previewingPassId: string | null;
  dirtyLaneIds: ReadonlySet<string>;
  onPreview: (lane: TakeLane, pass: LanePass) => void;
  onStar: (lane: TakeLane, pass: LanePass) => void;
  onUseForSection: (lane: TakeLane, pass: LanePass) => void;
  onLineChoice: (lane: TakeLane, line: number, passId: string | null) => void;
  onApply: (lane: TakeLane) => void;
  onDelete: (lane: TakeLane) => void;
  localOnly: boolean;
}) {
  const t = useTranslations("studio.recTools");
  if (props.lanes.length === 0) return null;
  return (
    <div className="space-y-3 rounded border border-[var(--brd-line)] p-2" data-testid="studio-take-lanes">
      <p className="text-xs font-medium text-[var(--brd-ink)]">{t("takeWSekcjach")}</p>
      {props.lanes.map((lane) => (
        <LaneBlock key={lane.id} lane={lane} {...props} t={t} />
      ))}
      {props.localOnly ? <p className="text-[11px] text-[var(--brd-mute)]">{t("tylkoLokalnie")}</p> : null}
    </div>
  );
}

function LaneBlock(
  props: Omit<Parameters<typeof StudioTakeLanesCard>[0], "lanes" | "localOnly"> & {
    lane: TakeLane;
    t: ReturnType<typeof useTranslations>;
  },
) {
  const { lane, t } = props;
  const lines = useMemo(() => laneLines(lane), [lane]);
  const comp = useMemo(() => normalizeLaneComp(lane), [lane]);
  const passes = [...lane.passes].sort((a, b) => b.number - a.number);
  const dirty = props.dirtyLaneIds.has(lane.id);
  return (
    <div className="space-y-2 border-t border-[var(--brd-line)] pt-2 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--brd-ink)]">
          {t("sekcja", {
            from: formatStudioTimeMs(lane.sectionStartMs),
            to: formatStudioTimeMs(lane.sectionEndMs),
          })}
          <span className="text-[var(--brd-mute)]"> · {t("ileTake", { n: lane.passes.length })}</span>
        </p>
        <button
          type="button"
          className="text-[11px] text-[var(--brd-mute)] underline"
          disabled={props.busy}
          onClick={() => props.onDelete(lane)}
        >
          {t("zapomnijSekcje")}
        </button>
      </div>
      <ul className="space-y-1">
        {passes.map((p) => {
          const used = comp.some((c) => c === p.id);
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-1 rounded border border-[var(--brd-line)] px-2 py-1"
              data-testid="studio-lane-pass"
              data-used={used ? "1" : "0"}
            >
              <button
                type="button"
                aria-pressed={p.starred}
                aria-label={p.starred ? t("odgwiazdkuj") : t("gwiazdka")}
                className={`min-h-8 min-w-8 text-base ${p.starred ? "text-amber-400" : "text-[var(--brd-mute)]"}`}
                disabled={props.busy}
                onClick={() => props.onStar(lane, p)}
              >
                {p.starred ? "★" : "☆"}
              </button>
              <span className="flex-1 text-xs text-[var(--brd-ink)]">
                {passLabel(t, p)}
                {!p.complete ? <span className="text-[var(--brd-mute)]"> · {t("niepelny")}</span> : null}
                {used ? <span className="text-emerald-500"> · {t("wCompie")}</span> : null}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={props.busy && props.previewingPassId !== p.id}
                onClick={() => props.onPreview(lane, p)}
              >
                {props.previewingPassId === p.id ? t("stop") : t("odsluch")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={props.busy}
                onClick={() => props.onUseForSection(lane, p)}
              >
                {t("caloSekcja")}
              </Button>
            </li>
          );
        })}
      </ul>
      {lines.length > 1 ? (
        <div className="space-y-1">
          <p className="text-[11px] text-[var(--brd-mute)]">{t("compPoLinijkach")}</p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {lines.map((line, i) => (
              <label key={line.startMs} className="block text-[11px] text-[var(--brd-mute)]">
                {t("linijkaKrotko", { n: i + 1 })}
                <select
                  className="mt-0.5 w-full rounded border border-[var(--brd-line)] bg-transparent px-1 py-1 text-xs text-[var(--brd-ink)]"
                  value={comp[i] ?? ""}
                  disabled={props.busy}
                  onChange={(e) => props.onLineChoice(lane, i, e.target.value || null)}
                >
                  <option value="">{t("cisza")}</option>
                  {passes
                    .filter((p) => passCovers(p, line))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.starred ? "★ " : ""}
                        {passLabel(t, p)}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={props.busy}
        variant={dirty ? "default" : "outline"}
        onClick={() => props.onApply(lane)}
      >
        {dirty ? t("zastosujNaOsi") : t("zastosujPonownie")}
      </Button>
    </div>
  );
}
