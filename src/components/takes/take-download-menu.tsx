"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { TakeExportLadderItem } from "@/lib/takes/take-export-capability";
import { toUserFacingTakeUploadError } from "@/lib/takes/client-upload";

type TakeDownloadMenuProps = {
  takeId: string;
  canDownloadRaw: boolean;
  downloadLadder: TakeExportLadderItem[];
  disabled?: boolean;
};

/**
 * P4.4 — full quality ladder + RAW (GOLD). Never hide LOCKED rows.
 * P4.6 — enqueue TAKE_EXPORT then poll job → existing artifact download.
 */
export function TakeDownloadMenu({
  takeId,
  canDownloadRaw,
  downloadLadder,
  disabled,
}: TakeDownloadMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infraNote, setInfraNote] = useState<string | null>(null);

  async function onRawDownload() {
    setError(null);
    setInfraNote(null);
    setBusy(true);
    try {
      const res = await fetch("/api/takes/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takeId }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || !json.success || !json.url) {
        throw new Error(json.error ?? "Pobieranie RAW niedostępne.");
      }
      window.location.assign(json.url);
    } catch (e) {
      setError(
        toUserFacingTakeUploadError(
          e instanceof Error ? e.message : "Pobieranie niedostępne.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadArtifact(artifactId: string) {
    const res = await fetch(`/api/mix/artifacts/${artifactId}/download`);
    const json = (await res.json()) as {
      success?: boolean;
      url?: string;
      error?: string;
    };
    if (!res.ok || !json.url) {
      throw new Error(json.error ?? "Pobieranie artefaktu niedostępne.");
    }
    window.location.assign(json.url);
  }

  async function pollExportUntilReady(jobId: string): Promise<string | null> {
    const maxAttempts = 8;
    for (let i = 0; i < maxAttempts; i++) {
      const res = await fetch(
        `/api/takes/export?jobId=${encodeURIComponent(jobId)}`,
      );
      const json = (await res.json()) as {
        success?: boolean;
        status?: string;
        artifactId?: string | null;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Status eksportu niedostępny.");
      }
      if (json.status === "SUCCEEDED" && json.artifactId) {
        return json.artifactId;
      }
      if (
        json.status === "FAILED" ||
        json.status === "CANCELLED" ||
        json.status === "TIMEOUT"
      ) {
        throw new Error("Eksport nie powiódł się.");
      }
      // Contabo STOPPED: job stays QUEUED — exit early after short wait.
      if (json.status === "QUEUED" && i >= 2) {
        return null;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  }

  async function onExport(item: TakeExportLadderItem) {
    if (!item.unlocked) return;
    setError(null);
    setInfraNote(null);
    setBusy(true);
    try {
      const res = await fetch("/api/takes/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          takeId,
          quality: item.quality,
          idempotencyKey: `take-export:${takeId}:${item.quality}`,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        jobId?: string;
        status?: string;
        artifactId?: string | null;
        workerInfraStatus?: string;
        note?: string;
        error?: string;
      };
      if (!res.ok || !json.success || !json.jobId) {
        throw new Error(json.error ?? "Eksport niedostępny.");
      }

      if (json.status === "SUCCEEDED" && json.artifactId) {
        await downloadArtifact(json.artifactId);
        return;
      }

      const artifactId = await pollExportUntilReady(json.jobId);
      if (artifactId) {
        await downloadArtifact(artifactId);
        return;
      }

      // Phase 1: code prepared; Contabo still STOPPED — expected.
      if (
        json.workerInfraStatus === "PREPARED_CODE" ||
        json.workerInfraStatus === "BLOCKED_INFRA" ||
        json.note
      ) {
        setInfraNote(
          json.note ??
            "Eksport w kolejce — pipeline kodu gotowy; EXTERNAL worker jest obecnie STOPPED.",
        );
      } else {
        setInfraNote(`Status eksportu: ${json.status ?? "QUEUED"}`);
      }
    } catch (e) {
      setError(
        toUserFacingTakeUploadError(
          e instanceof Error ? e.message : "Eksport niedostępny.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        className="min-h-11"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Pobierz
      </Button>
      {open ? (
        <div
          className="absolute right-0 z-20 mt-2 w-[min(100vw-2rem,18rem)] space-y-2 rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-3 shadow-sm"
          role="menu"
        >
          <p className="text-xs font-medium text-[var(--brd-ink)]">
            Jakość pobrania
          </p>
          <ul className="space-y-2">
            {downloadLadder.map((item) => (
              <li key={item.quality}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy || !item.unlocked}
                  onClick={() => void onExport(item)}
                  className="flex w-full min-h-11 flex-col items-start rounded px-2 py-2 text-left text-sm hover:bg-[var(--brd-line)]/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="font-medium">
                    {item.unlocked ? "" : "🔒 "}
                    {item.label}
                    {item.unlocked ? "" : " — LOCKED"}
                  </span>
                  <span className="text-xs text-[var(--brd-mute)]">
                    {item.unlocked
                      ? item.detail
                      : (item.lockedMessage ??
                        `Dostępne w planie ${item.requiredTier}.`)}
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                role="menuitem"
                disabled={busy || !canDownloadRaw}
                onClick={() => void onRawDownload()}
                className="flex w-full min-h-11 flex-col items-start rounded px-2 py-2 text-left text-sm hover:bg-[var(--brd-line)]/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="font-medium">
                  {canDownloadRaw ? "" : "🔒 "}
                  RAW — oryginalne nagranie
                  {canDownloadRaw ? "" : " — LOCKED"}
                </span>
                <span className="text-xs text-[var(--brd-mute)]">
                  {canDownloadRaw
                    ? "Plik źródłowy (mic)"
                    : "Dostępne w planie GOLD."}
                </span>
              </button>
            </li>
          </ul>
          {error ? (
            <p className="text-xs text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          {infraNote ? (
            <p className="text-xs text-[var(--brd-mute)]" role="status">
              {infraNote}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
