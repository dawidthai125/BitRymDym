"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { BrdCheckbox } from "@/components/brand/brd-checkbox";
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
 * Purchase consent. The server accepts the order only when `purchaseConsentValid`
 * is true and stores TERMS_VERSION + timestamp on the payment row.
 */
export function PurchaseConsent({
  value,
  onChange,
  startsLater = false,
}: {
  value: { acceptTerms: boolean; immediatePerformance: boolean };
  onChange: (v: { acceptTerms: boolean; immediatePerformance: boolean }) => void;
  /** Cheaper plan that starts when the current one ends. Immediate performance is not asked. */
  startsLater?: boolean;
}) {
  const t = useTranslations("common.legal");
  const ready = value.acceptTerms && (startsLater || value.immediatePerformance);
  return (
    <fieldset className="flex flex-col gap-1 text-sm" data-testid="purchase-consent">
      <label className="flex min-h-11 items-center gap-1">
        <BrdCheckbox name="acceptTerms" checked={value.acceptTerms} onChange={(e) => onChange({ ...value, acceptTerms: e.target.checked })} data-testid="purchase-accept-terms" />
        <span>{t.rich("zakupRegulamin", { regulamin: (c) => <Link href={LEGAL_PATHS.terms} target="_blank" className={linkCls}>{c}</Link> })}</span>
      </label>
      {startsLater ? (
        <p className="text-[var(--brd-ink-soft)]">{t("zakupPozniej")}</p>
      ) : (
        <label className="flex min-h-11 items-center gap-1">
          <BrdCheckbox name="immediatePerformance" checked={value.immediatePerformance} onChange={(e) => onChange({ ...value, immediatePerformance: e.target.checked })} data-testid="purchase-immediate" />
          <span>{t("zakupNatychmiast")}</span>
        </label>
      )}
      {!ready ? <p className="text-[var(--brd-mute)]">{t(startsLater ? "zakupWymaganePozniej" : "zakupWymagane")}</p> : null}
    </fieldset>
  );
}
