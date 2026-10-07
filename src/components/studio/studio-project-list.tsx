"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { BrdButton, BrdLink } from "@/components/brand/brd-button";
import type { StudioProjectSummary } from "@/lib/studio/studio-types";
import { formatStudioListDurationMs } from "@/lib/studio/studio-time";

function formatProjectDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatProjectDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function DeleteProjectDialog({
  project,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  project: StudioProjectSummary;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descId = useId();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md border border-[var(--brd-line)] bg-[var(--brd-paper)] p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-[var(--brd-ink)]">
          Usuń projekt?
        </h2>
        <p className="mt-3 text-sm font-medium text-[var(--brd-ink)]">
          „{project.title}”
        </p>
        <p id={descId} className="mt-3 text-sm text-[var(--brd-ink-soft)]">
          Projekt oraz powiązane dane projektu (ścieżki, clipy na timeline)
          zostaną usunięte. Nagrania (Takes) i bity pozostaną nietknięte. Tej
          operacji nie można cofnąć.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <BrdButton
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={pending}
          >
            Anuluj
          </BrdButton>
          <BrdButton
            type="button"
            variant="danger"
            onClick={onConfirm}
            disabled={pending}
            aria-label={`Usuń projekt ${project.title}`}
          >
            {pending ? "Usuwanie…" : "Usuń projekt"}
          </BrdButton>
        </div>
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  pending,
  onRequestDelete,
}: {
  project: StudioProjectSummary;
  pending: boolean;
  onRequestDelete: (project: StudioProjectSummary) => void;
}) {
  const metaParts = [
    `${project.tempoBpm} BPM`,
    formatStudioListDurationMs(project.timelineLengthMs),
    project.beatId ? "z bitem" : null,
  ].filter(Boolean);

  return (
    <li className="border-b border-[var(--brd-line)] last:border-b-0">
      <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--brd-ink)] sm:text-xl">
            {project.title}
          </h2>
          <dl className="space-y-0.5 text-sm text-[var(--brd-ink-soft)]">
            <div className="flex flex-wrap gap-x-2">
              <dt className="sr-only">Utworzono</dt>
              <dd>
                <span className="text-[var(--brd-mute)]">Utworzono</span>{" "}
                {formatProjectDate(project.createdAt)}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="sr-only">Edytowano</dt>
              <dd>
                <span className="text-[var(--brd-mute)]">Edytowano</span>{" "}
                {formatProjectDateTime(project.updatedAt)}
              </dd>
            </div>
          </dl>
          <p className="font-mono text-xs tabular-nums text-[var(--brd-mute)]">
            {metaParts.join(" · ")}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
          <BrdLink
            href={`/studio/p/${project.id}`}
            variant="secondary"
            aria-label={`Otwórz projekt ${project.title}`}
          >
            Otwórz
          </BrdLink>
          <BrdButton
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => onRequestDelete(project)}
            aria-label={`Usuń projekt ${project.title}`}
          >
            Usuń
          </BrdButton>
        </div>
      </div>
    </li>
  );
}

export function StudioProjectList({
  initialProjects,
  seedBeatId = null,
}: {
  initialProjects: StudioProjectSummary[];
  /** When set (e.g. from /studio?beatId=), create a project with BEAT_REF once. */
  seedBeatId?: string | null;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<StudioProjectSummary | null>(
    null,
  );
  const seededRef = useRef(false);

  async function createProject(beatId?: string | null) {
    setError(null);
    const res = await fetch("/api/studio/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: beatId ? "Projekt z bitem" : "Nowy projekt",
        beatId: beatId ?? null,
      }),
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
  }

  function requestDelete(project: StudioProjectSummary) {
    setDeleteError(null);
    setDeleteTarget(project);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/studio/projects/${target.id}`, {
          method: "DELETE",
        });
        const json = (await res.json()) as {
          success?: boolean;
          error?: string;
        };
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "Nie udało się usunąć projektu.");
        }
        setProjects((prev) => prev.filter((p) => p.id !== target.id));
        setDeleteTarget(null);
        router.refresh();
      } catch (e) {
        setDeleteError(
          e instanceof Error ? e.message : "Nie udało się usunąć projektu.",
        );
      }
    });
  }

  useEffect(() => {
    if (!seedBeatId || seededRef.current) return;
    seededRef.current = true;
    startTransition(async () => {
      try {
        await createProject(seedBeatId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Błąd tworzenia projektu.");
      }
    });
    // intentionally once per seedBeatId mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedBeatId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--brd-ink-soft)]">
          Twoje projekty Studio — najnowsze na górze.
        </p>
        <BrdButton
          type="button"
          variant="primary"
          onClick={() =>
            startTransition(async () => {
              try {
                await createProject(null);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Błąd tworzenia projektu.",
                );
              }
            })
          }
          disabled={pending}
        >
          Nowy projekt
        </BrdButton>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {pending && seedBeatId ? (
        <p className="text-sm text-[var(--brd-mute)]" role="status">
          Tworzenie projektu z bitem…
        </p>
      ) : null}

      {projects.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-[var(--brd-line)] bg-[var(--brd-paper-deep,#f3efe6)]/40 px-6 py-10 text-center"
          role="status"
        >
          <p className="text-base font-medium text-[var(--brd-ink)]">
            Nie masz jeszcze żadnego projektu Studio.
          </p>
          <p className="mt-2 text-sm text-[var(--brd-ink-soft)]">
            Utwórz pusty projekt albo otwórz bit i wybierz „Otwórz w Studio”.
          </p>
          <BrdButton
            type="button"
            variant="primary"
            className="mt-6"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await createProject(null);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Błąd tworzenia projektu.",
                  );
                }
              })
            }
          >
            Nowy projekt
          </BrdButton>
        </div>
      ) : (
        <ul className="border-y border-[var(--brd-line)]">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              pending={pending}
              onRequestDelete={requestDelete}
            />
          ))}
        </ul>
      )}

      {deleteTarget ? (
        <DeleteProjectDialog
          project={deleteTarget}
          pending={pending}
          error={deleteError}
          onClose={() => {
            if (!pending) {
              setDeleteTarget(null);
              setDeleteError(null);
            }
          }}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}
