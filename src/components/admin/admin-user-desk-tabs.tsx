"use client";

import { useTranslations } from "next-intl";
import Link from "@/components/ui/app-link";
import { useMemo, useState } from "react";

import type { AdminUserDesk } from "@/lib/admin/user-desk";
import { labelBeatStatus, labelTakeStatus } from "@/lib/ui/labels";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  date: string | null;
  extra?: string;
  href?: string;
};

type TabId = "projects" | "takes" | "songs" | "beats" | "jobs" | "payments";

const JOB_STATUS: Record<string, string> = {
  queued: "W kolejce",
  running: "W toku",
  done: "Gotowe",
  succeeded: "Gotowe",
  ready: "Gotowe",
  failed: "Nieudane",
  cancelled: "Anulowane",
};
const PAY_STATUS: Record<string, string> = {
  pending: "Oczekuje",
  paid: "Opłacone",
  failed: "Nieudane",
  cancelled: "Anulowane",
  refunded: "Zwrócone",
};
const PROJECT_STATUS: Record<string, string> = { ACTIVE: "Aktywny", ARCHIVED: "Zarchiwizowany", DRAFT: "Szkic" };

function day(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeZone: "Europe/Warsaw" }).format(new Date(iso));
}

function beatHref(row: { id: string; status: string | null; ownershipType: string | null }): string | undefined {
  if (row.ownershipType === "PLATFORM") return `/admin/beats/${row.id}`;
  if (row.ownershipType === "USER" && (row.status === "PENDING_REVIEW" || row.status === "APPROVED")) return `/admin/moderation/${row.id}`;
  if (row.status === "PUBLISHED") return `/beat/${row.id}`;
  return undefined;
}

/** Everything a user owns, one tab per kind, each with a text search and a status filter. */
export function AdminUserDeskTabs({ desk }: { desk: Pick<AdminUserDesk, "projects" | "takes" | "songs" | "beats" | "exports" | "payments"> }) {
  const t = useTranslations("admin.userDesk");
  const tabs = useMemo(() => {
    const short = (id: string) => id.slice(0, 8);
    const money = (g: number | null, c: string | null) =>
      g == null ? "—" : new Intl.NumberFormat("pl-PL", { style: "currency", currency: c || "PLN" }).format(g / 100);
    const projects: Row[] = desk.projects.map((p) => ({
      id: p.id,
      title: p.title || short(p.id),
      status: p.status ?? "—",
      statusLabel: PROJECT_STATUS[p.status ?? ""] ?? p.status ?? "—",
      date: p.updatedAt,
      extra: t("utworzono", { kiedy: day(p.createdAt) }),
    }));
    const takes: Row[] = desk.takes.map((r) => ({
      id: r.id,
      title: r.title || short(r.id),
      status: r.status ?? "—",
      statusLabel: labelTakeStatus(r.status ?? "") === "—" ? (r.status ?? "—") : labelTakeStatus(r.status ?? ""),
      date: r.createdAt,
      extra: r.durationSeconds != null ? `${Math.round(r.durationSeconds)} s` : undefined,
    }));
    const songs: Row[] = desk.songs.map((s) => ({
      id: s.id,
      title: s.title || short(s.projectId),
      status: s.catalog ?? "private",
      statusLabel: s.catalog === "published" ? t("wKatalogu") : s.catalog === "withdrawn" ? t("wycofany") : t("prywatny"),
      date: s.createdAt,
      extra: s.paidWithCredit ? t("zPakietu") : undefined,
    }));
    const beats: Row[] = desk.beats.map((b) => ({
      id: b.id,
      title: b.title || short(b.id),
      status: b.status ?? "—",
      statusLabel: labelBeatStatus(b.status ?? "") === "—" ? (b.status ?? "—") : labelBeatStatus(b.status ?? ""),
      date: b.createdAt,
      extra: b.ownershipType === "PLATFORM" ? t("bitPlatformy") : undefined,
      href: beatHref(b),
    }));
    const jobs: Row[] = desk.exports.map((j) => ({
      id: j.id,
      title: t(`rodzaj.${j.kind === "youtube_video" ? "video" : j.kind === "master" ? "master" : "inne"}`),
      status: j.status ?? "—",
      statusLabel: JOB_STATUS[j.status ?? ""] ?? j.status ?? "—",
      date: j.createdAt,
      extra: j.projectId ? desk.projects.find((p) => p.id === j.projectId)?.title ?? short(j.projectId) : undefined,
    }));
    const payments: Row[] = desk.payments.map((p) => ({
      id: p.id,
      title: p.product || "—",
      status: p.status ?? "—",
      statusLabel: PAY_STATUS[p.status ?? ""] ?? p.status ?? "—",
      date: p.createdAt,
      extra: money(p.amountGrosz, p.currency),
    }));
    return [
      { id: "projects" as TabId, rows: projects },
      { id: "takes" as TabId, rows: takes },
      { id: "songs" as TabId, rows: songs },
      { id: "beats" as TabId, rows: beats },
      { id: "jobs" as TabId, rows: jobs },
      { id: "payments" as TabId, rows: payments },
    ];
  }, [desk, t]);

  const [active, setActive] = useState<TabId>("projects");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const tab = tabs.find((x) => x.id === active) ?? tabs[0];
  const statuses = [...new Map(tab.rows.map((r) => [r.status, r.statusLabel])).entries()];
  const needle = q.trim().toLowerCase();
  const shown = tab.rows.filter(
    (r) => (!status || r.status === status) && (!needle || `${r.title} ${r.extra ?? ""} ${r.id}`.toLowerCase().includes(needle)),
  );

  return (
    <section aria-labelledby="desk-tabs" className="rounded-lg border border-[var(--brd-line)]">
      <h2 id="desk-tabs" className="sr-only">{t("zawartosc")}</h2>
      <div role="tablist" aria-label={t("zawartosc")} className="flex gap-1 overflow-x-auto border-b border-[var(--brd-line)] px-2 pt-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === active}
            onClick={() => {
              setActive(x.id);
              setStatus("");
            }}
            className={cn(
              "-mb-px flex min-h-11 shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 text-sm transition-colors",
              x.id === active
                ? "border-[var(--brd-amber)] font-semibold text-[var(--brd-ink)]"
                : "border-transparent text-[var(--brd-ink-soft)] hover:text-[var(--brd-ink)]",
            )}
          >
            {t(`zakladka.${x.id}`)}
            <span className="rounded-full bg-[var(--brd-paper-deep)] px-2 py-0.5 font-mono text-xs tabular-nums">{x.rows.length}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("szukajWZakladce")}
            aria-label={t("szukajWZakladce")}
            className="min-h-10 min-w-[14rem] flex-1 rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3 text-sm outline-none focus-visible:border-[var(--brd-amber)]"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t("status")}
            className="min-h-10 rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3 text-sm"
          >
            <option value="">{t("wszystkieStatusy")}</option>
            {statuses.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <span className="text-sm text-[var(--brd-ink-soft)]">{t("pokazano", { n: shown.length, total: tab.rows.length })}</span>
        </div>

        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--brd-ink-soft)]">{tab.rows.length ? t("brakWynikow") : t("pusto")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.06em] text-[var(--brd-ink-soft)]">
                <tr className="border-b border-[var(--brd-line)]">
                  <th className="py-2 pr-3 font-medium">{t("kolNazwa")}</th>
                  <th className="py-2 pr-3 font-medium">{t("status")}</th>
                  <th className="py-2 pr-3 font-medium">{t("kolSzczegoly")}</th>
                  <th className="py-2 pr-3 font-medium">{t("kolData")}</th>
                  <th className="py-2 font-medium">ID</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--brd-line)] last:border-0 hover:bg-[var(--brd-paper-deep)]/50">
                    <td className="py-2.5 pr-3 font-medium">
                      {r.href ? (
                        <Link href={r.href} className="hover:text-[var(--brd-amber)] hover:underline">
                          {r.title}
                        </Link>
                      ) : (
                        r.title
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="rounded-full border border-[var(--brd-line)] px-2 py-0.5 text-xs">{r.statusLabel}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-[var(--brd-ink-soft)]">{r.extra ?? "—"}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-[var(--brd-ink-soft)]">{day(r.date)}</td>
                    <td className="py-2.5 font-mono text-xs text-[var(--brd-mute)]" title={r.id}>
                      {r.id.slice(0, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
