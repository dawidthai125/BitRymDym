"use client";

/**
 * Gaps P1 #5 — vocal cleanup (noise + room reverb) per take, in the Mix step.
 * Queue an E3 job (daily plan quota), A/B the result (local preview player), then use the
 * cleaned version in the mix (one applied per take; engine re-resolves that take's source).
 */
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { emitStudioTakeSourceChanged } from "@/lib/studio/cleanup/cleanup-events";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

type Job = {
  id: string; takeId: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  settings: { noise: number; reverb: number }; metrics: { noiseReductionDb: number } | null;
  errorCode: string | null; applied: boolean; createdAt: string;
};
type State = { available: boolean; perDay: number; usedToday: number; jobs: Job[] };
type Take = { takeId: string; label: string };

const pct = (v: number) => Math.round(v * 100);

export function StudioVocalCleanup({ doc }: { doc: StudioProjectDocument }) {
  const t = useTranslations("studio.cleanup");
  const projectId = doc.project.id;
  const base = `/api/studio/projects/${projectId}/cleanup`;
  const [st, setSt] = useState<State | null>(null);
  const [settings, setSettings] = useState<Record<string, { noise: number; reverb: number }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const takes = useMemo<Take[]>(() => {
    const seen = new Map<string, Take>();
    for (const clip of doc.clips) {
      if (clip.sourceKind !== "TAKE" || !clip.sourceTakeId || seen.has(clip.sourceTakeId)) continue;
      const track = doc.tracks.find((tr) => tr.id === clip.trackId);
      seen.set(clip.sourceTakeId, { takeId: clip.sourceTakeId, label: `${track?.name ?? t("take")} · ${seen.size + 1}` });
    }
    return [...seen.values()];
  }, [doc.clips, doc.tracks, t]);

  const apply = useCallback((j: (Partial<State> & { success?: boolean }) | null) => {
    if (!j?.success) return;
    setSt({ available: j.available !== false, perDay: j.perDay ?? 0, usedToday: j.usedToday ?? 0, jobs: j.jobs ?? [] });
  }, []);
  const load = useCallback(() => fetch(base).then((r) => r.json()).then(apply).catch(() => undefined), [base, apply]);
  const pending = !!st?.jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    let alive = true;
    const tick = () => fetch(base).then((r) => r.json()).then((j) => { if (alive) apply(j); }).catch(() => undefined);
    void tick();
    const id = pending ? window.setInterval(tick, 3000) : null;
    return () => { alive = false; if (id) window.clearInterval(id); };
  }, [base, apply, pending]);
  useEffect(() => () => audioRef.current?.pause(), []);

  if (!st || !st.available || takes.length === 0) return null;
  const left = Math.max(0, st.perDay - st.usedToday);

  async function run(takeId: string) {
    setBusy(takeId); setMsg(null);
    const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ takeId, settings: settings[takeId] ?? { noise: 0.6, reverb: 0.4 } }) });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) setMsg(t(`error.${j?.error === "daily_limit" || j?.error === "in_progress" || j?.error === "take_unavailable" ? j.error : "generic"}`));
    await load(); setBusy(null);
  }

  async function use(takeId: string, jobId: string | null) {
    setBusy(takeId); setMsg(null);
    const res = await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ takeId, jobId }) });
    if (res.ok) emitStudioTakeSourceChanged(takeId); else setMsg(t("error.generic"));
    await load(); setBusy(null);
  }

  async function preview(takeId: string, jobId: string | null) {
    const key = `${takeId}:${jobId ?? "orig"}`;
    audioRef.current?.pause();
    if (playing === key) { setPlaying(null); return; }
    const r = jobId
      ? await fetch(`/api/studio/cleanup/source?takeId=${takeId}&jobId=${jobId}`).then((x) => x.json()).catch(() => null)
      : await fetch("/api/takes/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ takeId }) }).then((x) => x.json()).catch(() => null);
    if (!r?.url) { setMsg(t("error.generic")); return; }
    const a = audioRef.current;
    if (!a) return;
    a.src = r.url;
    setPlaying(key);
    await a.play().catch(() => setPlaying(null));
  }

  return (
    <section data-testid="studio-cleanup" className="space-y-3 rounded-xl border border-[var(--brd-line)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("title")}</h3>
        <span data-testid="studio-cleanup-quota" className="text-xs text-[var(--brd-mute)]">{t("quota", { left, perDay: st.perDay })}</span>
      </div>
      <p className="text-xs text-[var(--brd-mute)]">{t("intro")}</p>
      <audio ref={audioRef} hidden preload="none" onEnded={() => setPlaying(null)} />
      <ul className="space-y-3">
        {takes.map(({ takeId, label }) => {
          const jobs = st.jobs.filter((j) => j.takeId === takeId);
          const last = jobs[0];
          const done = jobs.find((j) => j.status === "succeeded");
          const applied = jobs.find((j) => j.applied);
          const s = settings[takeId] ?? last?.settings ?? { noise: 0.6, reverb: 0.4 };
          const inFlight = last?.status === "queued" || last?.status === "running";
          return (
            <li key={takeId} data-testid={`studio-cleanup-take-${takeId}`} className="space-y-2 rounded-lg bg-[var(--brd-paper)] p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs" aria-live="polite" data-testid="studio-cleanup-status">
                  {inFlight ? t(`status.${last!.status}`) : applied ? t("status.applied") : done ? t("status.ready", { db: done.metrics?.noiseReductionDb ?? 0 }) : last?.status === "failed" ? t("status.failed") : ""}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(["noise", "reverb"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0">{t(`slider.${k}`)}</span>
                    <input type="range" min={0} max={100} step={5} value={pct(s[k])} className="min-h-9 flex-1" data-testid={`studio-cleanup-${k}`}
                      onChange={(e) => setSettings((p) => ({ ...p, [takeId]: { ...s, [k]: Number(e.target.value) / 100 } }))} />
                    <span className="w-9 text-right tabular-nums">{pct(s[k])}%</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" className="min-h-9" data-testid="studio-cleanup-run" disabled={busy === takeId || inFlight || left === 0} onClick={() => void run(takeId)}>
                  {done ? t("rerun") : t("run")}
                </Button>
                {done ? (
                  <>
                    <Button type="button" size="sm" variant="outline" className="min-h-9" data-testid="studio-cleanup-ab-before" aria-pressed={playing === `${takeId}:orig`} onClick={() => void preview(takeId, null)}>{t("ab.before")}</Button>
                    <Button type="button" size="sm" variant="outline" className="min-h-9" data-testid="studio-cleanup-ab-after" aria-pressed={playing === `${takeId}:${done.id}`} onClick={() => void preview(takeId, done.id)}>{t("ab.after")}</Button>
                    <label className="flex min-h-9 items-center gap-2 text-xs">
                      <input type="checkbox" data-testid="studio-cleanup-use" checked={!!applied} disabled={busy === takeId} onChange={(e) => void use(takeId, e.target.checked ? done.id : null)} />
                      {t("use")}
                    </label>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {left === 0 ? <p data-testid="studio-cleanup-limit" className="text-xs text-[var(--brd-mute)]">{t("limitReached")}</p> : null}
      {st.jobs.some((j) => j.applied) ? <p className="text-xs text-[var(--brd-mute)]">{t("remaster")}</p> : null}
      {msg ? <p role="status" className="text-xs text-[var(--brd-amber)]">{msg}</p> : null}
    </section>
  );
}
