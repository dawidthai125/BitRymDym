"use client";

import { useTranslations } from "next-intl";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  finalizeAnonTakeRecordingUpload,
  finalizeTakeRecordingUpload,
  uploadAnonTakeRecordingBlob,
  uploadTakeRecordingBlob,
} from "@/lib/takes/client-upload";
import {
  discardTakeRecording,
  listTakeRecoveries,
  recoverTakeRecording,
  takeRecoveryItemSummaryPl,
  takeRecoveryOutcomePl,
  type TakeRecoveryListItem,
  type TakeRecoveryScope,
  type TakeRecoveryStore,
  type TakeRecoverySurface,
} from "@/lib/takes/take-recording-recovery";
import {
  getBrowserTakeRecoveryStore,
  getTakeRecoveryTabClaimant,
  getTakeRecoveryViewerUserId,
} from "@/lib/takes/take-recording-recovery-idb";

type BannerNotice = { tone: "ok" | "error"; text: string };

type LoadedRecoveries = {
  store: TakeRecoveryStore | null;
  viewerUserId: string | null | undefined;
  items: TakeRecoveryListItem[];
  recheckInMs: number | null;
};

function scopeFor(surface: TakeRecoverySurface, scopeId: string): TakeRecoveryScope {
  return surface === "STUDIO"
    ? { surface, projectId: scopeId }
    : { surface, beatId: scopeId };
}

async function loadTakeRecoveries(
  scope: TakeRecoveryScope,
  authenticated: boolean,
): Promise<LoadedRecoveries> {
  const empty = { items: [], recheckInMs: null };
  const [store, viewerUserId] = await Promise.all([
    getBrowserTakeRecoveryStore().catch(() => null),
    getTakeRecoveryViewerUserId(authenticated),
  ]);
  if (!store || viewerUserId === undefined) {
    return { store, viewerUserId, ...empty };
  }
  try {
    const next = await listTakeRecoveries(
      { store, claimant: getTakeRecoveryTabClaimant(), now: Date.now, viewerUserId },
      scope,
    );
    return { store, viewerUserId, ...next };
  } catch {
    return { store, viewerUserId, ...empty };
  }
}

/**
 * STU-14/STU-15 — offers recovery / conscious discard of unsaved recordings
 * kept in this browser (Studio project or Quick Take beat). Nothing is
 * uploaded without an explicit click.
 */
export function TakeRecordingRecoveryBanner({
  surface,
  scopeId,
  authenticated,
  refreshKey,
  hidden,
  onSaved,
}: {
  surface: TakeRecoverySurface;
  /** Studio project id, or the beat id for Quick Take. */
  scopeId: string;
  /** Signed-in page: copies are bound to that account; guests see guest copies. */
  authenticated: boolean;
  /** Bump to re-read local copies (e.g. after an interrupted capture). */
  refreshKey: number;
  /** Hidden while a capture is in flight in this tab. */
  hidden: boolean;
  /** Server confirmed READY for a recovered copy. */
  onSaved?: (takeId: string) => void;
}) {
  const t = useTranslations("studio.takeRecordingRecoveryBanner");
  const [items, setItems] = useState<TakeRecoveryListItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null);
  const [notice, setNotice] = useState<BannerNotice | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const storeRef = useRef<TakeRecoveryStore | null>(null);
  const viewerRef = useRef<string | null | undefined>(undefined);
  const mountedRef = useRef(true);
  const restoreFocusIdRef = useRef<string | null>(null);
  // The acted-on item unmounts after a decision; move focus to the notice instead of <body>.
  const focusNoticeRef = useRef(false);
  const onSavedRef = useRef(onSaved);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let recheckTimer: ReturnType<typeof setTimeout> | null = null;
    void loadTakeRecoveries(scopeFor(surface, scopeId), authenticated).then((next) => {
      if (cancelled) return;
      storeRef.current = next.store;
      viewerRef.current = next.viewerUserId;
      setItems(next.items);
      if (next.recheckInMs != null) {
        recheckTimer = setTimeout(reload, next.recheckInMs);
      }
    });
    return () => {
      cancelled = true;
      if (recheckTimer) clearTimeout(recheckTimer);
    };
  }, [surface, scopeId, authenticated, refreshKey, reloadTick, reload]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", reload);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", reload);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  async function onRecover(recoveryId: string) {
    const store = storeRef.current;
    const viewerUserId = viewerRef.current;
    if (!store || viewerUserId === undefined || busyId) return;
    setBusyId(recoveryId);
    setConfirmDiscardId(null);
    setNotice(null);
    const outcome = await recoverTakeRecording(
      {
        store,
        claimant: getTakeRecoveryTabClaimant(),
        now: Date.now,
        viewerUserId,
        upload: ({ anonymous, ...params }) =>
          anonymous
            ? uploadAnonTakeRecordingBlob(params)
            : uploadTakeRecordingBlob(params),
        finalize: (takeId, { anonymous }) =>
          anonymous
            ? finalizeAnonTakeRecordingUpload(takeId)
            : finalizeTakeRecordingUpload(takeId),
      },
      recoveryId,
    );
    if (!mountedRef.current) return;
    setBusyId(null);
    focusNoticeRef.current = true;
    setNotice({
      tone: outcome.kind === "SAVED" ? "ok" : "error",
      text: takeRecoveryOutcomePl(outcome, surface),
    });
    if (outcome.kind === "SAVED") onSavedRef.current?.(outcome.takeId);
    reload();
  }

  async function onDiscard(recoveryId: string) {
    const store = storeRef.current;
    const viewerUserId = viewerRef.current;
    if (!store || viewerUserId === undefined || busyId) return;
    setBusyId(recoveryId);
    const result = await discardTakeRecording(
      { store, claimant: getTakeRecoveryTabClaimant(), now: Date.now, viewerUserId },
      recoveryId,
    );
    if (!mountedRef.current) return;
    setBusyId(null);
    setConfirmDiscardId(null);
    focusNoticeRef.current = true;
    setNotice(
      result === "DISCARDED" || result === "NOT_FOUND"
        ? { tone: "ok", text: t("lokalnaKopiaNagraniaZostala") }
        : result === "BUSY"
          ? { tone: "error", text: t("toNagranieJestWlasnie") }
          : {
              tone: "error",
              text: t("pamiecPrzegladarkiJestNiedostepna"),
            },
    );
    reload();
  }

  if (hidden || (items.length === 0 && !notice)) return null;

  return (
    <section
      className="space-y-2 rounded border border-[var(--brd-amber)]/50 bg-[color-mix(in_srgb,var(--brd-amber)_8%,transparent)] px-3 py-2 text-sm text-[var(--brd-ink)]"
      aria-label={t("niezapisaneNagrania")}
      data-testid="take-recovery-banner"
      data-surface={surface}
    >
      {items.length > 0 ? (
        <p className="font-medium">
          {t("niezapisaneNagranieWTej")}
        </p>
      ) : null}
      <ul className="space-y-2">
        {items.map((item) => {
          const id = item.record.recoveryId;
          const kind = item.classification.kind;
          const recoverable = kind === "RECOVERABLE";
          const actionable = kind !== "BUSY";
          const busy = busyId === id;
          const cancelDiscard = () => {
            restoreFocusIdRef.current = id;
            setConfirmDiscardId(null);
          };
          return (
            <li
              key={id}
              className="space-y-1.5"
              data-testid="take-recovery-item"
              data-kind={kind}
            >
              <p>{takeRecoveryItemSummaryPl(item)}</p>
              {busy && confirmDiscardId !== id ? (
                <p role="status" aria-live="polite">
                  {t("przesylanieNagraniaNieZamykaj")}
                </p>
              ) : null}
              {confirmDiscardId === id ? (
                <div key="confirm"
                  role="group"
                  aria-label={t("potwierdzenieOdrzuceniaNagrania")}
                  className="flex flex-wrap items-center gap-2"
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && busyId == null) {
                      event.preventDefault();
                      cancelDiscard();
                    }
                  }}
                >
                  <span>{t("naPewnoOdrzucicTo")}</span>
                  <Button
                    type="button"
                    size="xs"
                    variant="destructive"
                    className="min-h-11"
                    disabled={busyId != null}
                    onClick={() => void onDiscard(id)}
                  >
                    {t("takOdrzuc")}
                  </Button>
                  <Button
                    ref={(el) => el?.focus()}
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="min-h-11"
                    disabled={busyId != null}
                    onClick={cancelDiscard}
                  >
                    {t("nieZostaw")}
                  </Button>
                </div>
              ) : actionable ? (
                <div key="actions" className="flex flex-wrap gap-2">
                  {recoverable ? (
                    <Button
                      type="button"
                      size="xs"
                      className="min-h-11"
                      disabled={busyId != null}
                      onClick={() => void onRecover(id)}
                    >
                      {item.record.upload?.stage === "BINARY_UPLOADED"
                        ? t("dokonczZapis")
                        : t("odzyskajIZapisz")}
                    </Button>
                  ) : null}
                  <Button
                    ref={(el) => {
                      if (el && restoreFocusIdRef.current === id) {
                        restoreFocusIdRef.current = null;
                        el.focus();
                      }
                    }}
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="min-h-11"
                    disabled={busyId != null}
                    onClick={() => setConfirmDiscardId(id)}
                  >
                    {t("odrzucNagranie")}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {notice ? (
        <div
          className={
            notice.tone === "ok"
              ? "flex items-start justify-between gap-2 text-emerald-700 dark:text-emerald-400"
              : "flex items-start justify-between gap-2 text-destructive"
          }
          role={notice.tone === "ok" ? "status" : "alert"}
          data-testid="take-recovery-notice"
        >
          <p>{notice.text}</p>
          <Button
            ref={(el) => {
              if (el && focusNoticeRef.current) {
                focusNoticeRef.current = false;
                el.focus();
              }
            }}
            type="button"
            size="xs"
            variant="ghost"
            className="min-h-11 min-w-11 shrink-0"
            onClick={() => setNotice(null)}
          >
            {t("ok")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
