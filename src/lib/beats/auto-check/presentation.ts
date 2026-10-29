/** Pure view helpers for the moderation UI (upload filter). */
import type { AutoCheckStatus, RecognitionProviderResult, VocalResult } from "@/lib/beats/auto-check/types";

export type AutoCheckBadge = { label: string; tone: "neutral" | "ok" | "danger" | "warn" };

export function autoCheckBadge(
  check: { status: AutoCheckStatus; overridden_at: string | null; appeal_requested_at: string | null; error_code?: string | null } | null | undefined,
): AutoCheckBadge {
  if (!check) return { label: "Filtr: brak sprawdzenia", tone: "warn" };
  if (check.overridden_at) return { label: "Filtr: uchylony przez moderatora", tone: "neutral" };
  const appeal = check.appeal_requested_at ? " · odwołanie" : "";
  switch (check.status) {
    case "pending":
      return { label: "Filtr: w kolejce", tone: "neutral" };
    case "running":
      return { label: "Filtr: w toku", tone: "neutral" };
    case "passed":
      return { label: "Filtr: OK", tone: "ok" };
    case "rejected_vocals":
      return { label: `Filtr: wokal${appeal}`, tone: "danger" };
    case "rejected_match":
      return { label: `Filtr: dopasowanie${appeal}`, tone: "danger" };
    case "error":
      return { label: check.error_code === "needs_config" ? "Filtr: brak konfiguracji" : "Filtr: błąd", tone: "warn" };
  }
}

export const PROVIDER_LABELS_PL: Record<string, string> = {
  own_catalog: "Własny katalog (Chromaprint)",
  acoustid: "AcoustID",
  vocals: "Detekcja wokalu (Demucs)",
};

export const OUTCOME_LABELS_PL: Record<string, string> = {
  ok: "OK",
  match: "dopasowanie",
  no_match: "brak dopasowań",
  not_configured: "nieskonfigurowany",
  error: "błąd",
  timeout: "przekroczony czas",
  skipped: "pominięty",
};

export function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Merge consecutive 1 s vocal windows into ranges like "0:12–0:18". */
export function vocalRanges(windows: VocalResult["windows"], max = 8): string[] {
  const sorted = [...windows].sort((a, b) => a.startSeconds - b.startSeconds);
  const ranges: Array<[number, number]> = [];
  for (const w of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && w.startSeconds <= last[1] + 1) last[1] = Math.max(last[1], w.endSeconds);
    else ranges.push([w.startSeconds, w.endSeconds]);
  }
  return ranges.slice(0, max).map(([a, b]) => `${formatSeconds(a)}–${formatSeconds(b)}`);
}

export function readCheckResults(results: unknown): { recognition: RecognitionProviderResult[]; vocal: VocalResult | null } {
  const r = (results ?? {}) as { recognition?: unknown; vocal?: unknown };
  return {
    recognition: Array.isArray(r.recognition) ? (r.recognition as RecognitionProviderResult[]) : [],
    vocal: r.vocal && typeof r.vocal === "object" ? (r.vocal as VocalResult) : null,
  };
}

/** Only http(s) links or same-site paths are rendered as links. */
export function safeMatchHref(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return /^https:\/\/(musicbrainz\.org|acoustid\.org)\//.test(url) ? url : null;
}
