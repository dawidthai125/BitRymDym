"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { requestPlanUsageRefresh } from "@/lib/plans/plan-usage-refresh";

/** Green popup after a settled payment. The address loses its parameter, so a reload does not show it again. */
export function PaymentSuccessDialog({ message, param }: { message: string; param: string }) {
  const t = useTranslations("account.premiumPage.returnPage");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // The header badge keeps plan limits for a minute: load the new plan now.
    requestPlanUsageRefresh();
    const url = new URL(window.location.href);
    url.searchParams.delete(param);
    window.history.replaceState(window.history.state, "", url);
  }, [param]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="payment-success-title"
      data-testid="payment-success"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-[var(--brd-r-xs)] border border-[#4ade80] bg-[#14632f] p-6 text-white backdrop:bg-black/60"
    >
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[#14632f]">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5 10 17.5 19 7" />
          </svg>
        </span>
        <div className="min-w-0">
          <h2 id="payment-success-title" className="text-lg font-semibold">{t("sukcesTytul")}</h2>
          <p className="mt-1 text-[0.95rem] leading-relaxed">{message}</p>
        </div>
      </div>
      <form method="dialog" className="mt-5 flex justify-end">
        <button type="submit" autoFocus className="min-h-11 rounded-[var(--brd-r-xs)] bg-white px-5 text-sm font-semibold text-[#14632f]">
          {t("sukcesOk")}
        </button>
      </form>
    </dialog>
  );
}
