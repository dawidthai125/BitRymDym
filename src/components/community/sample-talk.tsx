"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { CommunityThread } from "@/components/community/community-thread";

type Loaded = {
  enabled: boolean;
  own: boolean;
  commentsOpen?: boolean;
  average: number | null;
  count: number;
  mine: number | null;
  comments: { id: string; author: string; body: string; createdAt: string }[];
};

export function SampleTalk({ id, signedIn }: { id: string; signedIn: boolean }) {
  const t = useTranslations("community.thread");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  async function toggle() {
    if (!loaded) {
      const response = await fetch(`/api/community/thread?kind=sample&id=${encodeURIComponent(id)}`);
      const payload = (await response.json().catch(() => null)) as Loaded | null;
      if (payload) setLoaded(payload);
    }
    setOpen((value) => !value);
  }

  return (
    <div>
      <button type="button" onClick={() => void toggle()} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4" aria-expanded={open}>
        {t("rate")}
      </button>
      {open && loaded ? (
        <CommunityThread
          kind="sample"
          targetId={id}
          signedIn={signedIn}
          own={loaded.own}
          enabled={loaded.enabled}
          commentsOpen={loaded.commentsOpen !== false}
          average={loaded.average}
          count={loaded.count}
          mine={loaded.mine}
          comments={loaded.comments}
        />
      ) : null}
    </div>
  );
}
