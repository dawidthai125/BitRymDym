"use client";

import { useLibText } from "@/i18n/use-lib-text";

import { useTranslations } from "next-intl";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { planHipHopStructureMarkers } from "@/lib/studio/hiphop-marker-structure";
import { notifyStudioMarkersChanged } from "@/components/studio/studio-markers-events";
import {
  studioMarkerKindLabelPl,
  type StudioMarkerDto,
  type StudioMarkerKind,
} from "@/lib/studio/studio-markers-state";
import {
  classifyPersistHttpFailure,
  createStudioPersistVersionTip,
  type StudioPersistExecutor,
  type StudioPersistResult,
  type StudioPersistVersionTip,
} from "@/lib/studio/studio-persist-orchestrator";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";

type StudioMarkersPanelProps = {
  projectId: string;
  getExpectedDocumentVersion: () => number;
  enqueuePersistAsync: (
    executor: StudioPersistExecutor,
  ) => Promise<StudioPersistResult>;
  getPlayheadMs: () => number;
  onSeek?: (positionMs: number) => void;
  /** Shared Inspector tip — same helper as recording-panel persist. */
  onDocumentVersionAck?: (ack: unknown) => number;
  /** Project tempo for hip-hop structure template (default 90). */
  tempoBpm?: number;
};

async function fetchStudioMarkers(
  projectId: string,
): Promise<
  | { ok: true; markers: StudioMarkerDto[]; documentVersion: unknown }
  | { ok: false; error: string | null }
> {
  try {
    const response = await fetch(`/api/studio/projects/${projectId}/markers`);
    const body = (await response.json().catch(() => null)) as {
      markers?: StudioMarkerDto[];
      documentVersion?: unknown;
      error?: string;
    } | null;
    if (!response.ok || !body?.markers) return { ok: false, error: body?.error ?? null };
    return { ok: true, markers: body.markers, documentVersion: body.documentVersion };
  } catch {
    return { ok: false, error: null };
  }
}

export function StudioMarkersPanel({
  projectId,
  getExpectedDocumentVersion,
  enqueuePersistAsync,
  getPlayheadMs,
  onSeek,
  onDocumentVersionAck,
  tempoBpm = 90,
}: StudioMarkersPanelProps) {
  const tl = useLibText();
  const t = useTranslations("studio.studioMarkersPanel");
  const [markers, setMarkers] = useState<StudioMarkerDto[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [busy, setBusy] = useState<"verse" | "hook" | "remove" | "structure" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const getBaseVersionRef = useRef(getExpectedDocumentVersion);
  useLayoutEffect(() => {
    getBaseVersionRef.current = getExpectedDocumentVersion;
  }, [getExpectedDocumentVersion]);
  // One tip per mount, created on first use (callbacks only — never during render).
  const versionTipRef = useRef<StudioPersistVersionTip | null>(null);
  const getVersionTip = useCallback((): StudioPersistVersionTip => {
    versionTipRef.current ??= createStudioPersistVersionTip(() => getBaseVersionRef.current());
    return versionTipRef.current;
  }, []);
  const ackDocumentVersion = useCallback(
    (ack: unknown): number => {
      const next = getVersionTip().applyAck(ack);
      onDocumentVersionAck?.(next);
      return next;
    },
    [onDocumentVersionAck, getVersionTip],
  );

  // Load on mount / project change. State is set only in the fetch callbacks (loadState starts "loading").
  useEffect(() => {
    let cancelled = false;
    fetchStudioMarkers(projectId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadState("error");
        setMessage(result.error || t("nieUdaloSieWczytac"));
        return;
      }
      ackDocumentVersion(result.documentVersion);
      setMarkers(result.markers);
      setLoadState("ready");
      setMessage(null);
    });
    return () => {
      cancelled = true;
    };
  }, [ackDocumentVersion, projectId, t]);

  const persistOp = useCallback(
    async (
      op: "add" | "remove",
      payload: {
        kind?: StudioMarkerKind;
        markerId?: string;
        positionMs?: number;
        quiet?: boolean;
      },
    ) => {
      const kindBusy = payload.kind ?? "remove";
      if (!payload.quiet) setBusy(kindBusy);
      const result = await enqueuePersistAsync(async () => {
        const response = await fetch(
          `/api/studio/projects/${projectId}/markers`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              op,
              kind: payload.kind,
              positionMs:
                op === "add"
                  ? Math.floor(
                      payload.positionMs ?? getPlayheadMs(),
                    )
                  : undefined,
              markerId: payload.markerId,
              expectedDocumentVersion: getVersionTip().expected(),
            }),
          },
        );
        const body = (await response.json().catch(() => null)) as {
          markers?: StudioMarkerDto[];
          documentVersion?: unknown;
          message?: string;
          error?: string;
        } | null;
        if (!response.ok || !body?.markers) {
          return classifyPersistHttpFailure({
            status: response.status,
            message:
              body?.message ||
              body?.error ||
              t("nieUdaloSieZapisac"),
          });
        }
        const documentVersion = ackDocumentVersion(body.documentVersion);
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            setMarkers(body.markers!);
            notifyStudioMarkersChanged(projectId, body.markers!);
            if (!payload.quiet) {
              setMessage(
                op === "add" ? t("dodanoMarker") : t("usunietoMarker"),
              );
            }
          },
        };
      });
      if (!payload.quiet) setBusy(null);
      if (!result.ok) setMessage(result.message);
      return result;
    },
    [ackDocumentVersion, enqueuePersistAsync, getPlayheadMs, projectId, getVersionTip, t],
  );

  const insertHipHopStructure = useCallback(async () => {
    setBusy("structure");
    setMessage(null);
    // A second click must not double the structure: skip markers that are already there.
    const planned = planHipHopStructureMarkers({ bpm: tempoBpm }).filter(
      (row) => !markers.some((m) => m.kind === row.kind && m.positionMs === row.positionMs),
    );
    let failed = false;
    for (const row of planned) {
      const result = await persistOp("add", {
        kind: row.kind,
        positionMs: row.positionMs,
        quiet: true,
      });
      if (!result.ok) {
        failed = true;
        break;
      }
    }
    setBusy(null);
    setMessage(failed ? t("nieUdaloSieZapisac") : t("wstawionoStrukture"));
  }, [markers, persistOp, t, tempoBpm]);

  const sorted = markers.toSorted((a, b) => a.positionMs - b.positionMs);

  return (
    <div
      className="space-y-2 rounded border border-[var(--brd-line)] p-2"
      data-testid="studio-markers-panel"
    >
      <p className="text-xs font-medium text-[var(--brd-ink)]">
        {t("markeryVerseHook")}
      </p>
      <p className="text-xs text-[var(--brd-mute)]">
        {t("dodajPrzyPlayheadCzas")}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          size="sm"
          className="min-h-11 w-full"
          disabled={busy !== null || loadState === "loading"}
          onClick={() => {
            void persistOp("add", { kind: "verse" });
          }}
        >
          {tl(busy === "verse" ? t("dodawanie") : t("dodajZwrotke"))}
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-11 w-full"
          disabled={busy !== null || loadState === "loading"}
          onClick={() => {
            void persistOp("add", { kind: "hook" });
          }}
        >
          {tl(busy === "hook" ? t("dodawanie") : t("dodajRefren"))}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 w-full sm:col-span-2"
          disabled={busy !== null || loadState === "loading"}
          data-testid="studio-markers-hiphop-structure"
          onClick={() => {
            void insertHipHopStructure();
          }}
        >
          {tl(busy === "structure" ? t("dodawanie") : t("wstawStruktureHipHop"))}
        </Button>
      </div>
      {loadState === "loading" ? (
        <p className="text-xs text-[var(--brd-mute)]" role="status">
          {t("wczytywanieMarkerow")}
        </p>
      ) : null}
      {loadState === "ready" && sorted.length === 0 ? (
        <p className="text-xs text-[var(--brd-mute)]" role="status">
          {t("brakMarkerow")}
        </p>
      ) : null}
      {sorted.length > 0 ? (
        <ul className="space-y-1" data-testid="studio-markers-list">
          {sorted.map((marker) => (
            <li
              key={marker.id}
              className="flex min-h-11 items-center justify-between gap-2 rounded border border-[var(--brd-line)] px-2"
            >
              <button
                type="button"
                className="min-h-11 flex-1 text-left text-sm text-[var(--brd-ink)]"
                onClick={() => onSeek?.(marker.positionMs)}
              >
                {tl(studioMarkerKindLabelPl(marker.kind))} ·{" "}
                {tl(formatStudioTimeMs(marker.positionMs))}
              </button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-11"
                disabled={busy !== null}
                aria-label={t("usunMarker", { v0: studioMarkerKindLabelPl(marker.kind) })}
                onClick={() => {
                  void persistOp("remove", { markerId: marker.id });
                }}
              >
                {t("usun")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p className="text-xs text-[var(--brd-mute)]" role="status">
          {tl(message)}
        </p>
      ) : null}
    </div>
  );
}
