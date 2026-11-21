"use client";

import { useLibText } from "@/i18n/use-lib-text";

import { useTranslations } from "next-intl";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  resolveMixHistoryListPanelKind,
  type MixHistoryListLoadState,
} from "@/lib/studio/mix-working/mix-history-list-ui-state";
import {
  formatMixRevisionWhen,
  isLikelyTipRevision,
  mapMixRevisionCompareHttpResult,
  mapMixRevisionDetailHttpResult,
  mapMixRevisionListHttpResult,
  mapMixRevisionRestoreHttpResult,
  mapStudioProjectDocumentHttpResult,
  mixRevisionAuthorLabel,
  mixRevisionDescriptionLabel,
  mixRevisionKindLabel,
  mixRevisionRowLabel,
  mixWorkingRevisionCompareUrl,
  mixWorkingRevisionRestoreUrl,
  mixWorkingRevisionUrl,
  mixWorkingRevisionsUrl,
  studioProjectDocumentUrl,
  type MixRevisionApiFailure,
  type MixRevisionListItem,
} from "@/lib/studio/mix-working/mix-working-revision-client";
import type { MixWorkingRevisionDiff } from "@/lib/studio/mix-working/mix-working-diff";
import { summarizeMixChanges } from "@/lib/studio/mix-working/mix-change-summary";
import type { MixRevision } from "@/lib/studio/mix-working/mix-working-types";
import {
  getStudioDialogFocusable,
  handleStudioDialogKeydown,
} from "@/lib/studio/studio-dialog-focus";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

const LIST_PAGE_SIZE = 20;

export type StudioMixRevisionHistoryControlProps = {
  projectId: string;
  getExpectedDocumentVersion: () => number;
  tipDocumentVersion: number;
  onDocumentRefreshed: (document: StudioProjectDocument) => void;
  /** Track id → name of the open project, so history reads "Wokal", not an id. */
  trackNames?: Record<string, string>;
  disabled?: boolean;
};

type PanelView = "list" | "detail" | "compare";

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

const noopSubscribe = () => () => {};

export function StudioMixRevisionHistoryControl({
  projectId,
  getExpectedDocumentVersion,
  tipDocumentVersion,
  onDocumentRefreshed,
  trackNames,
  disabled,
}: StudioMixRevisionHistoryControlProps) {
  const tl = useLibText();
  const t = useTranslations("studio.studioMixRevisionHistoryControl");
  const [open, setOpen] = useState(false);
  // Portal target exists only in the browser (false on the server render).
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [view, setView] = useState<PanelView>("list");
  const [revisions, setRevisions] = useState<MixRevisionListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoadState, setListLoadState] =
    useState<MixHistoryListLoadState>("idle");
  const [listError, setListError] = useState<MixRevisionApiFailure | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MixRevision | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<MixRevisionApiFailure | null>(
    null,
  );
  const [compareFromId, setCompareFromId] = useState<string | null>(null);
  const [compareToId, setCompareToId] = useState<string | null>(null);
  const [diff, setDiff] = useState<MixWorkingRevisionDiff | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<MixRevisionApiFailure | null>(
    null,
  );
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreSubmitting, setRestoreSubmitting] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [restoreTone, setRestoreTone] = useState<"ok" | "warn" | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  /** revisionId → what that revision changed vs the one before it (plain sentences). */
  const [summaries, setSummaries] = useState<Record<string, string[] | "loading" | "error">>({});
  /** What "Cofnij tę zmianę" will bring back: current mix → the revision before the selected one. */
  const [undoPreview, setUndoPreview] = useState<{ targetId: string; lines: string[] | "loading" | "error" } | null>(null);
  const trackNamesRef = useRef<Record<string, string>>(trackNames ?? {});
  trackNamesRef.current = trackNames ?? {};

  const titleId = useId();
  const descriptionId = useId();
  const restoreTitleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreDialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  /** Stable for a single restore attempt; reused on identical retry. */
  const restoreRequestIdRef = useRef<string | null>(null);
  const restoreTargetIdRef = useRef<string | null>(null);
  const listGenRef = useRef(0);
  const activeProjectIdRef = useRef(projectId);

  const listLoading = listLoadState === "loading";

  const closeDialog = useCallback(() => {
    setOpen(false);
    setRestoreOpen(false);
    setRestoreSubmitting(false);
    restoreRequestIdRef.current = null;
    restoreTargetIdRef.current = null;
    setUndoPreview(null);
  }, []);

  useEffect(() => {
    if (activeProjectIdRef.current === projectId) return;
    activeProjectIdRef.current = projectId;
    setRevisions([]);
    setNextCursor(null);
    setListError(null);
    // The list is loaded by openDialog(); a project switch closes an open dialog instead of reloading here.
    setListLoadState("idle");
    setOpen(false);
    setSelectedId(null);
    setDetail(null);
    setDiff(null);
  }, [projectId, open]);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : triggerRef.current;
    const panel = restoreOpen ? restoreDialogRef.current : dialogRef.current;
    const focusables = panel ? getStudioDialogFocusable(panel) : [];
    (focusables[0] ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (restoreOpen) {
        handleStudioDialogKeydown({
          event,
          panel: restoreDialogRef.current,
          onClose: () => {
            if (!restoreSubmitting) setRestoreOpen(false);
          },
        });
        return;
      }
      handleStudioDialogKeydown({
        event,
        panel: dialogRef.current,
        onClose: closeDialog,
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (!open) return;
    };
  }, [open, restoreOpen, restoreSubmitting, closeDialog]);

  // Restore focus only after the dialog was really open. On mount (open=false) focusing the trigger
  // scrolled the transport bar to its end and hid Play/Stop/Record.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const restore = previouslyFocusedRef.current ?? triggerRef.current;
    previouslyFocusedRef.current = null;
    restore?.focus?.();
  }, [open]);

  const loadList = useCallback(
    async (options?: { reset?: boolean; cursor?: string | null }) => {
      const gen = ++listGenRef.current;
      const requestProjectId = projectId;
      setListLoadState("loading");
      setListError(null);
      try {
        const res = await fetch(
          mixWorkingRevisionsUrl(requestProjectId, {
            limit: LIST_PAGE_SIZE,
            cursor: options?.cursor ?? undefined,
          }),
          { method: "GET", credentials: "same-origin" },
        );
        const json = await readJson(res);
        if (
          gen !== listGenRef.current ||
          requestProjectId !== activeProjectIdRef.current
        ) {
          return;
        }
        const mapped = mapMixRevisionListHttpResult({
          httpStatus: res.status,
          json,
        });
        if (!mapped.ok) {
          setListError(mapped);
          setListLoadState("error");
          if (options?.reset) {
            setRevisions([]);
            setNextCursor(null);
          }
          return;
        }
        setRevisions((prev) => {
          if (options?.reset || !options?.cursor) return mapped.revisions;
          const seen = new Set(prev.map((r) => r.id));
          const merged = [...prev];
          for (const row of mapped.revisions) {
            if (!seen.has(row.id)) merged.push(row);
          }
          return merged;
        });
        setNextCursor(mapped.nextCursor);
        setListLoadState("success");
      } catch {
        if (
          gen !== listGenRef.current ||
          requestProjectId !== activeProjectIdRef.current
        ) {
          return;
        }
        setListError(
          mapMixRevisionListHttpResult({
            httpStatus: 0,
            json: {},
            network: true,
          }) as MixRevisionApiFailure,
        );
        setListLoadState("error");
      }
    },
    [projectId],
  );

  /** Fresh dialog state + first page, from the trigger click (audit 2026-11-21: not an effect). */
  function openDialog() {
    setView("list");
    setSelectedId(null);
    setDetail(null);
    setDiff(null);
    setCompareFromId(null);
    setCompareToId(null);
    setCompareError(null);
    setDetailError(null);
    setRestoreMessage(null);
    setStatusMessage(null);
    setSummaries({});
    setUndoPreview(null);
    setListLoadState("loading");
    setListError(null);
    setOpen(true);
    void loadList({ reset: true });
  }

  async function ensureSummary(revisionId: string) {
    const idx = revisions.findIndex((r) => r.id === revisionId);
    const prev = idx >= 0 ? revisions[idx + 1] : undefined;
    if (!prev || summaries[revisionId]) return;
    setSummaries((s) => ({ ...s, [revisionId]: "loading" }));
    const lines = await fetchDiffLines(prev.id, revisionId);
    setSummaries((s) => ({ ...s, [revisionId]: lines ?? "error" }));
  }

  async function openDetail(revisionId: string) {
    void ensureSummary(revisionId);
    setSelectedId(revisionId);
    setView("detail");
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await fetch(mixWorkingRevisionUrl(projectId, revisionId), {
        method: "GET",
        credentials: "same-origin",
      });
      const json = await readJson(res);
      const mapped = mapMixRevisionDetailHttpResult({
        httpStatus: res.status,
        json,
      });
      if (!mapped.ok) {
        setDetailError(mapped);
        return;
      }
      setDetail(mapped.revision);
    } catch {
      setDetailError(
        mapMixRevisionDetailHttpResult({
          httpStatus: 0,
          json: {},
          network: true,
        }) as MixRevisionApiFailure,
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function runCompare(fromId: string, toId: string) {
    setCompareFromId(fromId);
    setCompareToId(toId);
    setView("compare");
    setDiff(null);
    setCompareError(null);
    setCompareLoading(true);
    try {
      const res = await fetch(mixWorkingRevisionCompareUrl(projectId), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromRevisionId: fromId,
          toRevisionId: toId,
        }),
      });
      const json = await readJson(res);
      const mapped = mapMixRevisionCompareHttpResult({
        httpStatus: res.status,
        json,
      });
      if (!mapped.ok) {
        setCompareError(mapped);
        return;
      }
      setDiff(mapped.diff);
    } catch {
      setCompareError(
        mapMixRevisionCompareHttpResult({
          httpStatus: 0,
          json: {},
          network: true,
        }) as MixRevisionApiFailure,
      );
    } finally {
      setCompareLoading(false);
    }
  }

  /** Revision diff in plain sentences; null when the compare call fails. */
  const fetchDiffLines = useCallback(
    async (fromId: string, toId: string): Promise<string[] | null> => {
      try {
        const res = await fetch(mixWorkingRevisionCompareUrl(projectId), {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fromRevisionId: fromId, toRevisionId: toId }),
        });
        const mapped = mapMixRevisionCompareHttpResult({ httpStatus: res.status, json: await readJson(res) });
        if (!mapped.ok) return null;
        return summarizeMixChanges(mapped.diff.changes, trackNamesRef.current);
      } catch {
        return null;
      }
    },
    [projectId],
  );

  /** Fills "what this version changed" for the newest rows, one request at a time. */
  const summarizedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!open || view !== "list") return;
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < Math.min(revisions.length - 1, 12); i++) {
        const row = revisions[i]!;
        const prev = revisions[i + 1]!;
        if (summarizedRef.current.has(row.id)) continue;
        summarizedRef.current.add(row.id);
        setSummaries((s) => ({ ...s, [row.id]: "loading" }));
        const lines = await fetchDiffLines(prev.id, row.id);
        if (cancelled) {
          summarizedRef.current.delete(row.id);
          return;
        }
        setSummaries((s) => ({ ...s, [row.id]: lines ?? "error" }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, view, revisions, fetchDiffLines]);
  useEffect(() => {
    if (!open) summarizedRef.current = new Set();
  }, [open]);

  /** "Cofnij tę zmianę": go back to the version right before the selected one. */
  async function beginUndoChange(revisionId: string) {
    const idx = revisions.findIndex((r) => r.id === revisionId);
    const target = idx >= 0 ? revisions[idx + 1] : undefined;
    const tip = revisions[0];
    if (!target || !tip) return;
    beginRestoreConfirm(target.id, true);
    setUndoPreview({ targetId: target.id, lines: "loading" });
    const lines = tip.id === target.id ? [] : await fetchDiffLines(tip.id, target.id);
    setUndoPreview((p) => (p && p.targetId === target.id ? { ...p, lines: lines ?? "error" } : p));
  }

  function beginRestoreConfirm(revisionId: string, undoChange = false) {
    if (!undoChange) setUndoPreview(null);
    restoreTargetIdRef.current = revisionId;
    restoreRequestIdRef.current = crypto.randomUUID();
    setRestoreMessage(null);
    setRestoreTone(null);
    setRestoreOpen(true);
  }

  async function confirmRestore() {
    const revisionId = restoreTargetIdRef.current;
    if (!revisionId || restoreSubmitting) return;
    if (!restoreRequestIdRef.current) {
      restoreRequestIdRef.current = crypto.randomUUID();
    }
    setRestoreSubmitting(true);
    setRestoreMessage(null);
    setRestoreTone(null);
    try {
      const res = await fetch(
        mixWorkingRevisionRestoreUrl(projectId, revisionId),
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedDocumentVersion: getExpectedDocumentVersion(),
            requestId: restoreRequestIdRef.current,
          }),
        },
      );
      const json = await readJson(res);
      const mapped = mapMixRevisionRestoreHttpResult({
        httpStatus: res.status,
        json,
      });
      if (!mapped.ok) {
        setRestoreTone("warn");
        setRestoreMessage(mapped.message);
        if (mapped.kind === "conflict_cas" || mapped.kind === "idempotency_reuse") {
          // Keep requestId for intentional identical retry; clear only on CAS
          // so a conscious new confirm after refresh gets a new key.
          if (mapped.kind === "conflict_cas") {
            restoreRequestIdRef.current = null;
          }
        }
        return;
      }

      const docRes = await fetch(studioProjectDocumentUrl(projectId), {
        method: "GET",
        credentials: "same-origin",
      });
      const docJson = await readJson(docRes);
      const docMapped = mapStudioProjectDocumentHttpResult({
        httpStatus: docRes.status,
        json: docJson,
      });
      if (docMapped.ok) {
        onDocumentRefreshed(docMapped.document);
      }

      setRestoreOpen(false);
      setRestoreTone("ok");
      setStatusMessage(
        mapped.replay
          ? t("przywrocenieJuzByloZapisane")
          : t("przywroconoStanMiksuUtworzono"),
      );
      restoreRequestIdRef.current = null;
      restoreTargetIdRef.current = null;
      setUndoPreview(null);
      await loadList({ reset: true });
      setView("list");
      setSelectedId(null);
      setDetail(null);
    } catch {
      setRestoreTone("warn");
      setRestoreMessage(
        t("brakPolaczeniaSprawdzSiec"),
      );
    } finally {
      setRestoreSubmitting(false);
    }
  }

  const undoShown = restoreOpen ? undoPreview : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex min-h-11 items-center rounded border border-[var(--brd-paper)]/40 bg-transparent px-2.5 text-xs font-semibold text-[var(--brd-paper)] hover:bg-[var(--brd-paper)]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)] disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="studio-transport-mix-history"
        title={t("historiaWersjiMiksu")}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? "studio-mix-history-dialog" : undefined}
        disabled={disabled || !projectId}
        onClick={() => {
          if (open) closeDialog();
          else openDialog();
        }}
      >
        {t("historiaMiksu")}
      </button>

      {open && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
              data-testid="studio-mix-history-layer"
            >
              <button
                type="button"
                className="absolute inset-0 cursor-default bg-[color-mix(in_srgb,var(--brd-ink)_45%,transparent)]"
                aria-label={t("zamknijHistorieMiksu")}
                data-testid="studio-mix-history-backdrop"
                onClick={closeDialog}
              />
              <div
                ref={dialogRef}
                id="studio-mix-history-dialog"
                className="relative z-10 flex max-h-[min(92dvh,40rem)] w-full flex-col overflow-hidden rounded-t-xl border border-[var(--brd-line)] bg-[var(--brd-paper)] pb-[env(safe-area-inset-bottom)] text-[var(--brd-ink)] shadow-lg outline-none sm:w-[min(100vw-2rem,36rem)] sm:rounded-xl motion-reduce:transition-none"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                data-testid="studio-mix-history-dialog"
              >
            <header className="shrink-0 space-y-1 border-b border-[var(--brd-line)] px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p id={titleId} className="brd-ui text-sm font-semibold">
                    {t("historiaMiksu")}
                  </p>
                  <p
                    id={descriptionId}
                    className="text-[11px] text-[var(--brd-ink)]/70"
                  >
                    {t("rewizjeDokumentuMiksuBez")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  data-testid="studio-mix-history-close"
                  onClick={closeDialog}
                >
                  {t("zamknij")}
                </Button>
              </div>
              {/*
                A3.5-D migration notice — visible whenever history UI is open.
                Remove/change only after Owner proof that every allowlisted
                Mix Working write path is on the atomic gateway (no legacy gaps).
              */}
              <p
                className="rounded border border-[var(--brd-line)] bg-[color-mix(in_srgb,var(--brd-ink)_4%,var(--brd-paper))] px-2.5 py-2 text-[11px] leading-snug text-[var(--brd-ink)]/80"
                role="note"
                data-testid="studio-mix-history-migration-notice"
                data-brd-mix-history-migration-notice="a35"
              >
                {t("historiaObejmujeParametryMiksu")}
              </p>
              <nav
                className="flex flex-wrap gap-1"
                aria-label={t("widokiHistoriiMiksu")}
              >
                <Button
                  type="button"
                  size="sm"
                  variant={view === "list" ? "default" : "outline"}
                  className="min-h-11"
                  data-testid="studio-mix-history-tab-list"
                  onClick={() => setView("list")}
                >
                  {t("lista")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={view === "detail" ? "default" : "outline"}
                  className="min-h-11"
                  disabled={!selectedId}
                  data-testid="studio-mix-history-tab-detail"
                  onClick={() => {
                    if (selectedId) void openDetail(selectedId);
                  }}
                >
                  {t("szczegoly")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={view === "compare" ? "default" : "outline"}
                  className="min-h-11"
                  data-testid="studio-mix-history-tab-compare"
                  onClick={() => setView("compare")}
                >
                  {t("porownaj")}
                </Button>
              </nav>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {statusMessage ? (
                <p
                  className="mb-3 text-xs text-[var(--brd-green)]"
                  role="status"
                  data-testid="studio-mix-history-status"
                >
                  {tl(statusMessage)}
                </p>
              ) : null}

              {view === "list" ? (
                <ListPanel
                  summaries={summaries}
                  onUndo={(id) => void beginUndoChange(id)}
                  revisions={revisions}
                  nextCursor={nextCursor}
                  loadState={listLoadState}
                  loading={listLoading}
                  error={listError}
                  tipDocumentVersion={tipDocumentVersion}
                  selectedId={selectedId}
                  onRetry={() => void loadList({ reset: true })}
                  onLoadMore={() =>
                    void loadList({ cursor: nextCursor, reset: false })
                  }
                  onSelect={(id) => void openDetail(id)}
                  onMarkCompareFrom={(id) => {
                    setCompareFromId(id);
                    setView("compare");
                  }}
                  onMarkCompareTo={(id) => {
                    setCompareToId(id);
                    setView("compare");
                  }}
                />
              ) : null}

              {view === "detail" ? (
                <DetailPanel
                  changeLines={selectedId ? summaries[selectedId] : undefined}
                  canUndo={Boolean(selectedId && revisions.findIndex((r) => r.id === selectedId) >= 0 && revisions.findIndex((r) => r.id === selectedId) < revisions.length - 1)}
                  onUndoChange={() => {
                    if (selectedId) void beginUndoChange(selectedId);
                  }}
                  loading={detailLoading}
                  error={detailError}
                  revision={detail}
                  tipDocumentVersion={tipDocumentVersion}
                  onRetry={() => {
                    if (selectedId) void openDetail(selectedId);
                  }}
                  onCompareWith={(otherId) => {
                    if (!selectedId) return;
                    void runCompare(otherId, selectedId);
                  }}
                  onRestore={() => {
                    if (selectedId) beginRestoreConfirm(selectedId);
                  }}
                  compareCandidates={revisions.filter(
                    (r) => r.id !== selectedId,
                  )}
                />
              ) : null}

              {view === "compare" ? (
                <ComparePanel
                  revisions={revisions}
                  fromId={compareFromId}
                  toId={compareToId}
                  loading={compareLoading}
                  error={compareError}
                  diff={diff}
                  trackNames={trackNames ?? {}}
                  onFromChange={setCompareFromId}
                  onToChange={setCompareToId}
                  onRun={() => {
                    if (compareFromId && compareToId) {
                      void runCompare(compareFromId, compareToId);
                    }
                  }}
                />
              ) : null}
            </div>
          </div>

              {restoreOpen ? (
                <>
                  <button
                    type="button"
                    className="absolute inset-0 z-20 cursor-default bg-[color-mix(in_srgb,var(--brd-ink)_55%,transparent)]"
                    aria-label={t("anulujPrzywracanie")}
                    data-testid="studio-mix-history-restore-backdrop"
                    disabled={restoreSubmitting}
                    onClick={() => {
                      if (!restoreSubmitting) setRestoreOpen(false);
                    }}
                  />
                  <div
                    ref={restoreDialogRef}
                    className="absolute inset-x-3 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-md space-y-3 rounded-xl border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4 text-[var(--brd-ink)] outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby={restoreTitleId}
                    tabIndex={-1}
                    data-testid="studio-mix-history-restore-dialog"
                  >
                    <p id={restoreTitleId} className="text-sm font-semibold">
                      {undoShown ? t("cofnacTeZmiane") : t("przywrocicTeRewizjeMiksu")}
                    </p>
                    <p className="text-xs text-[var(--brd-ink)]/75">
                      {undoShown ? t("cofnijOpis") : t("operacjaUtworzyNowaRewizje")}
                    </p>
                    {undoShown ? (
                      <div data-testid="studio-mix-history-undo-preview">
                        <p className="text-xs font-semibold">{t("coWroci")}</p>
                        <ChangeLines lines={undoShown.lines} testId="studio-mix-history-undo-lines" />
                      </div>
                    ) : null}
                    {detail && !undoShown ? (
                      <p className="font-mono text-[11px] text-[var(--brd-ink)]/80">
                        {tl(mixRevisionRowLabel(detail))} · v
                        {detail.sourceDocumentVersion}
                        {tl(detail.description ? ` · ${mixRevisionDescriptionLabel(detail.description)}` : "")}
                      </p>
                    ) : null}
                    {restoreMessage ? (
                      <p
                        className={
                          restoreTone === "ok"
                            ? "text-xs text-[var(--brd-green)]"
                            : "text-xs text-[var(--brd-warn)]"
                        }
                        role="alert"
                        data-testid="studio-mix-history-restore-message"
                      >
                        {tl(restoreMessage)}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={restoreSubmitting}
                        data-testid="studio-mix-history-restore-cancel"
                        onClick={() => setRestoreOpen(false)}
                      >
                        {t("anuluj")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11 bg-[var(--brd-green)] text-[var(--brd-paper)] hover:opacity-90"
                        disabled={restoreSubmitting}
                        data-testid="studio-mix-history-restore-confirm"
                        onClick={() => void confirmRestore()}
                      >
                        {tl(restoreSubmitting ? t("przywracanie") : undoShown ? t("cofnijTeZmiane") : t("przywroc"))}
                      </Button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function ChangeLines(props: { lines: string[] | "loading" | "error" | undefined; max?: number; testId?: string }) {
  const t = useTranslations("studio.studioMixRevisionHistoryControl");
  const tl = useLibText();
  if (props.lines === undefined) return null;
  if (props.lines === "loading") return <p className="mt-1 text-[11px] text-[var(--brd-ink)]/55">{t("wczytujeOpisZmian")}</p>;
  if (props.lines === "error") return <p className="mt-1 text-[11px] text-[var(--brd-warn)]">{t("nieUdaloSieOpisuZmian")}</p>;
  if (props.lines.length === 0) return <p className="mt-1 text-[11px] text-[var(--brd-ink)]/55">{t("brakZmianWOpisie")}</p>;
  const shown = props.max ? props.lines.slice(0, props.max) : props.lines;
  const rest = props.lines.length - shown.length;
  return (
    <ul className="mt-1 space-y-0.5 text-[11px] leading-snug" data-testid={props.testId ?? "studio-mix-history-change-lines"}>
      {shown.map((line, i) => (
        <li key={i} className="before:mr-1 before:content-['•']">
          {tl(line)}
        </li>
      ))}
      {rest > 0 ? <li className="text-[var(--brd-ink)]/55">{t("iJeszczeZmian", { n: rest })}</li> : null}
    </ul>
  );
}

function ListPanel(props: {
  summaries: Record<string, string[] | "loading" | "error">;
  onUndo: (id: string) => void;
  revisions: MixRevisionListItem[];
  nextCursor: string | null;
  loadState: MixHistoryListLoadState;
  loading: boolean;
  error: MixRevisionApiFailure | null;
  tipDocumentVersion: number;
  selectedId: string | null;
  onRetry: () => void;
  onLoadMore: () => void;
  onSelect: (id: string) => void;
  onMarkCompareFrom: (id: string) => void;
  onMarkCompareTo: (id: string) => void;
}) {
  const tl = useLibText();
  const t = useTranslations("studio.studioMixRevisionHistoryControl");
  const panelKind = resolveMixHistoryListPanelKind({
    loadState: props.loadState,
    revisionCount: props.revisions.length,
  });

  if (panelKind === "loading") {
    return (
      <ul
        className="space-y-2"
        aria-busy="true"
        data-testid="studio-mix-history-list-loading"
      >
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="h-14 animate-pulse rounded border border-[var(--brd-line)] bg-[var(--brd-paper-deep)] motion-reduce:animate-none"
          />
        ))}
      </ul>
    );
  }

  if (panelKind === "error") {
    return (
      <div
        className="space-y-2"
        role="alert"
        data-testid="studio-mix-history-list-error"
      >
        <p className="text-xs text-[var(--brd-warn)]">
          {tl(props.error?.message ?? t("nieUdaloSieWczytac"))}
        </p>
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          data-testid="studio-mix-history-list-retry"
          onClick={props.onRetry}
        >
          {t("ponow")}
        </Button>
      </div>
    );
  }

  if (panelKind === "empty") {
    return (
      <p
        className="text-xs text-[var(--brd-ink)]/70"
        role="status"
        data-testid="studio-mix-history-list-empty"
      >
        {t("brakZapisanychRewizjiMiksu")}
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="studio-mix-history-list">
      <ul className="space-y-2" role="list">
        {props.revisions.map((row) => {
          const when = formatMixRevisionWhen(row.createdAt);
          const tip = isLikelyTipRevision(row, props.tipDocumentVersion);
          return (
            <li key={row.id}>
              <button
                type="button"
                className={`w-full rounded border px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)] ${
                  props.selectedId === row.id
                    ? "border-[var(--brd-green)] bg-[color-mix(in_srgb,var(--brd-green)_8%,var(--brd-paper))]"
                    : "border-[var(--brd-line)] bg-[var(--brd-paper)]"
                }`}
                data-testid={`studio-mix-history-item-${row.id}`}
                aria-current={props.selectedId === row.id ? "true" : undefined}
                onClick={() => props.onSelect(row.id)}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <span className="text-xs font-semibold">
                    {tl(mixRevisionRowLabel(row))}
                    {tl(row.kind === "restored" ? t("restore") : "")}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--brd-ink)]/60">
                    v{row.sourceDocumentVersion}
                    {tl(tip ? t("biezacyTip") : "")}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--brd-ink)]/75">
                  {tl(mixRevisionAuthorLabel(row.author))}
                  {tl(when ? ` · ${when}` : "")}
                </p>
                {row.description ? (
                  <p className="mt-0.5 line-clamp-2 text-[11px]">
                    {tl(mixRevisionDescriptionLabel(row.description))}
                  </p>
                ) : null}
                {row.restoredFromRevisionId ? (
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--brd-ink)]/55">
                    {t("zeZrodla")}{" "}{tl(row.restoredFromRevisionId.slice(0, 8))}…
                  </p>
                ) : null}
                <ChangeLines lines={props.summaries[row.id]} max={3} />
              </button>
              <div className="mt-1 flex flex-wrap gap-1">
                {props.revisions.findIndex((r) => r.id === row.id) < props.revisions.length - 1 ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="min-h-9 text-[10px]"
                    data-testid={`studio-mix-history-undo-${row.id}`}
                    onClick={() => props.onUndo(row.id)}
                  >
                    {t("cofnijTeZmiane")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="min-h-9 text-[10px]"
                  onClick={() => props.onMarkCompareFrom(row.id)}
                >
                  {t("porownajOd")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="min-h-9 text-[10px]"
                  onClick={() => props.onMarkCompareTo(row.id)}
                >
                  {t("porownajDo")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {props.nextCursor ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 w-full"
          disabled={props.loading}
          data-testid="studio-mix-history-load-more"
          onClick={props.onLoadMore}
        >
          {tl(props.loading ? t("ladowanie") : t("wczytajStarsze"))}
        </Button>
      ) : null}
    </div>
  );
}

function DetailPanel(props: {
  changeLines: string[] | "loading" | "error" | undefined;
  canUndo: boolean;
  onUndoChange: () => void;
  loading: boolean;
  error: MixRevisionApiFailure | null;
  revision: MixRevision | null;
  tipDocumentVersion: number;
  onRetry: () => void;
  onCompareWith: (otherId: string) => void;
  onRestore: () => void;
  compareCandidates: MixRevisionListItem[];
}) {
  const tl = useLibText();
  const t = useTranslations("studio.studioMixRevisionHistoryControl");
  if (props.loading) {
    return (
      <p className="text-xs" role="status" data-testid="studio-mix-history-detail-loading">
        {t("ladowanieSzczegolow")}
      </p>
    );
  }
  if (props.error) {
    return (
      <div role="alert" data-testid="studio-mix-history-detail-error">
        <p className="text-xs text-[var(--brd-warn)]">{tl(props.error.message)}</p>
        <Button
          type="button"
          size="sm"
          className="mt-2 min-h-11"
          onClick={props.onRetry}
        >
          {t("ponow")}
        </Button>
      </div>
    );
  }
  if (!props.revision) {
    return (
      <p className="text-xs text-[var(--brd-ink)]/70" role="status">
        {t("wybierzRewizjeZListy")}
      </p>
    );
  }
  const r = props.revision;
  const tip = r.sourceDocumentVersion === props.tipDocumentVersion;
  return (
    <div className="space-y-3" data-testid="studio-mix-history-detail">
      <section aria-label={t("coZmienilaTaWersja")} className="rounded border border-[var(--brd-line)] px-2.5 py-2">
        <h3 className="text-xs font-semibold">{t("coZmienilaTaWersja")}</h3>
        <ChangeLines lines={props.changeLines} testId="studio-mix-history-detail-changes" />
      </section>
      <dl className="grid gap-1 text-xs">
        <div>
          <dt className="text-[var(--brd-ink)]/55">{t("rodzaj")}</dt>
          <dd className="font-medium">{tl(mixRevisionKindLabel(r.kind))}</dd>
        </div>
        <div>
          <dt className="text-[var(--brd-ink)]/55">{t("autor")}</dt>
          <dd>{tl(mixRevisionAuthorLabel(r.author))}</dd>
        </div>
        <div>
          <dt className="text-[var(--brd-ink)]/55">{t("czas")}</dt>
          <dd>{tl(formatMixRevisionWhen(r.createdAt) || "—")}</dd>
        </div>
        <div>
          <dt className="text-[var(--brd-ink)]/55">{t("wersjaDokumentu")}</dt>
          <dd className="font-mono">
            v{r.sourceDocumentVersion}
            {tl(tip ? t("biezacyTip2") : "")}
          </dd>
        </div>
        {r.description ? (
          <div>
            <dt className="text-[var(--brd-ink)]/55">{t("opis")}</dt>
            <dd>{tl(mixRevisionDescriptionLabel(r.description))}</dd>
          </div>
        ) : null}
        {r.restoredFromRevisionId ? (
          <div>
            <dt className="text-[var(--brd-ink)]/55">{t("zrodloRestore")}</dt>
            <dd className="break-all font-mono text-[11px]">
              {tl(r.restoredFromRevisionId)}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[var(--brd-ink)]/55">{t("snapshot")}</dt>
          <dd>
            {tl(r.snapshot ? t("dostepnyUzywanyDoPorownania") : "Brak")}
          </dd>
        </div>
      </dl>

      {props.compareCandidates.length > 0 ? (
        <label className="block space-y-1 text-xs">
          <span className="text-[var(--brd-ink)]/70">{t("porownajZ")}</span>
          <select
            className="min-h-11 w-full rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2"
            data-testid="studio-mix-history-detail-compare-select"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) props.onCompareWith(e.target.value);
            }}
          >
            <option value="" disabled>
              {t("wybierzRewizje")}
            </option>
            {props.compareCandidates.map((c) => (
              <option key={c.id} value={c.id}>
                {tl(mixRevisionKindLabel(c.kind))} · v{c.sourceDocumentVersion} ·{" "}
                {tl(formatMixRevisionWhen(c.createdAt) || c.id.slice(0, 8))}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="sticky bottom-0 -mx-3 flex flex-wrap gap-2 border-t border-[var(--brd-line)] bg-[var(--brd-paper)] px-3 pt-3">
        {props.canUndo ? (
          <Button
            type="button"
            size="sm"
            className="min-h-11 w-full bg-[var(--brd-green)] text-[var(--brd-paper)] hover:opacity-90 sm:w-auto"
            data-testid="studio-mix-history-detail-undo"
            onClick={props.onUndoChange}
          >
            {t("cofnijTeZmiane")}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 w-full sm:w-auto"
          data-testid="studio-mix-history-detail-restore"
          onClick={props.onRestore}
        >
          {t("przywrocTeRewizje")}
        </Button>
      </div>
    </div>
  );
}

function ComparePanel(props: {
  revisions: MixRevisionListItem[];
  fromId: string | null;
  toId: string | null;
  loading: boolean;
  error: MixRevisionApiFailure | null;
  diff: MixWorkingRevisionDiff | null;
  trackNames: Record<string, string>;
  onFromChange: (id: string | null) => void;
  onToChange: (id: string | null) => void;
  onRun: () => void;
}) {
  const tl = useLibText();
  const t = useTranslations("studio.studioMixRevisionHistoryControl");

  return (
    <div className="space-y-3" data-testid="studio-mix-history-compare">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1 text-xs">
          <span>{t("rewizjaAWczesniejsza")}</span>
          <select
            className="min-h-11 w-full rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2"
            data-testid="studio-mix-history-compare-from"
            value={props.fromId ?? ""}
            onChange={(e) =>
              props.onFromChange(e.target.value || null)
            }
          >
            <option value="">{t("wybierz")}</option>
            {props.revisions.map((r) => (
              <option key={r.id} value={r.id}>
                v{r.sourceDocumentVersion} · {tl(mixRevisionKindLabel(r.kind))}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-xs">
          <span>{t("rewizjaBPozniejsza")}</span>
          <select
            className="min-h-11 w-full rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2"
            data-testid="studio-mix-history-compare-to"
            value={props.toId ?? ""}
            onChange={(e) => props.onToChange(e.target.value || null)}
          >
            <option value="">{t("wybierz")}</option>
            {props.revisions.map((r) => (
              <option key={r.id} value={r.id}>
                v{r.sourceDocumentVersion} · {tl(mixRevisionKindLabel(r.kind))}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button
        type="button"
        size="sm"
        className="min-h-11"
        disabled={!props.fromId || !props.toId || props.loading}
        data-testid="studio-mix-history-compare-run"
        onClick={props.onRun}
      >
        {tl(props.loading ? t("porownywanie") : t("porownaj"))}
      </Button>

      {props.error ? (
        <p
          className="text-xs text-[var(--brd-warn)]"
          role="alert"
          data-testid="studio-mix-history-compare-error"
        >
          {tl(props.error.message)}
        </p>
      ) : null}

      {props.diff && !props.loading ? (
        <div data-testid="studio-mix-history-compare-result">
          <p className="mb-2 font-mono text-[10px] text-[var(--brd-ink)]/60">
            v{props.diff.fromDocumentVersion} → v{props.diff.toDocumentVersion}
          </p>
          {props.diff.changes.length === 0 ? (
            <p
              className="text-xs text-[var(--brd-ink)]/70"
              role="status"
              data-testid="studio-mix-history-compare-empty"
            >
              {t("brakZmianWDozwolonych")}
            </p>
          ) : (
            <ChangeLines lines={summarizeMixChanges(props.diff.changes, props.trackNames)} testId="studio-mix-history-compare-lines" />
          )}
        </div>
      ) : null}
    </div>
  );
}
