"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { BeatArtwork } from "@/components/brand/beat-artwork";
import { Button } from "@/components/ui/button";
import { useLibText } from "@/i18n/use-lib-text";
import { beatCoverUrl } from "@/lib/beats/cover/cover-url";
import { updateOwnBeatAction } from "@/lib/beats/owner-edit-actions";
import { artworkVariantForId } from "@/lib/ui/demo-beats";
import type { BeatCoverStatus, BeatVisibility } from "@/types/domain";

const fieldClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm";

export type OwnerBeatEditInitial = {
  id: string;
  title: string;
  producer: string | null;
  description: string | null;
  genre: string | null;
  style: string | null;
  bpm: number;
  key: string | null;
  scale: string | null;
  tags: string[];
  visibility: BeatVisibility;
  allowDownload: boolean;
  allowStudioUse: boolean;
  coverStatus: BeatCoverStatus;
  coverUpdatedAt: string | null;
  coverRejectionReason: string | null;
  keyDetected: string | null;
  keyConfidence: number | null;
  /** DRAFT / REJECTED / APPROVED / PUBLISHED. */
  editable: boolean;
  published: boolean;
};

/** "Am" → { key: "A", scale: "minor" }. */
function parseDetectedKey(label: string | null): { key: string; scale: string } | null {
  if (!label) return null;
  const m = /^([A-G][#b]?)(m?)$/.exec(label.trim());
  if (!m) return null;
  return { key: m[1]!, scale: m[2] ? "minor" : "major" };
}

export function OwnerBeatEditForm({ initial }: { initial: OwnerBeatEditInitial }) {
  const t = useTranslations("beats.ownerBeatEdit");
  const tl = useLibText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [coverBusy, setCoverBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [coverMessage, setCoverMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [keyValue, setKeyValue] = useState(initial.key ?? "");
  const [scaleValue, setScaleValue] = useState(initial.scale ?? "");
  const [visibility, setVisibility] = useState<BeatVisibility>(initial.visibility);
  const [allowDownload, setAllowDownload] = useState(initial.allowDownload);
  const [allowStudioUse, setAllowStudioUse] = useState(initial.allowStudioUse);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const detected = parseDetectedKey(initial.keyDetected);
  const coverUrl = beatCoverUrl(
    { id: initial.id, coverStatus: initial.coverStatus, coverUpdatedAt: initial.coverUpdatedAt },
    "full",
    { includeUnapproved: true },
  );
  const disabled = !initial.editable || pending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = event.currentTarget;
    const value = (name: string) =>
      String(
        (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)
          ?.value ?? "",
      ).trim();
    const bpm = Number(value("bpm"));
    startTransition(async () => {
      const result = await updateOwnBeatAction({
        beatId: initial.id,
        title: value("title"),
        producer: value("producer") || null,
        description: value("description") || null,
        genre: value("genre") || null,
        style: value("style") || null,
        bpm,
        key: keyValue.trim() || null,
        scale: scaleValue.trim() || null,
        tags: value("tags")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        settings: { visibility, allowDownload, allowStudioUse },
      });
      if (!result.success) {
        setMessage({ tone: "error", text: result.error ?? t("bladZapisu") });
        return;
      }
      setMessage({ tone: "ok", text: t("zapisano") });
      router.refresh();
    });
  }

  async function onCoverUpload() {
    const file = fileRef.current?.files?.[0];
    setCoverMessage(null);
    if (!file) {
      setCoverMessage({ tone: "error", text: t("wybierzObraz") });
      return;
    }
    setCoverBusy(true);
    try {
      const body = new FormData();
      body.append("cover", file);
      const res = await fetch(`/api/beats/${initial.id}/cover`, { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        coverStatus?: "approved" | "pending";
      };
      if (!res.ok || !json.success) {
        setCoverMessage({ tone: "error", text: json.error ?? t("bladOkladki") });
        return;
      }
      setCoverMessage({
        tone: "ok",
        text: json.coverStatus === "approved" ? t("okladkaZatwierdzona") : t("okladkaCzeka"),
      });
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setCoverMessage({ tone: "error", text: t("bladOkladki") });
    } finally {
      setCoverBusy(false);
    }
  }

  async function onCoverRemove() {
    setCoverMessage(null);
    setCoverBusy(true);
    try {
      const res = await fetch(`/api/beats/${initial.id}/cover`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setCoverMessage({ tone: "error", text: json.error ?? t("bladOkladki") });
        return;
      }
      setCoverMessage({ tone: "ok", text: t("okladkaUsunieta") });
      router.refresh();
    } finally {
      setCoverBusy(false);
    }
  }

  const coverStatusText =
    initial.coverStatus === "approved"
      ? t("statusOkladkiApproved")
      : initial.coverStatus === "pending"
        ? t("statusOkladkiPending")
        : initial.coverStatus === "rejected"
          ? t("statusOkladkiRejected")
          : t("statusOkladkiNone");

  return (
    <div className="grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
      <section className="flex flex-col gap-3" aria-labelledby="cover-heading" data-testid="cover-section">
        <h2 id="cover-heading" className="text-sm font-semibold tracking-wide">
          {t("okladka")}
        </h2>
        <BeatArtwork
          variant={artworkVariantForId(initial.id)}
          title={tl(initial.title)}
          size="lg"
          coverUrl={coverUrl}
          className="w-full max-w-[18rem]"
        />
        <p className="text-xs text-[var(--brd-mute)]" data-testid="cover-status">
          {coverStatusText}
        </p>
        {initial.coverStatus === "rejected" && initial.coverRejectionReason ? (
          <p className="text-xs text-destructive">
            {t("powod")} {tl(initial.coverRejectionReason)}
          </p>
        ) : null}
        <label className="flex flex-col gap-1 text-sm">
          {t("wybierzOkladke")}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={fieldClass}
            disabled={coverBusy || !initial.editable}
          />
        </label>
        <p className="text-xs text-[var(--brd-mute)]">{t("okladkaWymagania")}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={onCoverUpload}
            disabled={coverBusy || !initial.editable}
          >
            {coverBusy ? t("sprawdzanie") : t("wgrajOkladke")}
          </Button>
          {initial.coverStatus !== "none" ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onCoverRemove}
              disabled={coverBusy || !initial.editable}
            >
              {t("usunOkladke")}
            </Button>
          ) : null}
        </div>
        {coverMessage ? (
          <p
            role={coverMessage.tone === "error" ? "alert" : "status"}
            className={coverMessage.tone === "error" ? "text-sm text-destructive" : "text-sm text-[var(--brd-green)]"}
          >
            {tl(coverMessage.text)}
          </p>
        ) : null}
      </section>

      <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-8" data-testid="owner-beat-edit-form">
        {!initial.editable ? (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            {t("nieEdytowalny")}
          </p>
        ) : initial.published ? (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            {t("opublikowanyInfo")}
          </p>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-wide">{t("metadane")}</h2>
          <label className="flex flex-col gap-1 text-sm">
            {t("tytul")}
            <input name="title" defaultValue={initial.title} required maxLength={200} className={fieldClass} disabled={disabled} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("producent")}
            <input name="producer" defaultValue={initial.producer ?? ""} maxLength={500} className={fieldClass} disabled={disabled} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("opis")}
            <textarea name="description" rows={3} defaultValue={initial.description ?? ""} maxLength={4000} className={fieldClass} disabled={disabled} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              {t("gatunek")}
              <input name="genre" defaultValue={initial.genre ?? ""} maxLength={500} className={fieldClass} disabled={disabled} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              {t("styl")}
              <input name="style" defaultValue={initial.style ?? ""} maxLength={500} className={fieldClass} disabled={disabled} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              {t("bpm")}
              <input name="bpm" type="number" inputMode="numeric" min={40} max={300} step={1} defaultValue={initial.bpm} required className={fieldClass} disabled={disabled} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              {t("tonacja")}
              <input name="key" value={keyValue} onChange={(e) => setKeyValue(e.target.value)} maxLength={500} className={fieldClass} disabled={disabled} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              {t("skala")}
              <input name="scale" value={scaleValue} onChange={(e) => setScaleValue(e.target.value)} maxLength={500} className={fieldClass} disabled={disabled} />
            </label>
          </div>
          {detected ? (
            <p className="-mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--brd-mute)]" data-testid="key-detected">
              {t("wykrytaTonacja", {
                key: `${detected.key} ${detected.scale === "minor" ? t("moll") : t("dur")}`,
                pct: Math.round((initial.keyConfidence ?? 0) * 100),
              })}
              {keyValue !== detected.key || scaleValue !== detected.scale ? (
                <button
                  type="button"
                  className="min-h-11 underline underline-offset-4"
                  disabled={disabled}
                  onClick={() => {
                    setKeyValue(detected.key);
                    setScaleValue(detected.scale);
                  }}
                >
                  {t("uzyjWykrytej")}
                </button>
              ) : null}
            </p>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            {t("tagi")}
            <input name="tags" defaultValue={initial.tags.join(", ")} className={fieldClass} disabled={disabled} />
          </label>
        </section>

        <section className="flex flex-col gap-3" data-testid="usage-settings">
          <h2 className="text-sm font-semibold tracking-wide">{t("udostepnianie")}</h2>
          <fieldset className="flex flex-col gap-2" disabled={disabled}>
            <legend className="sr-only">{t("widocznosc")}</legend>
            <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <input type="radio" name="visibility" value="public" className="mt-1" checked={visibility === "public"} onChange={() => setVisibility("public")} />
              <span>
                <span className="block font-medium">{t("publiczny")}</span>
                <span className="block text-xs text-[var(--brd-mute)]">{t("publicznyOpis")}</span>
              </span>
            </label>
            <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <input type="radio" name="visibility" value="private" className="mt-1" checked={visibility === "private"} onChange={() => setVisibility("private")} />
              <span>
                <span className="block font-medium">{t("prywatny")}</span>
                <span className="block text-xs text-[var(--brd-mute)]">{t("prywatnyOpis")}</span>
              </span>
            </label>
          </fieldset>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} disabled={disabled} />
            <span>
              <span className="block font-medium">{t("pozwolPobierac")}</span>
              <span className="block text-xs text-[var(--brd-mute)]">{t("pozwolPobieracOpis")}</span>
            </span>
          </label>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={allowStudioUse} onChange={(e) => setAllowStudioUse(e.target.checked)} disabled={disabled} />
            <span>
              <span className="block font-medium">{t("pozwolStudio")}</span>
              <span className="block text-xs text-[var(--brd-mute)]">{t("pozwolStudioOpis")}</span>
            </span>
          </label>
        </section>

        {message ? (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={message.tone === "error" ? "text-sm text-destructive" : "text-sm text-[var(--brd-green)]"}
          >
            {tl(message.text)}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={disabled}>
            {pending ? t("zapisywanie") : t("zapisz")}
          </Button>
        </div>
      </form>
    </div>
  );
}
