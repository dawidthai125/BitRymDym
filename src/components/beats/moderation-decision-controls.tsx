"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  approveUserBeatAction,
  rejectUserBeatAction,
} from "@/lib/beats/community-actions";

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function ModerationDecisionControls({ beatId }: { beatId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveUserBeatAction(beatId);
      if (!result.success) {
        setError(result.error ?? "Zatwierdzenie nie powiodło się.");
        return;
      }
      router.push("/admin/moderation");
      router.refresh();
    });
  }

  function onReject() {
    setError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Powód odrzucenia jest wymagany.");
      return;
    }
    startTransition(async () => {
      const result = await rejectUserBeatAction(beatId, trimmed);
      if (!result.success) {
        setError(result.error ?? "Odrzucenie nie powiodło się.");
        return;
      }
      router.push("/admin/moderation");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={pending} onClick={onApprove}>
          Zatwierdź
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setShowReject((v) => !v)}
        >
          Odrzuć
        </Button>
      </div>

      {showReject ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Powód odrzucenia *
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={2000}
              className={fieldClass}
              placeholder="Opisz, co użytkownik powinien poprawić."
            />
          </label>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onReject}
          >
            Potwierdź odrzucenie
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
