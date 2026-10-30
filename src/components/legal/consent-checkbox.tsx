"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { LEGAL_PATHS } from "@/lib/legal/legal-config";

const linkCls = "underline underline-offset-4";

/** Sign-up consent (required). Links open in a new tab so the form keeps its values. */
export function SignupConsentCheckbox() {
  const t = useTranslations("common.legal");
  return (
    <label className="flex min-h-11 items-start gap-3 text-sm">
      <input type="checkbox" name="acceptTerms" required className="mt-1 size-4 shrink-0 accent-[var(--brd-ink)]" data-testid="signup-accept-terms" />
      <span>
        {t.rich("zgodaRejestracja", {
          regulamin: (c) => <Link href={LEGAL_PATHS.terms} target="_blank" className={linkCls}>{c}</Link>,
          prywatnosc: (c) => <Link href={LEGAL_PATHS.privacy} target="_blank" className={linkCls}>{c}</Link>,
        })}
      </span>
    </label>
  );
}

/**
 * Purchase consent for the future checkout (not mounted yet — payments are off).
 * Use with `purchaseConsentValid` on the server and store TERMS_VERSION + timestamp with the order.
 */
export function PurchaseConsent({ value, onChange }: { value: { acceptTerms: boolean; immediatePerformance: boolean }; onChange: (v: { acceptTerms: boolean; immediatePerformance: boolean }) => void }) {
  const t = useTranslations("common.legal");
  return (
    <fieldset className="flex flex-col gap-2 text-sm" data-testid="purchase-consent">
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" name="acceptTerms" checked={value.acceptTerms} onChange={(e) => onChange({ ...value, acceptTerms: e.target.checked })} className="mt-1 size-4 shrink-0" />
        <span>{t.rich("zakupRegulamin", { regulamin: (c) => <Link href={LEGAL_PATHS.terms} target="_blank" className={linkCls}>{c}</Link> })}</span>
      </label>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" name="immediatePerformance" checked={value.immediatePerformance} onChange={(e) => onChange({ ...value, immediatePerformance: e.target.checked })} className="mt-1 size-4 shrink-0" />
        <span>{t("zakupNatychmiast")}</span>
      </label>
      {!(value.acceptTerms && value.immediatePerformance) ? <p className="text-[var(--brd-mute)]">{t("zakupWymagane")}</p> : null}
    </fieldset>
  );
}
