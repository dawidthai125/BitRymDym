import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { PremiumReturnView, type ReturnState } from "@/components/premium/premium-return-view";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { getCurrentProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OrderRow = {
  product_kind: string;
  plan_tier: string | null;
  addon: string | null;
  status: string;
  grant_status: string;
  grant_note: string | null;
  granted_until: string | null;
};

function formatWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    dateStyle: "long",
    timeZone: "Europe/Warsaw",
  }).format(date);
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.premiumPage.returnPage");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function PremiumReturnPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!SESSION.test(sessionId)) {
    return <PremiumReturnView state={{ status: "missing" }} />;
  }
  const context = await getCurrentProfile();
  if (!context) redirect(signInPathWithNext(`/premium/return/${sessionId}`));

  const t = await getTranslations("account.premiumPage.returnPage");
  const locale = await getLocale();
  let state: ReturnState = { status: "missing" };

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("payment_orders")
      .select("product_kind, plan_tier, addon, status, grant_status, grant_note, granted_until")
      .eq("session_id", sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) {
      state = { status: "pending" };
    } else if (data) {
      const row = data as OrderRow;
      if (row.status === "failed") state = { status: "failed" };
      else if (row.status === "pending") state = { status: "pending" };
      else if (row.status === "paid" && row.grant_status === "skipped") {
        const reason = row.grant_note === "downgrade" || row.grant_note === "addon_perpetual" || row.grant_note === "perpetual"
          ? row.grant_note
          : "perpetual";
        state = { status: "skipped", reason };
      } else if (row.status === "paid" && row.grant_status === "granted") {
        const product = row.product_kind === "addon" ? t("produkt.referencja") : (row.plan_tier ?? t("produkt.plan"));
        const until = row.granted_until ? formatWhen(row.granted_until, locale) : t("bezDaty");
        state = { status: "paid", product, until };
      }
    }
  } catch {
    state = { status: "pending" };
  }

  return <PremiumReturnView state={state} />;
}
