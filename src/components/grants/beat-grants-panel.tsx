"use client";

import { useLibText } from "@/i18n/use-lib-text";


import { useLocale, useTranslations } from "next-intl";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { toUserFacingGrantError } from "@/lib/ui/user-errors";
import { intlTag, resolveLocale } from "@/i18n/config";

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
  const tl = useLibText();
  const t = useTranslations("beats.beatGrantsPanel");
  const tag = intlTag(resolveLocale(useLocale()));
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
      setError(
        toUserFacingGrantError(
          json.error ?? t("nieUdaloSieWczytac"),
        ),
      );
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
        setError(
          toUserFacingGrantError(
            json.error ?? t("nieUdaloSieUtworzyc"),
          ),
        );
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
        setError(
          toUserFacingGrantError(
            json.error ?? t("nieUdaloSieOdwolac"),
          ),
        );
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
          {t("udostepnijNagrywanie")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("mozeszZaprosicInnegoUzytkownika")}
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs">
          {t("uzytkownikIdLubDokladna")}
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={grantee}
            onChange={(e) => setGrantee(e.target.value)}
            placeholder={t("idLubKsywka")}
            autoComplete="off"
            disabled={pending}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:w-48">
          {t("wygasaOpcjonalnie")}
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
          {t("nadajDostep")}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{tl(error)}</p> : null}

      {active.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("brakAktywnychUprawnienDostepu")}
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {active.map((g) => (
            <li
              key={g.id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-0.5 text-sm">
                <p className="font-medium">
                  {tl(g.granteeDisplayName ?? g.granteeUserId.slice(0, 8))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("nagrywanie")}
                  {tl(g.expiresAt
                    ? t("wygasa", { v0: new Date(g.expiresAt).toLocaleString(tag) })
                    : t("bezterminowy"))}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => revokeGrant(g.id)}
              >
                {t("odwolaj")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
