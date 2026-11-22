"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrdButton } from "@/components/brand/brd-button";
import type { LeakBeatOption } from "@/lib/admin/leak-checks";

import { adminConfirmLeakCheckAction, adminStartLeakCheckAction } from "./actions";

export type LeakFormLabels = {
  bit: string;
  wybierzBit: string;
  kopii: string;
  plik: string;
  plikPodpowiedz: string;
  sprawdz: string;
  wysylanie: string;
  bladDuzy: string;
  bladWysylki: string;
  wyslano: string;
};

/** Upload goes straight to storage (signed URL); the page refreshes itself while a check is running. */
export function LeakCheckForm({ beats, labels, running }: { beats: LeakBeatOption[]; labels: LeakFormLabels; running: boolean }) {
  const router = useRouter();
  const [beatId, setBeatId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [running, router]);

  async function submit() {
    if (!beatId || !file || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const start = await adminStartLeakCheckAction({ beatId, fileName: file.name, size: file.size });
      if (!start.ok) {
        setMessage(start.code === "TOO_BIG" ? labels.bladDuzy : labels.bladWysylki);
        return;
      }
      const put = await fetch(start.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream", "x-upsert": "false" },
        body: file,
      });
      if (!put.ok) {
        setMessage(labels.bladWysylki);
        return;
      }
      const done = await adminConfirmLeakCheckAction(start.checkId);
      if (!done.ok) {
        setMessage(labels.bladWysylki);
        return;
      }
      setMessage(labels.wyslano);
      setFile(null);
      router.refresh();
    } catch {
      setMessage(labels.bladWysylki);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4 border border-[var(--brd-line)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{labels.bit}</span>
        <select
          className="block w-full border border-[var(--brd-line)] bg-transparent px-3 py-2"
          value={beatId}
          onChange={(e) => setBeatId(e.target.value)}
          required
        >
          <option value="">{labels.wybierzBit}</option>
          {beats.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} · {b.copies} {labels.kopii}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{labels.plik}</span>
        <input
          type="file"
          accept="audio/*,video/*"
          className="block w-full text-sm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
        <span className="block text-xs text-[var(--brd-mute)]">{labels.plikPodpowiedz}</span>
      </label>
      <BrdButton type="submit" variant="primary" disabled={busy || !beatId || !file} className="min-h-11">
        {busy ? labels.wysylanie : labels.sprawdz}
      </BrdButton>
      {message ? <p role="status" className="text-sm">{message}</p> : null}
    </form>
  );
}
