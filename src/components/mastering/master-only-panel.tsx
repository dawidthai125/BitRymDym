"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrdAudioDeck } from "@/components/player/brd-audio-deck";
import { LockedAction } from "@/components/plans/locked-action";
import { Button } from "@/components/ui/button";
import { useLibText } from "@/i18n/use-lib-text";
import { requestPlanUsageRefresh } from "@/lib/plans/plan-usage-refresh";
import { deliverOptions, type DeliverFormat } from "@/lib/studio/deliver/policy";
import { joinParts } from "@/lib/studio/master/client";
import { followStudioJob, masterErrorKey, refusalCode, studioJobUrl, type StudioJobBody } from "@/lib/studio/master/job-poll";
import {
  bootstrapMasterOnlyProject,
  discardMasterOnlyProject,
  MASTER_ONLY_MAX_MB,
  MASTER_ONLY_MAX_SECONDS,
  STUDIO_VOCAL_IMPORT_ACCEPT,
} from "@/lib/studio/master/master-only-bootstrap";
import { DEFAULT_MASTER_SETTINGS, DEFAULT_MASTER_TARGET, type MasterTargetId } from "@/lib/studio/master/targets";

type Tier = "FREE" | "BRONZE" | "SILVER" | "GOLD";
type Project = { projectId: string; documentVersion: number };
type Done = { jobId: string; url: string | null };

type Phase =
  | { kind: "idle" }
  | { kind: "boot"; stage: string }
  | { kind: "ready"; project: Project }
  | { kind: "mastering"; project: Project; jobId: string | null }
  /** The job is still on the server, we only stopped watching it. */
  | { kind: "waiting"; project: Project; jobId: string }
  | { kind: "done"; project: Project; done: Done; approved: boolean };

/** Survives a reload: the project of the master in progress (this browser only). */
const STORE_KEY = "brd.masterOnly.v1";
function remember(project: Project | null): void {
  try {
    if (project) window.localStorage.setItem(STORE_KEY, JSON.stringify(project));
    else window.localStorage.removeItem(STORE_KEY);
  } catch {
    // private mode: nothing to restore later
  }
}
function remembered(): Project | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "null") as Partial<Project> | null;
    return typeof raw?.projectId === "string" && typeof raw.documentVersion === "number" ? { projectId: raw.projectId, documentVersion: raw.documentVersion } : null;
  } catch {
    return null;
  }
}

/** Best file of the plan: WAV 24-bit for Gold, otherwise the highest MP3 (same policy as the server). */
function bestFormat(tier: Tier): DeliverFormat {
  const on = new Set(deliverOptions(tier).filter((o) => o.kind === "master" && o.enabled).map((o) => o.format));
  return (["WAV_24", "MP3_320", "MP3_256", "MP3_192", "MP3_128"] as const).find((f) => on.has(f)) ?? "MP3_128";
}

/** Refusals that another try with the same file cannot change. */
const FINAL_REFUSALS = new Set(["monthly_limit", "no_own_track"]);

export function MasterOnlyPanel({ tier }: { tier: Tier }) {
  const t = useTranslations("mastering");
  const tl = useLibText();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  /** Rights statement (owner decision 2026-11-26): required before the file is sent. */
  const [rights, setRights] = useState(false);
  const [offline, setOffline] = useState(false);
  const [approving, setApproving] = useState(false);
  const [dl, setDl] = useState<"idle" | "working" | "done">("idle");
  const format = bestFormat(tier);
  const target: MasterTargetId = DEFAULT_MASTER_TARGET;
  const canStem = tier === "SILVER" || tier === "GOLD";
  const poll = useRef<AbortController | null>(null);
  const objectUrls = useRef<string[]>([]);
  const busy = useRef(false);
  useEffect(() => () => {
    poll.current?.abort();
    for (const u of objectUrls.current.splice(0)) URL.revokeObjectURL(u);
  }, []);

  const errorText = useCallback((code: string): string => {
    if (code === "monthly_limit") return t("bledy.monthlyLimit");
    if (code === "no_own_track") return t("bledy.noOwnTrack");
    if (code === "song_day_limit" || code === "daily_limit" || code === "weekly_limit") return t("bledy.dayLimit");
    const key = masterErrorKey(code);
    return key === "other" ? t("bledy.other") : t(`bledy.${key}`);
  }, [t]);

  const fileUrl = useCallback(async (body: StudioJobBody, type: string): Promise<string | null> => {
    if (body.downloadUrl) return body.downloadUrl;
    if (!body.downloadParts?.length) return null;
    // Results over 40 MB are stored in parts.
    const blob = await joinParts(body.downloadParts, type).catch(() => null);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    objectUrls.current.push(url);
    return url;
  }, []);

  const follow = useCallback(async (project: Project, jobId: string) => {
    poll.current?.abort();
    const controller = new AbortController();
    poll.current = controller;
    setError(null);
    setPhase({ kind: "mastering", project, jobId });
    const out = await followStudioJob(project.projectId, jobId, { signal: controller.signal, onConnection: (ok) => setOffline(!ok) });
    if (out.kind === "aborted" || controller.signal.aborted) return;
    setOffline(false);
    if (out.kind === "succeeded") {
      const url = await fileUrl(out.body, "audio/flac");
      if (!controller.signal.aborted) setPhase({ kind: "done", project, done: { jobId, url }, approved: false });
      return;
    }
    if (out.kind === "pending" || out.kind === "signed_out") {
      if (out.kind === "signed_out") setError(errorText("signed_out"));
      return setPhase({ kind: "waiting", project, jobId });
    }
    requestPlanUsageRefresh();
    setError(errorText(out.kind === "missing" ? "network" : out.code));
    setPhase({ kind: "ready", project });
  }, [errorText, fileUrl]);

  const freshUrl = useCallback(async (project: Project, jobId: string): Promise<string | null> => {
    try {
      const r = await fetch(studioJobUrl(project.projectId, jobId), { cache: "no-store" });
      const url = r.ok ? await fileUrl((await r.json()) as StudioJobBody, "audio/flac") : null;
      if (url) setPhase((cur) => (cur.kind === "done" && cur.done.jobId === jobId ? { ...cur, done: { jobId, url } } : cur));
      return url;
    } catch {
      return null;
    }
  }, [fileUrl]);

  // Reload / coming back: the running or finished master of the last file is still on the server.
  useEffect(() => {
    if (!canStem) return;
    let live = true;
    void (async () => {
      const project = remembered();
      if (!project) return;
      try {
        const r = await fetch(`/api/studio/projects/${encodeURIComponent(project.projectId)}/master`, { cache: "no-store" });
        if (!live) return;
        if (r.status === 404) return remember(null);
        if (!r.ok) return;
        const j = (await r.json()) as { available?: boolean; documentVersion?: number; latest?: { id: string; status: string; sourceDocumentVersion?: number | null } | null; approved?: { id: string } | null };
        if (!live || j.available === false) return;
        // Changed in the Studio since: it is a Studio project now.
        if (j.documentVersion !== project.documentVersion) return remember(null);
        const job = j.approved ?? j.latest ?? null;
        if (!job) return setPhase((cur) => (cur.kind === "idle" ? { kind: "ready", project } : cur));
        if (!j.approved && (j.latest?.status === "queued" || j.latest?.status === "running")) return void follow(project, job.id);
        if (j.approved || j.latest?.status === "succeeded") {
          setPhase({ kind: "done", project, done: { jobId: job.id, url: null }, approved: !!j.approved });
          return void freshUrl(project, job.id);
        }
        setPhase((cur) => (cur.kind === "idle" ? { kind: "ready", project } : cur));
      } catch {
        // offline: the user can start again
      }
    })();
    return () => {
      live = false;
    };
  }, [canStem, follow, freshUrl]);

  async function onFile(file: File | null) {
    if (!file || !canStem || busy.current) return;
    busy.current = true;
    setError(null);
    // A file that never became a master does not stay behind as an extra project.
    if (phase.kind === "ready") await discardMasterOnlyProject(phase.project.projectId);
    remember(null);
    setDl("idle");
    try {
      setPhase({ kind: "boot", stage: "create" });
      const result = await bootstrapMasterOnlyProject({ file, rightsAccepted: rights, onStage: (stage) => setPhase({ kind: "boot", stage }) });
      if (!result.ok) {
        setError(result.message ? tl(result.message) : t(`wgrywanie.${result.code}`, { mb: MASTER_ONLY_MAX_MB, min: Math.floor(MASTER_ONLY_MAX_SECONDS / 60) }));
        return setPhase({ kind: "idle" });
      }
      const project = { projectId: result.projectId, documentVersion: result.documentVersion };
      remember(project);
      setPhase({ kind: "ready", project });
    } finally {
      busy.current = false;
    }
  }

  async function runMaster(project: Project) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setPhase({ kind: "mastering", project, jobId: null });
    let jobId: string | null = null;
    const post = async (body: Record<string, unknown>) => {
      const r = await fetch(`/api/studio/projects/${encodeURIComponent(project.projectId)}/master`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
    };
    const refuse = async (code: string) => {
      setError(errorText(code));
      if (!FINAL_REFUSALS.has(code)) return setPhase({ kind: "ready", project });
      remember(null);
      setPhase({ kind: "idle" });
      await discardMasterOnlyProject(project.projectId);
    };
    try {
      const prep = await post({ action: "prepare" });
      if (prep.json.available === false) return await refuse("unavailable");
      if (typeof prep.json.jobId !== "string") return await refuse(refusalCode(prep.status, prep.json.error));
      jobId = prep.json.jobId;
      const commit = await post({ action: "commit", jobId, target, settings: DEFAULT_MASTER_SETTINGS, documentVersion: project.documentVersion });
      if (commit.json.available === false) return await refuse("unavailable");
      if (!commit.json.ok) return await refuse(refusalCode(commit.status, commit.json.error));
      requestPlanUsageRefresh();
    } catch {
      // Dropped before the job id: nothing was ordered. After it: ask about the job instead of guessing.
      if (!jobId) return await refuse("network");
    } finally {
      busy.current = false;
    }
    await follow(project, jobId);
  }

  async function approve(project: Project, done: Done) {
    if (approving) return;
    setApproving(true);
    setError(null);
    try {
      const r = await fetch(`/api/studio/projects/${encodeURIComponent(project.projectId)}/master/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: done.jobId }) });
      if (r.ok) return setPhase({ kind: "done", project, done, approved: true });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      const code = refusalCode(r.status, j.error);
      setError(masterErrorKey(code) === "other" ? t("bladApprove") : errorText(code));
    } catch {
      setError(errorText("network"));
    } finally {
      setApproving(false);
    }
  }

  async function download(project: Project) {
    if (dl === "working") return;
    setDl("working");
    setError(null);
    const post = async (body: Record<string, unknown>) => {
      const r = await fetch(`/api/studio/projects/${encodeURIComponent(project.projectId)}/deliver`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "master", format, ...body }) });
      return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
    };
    const fail = (code: string) => {
      const key = masterErrorKey(code);
      setError(key === "other" && !code.endsWith("_limit") ? t("bladDeliver") : errorText(code));
      setDl("idle");
    };
    let jobId: string | null = null;
    try {
      const prep = await post({ action: "prepare" });
      if (!prep.json.ok) return fail(refusalCode(prep.status, prep.json.error));
      jobId = String(prep.json.jobId);
      const commit = await post({ action: "commit", jobId, documentVersion: project.documentVersion });
      if (!commit.json.ok) return fail(refusalCode(commit.status, commit.json.error));
      requestPlanUsageRefresh();
    } catch {
      if (!jobId) return fail("network");
    }
    poll.current?.abort();
    const controller = new AbortController();
    poll.current = controller;
    const out = await followStudioJob(project.projectId, jobId, { signal: controller.signal, onConnection: (ok) => setOffline(!ok) });
    if (out.kind === "aborted" || controller.signal.aborted) return;
    setOffline(false);
    if (out.kind !== "succeeded") return fail(out.kind === "failed" ? out.code : out.kind === "signed_out" ? "signed_out" : "network");
    const url = await fileUrl(out.body, format === "WAV_24" ? "audio/wav" : "audio/mpeg");
    if (!url) return fail("server");
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    if (out.body.filename) a.download = out.body.filename;
    a.click();
    setDl("done");
  }

  const working = phase.kind === "boot" || phase.kind === "mastering" || phase.kind === "waiting";
  const formatName = format === "WAV_24" ? "WAV" : "MP3";

  return (
    <div className="space-y-6" data-testid="master-only-panel">
      {!canStem ? (
        <LockedAction reason="plan" minTier="SILVER" testId="master-only-locked">
          {t("wymagaSilver")}
        </LockedAction>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={STUDIO_VOCAL_IMPORT_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            // Same gate as the button: without the rights statement the picker cannot open at all.
            disabled={working || dl === "working" || !rights}
            aria-label={t("wybierzPlik")}
            data-testid="master-only-file"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = "";
              void onFile(file);
            }}
          />
          <label className="flex min-h-11 items-start gap-2 text-sm" data-testid="master-only-rights">
            <input type="checkbox" className="mt-1" checked={rights} disabled={working} onChange={(e) => setRights(e.target.checked)} />
            <span>{t("prawa")}</span>
          </label>
          <Button type="button" className="self-start" data-testid="master-only-pick" disabled={working || dl === "working" || !rights} onClick={() => inputRef.current?.click()}>
            {t(phase.kind === "idle" ? "wybierzPlik" : "innyPlik")}
          </Button>
          <p className="text-xs text-[var(--brd-mute)]">{t("limityPliku", { mb: MASTER_ONLY_MAX_MB, min: Math.floor(MASTER_ONLY_MAX_SECONDS / 60) })}</p>
        </div>
      )}

      {phase.kind === "boot" ? (
        <p className="text-sm text-[var(--brd-mute)]" role="status" data-testid="master-only-boot">
          {t(`stage.${phase.stage}`)}
        </p>
      ) : null}

      {phase.kind === "ready" ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--brd-ink)]">{t("gotowy")}</p>
          <Button type="button" data-testid="master-only-run" onClick={() => void runMaster(phase.project)}>
            {t("zrobMaster")}
          </Button>
        </div>
      ) : null}

      {phase.kind === "mastering" ? (
        <p className="text-sm text-[var(--brd-mute)]" role="status" data-testid="master-only-working">
          {offline ? t("offline") : t("masteruje")}
        </p>
      ) : null}

      {phase.kind === "waiting" ? (
        <div className="flex flex-wrap items-center gap-3" data-testid="master-only-waiting">
          <p className="text-sm" role="status">{t("czeka")}</p>
          <Button type="button" variant="outline" onClick={() => void follow(phase.project, phase.jobId)}>{t("sprawdz")}</Button>
        </div>
      ) : null}

      {phase.kind === "done" ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--brd-ink)]">{t("masterGotowy", { format: formatName })}</p>
          {phase.done.url ? (
            <BrdAudioDeck src={phase.done.url} title={t("odsluch")} testId="master-only-preview" seed={`master-only:${phase.project.projectId}`} onRefreshSrc={() => freshUrl(phase.project, phase.done.jobId)} />
          ) : (
            <Button type="button" variant="outline" data-testid="master-only-reload" onClick={() => void freshUrl(phase.project, phase.done.jobId)}>{t("wczytajOdsluch")}</Button>
          )}
          {phase.approved ? (
            <Button type="button" data-testid="master-only-download" disabled={dl === "working"} onClick={() => void download(phase.project)}>
              {dl === "working" ? t("przygotowuje") : t("pobierz", { format: formatName })}
            </Button>
          ) : (
            <Button type="button" data-testid="master-only-approve" disabled={approving} onClick={() => void approve(phase.project, phase.done)}>
              {t("zatwierdz")}
            </Button>
          )}
          {dl === "working" && offline ? <p className="text-sm" role="status">{t("offline")}</p> : null}
          {dl === "done" ? <p className="text-sm" role="status">{t("pobrano")}</p> : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-[var(--brd-rec)]" role="alert" data-testid="master-only-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
