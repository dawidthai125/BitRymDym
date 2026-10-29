"use client";


import { useTranslations } from "next-intl";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  getStudioDialogFocusable,
  handleStudioDialogKeydown,
} from "@/lib/studio/studio-dialog-focus";
import {
  STUDIO_EXPORT_POLL_INTERVAL_MS,
  STUDIO_EXPORT_POLL_MAX_ATTEMPTS,
  createStudioExportIdempotencyKey,
  mapStudioExportDownloadHttpResult,
  mapStudioExportHttpResult,
  mapStudioExportLatestHttpResult,
  studioExportArtifactDownloadUrl,
  studioExportEnqueueUrl,
  studioExportLatestStatusUrl,
  studioExportPhaseLabel,
  studioExportStatusUrl,
  type StudioExportUiPhase,
} from "@/lib/studio/studio-export-client";
import { toUserFacingError } from "@/lib/ui/user-errors";

export type StudioExportControlProps = {
  projectId: string;
  getExpectedDocumentVersion: () => number;
  disabled?: boolean;
};

/**
 * Stage I — Studio Final Mix WAV export control.
 * Uses POST/GET /api/studio/projects/[projectId]/export + owner artifact download.
 * I.45AU — on dialog open, GET latest (read-only) restores prior job; never auto-POST.
 * Does not auto-enqueue on mount. Does not accept client object keys.
 */
export function StudioExportControl({
  projectId,
  getExpectedDocumentVersion,
  disabled,
}: StudioExportControlProps) {
  const t = useTranslations("studio.studioExportControl");
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<StudioExportUiPhase>("IDLE");
  const [jobId, setJobId] = useState<string | null>(null);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  /** Trusted from export status — null = LEGACY_STUDIO / not SFM (never invent). */
  const [sfmVersionId, setSfmVersionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const pollAttemptsRef = useRef(0);
  const pollInFlightRef = useRef(false);
  /** Invalidates in-flight recovery when dialog closes or enqueue starts. */
  const recoverGenRef = useRef(0);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const closeDialog = useCallback(() => {
    setOpen(false);
  }, []);

  // Stage I.3A — focus trap / Escape / restore (Mixer/Inspector contract).
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : triggerRef.current;
    const panel = dialogRef.current;
    const focusables = panel ? getStudioDialogFocusable(panel) : [];
    const first = focusables[0] ?? panel;
    first?.focus();

    function onKeyDown(event: KeyboardEvent) {
      handleStudioDialogKeydown({
        event,
        panel: dialogRef.current,
        onClose: closeDialog,
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const restore = previouslyFocusedRef.current ?? triggerRef.current;
      previouslyFocusedRef.current = null;
      restore?.focus?.();
    };
  }, [open, closeDialog]);

  function applyMappedFailure(
    mapped: Extract<ReturnType<typeof mapStudioExportHttpResult>, { ok: false }>,
  ) {
    setPhase(mapped.phase);
    setMessage(mapped.message);
    if (mapped.phase === "CONFLICT") {
      attemptIdRef.current = null;
      idempotencyKeyRef.current = null;
    }
  }

  function applyRecoveredJob(mapped: {
    phase: StudioExportUiPhase;
    jobId: string;
    projectId: string;
    artifactId: string | null;
    sfmVersionId: string | null;
    message?: string | null;
  }) {
    if (mapped.projectId && mapped.projectId !== projectIdRef.current) {
      setPhase("FAILED");
      setMessage(t("eksportDotyczyInnegoProjektu"));
      return;
    }
    setJobId(mapped.jobId);
    setArtifactId(mapped.artifactId);
    setSfmVersionId(mapped.sfmVersionId);
    pollAttemptsRef.current = 0;
    if (mapped.phase === "SUCCEEDED" && !mapped.artifactId) {
      setPhase("UNAVAILABLE");
      setMessage(
        t("eksportZakonczonyAleArtefakt"),
      );
      return;
    }
    setPhase(mapped.phase);
    if (mapped.phase === "FAILED") {
      // I.17 — typed empty-session vs generic FAILED; never show raw API text.
      setMessage(
        mapped.message ??
          t("eksportNiePowiodlSie"),
      );
    } else {
      setMessage(null);
    }
  }

  // I.45AU — recover latest export on dialog open only (not on re-render / mount).
  useEffect(() => {
    if (!open) {
      recoverGenRef.current += 1;
      setRecovering(false);
      return;
    }

    const gen = ++recoverGenRef.current;
    const ac = new AbortController();
    setRecovering(true);

    async function recoverLatest() {
      try {
        let res: Response;
        try {
          res = await fetch(
            studioExportLatestStatusUrl(projectIdRef.current),
            {
              method: "GET",
              credentials: "same-origin",
              signal: ac.signal,
            },
          );
        } catch {
          if (ac.signal.aborted || gen !== recoverGenRef.current) return;
          setPhase("UNAVAILABLE");
          setMessage(t("nieUdaloSieOdczytac"));
          return;
        }
        if (gen !== recoverGenRef.current) return;
        const json = (await res.json()) as Parameters<
          typeof mapStudioExportLatestHttpResult
        >[0]["json"];
        if (gen !== recoverGenRef.current) return;
        const mapped = mapStudioExportLatestHttpResult({
          httpStatus: res.status,
          json,
        });
        if (gen !== recoverGenRef.current) return;
        if (!mapped.ok) {
          applyMappedFailure(mapped);
          return;
        }
        if (mapped.empty) {
          setJobId(null);
          setArtifactId(null);
          setSfmVersionId(null);
          setPhase("IDLE");
          setMessage(null);
          return;
        }
        applyRecoveredJob({
          phase: mapped.phase,
          jobId: mapped.jobId,
          projectId: mapped.projectId,
          artifactId: mapped.artifactId,
          sfmVersionId: mapped.sfmVersionId,
          message: mapped.message,
        });
      } finally {
        if (gen === recoverGenRef.current) {
          setRecovering(false);
        }
      }
    }

    void recoverLatest();
    return () => {
      ac.abort();
      recoverGenRef.current += 1;
    };
    // Recovery is intentionally keyed only on dialog open + project.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- I.45AU open-only recovery
  }, [open, projectId]);

  async function pollOnce(activeJobId: string) {
    if (pollInFlightRef.current) return;
    if (pollAttemptsRef.current >= STUDIO_EXPORT_POLL_MAX_ATTEMPTS) {
      setPhase("UNAVAILABLE");
      setMessage(
        t("statusEksportuNieJest"),
      );
      return;
    }
    pollInFlightRef.current = true;
    pollAttemptsRef.current += 1;
    try {
      let res: Response;
      try {
        res = await fetch(
          studioExportStatusUrl(projectIdRef.current, activeJobId),
          {
            method: "GET",
            credentials: "same-origin",
          },
        );
      } catch {
        setPhase("UNAVAILABLE");
        setMessage(t("nieUdaloSieOdczytac"));
        return;
      }
      const json = (await res.json()) as Parameters<
        typeof mapStudioExportHttpResult
      >[0]["json"];
      const mapped = mapStudioExportHttpResult({
        httpStatus: res.status,
        json,
      });
      if (!mapped.ok) {
        applyMappedFailure(mapped);
        return;
      }
      if (mapped.projectId && mapped.projectId !== projectIdRef.current) {
        setPhase("FAILED");
        setMessage(t("eksportDotyczyInnegoProjektu"));
        return;
      }
      setJobId(mapped.jobId);
      if (mapped.artifactId) {
        setArtifactId(mapped.artifactId);
        setSfmVersionId(mapped.sfmVersionId);
      }
      if (mapped.phase === "SUCCEEDED" && !mapped.artifactId) {
        setPhase("UNAVAILABLE");
        setMessage(
          t("eksportZakonczonyAleArtefakt"),
        );
        return;
      }
      setPhase(mapped.phase);
      if (mapped.phase === "FAILED") {
        // I.17 — typed empty-session vs generic FAILED; never show raw API text.
        setMessage(
          mapped.message ??
            t("eksportNiePowiodlSie"),
        );
      }
    } finally {
      pollInFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (!open || !jobId) return;
    if (phase !== "QUEUED" && phase !== "RUNNING") return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void pollOnce(jobId);
    };
    run();
    const timer = window.setInterval(run, STUDIO_EXPORT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // pollOnce closes over stable setters/refs; intentionally keyed on job lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Stage I controlled poll
  }, [open, jobId, phase]);

  function ensureAttemptKey(documentVersion: number): string {
    if (!attemptIdRef.current) {
      attemptIdRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createStudioExportIdempotencyKey({
        projectId: projectIdRef.current,
        documentVersion,
        attemptId: attemptIdRef.current,
      });
    }
    return idempotencyKeyRef.current;
  }

  async function enqueueExport(options?: { forceNewAttempt?: boolean }) {
    if (!projectId || projectId.length < 8) {
      setPhase("FAILED");
      setMessage(t("brakPrawidlowegoProjektuStudio"));
      return;
    }
    if (phase === "SUBMITTING") return;

    // Invalidate any in-flight recovery so it cannot overwrite a user enqueue.
    recoverGenRef.current += 1;
    setRecovering(false);

    if (options?.forceNewAttempt) {
      attemptIdRef.current = null;
      idempotencyKeyRef.current = null;
      setJobId(null);
      setArtifactId(null);
      setSfmVersionId(null);
      pollAttemptsRef.current = 0;
    }

    const expectedDocumentVersion = getExpectedDocumentVersion();
    if (
      typeof expectedDocumentVersion !== "number" ||
      !Number.isInteger(expectedDocumentVersion) ||
      expectedDocumentVersion < 1
    ) {
      setPhase("FAILED");
      setMessage(t("nieprawidlowaWersjaDokumentuOdswiez"));
      return;
    }

    const idempotencyKey = ensureAttemptKey(expectedDocumentVersion);
    setPhase("SUBMITTING");
    setMessage(null);

    let res: Response;
    try {
      res = await fetch(studioExportEnqueueUrl(projectId), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedDocumentVersion,
          idempotencyKey,
        }),
      });
    } catch {
      const mapped = mapStudioExportHttpResult({
        httpStatus: 0,
        json: {},
        networkError: true,
      });
      if (!mapped.ok) applyMappedFailure(mapped);
      return;
    }

    const json = (await res.json()) as Parameters<
      typeof mapStudioExportHttpResult
    >[0]["json"];
    const mapped = mapStudioExportHttpResult({
      httpStatus: res.status,
      json,
    });
    if (!mapped.ok) {
      applyMappedFailure(mapped);
      return;
    }
    if (mapped.projectId && mapped.projectId !== projectId) {
      setPhase("FAILED");
      setMessage(t("eksportDotyczyInnegoProjektu"));
      return;
    }
    setJobId(mapped.jobId);
    if (mapped.artifactId) {
      setArtifactId(mapped.artifactId);
      setSfmVersionId(mapped.sfmVersionId);
    }
    if (mapped.phase === "SUCCEEDED" && !mapped.artifactId) {
      setPhase("UNAVAILABLE");
      setMessage(t("eksportZakonczonyAleArtefakt"));
      return;
    }
    setPhase(mapped.phase);
    pollAttemptsRef.current = 0;
  }

  async function onDownload() {
    if (!artifactId || downloading) return;
    setDownloading(true);
    setMessage(null);
    try {
      const res = await fetch(
        studioExportArtifactDownloadUrl(artifactId, { sfmVersionId }),
        {
          method: "GET",
          credentials: "same-origin",
        },
      );
      let json: { success?: boolean; url?: string; error?: string } = {};
      try {
        json = (await res.json()) as {
          success?: boolean;
          url?: string;
          error?: string;
        };
      } catch {
        json = {};
      }
      const mapped = mapStudioExportDownloadHttpResult({
        httpStatus: res.status,
        json,
      });
      if (!mapped.ok) {
        throw new Error(mapped.message);
      }
      window.location.assign(mapped.url);
    } catch (e) {
      setMessage(
        toUserFacingError(
          e instanceof Error ? e.message : t("pobieranieNiedostepne"),
          "download",
        ),
      );
      setPhase("UNAVAILABLE");
    } finally {
      setDownloading(false);
    }
  }

  async function onRefreshStatus() {
    if (!jobId) {
      setPhase("UNAVAILABLE");
      setMessage(t("brakAktywnegoZadaniaEksportu"));
      return;
    }
    pollAttemptsRef.current = 0;
    await pollOnce(jobId);
  }

  const submitting = phase === "SUBMITTING";
  // I.45AW — UNAVAILABLE with a tracked jobId is status-recovery, not "Ponów".
  // New export then requires an explicit force-new action (forceNewAttempt).
  const unavailableWithTrackedJob = phase === "UNAVAILABLE" && Boolean(jobId);
  const canStart =
    !disabled &&
    !submitting &&
    !recovering &&
    !unavailableWithTrackedJob &&
    (phase === "IDLE" ||
      phase === "FAILED" ||
      phase === "CONFLICT" ||
      phase === "UNAVAILABLE" ||
      phase === "SUCCEEDED");
  const canForceNewDespiteUnavailable =
    !disabled &&
    !submitting &&
    !recovering &&
    unavailableWithTrackedJob;
  const showDownload = phase === "SUCCEEDED" && Boolean(artifactId);
  const startLabel = submitting
    ? t("wysylanie")
    : recovering
      ? t("odzyskiwanie")
      : phase === "IDLE"
        ? t("eksportujWav")
        : phase === "SUCCEEDED"
          ? t("eksportujPonownie")
          : t("ponowEksport");

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex min-h-11 items-center rounded border border-[var(--brd-paper)]/40 bg-[var(--brd-paper)] px-2.5 text-xs font-semibold text-[var(--brd-ink)] hover:border-[var(--brd-green)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)] disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="studio-transport-export"
        title={t("eksportujCalyDokumentStudio")}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? "studio-export-dialog" : undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {t("eksportujWav")}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default bg-transparent"
            aria-label={t("zamknijEksport")}
            data-testid="studio-export-backdrop"
            onClick={closeDialog}
          />
          <div
            ref={dialogRef}
            id="studio-export-dialog"
            className="absolute right-0 z-30 mt-2 w-[min(100vw-2rem,20rem)] space-y-3 rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-3 text-[var(--brd-ink)] shadow-sm outline-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            data-testid="studio-export-dialog"
          >
            <div className="space-y-1">
              <p id={titleId} className="text-xs font-semibold">
                {t("eksportCalegoDokumentu")}
              </p>
              <p
                id={descriptionId}
                className="text-[11px] text-[var(--brd-ink)]/75"
              >
                {t("formatWavOperacjaW")}
              </p>
            </div>

            <p
              className="text-xs"
              role="status"
              data-testid="studio-export-status"
              data-phase={phase}
            >
              {recovering && phase === "IDLE"
                ? t("odzyskiwanieStatusu")
                : studioExportPhaseLabel(phase)}
            </p>

            {message ? (
              <p
                className="text-xs text-[var(--brd-warn)]"
                role="alert"
                data-testid="studio-export-message"
              >
                {message}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {/* Primary start — hidden when UNAVAILABLE already tracks a jobId (I.45AW). */}
              {!unavailableWithTrackedJob ? (
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)]"
                  disabled={!canStart}
                  data-testid="studio-export-start"
                  onClick={() =>
                    void enqueueExport({
                      // FAILED/CONFLICT/SUCCEEDED need a new attempt. UNAVAILABLE
                      // without jobId (network ambiguity) reuses the same idempotency key.
                      forceNewAttempt:
                        phase === "FAILED" ||
                        phase === "CONFLICT" ||
                        phase === "SUCCEEDED",
                    })
                  }
                >
                  {startLabel}
                </Button>
              ) : null}

              {jobId &&
              (phase === "QUEUED" ||
                phase === "RUNNING" ||
                phase === "UNAVAILABLE") ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)]"
                  data-testid="studio-export-refresh"
                  onClick={() => void onRefreshStatus()}
                >
                  {t("sprawdzStatus")}
                </Button>
              ) : null}

              {canForceNewDespiteUnavailable ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)]"
                  data-testid="studio-export-force-new"
                  onClick={() =>
                    void enqueueExport({ forceNewAttempt: true })
                  }
                >
                  {t("utworzNowyEksportMimo")}
                </Button>
              ) : null}

              {showDownload ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)]"
                  disabled={downloading}
                  data-testid="studio-export-download"
                  onClick={() => void onDownload()}
                >
                  {downloading ? t("pobieranie") : t("pobierzWav")}
                </Button>
              ) : null}

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)]"
                data-testid="studio-export-close"
                onClick={closeDialog}
              >
                {t("zamknij")}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
