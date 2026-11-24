"use client";

import { useTranslations } from "next-intl";
import Link from "@/components/ui/app-link";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";

import { removeCatalogSampleAction, updateCatalogSampleAction } from "@/app/sampel/actions";
import { AuthorName } from "@/components/creators/author-name";
import { CatalogPager } from "@/components/ui/catalog-pager";
import { usePlayerOptional } from "@/components/player/player-provider";
import { SampleTalk } from "@/components/community/sample-talk";
import { catalogNumber } from "@/lib/community/share-policy";
import { pageOfRow, paginate } from "@/lib/ui/paginate";

export type CatalogSampleItem = {
  id: string;
  /** Stable catalog number (`studio_samples.sample_number`). */
  no: number;
  title: string;
  author: string;
  /** Public profile of the author, when it is on (with the bare name inside `author`). */
  authorHref?: string;
  authorName?: string;
  durationMs: number;
  instrument: string | null;
  instrumentLabel: string | null;
  sampleType: string | null;
  typeLabel: string | null;
  bpm: number | null;
  bars: number | null;
  barsLabel: string | null;
  musicalKey: string | null;
  /** Own text of the sample page (admin editor). */
  description?: string | null;
  descriptionEn?: string | null;
  platform: boolean;
  /** Average stars and number of ratings (catalog only). */
  ratingAvg?: number | null;
  ratingCount?: number;
};

export type CatalogSort = "new" | "top";

/** Pure: newest first (by catalog number) or best rated (average, then count, then newest). */
export function sortCatalogItems<T extends Pick<CatalogSampleItem, "no" | "ratingAvg" | "ratingCount">>(items: readonly T[], sort: CatalogSort): T[] {
  if (sort === "top") {
    return [...items].sort(
      (a, b) => (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0) || b.no - a.no,
    );
  }
  return [...items].sort((a, b) => b.no - a.no);
}

type Option = { id: string; label: string };

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Sample catalog with one shared player. The file is fetched into memory (blob URL) through
 * the signed-in stream route, so pause and seeking work and no storage link is exposed.
 */
export function SampleCatalog({
  items,
  signedIn,
  isAdmin,
  instruments,
  types,
  showTalk = true,
  showFilters = true,
  linkTitles = false,
  paging,
  extra,
}: {
  items: CatalogSampleItem[];
  signedIn: boolean;
  isAdmin: boolean;
  instruments: Option[];
  types: Option[];
  /** Ratings and comments (catalog only; a private draft has none). */
  showTalk?: boolean;
  showFilters?: boolean;
  /** Title links to the sample page /sampel/[id] (public catalog only; drafts have no page). */
  linkTitles?: boolean;
  /** 20 rows per page (public catalog); absent = one list. */
  paging?: { initialPage: number; query: string };
  /** Extra controls per row, e.g. "Do katalogu" in the admin generator. */
  extra?: (item: CatalogSampleItem) => ReactNode;
}) {
  const t = useTranslations("community.sampleCatalog");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobs = useRef(new Map<string, string>());
  /** The last click wins; a download that ends after leaving the page stays silent. */
  const playSeq = useRef(0);
  const mounted = useRef(true);
  const player = usePlayerOptional();
  const playerPhase = player?.phase;
  const [current, setCurrent] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [instrumentFilter, setInstrumentFilter] = useState<string>("all");
  const [sort, setSort] = useState<CatalogSort>("new");
  const [editing, setEditing] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const map = blobs.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      audioRef.current?.pause();
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  // The catalog player and a sample never play together.
  useEffect(() => {
    if (playerPhase === "playing") audioRef.current?.pause();
  }, [playerPhase]);

  const shown = useMemo(
    () =>
      sortCatalogItems(
        items.filter(
          (s) =>
            !removed.has(s.id) &&
            (typeFilter === "all" || s.sampleType === typeFilter) &&
            (instrumentFilter === "all" || s.instrument === instrumentFilter),
        ),
        showFilters ? sort : "new",
      ),
    [items, typeFilter, instrumentFilter, removed, sort, showFilters],
  );
  // A page belongs to one filter/sort view; any other view starts at page 1.
  const viewKey = `${typeFilter}|${instrumentFilter}|${sort}`;
  const [pageState, setPageState] = useState({ view: viewKey, page: paging?.initialPage ?? 1 });
  const listRef = useRef<HTMLOListElement | null>(null);
  const paged = paginate(shown, pageState.view === viewKey ? pageState.page : 1, paging ? undefined : Math.max(1, shown.length));

  // #<sample id> (rankings, sample of the week) opens the page that holds the sample.
  useEffect(() => {
    if (!paging) return;
    const jump = () => {
      const id = window.location.hash.slice(1);
      const target = id ? pageOfRow(shown, id) : null;
      if (!target) return;
      setPageState({ view: viewKey, page: target });
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "center" }), 0);
    };
    const first = window.setTimeout(jump, 0);
    window.addEventListener("hashchange", jump);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("hashchange", jump);
    };
    // The hash is read when it changes, not on every filter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of items) if (s.sampleType) m.set(s.sampleType, (m.get(s.sampleType) ?? 0) + 1);
    return m;
  }, [items]);
  const usedInstruments = useMemo(
    () => instruments.filter((o) => items.some((s) => s.instrument === o.id)),
    [instruments, items],
  );

  async function sourceFor(id: string): Promise<string | null> {
    const cached = blobs.current.get(id);
    if (cached) return cached;
    const res = await fetch(`/api/studio/samples/${id}/play`);
    const payload = (await res.json().catch(() => ({}))) as { url?: string };
    if (!payload.url) return null;
    const audio = await fetch(payload.url);
    if (!audio.ok) return null;
    const blob = await audio.blob();
    if (!mounted.current) return null;
    const url = URL.createObjectURL(blob);
    blobs.current.set(id, url);
    return url;
  }

  function audio(): HTMLAudioElement {
    if (!audioRef.current) {
      const a = new Audio();
      a.addEventListener("timeupdate", () => setTime(a.currentTime));
      a.addEventListener("loadedmetadata", () => setDuration(Number.isFinite(a.duration) ? a.duration : 0));
      a.addEventListener("play", () => setPlaying(true));
      a.addEventListener("pause", () => setPlaying(false));
      a.addEventListener("ended", () => {
        setPlaying(false);
        setTime(0);
      });
      audioRef.current = a;
    }
    return audioRef.current;
  }

  async function toggle(id: string) {
    setError(null);
    const seq = ++playSeq.current;
    const a = audio();
    if (current === id) {
      setLoadingId(null);
      if (a.paused) {
        if (player?.phase === "playing") player.toggle();
        await a.play().catch(() => setError(t("bladOdtwarzania")));
      } else a.pause();
      return;
    }
    a.pause();
    setLoadingId(id);
    try {
      const src = await sourceFor(id).catch(() => null);
      if (!mounted.current || seq !== playSeq.current) return;
      if (!src) {
        setError(t("bladOdtwarzania"));
        return;
      }
      a.src = src;
      setCurrent(id);
      setTime(0);
      setDuration(0);
      if (player?.phase === "playing") player.toggle();
      await a.play().catch(() => setError(t("bladOdtwarzania")));
    } finally {
      if (seq === playSeq.current) setLoadingId(null);
    }
  }

  function seek(id: string, fraction: number) {
    if (current !== id) return;
    const a = audio();
    if (Number.isFinite(a.duration) && a.duration > 0) a.currentTime = Math.max(0, Math.min(1, fraction)) * a.duration;
  }

  return (
    <div className="space-y-4">
      {showFilters ? (
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("sortuj")}>
        {(["new", "top"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setSort(id)}
            aria-pressed={sort === id}
            className={`min-h-11 rounded-full border px-3 text-sm ${
              sort === id
                ? "border-[var(--brd-amber)] bg-[var(--brd-amber)]/15 text-[var(--brd-ink)]"
                : "border-[var(--brd-line)] text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
            }`}
          >
            {id === "new" ? t("najnowsze") : t("najwyzejOceniane")}
          </button>
        ))}
      </div>
      ) : null}
      {showFilters ? (
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("filtr")}>
        {[
          { id: "all", label: t("wszystkie") },
          ...types.filter((o) => typeCounts.has(o.id)).map((o) => ({ id: o.id, label: t.has(`filtrTyp.${o.id}`) ? t(`filtrTyp.${o.id}`) : o.label })),
        ].map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setTypeFilter(o.id)}
            aria-pressed={typeFilter === o.id}
            className={`min-h-11 rounded-full border px-3 text-sm ${
              typeFilter === o.id
                ? "border-[var(--brd-amber)] bg-[var(--brd-amber)]/15 text-[var(--brd-ink)]"
                : "border-[var(--brd-line)] text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
            }`}
          >
            {o.label}
            <span className="ml-1 tabular-nums opacity-70">{o.id === "all" ? items.length : typeCounts.get(o.id)}</span>
          </button>
        ))}
        {usedInstruments.length > 1 ? (
          <select
            value={instrumentFilter}
            onChange={(e) => setInstrumentFilter(e.target.value)}
            aria-label={t("instrument")}
            className="min-h-11 rounded-full border border-[var(--brd-line)] bg-transparent px-3 text-sm text-[var(--brd-ink)]"
          >
            <option value="all">{t("wszystkieInstrumenty")}</option>
            {usedInstruments.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      ) : null}

      {error ? (
        <p className="text-sm text-[var(--brd-rec)]" role="alert">
          {error}
        </p>
      ) : null}

      <ol ref={listRef} className="scroll-mt-28 divide-y divide-[var(--brd-line)] rounded-xl border border-[var(--brd-line)] bg-[color-mix(in_srgb,var(--brd-paper)_60%,transparent)]">
        {paged.rows.map((s) => {
          const isCurrent = current === s.id;
          const total = isCurrent && duration > 0 ? duration : s.durationMs / 1000;
          const progress = isCurrent && total > 0 ? Math.min(1, time / total) : 0;
          return (
            <li key={s.id} id={s.id} className="px-3 py-3 sm:px-4">
              <div className="flex items-center gap-3">
                <span className="w-9 shrink-0 text-right font-mono text-sm tabular-nums text-[var(--brd-mute)]">
                  {catalogNumber(s.no)}
                </span>
                {signedIn ? (
                  <button
                    type="button"
                    onClick={() => void toggle(s.id)}
                    aria-label={isCurrent && playing ? t("pauza", { title: s.title }) : t("odtworz", { title: s.title })}
                    className={`flex size-10 shrink-0 items-center justify-center rounded-full border transition ${
                      isCurrent && playing
                        ? "border-[var(--brd-amber)] bg-[var(--brd-amber)] text-[var(--brd-bg)]"
                        : "border-[var(--brd-line)] text-[var(--brd-ink)] hover:border-[var(--brd-amber)]"
                    }`}
                  >
                    {loadingId === s.id ? (
                      <span className="size-3 animate-pulse rounded-full bg-current" aria-hidden />
                    ) : isCurrent && playing ? (
                      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                        <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
                        <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 16 16" className="ml-0.5 size-4" aria-hidden>
                        <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
                      </svg>
                    )}
                  </button>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base text-[var(--brd-ink)]">
                    {linkTitles ? (
                      <Link href={`/sampel/${s.id}`} className="underline-offset-4 hover:underline">
                        {s.title}
                      </Link>
                    ) : (
                      s.title
                    )}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--brd-mute)]">
                    <AuthorName name={s.authorName ?? s.author} href={s.authorHref} label={s.author} className="min-w-0" />
                    {s.ratingCount ? (
                      <span className="text-[var(--brd-amber)]" aria-label={t("ocenaAria", { avg: s.ratingAvg ?? 0, count: s.ratingCount })}>
                        ★ {(s.ratingAvg ?? 0).toFixed(1)} <span className="text-[var(--brd-mute)]">({s.ratingCount})</span>
                      </span>
                    ) : null}
                    {[s.typeLabel, s.instrumentLabel, s.bpm ? `${Math.round(s.bpm)} BPM` : null, s.barsLabel, s.musicalKey]
                      .filter(Boolean)
                      .map((chip) => (
                        <span key={chip} className="rounded-full border border-[var(--brd-line)] px-2 py-0.5 text-[var(--brd-ink-soft)]">
                          {chip}
                        </span>
                      ))}
                  </div>
                </div>
                <span className="hidden shrink-0 font-mono text-xs tabular-nums text-[var(--brd-mute)] sm:block">
                  {isCurrent ? `${clock(time)} / ` : ""}
                  {clock(total)}
                </span>
              </div>

              {signedIn ? (
                <div className="mt-2 flex items-center gap-3 pl-12 sm:pl-[5.25rem]">
                  <input
                    type="range"
                    min={0}
                    max={1000}
                    step={1}
                    value={Math.round(progress * 1000)}
                    disabled={!isCurrent}
                    onChange={(e) => seek(s.id, Number(e.target.value) / 1000)}
                    aria-label={t("przewin", { title: s.title })}
                    className="h-1.5 w-full cursor-pointer accent-[var(--brd-amber)] disabled:cursor-default disabled:opacity-40"
                  />
                  <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--brd-mute)] sm:hidden">
                    {isCurrent ? clock(time) : clock(total)}
                  </span>
                </div>
              ) : (
                <p className="mt-2 pl-12">
                  <Link href="/sign-in" className="-my-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">
                    {t("zalogujSie")}
                  </Link>
                </p>
              )}

              <div className="mt-1 flex flex-wrap items-center gap-3 pl-12 sm:pl-[5.25rem]">
                {linkTitles ? (
                  <Link href={`/sampel/${s.id}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
                    {t("opis")}
                  </Link>
                ) : null}
                {showTalk ? <SampleTalk id={s.id} signedIn={signedIn} /> : null}
                {extra ? extra(s) : null}
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => setEditing(editing === s.id ? null : s.id)}
                    className="inline-flex min-h-11 items-center text-sm text-[var(--brd-mute)] underline underline-offset-4 hover:text-[var(--brd-ink)]"
                  >
                    {editing === s.id ? t("zamknij") : t("edytuj")}
                  </button>
                ) : null}
              </div>
              {isAdmin && editing === s.id ? (
                <AdminSampleEditor
                  item={s}
                  instruments={instruments}
                  types={types}
                  onDone={() => setEditing(null)}
                  onRemoved={() => {
                    if (current === s.id) {
                      audioRef.current?.pause();
                      setCurrent(null);
                    }
                    setEditing(null);
                    setRemoved((prev) => new Set(prev).add(s.id));
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {paging ? (
        <CatalogPager
          page={paged.page}
          pages={paged.pages}
          query={paging.query}
          onPage={(page) => {
            setPageState({ view: viewKey, page });
            listRef.current?.scrollIntoView({ block: "start" });
          }}
        />
      ) : null}
      {shown.length === 0 ? <p className="text-sm text-[var(--brd-mute)]">{t("brakWFiltrze")}</p> : null}
    </div>
  );
}

function AdminSampleEditor({
  item,
  instruments,
  types,
  onDone,
  onRemoved,
}: {
  item: CatalogSampleItem;
  instruments: Option[];
  types: Option[];
  onDone: () => void;
  onRemoved: () => void;
}) {
  const t = useTranslations("community.sampleCatalog");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const field = "min-h-10 w-full rounded-lg border border-[var(--brd-line)] bg-transparent px-2 text-sm text-[var(--brd-ink)]";

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await updateCatalogSampleAction(data);
      if (r.ok) onDone();
      else setMessage(r.error);
    });
  }

  function remove() {
    start(async () => {
      const r = await removeCatalogSampleAction(item.id);
      if (r.ok) onRemoved();
      else setMessage(r.error);
    });
  }

  return (
    <form onSubmit={save} className="mt-3 grid gap-3 rounded-lg border border-[var(--brd-line)] p-3 sm:ml-[5.25rem] sm:grid-cols-2">
      <input type="hidden" name="sampleId" value={item.id} />
      <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)] sm:col-span-2">
        {t("tytul")}
        <input name="title" defaultValue={item.title} maxLength={80} required className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)]">
        {t("instrument")}
        <select name="instrument" defaultValue={item.instrument ?? ""} className={field}>
          {instruments.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)]">
        {t("typ")}
        <select name="sampleType" defaultValue={item.sampleType ?? "oneshot"} className={field}>
          {types.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)]">
        BPM
        <input name="bpm" inputMode="decimal" defaultValue={item.bpm ?? ""} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)]">
        {t("takty")}
        <select name="bars" defaultValue={item.bars ?? ""} className={field}>
          <option value="">—</option>
          {[1, 2, 4, 8, 16].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)]">
        {t("tonacja")}
        <input name="musicalKey" defaultValue={item.musicalKey ?? ""} placeholder="Am, F#, A2" maxLength={4} className={field} />
      </label>
      {([["description", t("opisPl"), item.description], ["descriptionEn", t("opisEn"), item.descriptionEn]] as const).map(([name, label, value]) => (
        <label key={name} className="flex flex-col gap-1 text-xs text-[var(--brd-mute)] sm:col-span-2">
          {label}
          <textarea name={name} defaultValue={value ?? ""} maxLength={600} rows={3} placeholder={t("opisPusty")} className={`${field} py-2`} />
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className="min-h-10 rounded-lg border border-[var(--brd-amber)] px-4 text-sm text-[var(--brd-ink)] disabled:opacity-50">
          {pending ? t("zapisuje") : t("zapisz")}
        </button>
        {confirm ? (
          <>
            <span className="text-sm text-[var(--brd-rec)]">{item.platform ? t("usunPewny") : t("zdejmijPewny")}</span>
            <button type="button" disabled={pending} onClick={remove} className="min-h-10 rounded-lg border border-[var(--brd-rec)] px-3 text-sm text-[var(--brd-rec)]">
              {t("tak")}
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="min-h-10 px-2 text-sm underline underline-offset-4">
              {t("nie")}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="min-h-10 px-2 text-sm text-[var(--brd-rec)] underline underline-offset-4">
            {item.platform ? t("usun") : t("zdejmij")}
          </button>
        )}
        {message ? (
          <span className="text-sm text-[var(--brd-rec)]" role="alert">
            {message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
