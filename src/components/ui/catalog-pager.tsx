"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { CATALOG_PAGE_PARAM, catalogPageHref, pagerItems, parseCatalogPage } from "@/lib/ui/paginate";
import { cn } from "@/lib/utils";

/** Page links under a catalogue list: real addresses, switched without a reload. */
export function CatalogPager({ page, pages, query, onPage }: { page: number; pages: number; /** Other query parameters to keep. */ query: string; onPage: (page: number) => void }) {
  const t = useTranslations("common.catalogPager");
  // The address always names the page on screen (also after a filter went back to page 1).
  useEffect(() => {
    if (parseCatalogPage(new URLSearchParams(window.location.search).get(CATALOG_PAGE_PARAM)) === page) return;
    const search = catalogPageHref(query, page);
    window.history.replaceState(null, "", `${window.location.pathname}${search === "?" ? "" : search}${window.location.hash}`);
  }, [page, query]);
  if (pages <= 1) return null;
  const link = (target: number, label: string, aria: string, rel?: string) => (
    <a
      href={catalogPageHref(query, target)}
      rel={rel}
      aria-label={aria}
      aria-current={target === page && !rel ? "page" : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        // A "#sample" in the address belongs to the page being left.
        if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
        onPage(target);
      }}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center border px-3 text-sm tabular-nums",
        target === page && !rel
          ? "border-[var(--brd-ink)] bg-[var(--brd-ink)] text-[var(--brd-paper)]"
          : "border-[var(--brd-line)] text-[var(--brd-ink)] hover:border-[var(--brd-ink)]",
      )}
    >
      {label}
    </a>
  );
  return (
    <nav aria-label={t("aria")} className="mt-6" data-testid="catalog-pager">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {page > 1 ? <li>{link(page - 1, t("poprzednia"), t("poprzedniaAria"), "prev")}</li> : null}
        {pagerItems(page, pages).map((p, i) => (
          <li key={p || `gap-${i}`}>{p ? link(p, String(p), t("stronaAria", { page: p, pages })) : <span aria-hidden>…</span>}</li>
        ))}
        {page < pages ? <li>{link(page + 1, t("nastepna"), t("nastepnaAria"), "next")}</li> : null}
      </ul>
    </nav>
  );
}
