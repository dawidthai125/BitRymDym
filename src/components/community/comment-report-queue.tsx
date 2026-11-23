"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "@/components/ui/app-link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adminResolveCommentReportsAction } from "@/app/admin/moderation/actions";
import { Button } from "@/components/ui/button";
import { intlTag, resolveLocale } from "@/i18n/config";
import { REPORT_REASONS } from "@/lib/community/comment-moderation-policy";

export type CommentReportQueueRow = {
  commentId: string;
  body: string;
  author: string;
  threadHref: string;
  state: "visible" | "deleted" | "owner" | "staff" | "reports";
  reporters: number;
  reasons: Partial<Record<(typeof REPORT_REASONS)[number], number>>;
  details: string[];
  lastReportedAt: string;
};

/** Staff queue of reported community comments in /admin/moderation (DSA art. 16). */
export function CommentReportQueue({ enabled, items }: { enabled: boolean; items: CommentReportQueueRow[] }) {
  const t = useTranslations("admin.adminCommentReports");
  const tag = intlTag(resolveLocale(useLocale()));
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(commentId: string, decision: "hide" | "dismiss") {
    setError(null);
    startTransition(async () => {
      const outcome = await adminResolveCommentReportsAction(commentId, decision);
      if (!outcome.ok && outcome.code !== "ALREADY_CLOSED") {
        setError(outcome.code === "FORBIDDEN" ? t("forbidden") : t("failed"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-3" aria-labelledby="queue-comment-reports">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--brd-line)] pb-2">
        <h2 id="queue-comment-reports" className="text-lg font-medium tracking-tight">
          {t("title")}
        </h2>
        <span className="brd-data text-sm text-[var(--brd-mute)]">{items.length}</span>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {!enabled ? (
        <p className="text-sm text-muted-foreground">{t("off")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.commentId} className="space-y-2 rounded-lg border border-[var(--brd-line)] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-[var(--brd-mute)]">
                <span>{item.author}</span>
                <span>{t(`state.${item.state}`)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-[var(--brd-ink)]">{item.body}</p>
              <p className="text-xs">
                <span className="font-medium">{t("reporters", { v0: item.reporters })}</span>
                {" · "}
                {REPORT_REASONS.filter((reason) => item.reasons[reason]).map((reason) => `${t(`reason.${reason}`)} ×${item.reasons[reason]}`).join(", ")}
                {" · "}
                {new Date(item.lastReportedAt).toLocaleString(tag)}
              </p>
              {item.details.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--brd-ink-soft)]">
                  {item.details.map((text, index) => (
                    <li key={index} className="whitespace-pre-wrap break-words">{text}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Link href={item.threadHref} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
                  {t("thread")}
                </Link>
                <Button type="button" size="sm" disabled={pending} onClick={() => decide(item.commentId, "hide")}>
                  {t("hide")}
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => decide(item.commentId, "dismiss")}>
                  {t("dismiss")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
