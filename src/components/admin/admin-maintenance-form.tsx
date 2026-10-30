"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useLibText } from "@/i18n/use-lib-text";
import { updateSiteMaintenanceAction } from "@/lib/site/maintenance-actions";
import { MAINTENANCE_MESSAGE_MAX } from "@/lib/site/maintenance-gate";
import type { SiteMaintenanceSettings } from "@/lib/site/maintenance-settings";
import { isoToWarsawLocalInput, warsawLocalInputToIso } from "@/lib/site/warsaw-datetime";
import { cn } from "@/lib/utils";

type Props = { initial: SiteMaintenanceSettings };

/** Admin toggle: "Strona dostępna dla użytkowników" on/off + optional message/end time. */
export function AdminMaintenanceForm({ initial }: Props) {
  const tl = useLibText();
  const t = useTranslations("maintenance.admin");
  const router = useRouter();
  const [saved, setSaved] = useState(initial.enabled);
  const [siteOn, setSiteOn] = useState(!initial.enabled);
  const [message, setMessage] = useState(initial.message ?? "");
  const [until, setUntil] = useState(isoToWarsawLocalInput(initial.until));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const enabling = !siteOn && !saved;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await updateSiteMaintenanceAction({
        enabled: !siteOn,
        message: message.trim() || null,
        until: warsawLocalInputToIso(until),
      });
      if (!result.success || !result.settings) {
        setError(result.error ?? t("saveError"));
        return;
      }
      setSaved(result.settings.enabled);
      setSiteOn(!result.settings.enabled);
      setMessage(result.settings.message ?? "");
      setUntil(isoToWarsawLocalInput(result.settings.until));
      setSuccess(result.settings.enabled ? t("savedOn") : t("savedOff"));
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" data-testid="maintenance-form">
      <div
        className={cn(
          "flex items-center justify-between gap-4 border p-4 sm:p-5",
          siteOn
            ? "border-[var(--brd-line)]"
            : "border-[var(--brd-rec)] bg-[color-mix(in_srgb,var(--brd-rec)_8%,transparent)]",
        )}
      >
        <div className="min-w-0">
          <p id="maint-switch-label" className="text-base font-medium">
            {t("switchLabel")}
          </p>
          <p className="mt-1 text-sm text-[var(--brd-ink-soft)]">
            {siteOn ? t("switchHintOff") : t("switchHintOn")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={siteOn}
          aria-labelledby="maint-switch-label"
          data-testid="maintenance-switch"
          disabled={isPending}
          onClick={() => setSiteOn((v) => !v)}
          className={cn(
            "relative inline-flex h-9 w-16 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)] disabled:opacity-60",
            siteOn
              ? "border-[var(--brd-ok)] bg-[var(--brd-ok)]"
              : "border-[var(--brd-rec)] bg-[var(--brd-rec)]",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "inline-block size-7 rounded-full bg-white shadow transition-transform",
              siteOn ? "translate-x-8" : "translate-x-1",
            )}
          />
        </button>
      </div>

      <label className="block space-y-1.5 text-sm" htmlFor="maint-message">
        <span className="font-medium">{t("messageLabel")}</span>
        <textarea
          id="maint-message"
          value={message}
          maxLength={MAINTENANCE_MESSAGE_MAX}
          rows={3}
          disabled={isPending}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("messagePlaceholder")}
          className="w-full border border-[var(--brd-line)] bg-transparent px-3 py-2 text-base"
        />
        <span className="block text-xs text-[var(--brd-mute)]">
          {t("messageHint", { max: MAINTENANCE_MESSAGE_MAX })} · {message.length}/{MAINTENANCE_MESSAGE_MAX}
        </span>
      </label>

      <div className="space-y-1.5 text-sm">
        <label htmlFor="maint-until" className="block font-medium">
          {t("untilLabel")}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="maint-until"
            type="datetime-local"
            value={until}
            disabled={isPending}
            onChange={(e) => setUntil(e.target.value)}
            className="min-h-11 border border-[var(--brd-line)] bg-transparent px-3 text-base"
          />
          {until ? (
            <button
              type="button"
              onClick={() => setUntil("")}
              className="min-h-11 px-2 text-sm underline underline-offset-4"
            >
              {t("clearUntil")}
            </button>
          ) : null}
        </div>
      </div>

      {enabling ? (
        <p role="alert" className="border-l-4 border-[var(--brd-rec)] pl-3 text-sm">
          {t("warnEnable")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={isPending}
          variant={enabling ? "destructive" : "default"}
          className="min-h-11"
        >
          {isPending ? t("saving") : t("save")}
        </Button>
        <a
          href="/maintenance"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          {t("preview")}
        </a>
        {success ? (
          <p className="text-sm text-[var(--brd-green)]" role="status">
            {success}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {tl(error)}
          </p>
        ) : null}
      </div>
    </form>
  );
}
