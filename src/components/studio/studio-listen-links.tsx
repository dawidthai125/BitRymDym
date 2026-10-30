"use client";

/**
 * Gaps P1 — private listen links to the approved master (owner panel in the master step).
 * Create (lifetime ≤ plan cap, active-link cap per plan), copy, revoke. Listen only.
 */
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
  const base = `/api/studio/projects/${projectId}/listen-links`;

  const apply = useCallback((j: (Partial<State> & { success?: boolean }) | null) => {
    if (!j?.success) return;
    setSt({ available: j.available !== false, approved: !!j.approved, tier: j.tier, links: j.links ?? [], limits: j.limits ?? { active: 0, maxActive: 0, dayOptions: [] } });
  }, []);
  const load = useCallback(() => fetch(base).then((r) => r.json()).then(apply).catch(() => undefined), [base, apply]);
  useEffect(() => {
    let alive = true;
    fetch(base).then((r) => r.json()).then((j) => { if (alive) apply(j); }).catch(() => undefined);
    return () => { alive = false; };
  }, [base, apply]);

  if (!st) return null;
  if (!st.available) return <p className="text-xs text-[var(--brd-mute)]" data-testid="studio-share-unavailable">{t("niedostepne")}</p>;
  const opts = st.limits.dayOptions;
  const chosen = days && opts.includes(days) ? days : opts[opts.length - 1] ?? 1;
  const limitReached = st.limits.maxActive !== null && st.limits.active >= st.limits.maxActive;
  const when = (iso: string) => new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "pl-PL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Warsaw" });

  async function create() {
    setBusy(true); setMsg(null);
    const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: chosen }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!j.success) setMsg(t(`blad.${["limit", "not_approved", "bad_days"].includes(j.error) ? j.error : "inny"}`));
    await load();
  }
  async function revoke(linkId: string) {
    setBusy(true);
    await fetch(base, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ linkId }) });
    setBusy(false);
    await load();
  }
  async function copy(l: LinkView) {
    try { await navigator.clipboard.writeText(l.url); setCopied(l.id); } catch { setCopied(null); }
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
          <a href="/premium" className="font-semibold underline underline-offset-4">{t("zobaczPlany")}</a>
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
                  <input readOnly value={l.url} aria-label={t("adres")} onFocus={(e) => e.currentTarget.select()} className="min-h-9 min-w-0 flex-1 rounded-[2px] border border-[var(--brd-line)] bg-transparent px-2 font-mono text-xs" />
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="outline" className="min-h-9" onClick={() => void copy(l)} data-testid="studio-share-copy">{copied === l.id ? t("skopiowano") : t("kopiuj")}</Button>
                    <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={busy} onClick={() => void revoke(l.id)} data-testid="studio-share-revoke">{t("wylacz")}</Button>
                  </div>
                </div>
              ) : null}
              {l.state === "active" ? <ShareButtons url={l.url} text={t("tekstUdostepnienia")} testId="studio-share-social" compact /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-[var(--brd-mute)]">{t("uwaga")}</p>
    </section>
  );
}
