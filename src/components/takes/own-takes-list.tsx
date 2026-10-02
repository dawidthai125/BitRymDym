"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
  path: "/api/takes/preview" | "/api/takes/download",
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

  async function onDownload(take: OwnTakeListItem) {
    setError(null);
    setBusyId(take.id);
    try {
      const url = await fetchSignedUrl("/api/takes/download", take.id);
      window.location.assign(url);
    } catch (e) {
      setError(
        toUserFacingTakeUploadError(
          e instanceof Error ? e.message : "Pobieranie niedostępne.",
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
          return (
            <li
              key={take.id}
              className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="space-y-1">
                <p className="font-medium tracking-tight">
                  {take.beatTitle ? (
                    <Link
                      href={`/beat/${take.beatId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {take.beatTitle}
                    </Link>
                  ) : (
                    <span>Bit {take.beatId.slice(0, 8)}</span>
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
                {take.canPreview ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onPreview(take)}
                  >
                    Podgląd
                  </Button>
                ) : null}
                {take.canDownload ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onDownload(take)}
                  >
                    Pobierz
                  </Button>
                ) : null}
                {take.canDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
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
