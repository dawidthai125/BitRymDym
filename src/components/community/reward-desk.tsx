import { getTranslations } from "next-intl/server";

import { RewardClaimButton } from "@/components/community/reward-claim-button";
import { listMyRewards } from "@/lib/community/community-service";

export async function RewardDesk({ userId }: { userId: string }) {
  const t = await getTranslations("community.rewards");
  const loaded = await listMyRewards(userId).catch(() => ({ enabled: false, rewards: [] }));
  return (
    <section id="nagrody" className="scroll-mt-24 space-y-3 border border-[var(--brd-line)] p-5">
      <h2 className="font-poster text-lg font-bold uppercase tracking-[0.08em]">{t("title")}</h2>
      <p className="text-sm text-[var(--brd-ink-soft)]">{t("lead")}</p>
      {!loaded.enabled ? <p className="text-sm text-[var(--brd-mute)]">{t("off")}</p> : null}
      {loaded.enabled && loaded.rewards.length === 0 ? (
        <p className="text-sm text-[var(--brd-mute)]">{t("empty")}</p>
      ) : null}
      {loaded.rewards.length > 0 ? (
        <ul className="space-y-4">
          {loaded.rewards.map((reward) => (
            <li key={reward.id} className="border-t border-[var(--brd-line)] pt-3">
              <p className="text-sm text-[var(--brd-ink)]">
                {t("place", { place: reward.place, when: reward.periodKey })}
              </p>
              <p className="text-sm text-[var(--brd-mute)]">{reward.title}</p>
              <RewardClaimButton
                id={reward.id}
                claimed={reward.status === "claimed"}
                label={reward.mode === "package_month" ? reward.tier : String(reward.days)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
