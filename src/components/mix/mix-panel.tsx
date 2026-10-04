"use client";

import { useEffect, useRef, useState, useEffectEvent } from "react";

import {
  createMixPreviewGraph,
  type MixGraphHandles,
  type MixMeterReading,
} from "@/lib/mix/mix-graph";
import {
  defaultMixParameters,
  defaultMixProParams,
  type MixParameters,
} from "@/lib/mix/params";
import { toUserFacingMixError } from "@/lib/ui/user-errors";

export type MixTakeOption = {
  id: string;
  label: string;
  durationSeconds: number | null;
};

type MixPanelProps = {
  beatId: string;
  takes: MixTakeOption[];
  isAuthenticated: boolean;
  /**
   * Server-resolved Mix presentation gate (AR-W6-01).
   * RSC reads E3_MIX_ENABLED — client must not read process.env directly.
   */
  mixEnabled: boolean;
  /** Server-resolved MIX_PRO (never trust client). */
  mixPro: boolean;
  /** Server-resolved MASTER_PRO — metering / locked CTA only (E3.4). */
  masterPro: boolean;
};

type SessionDto = {
  id: string;
  parameters: MixParameters;
  mixPro: boolean;
  masterPro?: boolean;
  previewEngineId: string | null;
};

const touchBtn =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--brd-r-cta)] border border-[var(--brd-line)] px-4 text-sm disabled:pointer-events-none disabled:opacity-50";

/**
 * E3.3/E3.4 Mix + Basic Master surface — gated by server-resolved `mixEnabled`.
 * Realtime preview only; no durable artifact / render / Pro Master DSP.
 * W6.3: mobile presentation (touch · disclosure · overflow) — no DSP/AuthZ changes.
 */
export function MixPanel({
  beatId,
  takes,
  isAuthenticated,
  mixEnabled,
  mixPro,
  masterPro,
}: MixPanelProps) {
  const [takeId, setTakeId] = useState(takes[0]?.id ?? "");
  const [session, setSession] = useState<SessionDto | null>(null);
  const [params, setParams] = useState<MixParameters>(defaultMixParameters());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportArtifactId, setExportArtifactId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [proLockedHint, setProLockedHint] = useState(false);
  const [masterProLockedHint, setMasterProLockedHint] = useState(false);
  const [meter, setMeter] = useState<MixMeterReading | null>(null);

  const [mediaKey, setMediaKey] = useState(0);
  const beatAudioRef = useRef<HTMLAudioElement | null>(null);
  const takeAudioRef = useRef<HTMLAudioElement | null>(null);
  const graphRef = useRef<MixGraphHandles | null>(null);

  const disposeGraph = useEffectEvent(() => {
    graphRef.current?.dispose();
    graphRef.current = null;
    setPlaying(false);
    setMeter(null);
  });

  useEffect(() => {
    return () => {
      disposeGraph();
    };
  }, [disposeGraph]);

  useEffect(() => {
    if (!playing || !masterPro) return;
    let raf = 0;
    const tick = () => {
      const reading = graphRef.current?.getMeterReading();
      if (reading) setMeter(reading);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, masterPro]);

  if (!mixEnabled) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <section className="min-w-0 max-w-full space-y-2 border border-[var(--brd-line)] p-4 sm:p-5">
        <h2 className="brd-display text-lg font-semibold tracking-tight">
          Miks i master
        </h2>
        <p className="text-sm text-[var(--brd-mute)] text-pretty">
          Zaloguj się, aby użyć miksu. Miks anonimowy jest niedostępny.
        </p>
      </section>
    );
  }

  if (takes.length === 0) {
    return (
      <section className="min-w-0 max-w-full space-y-2 border border-[var(--brd-line)] p-4 sm:p-5">
        <h2 className="brd-display text-lg font-semibold tracking-tight">
          Miks i master
        </h2>
        <p className="text-sm text-[var(--brd-mute)] text-pretty">
          Nagraj gotowe nagranie na tym bicie, aby otworzyć miks.
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
        throw new Error(json.error ?? "Nie udało się utworzyć sesji miksu.");
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
        throw new Error(json.error ?? "Brak źródeł podglądu.");
      }

      disposeGraph();
      setMediaKey((k) => k + 1);
      await new Promise((r) => setTimeout(r, 0));

      const beatEl = beatAudioRef.current;
      const takeEl = takeAudioRef.current;
      if (!beatEl || !takeEl) {
        throw new Error("Odtwarzacz niedostępny.");
      }
      beatEl.src = json.beat.url;
      takeEl.src = json.take.url;
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          beatEl.onloadeddata = () => resolve();
          beatEl.onerror = () =>
            reject(new Error("Nie udało się wczytać bitu."));
          beatEl.load();
        }),
        new Promise<void>((resolve, reject) => {
          takeEl.onloadeddata = () => resolve();
          takeEl.onerror = () =>
            reject(new Error("Nie udało się wczytać nagrania."));
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
      setError(
        toUserFacingMixError(
          e instanceof Error
            ? e.message
            : "Nie udało się przygotować podglądu.",
        ),
      );
      disposeGraph();
    } finally {
      setBusy(false);
    }
  }

  function stopPreview() {
    disposeGraph();
  }

  async function startExport(requestedTier: "BASIC_MP3" | "HQ_MP3" | "WAV") {
    setExportBusy(true);
    setError(null);
    setExportStatus("creating");
    setExportArtifactId(null);
    try {
      if (
        (requestedTier === "HQ_MP3" || requestedTier === "WAV") &&
        !mixPro
      ) {
        throw new Error("Premium required for HQ MP3 / WAV export.");
      }
      const s = await ensureSession();
      if (
        (requestedTier === "HQ_MP3" || requestedTier === "WAV") &&
        !s.parameters.pro
      ) {
        const withPro = {
          ...s.parameters,
          pro: s.parameters.pro ?? defaultMixProParams(),
        };
        await persistParams(withPro);
        setParams(withPro);
      }
      const idempotencyKey = `${requestedTier}:${s.id}:${Date.now()}`;
      const createRes = await fetch(`/api/mix/session/${s.id}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedTier,
          idempotencyKey,
        }),
      });
      const createJson = (await createRes.json()) as {
        error?: string;
        job?: { id: string; status: string };
      };
      if (!createRes.ok || !createJson.job) {
        throw new Error(createJson.error ?? "Nie udało się utworzyć eksportu.");
      }
      let jobId = createJson.job.id;
      setExportStatus(createJson.job.status);

      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await fetch(`/api/mix/jobs/${jobId}`);
        const pollJson = (await poll.json()) as {
          error?: string;
          job?: { id: string; status: string; artifactId?: string | null };
        };
        if (!poll.ok || !pollJson.job) {
          throw new Error(pollJson.error ?? "Status eksportu niedostępny.");
        }
        jobId = pollJson.job.id;
        setExportStatus(pollJson.job.status);
        if (pollJson.job.status === "SUCCEEDED") {
          if (pollJson.job.artifactId) {
            setExportArtifactId(pollJson.job.artifactId);
          }
          return;
        }
        if (
          pollJson.job.status === "FAILED" ||
          pollJson.job.status === "CANCELLED" ||
          pollJson.job.status === "TIMEOUT"
        ) {
          throw new Error(`Export ${pollJson.job.status}.`);
        }
      }
      throw new Error("Export timeout (czekaj na EXTERNAL worker).");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Export failed.";
      setError(toUserFacingMixError(message));
      setExportStatus("error");
    } finally {
      setExportBusy(false);
    }
  }

  async function downloadExport() {
    if (!exportArtifactId) return;
    setExportBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/mix/artifacts/${exportArtifactId}/download`,
      );
      const json = (await res.json()) as { error?: string; url?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Pobieranie niedostępne.");
      }
      window.location.assign(json.url);
    } catch (e) {
      setError(
        toUserFacingMixError(
          e instanceof Error ? e.message : "Nie udało się pobrać pliku.",
        ),
      );
    } finally {
      setExportBusy(false);
    }
  }

  function updateBasic(patch: (p: MixParameters) => MixParameters) {
    const next = patch(params);
    setParams(next);
    void persistParams(next).catch((e) =>
      setError(
        toUserFacingMixError(
          e instanceof Error ? e.message : "Nie udało się zapisać parametrów.",
        ),
      ),
    );
  }

  function onProControlIntent() {
    if (mixPro) return;
    setProLockedHint(true);
  }

  function onMasterProIntent() {
    if (masterPro) return;
    setMasterProLockedHint(true);
  }

  function enableProDefaults() {
    if (!mixPro) {
      onProControlIntent();
      return;
    }
    updateBasic((p) => ({ ...p, pro: p.pro ?? defaultMixProParams() }));
  }

  return (
    <section className="min-w-0 max-w-full space-y-4 border border-[var(--brd-line)] p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-2">
        <h2 className="brd-display text-lg font-semibold tracking-tight">
          Miks i master
        </h2>
        <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
          Podgląd na żywo · eksport
        </p>
      </div>

      <label className="block min-w-0 space-y-1 text-sm">
        <span className="text-muted-foreground">Własne nagranie</span>
        <select
          className="min-h-11 w-full max-w-full rounded-[var(--brd-r-sm)] border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3 py-2"
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

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <GainPanControl
          label="Nagranie"
          gainDb={params.take.gainDb}
          pan={params.take.pan}
          disabled={busy}
          onChange={(gainDb, pan) =>
            updateBasic((p) => ({ ...p, take: { gainDb, pan } }))
          }
        />
        <GainPanControl
          label="Bit"
          gainDb={params.beat.gainDb}
          pan={params.beat.pan}
          disabled={busy}
          onChange={(gainDb, pan) =>
            updateBasic((p) => ({ ...p, beat: { gainDb, pan } }))
          }
        />
      </div>

      <details className="min-w-0 border border-[var(--brd-line)] open:pb-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase marker:content-none [&::-webkit-details-marker]:hidden">
          EQ / dynamika / efekty
        </summary>
        <div className="space-y-2 px-3 pt-1">
          <Slider
            label="EQ: bas"
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
            label="EQ: środek"
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
            label="EQ: góra"
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
            label="Próg kompresora"
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
            label="Poziom reverbu"
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
            label="Poziom delay"
            min={0}
            max={1}
            step={0.01}
            value={params.delay.mix}
            disabled={busy}
            onChange={(v) =>
              updateBasic((p) => ({ ...p, delay: { ...p.delay, mix: v } }))
            }
          />
        </div>
      </details>

      <details className="min-w-0 border border-[var(--brd-line)] open:pb-3" open>
        <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase marker:content-none [&::-webkit-details-marker]:hidden">
          Master podstawowy
        </summary>
        <div className="space-y-2 px-3 pt-1">
          <Slider
            label="Głośność mastera (dB)"
            min={-24}
            max={12}
            step={0.5}
            value={params.master.gainDb}
            disabled={busy}
            onChange={(v) =>
              updateBasic((p) => ({
                ...p,
                master: { ...p.master, gainDb: v },
              }))
            }
          />
          <label className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-5 shrink-0"
              checked={params.master.clipProtect}
              disabled={busy}
              onChange={(e) =>
                updateBasic((p) => ({
                  ...p,
                  master: { ...p.master, clipProtect: e.target.checked },
                }))
              }
            />
            Ochrona przed przesterem
          </label>
          <Slider
            label="Próg limitera"
            min={-24}
            max={0}
            step={0.5}
            value={params.master.basicLimiter.thresholdDb}
            disabled={busy}
            onChange={(v) =>
              updateBasic((p) => ({
                ...p,
                master: {
                  ...p.master,
                  basicLimiter: { ...p.master.basicLimiter, thresholdDb: v },
                },
              }))
            }
          />
          <Slider
            label="Cel głośności (LUFS)"
            min={-24}
            max={-6}
            step={0.5}
            value={params.master.basicLoudness.targetLufs}
            disabled={busy}
            onChange={(v) =>
              updateBasic((p) => ({
                ...p,
                master: {
                  ...p.master,
                  basicLoudness: { ...p.master.basicLoudness, targetLufs: v },
                },
              }))
            }
          />
        </div>
      </details>

      <details className="min-w-0 border border-[var(--brd-line)] open:pb-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase marker:content-none [&::-webkit-details-marker]:hidden">
          Pro Mix {mixPro ? "" : "· zablokowane"}
        </summary>
        <div className="space-y-2 px-3 pt-1">
          {!mixPro ? (
            <button
              type="button"
              className={`${touchBtn} w-full text-muted-foreground sm:w-auto`}
              onClick={onProControlIntent}
            >
              Pro EQ, multiband i de-esser — Premium
            </button>
          ) : (
            <button
              type="button"
              className={`${touchBtn} w-full sm:w-auto`}
              disabled={busy}
              onClick={enableProDefaults}
            >
              {params.pro ? "Pro łańcuch aktywny" : "Włącz łańcuch efektów Pro"}
            </button>
          )}
          {proLockedHint && !mixPro ? (
            <p className="text-xs text-muted-foreground text-pretty" role="status">
              Pro Mix wymaga aktywnego Premium.
            </p>
          ) : null}
          {mixPro && params.pro ? (
            <Slider
              label="Zakres de-essera"
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
        </div>
      </details>

      <details className="min-w-0 border border-[var(--brd-line)] open:pb-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase marker:content-none [&::-webkit-details-marker]:hidden">
          Pro Master {masterPro ? "" : "· zablokowane"}
        </summary>
        <div className="space-y-2 px-3 pt-1">
          {!masterPro ? (
            <button
              type="button"
              className={`${touchBtn} w-full text-muted-foreground sm:w-auto`}
              onClick={onMasterProIntent}
            >
              Pomiar i Pro Master — Premium
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-pretty">
                Podgląd mastera · ostateczny plik powstaje przy eksporcie
              </p>
              <div
                className="h-3 w-full max-w-full overflow-hidden rounded-sm bg-muted"
                aria-label="Miernik szczytu mastera"
              >
                <div
                  className="h-full bg-foreground/70 transition-[width] duration-75"
                  style={{
                    width: `${Math.min(100, (meter?.peak ?? 0) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">
                Szczyt{" "}
                {meter
                  ? `${meter.peakDb.toFixed(1)} dBFS`
                  : "— (włącz podgląd)"}
              </p>
            </div>
          )}
          {masterProLockedHint && !masterPro ? (
            <p className="text-xs text-muted-foreground text-pretty" role="status">
              Pro Master wymaga aktywnego Premium.
            </p>
          ) : null}
        </div>
      </details>

      <div className="flex min-w-0 flex-wrap gap-2">
        <button
          type="button"
          className={touchBtn}
          disabled={busy || !takeId}
          onClick={() => void startPreview()}
        >
          {playing ? "Odśwież podgląd" : "Odtwórz miks"}
        </button>
        <button
          type="button"
          className={touchBtn}
          disabled={!playing && !graphRef.current}
          onClick={stopPreview}
        >
          Zatrzymaj
        </button>
      </div>

      <div className="min-w-0 space-y-3 border-t border-[var(--brd-line)] pt-3">
        <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
          Eksport
        </p>
        <p className="text-xs text-[var(--brd-mute)] text-pretty">
          Podstawowy MP3 jest dostępny od razu. HQ MP3 i WAV wymagają Premium.
        </p>
        <div className="flex min-w-0 flex-wrap gap-2">
          <button
            type="button"
            className={touchBtn}
            disabled={busy || exportBusy || !takeId}
            aria-busy={exportBusy}
            onClick={() => void startExport("BASIC_MP3")}
          >
            {exportBusy && exportStatus !== "error"
              ? "Eksportuję…"
              : "MP3"}
          </button>
          {mixPro ? (
            <>
              <button
                type="button"
                className={touchBtn}
                disabled={busy || exportBusy || !takeId}
                onClick={() => void startExport("HQ_MP3")}
              >
                HQ MP3
              </button>
              <button
                type="button"
                className={touchBtn}
                disabled={busy || exportBusy || !takeId}
                onClick={() => void startExport("WAV")}
              >
                WAV
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`${touchBtn} text-muted-foreground`}
              disabled={busy || exportBusy}
              onClick={() => {
                onProControlIntent();
                setExportStatus("locked");
                setError(
                  "HQ MP3 i WAV są dostępne w Premium.",
                );
              }}
            >
              HQ / WAV · Premium
            </button>
          )}
          {exportArtifactId ? (
            <button
              type="button"
              className={touchBtn}
              disabled={exportBusy}
              onClick={() => void downloadExport()}
            >
              Pobierz
            </button>
          ) : (
            <button
              type="button"
              className={`${touchBtn} text-muted-foreground`}
              disabled
              aria-disabled="true"
              title="Pobieranie dostępne po udanym eksporcie"
            >
              Pobierz
            </button>
          )}
        </div>
        {exportStatus ? (
          <p
            className="text-xs text-muted-foreground text-pretty"
            role="status"
            aria-live="polite"
          >
            Status: {formatExportStatus(exportStatus)}
            {exportBusy ? " · czekaj…" : null}
          </p>
        ) : null}
        {mixPro ? (
          <p className="text-xs text-muted-foreground text-pretty">
            Podgląd Premium może różnić się od finalnego eksportu.
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-destructive text-pretty" role="alert">
          {error}
        </p>
      ) : null}

      <audio
        key={`beat-${mediaKey}`}
        ref={beatAudioRef}
        preload="none"
        className="hidden"
      />
      <audio
        key={`take-${mediaKey}`}
        ref={takeAudioRef}
        preload="none"
        className="hidden"
      />
    </section>
  );
}

function formatExportStatus(status: string): string {
  switch (status) {
    case "creating":
      return "przygotowuję plik";
    case "locked":
      return "wymaga Premium";
    case "error":
      return "błąd";
    case "SUCCEEDED":
    case "READY":
      return "gotowe";
    case "RUNNING":
    case "QUEUED":
      return "w trakcie";
    case "FAILED":
      return "nieudane";
    case "CANCELLED":
      return "anulowane";
    case "TIMEOUT":
      return "przekroczono czas";
    default:
      return "nieznany status eksportu";
  }
}

function GainPanControl(props: {
  label: string;
  gainDb: number;
  pan: number;
  disabled?: boolean;
  onChange: (gainDb: number, pan: number) => void;
}) {
  return (
    <div className="min-w-0 space-y-2 border border-[var(--brd-line)] p-3">
      <p className="text-xs font-medium tracking-wide uppercase">{props.label}</p>
      <Slider
        label="Wzmocnienie (dB)"
        min={-24}
        max={24}
        step={0.5}
        value={props.gainDb}
        disabled={props.disabled}
        onChange={(gainDb) => props.onChange(gainDb, props.pan)}
      />
      <Slider
        label="Panorama"
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
    <label className="flex min-w-0 flex-col gap-1 text-xs">
      <span className="flex justify-between gap-2 text-muted-foreground">
        <span className="min-w-0 truncate">{props.label}</span>
        <span className="shrink-0 tabular-nums">{props.value}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="h-11 w-full max-w-full accent-foreground"
      />
    </label>
  );
}
