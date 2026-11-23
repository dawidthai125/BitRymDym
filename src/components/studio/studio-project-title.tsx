"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { STUDIO_TITLE_MAX_LENGTH } from "@/config/studio";
import { useLibText } from "@/i18n/use-lib-text";

/** Project name in the Studio header: click to rename, Enter / blur saves, Escape cancels. */
export function StudioProjectTitle({
  projectId,
  title,
  onRenamed,
}: {
  projectId: string;
  title: string;
  onRenamed: (title: string) => void;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
  const [draft, setDraft] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  async function save(next: string) {
    try {
      const res = await fetch(`/api/studio/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      const json = (await res.json()) as { title?: string; error?: string };
      if (!res.ok || !json.title) {
        setFailed(json.error ?? tr("nieUdaloSieZmienicNazwy"));
        return;
      }
      setFailed(null);
      onRenamed(json.title);
    } catch {
      setFailed(tr("nieUdaloSieZmienicNazwy"));
    }
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {draft === null ? (
        <h1 className="min-w-0 text-sm leading-none text-[var(--brd-mute)]">
          <button
            type="button"
            className="block min-h-11 max-w-full truncate text-left underline-offset-4 hover:text-[var(--brd-ink)] hover:underline"
            title={tr("zmienNazweProjektu")}
            data-testid="studio-project-title"
            onClick={() => {
              setFailed(null);
              setDraft(title);
            }}
          >
            {tl(title)}
          </button>
        </h1>
      ) : (
        <input
          type="text"
          autoFocus
          value={draft}
          maxLength={STUDIO_TITLE_MAX_LENGTH}
          aria-label={tr("nazwaProjektu")}
          data-testid="studio-project-title-field"
          className="min-h-11 w-full max-w-96 min-w-0 rounded border border-[var(--brd-line)] px-2 text-sm"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.preventDefault();
              cancelledRef.current = true;
              event.currentTarget.blur();
            }
          }}
          onBlur={() => {
            const next = draft.trim();
            const cancelled = cancelledRef.current;
            cancelledRef.current = false;
            setDraft(null);
            if (!cancelled && next && next !== title) void save(next);
          }}
        />
      )}
      {failed ? (
        <p role="alert" className="text-xs text-[var(--brd-warn)]">
          {tl(failed)}
        </p>
      ) : null}
    </div>
  );
}
