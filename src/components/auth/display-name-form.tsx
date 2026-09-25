"use client";

import { useActionState } from "react";

import {
  updateDisplayNameAction,
  type AuthActionState,
} from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

const initialState: AuthActionState = { error: null, success: false };

export function DisplayNameForm({
  initialDisplayName,
}: {
  initialDisplayName: string;
}) {
  const [state, action, pending] = useActionState(
    updateDisplayNameAction,
    initialState,
  );

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Nazwa wyświetlana
        <input
          name="displayName"
          type="text"
          defaultValue={initialDisplayName}
          className="rounded-lg border border-border bg-background px-3 py-2"
        />
      </label>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-muted-foreground">Zapisano.</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Zapisywanie…" : "Zapisz"}
      </Button>
    </form>
  );
}
