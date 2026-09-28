"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

export type BeatGrantRow = {
  id: string;
  granteeUserId: string;
  granteeDisplayName: string | null;
  active: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export function BeatGrantsPanel({
  beatId,
  initialGrants,
}: {
  beatId: string;
  initialGrants: BeatGrantRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [grants, setGrants] = useState<BeatGrantRow[]>(initialGrants);
  const [error, setError] = useState<string | null>(null);
  const [grantee, setGrantee] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  async function refreshGrants() {
    const res = await fetch(`/api/beats/${beatId}/grants`);
    const json = (await res.json()) as {
      success?: boolean;
      grants?: BeatGrantRow[];
      error?: string;
    };
    if (!res.ok) {
      setError(json.error ?? "Nie udało się wczytać grantów.");
      return;
    }
    setGrants(json.grants ?? []);
  }

  function createGrant() {
    startTransition(async () => {
      setError(null);
      const body: { grantee: string; expiresAt?: string } = {
        grantee: grantee.trim(),
      };
      if (expiresAt.trim()) {
        body.expiresAt = new Date(expiresAt).toISOString();
      }
      const res = await fetch(`/api/beats/${beatId}/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Nie udało się utworzyć grantu.");
        return;
      }
      setGrantee("");
      setExpiresAt("");
      await refreshGrants();
      router.refresh();
    });
  }

  function revokeGrant(grantId: string) {
    startTransition(async () => {
      setError(null);
      const res = await fetch(
        `/api/beats/${beatId}/grants/${grantId}/revoke`,
        { method: "POST" },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Nie udało się odwołać grantu.");
        return;
      }
      await refreshGrants();
      router.refresh();
    });
  }

  const active = grants.filter((g) => g.active);

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight">
          Udostępnij RECORD
        </h2>
        <p className="text-xs text-muted-foreground">
          Grant pozwala oznaczyć użytkownika do nagrywania. Publiczny PUBLISHED
          RECORD działa bez grantu. Grant nie daje dostępu do próbek ani
          pobierania.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs">
          Użytkownik (UUID lub dokładna nazwa)
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={grantee}
            onChange={(e) => setGrantee(e.target.value)}
            placeholder="uuid lub display name"
            autoComplete="off"
            disabled={pending}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:w-48">
          Wygasa (opcjonalnie)
          <input
            type="datetime-local"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            disabled={pending}
          />
        </label>
        <Button
          type="button"
          size="sm"
          disabled={pending || !grantee.trim()}
          onClick={createGrant}
        >
          Nadaj grant
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {active.length === 0 ? (
        <p className="text-xs text-muted-foreground">Brak aktywnych grantów.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {active.map((g) => (
            <li
              key={g.id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-0.5 text-sm">
                <p className="font-medium">
                  {g.granteeDisplayName ?? g.granteeUserId.slice(0, 8)}
                </p>
                <p className="text-xs text-muted-foreground">
                  RECORD
                  {g.expiresAt
                    ? ` · wygasa ${new Date(g.expiresAt).toLocaleString()}`
                    : " · bezterminowy"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => revokeGrant(g.id)}
              >
                Odwołaj
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
