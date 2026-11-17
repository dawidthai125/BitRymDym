"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { LockedAction } from "@/components/plans/locked-action";
import {
  bootstrapMasterOnlyProject,
  STUDIO_VOCAL_IMPORT_ACCEPT,
} from "@/lib/studio/master/master-only-bootstrap";
import {
  DEFAULT_MASTER_SETTINGS,
  type MasterTargetId,
} from "@/lib/studio/master/targets";
import { requestPlanUsageRefresh } from "@/lib/plans/plan-usage-refresh";

type Tier = "FREE" | "BRONZE" | "SILVER" | "GOLD";

type Props = {
  tier: Tier;
};

type Phase =
  | { kind: "idle" }
  | { kind: "boot"; stage: string }
  | { kind: "ready"; projectId: string; documentVersion: number }
  | { kind: "mastering"; projectId: string; documentVersion: number }
  | { kind: "done"; projectId: string; documentVersion: number; jobId: string; url: string | null }
  | { kind: "approved"; projectId: string; documentVersion: number; jobId: string; url: string | null }
  | { kind: "error"; message: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function MasterOnlyPanel({ tier }: Props) {
  const t = useTranslations("mastering");
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [target] = useState<MasterTargetId>("streaming");
  const canStem = tier === "SILVER" || tier === "GOLD";

  async function onFile(file: File | null) {
    if (!file || !canStem) return;
    setPhase({ kind: "boot", stage: "create" });
    const result = await bootstrapMasterOnlyProject({
      file,
      onStage: (stage) => setPhase({ kind: "boot", stage }),
    });
    if (!result.ok) {
      setPhase({ kind: "error", message: result.message });
      return;
    }
    setPhase({
      kind: "ready",
      projectId: result.projectId,
      documentVersion: result.documentVersion,
    });
  }

  async function runMaster(projectId: string, documentVersion: number) {
    setPhase({ kind: "mastering", projectId, documentVersion });
    try {
      const prep = await fetch(`/api/studio/projects/${projectId}/master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare" }),
      }).then((r) => r.json());
      if (!prep.jobId) {
        setPhase({ kind: "error", message: t("bladPrepare") });
        return;
      }
      const commit = await fetch(`/api/studio/projects/${projectId}/master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "commit",
          jobId: prep.jobId,
          target,
          settings: DEFAULT_MASTER_SETTINGS,
          documentVersion,
        }),
      }).then((r) => r.json());
      if (!commit.ok) {
        setPhase({
          kind: "error",
          message: t("bladCommit", { code: String(commit.error ?? "commit") }),
        });
        return;
      }
      requestPlanUsageRefresh();
      for (let i = 0; i < 240; i++) {
        const r = await fetch(`/api/studio/projects/${projectId}/jobs/${prep.jobId}`);
        const j = r.ok ? await r.json() : null;
        const st = j?.job?.status;
        if (st === "succeeded") {
          setPhase({
            kind: "done",
            projectId,
            documentVersion,
            jobId: prep.jobId,
            url: j?.playUrl ?? j?.downloadUrl ?? null,
          });
          return;
        }
        if (st === "failed" || st === "cancelled") {
          setPhase({
            kind: "error",
            message: t("bladJob", { code: String(j?.job?.errorCode ?? st) }),
          });
          return;
        }
        await sleep(i < 90 ? 1000 : 3000);
      }
      setPhase({ kind: "error", message: t("bladTimeout") });
    } catch {
      setPhase({ kind: "error", message: t("bladSiec") });
    }
  }

  async function approve(projectId: string, documentVersion: number, jobId: string, url: string | null) {
    const r = await fetch(`/api/studio/projects/${projectId}/master/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    if (r.ok) setPhase({ kind: "approved", projectId, documentVersion, jobId, url });
    else setPhase({ kind: "error", message: t("bladApprove") });
  }

  async function downloadMaster(projectId: string, documentVersion: number) {
    const prep = await fetch(`/api/studio/projects/${projectId}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prepare", kind: "master", format: "wav" }),
    }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    if (!prep.json.ok) {
      setPhase({ kind: "error", message: t("bladDeliver") });
      return;
    }
    const jobId = String(prep.json.jobId);
    const commit = await fetch(`/api/studio/projects/${projectId}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "commit",
        kind: "master",
        format: "wav",
        jobId,
        documentVersion,
      }),
    }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    if (!commit.json.ok) {
      setPhase({ kind: "error", message: t("bladDeliver") });
      return;
    }
    requestPlanUsageRefresh();
    for (let i = 0; i < 240; i++) {
      const r = await fetch(`/api/studio/projects/${projectId}/jobs/${jobId}`);
      const j = r.ok ? await r.json() : null;
      if (j?.job?.status === "succeeded" && j?.downloadUrl) {
        const a = document.createElement("a");
        a.href = j.downloadUrl;
        a.rel = "noopener";
        if (j.filename) a.download = j.filename;
        a.click();
        return;
      }
      if (j?.job?.status === "failed" || j?.job?.status === "cancelled") {
        setPhase({ kind: "error", message: t("bladDeliver") });
        return;
      }
      await sleep(i < 90 ? 1000 : 3000);
    }
    setPhase({ kind: "error", message: t("bladTimeout") });
  }

  return (
    <div className="space-y-6" data-testid="master-only-panel">
      <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("intro")}</p>
      {!canStem ? (
        <LockedAction reason="plan" minTier="SILVER" testId="master-only-locked">
          {t("wymagaSilver")}
        </LockedAction>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={STUDIO_VOCAL_IMPORT_ACCEPT}
            className="sr-only"
            data-testid="master-only-file"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = "";
              void onFile(file);
            }}
          />
          <Button
            type="button"
            data-testid="master-only-pick"
            disabled={phase.kind === "boot" || phase.kind === "mastering"}
            onClick={() => inputRef.current?.click()}
          >
            {t("wybierzPlik")}
          </Button>
        </div>
      )}

      {phase.kind === "boot" ? (
        <p className="text-sm text-[var(--brd-mute)]" data-testid="master-only-boot">
          {t(`stage.${phase.stage}`)}
        </p>
      ) : null}

      {phase.kind === "ready" ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--brd-ink)]">{t("gotowy")}</p>
          <Button
            type="button"
            data-testid="master-only-run"
            onClick={() => void runMaster(phase.projectId, phase.documentVersion)}
          >
            {t("zrobMaster")}
          </Button>
        </div>
      ) : null}

      {phase.kind === "mastering" ? (
        <p className="text-sm text-[var(--brd-mute)]" data-testid="master-only-working">
          {t("masteruje")}
        </p>
      ) : null}

      {phase.kind === "done" || phase.kind === "approved" ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--brd-ink)]">{t("masterGotowy")}</p>
          {phase.url ? (
            <audio controls src={phase.url} className="w-full max-w-md" data-testid="master-only-preview" />
          ) : null}
          {phase.kind === "done" ? (
            <Button
              type="button"
              data-testid="master-only-approve"
              onClick={() => void approve(phase.projectId, phase.documentVersion, phase.jobId, phase.url)}
            >
              {t("zatwierdz")}
            </Button>
          ) : (
            <Button
              type="button"
              data-testid="master-only-download"
              onClick={() => void downloadMaster(phase.projectId, phase.documentVersion)}
            >
              {t("pobierzWav")}
            </Button>
          )}
        </div>
      ) : null}

      {phase.kind === "error" ? (
        <p className="text-sm text-[var(--brd-rec)]" role="alert" data-testid="master-only-error">
          {phase.message}
        </p>
      ) : null}
    </div>
  );
}
