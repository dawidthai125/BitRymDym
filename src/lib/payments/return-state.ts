import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import type { ReturnState } from "@/components/premium/premium-return-view";
import { PLAN_PACK_CATALOG, youtubeUnitsForGrosz } from "@/config/plan-policy";
import { purchaseEvent, type PurchaseEvent } from "@/lib/analytics/ga";
import { isUuid } from "@/lib/beats/audio-validation";
import { labelPremiumTier } from "@/lib/ui/labels";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const PAYMENT_SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Query parameter on /account that opens the "payment succeeded" popup. */
export const PAYMENT_SUCCESS_PARAM = "platnosc";

type OrderRow = {
  product_kind: string;
  plan_tier: string | null;
  addon: string | null;
  pack: string | null;
  status: string;
  grant_status: string;
  grant_note: string | null;
  granted_until: string | null;
  amount_grosz?: number | null;
};

function formatWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    dateStyle: "long",
    timeZone: "Europe/Warsaw",
  }).format(date);
}

/** Statistics event for a settled order: product and price only, no order or account id. */
function orderPurchase(row: Omit<OrderRow, "pack">, pack: string | null): PurchaseEvent | null {
  const amount = row.amount_grosz;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  const detail = row.product_kind === "plan" ? row.plan_tier : row.product_kind === "pack" ? pack : row.product_kind === "addon" ? row.addon : null;
  return purchaseEvent([row.product_kind, detail].filter(Boolean).join("_").toLowerCase(), amount);
}

/** What the buyer sees for their own order (return page, popup on the account). Read only. */
export async function loadReturnState(sessionId: string, userId: string): Promise<ReturnState> {
  const t = await getTranslations("account.premiumPage.returnPage");
  const locale = await getLocale();
  let state: ReturnState = { status: "missing" };
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("payment_orders")
      .select("product_kind, plan_tier, addon, status, grant_status, grant_note, granted_until, amount_grosz")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      state = { status: "pending" };
    } else if (data) {
      const row = data as Omit<OrderRow, "pack">;
      let pack: string | null = null;
      let amountGrosz: number | null = null;
      if (row.product_kind === "pack") {
        const extra = await admin.from("payment_orders").select("pack, amount_grosz").eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
        pack = extra.error || !extra.data ? null : ((extra.data as { pack?: string | null }).pack ?? null);
        amountGrosz = extra.error || !extra.data ? null : ((extra.data as { amount_grosz?: number | null }).amount_grosz ?? null);
      }
      // 2026-11-22: refunded orders showed "not found" (plans) or "payment in progress" (beats).
      if (row.status === "refunded") state = { status: "refunded" };
      else if (row.product_kind === "beat") {
        const extra = await admin.from("payment_orders").select("beat_id").eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
        const beatId = extra.error || !extra.data ? null : ((extra.data as { beat_id?: string | null }).beat_id ?? null);
        const href = isUuid(beatId) ? `/beat/${beatId}` : "/beats?katalog=platny";
        const catalogHref = "/beats?katalog=moj";
        if (row.status === "failed") state = { status: "beat_failed", href };
        else if (row.status === "paid" && row.grant_status === "skipped") state = { status: "beat_skipped", href };
        else if (row.status === "paid" && row.grant_status === "granted") state = { status: "beat_paid", href: catalogHref, purchase: orderPurchase(row, null) };
        else state = { status: "beat_pending", href };
      } else if (row.status === "failed") state = { status: "failed" };
      else if (row.status === "pending") state = { status: "pending" };
      else if (row.status === "paid" && row.grant_status === "skipped") {
        const reason = row.grant_note === "downgrade" || row.grant_note === "pending_plan" || row.grant_note === "addon_perpetual" || row.grant_note === "perpetual" || row.grant_note === "pack_amount"
          ? row.grant_note
          : "perpetual";
        state = { status: "skipped", reason };
      } else if (row.status === "paid" && row.grant_status === "granted") {
        const product = row.product_kind === "addon"
          ? t("produkt.referencja")
          : row.product_kind === "pack"
            ? t(pack === "master" ? "produkt.master" : pack === "youtube" ? "produkt.youtube" : "produkt.take", {
                n: pack === "master" ? PLAN_PACK_CATALOG.master.units : pack === "youtube" ? (youtubeUnitsForGrosz(amountGrosz ?? 0) ?? 1) : PLAN_PACK_CATALOG.take.units,
              })
            : (row.plan_tier ?? t("produkt.plan"));
        const until = row.product_kind === "pack" ? null : row.granted_until ? formatWhen(row.granted_until, locale) : t("bezDaty");
        state = {
          status: "paid",
          product,
          until,
          scheduled: row.grant_note === "schedule",
          kind: row.product_kind === "addon" ? "addon" : row.product_kind === "pack" ? "pack" : "plan",
          purchase: orderPurchase(row, pack),
        };
      }
    }
  } catch {
    state = { status: "pending" };
  }
  return state;
}

/** Popup text (and statistics event) for the buyer's own settled order; null for anything else (wrong id, someone else's, refunded). */
export async function paymentSuccess(
  sessionId: unknown,
  userId: string,
): Promise<{ message: string; purchase: PurchaseEvent | null } | null> {
  if (typeof sessionId !== "string" || !PAYMENT_SESSION_RE.test(sessionId)) return null;
  const state = await loadReturnState(sessionId, userId);
  if (state.status !== "paid") return null;
  const done = (message: string) => ({ message, purchase: state.purchase ?? null });
  const t = await getTranslations("account.premiumPage.returnPage");
  if (state.kind === "pack" || !state.until) return done(t("sukcesPakiet", { co: state.product }));
  const values = { co: state.kind === "plan" ? labelPremiumTier(state.product) : state.product, data: state.until };
  if (state.scheduled) return done(t("sukcesZaplanowane", values));
  return done(t(state.kind === "addon" ? "sukcesDodatek" : "sukcesPlan", values));
}
