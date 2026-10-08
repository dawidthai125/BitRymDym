"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  classifyPersistHttpFailure,
  classifyPersistNetworkFailure,
  type StudioPersistExecutor,
  type StudioPersistResult,
} from "@/lib/studio/studio-persist-orchestrator";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

type PickerTab = "catalog" | "mine" | "downloads";

type PickerBeat = {
  id: string;
  title: string;
  producer: string | null;
  bpm: number | null;
};

const TABS: Array<{ id: PickerTab; label: string }> = [
  { id: "catalog", label: "Katalog" },
  { id: "mine", label: "Moje" },
  { id: "downloads", label: "Pobrane" },
];

/**
 * AUD-01 / P7.1.6 — select beat for an existing Studio project (Katalog / Moje / Pobrane).
 * Attach is a document mutation — serialised via StudioPersistOrchestrator + CAS.
 */
export function StudioBeatPicker({
  projectId,
  open,
  onClose,
  getExpectedDocumentVersion,
  enqueuePersistAsync,
  onAttached,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  getExpectedDocumentVersion: () => number;
  enqueuePersistAsync: (
    executor: StudioPersistExecutor,
  ) => Promise<StudioPersistResult>;
  onAttached: (document: StudioProjectDocument) => void;
}) {
  const [tab, setTab] = useState<PickerTab>("catalog");
  const [beats, setBeats] = useState<PickerBeat[]>([]);
  const [loading, setLoading] = useState(false);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/studio/beat-picker?tab=${encodeURIComponent(tab)}`,
          { method: "GET", cache: "no-store" },
        );
        const json = (await res.json()) as {
          success?: boolean;
          beats?: PickerBeat[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.success || !Array.isArray(json.beats)) {
          throw new Error(json.error ?? "Nie udało się wczytać listy bitów.");
        }
        setBeats(json.beats);
      } catch (e) {
        if (cancelled) return;
        setBeats([]);
        setError(
          e instanceof Error ? e.message : "Nie udało się wczytać listy bitów.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function attach(beatId: string) {
    setAttachingId(beatId);
    setError(null);
    try {
      const result = await enqueuePersistAsync(async () => {
        try {
          const res = await fetch(`/api/studio/projects/${projectId}/beat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              beatId,
              expectedDocumentVersion: getExpectedDocumentVersion(),
            }),
          });
          const json = (await res.json()) as {
            success?: boolean;
            document?: StudioProjectDocument;
            documentVersion?: number;
            error?: string;
            code?: string;
          };
          if (
            !res.ok ||
            !json.success ||
            !json.document ||
            typeof json.document.project.documentVersion !== "number"
          ) {
            return classifyPersistHttpFailure({
              status: res.status,
              message: json.error ?? "Nie udało się powiązać bitu.",
              code: json.code,
            });
          }
          const document = json.document;
          return {
            ok: true as const,
            documentVersion: document.project.documentVersion,
            apply: () => {
              onAttached(document);
            },
          };
        } catch {
          return classifyPersistNetworkFailure();
        }
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się powiązać bitu.");
    } finally {
      setAttachingId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Wybierz bit"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-lg flex-col border border-[var(--brd-line)] bg-[var(--brd-paper)] sm:rounded"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--brd-line)] px-4 py-3">
          <div>
            <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
              Bit w projekcie
            </p>
            <h2 className="brd-display text-lg font-semibold text-[var(--brd-ink)]">
              Wybierz bit
            </h2>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Zamknij
          </Button>
        </header>

        <div className="flex gap-1 border-b border-[var(--brd-line)] px-2 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`min-h-11 flex-1 rounded px-2 text-sm ${
                tab === t.id
                  ? "bg-[var(--brd-green)] text-[var(--brd-paper)]"
                  : "text-[var(--brd-ink)] hover:bg-[var(--brd-paper-deep)]"
              }`}
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <p className="px-2 py-6 text-sm text-[var(--brd-mute)]">Ładowanie…</p>
          ) : beats.length === 0 ? (
            <p className="px-2 py-6 text-sm text-[var(--brd-mute)]">
              Brak bitów w tej liście.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--brd-line)]">
              {beats.map((beat) => (
                <li key={beat.id}>
                  <button
                    type="button"
                    className="flex min-h-14 w-full items-center justify-between gap-3 px-2 py-3 text-left hover:bg-[var(--brd-paper-deep)] disabled:opacity-50"
                    disabled={attachingId != null}
                    onClick={() => void attach(beat.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[var(--brd-ink)]">
                        {beat.title}
                      </span>
                      <span className="block truncate text-xs text-[var(--brd-mute)]">
                        {beat.producer?.trim() || "—"}
                        {beat.bpm != null ? ` · ${beat.bpm} BPM` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-[var(--brd-green)]">
                      {attachingId === beat.id ? "…" : "Wybierz"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error ? (
          <p className="border-t border-[var(--brd-line)] px-4 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
