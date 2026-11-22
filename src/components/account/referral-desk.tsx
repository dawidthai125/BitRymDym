import { getTranslations } from "next-intl/server";

import { SectionLabel } from "@/components/brand/chrome";
import { ShareButtons } from "@/components/share/share-buttons";
import { REFERRAL_MONTHLY_REWARD_CAP, REFERRAL_REWARD_TAKE_UNITS } from "@/lib/referrals/referral-policy";
import { loadReferralDesk, settleReferralReward } from "@/lib/referrals/referral-service";

/**
 * "Zaproś znajomego" on /account: personal link (code created lazily), copy / share, counters.
 * Visiting the account also pays this user's own referral when it became due (best-effort).
 */
export async function ReferralDesk({ userId }: { userId: string }) {
  const t = await getTranslations("account.referral");
  const [desk] = await Promise.all([loadReferralDesk(userId), settleReferralReward(userId)]);
  if (!desk) return null;

  return (
    <section
      id="zapros"
      className="scroll-mt-24 space-y-4 border border-[var(--brd-line)] p-5"
      aria-labelledby="referral-title"
      data-testid="referral-desk"
    >
      <SectionLabel>
        <span id="referral-title">{t("tytul")}</span>
      </SectionLabel>
      <p className="text-sm text-[var(--brd-ink)]">{t("opis", { units: REFERRAL_REWARD_TAKE_UNITS })}</p>
      <div>
        <p className="text-xs text-[var(--brd-mute)]">{t("twojLink")}</p>
        <p className="brd-data mt-1 break-all text-sm text-[var(--brd-ink)]" data-testid="referral-link">
          {desk.link}
        </p>
      </div>
      <ShareButtons url={desk.link} text={t("tekstUdostepnienia")} title={t("tytulUdostepnienia")} testId="referral-share" compact />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--brd-mute)]">{t("zaproszeni")}</dt>
          <dd className="brd-data mt-1 text-lg text-[var(--brd-ink)]" data-testid="referral-invited">{desk.invited}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--brd-mute)]">{t("nagrodzeni")}</dt>
          <dd className="brd-data mt-1 text-lg text-[var(--brd-ink)]" data-testid="referral-rewarded">{desk.rewarded}</dd>
        </div>
      </dl>
      <p className="text-xs text-[var(--brd-mute)]">{t("zasady", { cap: REFERRAL_MONTHLY_REWARD_CAP })}</p>
    </section>
  );
}
