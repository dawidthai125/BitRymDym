"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import {
  archiveBeatAction,
  hideSampleAction,
  rejectReportAction,
  releaseWorkAction,
  removeWorkAction,
} from "./actions";

type Outcome = { ok: true } | { ok: false; message: string };

function useAct() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (label: string, fn: () => Promise<Outcome>) =>
    start(async () => {
      if (!window.confirm(label)) return;
      const out = await fn();
      setMsg(out.ok ? "Zapisane." : out.message);
    });
  return { pending, msg, run };
}

export function HeldWorkControls({ workId }: { workId: string }) {
  const [note, setNote] = useState("");
  const { pending, msg, run } = useAct();
  return (
    <div className="flex flex-col gap-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notatka (opcjonalnie)" maxLength={500} className="min-h-11 border border-[var(--brd-line)] bg-transparent px-2 text-sm" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="min-h-11" disabled={pending} onClick={() => run("Wpuścić utwór do katalogu?", () => releaseWorkAction(workId, note))}>Wpuść do katalogu</Button>
        <Button type="button" size="sm" variant="destructive" className="min-h-11" disabled={pending} onClick={() => run("Odrzucić utwór? Właściciel nie opublikuje go ponownie.", () => removeWorkAction(workId, note))}>Odrzuć</Button>
      </div>
      {msg ? <p role="status" className="text-xs">{msg}</p> : null}
    </div>
  );
}

export function ReportControls({ reportId, kind, targetId }: { reportId: string; kind: "work" | "beat" | "sample"; targetId: string }) {
  const [note, setNote] = useState("");
  const { pending, msg, run } = useAct();
  const take = kind === "work"
    ? () => removeWorkAction(targetId, note, reportId)
    : kind === "sample"
      ? () => hideSampleAction(targetId, note, reportId)
      : () => archiveBeatAction(targetId, note, reportId);
  const takeLabel = kind === "work" ? "Zdejmij utwór" : kind === "sample" ? "Zdejmij sampel z katalogu" : "Zarchiwizuj bit";
  return (
    <div className="flex flex-col gap-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notatka (opcjonalnie)" maxLength={500} className="min-h-11 border border-[var(--brd-line)] bg-transparent px-2 text-sm" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="destructive" className="min-h-11" disabled={pending} onClick={() => run(`${takeLabel}?`, take)}>{takeLabel}</Button>
        <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={pending} onClick={() => run("Odrzucić zgłoszenie?", () => rejectReportAction(reportId, note))}>Odrzuć zgłoszenie</Button>
      </div>
      {msg ? <p role="status" className="text-xs">{msg}</p> : null}
    </div>
  );
}

export function RemoveWorkButton({ workId }: { workId: string }) {
  const { pending, msg, run } = useAct();
  return (
    <div className="flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={pending} onClick={() => run("Zdjąć utwór z katalogu? Właściciel nie opublikuje go ponownie.", () => removeWorkAction(workId, ""))}>Zdejmij z katalogu</Button>
      {msg ? <p role="status" className="text-xs">{msg}</p> : null}
    </div>
  );
}
