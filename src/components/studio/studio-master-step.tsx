"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BitekBubble, BitekMood } from "@/components/studio/studio-bitek-dock";
import { StudioJobProgressBar as JobProgressBar } from "@/components/studio/studio-job-progress";
import { Button } from "@/components/ui/button";
import { StudioMasterReport } from "@/components/studio/studio-change-report";
import { buildBitekClientContext, type BitekClientContext } from "@/lib/studio/bitek/chat/client-context";
import { LockedAction } from "@/components/plans/locked-action";
import { minimumTierForDeliverFormat, type DeliverFormat, type DeliverKind } from "@/lib/studio/deliver/policy";
import { jobProgressOf, type JobProgress } from "@/lib/studio/master/progress";
import { joinParts, MASTER_RENDER_SAMPLE_RATE, renderApprovedMix, renderMasterPreview, stereoToAudioBuffer } from "@/lib/studio/master/client";
import type { MasterMetrics, Stereo } from "@/lib/studio/master/dsp";
import { DEFAULT_MASTER_SETTINGS, MASTER_SETTING_KEYS, MASTER_TARGET_IDS, MASTER_TARGETS, clampMasterSettings, isMasterTargetId, type MasterSettingKey, type MasterSettings, type MasterTargetId } from "@/lib/studio/master/targets";
import { buildMasterVerdict, type MasterCard } from "@/lib/studio/master/verdict";
import { decodeMixAnalysisInput } from "@/lib/studio/mix-analysis/client";
import type { StudioClipDto, StudioProjectDocument } from "@/lib/studio/studio-types";

type Tier = "FREE" | "BRONZE" | "SILVER" | "GOLD";
type Option = { kind: DeliverKind; format: DeliverFormat; enabled: boolean };
type ServerState = {
  available: boolean;
  tier: Tier | null;
  options: Option[];
  usage: { used: number; weekLimit: number | null; resetAt: string | null } | null;
  /** Plan quota: masters this calendar month (server-enforced). */
  masters: { used: number; monthLimit: number; resetAt: string } | null;
};
type ServerMaster =
  | { phase: "idle" }
  | { phase: "working"; jobId: string | null }
  | { phase: "done"; jobId: string; url: string | null; metrics: { after?: Record<string, unknown> } | null }
  | { phase: "failed"; code: string }
  | { phase: "unavailable" };

const STATUS_RAIL = { green: "border-l-[var(--brd-green)]", yellow: "border-l-[var(--brd-amber)]", red: "border-l-[var(--brd-rec)]", na: "border-l-[var(--brd-line)]" } as const;
const MIN_PLAN = (format: DeliverFormat): Tier => minimumTierForDeliverFormat(format);
const FORMATS: DeliverFormat[] = ["MP3_128", "MP3_192", "MP3_320", "WAV_24"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stage 3 — Mastering step: approved mix → one stereo track → target + whole-song settings → E3 master → approve → downloads. */
export function StudioMasterStep({
  doc,
  resolveClipSourceUrl,
  onBackToMix,
  onBitekBubble,
  chatContextRef,
  applyRef,
  initialState,
}: {
  doc: StudioProjectDocument;
  resolveClipSourceUrl: (clip: StudioClipDto) => Promise<string | null>;
  onBackToMix: () => void;
  onBitekBubble?: (bubble: BitekBubble | null) => void;
  chatContextRef?: { current: (() => BitekClientContext) | null };
  /** BITEK chat → apply a whole-song setting proposal. */
  applyRef?: { current: ((key: MasterSettingKey, value: number) => void) | null };
  /** Tests/screenshots only. */
  initialState?: { target?: MasterTargetId };
}) {
  const t = useTranslations("studio.masterStep");
  const tBitek = useTranslations("studio.bitek");
  const locale = useLocale();
  const projectId = doc.project.id;

  const [renderPct, setRenderPct] = useState(0);
  const [renderFailed, setRenderFailed] = useState(false);
  const [mix, setMix] = useState<{ stereo: Stereo; raw: Stereo; metrics: MasterMetrics } | null>(null);
  const [target, setTarget] = useState<MasterTargetId>(initialState?.target ?? "streaming");
  const [settings, setSettings] = useState<MasterSettings>(DEFAULT_MASTER_SETTINGS);
  const [preview, setPreview] = useState<{ stereo: Stereo; metrics: MasterMetrics; key: string } | null>(null);
  const [server, setServer] = useState<ServerState>({ available: true, tier: null, options: [], usage: null, masters: null });
  const [sm, setSm] = useState<ServerMaster>({ phase: "idle" });
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [dl, setDl] = useState<{ key: string; status: "working" | "done" | "error" | "limit" } | null>(null);
  /** Live E3 progress of the running master / download job (stage + overall %). */
  const [prog, setProg] = useState<{ master: JobProgress | null; dl: JobProgress | null }>({ master: null, dl: null });
  const [ab, setAb] = useState<"mix" | "master">("master");
  const [matched, setMatched] = useState(true);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode } | null>(null);
  const settingsKey = `${target}:${MASTER_SETTING_KEYS.map((k) => settings[k]).join(",")}`;

  // 1) Bounce the approved mix (once per mount — going back to Mix discards the master).
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const input = await decodeMixAnalysisInput({ doc, resolveSourceUrl: resolveClipSourceUrl, sampleRate: MASTER_RENDER_SAMPLE_RATE, signal: controller.signal, onProgress: (f) => setRenderPct(Math.round(f * 80)) });
      if (controller.signal.aborted) return;
      if (!input) return setRenderFailed(true);
      try {
        const r = await renderApprovedMix(input);
        if (!controller.signal.aborted) setMix({ stereo: r.mix, raw: r.raw, metrics: r.mixMetrics });
      } catch {
        if (!controller.signal.aborted) setRenderFailed(true);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the mix is frozen when entering Mastering
  }, []);

  // 2) Server state: tier, download options, weekly counter, existing master.
  useEffect(() => {
    let live = true;
    void fetch(`/api/studio/projects/${projectId}/master`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !j) return;
        setServer({ available: j.available !== false, tier: j.tier ?? null, options: Array.isArray(j.options) ? j.options : [], usage: j.usage ?? null, masters: j.masters ?? null });
        if (j.available === false) return setSm({ phase: "unavailable" });
        // Restore an approved master for the current mix (after reload / coming back later).
        const a = j.approved as { id?: string; target?: string | null; status?: string; settings?: Record<string, number> | null } | null | undefined;
        if (a?.id && a.status === "succeeded") {
          const id = a.id;
          void fetch(`/api/studio/projects/${projectId}/jobs/${id}`)
            .then((r) => (r.ok ? r.json() : null))
            .then(async (job) => {
              if (!live || !job?.job) return;
              const url = await resultUrl(job);
              if (!live) return;
              if (a.target && isMasterTargetId(a.target)) setTarget(a.target);
              if (a.settings) setSettings(clampMasterSettings(a.settings));
              setSm((cur) => (cur.phase === "idle" ? { phase: "done", jobId: id, url, metrics: (job.job.metrics as { after?: Record<string, unknown> }) ?? null } : cur));
              setApproved(true);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [projectId]);

  // 3) Approximate browser preview whenever target/settings change.
  useEffect(() => {
    if (!mix) return;
    let live = true;
    const key = settingsKey;
    const h = setTimeout(() => {
      void renderMasterPreview(mix.stereo, target, settings).then((r) => {
        if (live) setPreview({ stereo: r.preview, metrics: r.metrics, key });
      }).catch(() => {});
    }, 250);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [mix, target, settings, settingsKey]);

  const previewFresh = preview?.key === settingsKey ? preview : null;
  const verdict = useMemo(() => (preview ? buildMasterVerdict(preview.metrics, target, settings) : null), [preview, target, settings]);

  const stop = useCallback(() => {
    const a = audioRef.current;
    audioRef.current = null;
    if (a) {
      try { a.src.stop(); } catch { /* already stopped */ }
      void a.ctx.close();
    }
    setPlaying(false);
  }, []);
  useEffect(() => () => stop(), [stop]);

  const play = (which: "mix" | "master") => {
    stop();
    const s = which === "mix" ? mix?.stereo : preview?.stereo;
    if (!s || !mix || !preview) return;
    const ctx = new AudioContext({ sampleRate: s.sampleRate });
    // Loudness-matched A/B: the mix is brought to the master's LUFS (never above, the master is limited).
    const gain = which === "mix" && matched && Number.isFinite(preview.metrics.lufs) && Number.isFinite(mix.metrics.lufs) ? Math.min(12, preview.metrics.lufs - mix.metrics.lufs) : 0;
    const src = ctx.createBufferSource();
    src.buffer = stereoToAudioBuffer(ctx, s, gain);
    src.connect(ctx.destination);
    src.onended = () => setPlaying(false);
    src.start();
    audioRef.current = { ctx, src };
    setPlaying(true);
  };
  const switchAb = (which: "mix" | "master") => {
    setAb(which);
    if (playing) play(which);
  };

  const step = (key: MasterSettingKey, value: number) => {
    setSettings((s) => clampMasterSettings({ ...s, [key]: value }));
    if (sm.phase === "done") setSm({ phase: "idle" });
    setApproved(false);
  };
  const latest = useRef({ settings, target, verdict });
  useEffect(() => {
    latest.current = { settings, target, verdict };
  });
  useEffect(() => {
    if (!applyRef) return;
    applyRef.current = (key, value) => step(key, value);
    return () => {
      applyRef.current = null;
    };
  });
  const getChatContext = useCallback(() => {
    const cur = latest.current;
    const base = buildBitekClientContext({
      doc,
      lang: locale === "en" ? "en" : "pl",
      step: "master",
      master: { target: cur.target, settings: cur.settings, cards: (cur.verdict?.cards ?? []).map((c) => ({ id: c.id, status: c.status, value: c.value })) },
    });
    return base;
  }, [doc, locale]);
  useEffect(() => {
    if (!chatContextRef) return;
    chatContextRef.current = getChatContext;
    return () => {
      chatContextRef.current = null;
    };
  }, [chatContextRef, getChatContext]);

  /** Signed URL, or a joined object URL when the result is stored in ≤40 MB parts. */
  async function resultUrl(j: { downloadUrl?: string | null; downloadParts?: string[] | null; filename?: string | null }): Promise<string | null> {
    if (j.downloadUrl) return j.downloadUrl;
    if (!j.downloadParts?.length) return null;
    const ext = (j.filename ?? "").split(".").pop();
    const blob = await joinParts(j.downloadParts, ext === "zip" ? "application/zip" : ext === "mp3" ? "audio/mpeg" : "audio/wav");
    return blob ? URL.createObjectURL(blob) : null;
  }

  async function pollJob(jobId: string, slot: "master" | "dl"): Promise<{ status: string; url: string | null; filename: string | null; metrics: unknown; code: string | null }> {
    // E3 jobs take ~1 min: poll every second at first so the bar and the result feel live.
    for (let i = 0; i < 240; i++) {
      const r = await fetch(`/api/studio/projects/${projectId}/jobs/${jobId}`);
      const j = r.ok ? await r.json() : null;
      const st = j?.job?.status;
      if (st === "succeeded") setProg((p) => ({ ...p, [slot]: { stage: "done", progress: 100 } }));
      else if (j?.job) setProg((p) => ({ ...p, [slot]: jobProgressOf(j.job, p[slot]) }));
      if (st === "succeeded" || st === "failed" || st === "cancelled") return { status: st, url: st === "succeeded" ? await resultUrl(j) : null, filename: j.filename ?? null, metrics: j.job.metrics, code: j.job.errorCode ?? null };
      await sleep(i < 90 ? 1000 : 3000);
    }
    return { status: "failed", url: null, filename: null, metrics: null, code: "timeout" };
  }

  async function makeMaster() {
    if (!mix || sm.phase === "working") return;
    stop();
    setSm({ phase: "working", jobId: null });
    setProg((p) => ({ ...p, master: { stage: "queued", progress: 0 } }));
    setApproved(false);
    try {
      const prep = await fetch(`/api/studio/projects/${projectId}/master`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }) }).then((r) => r.json());
      if (prep.available === false) return setSm({ phase: "unavailable" });
      if (!prep.jobId) return setSm({ phase: "failed", code: "prepare" });
      // E3 renders the mix itself from the saved project (same DSP as this preview).
      const commit = await fetch(`/api/studio/projects/${projectId}/master`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "commit", jobId: prep.jobId, target, settings, documentVersion: doc.project.documentVersion }) }).then((r) => r.json());
      if (commit.available === false) return setSm({ phase: "unavailable" });
      if (commit.masters) setServer((s) => ({ ...s, masters: commit.masters }));
      if (!commit.ok) return setSm({ phase: "failed", code: String(commit.error ?? "commit") });
      setSm({ phase: "working", jobId: prep.jobId });
      const done = await pollJob(prep.jobId, "master");
      if (done.status !== "succeeded") return setSm({ phase: "failed", code: done.code ?? "failed" });
      setSm({ phase: "done", jobId: prep.jobId, url: done.url, metrics: (done.metrics as { after?: Record<string, unknown> }) ?? null });
    } catch {
      setSm({ phase: "failed", code: "network" });
    }
  }

  async function approve() {
    if (sm.phase !== "done" || approving) return;
    setApproving(true);
    try {
      const r = await fetch(`/api/studio/projects/${projectId}/master/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: sm.jobId }) });
      if (r.ok) setApproved(true);
    } finally {
      setApproving(false);
    }
  }

  async function deliver(kind: DeliverKind, format: DeliverFormat) {
    const key = `${kind}-${format}`;
    if (dl?.status === "working") return;
    setDl({ key, status: "working" });
    setProg((p) => ({ ...p, dl: { stage: "queued", progress: 0 } }));
    const post = (body: Record<string, unknown>) =>
      fetch(`/api/studio/projects/${projectId}/deliver`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, format, ...body }) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    try {
      const prep = await post({ action: "prepare" });
      if (!prep.json.ok) return setDl({ key, status: prep.status === 429 ? "limit" : "error" });
      const jobId = String(prep.json.jobId);
      const commit = await post({ action: "commit", jobId, documentVersion: doc.project.documentVersion });
      if (commit.json.usage) setServer((s) => ({ ...s, usage: { used: commit.json.usage.used, weekLimit: commit.json.usage.week_limit ?? null, resetAt: commit.json.usage.reset_at ?? null } }));
      if (!commit.json.ok) return setDl({ key, status: commit.status === 429 ? "limit" : "error" });
      const done = await pollJob(jobId, "dl");
      if (done.status !== "succeeded" || !done.url) return setDl({ key, status: "error" });
      const a = document.createElement("a");
      a.href = done.url;
      a.rel = "noopener";
      if (done.filename) a.download = done.filename;
      a.click();
      setDl({ key, status: "done" });
    } catch {
      setDl({ key, status: "error" });
    }
  }

  // BITEK — short, first person, mood follows the state.
  const [pendingBack, setPendingBack] = useState(0);
  useEffect(() => {
    if (pendingBack > 0) onBackToMix();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per click from the bubble
  }, [pendingBack]);
  const worst: MasterCard | null = verdict?.cards.find((c) => c.status === "red") ?? verdict?.cards.find((c) => c.status === "yellow") ?? null;
  const bubble = useMemo<BitekBubble>(() => {
    const back = { id: "backToMix", label: tBitek("akcja.backToMix"), onClick: () => setPendingBack((n) => n + 1) };
    let mood: BitekMood = "happy";
    let text: string;
    let key: string;
    if (renderFailed) [mood, text, key] = ["alert", t("renderBlad"), "m-renderfail"];
    else if (!mix) [mood, text, key] = ["thinking", t("bitek.renderuje"), "m-render"];
    else if (approved) [mood, text, key] = ["done", t("bitek.zatwierdzone"), "m-approved"];
    else if (sm.phase === "done") [mood, text, key] = ["done", t(`bitek.gotowe.${target}`), `m-done-${target}`];
    else if (sm.phase === "working") [mood, text, key] = ["thinking", prog.master ? t(`bitek.etap.${prog.master.stage}`, { pct: prog.master.progress }) : t("bitek.masterTrwa"), `m-working-${prog.master?.stage ?? "start"}`];
    else if (sm.phase === "failed") [mood, text, key] = ["alert", t("bitek.blad"), "m-failed"];
    else if (worst?.status === "red") [mood, text, key] = ["alert", t("bitek.problem", { card: t(`cards.${worst.id}.title`) }), `m-red-${worst.id}`];
    else [mood, text, key] = ["happy", t("bitek.gotowy"), "m-ready"];
    return { key, mood, text, details: mix && !approved ? [t("bitek.wrocInfo"), ...(sm.phase === "unavailable" ? [t("bitek.niedostepny")] : [])] : undefined, actions: approved ? [] : [back] };
  }, [renderFailed, mix, approved, sm.phase, target, worst, t, tBitek, prog.master]);
  useEffect(() => {
    onBitekBubble?.(bubble);
  }, [bubble, onBitekBubble]);
  useEffect(() => () => onBitekBubble?.(null), [onBitekBubble]);

  const fmtN = (n: number, d = 1) => (Number.isFinite(n) ? n.toLocaleString(locale === "en" ? "en-US" : "pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d }) : "−∞");
  const signed = (n: number) => (n > 0 ? `+${fmtN(n, n % 1 ? 1 : 0)}` : n < 0 ? `−${fmtN(-n, n % 1 ? 1 : 0)}` : "0");
  const plan = server.tier ? t(`plany.${server.tier}`) : null;
  const limitReached = server.usage?.weekLimit != null && server.usage.used >= server.usage.weekLimit;
  const mastersLeft = server.masters ? Math.max(0, server.masters.monthLimit - server.masters.used) : null;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "pl-PL", { timeZone: "Europe/Warsaw", day: "numeric", month: "long" });

  return (
    <div data-testid="studio-master-step" className="flex flex-col gap-3 pb-64 lg:pb-48">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="min-h-9" onClick={onBackToMix} data-testid="studio-master-back" aria-describedby="studio-master-back-hint">
          ← {t("wrocDoMixu")}
        </Button>
        <h2 className="brd-display text-2xl leading-none tracking-tight">{t("tytul")}</h2>
        <span id="studio-master-back-hint" className="text-xs text-[var(--brd-mute)]">{t("wrocUwaga")}</span>
      </div>

      {!mix && !renderFailed ? (
        <div className="flex items-center gap-2" role="status">
          <progress className="h-2 w-40 accent-[var(--brd-amber)]" max={100} value={renderPct} aria-label={t("renderuje", { pct: renderPct })} />
          <span className="font-mono text-xs">{t("renderuje", { pct: renderPct })}</span>
        </div>
      ) : null}
      {renderFailed ? <p role="alert" className="border-l-2 border-l-[var(--brd-rec)] pl-2 text-sm">{t("renderBlad")}</p> : null}

      {mix ? (
        <>
          <p className="border-l-2 border-l-[var(--brd-amber)] pl-2 text-sm">{t("calyNumer")}</p>

          <fieldset data-testid="studio-master-targets" className="flex flex-col gap-2">
            <legend className="brd-display mb-1 text-base">{t("celTytul")}</legend>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {MASTER_TARGET_IDS.map((id) => (
                <label key={id} className={`flex cursor-pointer flex-col gap-0.5 rounded-[2px] border p-2 text-sm ${target === id ? "border-[var(--brd-ink)] bg-[var(--brd-recess)]" : "border-[var(--brd-line)] bg-[var(--brd-paper)]"}`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="studio-master-target" value={id} checked={target === id} onChange={() => { setTarget(id); if (sm.phase === "done") setSm({ phase: "idle" }); setApproved(false); }} data-testid={`studio-master-target-${id}`} />
                    <span className="font-semibold">{t(`cele.${id}.nazwa`)}</span>
                  </span>
                  <span className="font-mono text-xs">{t("celWartosci", { lufs: fmtN(MASTER_TARGETS[id].lufs, 0), tp: fmtN(MASTER_TARGETS[id].tp, 1) })}</span>
                  <span className="text-xs text-[var(--brd-mute)]">{t(`cele.${id}.opis`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <section aria-labelledby="studio-master-settings-title" className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h3 id="studio-master-settings-title" className="brd-display text-base">{t("ustawieniaTytul")}</h3>
              <Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={() => setSettings(DEFAULT_MASTER_SETTINGS)}>{t("reset")}</Button>
            </div>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-5">
              {MASTER_SETTING_KEYS.map((k) => {
                const name = t(`ustawienia.${k}`);
                return (
                  <li key={k} data-testid={`studio-master-setting-${k}`} className="flex items-center justify-between gap-1 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-1.5">
                    <span className="text-sm">{name}</span>
                    <span className="flex items-center gap-1">
                      <Button type="button" size="sm" variant="outline" className="min-h-9 min-w-9" aria-label={t("mniej", { name })} disabled={settings[k] <= -3} onClick={() => step(k, settings[k] - 0.5)}>−</Button>
                      <output className="w-9 text-center font-mono text-sm" aria-live="polite">{signed(settings[k])}</output>
                      <Button type="button" size="sm" variant="outline" className="min-h-9 min-w-9" aria-label={t("wiecej", { name })} disabled={settings[k] >= 3} onClick={() => step(k, settings[k] + 0.5)}>+</Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="studio-master-ab-title" data-testid="studio-master-ab" className="flex flex-wrap items-center gap-2 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-2">
            <h3 id="studio-master-ab-title" className="text-sm font-semibold">{t("abTytul")}</h3>
            <Button type="button" size="sm" className="min-h-9" disabled={!previewFresh} onClick={() => (playing ? stop() : play(ab))} data-testid="studio-master-play">
              {playing ? `■ ${t("stop")}` : `▶ ${t("graj")}`}
            </Button>
            {(["mix", "master"] as const).map((m) => (
              <Button key={m} type="button" size="sm" variant={ab === m ? "default" : "outline"} aria-pressed={ab === m} className="min-h-9" onClick={() => switchAb(m)} data-testid={`studio-master-ab-${m}`}>
                {m === "mix" ? t("abMix") : t("abMaster")}
              </Button>
            ))}
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={matched} onChange={(e) => setMatched(e.target.checked)} aria-describedby="studio-master-matched-hint" />
              {t("abWyrownane")}
            </label>
            <span id="studio-master-matched-hint" className="text-xs text-[var(--brd-mute)]">{t("abWyrownaneOpis")}</span>
            <p className="w-full text-xs text-[var(--brd-mute)]">{previewFresh ? t("podgladUwaga") : t("podgladLiczy")}</p>
          </section>

          {verdict ? (
            <section aria-labelledby="studio-master-cards-title">
              <h3 id="studio-master-cards-title" className="brd-display mb-1 text-base">{t("kartyTytul")}</h3>
              <ul data-testid="studio-master-cards" className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
                {verdict.cards.map((c) => (
                  <li key={c.id} data-testid="studio-master-card" data-card-id={c.id} data-status={c.status} className={`flex flex-col gap-1 rounded-[2px] border border-[var(--brd-line)] border-l-4 bg-[var(--brd-paper)] p-3 ${STATUS_RAIL[c.status]}`}>
                    <h4 className="text-sm font-semibold">{t(`cards.${c.id}.title`)}</h4>
                    {c.value ? <p className="font-mono text-lg leading-none">{c.value}</p> : null}
                    <p className="text-sm">{t(`cards.${c.id}.${c.messageKey}`, { ...c.params, band: typeof c.params.band === "string" ? t(`pasma.${c.params.band}`) : "" })}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-[var(--brd-line)] pt-3">
            {sm.phase !== "done" && !approved ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="lg" className="min-h-11 px-4" disabled={sm.phase === "working" || sm.phase === "unavailable" || mastersLeft === 0} aria-describedby={server.masters ? "studio-master-quota" : undefined} onClick={() => void makeMaster()} data-testid="studio-master-make">
                  {mastersLeft === 0 ? "🔒 " : ""}
                  {sm.phase === "working" ? (sm.jobId ? t("masterTrwa") : t("masterKolejka")) : t("zrobMaster")}
                </Button>
                {server.masters ? (
                  <p id="studio-master-quota" data-testid="studio-master-quota" data-left={mastersLeft ?? undefined} className={`text-sm ${mastersLeft === 0 ? "text-[var(--brd-rec)]" : "text-[var(--brd-mute)]"}`}>
                    {t("masteryMiesiac", { used: server.masters.used, limit: server.masters.monthLimit })}
                    {mastersLeft === 0 && server.masters.resetAt ? ` · ${t("masteryReset", { date: fmtDate(server.masters.resetAt) })}` : ""}
                  </p>
                ) : null}
                {sm.phase === "working" && prog.master ? <JobProgressBar value={prog.master} label={t(`etap.${prog.master.stage}`)} ariaLabel={t("postepAria")} testId="studio-master-progress" /> : null}
                {sm.phase === "failed" && sm.code === "monthly_limit" ? (
                  <p role="alert" data-testid="studio-master-limit" className="text-sm text-[var(--brd-rec)]">
                    {t("masteryLimit")}{" "}
                    {server.tier !== "GOLD" ? <a href="/premium" className="underline underline-offset-4">{t("zobaczPlany")}</a> : null}
                  </p>
                ) : sm.phase === "failed" ? <p role="alert" className="text-sm text-[var(--brd-rec)]">{t("masterBlad", { code: sm.code })}</p> : null}
                {sm.phase === "unavailable" ? <p role="status" data-testid="studio-master-unavailable" className="text-sm">{t("serwerNiedostepny")}</p> : null}
              </div>
            ) : null}

            {sm.phase === "done" ? (
              <section aria-labelledby="studio-master-final-title" data-testid="studio-master-final" className="flex flex-col gap-2 rounded-[2px] border border-[var(--brd-line)] border-l-4 border-l-[var(--brd-green)] bg-[var(--brd-paper)] p-3">
                <h3 id="studio-master-final-title" className="brd-display text-lg">{t("finalTytul")}</h3>
                <p className="text-sm">{t("finalOpis")}</p>
                {sm.url ? <audio controls preload="metadata" src={sm.url} className="w-full" data-testid="studio-master-final-audio" /> : null}
                {sm.metrics?.after ? (
                  <p className="font-mono text-xs">
                    {fmtN(Number(sm.metrics.after.lufs))} LUFS · {fmtN(Number(sm.metrics.after.truePeakDb))} dBTP · LRA {fmtN(Number(sm.metrics.after.lra))} LU
                  </p>
                ) : null}
                <StudioMasterReport mix={mix?.metrics ?? null} master={sm.metrics?.after ? { lufs: Number(sm.metrics.after.lufs), truePeakDb: Number(sm.metrics.after.truePeakDb), lra: Number(sm.metrics.after.lra) } : null} target={target} settings={settings} tpCeiling={MASTER_TARGETS[target].tp} />
                {approved ? (
                  <p role="status" className="text-sm font-semibold">✓ {t("zatwierdzone")}</p>
                ) : (
                  <Button type="button" size="lg" className="min-h-11 self-start px-4" disabled={approving} onClick={() => void approve()} data-testid="studio-master-approve">
                    {approving ? t("zatwierdzTrwa") : t("zatwierdz")}
                  </Button>
                )}
              </section>
            ) : null}

            {approved ? (
              <section aria-labelledby="studio-master-dl-title" data-testid="studio-master-downloads" data-tier={server.tier ?? "guest"} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 id="studio-master-dl-title" className="brd-display text-lg">{t("pobierzTytul")}</h3>
                  {plan ? <span className="text-xs uppercase tracking-[0.12em] text-[var(--brd-mute)]">{t("planInfo", { plan })}</span> : null}
                </div>
                {!server.tier ? <p className="text-sm">{t("gosc")}</p> : null}
                {server.tier === "FREE" ? (
                  <p data-testid="studio-master-dl-free" role="status" className="flex flex-col gap-1 border-l-4 border-l-[var(--brd-amber)] bg-[var(--brd-paper)] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span>{t("freeBezPobierania")}</span>
                    <a href="/premium" className="font-semibold underline underline-offset-4">{t("zobaczPlany")}</a>
                  </p>
                ) : null}
                {server.tier && server.usage?.weekLimit != null ? (
                  <p data-testid="studio-master-dl-counter" className={`text-sm ${limitReached ? "text-[var(--brd-rec)]" : ""}`}>
                    {t("licznikFree", { used: server.usage.used, limit: server.usage.weekLimit })}
                    {limitReached && server.usage.resetAt ? ` · ${t("licznikReset", { date: new Date(server.usage.resetAt).toLocaleDateString(locale === "en" ? "en-GB" : "pl-PL", { timeZone: "Europe/Warsaw" }) })}` : ""}
                  </p>
                ) : null}
                {server.tier ? (
                  <ul className="flex flex-col gap-2">
                    {(["mix", "master", "raw", "project"] as const).map((kind) => {
                      const rows = kind === "project" ? (["ZIP"] as DeliverFormat[]) : FORMATS;
                      return (
                        <li key={kind} data-testid={`studio-master-dl-${kind}`} className="flex flex-col gap-1 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-2 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{t(`pobierz.${kind}`)}</p>
                            <p className="text-xs text-[var(--brd-mute)]">{t(`pobierzOpis.${kind}`)}</p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {rows.map((format) => {
                              const opt = server.options.find((o) => o.kind === kind && o.format === format);
                              const enabled = Boolean(opt?.enabled) && !limitReached;
                              const key = `${kind}-${format}`;
                              const lockedLabel = !opt?.enabled ? (kind === "project" ? t("tylkoGold") : t("zablokowane", { plan: t(`plany.${MIN_PLAN(format)}`) })) : null;
                              if (!opt?.enabled) {
                                // Plan lock: visible, focusable, bubble on hover/focus/tap (Owner 2026-10-29).
                                return (
                                  <LockedAction key={format} reason="plan" minTier={MIN_PLAN(format)} testId={`studio-master-dl-${key}`} buttonClassName="px-3" dataAttrs={{ "data-enabled": "false", "aria-label": `${t("formatAria", { kind: t(`pobierz.${kind}`), format: t(`format.${format}`) })} — ${lockedLabel ?? ""}` }}>
                                    {t(`format.${format}`)}
                                  </LockedAction>
                                );
                              }
                              return (
                                <Button key={format} type="button" size="sm" variant={enabled ? "default" : "outline"} className="min-h-9" disabled={!enabled || dl?.status === "working"} title={lockedLabel ?? undefined} aria-label={`${t("formatAria", { kind: t(`pobierz.${kind}`), format: t(`format.${format}`) })}${lockedLabel ? ` — ${lockedLabel}` : ""}`} data-testid={`studio-master-dl-${key}`} data-enabled={enabled} onClick={() => void deliver(kind, format)}>
                                  {!opt?.enabled ? "🔒 " : ""}
                                  {dl?.key === key && dl.status === "working" ? t("przygotowuje") : t(`format.${format}`)}
                                </Button>
                              );
                            })}
                          </div>
                          {kind === "project" && !server.options.find((o) => o.kind === "project")?.enabled ? <span className="text-xs text-[var(--brd-mute)]">{t("tylkoGold")}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {dl?.status === "working" && prog.dl ? <JobProgressBar value={prog.dl} label={t(`etap.${prog.dl.stage}`)} ariaLabel={t("postepAria")} testId="studio-master-dl-progress" /> : null}
                {dl?.status === "done" ? <p role="status" className="text-sm">{t("gotowyPlik")}</p> : null}
                {dl?.status === "error" ? <p role="alert" className="text-sm text-[var(--brd-rec)]">{t("pobierzBlad")}</p> : null}
                {dl?.status === "limit" || (limitReached && server.tier) ? <p role="status" className="text-sm">{t("limitWyczerpany")}</p> : null}
              </section>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
