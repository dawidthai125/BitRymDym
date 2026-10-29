"use client";

import { useTranslations } from "next-intl";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { BeatCatalogRow } from "@/components/brand/beat-catalog-row";
import {
  attachModalFocusTrap,
  setAppShellInert,
} from "@/lib/a11y/modal-focus-trap";
import {
  catalogBpmBoundsFromBeats,
  countActiveCatalogChipFilters,
  filterPresentedBeatsCatalogByChips,
} from "@/lib/ui/beats-catalog-filters";
import { filterPresentedBeatsCatalogByQuery } from "@/lib/ui/beats-catalog-search";
import {
  sortPresentedBeatsCatalog,
  type BeatsCatalogSortId,
} from "@/lib/ui/beats-catalog-sort";
import {
  catalogGenresFromBeats,
  catalogKeysFromBeats,
  type PresentedBeat,
} from "@/lib/ui/demo-beats";
import { formatBeatCountLabel } from "@/lib/ui/format-beat-count-label";
import { cn } from "@/lib/utils";

type SortId = BeatsCatalogSortId;

/**
 * AT live region copy — mirrors visible meta count, or empty headline + first hint.
 * Same string for identical counts → polite live regions typically skip re-announce
 * (sort / sheet open without count change stay quiet).
 */
export function beatsCatalogResultStatusMessage(
  filteredCount: number,
  totalCount: number,
  copy: {
    empty: string;
    count: (n: number) => string;
    ofTotal: (label: string, total: number) => string;
  } = {
    empty: "Cicho. Brak bitów dla tych filtrów.",
    count: formatBeatCountLabel,
    ofTotal: (label, total) => `${label} · z ${total}`,
  },
): string {
  if (filteredCount === 0) {
    return copy.empty;
  }
  const countLabel = copy.count(filteredCount);
  if (filteredCount !== totalCount) {
    return copy.ofTotal(countLabel, totalCount);
  }
  return countLabel;
}

type BeatsCatalogClientProps = {
  beats: PresentedBeat[];
  initialQuery?: string;
};

/**
 * Marketplace catalog client — filters/search/sort on canonical presented data.
 * Genre/key chips are derived from real catalog values (no fixture lists).
 */
export function BeatsCatalogClient({
  beats,
  initialQuery = "",
}: BeatsCatalogClientProps) {
  const t = useTranslations("common.beatsCatalogClient");
  const tCount = useTranslations("beats.count");
  const [query, setQuery] = useState(initialQuery);
  const [genres, setGenres] = useState<string[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [bpmFilterActive, setBpmFilterActive] = useState(false);
  const [bpmMin, setBpmMin] = useState(
    () => catalogBpmBoundsFromBeats(beats).min,
  );
  const [bpmMax, setBpmMax] = useState(
    () => catalogBpmBoundsFromBeats(beats).max,
  );
  const [sort, setSort] = useState<SortId>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const portalReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const filtersTriggerRef = useRef<HTMLButtonElement | null>(null);
  const filtersPanelRef = useRef<HTMLDivElement | null>(null);
  const filtersDialogId = "beats-catalog-filters-dialog";

  const closeFiltersSheet = useCallback(() => {
    setFiltersOpen(false);
  }, []);

  // Mobile filter sheet: portal outside AppShell, inert shell chrome, trap focus.
  useEffect(() => {
    if (!filtersOpen || !portalReady) return;
    const panel = filtersPanelRef.current;
    const trigger = filtersTriggerRef.current;
    if (!panel) return;
    const restoreShell = setAppShellInert(true);
    const dispose = attachModalFocusTrap(panel, { onClose: closeFiltersSheet });
    return () => {
      dispose();
      restoreShell();
      trigger?.focus();
    };
  }, [filtersOpen, portalReady, closeFiltersSheet]);

  const genreOptions = useMemo(() => catalogGenresFromBeats(beats), [beats]);
  const keyOptions = useMemo(() => catalogKeysFromBeats(beats), [beats]);
  const bpmBounds = useMemo(
    () => catalogBpmBoundsFromBeats(beats),
    [beats],
  );

  const filtered = useMemo(() => {
    const chipFiltered = filterPresentedBeatsCatalogByChips(beats, {
      genres,
      keys,
      bpmFilterActive,
      bpmMin,
      bpmMax,
    });
    const list = filterPresentedBeatsCatalogByQuery(chipFiltered, query);
    return sortPresentedBeatsCatalog(list, sort);
  }, [beats, query, genres, keys, bpmFilterActive, bpmMin, bpmMax, sort]);

  const liveResultStatus = beatsCatalogResultStatusMessage(
    filtered.length,
    beats.length,
    {
      empty: tCount("emptyStatus"),
      count: (n) => tCount("count", { count: n }),
      ofTotal: (label, total) => tCount("ofTotal", { label, total }),
    },
  );

  const activeFilterCount = countActiveCatalogChipFilters({
    genres,
    keys,
    bpmFilterActive,
  });

  function clearFilters() {
    setGenres([]);
    setKeys([]);
    setBpmFilterActive(false);
    setBpmMin(bpmBounds.min);
    setBpmMax(bpmBounds.max);
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
      genreOptions={genreOptions}
      keyOptions={keyOptions}
      genres={genres}
      keys={keys}
      bpmMin={bpmFilterActive ? bpmMin : bpmBounds.min}
      bpmMax={bpmFilterActive ? bpmMax : bpmBounds.max}
      bpmRangeMin={bpmBounds.min}
      bpmRangeMax={Math.max(bpmBounds.max, bpmBounds.min)}
      onToggleGenre={(g) => toggleIn(g, genres, setGenres)}
      onToggleKey={(k) => toggleIn(k, keys, setKeys)}
      onBpmMin={(n) => {
        setBpmFilterActive(true);
        setBpmMin(n);
      }}
      onBpmMax={(n) => {
        setBpmFilterActive(true);
        setBpmMax(n);
      }}
      onClear={clearFilters}
      activeCount={activeFilterCount}
    />
  );

  return (
    <div className="space-y-4">
      {/*
        Background (not the dialog overlay) is inert while the mobile sheet is open
        so AT / pointer cannot reach catalog chrome behind aria-modal.
        Overlay stays a sibling — never inert the dialog host.
      */}
      <div
        data-beats-catalog-background=""
        inert={filtersOpen ? true : undefined}
      >
        <div className="space-y-2.5">
          <label htmlFor="beats-search" className="sr-only">
            {t("szukajBitow")}
          </label>
          <input
            id="beats-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("szukajBituProducentaGatunku")}
            autoComplete="off"
            className="min-h-11 w-full border-b border-[var(--brd-line)] bg-transparent px-0 py-2.5 text-[15px] text-[var(--brd-ink)] placeholder:text-[var(--brd-mute)] outline-none focus-visible:border-[var(--brd-green)]"
          />

          <div className="flex flex-wrap items-center gap-2 lg:hidden">
            <button
              ref={filtersTriggerRef}
              type="button"
              aria-expanded={filtersOpen}
              aria-haspopup="dialog"
              aria-controls={filtersDialogId}
              onClick={() => setFiltersOpen(true)}
              className="inline-flex min-h-11 items-center border-b border-[var(--brd-line)] px-0.5 text-sm text-[var(--brd-ink)]"
            >
              {t("filtry")}{activeFilterCount ? ` (${activeFilterCount})` : ""}
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
              <div
                className="sr-only"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {liveResultStatus}
              </div>
              <p
                className="brd-meta text-[11px] tracking-[0.04em] text-[var(--brd-mute)]"
                aria-hidden
              >
                {tCount("count", { count: filtered.length })}
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
                <p className="brd-display text-xl font-semibold">{t("cicho")}</p>
                <p className="mt-2 text-sm text-[var(--brd-mute)]">
                  {t("brakBitowDlaTych")}
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
                    {t("wyczyscWszystko")}
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
      </div>

      {filtersOpen && portalReady
        ? createPortal(
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                type="button"
                className="absolute inset-0 bg-[color-mix(in_srgb,var(--brd-ink)_40%,transparent)]"
                aria-label={t("zamknijFiltry")}
                onClick={closeFiltersSheet}
              />
              <div
                ref={filtersPanelRef}
                id={filtersDialogId}
                role="dialog"
                aria-modal="true"
                aria-label={t("filtryKatalogu")}
                tabIndex={-1}
                className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto border-t border-[var(--brd-line)] bg-[var(--brd-paper)] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 outline-none"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-[var(--brd-mute)]">
                    {t("filtry")}
                  </p>
                  <button
                    type="button"
                    className="min-h-11 px-1 text-sm text-[var(--brd-mute)]"
                    onClick={closeFiltersSheet}
                  >
                    {t("zamknij")}
                  </button>
                </div>
                {filterPanel}
                <button
                  type="button"
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center bg-[var(--brd-green)] text-sm text-[var(--brd-paper)]"
                  onClick={closeFiltersSheet}
                >
                  {t("pokazWyniki")}{filtered.length})
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
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
  const t = useTranslations("common.beatsCatalogClient");
  return (
    <label className="inline-flex items-center gap-2 text-sm text-[var(--brd-ink-soft)]">
      <span className="text-xs font-medium text-[var(--brd-mute)]">
        {t("sortuj")}
      </span>
      <select
        value={sort}
        onChange={(e) => onChange(e.target.value as SortId)}
        className="min-h-11 border-0 border-b border-[var(--brd-line)] bg-transparent py-1 pl-0 pr-1 text-sm text-[var(--brd-ink)] outline-none focus-visible:border-[var(--brd-green)]"
      >
        <option value="newest">{t("najnowsze")}</option>
        <option value="featured">{t("polecane")}</option>
        <option value="listened">{t("najczesciejSluchane")}</option>
      </select>
    </label>
  );
}

function FilterPanel({
  genreOptions,
  keyOptions,
  genres,
  keys,
  bpmMin,
  bpmMax,
  bpmRangeMin,
  bpmRangeMax,
  onToggleGenre,
  onToggleKey,
  onBpmMin,
  onBpmMax,
  onClear,
  activeCount,
}: {
  genreOptions: string[];
  keyOptions: string[];
  genres: string[];
  keys: string[];
  bpmMin: number;
  bpmMax: number;
  bpmRangeMin: number;
  bpmRangeMax: number;
  onToggleGenre: (g: string) => void;
  onToggleKey: (k: string) => void;
  onBpmMin: (n: number) => void;
  onBpmMax: (n: number) => void;
  onClear: () => void;
  activeCount: number;
}) {
  const t = useTranslations("common.beatsCatalogClient");
  return (
    <div className="space-y-0">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-[var(--brd-mute)]">
          {t("filtry")}
        </p>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-[var(--brd-green)] hover:underline"
          >
            {t("wyczysc")}
          </button>
        ) : null}
      </div>

      <FilterGroup title={t("gatunek")}>
        {genreOptions.length === 0 ? (
          <p className="text-[12px] text-[var(--brd-mute)]">
            {t("brakGatunkowWKatalogu")}
          </p>
        ) : (
          genreOptions.map((g) => (
            <CheckRow
              key={g}
              label={g}
              checked={genres.includes(g)}
              onChange={() => onToggleGenre(g)}
            />
          ))
        )}
      </FilterGroup>

      <FilterGroup title={t("bpm")}>
        <div className="space-y-2 pt-0.5">
          <p className="brd-meta text-[11px] tabular-nums text-[var(--brd-ink-soft)]">
            {bpmMin}–{bpmMax}
          </p>
          <label className="block">
            <span className="sr-only">{t("bpmMin")}</span>
            <input
              type="range"
              min={bpmRangeMin}
              max={bpmRangeMax}
              value={bpmMin}
              onChange={(e) =>
                onBpmMin(Math.min(Number(e.target.value), bpmMax))
              }
              className="brd-scrub w-full"
            />
          </label>
          <label className="block">
            <span className="sr-only">{t("bpmMax")}</span>
            <input
              type="range"
              min={bpmRangeMin}
              max={bpmRangeMax}
              value={bpmMax}
              onChange={(e) =>
                onBpmMax(Math.max(Number(e.target.value), bpmMin))
              }
              className="brd-scrub w-full"
            />
          </label>
        </div>
      </FilterGroup>

      <FilterGroup title={t("tonacja")}>
        {keyOptions.length === 0 ? (
          <p className="text-[12px] text-[var(--brd-mute)]">
            {t("brakTonacjiWKatalogu")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {keyOptions.map((k) => (
              <CheckRow
                key={k}
                label={k}
                checked={keys.includes(k)}
                onChange={() => onToggleKey(k)}
                compact
              />
            ))}
          </div>
        )}
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
  const titleId = useId();
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="space-y-1.5 border-t border-[var(--brd-line)] py-3.5 first:border-t-0 first:pt-0"
    >
      <p
        id={titleId}
        className="text-xs font-medium text-[var(--brd-mute)]"
      >
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
