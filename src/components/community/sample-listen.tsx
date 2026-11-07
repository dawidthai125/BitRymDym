"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

export function SampleListen({ id }: { id: string }) {
  const t = useTranslations("community.catalog");
  const [note, setNote] = useState<string | null>(null);

  async function play() {
    setNote(null);
    const response = await fetch(`/api/studio/samples/${id}/play`);
    const payload = (await response.json().catch(() => ({}))) as { url?: string };
    if (!payload.url) {
      setNote(t("signInListen"));
      return;
    }
    const audio = new Audio(payload.url);
    await audio.play().catch(() => setNote(t("signInListen")));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void play()} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
        {t("listen")}
      </button>
      {note ? (
        <Link href="/sign-in" className="text-sm text-[var(--brd-mute)] underline underline-offset-4">
          {note}
        </Link>
      ) : null}
    </div>
  );
}
