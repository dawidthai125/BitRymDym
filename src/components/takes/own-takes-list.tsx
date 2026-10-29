"use client";


import { useLocale, useTranslations } from "next-intl";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TakeDownloadMenu } from "@/components/takes/take-download-menu";
import type { OwnTakeListItem } from "@/lib/takes/list-own-takes";
import { formatDurationSeconds } from "@/lib/beats/public";
import { toUserFacingTakeUploadError } from "@/lib/takes/client-upload";
import { labelRecordingMode, labelTakeStatus } from "@/lib/ui/labels";
import { intlTag, resolveLocale } from "@/i18n/config";

function formatWhen(iso: string, tag = "pl-PL"): string {
  try {
    return new Intl.DateTimeFormat(tag, {
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
  const t = useTranslations("studio.ownTakesList");
  const tag = intlTag(resolveLocale(useLocale()));
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
          e instanceof Error ? e.message : t("podgladNiedostepny"),
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(take: OwnTakeListItem) {
    if (!window.confirm(t("usunacToNagranieTej"))) {
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
        throw new Error(json.error ?? t("usuwanieNiePowiodloSie"));
      }
      router.refresh();
    } catch (e) {
      setError(
        toUserFacingTakeUploadError(
          e instanceof Error ? e.message : t("usuwanieNiePowiodloSie"),
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
        throw new Error(json.error ?? t("nieUdaloSieZapisac"));
      }
      setEditingId(null);
      router.refresh();
    } catch (e) {
      setError(
        toUserFacingTakeUploadError(
          e instanceof Error ? e.message : t("nieUdaloSieZapisac"),
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="border border-[var(--brd-line)] px-4 py-10 text-center">
        <p className="brd-display text-xl font-semibold text-[var(--brd-ink)]">
          {t("pustyDziennik")}
        </p>
        <p className="mt-2 text-sm text-[var(--brd-mute)]">
          {t("nieMaszJeszczeNagran")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          className="border border-[var(--brd-rec)]/40 bg-[color-mix(in_srgb,var(--brd-rec)_10%,transparent)] px-3 py-2 text-sm text-[var(--brd-rec)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
        {items.length}{" "}
        {items.length === 1 ? "wpis" : items.length < 5 ? "wpisy" : "wpisów"} {t("dziennikSesji")}
      </p>
      <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
        {items.map((take, index) => {
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
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="brd-meta text-[10px] tabular-nums text-[var(--brd-amber)]">
                    #{String(items.length - index).padStart(2, "0")}
                  </span>
                  {editingId === take.id ? (
                    <div className="flex w-full flex-wrap gap-2">
                      <input
                        type="text"
                        value={titleDraft}
                        maxLength={120}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        className="min-h-11 w-full max-w-sm border border-[var(--brd-line)] bg-transparent px-3 text-sm text-[var(--brd-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)] disabled:opacity-50"
                        aria-label={t("tytulNagrania")}
                        disabled={busy}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        className="min-h-11"
                        onClick={() => void onSaveTitle(take)}
                      >
                        {t("zapisz")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        onClick={() => setEditingId(null)}
                        disabled={busy}
                      >
                        {t("anuluj")}
                      </Button>
                    </div>
                  ) : (
                    <p className="brd-display text-lg font-semibold tracking-tight text-[var(--brd-ink)]">
                      {take.displayTitle}
                    </p>
                  )}
                </div>
                <p className="text-sm text-[var(--brd-ink-soft)]">
                  {take.authorDisplayName
                    ? t("autor", { v0: take.authorDisplayName })
                    : t("autor2")}
                  {" · "}
                  {t("bit")}{" "}
                  {take.beatTitle ? (
                    <Link
                      href={`/beat/${take.beatId}`}
                      className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
                    >
                      {take.beatTitle}
                    </Link>
                  ) : (
                    <span>{take.beatId.slice(0, 8)}</span>
                  )}
                </p>
                <p className="brd-meta text-[11px] uppercase tracking-[0.12em] text-[var(--brd-mute)]">
                  {labelTakeStatus(take.displayStatus)}
                  {" · "}
                  {labelRecordingMode(take.recordingMode)}
                  {take.durationSeconds != null
                    ? ` · ${formatDurationSeconds(take.durationSeconds)}`
                    : ""}
                </p>
                <p className="brd-meta text-[10px] text-[var(--brd-mute)]">
                  {t("utworzono")}{" "}{formatWhen(take.createdAt, tag)}
                  {" · "}
                  {t("wygasa")}{" "}{formatWhen(take.expiresAt, tag)}
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
                    {t("tytul")}
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
                    {busy && busyId === take.id ? "…" : t("podglad")}
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
                    {t("usun")}
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
