"use client";

import { useState } from "react";

type ProjectOpt = { id: string; title: string };

const OFF =
  "Separator jest wyłączony, dopóki host nie poda DEMUCS_PYTHON. Wagi nie są w aplikacji.";

export function StudioSeparatorPanel({
  projects,
  configured,
}: {
  projects: ProjectOpt[];
  configured: boolean;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(configured ? null : OFF);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!configured) {
      setNote(OFF);
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/studio/separate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; accepted?: boolean };
      if (res.status === 503 || json.error === "separator_unconfigured") {
        setNote(OFF);
      } else if (res.status === 202 && json.accepted === true) {
        setNote("Przyjęte. Rozcięcie robi host workerów, nie ta aplikacja. Nie powstają tu pliki audio.");
      } else if (res.status === 404) {
        setNote("Nie ma takiego projektu albo nie należy do Ciebie.");
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
      <button
        type="submit"
        disabled={busy || !configured || !projectId}
        className="w-fit border border-[var(--brd-line)] px-3 py-2 text-sm text-[var(--brd-ink)] hover:border-[var(--brd-amber)] disabled:opacity-50"
      >
        {busy ? "Wysyłanie…" : "Oddaj do rozcięcia"}
      </button>
      {note ? <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{note}</p> : null}
    </form>
  );
}
