"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  studioMarkerKindLabelPl,
  type StudioMarkerDto,
  type StudioMarkerKind,
} from "@/lib/studio/studio-markers-state";
import {
  classifyPersistHttpFailure,
  type StudioPersistExecutor,
  type StudioPersistResult,
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
};

export function StudioMarkersPanel({
  projectId,
  getExpectedDocumentVersion,
  enqueuePersistAsync,
  getPlayheadMs,
  onSeek,
}: StudioMarkersPanelProps) {
  const [markers, setMarkers] = useState<StudioMarkerDto[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [busy, setBusy] = useState<"verse" | "hook" | "remove" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadMarkers = useCallback(async () => {
    setLoadState("loading");
    try {
      const response = await fetch(
        `/api/studio/projects/${projectId}/markers`,
      );
      const body = (await response.json().catch(() => null)) as {
        markers?: StudioMarkerDto[];
        error?: string;
      } | null;
      if (!response.ok || !body?.markers) {
        setLoadState("error");
        setMessage(body?.error || "Nie udało się wczytać markerów.");
        return;
      }
      setMarkers(body.markers);
      setLoadState("ready");
      setMessage(null);
    } catch {
      setLoadState("error");
      setMessage("Nie udało się wczytać markerów.");
    }
  }, [projectId]);

  useEffect(() => {
    void loadMarkers();
  }, [loadMarkers]);

  const persistOp = useCallback(
    async (
      op: "add" | "remove",
      payload: { kind?: StudioMarkerKind; markerId?: string },
    ) => {
      const kindBusy = payload.kind ?? "remove";
      setBusy(kindBusy);
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
                op === "add" ? Math.floor(getPlayheadMs()) : undefined,
              markerId: payload.markerId,
              expectedDocumentVersion: getExpectedDocumentVersion(),
            }),
          },
        );
        const body = (await response.json().catch(() => null)) as {
          markers?: StudioMarkerDto[];
          documentVersion?: number;
          message?: string;
          error?: string;
        } | null;
        if (!response.ok || !body?.markers) {
          return classifyPersistHttpFailure({
            status: response.status,
            message:
              body?.message ||
              body?.error ||
              "Nie udało się zapisać markera.",
          });
        }
        return {
          ok: true as const,
          documentVersion:
            typeof body.documentVersion === "number"
              ? body.documentVersion
              : getExpectedDocumentVersion(),
          apply: () => {
            setMarkers(body.markers!);
            setMessage(
              op === "add" ? "Dodano marker." : "Usunięto marker.",
            );
          },
        };
      });
      setBusy(null);
      if (!result.ok) setMessage(result.message);
    },
    [
      enqueuePersistAsync,
      getExpectedDocumentVersion,
      getPlayheadMs,
      projectId,
    ],
  );

  const sorted = markers.toSorted((a, b) => a.positionMs - b.positionMs);

  return (
    <div
      className="space-y-2 rounded border border-[var(--brd-line)] p-2"
      data-testid="studio-markers-panel"
    >
      <p className="text-xs font-medium text-[var(--brd-ink)]">
        Markery verse / hook
      </p>
      <p className="text-xs text-[var(--brd-mute)]">
        Dodaj przy playhead. Czas w ms. Zapis CAS dokumentu.
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
          {busy === "verse" ? "Dodawanie…" : "Dodaj zwrotkę"}
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
          {busy === "hook" ? "Dodawanie…" : "Dodaj refren"}
        </Button>
      </div>
      {loadState === "loading" ? (
        <p className="text-xs text-[var(--brd-mute)]" role="status">
          Wczytywanie markerów…
        </p>
      ) : null}
      {loadState === "ready" && sorted.length === 0 ? (
        <p className="text-xs text-[var(--brd-mute)]" role="status">
          Brak markerów.
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
                {studioMarkerKindLabelPl(marker.kind)} ·{" "}
                {formatStudioTimeMs(marker.positionMs)}
              </button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-11"
                disabled={busy !== null}
                aria-label={`Usuń marker ${studioMarkerKindLabelPl(marker.kind)}`}
                onClick={() => {
                  void persistOp("remove", { markerId: marker.id });
                }}
              >
                Usuń
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p className="text-xs text-[var(--brd-mute)]" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
