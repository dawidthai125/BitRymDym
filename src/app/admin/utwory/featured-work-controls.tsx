"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FEATURED_NOTE_MAX } from "@/lib/catalog/featured-work";

import { adminFeatureWorkAction, adminUnfeatureWorkAction } from "./actions";

/** Feature / un-feature one work for the current Warsaw week (+ optional home-page note). */
export function FeaturedWorkControls({
  workId,
  featured,
  otherFeatured,
  note,
}: {
  workId: string;
  /** This work is this week's feature. */
  featured: boolean;
  /** Another work is featured this week (featuring this one replaces it). */
  otherFeatured: boolean;
  note: string | null;
}) {
  const t = useTranslations("admin.adminWorksPage");
  const router = useRouter();
  const noteId = useId();
  const [draft, setDraft] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(mode: "feature" | "unfeature") {
    setError(null);
    setDone(false);
    startTransition(async () => {
      try {
        const outcome = mode === "feature" ? await adminFeatureWorkAction(workId, draft) : await adminUnfeatureWorkAction(workId);
        if (!outcome.ok) {
          setError(t(`bledy.${outcome.code}`));
          return;
        }
        setDone(true);
        router.refresh();
      } catch {
        setError(t("bledy.FAILED"));
      }
    });
  }

  return (
    <div className="space-y-2">
      {featured ? (
        <div className="space-y-1">
          <label htmlFor={noteId} className="block text-xs text-[var(--brd-ink-soft)]">{t("notatka")}</label>
          <input
            id={noteId}
            type="text"
            value={draft}
            maxLength={FEATURED_NOTE_MAX}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-11 w-full border border-[var(--brd-line)] bg-transparent px-3 text-sm"
          />
          <p className="text-xs text-[var(--brd-mute)]">{t("notatkaPodpowiedz")}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {featured ? (
          <>
            <Button type="button" size="sm" disabled={pending} onClick={() => run("feature")}>
              {pending ? t("czekaj") : t("zapiszNotatke")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run("unfeature")}>
              {t("cofnij")}
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant={otherFeatured ? "outline" : "default"} disabled={pending} onClick={() => run("feature")}>
            {pending ? t("czekaj") : otherFeatured ? t("zamien") : t("wyroznij")}
          </Button>
        )}
      </div>
      {done ? <p className="text-xs text-[var(--brd-ink-soft)]">{t("zapisano")}</p> : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
