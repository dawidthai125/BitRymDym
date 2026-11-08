"use client";

import { useState } from "react";

import { measureBeatWindow, type BeatMeasure } from "@/lib/studio/analysis/measure";

type ProjectOpt = { id: string; title: string };

export function StudioOptimizerPanel({ projects }: { projects: ProjectOpt[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [measure, setMeasure] = useState<BeatMeasure | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId) return;
    setBusy(true);
    setNote(null);
    setMeasure(null);
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/analysis-audio`);
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setNote("Nie ma zatwierdzonego mastera ani bitu w tym projekcie.");
        return;
      }
      const audioRes = await fetch(json.url);
      if (!audioRes.ok) {
        setNote("Nie udało się odczytać audio projektu.");
        return;
      }
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(await audioRes.arrayBuffer());
      const channel = decoded.getChannelData(0);
      const frames = Math.min(channel.length, Math.floor(decoded.sampleRate * 20));
      const samples = new Float32Array(frames);
      samples.set(channel.subarray(0, frames));
      await ctx.close().catch(() => undefined);
      setMeasure(measureBeatWindow(samples, decoded.sampleRate));
    } catch {
      setNote("Nie udało się zmierzyć audio.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-[var(--brd-ink-soft)]">
        Projekt
        <select
          name="projectId"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          disabled={projects.length === 0}
          className="border border-[var(--brd-line)] bg-transparent px-3 py-2 text-[var(--brd-ink)]"
        >
          {projects.length === 0 ? <option value="">Brak projektów</option> : null}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={busy || !projectId}
        className="w-fit border border-[var(--brd-line)] px-3 py-2 text-sm text-[var(--brd-ink)] hover:border-[var(--brd-amber)] disabled:opacity-50"
      >
        {busy ? "Mierzę…" : "Zmierz bit"}
      </button>
      {note ? <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{note}</p> : null}
      {measure ? <Measurement measure={measure} /> : null}
    </form>
  );
}

function Measurement({ measure }: { measure: BeatMeasure }) {
  const peak = measure.peakDb.toFixed(1);
  const rms = measure.rmsDb.toFixed(1);
  const hz = Math.round(measure.centroidHz);
  let advice = `Szczyt ${peak} dBFS, RMS ${rms} dBFS, środek ${hz} Hz. Zostawiam plik bez zmian.`;
  if (measure.suggestion === "hot") {
    advice = `Szczyt ${peak} dBFS. Ścisz bit o około ${measure.lowerByDb} dB, żeby wokal miał miejsce. Plik zostaje bez zmian.`;
  } else if (measure.suggestion === "quiet") {
    advice = `Bit jest cichy (${peak} dBFS). Nie podbijam go sam.`;
  } else if (measure.suggestion === "mud") {
    advice = `Środek ciężkości ${hz} Hz. Dużo dołu. Mniej basu albo sidechain zrobi kieszeń na wokal. Plik zostaje bez zmian.`;
  }
  return (
    <div className="max-w-prose space-y-2 text-sm text-[var(--brd-ink-soft)]" data-testid="studio-optimizer-measure">
      <p>Szczyt {peak} dBFS · RMS {rms} dBFS · środek {hz} Hz</p>
      <p>{advice}</p>
    </div>
  );
}
