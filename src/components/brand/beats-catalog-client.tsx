"use client";

import { useMemo, useState } from "react";

import { BeatCatalogRow } from "@/components/brand/beat-catalog-row";
import {
  CATALOG_GENRES,
  CATALOG_KEYS,
  CATALOG_MOODS,
  type PresentedBeat,
} from "@/lib/ui/demo-beats";
import { cn } from "@/lib/utils";

type SortId = "newest" | "featured" | "listened";

type BeatsCatalogClientProps = {
  beats: PresentedBeat[];
  initialQuery?: string;
};

/**
 * Marketplace catalog client — filters/search/sort are UI-only on presented data.
 * Fala 3.1: music-catalog filter character (not admin form).
 */
export function BeatsCatalogClient({
  beats,
  initialQuery = "",
}: BeatsCatalogClientProps) {
  const [query, setQuery] = useState(initialQuery);
  const [genres, setGenres] = useState<string[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [bpmMin, setBpmMin] = useState(70);
  const [bpmMax, setBpmMax] = useState(160);
  const [sort, setSort] = useState<SortId>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = beats.filter((b) => {
      if (genres.length && !genres.includes(b.genre)) return false;
      if (keys.length && !keys.includes(b.key)) return false;
      if (moods.length && !moods.includes(b.mood)) return false;
      if (b.bpm < bpmMin || b.bpm > bpmMax) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.producer.toLowerCase().includes(q) ||
        b.genre.toLowerCase().includes(q) ||
        b.mood.toLowerCase().includes(q) ||
        b.key.toLowerCase().includes(q)
      );
    });

    if (sort === "featured") {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title, "pl"));
    } else if (sort === "listened") {
      list = [...list].sort(
        (a, b) => b.bpm - a.bpm || a.title.localeCompare(b.title, "pl"),
      );
    }
    return list;
  }, [beats, query, genres, keys, moods, bpmMin, bpmMax, sort]);

  const activeFilterCount =
    genres.length +
    keys.length +
    moods.length +
    (bpmMin > 70 || bpmMax < 160 ? 1 : 0);

  function clearFilters() {
    setGenres([]);
    setKeys([]);
    setMoods([]);
    setBpmMin(70);
    setBpmMax(160);
  }

  function toggleIn(
    value: string,
    list: string[],
    setList: (next: string[]) => void,
  ) {
    setList(
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    );
  }

  const filterPanel = (
    <FilterPanel
      genres={genres}
      keys={keys}
      moods={moods}
      bpmMin={bpmMin}
      bpmMax={bpmMax}
      onToggleGenre={(g) => toggleIn(g, genres, setGenres)}
      onToggleKey={(k) => toggleIn(k, keys, setKeys)}
      onToggleMood={(m) => toggleIn(m, moods, setMoods)}
      onBpmMin={setBpmMin}
      onBpmMax={setBpmMax}
      onClear={clearFilters}
      activeCount={activeFilterCount}
    />
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <label htmlFor="beats-search" className="sr-only">
          Szukaj bitów
        </label>
        <input
          id="beats-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj bitu, producenta, gatunku…"
          autoComplete="off"
          className="min-h-11 w-full border-b border-[var(--brd-line)] bg-transparent px-0 py-2.5 text-[15px] text-[var(--brd-ink)] placeholder:text-[var(--brd-mute)] outline-none focus-visible:border-[var(--brd-green)]"
        />

        <div className="flex flex-wrap items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex min-h-10 items-center border-b border-[var(--brd-line)] px-0.5 text-sm text-[var(--brd-ink)]"
          >
            Filtry{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
          <span className="text-[var(--brd-line)]" aria-hidden>
            ·
          </span>
          <SortSelect sort={sort} onChange={setSort} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-7 xl:grid-cols-[14.5rem_minmax(0,1fr)]">
        <aside className="hidden lg:block lg:sticky lg:top-4 lg:self-start">
          {filterPanel}
        </aside>

        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--brd-line)] pb-2">
            <p className="brd-meta text-[11px] tracking-[0.04em] text-[var(--brd-mute)]">
              {filtered.length === 1 ? "1 bit" : `${filtered.length} bitów`}
              {filtered.length !== beats.length
                ? ` · z ${beats.length}`
                : null}
            </p>
            <div className="hidden lg:block">
              <SortSelect sort={sort} onChange={setSort} />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="px-1 py-10 text-center">
              <p className="brd-display text-xl font-semibold">Cicho.</p>
              <p className="mt-2 text-sm text-[var(--brd-mute)]">
                Brak bitów dla tych filtrów. Zmień kryteria albo wyczyść filtry.
              </p>
              {activeFilterCount > 0 || query ? (
                <button
                  type="button"
                  onClick={() => {
                    clearFilters();
                    setQuery("");
                  }}
                  className="mt-4 text-sm text-[var(--brd-green)] hover:underline"
                >
                  Wyczyść wszystko
                </button>
              ) : null}
            </div>
          ) : (
            <ul>
              {filtered.map((beat, index) => (
                <BeatCatalogRow
                  key={beat.id}
                  beat={beat}
                  featured={index === 0}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {filtersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[color-mix(in_srgb,var(--brd-ink)_40%,transparent)]"
            aria-label="Zamknij filtry"
            onClick={() => setFiltersOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filtry katalogu"
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto border-t border-[var(--brd-line)] bg-[var(--brd-paper)] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="brd-meta text-[11px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
                Filtry
              </p>
              <button
                type="button"
                className="min-h-10 px-1 text-sm text-[var(--brd-mute)]"
                onClick={() => setFiltersOpen(false)}
              >
                Zamknij
              </button>
            </div>
            {filterPanel}
            <button
              type="button"
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center bg-[var(--brd-green)] text-sm text-[var(--brd-paper)]"
              onClick={() => setFiltersOpen(false)}
            >
              Pokaż wyniki ({filtered.length})
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SortSelect({
  sort,
  onChange,
}: {
  sort: SortId;
  onChange: (v: SortId) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-[var(--brd-ink-soft)]">
      <span className="brd-meta text-[10px] uppercase tracking-[0.12em] text-[var(--brd-mute)]">
        Sortuj
      </span>
      <select
        value={sort}
        onChange={(e) => onChange(e.target.value as SortId)}
        className="min-h-10 border-0 border-b border-[var(--brd-line)] bg-transparent py-1 pl-0 pr-1 text-sm text-[var(--brd-ink)] outline-none focus-visible:border-[var(--brd-green)]"
      >
        <option value="newest">Najnowsze</option>
        <option value="featured">Polecane</option>
        <option value="listened">Najczęściej słuchane</option>
      </select>
    </label>
  );
}

function FilterPanel({
  genres,
  keys,
  moods,
  bpmMin,
  bpmMax,
  onToggleGenre,
  onToggleKey,
  onToggleMood,
  onBpmMin,
  onBpmMax,
  onClear,
  activeCount,
}: {
  genres: string[];
  keys: string[];
  moods: string[];
  bpmMin: number;
  bpmMax: number;
  onToggleGenre: (g: string) => void;
  onToggleKey: (k: string) => void;
  onToggleMood: (m: string) => void;
  onBpmMin: (n: number) => void;
  onBpmMax: (n: number) => void;
  onClear: () => void;
  activeCount: number;
}) {
  return (
    <div className="space-y-0">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="brd-meta text-[10px] uppercase tracking-[0.16em] text-[var(--brd-mute)]">
          Filtry
        </p>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-[var(--brd-green)] hover:underline"
          >
            Wyczyść
          </button>
        ) : null}
      </div>

      <FilterGroup title="Gatunek">
        {CATALOG_GENRES.map((g) => (
          <CheckRow
            key={g}
            label={g}
            checked={genres.includes(g)}
            onChange={() => onToggleGenre(g)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="BPM">
        <div className="space-y-2 pt-0.5">
          <p className="brd-meta text-[11px] text-[var(--brd-ink-soft)]">
            {bpmMin}–{bpmMax}
          </p>
          <label className="block">
            <span className="sr-only">BPM min</span>
            <input
              type="range"
              min={70}
              max={160}
              value={bpmMin}
              onChange={(e) =>
                onBpmMin(Math.min(Number(e.target.value), bpmMax))
              }
              className="brd-scrub w-full"
            />
          </label>
          <label className="block">
            <span className="sr-only">BPM max</span>
            <input
              type="range"
              min={70}
              max={160}
              value={bpmMax}
              onChange={(e) =>
                onBpmMax(Math.max(Number(e.target.value), bpmMin))
              }
              className="brd-scrub w-full"
            />
          </label>
        </div>
      </FilterGroup>

      <FilterGroup title="Tonacja">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {CATALOG_KEYS.map((k) => (
            <CheckRow
              key={k}
              label={k}
              checked={keys.includes(k)}
              onChange={() => onToggleKey(k)}
              compact
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Nastrój">
        {CATALOG_MOODS.map((m) => (
          <CheckRow
            key={m}
            label={m}
            checked={moods.includes(m)}
            onChange={() => onToggleMood(m)}
          />
        ))}
      </FilterGroup>
    </div>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 border-t border-[var(--brd-line)] py-3.5 first:border-t-0 first:pt-0">
      <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
  compact = false,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  compact?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-[13px] transition-colors",
        compact ? "min-h-8" : "min-h-8",
        checked
          ? "text-[var(--brd-ink)]"
          : "text-[var(--brd-ink-soft)] hover:text-[var(--brd-ink)]",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-3.5 shrink-0 accent-[var(--brd-green)]"
      />
      <span className="truncate">{label}</span>
    </label>
  );
}
