"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function StatusButton({ threadId, status }: { threadId: string; status: "open" | "closed" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const next = status === "open" ? "closed" : "open";

  async function change() {
    setBusy(true);
    setFailed(false);
    const res = await fetch(`/api/admin/support/${threadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh();
    else setFailed(true);
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void change()}>
        {next === "closed" ? "Zamknij sprawę" : "Otwórz ponownie"}
      </Button>
      {failed ? <span role="alert" className="text-sm text-[var(--brd-rec)]">Nie udało się.</span> : null}
    </div>
  );
}
