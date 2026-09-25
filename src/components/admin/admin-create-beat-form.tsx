"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  createPlatformBeatAction,
  type BeatActionState,
} from "@/lib/beats/actions";

const initial: BeatActionState = { error: null, success: false };

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function AdminCreateBeatForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    createPlatformBeatAction,
    initial,
  );

  useEffect(() => {
    if (state.success && state.beatId) {
      router.push(`/admin/beats/${state.beatId}`);
    }
  }, [state.success, state.beatId, router]);

  return (
    <form action={action} className="flex max-w-xl flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Tytuł *
        <input name="title" required maxLength={200} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Producent
        <input name="producer" maxLength={500} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Opis
        <textarea name="description" rows={3} maxLength={4000} className={fieldClass} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Gatunek
          <input name="genre" maxLength={500} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Styl
          <input name="style" maxLength={500} className={fieldClass} />
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
            defaultValue={140}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tonacja
          <input name="key" maxLength={500} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Skala
          <input name="scale" maxLength={500} className={fieldClass} />
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
          defaultValue={120}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tagi (oddzielone przecinkami)
        <input name="tags" className={fieldClass} placeholder="trap, dark" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Cover ref
        <input name="coverRef" maxLength={500} className={fieldClass} />
      </label>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-foreground" role="status">
          Utworzono DRAFT — przekierowanie…
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Tworzenie…" : "Utwórz DRAFT"}
      </Button>
    </form>
  );
}
