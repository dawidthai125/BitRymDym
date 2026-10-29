/**
 * Pluggable recognition providers. own_catalog is required; external
 * providers are optional and must return not_configured when keys are missing.
 * Paid providers (AudD, ACRCloud) are backlog — see docs/architecture/UPLOAD_FILTER.md.
 */
import { compareFingerprints } from "@/lib/beats/auto-check/fingerprint";
import type { RecognitionMatch, RecognitionProviderResult } from "@/lib/beats/auto-check/types";

export type RecognitionContext = {
  beatId: string;
  ownerId: string;
  durationSeconds: number;
  rawFingerprint: number[];
  /** fpcalc compressed fingerprint (AcoustID lookup format). */
  compressedFingerprint: string;
};

export interface RecognitionProvider {
  readonly name: string;
  readonly required: boolean;
  recognize(ctx: RecognitionContext): Promise<RecognitionProviderResult>;
}

export type CatalogFingerprint = { beatId: string; ownerId: string; title: string | null; fingerprint: number[] };

export function createOwnCatalogProvider(deps: {
  loadCatalog: (excludeBeatId: string) => Promise<CatalogFingerprint[]>;
  minScore?: number;
}): RecognitionProvider {
  return {
    name: "own_catalog",
    required: true,
    async recognize(ctx) {
      const catalog = await deps.loadCatalog(ctx.beatId);
      const matches: RecognitionMatch[] = [];
      for (const row of catalog) {
        // Same owner re-uploading own work is not infringement.
        if (row.ownerId === ctx.ownerId) continue;
        const m = compareFingerprints(ctx.rawFingerprint, row.fingerprint);
        if (m.score >= (deps.minScore ?? 0.3)) {
          matches.push({
            provider: "own_catalog",
            score: m.score,
            matchedSeconds: m.matchedSeconds,
            offsetSeconds: m.offsetSeconds,
            ref: row.beatId,
            title: row.title,
            url: `/admin/moderation/${row.beatId}`,
          });
        }
      }
      matches.sort((x, y) => y.score - x.score);
      return { provider: "own_catalog", required: true, outcome: matches.length ? "match" : "no_match", matches: matches.slice(0, 5) };
    },
  };
}

type AcoustIdResponse = {
  status?: string;
  error?: { message?: string };
  results?: Array<{
    id?: string;
    score?: number;
    recordings?: Array<{ id?: string; title?: string; artists?: Array<{ name?: string }> }>;
  }>;
};

export function parseAcoustIdResponse(body: AcoustIdResponse): RecognitionProviderResult {
  if (body.status !== "ok") {
    return { provider: "acoustid", required: false, outcome: "error", matches: [], errorCode: "acoustid_status" };
  }
  const matches: RecognitionMatch[] = [];
  for (const r of body.results ?? []) {
    const score = Number(r.score ?? 0);
    const rec = r.recordings?.[0];
    matches.push({
      provider: "acoustid",
      score: Math.round(score * 10000) / 10000,
      matchedSeconds: null,
      ref: rec?.id ?? r.id ?? null,
      title: rec?.title ?? null,
      artist: rec?.artists?.map((a) => a.name).filter(Boolean).join(", ") || null,
      url: rec?.id ? `https://musicbrainz.org/recording/${rec.id}` : r.id ? `https://acoustid.org/track/${r.id}` : null,
    });
  }
  matches.sort((x, y) => y.score - x.score);
  return { provider: "acoustid", required: false, outcome: matches.length ? "match" : "no_match", matches: matches.slice(0, 5) };
}

/** AcoustID lookup (fingerprint only — no audio leaves the host). */
export function createAcoustIdProvider(deps: {
  clientKey: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): RecognitionProvider {
  return {
    name: "acoustid",
    required: false,
    async recognize(ctx) {
      if (!deps.clientKey) {
        return { provider: "acoustid", required: false, outcome: "not_configured", matches: [] };
      }
      const form = new URLSearchParams({
        client: deps.clientKey,
        format: "json",
        meta: "recordings",
        duration: String(Math.round(ctx.durationSeconds)),
        fingerprint: ctx.compressedFingerprint,
      });
      try {
        const res = await (deps.fetchImpl ?? fetch)("https://api.acoustid.org/v2/lookup", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form,
          signal: AbortSignal.timeout(deps.timeoutMs ?? 20_000),
        });
        if (!res.ok) return { provider: "acoustid", required: false, outcome: "error", matches: [], errorCode: `acoustid_http_${res.status}` };
        return parseAcoustIdResponse((await res.json()) as AcoustIdResponse);
      } catch (e) {
        const timeout = e instanceof Error && e.name === "TimeoutError";
        return { provider: "acoustid", required: false, outcome: timeout ? "timeout" : "error", matches: [], errorCode: timeout ? "acoustid_timeout" : "acoustid_fetch" };
      }
    },
  };
}
