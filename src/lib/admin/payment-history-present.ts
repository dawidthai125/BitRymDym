/**
 * Pure labels for the admin purchase history. No database access.
 */

export const ADMIN_PAYMENTS_PAGE_SIZE = 50;

const TIERS = ["BRONZE", "SILVER", "GOLD"] as const;
const PACKS = ["take", "master", "youtube"] as const;
const PERIODS = ["month", "year", "once"] as const;
const STATUSES = ["pending", "paid", "failed"] as const;
const GRANTS = ["pending", "granted", "skipped"] as const;

export type PaymentHistoryTier = (typeof TIERS)[number];
export type PaymentHistoryPack = (typeof PACKS)[number];
export type PaymentHistoryPeriod = (typeof PERIODS)[number];
export type PaymentHistoryStatus = (typeof STATUSES)[number];
export type PaymentHistoryGrant = (typeof GRANTS)[number];

export type PaymentHistoryProduct =
  | { kind: "plan"; tier: PaymentHistoryTier }
  | { kind: "addon" }
  | { kind: "pack"; pack: PaymentHistoryPack }
  | { kind: "unknown" };

export type PaymentHistoryOrderInput = {
  product_kind: string | null;
  plan_tier: string | null;
  addon: string | null;
  pack: string | null;
  period: string | null;
  amount_grosz: number | null;
  status: string | null;
  grant_status: string | null;
};

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  if (!value) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function parsePaymentHistoryPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 1) return 1;
  return page;
}

export function formatGroszPln(grosz: number | null, locale: "pl" | "en"): string {
  if (grosz === null || !Number.isSafeInteger(grosz)) return "—";
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(grosz / 100);
}

export function paymentHistoryProduct(row: PaymentHistoryOrderInput): PaymentHistoryProduct {
  if (row.product_kind === "plan") {
    const tier = oneOf(row.plan_tier, TIERS);
    return tier ? { kind: "plan", tier } : { kind: "unknown" };
  }
  if (row.product_kind === "addon" && row.addon === "reference_mastering") {
    return { kind: "addon" };
  }
  if (row.product_kind === "pack") {
    const pack = oneOf(row.pack, PACKS);
    return pack ? { kind: "pack", pack } : { kind: "unknown" };
  }
  return { kind: "unknown" };
}

export function paymentHistoryPeriod(period: string | null): PaymentHistoryPeriod | null {
  return oneOf(period, PERIODS);
}

export function paymentHistoryStatus(status: string | null): PaymentHistoryStatus | null {
  return oneOf(status, STATUSES);
}

export function paymentHistoryGrant(grant: string | null): PaymentHistoryGrant | null {
  return oneOf(grant, GRANTS);
}
