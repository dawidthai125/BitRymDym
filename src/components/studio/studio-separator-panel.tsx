"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ProjectOpt = { id: string; title: string };
type StemName = "vocals" | "drums" | "bass" | "other";
type Job = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  errorCode: string | null;
  stems: Partial<Record<StemName, string>> | null;
};

const LABELS: Record<StemName, string> = {
  vocals: "Wokal",
  drums: "Bębny",
  bass: "Bas",
  other: "Reszta",
};

const QUEUED =
  "Jest w kolejce. Pliki pojawią się, gdy rozcinanie się skończy. Samo kliknięcie jeszcze ich nie daje.";

export function StudioSeparatorPanel({ projects, canEnqueue }: { projects: ProjectOpt[]; canEnqueue: boolean }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);

  const waiting = job?.status === "queued" || job?.status === "running";

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    const load = () => {
      void fetch(`/api/studio/separate?projectId=${encodeURIComponent(projectId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json: { job?: Job | null } | null) => {
          if (live) setJob(json?.job ?? null);
        })
        .catch(() => undefined);
    };
    load();
    if (!waiting) return () => {
      live = false;
    };
    const timer = window.setInterval(load, 4000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [projectId, waiting]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId || !canEnqueue) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/studio/separate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; accepted?: boolean };
      if (res.status === 202 && json.accepted === true) {
        setJob({ id: "pending", status: "queued", errorCode: null, stems: null });
      } else if (res.status === 409) {
        setNote("To zgłoszenie już czeka albo jest w trakcie.");
      } else if (res.status === 404) {
        setNote("Nie ma zatwierdzonego mastera ani bitu w tym projekcie.");
      } else if (res.status === 503) {
        setNote("Rozcinanie jest chwilowo wyłączone.");
      } else if (res.status === 403) {
        setNote("Pliki z rozcięcia są od Silver.");
      } else {
        setNote("Nie udało się przyjąć zgłoszenia.");
      }
    } catch {
      setNote("Nie udało się przyjąć zgłoszenia.");
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
      {canEnqueue ? (
        <button
          type="submit"
          disabled={busy || !projectId}
          className="w-fit border border-[var(--brd-line)] px-3 py-2 text-sm text-[var(--brd-ink)] hover:border-[var(--brd-amber)] disabled:opacity-50"
        >
          {busy ? "Wysyłanie…" : "Oddaj do rozcięcia"}
        </button>
      ) : (
        <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
          Pliki są od Silver.{" "}
          <Link href="/premium" className="underline underline-offset-4">
            Zobacz plany
          </Link>
        </p>
      )}
      {note ? <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{note}</p> : null}
      {job?.status === "queued" || job?.status === "running" ? (
        <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{QUEUED}</p>
      ) : null}
      {job?.status === "failed" ? (
        <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">Rozcięcie nie doszło do końca ({job.errorCode ?? "błąd"}).</p>
      ) : null}
      {job?.status === "succeeded" && job.stems ? (
        <ul className="flex flex-col gap-2 text-sm">
          {(Object.keys(LABELS) as StemName[]).map((name) =>
            job.stems?.[name] ? (
              <li key={name}>
                <a href={job.stems[name]} className="underline-offset-4 hover:underline">
                  {LABELS[name]}
                </a>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
    </form>
  );
}
