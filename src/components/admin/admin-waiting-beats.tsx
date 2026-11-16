"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { AdminBeatBitek } from "@/components/admin/admin-beat-bitek";
import { AdminBeatDelete } from "@/components/admin/admin-beat-delete";
import { AdminBeatPlayButton } from "@/components/admin/admin-beat-play-button";
import { AdminPlatformOpsExportButton } from "@/components/admin/admin-platform-ops-export-button";
import { Button } from "@/components/ui/button";
import { beatCoverUrl } from "@/lib/beats/cover/cover-url";
import { formatDurationSeconds } from "@/lib/beats/public";

export type WaitingGeneratedBeat = {
  id: string;
  title: string;
  producer: string | null;
  description: string | null;
  style: string | null;
  bpm: number | null;
  durationSeconds: number | null;
  coverStatus: string | null;
  coverUpdatedAt?: string | null;
};

type ReleaseLane = "free" | "paid";
type BusyKind = "cover" | ReleaseLane;

export function AdminWaitingBeats({ beats }: { beats: readonly WaitingGeneratedBeat[] }) {
  const t = useTranslations("admin.adminBeatsWaitingPage");

  if (beats.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--brd-mute)]">{t("pusto")}</p>
        <Link
          href="/admin/beats/generate"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("doGeneratora")}
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
      {beats.map((beat) => (
        <WaitingBeatRow key={beat.id} beat={beat} />
      ))}
    </ul>
  );
}

function WaitingBeatRow({ beat }: { beat: WaitingGeneratedBeat }) {
  const t = useTranslations("admin.adminBeatsWaitingPage");
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState<BusyKind | null>(null);
  const [lettering, setLettering] = useState("");
  const [colors, setColors] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [released, setReleased] = useState(false);
  const [mp3Busy, setMp3Busy] = useState(false);
  const approved = beat.coverStatus === "approved";
  const coverUrl = approved
    ? beatCoverUrl(
        {
          id: beat.id,
          coverStatus: "approved",
          coverUpdatedAt: beat.coverUpdatedAt ?? null,
        },
        "thumb",
      )
    : null;
  const seconds = beat.durationSeconds ?? 0;

  async function run(kind: BusyKind) {
    if (lock.current) return;
    if (kind !== "cover" && beat.coverStatus !== "approved") return;
    lock.current = true;
    setError(null);
    setReleased(false);
    setBusy(kind);
    try {
      const res = await fetch(
        kind === "cover"
          ? "/api/admin/beats/waiting/cover"
          : "/api/admin/beats/waiting/release",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            kind === "cover"
              ? { beatId: beat.id, lettering, colors }
              : { beatId: beat.id, lane: kind },
          ),
        },
      );
      let payload: { error?: unknown } = {};
      try {
        payload = (await res.json()) as { error?: unknown };
      } catch {
        payload = {};
      }
      const message = typeof payload.error === "string" ? payload.error.trim() : "";
      if (!res.ok || message) {
        setError(message || t("blad"));
        return;
      }
      if (kind !== "cover") setReleased(true);
      router.refresh();
    } catch {
      setError(t("blad"));
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  const releaseDisabled = !approved || busy !== null;

  async function downloadMp3() {
    if (mp3Busy || lock.current) return;
    setError(null);
    setMp3Busy(true);
    const deadline = Date.now() + 90_000;
    try {
      while (Date.now() < deadline) {
        const res = await fetch("/api/admin/beats/waiting/mp3", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beatId: beat.id, title: beat.title }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          status?: string;
          url?: string;
          fileName?: string;
          error?: string;
        };
        if (!res.ok || json.error) {
          setError(json.error || t("blad"));
          return;
        }
        if (json.status === "ready" && typeof json.url === "string") {
          const anchor = document.createElement("a");
          anchor.href = json.url;
          anchor.download = json.fileName || `${beat.title || "bit"}.mp3`;
          anchor.rel = "noopener";
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          return;
        }
        if (json.status !== "pending") {
          setError(t("blad"));
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      setError(t("mp3Timeout"));
    } catch {
      setError(t("blad"));
    } finally {
      setMp3Busy(false);
    }
  }

  return (
    <li className="flex flex-col gap-4 py-4 sm:flex-row">
      <div className="w-full shrink-0 sm:w-36">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={`${t("okladka")}: ${beat.title}`}
            className="aspect-square w-full border border-[var(--brd-line)] object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center border border-[var(--brd-line)] px-2 text-center text-xs text-[var(--brd-mute)]">
            {t("brakOkladki")}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-3">
          <AdminBeatPlayButton
            beatId={beat.id}
            title={beat.title}
            producer={beat.producer ?? ""}
            durationSeconds={seconds}
          />
          <h2 className="brd-display min-w-0 text-xl font-semibold tracking-tight break-words">
            {beat.title}
          </h2>
        </div>

        <p className="flex flex-wrap gap-x-3 text-sm text-[var(--brd-ink-soft)] tabular-nums">
          <span>
            {beat.bpm ?? "—"} {t("bpm")}
          </span>
          <span>
            {t("czas")} {formatDurationSeconds(seconds)}
          </span>
        </p>

        <div className="space-y-1 rounded-lg border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--brd-mute)]">
            {t("promptGeneracji")}
          </p>
          <p className="text-sm break-words">
            <span className="text-[var(--brd-mute)]">{t("styl")}: </span>
            {beat.style?.trim() || "—"}
          </p>
          <p className="text-sm break-words text-[var(--brd-ink-soft)]">
            <span className="text-[var(--brd-mute)]">{t("opisBitu")}: </span>
            {beat.description?.trim() || "—"}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <AdminPlatformOpsExportButton
            beatId={beat.id}
            title={beat.title}
            activeMasterReady
            compactWav
          />
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={mp3Busy || busy !== null}
            aria-busy={mp3Busy}
            onClick={() => void downloadMp3()}
          >
            {mp3Busy ? t("mp3Czeka") : t("pobierzMp3")}
          </Button>
        </div>
        <p className="text-xs text-[var(--brd-mute)]">{t("mp3Nota")}</p>

        <AdminBeatBitek beatId={beat.id} startClosed onRevised={() => router.refresh()} />

        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("napisOkladki")}</span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={lettering}
              maxLength={24}
              disabled={busy !== null}
              placeholder={t("napisPlaceholder")}
              onChange={(event) => setLettering(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("koloryOkladki")}</span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={colors}
              maxLength={60}
              disabled={busy !== null}
              placeholder={t("koloryPlaceholder")}
              onChange={(event) => setColors(event.target.value)}
            />
          </label>
          <div>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy !== null}
              onClick={() => void run("cover")}
            >
              {busy === "cover"
                ? t("generujeOkladke")
                : approved
                  ? t("generujPonownie")
                  : t("generujOkladke")}
            </Button>
          </div>
          {approved ? (
            <p className="text-xs text-[var(--brd-mute)]">{t("okladkaJeszczeRaz")}</p>
          ) : null}
        </div>

        {approved ? null : (
          <p className="text-xs text-[var(--brd-mute)]">{t("potrzebaOkladki")}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="min-h-11"
            disabled={releaseDisabled}
            onClick={() => void run("free")}
          >
            {busy === "free" ? t("wydaje") : t("darmowy")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={releaseDisabled}
            onClick={() => void run("paid")}
          >
            {busy === "paid" ? t("wydaje") : t("platny")}
          </Button>
        </div>

        <p className="max-w-prose text-xs text-[var(--brd-mute)]">{t("zakup")}</p>

        {released ? (
          <p className="text-sm" role="status">
            {t("wydano")}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <AdminBeatDelete
          beatId={beat.id}
          redirectTo="/admin/beats/waiting"
          compact
        />
      </div>
    </li>
  );
}
