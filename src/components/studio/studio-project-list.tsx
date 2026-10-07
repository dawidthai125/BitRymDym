"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { BrdButton, BrdLink } from "@/components/brand/brd-button";
import { BrdCheckbox } from "@/components/brand/brd-checkbox";
import { STUDIO_PROJECT_LIST_PAGE_SIZE } from "@/config/studio";
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

async function deleteProjectRequest(projectId: string): Promise<void> {
  const res = await fetch(`/api/studio/projects/${projectId}`, {
    method: "DELETE",
  });
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "Nie udało się usunąć projektu.");
  }
}

function DeleteConfirmDialog({
  title,
  description,
  confirmLabel,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
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
          {title}
        </h2>
        <div id={descId} className="mt-3 space-y-2 text-sm text-[var(--brd-ink-soft)]">
          {description}
        </div>
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
          >
            {pending ? "Usuwanie…" : confirmLabel}
          </BrdButton>
        </div>
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  selected,
  pending,
  onToggle,
  onRequestDelete,
}: {
  project: StudioProjectSummary;
  selected: boolean;
  pending: boolean;
  onToggle: (projectId: string) => void;
  onRequestDelete: (project: StudioProjectSummary) => void;
}) {
  const metaParts = [
    `${project.tempoBpm} BPM`,
    formatStudioListDurationMs(project.timelineLengthMs),
    project.beatId ? "z bitem" : null,
  ].filter(Boolean);
  const checkboxId = `studio-project-select-${project.id}`;

  return (
    <li className="border-b border-[var(--brd-line)] last:border-b-0">
      <div className="flex gap-1 py-5 sm:gap-2">
        <div className="flex shrink-0 items-start">
          <BrdCheckbox
            id={checkboxId}
            checked={selected}
            disabled={pending}
            onChange={() => onToggle(project.id)}
            aria-label={`Zaznacz projekt ${project.title}`}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:pt-2">
          <div className="min-w-0 flex-1 space-y-2 pt-2 sm:pt-0">
            <label
              htmlFor={checkboxId}
              className="block cursor-pointer truncate text-lg font-semibold tracking-tight text-[var(--brd-ink)] sm:text-xl"
            >
              {project.title}
            </label>
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
  const selectAllId = useId();
  const [projects, setProjects] = useState(initialProjects);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<StudioProjectSummary | null>(
    null,
  );
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(0);
  const seededRef = useRef(false);

  const pageCount = Math.max(
    1,
    Math.ceil(projects.length / STUDIO_PROJECT_LIST_PAGE_SIZE),
  );
  const safePage = Math.min(page, pageCount - 1);

  const pageProjects = useMemo(() => {
    const start = safePage * STUDIO_PROJECT_LIST_PAGE_SIZE;
    return projects.slice(start, start + STUDIO_PROJECT_LIST_PAGE_SIZE);
  }, [projects, safePage]);

  const pageIds = useMemo(
    () => pageProjects.map((project) => project.id),
    [pageProjects],
  );

  const selectedOnPageCount = pageIds.filter((id) => selectedIds.has(id)).length;
  const allOnPageSelected =
    pageIds.length > 0 && selectedOnPageCount === pageIds.length;
  const someOnPageSelected =
    selectedOnPageCount > 0 && selectedOnPageCount < pageIds.length;
  const selectedCount = selectedIds.size;
  const selectedProjects = useMemo(
    () => projects.filter((project) => selectedIds.has(project.id)),
    [projects, selectedIds],
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

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
    setPage(0);
    router.push(`/studio/p/${json.document.project.id}`);
  }

  function toggleOne(projectId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function requestDelete(project: StudioProjectSummary) {
    setDeleteError(null);
    setBulkDeleteOpen(false);
    setDeleteTarget(project);
  }

  function requestBulkDelete() {
    if (selectedCount === 0) return;
    setDeleteError(null);
    setDeleteTarget(null);
    setBulkDeleteOpen(true);
  }

  function confirmSingleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteError(null);
    startTransition(async () => {
      try {
        await deleteProjectRequest(target.id);
        setProjects((prev) => prev.filter((p) => p.id !== target.id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(target.id);
          return next;
        });
        setDeleteTarget(null);
        router.refresh();
      } catch (e) {
        setDeleteError(
          e instanceof Error ? e.message : "Nie udało się usunąć projektu.",
        );
      }
    });
  }

  function confirmBulkDelete() {
    if (selectedProjects.length === 0) return;
    const targets = selectedProjects;
    setDeleteError(null);
    startTransition(async () => {
      const deleted: string[] = [];
      try {
        for (const project of targets) {
          await deleteProjectRequest(project.id);
          deleted.push(project.id);
        }
        setProjects((prev) => prev.filter((p) => !deleted.includes(p.id)));
        setSelectedIds(new Set());
        setBulkDeleteOpen(false);
        router.refresh();
      } catch (e) {
        if (deleted.length > 0) {
          setProjects((prev) => prev.filter((p) => !deleted.includes(p.id)));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const id of deleted) next.delete(id);
            return next;
          });
        }
        setDeleteError(
          e instanceof Error
            ? e.message
            : "Nie udało się usunąć zaznaczonych projektów.",
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

  const rangeStart =
    projects.length === 0 ? 0 : safePage * STUDIO_PROJECT_LIST_PAGE_SIZE + 1;
  const rangeEnd = Math.min(
    projects.length,
    (safePage + 1) * STUDIO_PROJECT_LIST_PAGE_SIZE,
  );

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
        <div className="space-y-4">
          <div className="flex flex-col gap-3 border border-[var(--brd-line)] bg-[var(--brd-paper-deep,#f3efe6)]/30 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor={selectAllId}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-sm text-[var(--brd-ink)]"
              >
                <BrdCheckbox
                  id={selectAllId}
                  checked={allOnPageSelected}
                  indeterminate={someOnPageSelected}
                  disabled={pending || pageIds.length === 0}
                  onChange={toggleSelectAllOnPage}
                  aria-label="Zaznacz wszystkie projekty na tej stronie"
                />
                <span>
                  {allOnPageSelected
                    ? "Odznacz stronę"
                    : "Zaznacz wszystko na stronie"}
                </span>
              </label>
              {selectedCount > 0 ? (
                <span className="text-sm text-[var(--brd-ink-soft)]" role="status">
                  Zaznaczono {selectedCount}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedCount > 0 ? (
                <>
                  <BrdButton
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={clearSelection}
                  >
                    Odznacz
                  </BrdButton>
                  <BrdButton
                    type="button"
                    variant="danger"
                    disabled={pending}
                    onClick={requestBulkDelete}
                    aria-label={`Usuń zaznaczone projekty (${selectedCount})`}
                  >
                    Usuń zaznaczone
                  </BrdButton>
                </>
              ) : (
                <p className="text-sm text-[var(--brd-mute)]">
                  Zaznacz projekty, aby usunąć kilka naraz.
                </p>
              )}
            </div>
          </div>

          <ul className="border-y border-[var(--brd-line)]">
            {pageProjects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                selected={selectedIds.has(project.id)}
                pending={pending}
                onToggle={toggleOne}
                onRequestDelete={requestDelete}
              />
            ))}
          </ul>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-xs tabular-nums text-[var(--brd-mute)]">
              {rangeStart}–{rangeEnd} z {projects.length}
              {pageCount > 1 ? ` · strona ${safePage + 1} / ${pageCount}` : ""}
            </p>
            {pageCount > 1 ? (
              <div className="flex flex-wrap gap-2">
                <BrdButton
                  type="button"
                  variant="secondary"
                  disabled={pending || safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Poprzednia
                </BrdButton>
                <BrdButton
                  type="button"
                  variant="secondary"
                  disabled={pending || safePage >= pageCount - 1}
                  onClick={() =>
                    setPage((p) => Math.min(pageCount - 1, p + 1))
                  }
                >
                  Następna
                </BrdButton>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {deleteTarget ? (
        <DeleteConfirmDialog
          title="Usuń projekt?"
          description={
            <>
              <p className="font-medium text-[var(--brd-ink)]">
                „{deleteTarget.title}”
              </p>
              <p>
                Projekt oraz powiązane dane projektu (ścieżki, clipy na timeline)
                zostaną usunięte. Nagrania (Takes) i bity pozostaną nietknięte.
                Tej operacji nie można cofnąć.
              </p>
            </>
          }
          confirmLabel="Usuń projekt"
          pending={pending}
          error={deleteError}
          onClose={() => {
            if (!pending) {
              setDeleteTarget(null);
              setDeleteError(null);
            }
          }}
          onConfirm={confirmSingleDelete}
        />
      ) : null}

      {bulkDeleteOpen ? (
        <DeleteConfirmDialog
          title="Usuń zaznaczone projekty?"
          description={
            <>
              <p className="font-medium text-[var(--brd-ink)]">
                Zostanie usuniętych: {selectedCount}
              </p>
              <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-[var(--brd-ink)]">
                {selectedProjects.slice(0, 8).map((project) => (
                  <li key={project.id} className="truncate">
                    {project.title}
                  </li>
                ))}
                {selectedCount > 8 ? (
                  <li className="text-[var(--brd-mute)]">
                    …i jeszcze {selectedCount - 8}
                  </li>
                ) : null}
              </ul>
              <p>
                Projekty oraz powiązane ścieżki/clipy zostaną usunięte. Nagrania
                (Takes) i bity pozostaną nietknięte. Tej operacji nie można
                cofnąć.
              </p>
            </>
          }
          confirmLabel="Usuń zaznaczone"
          pending={pending}
          error={deleteError}
          onClose={() => {
            if (!pending) {
              setBulkDeleteOpen(false);
              setDeleteError(null);
            }
          }}
          onConfirm={confirmBulkDelete}
        />
      ) : null}
    </div>
  );
}
