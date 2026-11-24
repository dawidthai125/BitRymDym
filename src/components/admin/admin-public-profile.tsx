"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setAdminPublicProfileBlockedAction } from "@/app/admin/users/actions";
import Link from "@/components/ui/app-link";
import type { AdminCreatorProfile } from "@/lib/creators/creator-profile-server";

/** Admin off switch of one user's public profile (asks once before acting). */
export function AdminPublicProfile({ userId, profile }: { userId: string; profile: AdminCreatorProfile }) {
  const t = useTranslations("admin.userDesk");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  function apply() {
    setAsking(false);
    start(async () => {
      const result = await setAdminPublicProfileBlockedAction({ targetUserId: userId, blocked: !profile.blocked });
      setNote(result.success ? { ok: true, text: t("profilZapisano") } : { ok: false, text: result.error ?? t("profilBlad") });
      if (result.success) router.refresh();
    });
  }

  const button = "min-h-10 rounded-md border border-[var(--brd-line)] px-3 text-sm hover:border-[var(--brd-amber)] disabled:opacity-40";
  return (
    <section aria-labelledby="desk-public-profile" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--brd-line)] px-4 py-3" data-testid="admin-public-profile">
      <div>
        <h2 id="desk-public-profile" className="text-base font-semibold">{t("profilTytul")}</h2>
        <p className="text-sm text-[var(--brd-ink-soft)]">
          {t(profile.blocked ? "profilZablokowany" : profile.enabled ? "profilWlaczony" : "profilNiewlaczony")}
          {profile.path && profile.enabled && !profile.blocked ? (
            <>
              {" · "}
              <Link href={profile.path} className="underline underline-offset-4">{t("profilOtworz")}</Link>
            </>
          ) : null}
        </p>
        {note ? <p role={note.ok ? "status" : "alert"} className="text-sm">{note.text}</p> : null}
      </div>
      {asking ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t("profilPotwierdz")}</span>
          <button type="button" className={button} onClick={apply}>{t("tak")}</button>
          <button type="button" className={button} onClick={() => setAsking(false)}>{t("nie")}</button>
        </div>
      ) : (
        <button type="button" className={button} disabled={pending} onClick={() => setAsking(true)}>
          {t(profile.blocked ? "profilOdblokuj" : "profilZablokuj")}
        </button>
      )}
    </section>
  );
}
