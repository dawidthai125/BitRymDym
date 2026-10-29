import { getLibText } from "@/i18n/get-lib-text";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminBeatPlayButton } from "@/components/admin/admin-beat-play-button";
import { AdminBeatQuickEdit } from "@/components/admin/admin-beat-quick-edit";
import { buttonVariants } from "@/components/ui/button";
import { checkAccess } from "@/lib/auth/access-denial";
import {
  ADMIN_BEATS_PAGE_SIZES,
  ADMIN_BEATS_SORT_COLUMNS,
  adminBeatsHref,
  adminBeatsToggleSort,
  parseAdminBeatsQuery,
  type AdminBeatsQuery,
  type AdminBeatsSortKey,
} from "@/lib/beats/admin-catalogue-query";
import { formatDurationSeconds } from "@/lib/beats/public";
import {
  listPlatformBeatCatalogueForAdmin,
  requireAdminPlatformBeatsAccess,
  type AdminBeatCatalogueItem,
} from "@/lib/beats/service";
import { labelBeatStatus } from "@/lib/ui/labels";
import { cn } from "@/lib/utils";
import { BEAT_STATUSES } from "@/types/domain";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SORT_KEYS = Object.keys(ADMIN_BEATS_SORT_COLUMNS) as AdminBeatsSortKey[];

function pageWindow(page: number, pageCount: number): number[] {
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  const end = Math.min(pageCount, start + 4);
  const out: number[] = [];
  for (let p = start; p <= end; p += 1) out.push(p);
  return out;
}

const fieldClass =
  "min-h-10 rounded-lg border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3 text-sm";

export default async function AdminBeatsListPage({ searchParams }: PageProps) {
  const tl = await getLibText();
  const t = await getTranslations("admin.adminBeatsPage");
  const tc = await getTranslations("admin.adminBeatsCatalogue");
  const locale = await getLocale();
  // The layout gate does not stop this page from rendering, and its role check
  // is narrower than this guard (no `beats.edit`), so handle the denial here.
  const denial = await checkAccess(requireAdminPlatformBeatsAccess);
  if (denial === "UNAUTHENTICATED") redirect("/sign-in");
  if (denial === "FORBIDDEN") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">{t("brakDostepu")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("brakUprawnieniaDoEdycji")}
        </p>
      </main>
    );
  }

  const raw = await searchParams;
  const query = parseAdminBeatsQuery(raw);
  const editId = typeof raw.edit === "string" ? raw.edit : null;
  const result = await listPlatformBeatCatalogueForAdmin(query);
  const current: AdminBeatsQuery = { ...query, page: result.page };

  const dateFmt = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
  const first = result.total === 0 ? 0 : (result.page - 1) * query.size + 1;
  const last = Math.min(result.total, result.page * query.size);

  const sortLabel = (key: AdminBeatsSortKey) => tc(`sort.${key}`);

  const sortHeader = (sortKey: AdminBeatsSortKey, className?: string) => {
    const active = current.sort === sortKey;
    const arrow = active ? (current.dir === "asc" ? "↑" : "↓") : "";
    return (
      <th
        key={sortKey}
        scope="col"
        aria-sort={active ? (current.dir === "asc" ? "ascending" : "descending") : "none"}
        className={cn("px-2 py-2 text-left font-medium", className)}
      >
        <Link
          href={adminBeatsHref(current, adminBeatsToggleSort(current, sortKey))}
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap hover:text-[var(--brd-ink)]",
            active && "text-[var(--brd-ink)]",
          )}
        >
          {sortLabel(sortKey)}
          <span aria-hidden className="w-2 text-[10px]">{arrow}</span>
        </Link>
      </th>
    );
  };

  const statusBadge = (beat: AdminBeatCatalogueItem) => (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap",
        beat.status === "PUBLISHED"
          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
          : "border-[var(--brd-line)] text-[var(--brd-mute)]",
      )}
    >
      {tl(labelBeatStatus(beat.status))}
    </span>
  );

  const keyLabel = (beat: AdminBeatCatalogueItem) =>
    [beat.key, beat.scale].filter(Boolean).join(" ") || "—";

  return (
    <main className="mx-auto flex w-full max-w-[var(--brd-max-ops)] flex-col gap-6 px-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--brd-line)] pb-6">
        <div className="space-y-2">
          <p className="brd-meta text-[11px] uppercase tracking-[0.2em] text-[var(--brd-mute)]">
            {t("panelAdministracyjny")}
          </p>
          <h1 className="brd-display text-3xl font-semibold tracking-tight">
            {tc("katalogBitow")}
          </h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
            {tc("opis")}
          </p>
        </div>
        <Link href="/admin/beats/new" className={cn(buttonVariants())}>
          {t("nowyBit")}
        </Link>
      </header>

      <form
        method="get"
        action="/admin/beats"
        className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end"
      >
        <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs text-[var(--brd-mute)] sm:w-64">
          {tc("szukaj")}
          <input
            type="search"
            name="q"
            defaultValue={query.q}
            maxLength={80}
            placeholder={tc("szukajPlaceholder")}
            className={fieldClass}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[var(--brd-mute)]">
          {tc("status")}
          <select name="status" defaultValue={query.status ?? ""} className={fieldClass}>
            <option value="">{tc("wszystkie")}</option>
            {BEAT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tl(labelBeatStatus(s))}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[var(--brd-mute)]">
          {tc("naStronie")}
          <select name="size" defaultValue={String(query.size)} className={fieldClass}>
            {ADMIN_BEATS_PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[var(--brd-mute)]">
          {tc("sortuj")}
          <select name="sort" defaultValue={query.sort} className={fieldClass}>
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {sortLabel(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[var(--brd-mute)]">
          {tc("kierunek")}
          <select name="dir" defaultValue={query.dir} className={fieldClass}>
            <option value="desc">{tc("malejaco")}</option>
            <option value="asc">{tc("rosnaco")}</option>
          </select>
        </label>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <button type="submit" className={cn(buttonVariants(), "min-h-10 flex-1 sm:flex-none")}>
            {tc("filtruj")}
          </button>
          {query.q || query.status ? (
            <Link
              href="/admin/beats"
              className={cn(buttonVariants({ variant: "outline" }), "min-h-10")}
            >
              {tc("wyczysc")}
            </Link>
          ) : null}
        </div>
      </form>

      <p className="text-xs text-[var(--brd-mute)] tabular-nums" aria-live="polite">
        {tc("zakres", { first, last, total: result.total })}
        {" · "}
        {tc("sortowanie", {
          by: sortLabel(current.sort),
          dir: current.dir === "asc" ? tc("rosnaco") : tc("malejaco"),
        })}
      </p>

      {result.rows.length === 0 ? (
        <p className="text-sm text-[var(--brd-mute)]">
          {query.q || query.status ? tc("brakWynikow") : t("brakBitowPlatformy")}
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-12" />
                <col />
                <col className="w-[14%]" />
                <col className="w-16" />
                <col className="w-20" />
                <col className="w-16" />
                <col className="w-[11%]" />
                <col className="w-28" />
                <col className="w-20" />
                <col className="w-28" />
                <col className="w-36" />
              </colgroup>
              <thead className="border-b border-[var(--brd-line)] text-xs text-[var(--brd-mute)]">
                <tr>
                  <th scope="col" className="px-2 py-2">
                    <span className="sr-only">{tc("odsluch")}</span>
                  </th>
                  {sortHeader("title")}
                  {sortHeader("producer")}
                  {sortHeader("bpm", "text-right")}
                  {sortHeader("key")}
                  {sortHeader("duration", "text-right")}
                  {sortHeader("genre")}
                  {sortHeader("status")}
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    {tc("pobrania")}
                  </th>
                  {sortHeader("uploaded")}
                  <th scope="col" className="px-2 py-2">
                    <span className="sr-only">{tc("akcje")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--brd-line)]">
                {result.rows.map((beat) => (
                  <tr key={beat.id} className="align-middle hover:bg-[var(--brd-paper-deep)]/40">
                    <td className="px-2 py-2">
                      <AdminBeatPlayButton
                        beatId={beat.id}
                        title={beat.title}
                        producer={beat.producer ?? ""}
                        durationSeconds={beat.durationSeconds}
                        disabled={!beat.activeMasterReady || beat.status !== "PUBLISHED"}
                      />
                    </td>
                    <td className="truncate px-2 py-2 font-medium" title={beat.title}>
                      <Link href={`/admin/beats/${beat.id}`} className="hover:underline">
                        {beat.title}
                      </Link>
                      {beat.tags.length > 0 ? (
                        <span className="block truncate text-[11px] font-normal text-[var(--brd-mute)]">
                          {beat.tags.join(", ")}
                        </span>
                      ) : null}
                    </td>
                    <td className="truncate px-2 py-2 text-[var(--brd-ink-soft)]">
                      {beat.producer ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{beat.bpm}</td>
                    <td className="truncate px-2 py-2">{keyLabel(beat)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatDurationSeconds(beat.durationSeconds)}
                    </td>
                    <td className="truncate px-2 py-2 text-[var(--brd-ink-soft)]">
                      {beat.genre ?? "—"}
                    </td>
                    <td className="px-2 py-2">{statusBadge(beat)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{beat.downloadCount}</td>
                    <td className="px-2 py-2 tabular-nums">{fmtDate(beat.createdAt)}</td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-1.5">
                        <AdminBeatQuickEdit beat={beat} defaultOpen={editId === beat.id} />
                        <Link
                          href={`/admin/beats/${beat.id}`}
                          className="inline-flex min-h-9 items-center px-1.5 text-xs text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
                        >
                          {tc("wiecej")}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet cards */}
          <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)] lg:hidden">
            {result.rows.map((beat) => (
              <li key={beat.id} className="flex min-w-0 gap-3 py-3">
                <div className="shrink-0 pt-0.5">
                  <AdminBeatPlayButton
                    beatId={beat.id}
                    title={beat.title}
                    producer={beat.producer ?? ""}
                    durationSeconds={beat.durationSeconds}
                    disabled={!beat.activeMasterReady || beat.status !== "PUBLISHED"}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <Link
                      href={`/admin/beats/${beat.id}`}
                      className="min-w-0 truncate font-medium hover:underline"
                    >
                      {beat.title}
                    </Link>
                    {statusBadge(beat)}
                  </div>
                  <p className="truncate text-xs text-[var(--brd-ink-soft)]">
                    {beat.producer ?? tc("brakAutora")}
                    {beat.genre ? ` · ${beat.genre}` : ""}
                  </p>
                  <p className="flex flex-wrap gap-x-3 text-xs text-[var(--brd-mute)] tabular-nums">
                    <span>{beat.bpm} BPM</span>
                    <span>{keyLabel(beat)}</span>
                    <span>{formatDurationSeconds(beat.durationSeconds)}</span>
                    <span>
                      {tc("pobraniaKrotko", { n: beat.downloadCount })}
                    </span>
                    <span>{fmtDate(beat.createdAt)}</span>
                  </p>
                  <div className="pt-1">
                    <AdminBeatQuickEdit beat={beat} defaultOpen={editId === beat.id} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {result.pageCount > 1 ? (
        <nav
          aria-label={tc("stronicowanie")}
          className="flex flex-wrap items-center justify-center gap-1 text-sm"
        >
          {result.page > 1 ? (
            <Link
              href={adminBeatsHref(current, { page: result.page - 1 })}
              className="inline-flex min-h-10 items-center rounded-md px-3 hover:bg-[var(--brd-paper-deep)]/50"
            >
              ← {tc("poprzednia")}
            </Link>
          ) : null}
          {pageWindow(result.page, result.pageCount).map((p) =>
            p === result.page ? (
              <span
                key={p}
                aria-current="page"
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-[var(--brd-line)] font-medium tabular-nums"
              >
                {p}
              </span>
            ) : (
              <Link
                key={p}
                href={adminBeatsHref(current, { page: p })}
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md tabular-nums hover:bg-[var(--brd-paper-deep)]/50"
              >
                {p}
              </Link>
            ),
          )}
          {result.page < result.pageCount ? (
            <Link
              href={adminBeatsHref(current, { page: result.page + 1 })}
              className="inline-flex min-h-10 items-center rounded-md px-3 hover:bg-[var(--brd-paper-deep)]/50"
            >
              {tc("nastepna")} →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
