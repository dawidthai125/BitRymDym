"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { RECORDING_GLOBAL_MAX_SECONDS } from "@/config/recording";
import { updateSamplePolicySettingsAction } from "@/lib/takes/sample-policy-actions";
import type { SamplePolicySettingsRow } from "@/lib/takes/sample-policy-settings";

type AdminSamplePolicyFormProps = {
  initial: SamplePolicySettingsRow;
};

export function AdminSamplePolicyForm({ initial }: AdminSamplePolicyFormProps) {
  const [bronze, setBronze] = useState(initial.bronzeMaxRecordingSeconds);
  const [silver, setSilver] = useState(initial.silverMaxRecordingSeconds);
  const [gold, setGold] = useState(initial.goldMaxRecordingSeconds);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await updateSamplePolicySettingsAction({
        bronzeMaxRecordingSeconds: bronze,
        silverMaxRecordingSeconds: silver,
        goldMaxRecordingSeconds: gold,
      });
      if (!result.success) {
        setError(result.error ?? "Nie udało się zapisać.");
        return;
      }
      if (result.settings) {
        setBronze(result.settings.bronzeMaxRecordingSeconds);
        setSilver(result.settings.silverMaxRecordingSeconds);
        setGold(result.settings.goldMaxRecordingSeconds);
      }
      setSuccess("Zapisano ustawienia Sample Policy.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <p className="text-sm text-[var(--brd-ink-soft)]">
        Globalny limit techniczny:{" "}
        <strong>{RECORDING_GLOBAL_MAX_SECONDS} s</strong>. ANONYMOUS (15 s) i
        FREE (30 s) są stałe systemowo — Admin może zmieniać tylko BRONZE /
        SILVER / GOLD.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <DurationField
          id="bronze-max"
          label="BRONZE — max duration (s)"
          value={bronze}
          onChange={setBronze}
          disabled={isPending}
        />
        <DurationField
          id="silver-max"
          label="SILVER — max duration (s)"
          value={silver}
          onChange={setSilver}
          disabled={isPending}
        />
        <DurationField
          id="gold-max"
          label="GOLD — max duration (s)"
          value={gold}
          onChange={setGold}
          disabled={isPending}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending} className="min-h-11">
          {isPending ? "Zapisywanie…" : "Zapisz"}
        </Button>
        {success ? (
          <p className="text-sm text-[var(--brd-green)]" role="status">
            {success}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function DurationField(props: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1.5 text-sm" htmlFor={props.id}>
      <span className="font-medium">{props.label}</span>
      <input
        id={props.id}
        type="number"
        min={1}
        max={RECORDING_GLOBAL_MAX_SECONDS}
        step={1}
        required
        disabled={props.disabled}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="min-h-11 w-full border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3 text-[var(--brd-ink)]"
      />
      <span className="text-xs text-[var(--brd-mute)]">
        Zakres 1–{RECORDING_GLOBAL_MAX_SECONDS} s
      </span>
    </label>
  );
}
