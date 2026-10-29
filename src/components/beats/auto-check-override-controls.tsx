"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { overrideAutoCheckAction, retryAutoCheckAction } from "@/lib/beats/community-actions";

export function AutoCheckOverrideControls({ beatId, mode }: { beatId: string; mode: "override" | "retry" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    if (mode === "override" && reason.trim().length < 5) {
      setError("Podaj uzasadnienie (min. 5 znaków).");
      return;
    }
    startTransition(async () => {
      const result = mode === "override" ? await overrideAutoCheckAction(beatId, reason) : await retryAutoCheckAction(beatId);
      if (!result.success) {
        setError(result.error ?? "Operacja nie powiodła się.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {mode === "override" ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Uzasadnienie uchylenia (zapisywane w logu decyzji)
            <textarea
              className="min-h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Uchylenie przywraca bit do moderacji. Nie zatwierdza ani nie publikuje go.
          </p>
        </>
      ) : null}
      <Button type="button" variant="outline" disabled={pending} onClick={run}>
        {mode === "override" ? "Uchyl automatyczne odrzucenie" : "Ponów automatyczne sprawdzenie"}
      </Button>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
