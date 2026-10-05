"use client";

import type { BpmUncertaintyEnvelope } from "@/lib/beats/bpm-uncertainty";
import {
  buildBpmUxModel,
  confidenceClassLabel,
  type BpmUxModel,
} from "@/lib/beats/bpm-uncertainty-ui";

type Props = {
  envelope: BpmUncertaintyEnvelope | null;
  selectedBpm: number | null;
  onSelect: (bpm: number) => void;
  disabled?: boolean;
  /** Optional status overlay (analyzing / finalize errors). */
  statusMessage?: string | null;
  idPrefix?: string;
};

function OptionButton(props: {
  option: BpmUxModel["options"][number];
  selected: boolean;
  disabled?: boolean;
  name: string;
  onSelect: (bpm: number) => void;
}) {
  const { option, selected, disabled, name, onSelect } = props;
  return (
    <label
      className={[
        "flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 text-sm transition-colors",
        selected
          ? "border-foreground bg-foreground/5"
          : "border-border bg-background hover:border-foreground/40",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          value={option.bpm}
          checked={selected}
          disabled={disabled}
          onChange={() => onSelect(option.bpm)}
          className="size-4 accent-foreground"
          aria-label={option.label}
        />
        <span className="font-medium tabular-nums">{option.label}</span>
      </span>
      {option.hint ? (
        <span className="pl-6 text-xs text-muted-foreground">{option.hint}</span>
      ) : null}
    </label>
  );
}

/**
 * Controlled BPM UX over server BpmUncertaintyEnvelope.
 * Does not invent candidates — only renders envelope allowlist options.
 */
export function BpmUncertaintyField({
  envelope,
  selectedBpm,
  onSelect,
  disabled = false,
  statusMessage = null,
  idPrefix = "bpm-ux",
}: Props) {
  if (!envelope) {
    return (
      <div
        className="flex flex-col gap-1 text-sm"
        role="status"
        aria-live="polite"
        data-testid="bpm-uncertainty-idle"
      >
        <span className="font-medium">BPM</span>
        <p className="text-xs text-muted-foreground">
          BPM zostanie wykryte automatycznie po analizie audio.
        </p>
        {statusMessage ? (
          <p className="text-xs text-muted-foreground">{statusMessage}</p>
        ) : null}
      </div>
    );
  }

  const model = buildBpmUxModel(envelope);
  const radioName = `${idPrefix}-choice`;

  if (model.phase === "UNAVAILABLE") {
    return (
      <div
        className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm"
        role="alert"
        data-testid="bpm-uncertainty-unavailable"
      >
        <p className="font-medium text-destructive">{model.headline}</p>
        <p className="text-xs text-muted-foreground">{model.description}</p>
        {statusMessage ? (
          <p className="text-xs text-destructive">{statusMessage}</p>
        ) : null}
      </div>
    );
  }

  if (model.phase === "AUTO_DETECTED") {
    const showAlternates =
      model.options.length > 1 &&
      selectedBpm != null &&
      model.detectedBpm != null &&
      selectedBpm !== model.detectedBpm;

    return (
      <div
        className="flex flex-col gap-2 text-sm"
        data-testid="bpm-uncertainty-auto"
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{model.headline}</span>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">
            {model.detectedBpm != null ? `${model.detectedBpm} BPM` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {confidenceClassLabel(model.confidenceClass)}
            <span className="sr-only">. {model.description}</span>
          </p>
          <p className="text-xs text-muted-foreground" aria-hidden="true">
            {model.description}
          </p>
        </div>

        {model.options.length > 1 ? (
          <details className="rounded-lg border border-border px-3 py-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Inne opcje systemu
            </summary>
            <div
              className="mt-2 flex flex-col gap-2"
              role="radiogroup"
              aria-label="Alternatywne BPM systemu"
            >
              {model.options.map((option) => (
                <OptionButton
                  key={option.bpm}
                  option={option}
                  selected={selectedBpm === option.bpm}
                  disabled={disabled}
                  name={radioName}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </details>
        ) : null}

        {showAlternates ? (
          <p className="text-xs text-muted-foreground" role="status">
            Wybrano inną wartość systemu: {selectedBpm} BPM.
          </p>
        ) : null}
        {statusMessage ? (
          <p className="text-xs text-muted-foreground" role="status">
            {statusMessage}
          </p>
        ) : null}
      </div>
    );
  }

  if (model.phase === "CONFLICT") {
    return (
      <div
        className="flex flex-col gap-2 text-sm"
        data-testid="bpm-uncertainty-conflict"
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{model.headline}</span>
          <p className="text-xs text-muted-foreground">{model.description}</p>
          <p className="text-xs text-muted-foreground">
            {confidenceClassLabel(model.confidenceClass)}
          </p>
        </div>
        <div
          className="flex flex-col gap-2"
          role="radiogroup"
          aria-label="Hipotezy BPM"
          aria-required="true"
        >
          {model.options.map((option) => (
            <OptionButton
              key={`${option.hypothesisId ?? "x"}-${option.bpm}`}
              option={option}
              selected={selectedBpm === option.bpm}
              disabled={disabled}
              name={radioName}
              onSelect={onSelect}
            />
          ))}
        </div>
        {statusMessage ? (
          <p className="text-xs text-destructive" role="status">
            {statusMessage}
          </p>
        ) : null}
      </div>
    );
  }

  // NEEDS_SELECTION (MEDIUM / LOW)
  return (
    <div
      className="flex flex-col gap-2 text-sm"
      data-testid="bpm-uncertainty-select"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{model.headline}</span>
        {model.recommendedBpm != null ? (
          <p className="text-xl font-semibold tabular-nums tracking-tight">
            {model.recommendedBpm} BPM
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{model.description}</p>
        <p className="text-xs text-muted-foreground">
          {confidenceClassLabel(model.confidenceClass)}
        </p>
        {model.range != null ? (
          <p className="text-xs text-muted-foreground">
            Wąski zakres systemu: {model.range.min}–{model.range.max} BPM
          </p>
        ) : null}
      </div>
      <div
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
        role="radiogroup"
        aria-label="Kandydaci BPM"
        aria-required="true"
      >
        {model.options.map((option) => (
          <div key={option.bpm} className="min-w-[8rem] flex-1">
            <OptionButton
              option={option}
              selected={selectedBpm === option.bpm}
              disabled={disabled}
              name={radioName}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
      {statusMessage ? (
        <p className="text-xs text-destructive" role="status">
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
