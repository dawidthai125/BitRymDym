"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "@/components/ui/app-link";
import { useTranslations } from "next-intl";

import { ConsentSwitches } from "@/components/community/consent-switches";
import { ShareButtons } from "@/components/share/share-buttons";
import { Button } from "@/components/ui/button";
import { LEGAL_PATHS } from "@/lib/legal/legal-config";
import { absoluteUrl } from "@/lib/share/share-links";

type Entry = {
  id: string;
  author?: string;
  title: string;
  allowRatings: boolean;
  allowComments: boolean;
  inRankings: boolean;
  listed: boolean;
  check?: "passed" | "checking" | "held" | "removed" | "cancelled";
  checkNote?: string | null;
  rightsAccepted?: boolean;
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
  /** The entry was not read: no form, because saving an unknown state would take the track out. */
  const [loadError, setLoadError] = useState<"error" | "signed_out" | null>(null);
  const [older, setOlder] = useState<{ id: string; title: string } | null>(null);
  const [withdrawOlder, setWithdrawOlder] = useState(true);
  const [publish, setPublish] = useState(false);
  const [title, setTitle] = useState(defaultTitle.slice(0, 80));
  const [allowRatings, setAllowRatings] = useState(false);
  const [allowComments, setAllowComments] = useState(false);
  const [inRankings, setInRankings] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /** Rights statement (2026-11-26): needed for the first publish of this master. */
  const [rights, setRights] = useState(false);
  const [check, setCheck] = useState<Entry["check"]>(undefined);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const [rightsBefore, setRightsBefore] = useState(false);
  const [busy, setBusy] = useState(false);
  // Live catalogue entry (id + author) → share block under the form.
  const [live, setLive] = useState<{ id: string; title: string; author: string } | null>(null);

  function applyLive(entry: Entry | null | undefined) {
    setCheck(entry?.check);
    setCheckNote(entry?.checkNote ?? null);
    setRightsBefore(entry?.rightsAccepted === true);
    setLive(entry?.listed && entry.id ? { id: entry.id, title: entry.title, author: entry.author ?? "" } : null);
  }

  const url = `/api/studio/catalog?projectId=${encodeURIComponent(projectId)}&masterJobId=${encodeURIComponent(masterJobId)}`;

  /** Staff took a version of the project down: no master of it can be published (any new master too). */
  function applyBlocked(blocked: { note?: string } | null | undefined) {
    if (!blocked) return;
    setCheck("removed");
    setCheckNote(blocked.note ?? null);
    setPublish(false);
  }

  async function refreshLive() {
    try {
      const response = await fetch(url);
      const payload = (await response.json().catch(() => null)) as { entry?: Entry | null; older?: { id: string; title: string } | null; blocked?: { note?: string } | null } | null;
      if (!response.ok || !payload) return;
      applyLive(payload.entry);
      applyBlocked(payload.blocked);
      setOlder(payload.older ?? null);
    } catch {
      // saved anyway; the share block appears after a reload
    }
  }

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(url, { signal });
      const payload = (await response.json().catch(() => null)) as { result?: string; entry?: Entry | null; older?: { id: string; title: string } | null; blocked?: { note?: string } | null } | null;
      if (signal?.aborted) return;
      if (payload?.result === "off") setOff(true);
      else if (!response.ok || payload?.result !== "ok") setLoadError(response.status === 401 ? "signed_out" : "error");
      else {
        setLoadError(null);
        setOlder(payload.older ?? null);
        if (payload.entry) {
          setTitle(payload.entry.title);
          const waiting = payload.entry.check === "checking" || payload.entry.check === "held";
          setPublish(payload.entry.listed || waiting);
          setAllowRatings(payload.entry.allowRatings);
          setAllowComments(payload.entry.allowComments);
          setInRankings((payload.entry.listed || waiting) && payload.entry.inRankings);
          applyLive(payload.entry);
        }
        applyBlocked(payload.blocked);
      }
      setReady(true);
    } catch {
      if (signal?.aborted) return;
      setLoadError("error");
      setReady(true);
    }
  }, [url]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  async function save() {
    if (busy) return;
    if (!publish && !live && check !== "checking" && check !== "held") {
      setNote(t("notListed"));
      return;
    }
    if (publish && needsRights && !rights) {
      setNote(t("rightsNeeded"));
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/studio/catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          masterJobId,
          title,
          publish,
          allowRatings,
          allowComments,
          inRankings,
          ...(publish && older ? { withdrawOlder } : {}),
          ...(publish && rights ? { rightsAccepted: true } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { result?: string };
      if (payload.result === "ok" || payload.result === "checking" || payload.result === "held") {
        setNote(publish ? (payload.result === "ok" ? t("saved") : payload.result === "held" ? t("heldSaved") : t("checkingSaved")) : t("withdrawn"));
        if (publish) await refreshLive();
        else {
          setLive(null);
          setCheck("cancelled");
          setCheckNote(null);
        }
        return;
      }
      setNote(
        payload.result === "rights" ? t("rightsNeeded")
        : payload.result === "blocked" ? t("blocked")
        : payload.result === "off" ? t("off")
          : payload.result === "missing" ? t("missing")
            : response.status === 401 ? t("signedOut")
              : response.status === 400 ? t("invalid")
                : t("saveError"),
      );
    } catch {
      setNote(t("saveError"));
    } finally {
      setBusy(false);
    }
  }

  // Live or passed before: the statement was given. Otherwise it must be ticked now.
  const needsRights = check !== "passed" && !rightsBefore;

  if (!ready) return null;
  if (off) return <p className="text-sm text-[var(--brd-mute)]">{t("off")}</p>;
  if (loadError) {
    return (
      <p role="alert" data-testid="catalog-publish-load-error" className="flex flex-wrap items-center gap-2 text-sm">
        {loadError === "signed_out" ? t("signedOut") : t("loadError")}
        {loadError === "error" ? <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void load()}>{t("retry")}</Button> : null}
      </p>
    );
  }

  return (
    <section aria-labelledby="catalog-publish-title" data-testid="catalog-publish" className="flex flex-col gap-2 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3">
      <h3 id="catalog-publish-title" className="brd-display text-lg">{t("publishTitle")}</h3>
      <p className="text-sm">{t("publishLead")}</p>
      <p className="text-xs text-[var(--brd-mute)]">
        {t("publishNoPlayer")}{" "}
        <Link href={`${LEGAL_PATHS.terms}#s7`} className="underline">{t("publishTerms")}</Link>
      </p>
      {/* The publish box is the consent to the public 45 s clip (terms § 7 ust. 8). */}
      <label className="flex min-h-11 items-center gap-2 text-sm" data-testid="catalog-publish-consent">
        <input type="checkbox" checked={publish} disabled={check === "removed"} onChange={(event) => setPublish(event.target.checked)} />
        {t("publish")}
      </label>
      {publish && check !== "removed" ? (
        <div className="flex flex-col gap-2">
          <label className="text-sm" htmlFor="catalog-work-title">{t("titleLabel")}</label>
          <input
            id="catalog-work-title"
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            className="min-h-11 border border-[var(--brd-line)] bg-transparent px-3 text-sm"
          />
          <ConsentSwitches
            kind="work"
            hideListed
            value={{ listed: true, allowRatings, allowComments, inRankings }}
            onChange={(next) => {
              setAllowRatings(next.allowRatings);
              setAllowComments(next.allowComments);
              setInRankings(next.inRankings);
            }}
          />
        </div>
      ) : null}
      {publish && needsRights && check !== "removed" ? (
        <label className="flex min-h-11 items-start gap-2 text-sm" data-testid="catalog-publish-rights">
          <input type="checkbox" className="mt-1" checked={rights} onChange={(event) => setRights(event.target.checked)} />
          <span>{t("rightsLabel")}</span>
        </label>
      ) : null}
      {check === "checking" || check === "held" || check === "removed" ? (
        <p role="status" data-testid="catalog-publish-check" className="border-l-4 border-l-[var(--brd-amber)] px-3 py-1 text-sm">
          {checkNote ?? (check === "checking" ? t("checkingSaved") : check === "held" ? t("heldSaved") : t("blocked"))}
        </p>
      ) : null}
      {older ? (
        <div className="border-l-4 border-l-[var(--brd-amber)] px-3 py-1 text-sm" data-testid="catalog-publish-older">
          <p>{t("olderLive", { title: older.title })}</p>
          {publish ? (
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={withdrawOlder} onChange={(event) => setWithdrawOlder(event.target.checked)} />
              {t("withdrawOlder")}
            </label>
          ) : null}
        </div>
      ) : null}
      <Button type="button" className="min-h-11 self-start px-4" disabled={busy || check === "removed" || (publish && title.trim().length === 0) || (publish && needsRights && !rights)} onClick={() => void save()}>
        {busy ? t("saving") : t("save")}
      </Button>
      {note ? <p role="status" className="text-sm">{note}</p> : null}
      <Link href="/account/catalog" className="inline-flex min-h-11 items-center self-start text-sm underline underline-offset-4">{t("allMine")}</Link>
      {live ? (
        <div className="flex flex-col gap-2 border-t border-[var(--brd-line)] pt-3" data-testid="catalog-publish-share">
          <p className="text-sm font-semibold">{t("shareLead")}</p>
          <ShareButtons
            url={absoluteUrl(window.location.origin, `/utwor/${live.id}`)}
            text={live.author ? t("shareText", { title: live.title, author: live.author }) : live.title}
            title={live.title}
            testId="catalog-work-share"
            compact
          />
        </div>
      ) : null}
    </section>
  );
}
