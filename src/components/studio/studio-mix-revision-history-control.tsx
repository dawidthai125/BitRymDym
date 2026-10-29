"use client";

import { useLibText } from "@/i18n/use-lib-text";

import { useTranslations } from "next-intl";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  resolveMixHistoryListPanelKind,
  type MixHistoryListLoadState,
} from "@/lib/studio/mix-working/mix-history-list-ui-state";
import {
  formatMixRevisionDiffValue,
  formatMixRevisionWhen,
  groupMixRevisionDiffChanges,
  isLikelyTipRevision,
  mapMixRevisionCompareHttpResult,
  mapMixRevisionDetailHttpResult,
  mapMixRevisionListHttpResult,
  mapMixRevisionRestoreHttpResult,
  mapStudioProjectDocumentHttpResult,
  mixRevisionAuthorLabel,
  mixRevisionDiffPathLabel,
  mixRevisionKindLabel,
  mixWorkingRevisionCompareUrl,
  mixWorkingRevisionRestoreUrl,
  mixWorkingRevisionUrl,
  mixWorkingRevisionsUrl,
  studioProjectDocumentUrl,
  type MixRevisionApiFailure,
  type MixRevisionListItem,
} from "@/lib/studio/mix-working/mix-working-revision-client";
import type { MixWorkingRevisionDiff } from "@/lib/studio/mix-working/mix-working-diff";
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

export function StudioMixRevisionHistoryControl({
  projectId,
  getExpectedDocumentVersion,
  tipDocumentVersion,
  onDocumentRefreshed,
  disabled,
}: StudioMixRevisionHistoryControlProps) {
  const tl = useLibText();
  const t = useTranslations("studio.studioMixRevisionHistoryControl");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
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
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (activeProjectIdRef.current === projectId) return;
    activeProjectIdRef.current = projectId;
    setRevisions([]);
    setNextCursor(null);
    setListError(null);
    setListLoadState(open ? "loading" : "idle");
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

  useEffect(() => {
    if (open) return;
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

  useEffect(() => {
    if (!open) return;
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
    setListLoadState("loading");
    setListError(null);
    void loadList({ reset: true });
  }, [open, projectId, loadList]);

  async function openDetail(revisionId: string) {
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

  function beginRestoreConfirm(revisionId: string) {
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
          setOpen((v) => {
            if (!v) {
              // Synchronous loading before first paint — avoids false empty.
              setListLoadState("loading");
              setListError(null);
            }
            return !v;
          });
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
                      {t("przywrocicTeRewizjeMiksu")}
                    </p>
                    <p className="text-xs text-[var(--brd-ink)]/75">
                      {t("operacjaUtworzyNowaRewizje")}
                    </p>
                    {detail ? (
                      <p className="font-mono text-[11px] text-[var(--brd-ink)]/80">
                        {tl(mixRevisionKindLabel(detail.kind))} · v
                        {detail.sourceDocumentVersion}
                        {tl(detail.description ? ` · ${detail.description}` : "")}
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
                        {tl(restoreSubmitting ? t("przywracanie") : t("przywroc"))}
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

function ListPanel(props: {
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
                    {tl(mixRevisionKindLabel(row.kind))}
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
                    {tl(row.description)}
                  </p>
                ) : null}
                {row.restoredFromRevisionId ? (
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--brd-ink)]/55">
                    {t("zeZrodla")}{" "}{tl(row.restoredFromRevisionId.slice(0, 8))}…
                  </p>
                ) : null}
              </button>
              <div className="mt-1 flex flex-wrap gap-1">
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
            <dd>{tl(r.description)}</dd>
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

      <div className="sticky bottom-0 -mx-3 border-t border-[var(--brd-line)] bg-[var(--brd-paper)] px-3 pt-3">
        <Button
          type="button"
          size="sm"
          className="min-h-11 w-full bg-[var(--brd-green)] text-[var(--brd-paper)] hover:opacity-90 sm:w-auto"
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
  onFromChange: (id: string | null) => void;
  onToChange: (id: string | null) => void;
  onRun: () => void;
}) {
  const tl = useLibText();
  const t = useTranslations("studio.studioMixRevisionHistoryControl");
  const groups = props.diff
    ? groupMixRevisionDiffChanges(props.diff.changes)
    : [];

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
            groups.map((group) => (
              <section key={group.group} className="mb-3">
                <h3 className="mb-1 text-xs font-semibold">{tl(group.label)}</h3>
                <ul className="space-y-2">
                  {group.changes.map((change) => (
                    <li
                      key={change.path}
                      className="rounded border border-[var(--brd-line)] px-2 py-1.5 text-[11px]"
                    >
                      <p className="font-medium">
                        {tl(mixRevisionDiffPathLabel(change.path))}
                      </p>
                      <p className="mt-0.5 font-mono text-[var(--brd-ink)]/80">
                        <span className="text-[var(--brd-ink)]/50">{t("przed")}{" "}</span>
                        {tl(formatMixRevisionDiffValue(change.before))}
                        <span className="text-[var(--brd-ink)]/50"> {t("po")}{" "}</span>
                        {tl(formatMixRevisionDiffValue(change.after))}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
