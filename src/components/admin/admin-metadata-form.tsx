"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  updateBeatMetadataAction,
  type BeatActionState,
} from "@/lib/beats/actions";
import type { Beat } from "@/types/domain";

const initial: BeatActionState = { error: null, success: false };

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function AdminMetadataForm({ beat }: { beat: Beat }) {
  const [state, action, pending] = useActionState(
    updateBeatMetadataAction,
    initial,
  );

  return (
    <form action={action} className="flex max-w-xl flex-col gap-3">
      <input type="hidden" name="beatId" value={beat.id} />
      <label className="flex flex-col gap-1 text-sm">
        Tytuł *
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={beat.title}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Producent
        <input
          name="producer"
          maxLength={500}
          defaultValue={beat.producer ?? ""}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Opis
        <textarea
          name="description"
          rows={3}
          maxLength={4000}
          defaultValue={beat.description ?? ""}
          className={fieldClass}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Gatunek
          <input
            name="genre"
            maxLength={500}
            defaultValue={beat.genre ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Styl
          <input
            name="style"
            maxLength={500}
            defaultValue={beat.style ?? ""}
            className={fieldClass}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          BPM *
          <input
            name="bpm"
            type="number"
            required
            min={1}
            max={300}
            defaultValue={beat.bpm}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tonacja
          <input
            name="key"
            maxLength={500}
            defaultValue={beat.key ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Skala
          <input
            name="scale"
            maxLength={500}
            defaultValue={beat.scale ?? ""}
            className={fieldClass}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Czas (sekundy) *
        <input
          name="durationSeconds"
          type="number"
          required
          min={1}
          max={180}
          defaultValue={beat.durationSeconds}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tagi (oddzielone przecinkami)
        <input
          name="tags"
          defaultValue={beat.tags.join(", ")}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Cover ref
        <input
          name="coverRef"
          maxLength={500}
          defaultValue={beat.coverRef ?? ""}
          className={fieldClass}
        />
      </label>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-foreground" role="status">
          Zapisano metadata.
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Zapisywanie…" : "Zapisz metadata"}
      </Button>
    </form>
  );
}
