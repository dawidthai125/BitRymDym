"use client";

import { StoreAppHidden } from "@/components/site/store-app-context";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BrdAudioDeck } from "@/components/player/brd-audio-deck";
import type { BitekBubble, BitekMood } from "@/components/studio/studio-bitek-dock";
import { StudioJobProgressBar as JobProgressBar } from "@/components/studio/studio-job-progress";
import { Button } from "@/components/ui/button";
import { StudioMasterReport } from "@/components/studio/studio-change-report";
import { CatalogPublishPanel } from "@/components/studio/catalog-publish-panel";
import { StudioListenLinks } from "@/components/studio/studio-listen-links";
import { StudioYoutubeVideo } from "@/components/studio/studio-youtube-video";
import { StudioMasterStyleReference, type MasterReferenceState } from "@/components/studio/studio-master-style-reference";
import { requestPlanUsageRefresh } from "@/lib/plans/plan-usage-refresh";
import { clearAutoMasterHandoff, nextAutoMasterStep, readAutoMasterHandoff } from "@/lib/studio/bitek/auto-mix-master";
import { buildBitekClientContext, type BitekClientContext } from "@/lib/studio/bitek/chat/client-context";
import { planMasterClarity } from "@/lib/studio/bitek/chat/master-clarity";
import type { BitekMasterStyle, BitekMasterTarget } from "@/lib/studio/bitek/chat/types";
import { watchMasterManual, type ManualIssue } from "@/lib/studio/bitek/manual-watch";
import { LockedAction } from "@/components/plans/locked-action";
import { FREE_WATERMARK_PER_DAY, minimumTierForDeliverFormat, type DeliverFormat, type DeliverKind } from "@/lib/studio/deliver/policy";
import { referenceEditInvalidatesMaster } from "@/lib/studio/master/reference-invalidation";
import { jobProgressOf, type JobProgress } from "@/lib/studio/master/progress";
import { joinParts, loadMasterMix, MASTER_RENDER_SAMPLE_RATE, renderApprovedMix, renderMasterPreview, stereoToAudioBuffer } from "@/lib/studio/master/client";
import { followStudioJob, masterErrorKey, refusalCode, studioJobUrl, type StudioJobBody } from "@/lib/studio/master/job-poll";
import type { MasterMetrics, Stereo } from "@/lib/studio/master/dsp";
import { explainReferenceMatch, isReferenceMatchReport } from "@/lib/studio/master/reference";
import { DEFAULT_MASTER_INTENSITY, DEFAULT_MASTER_SETTINGS, DEFAULT_REFERENCE_INTENSITY, MASTER_SETTING_KEYS, MASTER_TARGET_IDS, MASTER_TARGETS, applyMasterStyle, clampMasterSettings, isMasterStyleId, isMasterTargetId, type MasterSettingKey, type MasterSettings, type MasterStyleId, type MasterTargetId } from "@/lib/studio/master/targets";
import { buildMasterVerdict, type MasterCard } from "@/lib/studio/master/verdict";
import { buildStreamingReadiness } from "@/lib/studio/master/streaming-readiness";
import { MixSourceError } from "@/lib/studio/mix-analysis/client";
import type { StudioClipDto, StudioProjectDocument } from "@/lib/studio/studio-types";
import type { MasterSessionSnap } from "@/lib/studio/studio-undo-history";

type Tier = "FREE" | "BRONZE" | "SILVER" | "GOLD";
type Option = { kind: DeliverKind; format: DeliverFormat; enabled: boolean; watermark?: boolean };
type Usage = {
  used: number;
  weekLimit: number | null;
  resetAt: string | null;
  dailyUsed?: number;
  dailyLimit?: number;
  dailyResetAt?: string | null;
};
type ServerState = {
  available: boolean;
  tier: Tier | null;
  options: Option[];
  usage: Usage | null;
  /** Plan quota: masters this calendar month (server-enforced). */
  masters: { used: number; monthLimit: number; resetAt: string } | null;
};
/** GET sends camelCase; the deliver commit sends the RPC's snake_case plus daily_*. */
function readUsage(raw: unknown): Usage | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const week = u.weekLimit ?? u.week_limit;
  const reset = u.resetAt ?? u.reset_at;
  const dailyLimit = u.dailyLimit ?? u.daily_limit;
  const dailyUsed = u.dailyUsed ?? u.daily_used;
  const dailyReset = u.dailyResetAt ?? u.daily_reset_at;
  return {
    used: Number(u.used ?? 0),
    weekLimit: week == null ? null : Number(week),
    resetAt: reset == null ? null : String(reset),
    ...(dailyLimit == null ? {} : {
      dailyUsed: Number(dailyUsed ?? 0),
      dailyLimit: Number(dailyLimit),
      dailyResetAt: dailyReset == null ? null : String(dailyReset),
    }),
  };
}
function laterReset(a?: string | null, b?: string | null): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}
/** What a master was ordered with: the report describes the file, not the sliders moved afterwards. */
type MadeWith = { key: string; target: MasterTargetId; settings: MasterSettings; style: MasterStyleId | null; styleIntensity: number };
type DoneMaster = { phase: "done"; jobId: string; url: string | null; urlState: "loading" | "ready" | "none"; metrics: { after?: Record<string, unknown> } | null; made: MadeWith | null };
type ServerMaster =
  | { phase: "idle" }
  | { phase: "working"; jobId: string | null }
  /** The job is (or may be) still on the server, we only stopped watching. A second one must not be ordered. */
  | { phase: "waiting"; jobId: string; reason: "pending" | "signed_out" }
  | DoneMaster
  | { phase: "failed"; code: string }
  | { phase: "unavailable" };
type JobView = {
  id?: string; status?: string; target?: string | null; settings?: Record<string, number> | null; style?: string | null; styleIntensity?: number | null;
  metrics?: unknown; sourceDocumentVersion?: number | null;
};
const LIMIT_CODES = ["daily_limit", "weekly_limit", "song_day_limit"] as const;
type LimitCode = (typeof LIMIT_CODES)[number];
const isLimitCode = (c: string): c is LimitCode => (LIMIT_CODES as readonly string[]).includes(c);

const masterKeyOf = (target: MasterTargetId, effective: MasterSettings) => `${target}:${MASTER_SETTING_KEYS.map((k) => effective[k]).join(",")}`;

const STATUS_RAIL = { green: "border-l-[var(--brd-green)]", yellow: "border-l-[var(--brd-amber)]", red: "border-l-[var(--brd-rec)]", na: "border-l-[var(--brd-line)]" } as const;
/** The dark theme has one colour for "ok" and "watch out", so the state is never colour alone. */
const STATUS_MARK = { green: "✓", yellow: "!", red: "✕", na: "" } as const;
const MIN_PLAN = (format: DeliverFormat): Tier => minimumTierForDeliverFormat(format);
const FORMATS: DeliverFormat[] = ["MP3_128", "MP3_192", "MP3_320", "WAV_24", "FLAC_24", "AIFF_24", "WAV_32F"];

/** Stage 3 — Mastering step: approved mix → one stereo track → target + whole-song settings → E3 master → approve → downloads. */
export function StudioMasterStep({
  doc,
  resolveClipSourceUrl,
  onBackToMix,
  onBitekBubble,
  chatContextRef,
  applyRef,
  onCommitMasterSession,
  sessionRef,
  initialState,
  autoPipeline = false,
}: {
  doc: StudioProjectDocument;
  resolveClipSourceUrl: (clip: StudioClipDto) => Promise<string | null>;
  onBackToMix: () => void;
  onBitekBubble?: (bubble: BitekBubble | null) => void;
  chatContextRef?: { current: (() => BitekClientContext) | null };
  /** BITEK chat → apply a whole-song setting proposal. */
  applyRef?: { current: ((key: MasterSettingKey, value: number) => void) | null };
  /** One editor undo entry per mastering gesture. Absent in tests that don't mount the editor. */
  onCommitMasterSession?: (before: MasterSessionSnap, after: MasterSessionSnap) => void;
  /** Editor undo/redo writes the snap back without recording another entry. */
  sessionRef?: { current: { apply: (snap: MasterSessionSnap) => void } | null };
  /** Tests/screenshots only. */
  initialState?: { target?: MasterTargetId; style?: MasterStyleId };
  /** Gold auto switch was on when the user agreed to mastering. */
  autoPipeline?: boolean;
}) {
  const t = useTranslations("studio.masterStep");
  const tBitek = useTranslations("studio.bitek");
  const locale = useLocale();
  const projectId = doc.project.id;

  const [renderPct, setRenderPct] = useState(0);
  const [renderFailed, setRenderFailed] = useState(false);
  /** The track whose audio did not load (no preview and no master without it). */
  const [missingTrack, setMissingTrack] = useState<string | null>(null);
  const [renderTry, setRenderTry] = useState(0);
  const [mixChanged, setMixChanged] = useState(false);
  const [mix, setMix] = useState<{ stereo: Stereo; raw: Stereo; metrics: MasterMetrics } | null>(null);
  const [target, setTarget] = useState<MasterTargetId>(initialState?.target ?? "streaming");
  const [settings, setSettings] = useState<MasterSettings>(DEFAULT_MASTER_SETTINGS);
  /** Style (Ciepły / Jasny / Głośny / Dynamiczny) × intensity on top of the settings; reference mastering. */
  const [style, setStyle] = useState<MasterStyleId | null>(initialState?.style ?? null);
  const [styleIntensity, setStyleIntensity] = useState(DEFAULT_MASTER_INTENSITY);
  const [refState, setRefState] = useState<MasterReferenceState>({ loaded: false, available: true, gate: null, reference: null });
  const refStateRef = useRef(refState);
  useEffect(() => {
    refStateRef.current = refState;
  }, [refState]);
  const [refIntensity, setRefIntensity] = useState(DEFAULT_REFERENCE_INTENSITY);
  const effective = useMemo(() => applyMasterStyle(settings, style, styleIntensity), [settings, style, styleIntensity]);
  const [preview, setPreview] = useState<{ stereo: Stereo; metrics: MasterMetrics; key: string } | null>(null);
  const [server, setServer] = useState<ServerState>({ available: true, tier: null, options: [], usage: null, masters: null });
  const [serverLoaded, setServerLoaded] = useState(false);
  const [autoArmed, setAutoArmed] = useState(false);
  const [sm, setSm] = useState<ServerMaster>({ phase: "idle" });
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  /** Why the last order failed. Kept apart from `sm`: an earlier finished master comes back on the screen. */
  const [failCode, setFailCode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<"signed_out" | "server" | null>(null);
  const [offline, setOffline] = useState(false);
  /** The reference was swapped / its strength moved after the finished master. */
  const [refDirty, setRefDirty] = useState(false);
  const [dl, setDl] = useState<{ key: string; status: "working" | "pending" | "done" | "error" | "limit"; jobId?: string; code?: string; reason?: LimitCode; songLimit?: number } | null>(null);
  /** Live E3 progress of the running master / download job (stage + overall %). */
  const [prog, setProg] = useState<{ master: JobProgress | null; dl: JobProgress | null }>({ master: null, dl: null });
  const [ab, setAb] = useState<"mix" | "master">("master");
  const [matched, setMatched] = useState(true);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode; gain: GainNode; startedAt: number; offset: number } | null>(null);
  /** Where A/B listening stopped (seconds): switching and resuming continue from here. */
  const playPos = useRef(0);
  const settingsKey = masterKeyOf(target, effective);
  const [previewFailed, setPreviewFailed] = useState<string | null>(null);
  const [previewTry, setPreviewTry] = useState(0);
  const docVersion = doc.project.documentVersion;
  const docVersionRef = useRef(docVersion);
  useEffect(() => {
    docVersionRef.current = docVersion;
  }, [docVersion]);
  const masterPoll = useRef<AbortController | null>(null);
  const dlPoll = useRef<AbortController | null>(null);
  const prevMaster = useRef<{ done: DoneMaster; approved: boolean } | null>(null);
  /** Object URLs of joined results: they hold the whole file in memory until revoked. */
  const objectUrls = useRef<string[]>([]);
  useEffect(() => () => {
    masterPoll.current?.abort();
    dlPoll.current?.abort();
    for (const u of objectUrls.current.splice(0)) URL.revokeObjectURL(u);
  }, []);
  const resultRef = useRef({ hasResult: false });
  useEffect(() => {
    resultRef.current = { hasResult: sm.phase === "done" };
  }, [sm.phase]);

  const stop = useCallback(() => {
    const a = audioRef.current;
    audioRef.current = null;
    if (a) {
      // Detach first: the old source's async onended must not flip "playing" off for the next one.
      a.src.onended = null;
      playPos.current = a.offset + Math.max(0, a.ctx.currentTime - a.startedAt);
      try { a.src.stop(); } catch { /* already stopped */ }
      void a.ctx.close();
    }
    setPlaying(false);
  }, []);
  useEffect(() => () => stop(), [stop]);

  // 1) Bounce the mix for the current document version. A change made meanwhile (undo, BITEK, another tab)
  //    means a new version: the preview is rendered again and a master of the old mix is no longer offered.
  const renderedVersion = useRef<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const again = renderedVersion.current !== null && renderedVersion.current !== docVersion;
    const timer = window.setTimeout(() => {
      renderedVersion.current = docVersion;
      if (again) {
        stop();
        playPos.current = 0;
        setMix(null);
        setPreview(null);
        setRenderPct(0);
        if (resultRef.current.hasResult) setMixChanged(true);
        prevMaster.current = null;
        setSm((cur) => (cur.phase === "done" ? { phase: "idle" } : cur));
        setApproved(false);
      }
      setRenderFailed(false);
      setMissingTrack(null);
      void (async () => {
        try {
          const input = await loadMasterMix({ doc, resolveSourceUrl: resolveClipSourceUrl, sampleRate: MASTER_RENDER_SAMPLE_RATE, signal: controller.signal, onProgress: (f) => setRenderPct(Math.round(f * 80)) });
          if (controller.signal.aborted) return;
          if (!input) return setRenderFailed(true);
          const r = await renderApprovedMix(input);
          if (!controller.signal.aborted) setMix({ stereo: r.mix, raw: r.raw, metrics: r.mixMetrics });
        } catch (error) {
          if (controller.signal.aborted) return;
          setMissingTrack(error instanceof MixSourceError ? error.track : null);
          setRenderFailed(true);
        }
      })();
    }, again ? 600 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one render per saved document version
  }, [docVersion, renderTry]);

  // 2) Server state: tier, download options, weekly counter, existing master.
  const loadServer = useCallback(async (): Promise<Record<string, unknown> | null> => {
    try {
      const r = await fetch(`/api/studio/projects/${projectId}/master`, { cache: "no-store" });
      if (!r.ok) {
        setLoadError(r.status === 401 ? "signed_out" : "server");
        return null;
      }
      const j = (await r.json()) as Record<string, unknown>;
      setLoadError(null);
      setServer({ available: j.available !== false, tier: (j.tier as Tier | undefined) ?? null, options: Array.isArray(j.options) ? (j.options as Option[]) : [], usage: readUsage(j.usage), masters: (j.masters as ServerState["masters"] | undefined) ?? null });
      return j;
    } catch {
      setLoadError("server");
      return null;
    }
  }, [projectId]);

  /** Signed URL, or a joined object URL when the result is stored in ≤40 MB parts. */
  const resultUrl = useCallback(async (j: StudioJobBody): Promise<string | null> => {
    if (j.downloadUrl) return j.downloadUrl;
    if (!j.downloadParts?.length) return null;
    const ext = (j.filename ?? "").split(".").pop();
    const blob = await joinParts(j.downloadParts, ext === "zip" ? "application/zip" : ext === "mp3" ? "audio/mpeg" : ext === "flac" ? "audio/flac" : ext === "aiff" ? "audio/aiff" : "audio/wav");
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    objectUrls.current.push(url);
    return url;
  }, []);

  /** Fresh player address of a finished master (signed links live 10 minutes). */
  const refreshFinalUrl = useCallback(async (jobId: string): Promise<string | null> => {
    let url: string | null = null;
    let known = false;
    try {
      const r = await fetch(studioJobUrl(projectId, jobId), { cache: "no-store" });
      if (r.ok) {
        known = true;
        url = await resultUrl((await r.json()) as StudioJobBody);
      }
    } catch {
      // handled below: the button "try again" stays
    }
    setSm((cur) => (cur.phase === "done" && cur.jobId === jobId ? { ...cur, url: url ?? (known ? null : cur.url), urlState: url ? "ready" : "none" } : cur));
    return url;
  }, [projectId, resultUrl]);

  const failMaster = useCallback(async (code: string) => {
    setFailCode(code);
    if (masterErrorKey(code) === "referenceInvalid") {
      refStateRef.current = { ...refStateRef.current, reference: null };
      setRefState((cur) => ({ ...cur, reference: null }));
    }
    const prev = prevMaster.current;
    prevMaster.current = null;
    setSm(prev ? prev.done : { phase: "failed", code });
    setApproved(prev?.approved ?? false);
    // A failed or cancelled master is not counted by the server: bring the counter (and the button) back.
    requestPlanUsageRefresh();
    await loadServer();
  }, [loadServer]);

  const followMaster = useCallback(async (jobId: string, made: MadeWith | null) => {
    masterPoll.current?.abort();
    const controller = new AbortController();
    masterPoll.current = controller;
    setOffline(false);
    setSm({ phase: "working", jobId });
    const out = await followStudioJob(projectId, jobId, {
      signal: controller.signal,
      onUpdate: (body) => setProg((p) => ({ ...p, master: jobProgressOf(body.job ?? {}, p.master) })),
      onConnection: (ok) => setOffline(!ok),
    });
    if (out.kind === "aborted" || controller.signal.aborted) return;
    setOffline(false);
    if (out.kind === "pending" || out.kind === "signed_out") return setSm({ phase: "waiting", jobId, reason: out.kind });
    if (out.kind === "missing") return void failMaster("network");
    if (out.kind === "failed") return void failMaster(out.code);
    const version = out.body.job?.sourceDocumentVersion;
    if (version != null && version !== docVersionRef.current) return void failMaster("doc_changed");
    setProg((p) => ({ ...p, master: { stage: "done", progress: 100 } }));
    const url = await resultUrl(out.body).catch(() => null);
    if (controller.signal.aborted) return;
    prevMaster.current = null;
    setRefDirty(false);
    requestPlanUsageRefresh();
    setSm({ phase: "done", jobId, url, urlState: url ? "ready" : "none", metrics: (out.body.job?.metrics as DoneMaster["metrics"]) ?? null, made });
  }, [failMaster, projectId, resultUrl]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const j = await loadServer();
      if (!live) return;
      if (!j) return setServerLoaded(true);
      if (j.available === false) {
        setSm({ phase: "unavailable" });
        return setServerLoaded(true);
      }
      // After a reload / Back to Mix: a running or finished master of this very mix is still there. Ordering
      // another one would spend the monthly limit again.
      const latest = (j.latest ?? null) as JobView | null;
      const current = (v: JobView | null) => !!v?.id && (v.sourceDocumentVersion == null || j.documentVersion == null || v.sourceDocumentVersion === j.documentVersion);
      const running = latest && current(latest) && (latest.status === "queued" || latest.status === "running") ? latest : null;
      const approvedJob = j.approved && (j.approved as JobView).status === "succeeded" ? (j.approved as JobView) : null;
      const view = running ?? approvedJob ?? (latest && current(latest) && latest.status === "succeeded" ? latest : null);
      if (view?.id) {
        const madeTarget = view.target && isMasterTargetId(view.target) ? view.target : (initialState?.target ?? "streaming");
        const madeSettings = clampMasterSettings(view.settings ?? DEFAULT_MASTER_SETTINGS);
        const madeStyle = isMasterStyleId(view.style) ? view.style : null;
        const madeIntensity = typeof view.styleIntensity === "number" && madeStyle ? view.styleIntensity : DEFAULT_MASTER_INTENSITY;
        const made: MadeWith = { key: masterKeyOf(madeTarget, applyMasterStyle(madeSettings, madeStyle, madeIntensity)), target: madeTarget, settings: madeSettings, style: madeStyle, styleIntensity: madeIntensity };
        setTarget(madeTarget);
        setSettings(madeSettings);
        setStyle(madeStyle);
        setStyleIntensity(madeIntensity);
        if (running) {
          setProg((p) => ({ ...p, master: { stage: "queued", progress: 0 } }));
          void followMaster(view.id, made);
        } else {
          setSm({ phase: "done", jobId: view.id, url: null, urlState: "loading", metrics: (view.metrics as DoneMaster["metrics"]) ?? null, made });
          setApproved(view === approvedJob);
          await refreshFinalUrl(view.id);
        }
      }
      if (live) setServerLoaded(true);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per project; the callbacks are stable
  }, [projectId]);

  const autoPhase = useRef<"off" | "clarity" | "commit" | "done">("off");
  const autoOwnsBubble = useRef(false);
  useEffect(() => {
    if (!autoPipeline) {
      clearAutoMasterHandoff();
      return;
    }
    let live = true;
    const id = window.setTimeout(() => {
      if (!live || autoPhase.current !== "off" || !readAutoMasterHandoff(projectId)) return;
      autoPhase.current = "clarity";
      autoOwnsBubble.current = true;
      clearAutoMasterHandoff();
      setAutoArmed(true);
    }, 0);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [autoPipeline, projectId]);

  // 3) Approximate browser preview whenever target/settings change.
  useEffect(() => {
    if (!mix) return;
    let live = true;
    const key = settingsKey;
    const h = setTimeout(() => {
      void renderMasterPreview(mix.stereo, target, effective).then((r) => {
        if (!live) return;
        setPreviewFailed(null);
        setPreview({ stereo: r.preview, metrics: r.metrics, key });
      }).catch(() => {
        if (live) setPreviewFailed(key);
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [mix, target, effective, settingsKey, previewTry]);

  const previewFresh = preview?.key === settingsKey ? preview : null;
  const verdict = useMemo(() => (preview ? buildMasterVerdict(preview.metrics, target, effective) : null), [preview, target, effective]);

  const play = (which: "mix" | "master") => {
    stop();
    const s = which === "mix" ? mix?.stereo : preview?.stereo;
    if (!s || !mix || !preview) return;
    const ctx = new AudioContext({ sampleRate: s.sampleRate });
    const src = ctx.createBufferSource();
    src.buffer = stereoToAudioBuffer(ctx, s);
    const gain = ctx.createGain();
    gain.gain.value = abGain(which, matched);
    src.connect(gain);
    gain.connect(ctx.destination);
    const offset = playPos.current < src.buffer.duration - 0.1 ? playPos.current : 0;
    src.onended = () => {
      if (audioRef.current?.src === src) {
        stop();
        playPos.current = 0;
      }
    };
    src.start(0, offset);
    audioRef.current = { ctx, src, gain, startedAt: ctx.currentTime, offset };
    setPlaying(true);
  };
  /** Loudness-matched A/B: the mix is brought to the master's LUFS (never above, the master is limited). */
  function abGain(which: "mix" | "master", on: boolean): number {
    if (which !== "mix" || !on || !mix || !preview || !Number.isFinite(preview.metrics.lufs) || !Number.isFinite(mix.metrics.lufs)) return 1;
    return Math.pow(10, Math.min(12, preview.metrics.lufs - mix.metrics.lufs) / 20);
  }
  const switchAb = (which: "mix" | "master") => {
    if (which === ab) return;
    setAb(which);
    if (playing) play(which);
  };
  const chooseMatched = (on: boolean) => {
    setMatched(on);
    const a = audioRef.current;
    if (a) a.gain.gain.value = abGain(ab, on);
  };

  const locked = sm.phase === "working" || sm.phase === "waiting";
  /** The finished master was made with other settings than the ones on the screen. */
  const staleSettings = sm.phase === "done" && (refDirty || (sm.made !== null && sm.made.key !== settingsKey));
  const onReferenceState = (next: MasterReferenceState) => {
    const prev = refStateRef.current;
    refStateRef.current = next;
    setRefState(next);
    if (referenceEditInvalidatesMaster(
      { loaded: prev.loaded, referenceId: prev.reference?.id ?? null },
      next.reference?.id ?? null,
    )) {
      setRefDirty(true);
    }
  };
  const sessionLive = useRef<MasterSessionSnap>({
    settings: { ...DEFAULT_MASTER_SETTINGS },
    target: initialState?.target ?? "streaming",
    style: initialState?.style ?? null,
    styleIntensity: DEFAULT_MASTER_INTENSITY,
  });
  const commitSessionRef = useRef(onCommitMasterSession);
  const intensityBefore = useRef<MasterSessionSnap | null>(null);
  useEffect(() => {
    commitSessionRef.current = onCommitMasterSession;
    if (intensityBefore.current) return;
    sessionLive.current = {
      settings: { ...settings },
      target,
      style,
      styleIntensity,
    };
  });
  const cloneSession = (snap: MasterSessionSnap): MasterSessionSnap => ({
    settings: { ...snap.settings },
    target: snap.target,
    style: snap.style,
    styleIntensity: snap.styleIntensity,
  });
  const commitSession = (before: MasterSessionSnap, after: MasterSessionSnap) => {
    sessionLive.current = after;
    commitSessionRef.current?.(cloneSession(before), cloneSession(after));
  };
  const step = (key: MasterSettingKey, value: number) => {
    if (locked) return;
    const before = cloneSession(sessionLive.current);
    const settingsNext = clampMasterSettings({ ...before.settings, [key]: value });
    setSettings(settingsNext);
    commitSession(before, { ...before, settings: settingsNext });
  };
  const replaceSettings = (nextSettings: MasterSettings): boolean => {
    if (locked) return false;
    const before = cloneSession(sessionLive.current);
    const settingsNext = clampMasterSettings(nextSettings);
    if (MASTER_SETTING_KEYS.every((k) => before.settings[k] === settingsNext[k])) return false;
    setSettings(settingsNext);
    commitSession(before, { ...before, settings: { ...settingsNext } });
    return true;
  };
  const chooseTarget = (id: MasterTargetId): boolean => {
    if (locked) return false;
    const before = cloneSession(sessionLive.current);
    if (before.target === id) return false;
    setTarget(id);
    commitSession(before, { ...before, target: id });
    return true;
  };
  const chooseStyle = (next: MasterStyleId | null) => {
    if (locked) return;
    const before = cloneSession(sessionLive.current);
    if (before.style === next) return;
    setStyle(next);
    commitSession(before, { ...before, style: next });
  };
  const onIntensity = (value: number) => {
    if (locked) return;
    const before = intensityBefore.current ? null : cloneSession(sessionLive.current);
    const after = { ...sessionLive.current, styleIntensity: value, settings: { ...sessionLive.current.settings } };
    sessionLive.current = after;
    setStyleIntensity(value);
    if (before && before.styleIntensity !== value) commitSessionRef.current?.(before, cloneSession(after));
  };
  const onIntensityPhase = (phase: "start" | "end") => {
    if (phase === "start") {
      intensityBefore.current = cloneSession(sessionLive.current);
      return;
    }
    const before = intensityBefore.current;
    intensityBefore.current = null;
    // A click on the slider that changes nothing is not an undo step.
    if (!before || before.styleIntensity === sessionLive.current.styleIntensity) return;
    commitSessionRef.current?.(before, cloneSession(sessionLive.current));
  };
  const applySession = (snap: MasterSessionSnap) => {
    const settingsNext = clampMasterSettings(snap.settings);
    const targetNext: MasterTargetId = isMasterTargetId(snap.target)
      ? snap.target
      : isMasterTargetId(sessionLive.current.target)
        ? sessionLive.current.target
        : "streaming";
    const styleNext = isMasterStyleId(snap.style) ? snap.style : null;
    sessionLive.current = {
      settings: { ...settingsNext },
      target: targetNext,
      style: styleNext,
      styleIntensity: snap.styleIntensity,
    };
    setSettings(settingsNext);
    setTarget(targetNext);
    setStyle(styleNext);
    setStyleIntensity(snap.styleIntensity);
  };
  const useReference = !!refState.gate?.allowed && refState.reference?.status === "ready";
  const measured = preview?.metrics ?? mix?.metrics ?? null;
  const streaming = useMemo(() => (measured ? buildStreamingReadiness(measured) : null), [measured]);
  // Entering from the bottom of the Mix step left the page scrolled into the empty render area, and
  // scroll anchoring kept pushing it down as the mix and the preview arrived. While the step is fresh
  // (first 8 s), bring its top back into view whenever that content lands.
  const stepRootRef = useRef<HTMLDivElement | null>(null);
  const stepMountedAtRef = useRef(0);
  const hasMix = Boolean(mix);
  const hasPreview = Boolean(preview);
  // Scroll anchoring pinned the page to the footer while the step grew above it (prod 2026-11-21).
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflowAnchor;
    html.style.overflowAnchor = "none";
    return () => {
      html.style.overflowAnchor = prev;
    };
  }, []);
  useEffect(() => {
    const el = stepRootRef.current;
    if (!el) return;
    const now = performance.now();
    if (stepMountedAtRef.current === 0) stepMountedAtRef.current = now;
    if (now - stepMountedAtRef.current > 8000) return;
    // 230 px: below the sticky site header + sticky transport (scroll-mt-60 keeps it clear).
    if (el.getBoundingClientRect().top < 230) el.scrollIntoView({ block: "start" });
  }, [hasMix, hasPreview]);
  const latest = useRef({ settings, target, verdict, measured });
  useEffect(() => {
    latest.current = { settings, target, verdict, measured };
  });
  useEffect(() => {
    if (!applyRef) return;
    applyRef.current = (key, value) => step(key, value);
    return () => {
      applyRef.current = null;
    };
  });
  const stepRef = useRef(step);
  const sessionApi = useRef({ replaceSettings, chooseTarget, applySession });
  useEffect(() => {
    stepRef.current = step;
    sessionApi.current = { replaceSettings, chooseTarget, applySession };
    if (!sessionRef) return;
    sessionRef.current = { apply: (snap) => sessionApi.current.applySession(snap) };
    return () => {
      sessionRef.current = null;
    };
  });
  const getChatContext = useCallback((): BitekClientContext => {
    const cur = latest.current;
    const base = buildBitekClientContext({
      doc,
      lang: locale === "en" ? "en" : "pl",
      step: "master",
      master: {
        target: cur.target,
        settings: cur.settings,
        cards: (cur.verdict?.cards ?? []).map((c) => ({
          id: c.id,
          status: c.status,
          value: c.value,
          note: typeof c.params.band === "string" ? `${c.messageKey}:${c.params.band}` : c.messageKey,
        })),
      },
    });
    if (cur.measured && Number.isFinite(cur.measured.lufs)) {
      base.context = {
        ...base.context,
        analysis: {
          overall: "na",
          stale: false,
          cards: [],
          masterIntegratedLufs: cur.measured.lufs,
          masterTruePeakDbtp: Number.isFinite(cur.measured.truePeakDb) ? cur.measured.truePeakDb : null,
        },
      };
    }
    return {
      ...base,
      applyMasterStyle: (styleId: BitekMasterStyle) => {
        const settingsNow = sessionLive.current.settings;
        const next = applyMasterStyle(settingsNow, styleId, DEFAULT_MASTER_INTENSITY);
        const changed = MASTER_SETTING_KEYS.some((key) => next[key] !== settingsNow[key]);
        return changed && sessionApi.current.replaceSettings(next);
      },
      applyMasterClarity: (patch) => {
        const settingsNow = sessionLive.current.settings;
        const next = clampMasterSettings({ ...settingsNow, ...patch });
        const changed = MASTER_SETTING_KEYS.some((key) => next[key] !== settingsNow[key]);
        return changed && sessionApi.current.replaceSettings(next);
      },
      applyMasterTarget: (next: BitekMasterTarget) => sessionApi.current.chooseTarget(next),
    };
  }, [doc, locale]);
  useEffect(() => {
    if (!chatContextRef) return;
    chatContextRef.current = getChatContext;
    return () => {
      chatContextRef.current = null;
    };
  }, [chatContextRef, getChatContext]);

  async function makeMaster() {
    if (!mix || locked) return;
    stop();
    prevMaster.current = sm.phase === "done" ? { done: sm, approved } : null;
    const made: MadeWith = { key: settingsKey, target, settings: { ...settings }, style, styleIntensity };
    let jobId: string | null = null;
    setFailCode(null);
    setMixChanged(false);
    setApproveError(null);
    setSm({ phase: "working", jobId: null });
    setProg((p) => ({ ...p, master: { stage: "queued", progress: 0 } }));
    setApproved(false);
    const post = async (body: Record<string, unknown>) => {
      const r = await fetch(`/api/studio/projects/${projectId}/master`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
    };
    try {
      const prep = await post({ action: "prepare" });
      if (prep.json.available === false) return setSm({ phase: "unavailable" });
      if (typeof prep.json.jobId !== "string") return void failMaster(refusalCode(prep.status, prep.json.error));
      jobId = prep.json.jobId;
      // E3 renders the mix itself from the saved project (same DSP as this preview).
      const commit = await post({
        action: "commit", jobId, target, settings, documentVersion: docVersionRef.current,
        ...(style ? { style, styleIntensity } : {}),
        ...(useReference && refState.reference ? { referenceId: refState.reference.id, referenceIntensity: refIntensity } : {}),
      });
      if (commit.json.available === false) return setSm({ phase: "unavailable" });
      if (commit.json.masters) setServer((s) => ({ ...s, masters: commit.json.masters as ServerState["masters"] }));
      if (!commit.json.ok) return void failMaster(refusalCode(commit.status, commit.json.error));
      requestPlanUsageRefresh();
      // The reference is single-use: E3 deletes it right after this master.
      if (useReference) {
        refStateRef.current = { ...refStateRef.current, reference: null };
        setRefState((r) => ({ ...r, reference: null }));
      }
    } catch {
      // The connection dropped. Before the job id exists nothing was ordered; after it the server may have taken
      // the order, so ask about the job (a missing job = nothing queued) instead of calling it a failure.
      if (!jobId) return void failMaster("network");
    }
    await followMaster(jobId, made);
  }

  const approveRef = useRef<() => void>(() => {});
  async function approve() {
    if (sm.phase !== "done" || approving) return;
    setApproving(true);
    setApproveError(null);
    try {
      const r = await fetch(`/api/studio/projects/${projectId}/master/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: sm.jobId }) });
      if (r.ok) return setApproved(true);
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setApproveError(refusalCode(r.status, j.error));
    } catch {
      setApproveError("network");
    } finally {
      setApproving(false);
    }
  }
  useEffect(() => {
    approveRef.current = () => void approve();
  });

  async function deliver(kind: DeliverKind, format: DeliverFormat) {
    const key = `${kind}-${format}`;
    if (dl?.status === "working" || dl?.status === "pending") return;
    setDl({ key, status: "working" });
    setProg((p) => ({ ...p, dl: { stage: "queued", progress: 0 } }));
    const post = (body: Record<string, unknown>) =>
      fetch(`/api/studio/projects/${projectId}/deliver`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, format, ...body }) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    let jobId: string | null = null;
    const refused = (status: number, json: { error?: unknown; songs?: { limit?: unknown } }) => {
      const code = refusalCode(status, json.error);
      // Only our own limit codes mean "used up" — a 429 from the request limiter does not.
      if (isLimitCode(code)) return setDl({ key, status: "limit", reason: code, songLimit: typeof json.songs?.limit === "number" ? json.songs.limit : undefined });
      setDl({ key, status: "error", code });
    };
    try {
      const prep = await post({ action: "prepare" });
      if (!prep.json.ok) return refused(prep.status, prep.json);
      jobId = String(prep.json.jobId);
      const commit = await post({ action: "commit", jobId, documentVersion: docVersionRef.current });
      if (commit.json.usage) setServer((s) => ({ ...s, usage: readUsage(commit.json.usage) }));
      if (!commit.json.ok) return refused(commit.status, commit.json);
      requestPlanUsageRefresh();
    } catch {
      if (!jobId) return setDl({ key, status: "error", code: "network" });
    }
    await followDownload(key, jobId);
  }

  async function followDownload(key: string, jobId: string) {
    dlPoll.current?.abort();
    const controller = new AbortController();
    dlPoll.current = controller;
    setDl({ key, status: "working", jobId });
    const out = await followStudioJob(projectId, jobId, {
      signal: controller.signal,
      onUpdate: (body) => setProg((p) => ({ ...p, dl: jobProgressOf(body.job ?? {}, p.dl) })),
      onConnection: (ok) => setOffline(!ok),
    });
    if (out.kind === "aborted" || controller.signal.aborted) return;
    setOffline(false);
    if (out.kind === "pending" || out.kind === "signed_out") return setDl({ key, status: "pending", jobId });
    if (out.kind === "missing") return setDl({ key, status: "error", code: "network" });
    if (out.kind === "failed") {
      requestPlanUsageRefresh();
      setDl({ key, status: "error", code: out.code });
      return void loadServer();
    }
    setProg((p) => ({ ...p, dl: { stage: "done", progress: 100 } }));
    const url = await resultUrl(out.body).catch(() => null);
    if (controller.signal.aborted) return;
    if (!url) return setDl({ key, status: "pending", jobId });
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    if (out.body.filename) a.download = out.body.filename;
    a.click();
    setDl({ key, status: "done" });
  }

  // BITEK — short, first person, mood follows the state.
  const [pendingBack, setPendingBack] = useState(0);
  useEffect(() => {
    if (pendingBack > 0) onBackToMix();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per click from the bubble
  }, [pendingBack]);
  const refReport = sm.phase === "done" && isReferenceMatchReport(sm.metrics?.after?.reference) ? sm.metrics.after.reference : null;
  const refLines = useMemo(() => (refReport ? explainReferenceMatch(refReport).map((l) => t(`referencja.bitek.${l.key}`, {
    ...("db" in l ? { db: l.db.toLocaleString(locale === "en" ? "en-US" : "pl-PL") } : {}),
    ...("band" in l ? { band: t(`referencja.pasma.${l.band}`) } : {}),
    ...("lufs" in l ? { lufs: l.lufs.toLocaleString(locale === "en" ? "en-US" : "pl-PL"), refLufs: l.refLufs.toLocaleString(locale === "en" ? "en-US" : "pl-PL") } : {}),
    ...("pct" in l ? { pct: l.pct } : {}),
  })) : null), [refReport, t, locale]);
  const worst: MasterCard | null = verdict?.cards.find((c) => c.status === "red") ?? verdict?.cards.find((c) => c.status === "yellow") ?? null;
  const [manual, setManual] = useState<ManualIssue | null>(null);
  const dismissedManual = useRef(new Set<string>());
  const masterSeen = useRef<string | null>(null);
  const masterSig = `${target}:${settings.loudness}:${previewFresh?.metrics.truePeakDb ?? ""}`;
  useEffect(() => {
    if (masterSeen.current === null) {
      masterSeen.current = masterSig;
      return;
    }
    if (masterSeen.current === masterSig) return;
    const timer = window.setTimeout(() => {
      if (autoOwnsBubble.current) return;
      masterSeen.current = masterSig;
      const issue = previewFresh
        ? watchMasterManual({
            lang: locale === "en" ? "en" : "pl",
            measuredLufs: previewFresh.metrics.lufs,
            truePeakDb: previewFresh.metrics.truePeakDb,
            targetLufs: MASTER_TARGETS[target].lufs,
            ceilingDb: MASTER_TARGETS[target].tp,
            loudness: settings.loudness,
          })
        : null;
      if (!issue || dismissedManual.current.has(issue.key)) {
        setManual((cur) => (cur && dismissedManual.current.has(cur.key) ? null : cur));
        return;
      }
      setManual(issue);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [masterSig, previewFresh, locale, target, settings.loudness]);
  const bubble = useMemo<BitekBubble>(() => {
    if (manual) {
      return {
        key: `manual-${manual.key}`,
        mood: "alert",
        text: manual.text,
        actions: [
          {
            id: "poprawSam",
            label: tBitek("akcja.poprawSam"),
            onClick: () => {
              dismissedManual.current.add(manual.key);
              setManual(null);
            },
          },
          ...(manual.fix?.kind === "masterLoudness"
            ? [{
                id: "zrobZaMnie",
                label: tBitek("akcja.zrobZaMnie"),
                primary: true,
                onClick: () => {
                  dismissedManual.current.add(manual.key);
                  setManual(null);
                  if (manual.fix?.kind === "masterLoudness") stepRef.current("loudness", manual.fix.value);
                },
              }]
            : []),
        ],
      };
    }
    const back = { id: "backToMix", label: tBitek("akcja.backToMix"), onClick: () => setPendingBack((n) => n + 1) };
    let mood: BitekMood = "happy";
    let text: string;
    let key: string;
    if (renderFailed) [mood, text, key] = ["alert", missingTrack ? t("brakNagrania", { nazwa: missingTrack }) : t("renderBlad"), "m-renderfail"];
    else if (!mix) [mood, text, key] = ["thinking", t("bitek.renderuje"), "m-render"];
    else if (approved) [mood, text, key] = ["done", `${t("bitek.zatwierdzone")} ${t("bitek.copoDalej")}`, "m-approved"];
    else if (sm.phase === "done" && refLines) return { key: "m-done-ref", mood: "done", text: t("referencja.bitek.gotowe"), details: refLines, actions: [back] };
    else if (sm.phase === "done") {
      // Master rendered: Bitek asks, the user listens in the player and decides.
      return {
        key: `m-ask-${sm.jobId}`,
        mood: "done",
        text: `${t(`bitek.gotowe.${sm.made?.target ?? target}`)} ${streaming ? t("streaming.bitek", { score: streaming.score }) + " " : ""}${t("bitek.pytanieMaster")}`,
        details: streaming?.notes.map((n) => t(`streaming.uwagi.${n.key}`, n.params)),
        actions: [
          { id: "approveMaster", label: t("zatwierdz"), primary: true, onClick: () => approveRef.current() },
          back,
        ],
      };
    }
    else if (sm.phase === "waiting") [mood, text, key] = ["thinking", t("czekaPending"), "m-waiting"];
    else if (sm.phase === "working") [mood, text, key] = ["thinking", prog.master ? t(`bitek.etap.${prog.master.stage}`, { pct: prog.master.progress }) : t("bitek.masterTrwa"), `m-working-${prog.master?.stage ?? "start"}`];
    else if (sm.phase === "failed") [mood, text, key] = ["alert", t("bitek.blad"), "m-failed"];
    else if (worst?.status === "red") [mood, text, key] = ["alert", t("bitek.problem", { card: t(`cards.${worst.id}.title`) }), `m-red-${worst.id}`];
    else [mood, text, key] = ["happy", t("bitek.gotowy"), "m-ready"];
    return { key, mood, text, details: mix && !approved ? [t("bitek.wrocInfo"), ...(sm.phase === "unavailable" ? [t("bitek.niedostepny")] : [])] : undefined, actions: approved ? [] : [back] };
  }, [manual, renderFailed, missingTrack, mix, approved, sm, target, worst, t, tBitek, prog.master, refLines, streaming]);
  useEffect(() => {
    onBitekBubble?.(bubble);
  }, [bubble, onBitekBubble]);
  useEffect(() => () => onBitekBubble?.(null), [onBitekBubble]);

  const fmtN = (n: number, d = 1) => (Number.isFinite(n) ? n.toLocaleString(locale === "en" ? "en-US" : "pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d }) : "−∞");
  /** Card numbers come from the analysis with a dot; Polish reads a comma. */
  const locNum = (v: string) => (locale === "en" ? v : v.replace(/(\d)\.(\d)/g, "$1,$2"));
  const locParams = (params: Record<string, string | number>) => Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === "string" ? locNum(v) : v]));
  const errorText = (code: string | null | undefined) => {
    const key = masterErrorKey(code);
    return key === "other" ? null : t(`bledy.${key}`);
  };
  const signed = (n: number) => (n > 0 ? `+${fmtN(n, n % 1 ? 1 : 0)}` : n < 0 ? `−${fmtN(-n, n % 1 ? 1 : 0)}` : "0");
  const madeTarget = sm.phase === "done" && sm.made ? sm.made.target : target;
  const madeStyle = sm.phase === "done" && sm.made ? sm.made.style : style;
  const plan = server.tier ? t(`plany.${server.tier}`) : null;
  const usage = server.usage;
  const freeWatermark = server.options.some((o) => o.watermark);
  const dailyReached = usage?.dailyLimit != null && (usage.dailyUsed ?? 0) >= usage.dailyLimit;
  const weekReached = usage?.weekLimit != null && usage.used >= usage.weekLimit;
  const limitReached = dailyReached || weekReached;
  const exhausted: "day" | "week" | "songs" | null = dl?.status === "limit"
    ? (dl.reason === "song_day_limit" ? "songs" : dl.reason === "daily_limit" ? "day" : "week")
    : dailyReached ? "day" : weekReached ? "week" : null;
  const resetIso = dailyReached && weekReached
    ? laterReset(usage?.dailyResetAt, usage?.resetAt)
    : dailyReached ? (usage?.dailyResetAt ?? null) : weekReached ? (usage?.resetAt ?? null) : null;
  const mastersLeft = server.masters ? Math.max(0, server.masters.monthLimit - server.masters.used) : null;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "pl-PL", { timeZone: "Europe/Warsaw", day: "numeric", month: "long" });

  useEffect(() => {
    if (!autoArmed || autoPhase.current === "off" || autoPhase.current === "done") return;
    const freshPreview = previewFresh;
    const plan = freshPreview && verdict
      ? planMasterClarity({
          settings,
          cards: verdict.cards.map((card) => ({
            id: card.id,
            status: card.status,
            value: card.value,
            note: typeof card.params.band === "string" ? `${card.messageKey}:${card.params.band}` : card.messageKey,
          })),
          measuredLufs: Number.isFinite(freshPreview.metrics.lufs) ? freshPreview.metrics.lufs : null,
          truePeakDb: Number.isFinite(freshPreview.metrics.truePeakDb) ? freshPreview.metrics.truePeakDb : null,
          target,
          lang: locale === "en" ? "en" : "pl",
          targetName: target,
        })
      : null;
    const decision = nextAutoMasterStep({
      phase: autoPhase.current === "commit" ? "commit" : "clarity",
      mixReady: Boolean(mix),
      previewFresh: Boolean(freshPreview),
      serverLoaded,
      blocked: sm.phase !== "idle" || mastersLeft === 0,
      hasClarityMoves: Boolean(plan && plan.moves.length > 0),
    });
    if (decision === "wait") return;
    if (decision === "stop") {
      autoPhase.current = "done";
      return;
    }
    if (decision === "apply-clarity" && plan) {
      autoPhase.current = "commit";
      const next = { ...sessionLive.current.settings };
      for (const move of plan.moves) next[move.key] = move.value;
      sessionApi.current.replaceSettings(next);
      return;
    }
    autoPhase.current = "done";
    void makeMaster();
    // makeMaster closes over the settings of this render. The ref phase stops a second run.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one render after the preview is fresh
  }, [autoArmed, mix, previewFresh, verdict, serverLoaded, sm.phase, mastersLeft, settings, target, locale]);

  return (
    <div ref={stepRootRef} data-testid="studio-master-step" className="flex scroll-mt-60 flex-col gap-3 pb-64 lg:pb-48">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={onBackToMix} data-testid="studio-master-back" aria-describedby="studio-master-back-hint">
          ← {t("wrocDoMixu")}
        </Button>
        <h2 className="brd-display text-2xl leading-none tracking-tight">{t("tytul")}</h2>
        <span id="studio-master-back-hint" className="text-xs text-[var(--brd-mute)]">{t("wrocUwaga")}</span>
      </div>

      {!mix && !renderFailed ? (
        <div className="flex flex-col gap-3" data-testid="studio-master-preparing">
          <div className="flex items-center gap-2" role="status">
            <progress className="h-2 w-40 accent-[var(--brd-amber)]" max={100} value={renderPct} aria-label={t("renderuje", { pct: renderPct })} />
            <span className="font-mono text-xs">{t("renderuje", { pct: renderPct })}</span>
          </div>
          {/* Audit 2026-11-21: a lone progress bar on an empty page — say what comes next and hold the layout. */}
          <ol className="flex flex-col gap-1 text-sm text-[var(--brd-ink-soft)]">
            <li className="font-semibold text-[var(--brd-ink)]">1. {t("przygotowanie.krok1", { n: doc.tracks.filter((tr) => !tr.muted).length })}</li>
            <li>2. {t("przygotowanie.krok2")}</li>
            <li>3. {t("przygotowanie.krok3")}</li>
          </ol>
          <div aria-hidden className="grid gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-line)]/20" />
            ))}
          </div>
          <div aria-hidden className="h-40 animate-pulse rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-line)]/20" />
        </div>
      ) : null}
      {mixChanged ? <p role="status" data-testid="studio-master-mix-changed" className="border-l-2 border-l-[var(--brd-amber)] pl-2 text-sm">{t("mixZmieniony")}</p> : null}
      {renderFailed ? (
        <p role="alert" data-testid="studio-master-render-failed" className="flex flex-wrap items-center gap-2 border-l-2 border-l-[var(--brd-rec)] pl-2 text-sm">
          {missingTrack ? t("brakNagrania", { nazwa: missingTrack }) : t("renderBlad")}
          <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setRenderTry((n) => n + 1)}>{t("sprobujPonownie")}</Button>
        </p>
      ) : null}

      {mix ? (
        <>
          <p className="border-l-2 border-l-[var(--brd-amber)] pl-2 text-sm">{t("calyNumer")}</p>

          <fieldset data-testid="studio-master-targets" disabled={locked} className="flex flex-col gap-2">
            <legend className="brd-display mb-1 text-base">{t("celTytul")}</legend>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {MASTER_TARGET_IDS.map((id) => (
                <label key={id} className={`flex cursor-pointer flex-col gap-0.5 rounded-[2px] border p-2 text-sm ${target === id ? "border-[var(--brd-ink)] bg-[var(--brd-recess)]" : "border-[var(--brd-line)] bg-[var(--brd-paper)]"}`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="studio-master-target" value={id} checked={target === id} onChange={() => chooseTarget(id)} data-testid={`studio-master-target-${id}`} />
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
              <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={locked} onClick={() => replaceSettings(DEFAULT_MASTER_SETTINGS)}>{t("reset")}</Button>
            </div>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-5">
              {MASTER_SETTING_KEYS.map((k) => {
                const name = t(`ustawienia.${k}`);
                return (
                  <li key={k} data-testid={`studio-master-setting-${k}`} className="flex items-center justify-between gap-1 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-1.5">
                    <span className="text-sm">{name}</span>
                    <span className="flex items-center gap-1">
                      <Button type="button" size="sm" variant="outline" className="min-h-11 min-w-11" aria-label={t("mniej", { name })} disabled={locked || settings[k] <= -3} onClick={() => step(k, settings[k] - 0.5)}>−</Button>
                      <output className="w-9 text-center font-mono text-sm" aria-live="polite">{signed(settings[k])}</output>
                      <Button type="button" size="sm" variant="outline" className="min-h-11 min-w-11" aria-label={t("wiecej", { name })} disabled={locked || settings[k] >= 3} onClick={() => step(k, settings[k] + 0.5)}>+</Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <StudioMasterStyleReference
            projectId={projectId}
            style={style}
            styleIntensity={styleIntensity}
            onStyle={chooseStyle}
            onStyleIntensity={onIntensity}
            onStyleIntensityPhase={onIntensityPhase}
            refState={refState}
            onRefState={onReferenceState}
            refIntensity={refIntensity}
            onRefIntensity={(v) => {
              if (v === refIntensity) return;
              setRefIntensity(v);
              setRefDirty(true);
            }}
            disabled={locked}
          />

          <section aria-labelledby="studio-master-ab-title" data-testid="studio-master-ab" className="flex flex-wrap items-center gap-2 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-2">
            <h3 id="studio-master-ab-title" className="text-sm font-semibold">{t("abTytul")}</h3>
            <Button type="button" size="sm" className="min-h-11" disabled={!previewFresh && !playing} onClick={() => (playing ? stop() : play(ab))} data-testid="studio-master-play">
              {playing ? `■ ${t("stop")}` : `▶ ${t("graj")}`}
            </Button>
            {(["mix", "master"] as const).map((m) => (
              <Button key={m} type="button" size="sm" variant={ab === m ? "default" : "outline"} aria-pressed={ab === m} className="min-h-11" onClick={() => switchAb(m)} data-testid={`studio-master-ab-${m}`}>
                {m === "mix" ? t("abMix") : t("abMaster")}
              </Button>
            ))}
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={matched} onChange={(e) => chooseMatched(e.target.checked)} aria-describedby="studio-master-matched-hint" />
              {t("abWyrownane")}
            </label>
            <span id="studio-master-matched-hint" className="text-xs text-[var(--brd-mute)]">{t("abWyrownaneOpis")}</span>
            {previewFailed === settingsKey && !previewFresh ? (
              <p role="alert" data-testid="studio-master-preview-error" className="flex w-full flex-wrap items-center gap-2 text-sm text-[var(--brd-rec)]">
                {t("podgladBlad")}
                <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => { setPreviewFailed(null); setPreviewTry((n) => n + 1); }}>{t("sprobujPonownie")}</Button>
              </p>
            ) : (
              <p className="w-full text-xs text-[var(--brd-mute)]">{previewFresh ? t("podgladUwaga") : t("podgladLiczy")}</p>
            )}
          </section>

          {verdict ? (
            <section aria-labelledby="studio-master-cards-title">
              <h3 id="studio-master-cards-title" className="brd-display mb-1 text-base">{t("kartyTytul")}</h3>
              <p className="mb-1 text-xs text-[var(--brd-mute)]">{t("kartyLegenda")}</p>
              <ul data-testid="studio-master-cards" className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
                {verdict.cards.map((c) => (
                  <li key={c.id} data-testid="studio-master-card" data-card-id={c.id} data-status={c.status} className={`flex flex-col gap-1 rounded-[2px] border border-[var(--brd-line)] border-l-4 bg-[var(--brd-paper)] p-3 ${STATUS_RAIL[c.status]}`}>
                    <h4 className="text-sm font-semibold">
                      {STATUS_MARK[c.status] ? <span aria-hidden className="mr-1">{STATUS_MARK[c.status]}</span> : null}
                      {t(`cards.${c.id}.title`)}
                      {c.status === "na" ? null : <span className="sr-only"> — {t(`kartyStan.${c.status}`)}</span>}
                    </h4>
                    {c.value ? <p className="font-mono text-lg leading-none">{locNum(c.value)}</p> : null}
                    <p className="text-sm">{t(`cards.${c.id}.${c.messageKey}`, { ...locParams(c.params), band: typeof c.params.band === "string" ? t(`pasma.${c.params.band}`) : "" })}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Preview-based platform view. Hidden only when the change report (real master numbers) will render in its place. */}
          {/* Audit 2026-11-21: only after the first master preview — the raw mix numbers ("Jest cicho") misled. */}
          {streaming && preview && !(sm.phase === "done" && Number.isFinite(Number(sm.metrics?.after?.lufs))) ? (
            <section aria-labelledby="studio-master-streaming-title" data-testid="studio-master-streaming" data-score={streaming.score} className="flex flex-col gap-2 rounded-[2px] border border-[var(--brd-line)] border-l-4 bg-[var(--brd-paper)] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="studio-master-streaming-title" className="brd-display text-base">{t("streaming.tytul")}</h3>
                <p className="font-mono text-lg leading-none">{t("streaming.wynik", { score: streaming.score })}</p>
              </div>
              <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                {streaming.rows.map((r) => (
                  <li key={r.id} data-testid="studio-master-streaming-row" data-platform={r.id}>
                    <span className="font-semibold">{t(`streaming.serwis.${r.id}`)}</span>{" "}
                    <span className="text-[var(--brd-mute)]">({r.target} LUFS)</span>:{" "}
                    {t(`streaming.akcja.${r.action}`, { db: Math.abs(r.gainDb).toLocaleString(locale === "en" ? "en-US" : "pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}
                  </li>
                ))}
              </ul>
              <ul className="list-disc pl-5 text-sm">
                {streaming.notes.map((n) => (
                  <li key={n.key}>{t(`streaming.uwagi.${n.key}`, n.params)}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-[var(--brd-line)] pt-3">
            {loadError ? (
              <p role="alert" data-testid="studio-master-load-error" className="flex flex-wrap items-center gap-2 text-sm text-[var(--brd-rec)]">
                {t(loadError === "signed_out" ? "bledy.signedOut" : "stanBlad")}
                {loadError === "server" ? <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void loadServer()}>{t("sprobujPonownie")}</Button> : null}
              </p>
            ) : null}
            {server.tier === "FREE" && !freeWatermark && sm.phase !== "done" && !approved ? (
              <p data-testid="studio-master-free-heads-up" role="note" className="border-l-4 border-l-[var(--brd-amber)] bg-[var(--brd-paper)] px-3 py-2 text-sm">
                {t("freeUprzedzenie")}{" "}
                <StoreAppHidden><a href="/premium" className="font-semibold underline underline-offset-4">{t("zobaczPlany")}</a></StoreAppHidden>
              </p>
            ) : null}
            {staleSettings ? <p role="status" data-testid="studio-master-stale" className="border-l-4 border-l-[var(--brd-amber)] bg-[var(--brd-paper)] px-3 py-2 text-sm">{t("stareUstawienia")}</p> : null}
            {(sm.phase !== "done" && !approved) || staleSettings ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="lg" className="min-h-11 px-4" disabled={locked || sm.phase === "unavailable" || mastersLeft === 0} aria-describedby={server.masters ? "studio-master-quota" : undefined} onClick={() => void makeMaster()} data-testid="studio-master-make">
                  {mastersLeft === 0 ? "🔒 " : ""}
                  {sm.phase === "waiting" ? t("masterTrwa") : sm.phase === "working" ? (sm.jobId ? t("masterTrwa") : t("masterKolejka")) : t("zrobMaster")}
                </Button>
                {server.masters ? (
                  <p id="studio-master-quota" data-testid="studio-master-quota" data-left={mastersLeft ?? undefined} className={`text-sm ${mastersLeft === 0 ? "text-[var(--brd-rec)]" : "text-[var(--brd-mute)]"}`}>
                    {t("masteryMiesiac", { used: server.masters.used, limit: server.masters.monthLimit })}
                    {mastersLeft === 0 && server.masters.resetAt ? ` · ${t("masteryReset", { date: fmtDate(server.masters.resetAt) })}` : ""}
                  </p>
                ) : null}
                {sm.phase === "working" && prog.master ? <JobProgressBar value={prog.master} label={t(`etap.${prog.master.stage}`)} ariaLabel={t("postepAria")} testId="studio-master-progress" /> : null}
                {sm.phase === "working" && offline ? <p role="status" data-testid="studio-master-offline" className="text-sm">{t("offline")}</p> : null}
                {sm.phase === "waiting" ? (
                  <p role="status" data-testid="studio-master-waiting" className="flex flex-wrap items-center gap-2 text-sm">
                    {t(sm.reason === "signed_out" ? "czekaWylogowany" : "czekaPending")}
                    <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void followMaster(sm.jobId, null)} data-testid="studio-master-check">{t("sprawdzTeraz")}</Button>
                  </p>
                ) : null}
                {failCode === "monthly_limit" ? (
                  <p role="alert" data-testid="studio-master-limit" className="text-sm text-[var(--brd-rec)]">
                    {t("masteryLimit")}{" "}
                    {server.tier !== "GOLD" ? <StoreAppHidden><a href="/premium" className="underline underline-offset-4">{t("zobaczPlany")}</a></StoreAppHidden> : null}
                  </p>
                ) : failCode === "no_own_track" ? (
                  <p role="alert" data-testid="studio-master-no-own-track" className="text-sm text-[var(--brd-rec)]">{t("masterBezNagrania")}</p>
                ) : failCode ? <p role="alert" data-testid="studio-master-error" data-error-code={failCode} className="text-sm text-[var(--brd-rec)]">{errorText(failCode) ?? t("masterBlad")}</p> : null}
                {sm.phase === "unavailable" ? <p role="status" data-testid="studio-master-unavailable" className="text-sm">{t("serwerNiedostepny")}</p> : null}
              </div>
            ) : null}

            {sm.phase === "done" ? (
              <section aria-labelledby="studio-master-final-title" data-testid="studio-master-final" className="flex flex-col gap-2 rounded-[2px] border border-[var(--brd-line)] border-l-4 border-l-[var(--brd-green)] bg-[var(--brd-paper)] p-3">
                <h3 id="studio-master-final-title" className="brd-display text-lg">{t("finalTytul")}</h3>
                <p className="text-sm">{t("finalOpis")}</p>
                {sm.url ? <BrdAudioDeck src={sm.url} title="Master" testId="studio-master-final-audio" seed={`master:${projectId}`} onRefreshSrc={() => refreshFinalUrl(sm.jobId)} /> : sm.urlState === "loading" ? (
                  <p role="status" className="text-sm text-[var(--brd-mute)]">{t("odsluchWczytuje")}</p>
                ) : (
                  <p role="status" data-testid="studio-master-no-audio" className="flex flex-wrap items-center gap-2 text-sm">
                    {t("odsluchBrak")}
                    <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void refreshFinalUrl(sm.jobId)}>{t("sprobujPonownie")}</Button>
                  </p>
                )}
                {sm.metrics?.after ? (
                  <p className="font-mono text-xs">
                    {fmtN(Number(sm.metrics.after.lufs))} LUFS · {fmtN(Number(sm.metrics.after.truePeakDb))} dBTP · LRA {fmtN(Number(sm.metrics.after.lra))} LU
                  </p>
                ) : null}
                {refLines ? (
                  <div data-testid="studio-master-reference-explain" className="flex flex-col gap-1 border-l-4 border-l-[var(--brd-amber)] pl-2">
                    <p className="text-sm font-semibold">{t("referencja.bitek.gotowe")}</p>
                    <ul className="list-disc pl-5 text-sm">
                      {refLines.map((l) => <li key={l}>{l}</li>)}
                    </ul>
                  </div>
                ) : null}
                <StudioMasterReport mix={mix?.metrics ?? null} master={sm.metrics?.after ? { lufs: Number(sm.metrics.after.lufs), truePeakDb: Number(sm.metrics.after.truePeakDb), lra: Number(sm.metrics.after.lra) } : null} target={madeTarget} settings={sm.made?.settings ?? settings} style={madeStyle ? { id: madeStyle, intensity: sm.made?.styleIntensity ?? styleIntensity } : null} tpCeiling={MASTER_TARGETS[madeTarget].tp} />
                {approved ? (
                  <p role="status" className="text-sm font-semibold">✓ {t("zatwierdzone")}</p>
                ) : (
                  <>
                    <Button type="button" size="lg" className="min-h-11 self-start px-4" disabled={approving} onClick={() => void approve()} data-testid="studio-master-approve">
                      {approving ? t("zatwierdzTrwa") : t("zatwierdz")}
                    </Button>
                    {approveError ? <p role="alert" data-testid="studio-master-approve-error" className="text-sm text-[var(--brd-rec)]">{errorText(approveError) ?? t("zatwierdzBlad")}</p> : null}
                    <p className="text-xs text-[var(--brd-mute)]" data-testid="studio-master-approve-note">{t("zatwierdzUwaga")}</p>
                  </>
                )}
                {approved ? <StudioListenLinks projectId={projectId} /> : null}
              </section>
            ) : null}

            {approved && sm.phase === "done" ? (
              <CatalogPublishPanel projectId={projectId} masterJobId={sm.jobId} defaultTitle={doc.project.title} />
            ) : null}

            {approved ? (
              <section aria-labelledby="studio-master-dl-title" data-testid="studio-master-downloads" data-tier={server.tier ?? "guest"} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 id="studio-master-dl-title" className="brd-display text-lg">{t("pobierzTytul")}</h3>
                  {plan ? <span className="text-xs uppercase tracking-[0.12em] text-[var(--brd-mute)]">{t("planInfo", { plan })}</span> : null}
                </div>
                {!server.tier && !loadError && serverLoaded ? <p className="text-sm">{t("gosc")}</p> : null}
                {server.tier === "FREE" ? (
                  <p data-testid="studio-master-dl-free" role="status" className="flex flex-col gap-1 border-l-4 border-l-[var(--brd-amber)] bg-[var(--brd-paper)] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span>{freeWatermark ? t("freeZeZnakiem", { n: FREE_WATERMARK_PER_DAY }) : t("freeBezPobierania")}</span>
                    <StoreAppHidden><a href="/premium" className="font-semibold underline underline-offset-4">{t("zobaczPlany")}</a></StoreAppHidden>
                  </p>
                ) : null}
                {usage?.dailyLimit != null ? (
                  <p data-testid="studio-master-dl-counter" className={`text-sm ${limitReached ? "text-[var(--brd-rec)]" : ""}`}>
                    {t("licznikDoba", { used: usage.dailyUsed ?? 0, limit: usage.dailyLimit })}
                    {usage.weekLimit != null ? ` · ${t("licznikFree", { used: usage.used, limit: usage.weekLimit })}` : ""}
                    {resetIso ? ` · ${t("licznikReset", { date: fmtDate(resetIso) })}` : ""}
                  </p>
                ) : server.tier && usage?.weekLimit != null ? (
                  <p data-testid="studio-master-dl-counter" className={`text-sm ${limitReached ? "text-[var(--brd-rec)]" : ""}`}>
                    {t("licznikFree", { used: usage.used, limit: usage.weekLimit })}
                    {resetIso ? ` · ${t("licznikReset", { date: fmtDate(resetIso) })}` : ""}
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
                                <Button key={format} type="button" size="sm" variant={enabled ? "default" : "outline"} className="min-h-11 min-w-11" disabled={!enabled || dl?.status === "working" || dl?.status === "pending"} title={lockedLabel ?? undefined} aria-label={`${t("formatAria", { kind: t(`pobierz.${kind}`), format: t(`format.${format}`) })}${lockedLabel ? ` — ${lockedLabel}` : ""}`} data-testid={`studio-master-dl-${key}`} data-enabled={enabled} onClick={() => void deliver(kind, format)}>
                                  {!opt?.enabled ? "🔒 " : ""}
                                  {dl?.key === key && dl.status === "working" ? t("przygotowuje") : opt?.watermark ? `${t(`format.${format}`)} · ${t("zeZnakiem")}` : t(`format.${format}`)}
                                </Button>
                              );
                            })}
                          </div>
                          {kind !== "project" && rows.some((f) => server.options.find((o) => o.kind === kind && o.format === f)?.watermark) ? (
                            <p className="basis-full text-[11px] text-[var(--brd-mute)]" data-testid="studio-master-watermark-note">{t("znakInfo")}</p>
                          ) : null}
                          {kind === "project" && !server.options.find((o) => o.kind === "project")?.enabled ? <span className="text-xs text-[var(--brd-mute)]">{t("tylkoGold")}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {dl?.status === "working" && prog.dl ? <JobProgressBar value={prog.dl} label={t(`etap.${prog.dl.stage}`)} ariaLabel={t("postepAria")} testId="studio-master-dl-progress" /> : null}
                {dl?.status === "done" ? <p role="status" className="text-sm">{t("gotowyPlik")}</p> : null}
                {dl?.status === "working" && offline ? <p role="status" className="text-sm">{t("offline")}</p> : null}
                {dl?.status === "pending" && dl.jobId ? (
                  <p role="status" data-testid="studio-master-dl-pending" className="flex flex-wrap items-center gap-2 text-sm">
                    {t("plikPending")}
                    <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void followDownload(dl.key, dl.jobId!)}>{t("sprawdzTeraz")}</Button>
                  </p>
                ) : null}
                {dl?.status === "error" ? <p role="alert" data-testid="studio-master-dl-error" data-error-code={dl.code} className="text-sm text-[var(--brd-rec)]">{dl.code === "no_own_track" ? t("masterBezNagrania") : errorText(dl.code) ?? t("pobierzBlad")}</p> : null}
                {exhausted === "day" ? <p role="status" className="text-sm">{t("limitWyczerpanyDoba", { n: usage?.dailyLimit ?? FREE_WATERMARK_PER_DAY })}</p> : null}
                {exhausted === "week" ? <p role="status" className="text-sm">{t("limitWyczerpany")}</p> : null}
                {exhausted === "songs" ? <p role="status" className="text-sm">{t("limitUtworowDoba", { n: dl?.songLimit ?? 0 })}</p> : null}
              </section>
            ) : null}
            {approved && server.tier ? <StudioYoutubeVideo projectId={projectId} tier={server.tier} approved /> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
