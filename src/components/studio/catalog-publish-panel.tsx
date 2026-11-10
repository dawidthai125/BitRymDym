"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type Entry = {
  title: string;
  allowRatings: boolean;
  allowComments: boolean;
  inRankings: boolean;
  listed: boolean;
};

export function CatalogPublishPanel({
  projectId,
  masterJobId,
  defaultTitle,
}: {
  projectId: string;
  masterJobId: string;
  defaultTitle: string;
}) {
  const t = useTranslations("community.works");
  const [ready, setReady] = useState(false);
  const [off, setOff] = useState(false);
  const [publish, setPublish] = useState(false);
  const [title, setTitle] = useState(defaultTitle.slice(0, 80));
  const [allowRatings, setAllowRatings] = useState(false);
  const [allowComments, setAllowComments] = useState(false);
  const [inRankings, setInRankings] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/studio/catalog?projectId=${encodeURIComponent(projectId)}&masterJobId=${encodeURIComponent(masterJobId)}`,
          { signal: controller.signal },
        );
        const payload = (await response.json().catch(() => null)) as { result?: string; entry?: Entry | null } | null;
        if (controller.signal.aborted) return;
        if (!payload || payload.result === "off") {
          setOff(true);
          setReady(true);
          return;
        }
        if (payload.entry) {
          setTitle(payload.entry.title);
          setPublish(payload.entry.listed);
          setAllowRatings(payload.entry.allowRatings);
          setAllowComments(payload.entry.allowComments);
          setInRankings(payload.entry.listed && payload.entry.inRankings);
        }
        setReady(true);
      } catch {
        if (!controller.signal.aborted) {
          setOff(true);
          setReady(true);
        }
      }
    })();
    return () => controller.abort();
  }, [masterJobId, projectId]);

  function toggleRank(checked: boolean) {
    setInRankings(checked);
    if (checked) {
      setAllowRatings(true);
      setAllowComments(true);
    }
  }

  async function save() {
    setBusy(true);
    setNote(null);
    const response = await fetch("/api/studio/catalog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        masterJobId,
        title,
        publish,
        allowRatings: inRankings ? true : allowRatings,
        allowComments: inRankings ? true : allowComments,
        inRankings,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { result?: string };
    setBusy(false);
    if (payload.result === "ok") {
      setNote(publish ? t("saved") : t("withdrawn"));
      return;
    }
    setNote(payload.result === "off" ? t("off") : payload.result === "missing" ? t("missing") : t("invalid"));
  }

  if (!ready) return null;
  if (off) return <p className="text-sm text-[var(--brd-mute)]">{t("off")}</p>;

  return (
    <section aria-labelledby="catalog-publish-title" data-testid="catalog-publish" className="flex flex-col gap-2 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3">
      <h3 id="catalog-publish-title" className="brd-display text-lg">{t("publishTitle")}</h3>
      <p className="text-sm">{t("publishLead")}</p>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} />
        {t("publish")}
      </label>
      {publish ? (
        <div className="flex flex-col gap-2">
          <label className="text-sm" htmlFor="catalog-work-title">{t("titleLabel")}</label>
          <input
            id="catalog-work-title"
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            className="min-h-11 border border-[var(--brd-line)] bg-transparent px-3 text-sm"
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={allowRatings || inRankings} disabled={inRankings} onChange={(event) => setAllowRatings(event.target.checked)} />
            {t("allowRatings")}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={allowComments || inRankings} disabled={inRankings} onChange={(event) => setAllowComments(event.target.checked)} />
            {t("allowComments")}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={inRankings} onChange={(event) => toggleRank(event.target.checked)} />
            {t("rankOpt")}
          </label>
          <p className="text-sm text-[var(--brd-mute)]">{t("rankForces")}</p>
        </div>
      ) : null}
      <Button type="button" className="min-h-11 self-start px-4" disabled={busy || (publish && title.trim().length === 0)} onClick={() => void save()}>
        {busy ? t("saving") : t("save")}
      </Button>
      {note ? <p role="status" className="text-sm">{note}</p> : null}
    </section>
  );
}
