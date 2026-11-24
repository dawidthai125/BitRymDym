"use client";

import { useTranslations } from "next-intl";
import { useLibText } from "@/i18n/use-lib-text";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BrdButton, BrdLink } from "@/components/brand/brd-button";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { addSampleToProject, loadSampleProjects } from "@/lib/studio/samples/use-sample-in-studio";

type Project = { id: string; title: string };
type Step =
  | { name: "idle" }
  | { name: "projects"; projects: Project[]; selected: string }
  | { name: "done"; projectId: string; trackName: string; at: string }
  | { name: "track"; projectId: string; tracks: { id: string; name: string }[]; selected: string };

const field = "min-h-11 max-w-full rounded-[var(--brd-r-cta)] border-2 border-[var(--brd-line)] bg-[var(--brd-bg)] px-3 text-[var(--brd-ink)]";

/** Pick a project, add the sample to it, open the project. */
export function UseSampleButton({ sampleId, signedIn }: { sampleId: string; signedIn: boolean }) {
  const t = useTranslations("community.sampleCatalog");
  const tl = useLibText();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = signInPathWithNext(`/sampel/${sampleId}`);

  if (!signedIn) return <BrdLink href={signIn} data-testid="sample-use-in-studio">{t("uzyjWStudiu")}</BrdLink>;

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch {
      setError(t("uzyjBlad"));
    } finally {
      setBusy(false);
    }
  }

  const open = () =>
    run(async () => {
      const projects = await loadSampleProjects();
      if (projects === "auth") return router.push(signIn);
      if (projects === "error") return setError(t("uzyjBlad"));
      setStep({ name: "projects", projects, selected: projects[0]?.id ?? "" });
    });

  const add = (projectId: string, trackId?: string) =>
    run(async () => {
      const r = await addSampleToProject({ projectId, sampleId, trackId });
      if (r.ok) {
        const sec = Math.floor(r.startMs / 1000);
        return setStep({ name: "done", projectId, trackName: r.trackName, at: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` });
      }
      if (r.kind === "auth") return router.push(signIn);
      if (r.kind === "capacity") return setStep({ name: "track", projectId, tracks: r.tracks, selected: r.tracks[0]!.id });
      setError(r.message || t("uzyjBlad"));
    });

  return (
    <div className="space-y-3" data-testid="sample-use-in-studio">
      {step.name === "idle" ? (
        <BrdButton onClick={() => void open()} disabled={busy}>{busy ? t("uzyjCzekaj") : t("uzyjWStudiu")}</BrdButton>
      ) : null}
      {step.name === "projects" && step.projects.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">{t("uzyjBrakProjektu")}</p>
          <BrdLink href="/beats?zrodlo=brd" variant="secondary">{t("uzyjWybierzBit")}</BrdLink>
        </div>
      ) : null}
      {step.name === "projects" && step.projects.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            {t("uzyjProjekt")}
            <select className={field} value={step.selected} onChange={(e) => setStep({ ...step, selected: e.target.value })}>
              {step.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </label>
          <BrdButton onClick={() => void add(step.selected)} disabled={busy}>{busy ? t("uzyjCzekaj") : t("uzyjWstaw")}</BrdButton>
        </div>
      ) : null}
      {step.name === "done" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm" role="status">{t("uzyjWstawiono", { track: step.trackName, at: step.at })}</p>
          <BrdButton onClick={() => router.push(`/studio/p/${step.projectId}`)}>{t("uzyjOtworz")}</BrdButton>
        </div>
      ) : null}
      {step.name === "track" ? (
        <div className="space-y-2">
          <p className="max-w-prose text-sm" role="status">{t("uzyjBrakSciezki")}</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              {t("uzyjSciezka")}
              <select className={field} value={step.selected} onChange={(e) => setStep({ ...step, selected: e.target.value })}>
                {step.tracks.map((tr) => (
                  <option key={tr.id} value={tr.id}>{tr.name}</option>
                ))}
              </select>
            </label>
            <BrdButton onClick={() => void add(step.projectId, step.selected)} disabled={busy}>{busy ? t("uzyjCzekaj") : t("uzyjWstaw")}</BrdButton>
            <BrdButton variant="secondary" onClick={() => setStep({ name: "idle" })} disabled={busy}>{t("nie")}</BrdButton>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-[var(--brd-rec)]" role="alert">{tl(error)}</p> : null}
    </div>
  );
}
