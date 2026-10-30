"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { LockedAction } from "@/components/plans/locked-action";
import { StudioJobProgressBar as JobProgressBar } from "@/components/studio/studio-job-progress";
import { Button } from "@/components/ui/button";
import { joinParts } from "@/lib/studio/master/client";
import { jobProgressOf, type JobProgress } from "@/lib/studio/master/progress";
import { AI_COVER_ASPECTS, AI_COVER_PROMPT_MAX, AI_COVER_PROMPT_MIN, type AiCoverAspect } from "@/lib/studio/video/ai-cover/config";
import {
  cleanVideoText, YT_VIDEO_H, YT_VIDEO_TEXT_MAX, YT_VIDEO_W, youtubeFrameLayout, youtubeVideoAllowed, type YoutubeVideoSource,
} from "@/lib/studio/video/youtube-video";
import type { PremiumTier } from "@/types/premium";

type JobLike = { job?: { status?: string; stage?: unknown; progress?: unknown; errorCode?: string | null }; downloadUrl?: string | null; downloadParts?: string[] | null; filename?: string | null };
type State = {
  available: boolean; allowed?: boolean; approved?: boolean; cover?: { url: string } | null; title?: string;
  latest?: JobLike | null; usage?: { used: number; perDay: number } | null;
  /** Gold AI cover generator (null = off / table missing). */
  ai?: { available: boolean; used?: number; perDay?: number; ownBeat?: boolean } | null;
};
/** UI source: "ai" is sent as `upload` with the generated imageId. */
type UiSource = YoutubeVideoSource | "ai";
type AiRun = { status: "idle" | "working" | "ok" | "error"; imageId?: string; url?: string; message?: string; cover?: "idle" | "working" | "approved" | "pending" | "error"; coverMessage?: string };
type Run =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "done"; url: string; filename: string | null }
  | { phase: "error"; code: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resultUrl(j: JobLike): Promise<string | null> {
  if (j.downloadUrl) return j.downloadUrl;
  if (!j.downloadParts?.length) return null;
  const blob = await joinParts(j.downloadParts, "video/mp4");
  return blob ? URL.createObjectURL(blob) : null;
}

/** 16:9 preview that mirrors the worker frame layout (youtubeFrameLayout) in % of 1920×1080. */
function FramePreview({ src, title, artist, label, empty }: { src: string | null; title: string | null; artist: string | null; label: string; empty: string }) {
  // Natural size of the image currently shown (keyed by src, so a new image starts blank).
  const [size, setSize] = useState<{ src: string; w: number; h: number } | null>(null);
  const layout = size && size.src === src ? youtubeFrameLayout(size, { title, artist }) : null;
  const pctX = (v: number) => `${(v / YT_VIDEO_W) * 100}%`;
  const pctY = (v: number) => `${(v / YT_VIDEO_H) * 100}%`;
  return (
    <figure className="flex flex-col gap-1">
      <div className="relative aspect-video w-full overflow-hidden rounded-[2px] border border-[var(--brd-line)] bg-black [container-type:inline-size]" data-testid="studio-yt-preview" data-layout={layout?.mode ?? "none"}>
        {src ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed / API image, sized by the frame */}
            <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl brightness-[0.42]" onLoad={(e) => setSize({ src, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
            {layout?.mode === "fit" ? (
              <>
                <div className="absolute flex items-center justify-center" style={{ left: pctX((YT_VIDEO_W - layout.box.w) / 2), top: pctY(layout.y), width: pctX(layout.box.w), height: pctY(layout.box.h) }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
                  <img src={src} alt="" className="max-h-full max-w-full object-contain" />
                </div>
                {layout.title && title ? (
                  <p className="absolute inset-x-0 truncate px-[4%] text-center font-bold leading-none text-white [text-shadow:0_2px_6px_rgba(0,0,0,.6)]" style={{ top: pctY(layout.title.y), fontSize: `${(layout.title.size / YT_VIDEO_W) * 100}cqw` }}>{title}</p>
                ) : null}
                {layout.artist && artist ? (
                  <p className="absolute inset-x-0 truncate px-[4%] text-center font-bold leading-none text-white/85 [text-shadow:0_2px_6px_rgba(0,0,0,.6)]" style={{ top: pctY(layout.artist.y), fontSize: `${(layout.artist.size / YT_VIDEO_W) * 100}cqw` }}>{artist}</p>
                ) : null}
              </>
            ) : layout?.mode === "full" ? (
              // eslint-disable-next-line @next/next/no-img-element -- see above
              <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
          </>
        ) : (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white/70">{empty}</p>
        )}
      </div>
      <figcaption className="text-xs text-[var(--brd-mute)]">{label} · 1920×1080 · H.264 + AAC</figcaption>
    </figure>
  );
}

/** Gold — YouTube MP4 from the approved master + beat cover / own filtered graphic (E3 job). */
export function StudioYoutubeVideo({ projectId, tier, approved, initialState }: {
  projectId: string;
  tier: PremiumTier | null;
  approved: boolean;
  /** Tests / screenshots only (skips the GET). */
  initialState?: State;
}) {
  const t = useTranslations("studio.youtubeVideo");
  const uid = useId();
  const allowed = youtubeVideoAllowed(tier);
  const [state, setState] = useState<State | null>(initialState ?? null);
  const [source, setSource] = useState<UiSource>("cover");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiAspect, setAiAspect] = useState<AiCoverAspect>("16:9");
  const [ai, setAi] = useState<AiRun>({ status: "idle" });
  const [upload, setUpload] = useState<{ status: "idle" | "checking" | "ok" | "error"; imageId?: string; url?: string; message?: string }>({ status: "idle" });
  const [showText, setShowText] = useState(true);
  const [title, setTitle] = useState(initialState?.title ?? "");
  const [artist, setArtist] = useState("");
  const [run, setRun] = useState<Run>({ phase: "idle" });
  const [prog, setProg] = useState<JobProgress | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleTouched = useRef(false);

  useEffect(() => {
    if (initialState || !allowed) return;
    let live = true;
    void fetch(`/api/studio/projects/${projectId}/video`).then((r) => (r.ok ? r.json() : null)).then(async (j: (State & { success?: boolean }) | null) => {
      if (!live || !j) return;
      setState(j);
      if (!titleTouched.current && j.title) setTitle(j.title);
      if (!j.cover) setSource("upload");
      if (j.latest?.job?.status === "succeeded") {
        const url = await resultUrl(j.latest);
        if (live && url) setRun({ phase: "done", url, filename: j.latest.filename ?? null });
      }
    }).catch(() => {});
    return () => { live = false; };
  }, [projectId, allowed, approved, initialState]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setUpload({ status: "checking" });
    const form = new FormData();
    form.set("image", file);
    try {
      const r = await fetch(`/api/studio/projects/${projectId}/video/image`, { method: "POST", body: form });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.imageId) setUpload({ status: "ok", imageId: j.imageId, url: j.previewUrl ?? URL.createObjectURL(file) });
      else setUpload({ status: "error", message: typeof j.message === "string" ? j.message : t("grafikaBlad") });
    } catch {
      setUpload({ status: "error", message: t("grafikaBlad") });
    }
  }

  async function generateAi() {
    setAi({ status: "working" });
    try {
      const r = await fetch(`/api/studio/projects/${projectId}/video/ai-cover`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: aiPrompt, aspect: aiAspect }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.imageId) {
        setAi({ status: "ok", imageId: j.imageId, url: j.previewUrl ?? undefined, cover: "idle" });
        if (typeof j.used === "number") setState((s) => (s?.ai ? { ...s, ai: { ...s.ai, used: j.used, perDay: j.perDay ?? s.ai.perDay } } : s));
        return;
      }
      const message = j.error === "daily_limit" ? t("ai.limit") : r.status === 200 && j.available === false ? t("ai.niedostepne") : typeof j.message === "string" ? j.message : t("ai.blad");
      setAi({ status: "error", message });
    } catch {
      setAi({ status: "error", message: t("ai.blad") });
    }
  }

  async function aiAsBeatCover() {
    if (!ai.imageId) return;
    setAi((a) => ({ ...a, cover: "working", coverMessage: undefined }));
    try {
      const r = await fetch(`/api/studio/projects/${projectId}/video/ai-cover/beat-cover`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId: ai.imageId }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.coverStatus) return setAi((a) => ({ ...a, cover: j.coverStatus === "approved" ? "approved" : "pending" }));
      setAi((a) => ({ ...a, cover: "error", coverMessage: typeof j.message === "string" ? j.message : t("ai.okladkaBlad") }));
    } catch {
      setAi((a) => ({ ...a, cover: "error", coverMessage: t("ai.okladkaBlad") }));
    }
  }

  async function poll(jobId: string): Promise<Run> {
    for (let i = 0; i < 300; i++) {
      const r = await fetch(`/api/studio/projects/${projectId}/jobs/${jobId}`);
      const j: JobLike | null = r.ok ? await r.json() : null;
      const st = j?.job?.status;
      if (j?.job) setProg((p) => (st === "succeeded" ? { stage: "done", progress: 100 } : jobProgressOf(j.job!, p)));
      if (st === "succeeded") {
        const url = await resultUrl(j!);
        return url ? { phase: "done", url, filename: j!.filename ?? null } : { phase: "error", code: "no_file" };
      }
      if (st === "failed" || st === "cancelled") return { phase: "error", code: j?.job?.errorCode ?? st };
      await sleep(i < 90 ? 1000 : 3000);
    }
    return { phase: "error", code: "timeout" };
  }

  async function make() {
    setRun({ phase: "working" });
    setProg({ stage: "queued", progress: 0 });
    try {
      const r = await fetch(`/api/studio/projects/${projectId}/video`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: source === "ai" ? "upload" : source, imageId: source === "upload" ? upload.imageId : source === "ai" ? ai.imageId : undefined, title: showText ? title : null, artist: showText ? artist : null }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 200 && j.available === false) return setRun({ phase: "error", code: "unavailable" });
      if (!r.ok || !j.jobId) return setRun({ phase: "error", code: String(j.error ?? r.status) });
      const out = await poll(j.jobId);
      setRun(out);
      if (out.phase === "done") setState((s) => (s?.usage ? { ...s, usage: { ...s.usage, used: s.usage.used + 1 } } : s));
    } catch {
      setRun({ phase: "error", code: "network" });
    }
  }

  const imageUrl = source === "cover" ? state?.cover?.url ?? null
    : source === "ai" ? (ai.status === "ok" ? ai.url ?? null : null)
    : upload.status === "ok" ? upload.url ?? null : null;
  const aiState = state?.ai ?? null;
  const aiLimit = !!aiState?.perDay && (aiState.used ?? 0) >= aiState.perDay;
  const aiPromptLen = aiPrompt.trim().length;
  const limitReached = !!state?.usage && state.usage.used >= state.usage.perDay;
  const canMake = allowed && approved && !!imageUrl && run.phase !== "working" && !limitReached && state?.available !== false;
  const shownTitle = showText ? cleanVideoText(title) : null;
  const shownArtist = showText ? cleanVideoText(artist) : null;

  return (
    <section aria-labelledby={`${uid}-title`} data-testid="studio-youtube-video" data-tier={tier ?? "guest"} className="flex flex-col gap-3 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 id={`${uid}-title`} className="brd-display text-lg">{t("tytul")}</h3>
        <span className="rounded-[2px] border border-[var(--brd-amber)] px-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]">Gold</span>
      </div>
      <p className="text-sm">{t("opis")}</p>

      {!allowed ? (
        <div data-testid="studio-yt-locked" className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <LockedAction reason="plan" minTier="GOLD" action="video" testId="studio-yt-make" buttonClassName="px-3">{t("zrob")}</LockedAction>
          <span className="text-sm">{t("tylkoGold")} <a href="/premium" className="font-semibold underline underline-offset-4">{t("zobaczPlany")}</a></span>
        </div>
      ) : (
        <>
          <p className="border-l-2 border-l-[var(--brd-amber)] pl-2 text-sm" data-testid="studio-yt-bitek"><span className="font-semibold">BITEK:</span> {t("bitek")}</p>
          {!approved ? <p role="status" className="text-sm">{t("najpierwZatwierdz")}</p> : null}
          {state?.available === false ? <p role="status" className="text-sm">{t("niedostepne")}</p> : null}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-sm font-semibold">{t("zrodloTytul")}</legend>
                {(["cover", "upload", "ai"] as const).map((s) => {
                  const disabled = (s === "cover" && !state?.cover) || (s === "ai" && !aiState?.available);
                  return (
                    <label key={s} className={`flex min-h-9 items-center gap-2 text-sm ${disabled ? "opacity-60" : ""}`}>
                      <input type="radio" name={`${uid}-src`} value={s} checked={source === s} disabled={disabled} onChange={() => setSource(s)} data-testid={`studio-yt-src-${s}`} className="h-4 w-4 accent-[var(--brd-amber)]" />
                      {t(`zrodlo.${s}`)}
                      {disabled ? <span className="text-xs text-[var(--brd-mute)]">— {s === "ai" ? t("ai.niedostepne") : t("brakOkladki")}</span> : null}
                    </label>
                  );
                })}
                {source === "upload" ? (
                  <div className="flex flex-col gap-1 pl-6">
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id={`${uid}-file`} data-testid="studio-yt-file" onChange={(e) => void pickFile(e.currentTarget.files?.[0])} />
                    <Button type="button" size="sm" variant="outline" className="min-h-9 self-start" disabled={upload.status === "checking"} onClick={() => fileRef.current?.click()}>
                      {upload.status === "checking" ? t("sprawdzam") : upload.status === "ok" ? t("zmienPlik") : t("wybierzPlik")}
                    </Button>
                    {upload.status === "ok" ? <p role="status" className="text-xs">✓ {t("grafikaOk")}</p> : null}
                    {upload.status === "error" ? <p role="alert" className="text-xs text-[var(--brd-rec)]">{upload.message}</p> : null}
                    <p className="text-xs text-[var(--brd-mute)]">{t("filtrInfo")}</p>
                  </div>
                ) : null}
                {source === "ai" ? (
                  <div className="flex flex-col gap-2 pl-6" data-testid="studio-yt-ai">
                    <label className="flex flex-col gap-1 text-sm">
                      {t("ai.opisLabel")}
                      <textarea value={aiPrompt} maxLength={AI_COVER_PROMPT_MAX} rows={3} placeholder={t("ai.placeholder")} onChange={(e) => setAiPrompt(e.currentTarget.value)} data-testid="studio-yt-ai-prompt" className="rounded-[2px] border border-[var(--brd-line)] bg-transparent px-2 py-1.5" />
                    </label>
                    <div role="radiogroup" aria-label={t("ai.proporcje")} className="flex flex-wrap gap-2">
                      {AI_COVER_ASPECTS.map((a) => (
                        <label key={a} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-[2px] border px-2 text-sm ${aiAspect === a ? "border-[var(--brd-amber)]" : "border-[var(--brd-line)]"}`}>
                          <input type="radio" name={`${uid}-aspect`} value={a} checked={aiAspect === a} onChange={() => setAiAspect(a)} data-testid={`studio-yt-ai-aspect-${a === "1:1" ? "square" : "wide"}`} className="h-4 w-4 accent-[var(--brd-amber)]" />
                          {t(`ai.aspekt.${a}`)}
                        </label>
                      ))}
                    </div>
                    <Button type="button" size="sm" variant="outline" className="min-h-9 self-start" disabled={ai.status === "working" || aiLimit || aiPromptLen < AI_COVER_PROMPT_MIN} onClick={() => void generateAi()} data-testid="studio-yt-ai-generate">
                      {ai.status === "working" ? t("ai.generuje") : ai.status === "ok" ? t("ai.ponownie") : t("ai.generuj")}
                    </Button>
                    {aiState?.perDay ? <span className={`text-xs ${aiLimit ? "text-[var(--brd-rec)]" : "text-[var(--brd-mute)]"}`}>{t("ai.licznik", { used: aiState.used ?? 0, limit: aiState.perDay })}</span> : null}
                    {ai.status === "ok" ? <p role="status" className="text-xs">✓ {t("ai.ok")}</p> : null}
                    {ai.status === "error" ? <p role="alert" className="text-xs text-[var(--brd-rec)]" data-testid="studio-yt-ai-error">{ai.message}</p> : null}
                    {ai.status === "ok" && aiState?.ownBeat ? (
                      <div className="flex flex-col gap-1">
                        <Button type="button" size="sm" variant="outline" className="min-h-9 self-start" disabled={ai.cover === "working" || ai.cover === "approved" || ai.cover === "pending"} onClick={() => void aiAsBeatCover()} data-testid="studio-yt-ai-beat-cover">{t("ai.ustawOkladke")}</Button>
                        {ai.cover === "approved" ? <p role="status" className="text-xs">✓ {t("ai.okladkaUstawiona")}</p> : null}
                        {ai.cover === "pending" ? <p role="status" className="text-xs">{t("ai.okladkaDoMod")}</p> : null}
                        {ai.cover === "error" ? <p role="alert" className="text-xs text-[var(--brd-rec)]">{ai.coverMessage}</p> : null}
                      </div>
                    ) : null}
                    <p className="text-xs text-[var(--brd-mute)]">{t("ai.zasady")}</p>
                  </div>
                ) : null}
              </fieldset>
              <div className="flex flex-col gap-2">
                <label className="flex min-h-9 items-center gap-2 text-sm">
                  <input type="checkbox" checked={showText} onChange={(e) => setShowText(e.currentTarget.checked)} data-testid="studio-yt-text" className="h-4 w-4 accent-[var(--brd-amber)]" />
                  {t("tekstPokaz")}
                </label>
                {showText ? (
                  <>
                    <label className="flex flex-col gap-1 text-sm">
                      {t("tekstTytul")}
                      <input value={title} maxLength={YT_VIDEO_TEXT_MAX} onChange={(e) => { titleTouched.current = true; setTitle(e.currentTarget.value); }} data-testid="studio-yt-title" className="min-h-9 rounded-[2px] border border-[var(--brd-line)] bg-transparent px-2" />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      {t("tekstArtysta")}
                      <input value={artist} maxLength={YT_VIDEO_TEXT_MAX} onChange={(e) => setArtist(e.currentTarget.value)} data-testid="studio-yt-artist" className="min-h-9 rounded-[2px] border border-[var(--brd-line)] bg-transparent px-2" />
                    </label>
                    <span className="text-xs text-[var(--brd-mute)]">{t("tekstLimit", { n: YT_VIDEO_TEXT_MAX })}</span>
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              {run.phase === "done" ? (
                <video controls preload="metadata" src={run.url} className="aspect-video w-full rounded-[2px] border border-[var(--brd-line)] bg-black" data-testid="studio-yt-result" />
              ) : (
                <FramePreview src={imageUrl} title={shownTitle} artist={shownArtist} label={t("podglad")} empty={t("brakObrazu")} />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button type="button" className="min-h-10" disabled={!canMake} onClick={() => void make()} data-testid="studio-yt-make">
              {run.phase === "working" ? t("trwa") : t("zrob")}
            </Button>
            {run.phase === "done" ? (
              <a href={run.url} download={run.filename ?? "youtube.mp4"} className="inline-flex min-h-10 items-center font-semibold underline underline-offset-4" data-testid="studio-yt-download">⬇ {t("pobierz")}</a>
            ) : null}
            {state?.usage ? <span className={`text-xs ${limitReached ? "text-[var(--brd-rec)]" : "text-[var(--brd-mute)]"}`}>{t("licznik", { used: state.usage.used, limit: state.usage.perDay })}</span> : null}
          </div>
          {run.phase === "working" && prog ? <JobProgressBar value={prog} label={t(`etap.${prog.stage}`)} ariaLabel={t("postepAria")} testId="studio-yt-progress" /> : null}
          {run.phase === "done" ? <p role="status" className="text-sm">{t("gotowe")}</p> : null}
          {run.phase === "error" ? <p role="alert" className="text-sm text-[var(--brd-rec)]">{run.code === "unavailable" ? t("niedostepne") : run.code === "daily_limit" ? t("limit") : t("blad", { code: run.code })}</p> : null}
          {limitReached && run.phase !== "error" ? <p role="status" className="text-sm">{t("limit")}</p> : null}
        </>
      )}
    </section>
  );
}
