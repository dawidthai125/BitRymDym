"use client";

import { StoreAppHidden } from "@/components/site/store-app-context";
import { useTranslations } from "next-intl";
import Link from "@/components/ui/app-link";
import { useEffect, useRef, useState } from "react";

import { fetchSeparateJob, nextSeparatePollMs, saveSeparateStem, type SeparateJob, type StemName } from "@/lib/studio/separate/separate-client";

type ProjectOpt = { id: string; title: string };

/** Display order; labels → studio.separator.stem.* */
const STEMS: StemName[] = ["vocals", "drums", "bass", "other"];

export function StudioSeparatorPanel({ projects, canEnqueue }: { projects: ProjectOpt[]; canEnqueue: boolean }) {
  const t = useTranslations("studio.separator");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [job, setJob] = useState<SeparateJob | null>(null);

  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState<StemName | null>(null);
  const [version, setVersion] = useState(0);
  /** An answer for a project that is no longer chosen must not land on the screen. */
  const projectRef = useRef(projectId);
  useEffect(() => {
    projectRef.current = projectId;
  }, [projectId]);

  const waiting = job?.status === "queued" || job?.status === "running";

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    let failures = 0;
    let timer: number | undefined;
    const load = () => {
      // A hidden tab asks nothing; it looks again as soon as it is shown.
      if (document.hidden) return;
      window.clearTimeout(timer);
      void fetchSeparateJob(projectId).then((result) => {
        if (!live) return;
        // One failed check must not hide a job that is still being cut (and stop the waiting).
        setLoadFailed(!result.ok);
        failures = result.ok ? 0 : failures + 1;
        if (result.ok) {
          setJob(result.job);
          setNote((old) => (old === t("wylaczone") ? null : old));
        } else if (result.reason === "off") setNote(t("wylaczone"));
        const wait = waiting ? nextSeparatePollMs(result, failures) : null;
        if (wait !== null) timer = window.setTimeout(load, wait);
      });
    };
    const onShow = () => {
      if (waiting && !document.hidden) load();
    };
    load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      live = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [projectId, waiting, version, t]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId || !canEnqueue || busy || waiting) return;
    setBusy(true);
    setNote(null);
    const asked = projectId;
    try {
      const res = await fetch("/api/studio/separate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: asked }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; accepted?: boolean };
      if (projectRef.current !== asked) return;
      if (res.status === 202 && json.accepted === true) {
        setJob({ id: "pending", status: "queued", errorCode: null, stems: null });
      } else if (res.status === 409) {
        setNote(t("juzCzeka"));
        setVersion((v) => v + 1);
      } else if (res.status === 404) {
        setNote(t("brakMastera"));
      } else if (res.status === 503) {
        setNote(t("wylaczone"));
      } else if (res.status === 403) {
        setNote(t("plikiZRozcieciaOdSilver"));
      } else {
        setNote(t("nieUdaloSiePrzyjac"));
      }
    } catch {
      if (projectRef.current === asked) setNote(t("nieUdaloSiePrzyjac"));
    } finally {
      setBusy(false);
    }
  }

  async function saveStem(name: StemName) {
    if (saving) return;
    setSaving(name);
    setNote(null);
    const asked = projectId;
    const ok = await saveSeparateStem(asked, name);
    setSaving(null);
    if (!ok && projectRef.current === asked) setNote(t("nieUdaloSiePobrac"));
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-[var(--brd-ink-soft)]">
        {t("projekt")}
        <select
          name="projectId"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            // Nothing from the previous project stays on the screen.
            setNote(null);
            setJob(null);
            setLoadFailed(false);
          }}
          disabled={projects.length === 0}
          className="border border-[var(--brd-line)] bg-transparent px-3 py-2 text-[var(--brd-ink)]"
        >
          {projects.length === 0 ? <option value="">{t("brakProjektow")}</option> : null}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
      </label>
      {canEnqueue ? (
        <button
          type="submit"
          disabled={busy || waiting || !projectId}
          className="w-fit border border-[var(--brd-line)] px-3 py-2 text-sm text-[var(--brd-ink)] hover:border-[var(--brd-amber)] disabled:opacity-50"
        >
          {busy ? t("wysylanie") : t("oddajDoRozciecia")}
        </button>
      ) : (
        <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
          {t("plikiOdSilver")}{" "}
          <StoreAppHidden>
            <Link href="/premium" className="underline underline-offset-4">
              {t("zobaczPlany")}
            </Link>
          </StoreAppHidden>
        </p>
      )}
      {note ? <p role="status" className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{note}</p> : null}
      {loadFailed && !job && !note ? (
        <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
          {t("nieWczytano")}{" "}
          <button type="button" onClick={() => setVersion((v) => v + 1)} className="min-h-11 underline underline-offset-4">
            {t("sprobujPonownie")}
          </button>
        </p>
      ) : null}
      {job?.status === "queued" || job?.status === "running" ? (
        <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("wKolejce")}</p>
      ) : null}
      {job?.status === "failed" ? (
        <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("nieDoszlo")}</p>
      ) : null}
      {job?.status === "succeeded" && job.stems ? (
        <ul className="flex flex-col gap-2 text-sm">
          {STEMS.map((name) =>
            job.stems?.[name] ? (
              <li key={name}>
                <button
                  type="button"
                  disabled={saving !== null}
                  onClick={() => void saveStem(name)}
                  className="min-h-11 underline underline-offset-4 disabled:opacity-50"
                >
                  {t(`stem.${name}`)}
                </button>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
    </form>
  );
}
