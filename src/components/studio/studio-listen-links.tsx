"use client";

/**
 * Gaps P1 — private listen links to the approved master (owner panel in the master step).
 * Create (lifetime ≤ plan cap, active-link cap per plan), copy, revoke. Listen only.
 */
import { StoreAppHidden } from "@/components/site/store-app-context";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { ShareButtons } from "@/components/share/share-buttons";
import { Button } from "@/components/ui/button";

type LinkView = {
  id: string; url: string; createdAt: string; expiresAt: string; revokedAt: string | null;
  playCount: number; state: "active" | "expired" | "revoked";
};
type State = {
  available: boolean; approved: boolean; tier?: string; links: LinkView[];
  limits: { active: number; maxActive: number | null; dayOptions: number[] };
};

export function StudioListenLinks({ projectId }: { projectId: string }) {
  const t = useTranslations("studio.share");
  const locale = useLocale();
  const [st, setSt] = useState<State | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  /** Switching a link off cannot be undone: the first click asks. */
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const base = `/api/studio/projects/${projectId}/listen-links`;

  const apply = useCallback((j: (Partial<State> & { success?: boolean }) | null) => {
    if (!j?.success) return setLoadFailed(true);
    setLoadFailed(false);
    setSt({ available: j.available !== false, approved: !!j.approved, tier: j.tier, links: j.links ?? [], limits: j.limits ?? { active: 0, maxActive: 0, dayOptions: [] } });
  }, []);
  const load = useCallback(() => fetch(base, { cache: "no-store" }).then((r) => r.json()).then(apply).catch(() => setLoadFailed(true)), [base, apply]);
  useEffect(() => {
    let alive = true;
    fetch(base).then((r) => r.json()).then((j) => { if (alive) apply(j); }).catch(() => { if (alive) setLoadFailed(true); });
    return () => { alive = false; };
  }, [base, apply]);

  if (!st) {
    return loadFailed ? (
      <p role="alert" data-testid="studio-share-load-error" className="flex flex-wrap items-center gap-2 text-sm">
        {t("wczytajBlad")}
        <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void load()}>{t("ponow")}</Button>
      </p>
    ) : null;
  }
  if (!st.available) return <p className="text-xs text-[var(--brd-mute)]" data-testid="studio-share-unavailable">{t("niedostepne")}</p>;
  const opts = st.limits.dayOptions;
  const chosen = days && opts.includes(days) ? days : opts[opts.length - 1] ?? 1;
  const limitReached = st.limits.maxActive !== null && st.limits.active >= st.limits.maxActive;
  const when = (iso: string) => new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "pl-PL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Warsaw" });

  async function create() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: chosen }) });
      const j = await r.json().catch(() => ({}));
      if (!j.success) setMsg(t(`blad.${["limit", "not_approved", "bad_days"].includes(j.error) ? j.error : "inny"}`));
      await load();
    } catch {
      setMsg(t("blad.siec"));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(linkId: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(base, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ linkId }) });
      const j = await r.json().catch(() => ({}));
      // "Switched off" only when the server said so: otherwise the link still plays.
      if (!r.ok || !j.success || j.ok === false) setMsg(t("blad.wylacz"));
      await load();
    } catch {
      setMsg(t("blad.wylacz"));
    } finally {
      setConfirmOff(null);
      setBusy(false);
    }
  }
  async function copy(l: LinkView) {
    setMsg(null);
    try {
      await navigator.clipboard.writeText(l.url);
      setCopied(l.id);
    } catch {
      setCopied(null);
      setMsg(t("blad.kopiuj"));
    }
  }

  return (
    <section aria-labelledby="studio-share-title" data-testid="studio-share" className="flex flex-col gap-3 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3">
      <div className="flex flex-col gap-1">
        <h3 id="studio-share-title" className="brd-display text-lg">{t("tytul")}</h3>
        <p className="text-sm">{t("opis")}</p>
      </div>
      <p className="text-xs text-[var(--brd-mute)]" data-testid="studio-share-limit">
        {st.limits.maxActive === null ? t("limitBez", { active: st.limits.active }) : t("limit", { active: st.limits.active, max: st.limits.maxActive })}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label={t("waznosc")} className="flex flex-wrap gap-1">
          {opts.map((d) => (
            <Button key={d} type="button" size="sm" role="radio" aria-checked={d === chosen} variant={d === chosen ? "default" : "outline"} className="min-h-9" onClick={() => setDays(d)} data-testid={`studio-share-days-${d}`}>
              {t("dni", { n: d })}
            </Button>
          ))}
        </div>
        <Button type="button" className="min-h-11 self-start px-4" disabled={busy || limitReached || !st.approved} onClick={() => void create()} data-testid="studio-share-create">
          {t("utworz")}
        </Button>
      </div>
      {limitReached ? (
        <p role="status" className="flex flex-col gap-1 border-l-4 border-l-[var(--brd-amber)] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between" data-testid="studio-share-limit-reached">
          <span>{t("limitOsiagniety")}</span>
          <StoreAppHidden><a href="/premium" className="font-semibold underline underline-offset-4">{t("zobaczPlany")}</a></StoreAppHidden>
        </p>
      ) : null}
      {msg ? <p role="alert" className="text-sm text-[var(--brd-rec)]">{msg}</p> : null}
      {st.links.length ? (
        <ul className="flex flex-col gap-2">
          {st.links.map((l) => (
            <li key={l.id} data-testid="studio-share-link" data-state={l.state} className="flex flex-col gap-2 rounded-[2px] border border-[var(--brd-line)] p-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${l.state === "active" ? "bg-[var(--brd-ink)] text-[var(--brd-paper)]" : "border border-[var(--brd-line)] text-[var(--brd-mute)]"}`}>{t(`stan.${l.state}`)}</span>
                <span className="text-[var(--brd-mute)]">{l.state === "active" ? t("wygasa", { kiedy: when(l.expiresAt) }) : t("utworzono", { kiedy: when(l.createdAt) })}</span>
                <span className="text-[var(--brd-mute)]">· {t("odtworzenia", { n: l.playCount })}</span>
              </div>
              {l.state === "active" ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {l.url ? <input readOnly value={l.url} aria-label={t("adres")} onFocus={(e) => e.currentTarget.select()} className="min-h-9 min-w-0 flex-1 rounded-[2px] border border-[var(--brd-line)] bg-transparent px-2 font-mono text-xs" /> : <p className="min-w-0 flex-1 text-xs text-[var(--brd-mute)]">{t("adresNiedostepny")}</p>}
                  <div className="flex gap-1">
                    {l.url ? <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void copy(l)} data-testid="studio-share-copy">{copied === l.id ? t("skopiowano") : t("kopiuj")}</Button> : null}
                    {confirmOff === l.id ? (
                      <>
                        <Button type="button" size="sm" className="min-h-11" disabled={busy} onClick={() => void revoke(l.id)} data-testid="studio-share-revoke-confirm">{t("wylaczNaPewno")}</Button>
                        <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirmOff(null)}>{t("zostaw")}</Button>
                      </>
                    ) : (
                      <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirmOff(l.id)} data-testid="studio-share-revoke">{t("wylacz")}</Button>
                    )}
                  </div>
                </div>
              ) : null}
              {l.state === "active" && l.url ? <ShareButtons url={l.url} text={t("tekstUdostepnienia")} testId="studio-share-social" compact /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-[var(--brd-mute)]">{t("uwaga")}</p>
    </section>
  );
}
