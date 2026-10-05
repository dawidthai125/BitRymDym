"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TakeDownloadMenu } from "@/components/takes/take-download-menu";
import type { OwnTakeListItem } from "@/lib/takes/list-own-takes";
import { formatDurationSeconds } from "@/lib/beats/public";
import { toUserFacingTakeUploadError } from "@/lib/takes/client-upload";
import { labelRecordingMode, labelTakeStatus } from "@/lib/ui/labels";

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function fetchSignedUrl(
  path: "/api/takes/preview",
  takeId: string,
): Promise<string> {
  const res = await fetch(path, {
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
    throw new Error(json.error ?? "Operacja nie powiodła się.");
  }
  return json.url;
}

export function OwnTakesList({ items }: { items: OwnTakeListItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");

  async function onPreview(take: OwnTakeListItem) {
    setError(null);
    setBusyId(take.id);
    try {
      const url = await fetchSignedUrl("/api/takes/preview", take.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(
        toUserFacingTakeUploadError(
          e instanceof Error ? e.message : "Podgląd niedostępny.",
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(take: OwnTakeListItem) {
    if (!window.confirm("Usunąć to nagranie? Tej operacji nie cofniesz.")) {
      return;
    }
    setError(null);
    setBusyId(take.id);
    try {
      const res = await fetch("/api/takes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takeId: take.id }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Usuwanie nie powiodło się.");
      }
      router.refresh();
    } catch (e) {
      setError(
        toUserFacingTakeUploadError(
          e instanceof Error ? e.message : "Usuwanie nie powiodło się.",
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onSaveTitle(take: OwnTakeListItem) {
    setError(null);
    setBusyId(take.id);
    try {
      const res = await fetch("/api/takes/title", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takeId: take.id, title: titleDraft }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Nie udało się zapisać tytułu.");
      }
      setEditingId(null);
      router.refresh();
    } catch (e) {
      setError(
        toUserFacingTakeUploadError(
          e instanceof Error ? e.message : "Nie udało się zapisać tytułu.",
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nie masz jeszcze nagrań. Nagraj na stronie bitu.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-border border-y border-border">
        {items.map((take) => {
          const busy = busyId === take.id;
          const showDownload =
            take.canPreview ||
            take.canDownloadRaw ||
            take.downloadLadder.some((i) => i.unlocked);
          return (
            <li
              key={take.id}
              className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1">
                {editingId === take.id ? (
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={titleDraft}
                      maxLength={120}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      className="min-h-11 w-full max-w-sm rounded border border-[var(--brd-line)] bg-transparent px-3 text-sm"
                      aria-label="Tytuł nagrania"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      className="min-h-11"
                      onClick={() => void onSaveTitle(take)}
                    >
                      Zapisz
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11"
                      onClick={() => setEditingId(null)}
                    >
                      Anuluj
                    </Button>
                  </div>
                ) : (
                  <p className="font-medium tracking-tight">
                    {take.displayTitle}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {take.authorDisplayName
                    ? `Autor: ${take.authorDisplayName}`
                    : "Autor: —"}
                  {" · "}
                  Bit:{" "}
                  {take.beatTitle ? (
                    <Link
                      href={`/beat/${take.beatId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {take.beatTitle}
                    </Link>
                  ) : (
                    <span>{take.beatId.slice(0, 8)}</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {labelTakeStatus(take.displayStatus)}
                  {" · "}
                  {labelRecordingMode(take.recordingMode)}
                  {take.durationSeconds != null
                    ? ` · ${formatDurationSeconds(take.durationSeconds)}`
                    : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Utworzono {formatWhen(take.createdAt)}
                  {" · "}
                  Wygasa {formatWhen(take.expiresAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {editingId !== take.id && take.displayStatus !== "DELETED" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="min-h-11"
                    onClick={() => {
                      setEditingId(take.id);
                      setTitleDraft(take.title ?? "");
                    }}
                  >
                    Tytuł
                  </Button>
                ) : null}
                {take.canPreview ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    className="min-h-11"
                    onClick={() => void onPreview(take)}
                  >
                    Podgląd
                  </Button>
                ) : null}
                {showDownload && take.displayStatus === "READY" ? (
                  <TakeDownloadMenu
                    takeId={take.id}
                    canDownloadRaw={take.canDownloadRaw}
                    downloadLadder={take.downloadLadder}
                    disabled={busy}
                  />
                ) : null}
                {take.canDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="min-h-11"
                    onClick={() => void onDelete(take)}
                  >
                    Usuń
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
