"use client";

import { useLocale, useTranslations } from "next-intl";
import { useLibText } from "@/i18n/use-lib-text";
import { useCallback, useEffect, useRef, useState } from "react";

import { ConsentSwitches } from "@/components/community/consent-switches";
import type { ListingConsents } from "@/lib/community/consents";
import type { StudioSampleDto } from "@/lib/studio/samples/sample-service";
import { cn } from "@/lib/utils";

type ListState = { samples: StudioSampleDto[]; cap: number; owned: number } | null;

async function fetchSamples(): Promise<{ ok: true; list: NonNullable<ListState> } | { ok: false; message?: string }> {
  try {
    const res = await fetch("/api/studio/samples", { cache: "no-store" });
    const body = (await res.json()) as { samples?: StudioSampleDto[]; cap?: number; owned?: number; message?: string };
    if (!res.ok) return { ok: false, message: body.message };
    return { ok: true, list: { samples: body.samples ?? [], cap: body.cap ?? 0, owned: body.owned ?? 0 } };
  } catch {
    return { ok: false };
  }
}

/** The user's samples: listen, send to the catalogue, delete. Shared by the lab and the locked view. */
export function MySamples({ refreshKey }: { refreshKey: number }) {
  const t = useTranslations("studio.sampleLab");
  const tc = useTranslations("community.consents");
  const tl = useLibText();
  const locale = useLocale();
  const [list, setList] = useState<ListState>(null);
  const [listFailed, setListFailed] = useState(false);
  const playSeq = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  /** Choices made before sending to the catalogue. */
  const [wishes, setWishes] = useState<Record<string, ListingConsents>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    fetchSamples().then((result) => {
      if (!alive) return;
      setListFailed(!result.ok);
      if (result.ok) setList(result.list);
      else setError(result.message ?? t("bladListy"));
    });
    return () => {
      alive = false;
    };
  }, [refreshKey, version, t]);

  useEffect(() => () => audio.current?.pause(), []);

  async function play(id: string) {
    const seq = ++playSeq.current;
    audio.current?.pause();
    if (playing === id) {
      setPlaying(null);
      return;
    }
    setPlaying(id);
    try {
      const res = await fetch(`/api/studio/samples/${id}/play`);
      const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (seq !== playSeq.current) return;
      if (!body.url) throw new Error(body.message ?? "");
      const el = new Audio(body.url);
      audio.current = el;
      el.onended = () => setPlaying((p) => (p === id ? null : p));
      await el.play();
    } catch (cause) {
      if (seq !== playSeq.current) return;
      setPlaying(null);
      setError(cause instanceof Error && cause.message && cause.name === "Error" ? cause.message : t("bladOdsluchu"));
    }
  }

  async function share(id: string, next: ListingConsents) {
    setBusy(id);
    const res = await fetch(`/api/studio/samples/${id}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({})) ?? {}) as { message?: string; sample?: StudioSampleDto };
    setBusy(null);
    const saved = body.sample;
    if (!res?.ok || !saved) {
      setError(body.message ?? t("bladAkcji"));
      return;
    }
    setError(null);
    setList((current) =>
      current ? { ...current, samples: current.samples.map((s) => (s.id === id ? { ...s, consents: saved.consents } : s)) } : current,
    );
  }

  async function act(id: string, kind: "submit" | "delete") {
    setBusy(id);
    setAsking(null);
    if (kind === "delete" && playing === id) {
      playSeq.current += 1;
      audio.current?.pause();
      setPlaying(null);
    }
    const res = await fetch(kind === "submit" ? `/api/studio/samples/${id}/submit` : `/api/studio/samples/${id}`, {
      method: kind === "submit" ? "POST" : "DELETE",
      ...(kind === "submit"
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(wishes[id] ?? {}) }
        : {}),
    }).catch(() => null);
    const body = ((await res?.json().catch(() => ({}))) ?? {}) as { message?: string; error?: string };
    setBusy(null);
    if (!res?.ok) setError(body.message ?? t("bladAkcji"));
    else {
      setError(null);
      load();
    }
  }

  return (
    <section aria-labelledby="my-samples" className="rounded-lg border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="my-samples" className="text-base font-semibold">{t("mojeSample")}</h2>
        {list ? (
          <span className="font-mono text-sm text-[var(--brd-ink-soft)]">{t("limit", { n: list.owned, cap: list.cap })}</span>
        ) : null}
      </div>
      {error ? <p role="alert" className="mb-2 text-sm text-[var(--brd-rec)]">{tl(error)}</p> : null}
      {!list ? (
        listFailed ? (
          <button type="button" onClick={() => { setError(null); setListFailed(false); load(); }} className="min-h-11 rounded-md border border-[var(--brd-line)] px-4 text-sm">
            {t("sprobujPonownie")}
          </button>
        ) : (
          <p className="text-sm text-[var(--brd-ink-soft)]">{t("wczytuje")}</p>
        )
      ) : list.samples.length === 0 ? (
        <p className="text-sm text-[var(--brd-ink-soft)]">{t("brakSampli")}</p>
      ) : (
        <ul className="divide-y divide-[var(--brd-line)]">
          {list.samples.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <button
                type="button"
                onClick={() => void play(s.id)}
                aria-label={playing === s.id ? t("zatrzymaj") : t("odsluchaj")}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--brd-line)] hover:border-[var(--brd-amber)]"
              >
                {playing === s.id ? "■" : "▶"}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.title}</p>
                <p className="text-xs text-[var(--brd-ink-soft)]">
                  {[
                    s.instrument ? t(`instrument.${s.instrument}`) : null,
                    s.sampleType ? t(`typ.${s.sampleType}`) : null,
                    s.bpm ? `${Math.round(s.bpm)} BPM` : null,
                    s.bars ? t("taktow", { n: s.bars }) : null,
                    s.musicalKey,
                    `${(s.durationMs / 1000).toLocaleString(locale === "en" ? "en-US" : "pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs",
                  s.status === "PUBLISHED" ? "border-[var(--brd-green)] text-[var(--brd-green)]" : s.status === "REJECTED" ? "border-[var(--brd-rec)] text-[var(--brd-rec)]" : "border-[var(--brd-line)] text-[var(--brd-ink-soft)]",
                )}
              >
                {t(`status.${s.status}`)}
              </span>
              {s.status === "PRIVATE" || s.status === "REJECTED" ? (
                <button type="button" disabled={busy === s.id} onClick={() => void act(s.id, "submit")} className="min-h-9 rounded-md border border-[var(--brd-line)] px-3 text-sm hover:border-[var(--brd-amber)] disabled:opacity-40">
                  {t("doKatalogu")}
                </button>
              ) : null}
              {s.status !== "PUBLISHED" ? (
                asking === s.id ? (
                  <span className="flex items-center gap-2 text-sm">
                    {t("usunac")}
                    <button type="button" onClick={() => void act(s.id, "delete")} className="min-h-9 rounded-md bg-[var(--brd-rec)] px-3 font-semibold text-white">
                      {t("tak")}
                    </button>
                    <button type="button" onClick={() => setAsking(null)} className="min-h-9 rounded-md border border-[var(--brd-line)] px-3">
                      {t("nie")}
                    </button>
                  </span>
                ) : (
                  <button type="button" disabled={busy === s.id} onClick={() => setAsking(s.id)} className="min-h-9 px-2 text-sm text-[var(--brd-ink-soft)] hover:text-[var(--brd-rec)]">
                    {t("usun")}
                  </button>
                )
              ) : null}
              {s.consents ? (
                <details className="w-full">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm underline underline-offset-4">{tc("heading")}</summary>
                  {s.status === "PUBLISHED" || s.status === "PENDING_REVIEW" ? (
                    <ConsentSwitches kind="sample" value={s.consents} disabled={busy === s.id} onChange={(next) => void share(s.id, next)} />
                  ) : (
                    <ConsentSwitches
                      kind="sample"
                      hideListed
                      value={wishes[s.id] ?? { ...s.consents, listed: true }}
                      disabled={busy === s.id}
                      onChange={(next) => setWishes((current) => ({ ...current, [s.id]: next }))}
                    />
                  )}
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-[var(--brd-ink-soft)]">{t("uzycieWProjekcie")}</p>
    </section>
  );
}
