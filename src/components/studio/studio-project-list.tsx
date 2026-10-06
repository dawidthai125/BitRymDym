"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { StudioProjectSummary } from "@/lib/studio/studio-types";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";

export function StudioProjectList({
  initialProjects,
}: {
  initialProjects: StudioProjectSummary[];
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function createProject() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/studio/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Nowy projekt" }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          document?: { project: StudioProjectSummary };
          error?: string;
        };
        if (!res.ok || !json.document) {
          throw new Error(json.error ?? "Nie udało się utworzyć projektu.");
        }
        setProjects((prev) => [json.document!.project, ...prev]);
        router.push(`/studio/p/${json.document.project.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Błąd tworzenia projektu.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--brd-ink-soft)]">
          Projekty Studio — fundament timeline (P5.1).
        </p>
        <Button type="button" onClick={createProject} disabled={pending}>
          Nowy projekt
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {projects.length === 0 ? (
        <div className="rounded border border-dashed border-[var(--brd-line)] p-6 text-sm text-[var(--brd-mute)]">
          Nie masz jeszcze projektu. Utwórz pierwszy, żeby zobaczyć ścieżki i oś
          czasu. Szybkie nagranie na bicie nadal działa osobno.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/studio/p/${project.id}`}
                className="flex flex-col gap-1 py-4 transition hover:bg-[var(--brd-line)]/20 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-[var(--brd-ink)]">
                  {project.title}
                </span>
                <span className="text-xs text-[var(--brd-mute)]">
                  {project.tempoBpm} BPM · {formatStudioTimeMs(project.timelineLengthMs)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
