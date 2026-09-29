"use client";

import { useEffect, useRef, useState, useEffectEvent } from "react";

import { E3_MIX_ENABLED } from "@/config/audio-render";
import {
  createMixPreviewGraph,
  type MixGraphHandles,
} from "@/lib/mix/mix-graph";
import {
  defaultMixParameters,
  defaultMixProParams,
  type MixParameters,
} from "@/lib/mix/params";

export type MixTakeOption = {
  id: string;
  label: string;
  durationSeconds: number | null;
};

type MixPanelProps = {
  beatId: string;
  takes: MixTakeOption[];
  isAuthenticated: boolean;
  /** Server-resolved MIX_PRO (never trust client). */
  mixPro: boolean;
};

type SessionDto = {
  id: string;
  parameters: MixParameters;
  mixPro: boolean;
  previewEngineId: string | null;
};

/**
 * E3.3 Mix surface — gated by E3_MIX_ENABLED (default OFF).
 * Realtime preview only; no durable artifact / render.
 */
export function MixPanel({
  beatId,
  takes,
  isAuthenticated,
  mixPro,
}: MixPanelProps) {
  const [takeId, setTakeId] = useState(takes[0]?.id ?? "");
  const [session, setSession] = useState<SessionDto | null>(null);
  const [params, setParams] = useState<MixParameters>(defaultMixParameters());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [proLockedHint, setProLockedHint] = useState(false);

  const [mediaKey, setMediaKey] = useState(0);
  const beatAudioRef = useRef<HTMLAudioElement | null>(null);
  const takeAudioRef = useRef<HTMLAudioElement | null>(null);
  const graphRef = useRef<MixGraphHandles | null>(null);

  const disposeGraph = useEffectEvent(() => {
    graphRef.current?.dispose();
    graphRef.current = null;
    setPlaying(false);
  });

  useEffect(() => {
    return () => {
      disposeGraph();
    };
  }, [disposeGraph]);

  if (!E3_MIX_ENABLED) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <section className="space-y-2 border-t border-border/60 pt-4">
        <h2 className="text-sm font-semibold tracking-tight">Mix</h2>
        <p className="text-sm text-muted-foreground">
          Zaloguj się, aby użyć Basic Mix (anonimowy Mix jest niedostępny).
        </p>
      </section>
    );
  }

  if (takes.length === 0) {
    return (
      <section className="space-y-2 border-t border-border/60 pt-4">
        <h2 className="text-sm font-semibold tracking-tight">Mix</h2>
        <p className="text-sm text-muted-foreground">
          Nagraj READY take na tym bicie, aby otworzyć Mix Session.
        </p>
      </section>
    );
  }

  async function ensureSession(): Promise<SessionDto> {
    if (session) return session;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mix/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takeId, beatId, parameters: params }),
      });
      const json = (await res.json()) as {
        error?: string;
        session?: SessionDto;
      };
      if (!res.ok || !json.session) {
        throw new Error(json.error ?? "Nie udało się utworzyć sesji Mix.");
      }
      setSession(json.session);
      setParams(json.session.parameters);
      return json.session;
    } finally {
      setBusy(false);
    }
  }

  async function persistParams(next: MixParameters) {
    const s = await ensureSession();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mix/session/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parameters: next }),
      });
      const json = (await res.json()) as {
        error?: string;
        session?: SessionDto;
      };
      if (!res.ok || !json.session) {
        throw new Error(json.error ?? "Zapis parametrów nieudany.");
      }
      setSession(json.session);
      setParams(json.session.parameters);
      graphRef.current?.applyParameters(json.session.parameters);
    } finally {
      setBusy(false);
    }
  }

  async function startPreview() {
    setError(null);
    setBusy(true);
    try {
      disposeGraph();
      const s = await ensureSession();
      const res = await fetch("/api/mix/preview-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: s.id }),
      });
      const json = (await res.json()) as {
        error?: string;
        take?: { url: string };
        beat?: { url: string };
        parameters?: MixParameters;
      };
      if (!res.ok || !json.take || !json.beat) {
        throw new Error(json.error ?? "Brak źródeł preview.");
      }

      disposeGraph();
      setMediaKey((k) => k + 1);
      // Allow remount of <audio> before createMediaElementSource
      await new Promise((r) => setTimeout(r, 0));

      const beatEl = beatAudioRef.current;
      const takeEl = takeAudioRef.current;
      if (!beatEl || !takeEl) {
        throw new Error("Audio elements unavailable.");
      }
      beatEl.src = json.beat.url;
      takeEl.src = json.take.url;
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          beatEl.onloadeddata = () => resolve();
          beatEl.onerror = () => reject(new Error("Beat load failed"));
          beatEl.load();
        }),
        new Promise<void>((resolve, reject) => {
          takeEl.onloadeddata = () => resolve();
          takeEl.onerror = () => reject(new Error("Take load failed"));
          takeEl.load();
        }),
      ]);

      const graph = createMixPreviewGraph({
        beatEl,
        takeEl,
        parameters: json.parameters ?? params,
      });
      graphRef.current = graph;
      await graph.play();
      setPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
      disposeGraph();
    } finally {
      setBusy(false);
    }
  }

  function stopPreview() {
    disposeGraph();
  }

  function updateBasic(
    patch: (p: MixParameters) => MixParameters,
  ) {
    const next = patch(params);
    setParams(next);
    void persistParams(next).catch((e) =>
      setError(e instanceof Error ? e.message : "Save failed."),
    );
  }

  function onProControlIntent() {
    if (mixPro) return;
    setProLockedHint(true);
  }

  function enableProDefaults() {
    if (!mixPro) {
      onProControlIntent();
      return;
    }
    updateBasic((p) => ({ ...p, pro: p.pro ?? defaultMixProParams() }));
  }

  return (
    <section className="space-y-4 border-t border-border/60 pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Mix</h2>
        <p className="text-xs text-muted-foreground">
          Preview realtime · bez zapisu artefaktu
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Własny take</span>
        <select
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          value={takeId}
          disabled={busy || Boolean(session)}
          onChange={(e) => setTakeId(e.target.value)}
        >
          {takes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <GainPanControl
          label="Take"
          gainDb={params.take.gainDb}
          pan={params.take.pan}
          disabled={busy}
          onChange={(gainDb, pan) =>
            updateBasic((p) => ({ ...p, take: { gainDb, pan } }))
          }
        />
        <GainPanControl
          label="Beat"
          gainDb={params.beat.gainDb}
          pan={params.beat.pan}
          disabled={busy}
          onChange={(gainDb, pan) =>
            updateBasic((p) => ({ ...p, beat: { gainDb, pan } }))
          }
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Basic EQ / Dynamics / FX
        </legend>
        <Slider
          label="EQ Low"
          min={-12}
          max={12}
          step={0.5}
          value={params.eq.lowGainDb}
          disabled={busy}
          onChange={(v) =>
            updateBasic((p) => ({ ...p, eq: { ...p.eq, lowGainDb: v } }))
          }
        />
        <Slider
          label="EQ Mid"
          min={-12}
          max={12}
          step={0.5}
          value={params.eq.midGainDb}
          disabled={busy}
          onChange={(v) =>
            updateBasic((p) => ({ ...p, eq: { ...p.eq, midGainDb: v } }))
          }
        />
        <Slider
          label="EQ High"
          min={-12}
          max={12}
          step={0.5}
          value={params.eq.highGainDb}
          disabled={busy}
          onChange={(v) =>
            updateBasic((p) => ({ ...p, eq: { ...p.eq, highGainDb: v } }))
          }
        />
        <Slider
          label="Comp threshold"
          min={-60}
          max={0}
          step={1}
          value={params.compressor.thresholdDb}
          disabled={busy}
          onChange={(v) =>
            updateBasic((p) => ({
              ...p,
              compressor: { ...p.compressor, thresholdDb: v },
            }))
          }
        />
        <Slider
          label="Reverb mix"
          min={0}
          max={1}
          step={0.01}
          value={params.reverb.mix}
          disabled={busy}
          onChange={(v) =>
            updateBasic((p) => ({ ...p, reverb: { ...p.reverb, mix: v } }))
          }
        />
        <Slider
          label="Delay mix"
          min={0}
          max={1}
          step={0.01}
          value={params.delay.mix}
          disabled={busy}
          onChange={(v) =>
            updateBasic((p) => ({ ...p, delay: { ...p.delay, mix: v } }))
          }
        />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Pro Mix {mixPro ? "" : "🔒"}
        </legend>
        {!mixPro ? (
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={onProControlIntent}
          >
            Pro EQ / multiband / de-esser — Premium
          </button>
        ) : (
          <button
            type="button"
            className="text-sm underline-offset-4 hover:underline"
            disabled={busy}
            onClick={enableProDefaults}
          >
            {params.pro ? "Pro łańcuch aktywny" : "Włącz Pro FX chain"}
          </button>
        )}
        {proLockedHint && !mixPro ? (
          <p className="text-xs text-muted-foreground" role="status">
            Pro Mix wymaga aktywnego Premium (server SSOT). Płatności poza
            zakresem E3.3.
          </p>
        ) : null}
        {mixPro && params.pro ? (
          <Slider
            label="De-esser range"
            min={0}
            max={24}
            step={1}
            value={params.pro.deEsser.rangeDb}
            disabled={busy}
            onChange={(v) =>
              updateBasic((p) =>
                p.pro
                  ? {
                      ...p,
                      pro: {
                        ...p.pro,
                        deEsser: { ...p.pro.deEsser, rangeDb: v },
                      },
                    }
                  : p,
              )
            }
          />
        ) : null}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-md border border-border px-3 py-2 text-sm"
          disabled={busy || !takeId}
          onClick={() => void startPreview()}
        >
          {playing ? "Restart preview" : "Play Mixed Preview"}
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-2 text-sm"
          disabled={!playing && !graphRef.current}
          onClick={stopPreview}
        >
          Stop
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <audio key={`beat-${mediaKey}`} ref={beatAudioRef} preload="none" className="hidden" />
      <audio key={`take-${mediaKey}`} ref={takeAudioRef} preload="none" className="hidden" />
    </section>
  );
}

function GainPanControl(props: {
  label: string;
  gainDb: number;
  pan: number;
  disabled?: boolean;
  onChange: (gainDb: number, pan: number) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/70 p-3">
      <p className="text-xs font-medium tracking-wide uppercase">{props.label}</p>
      <Slider
        label="Gain (dB)"
        min={-24}
        max={24}
        step={0.5}
        value={props.gainDb}
        disabled={props.disabled}
        onChange={(gainDb) => props.onChange(gainDb, props.pan)}
      />
      <Slider
        label="Pan"
        min={-1}
        max={1}
        step={0.01}
        value={props.pan}
        disabled={props.disabled}
        onChange={(pan) => props.onChange(props.gainDb, pan)}
      />
    </div>
  );
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="flex justify-between text-muted-foreground">
        <span>{props.label}</span>
        <span>{props.value}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}
