"use server";

import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";

import type { AuthActionState } from "@/lib/auth/actions";
import { validateDisplayName } from "@/lib/auth/display-name";
import { postAuthRedirectPath } from "@/lib/auth/next-path";
import { getCurrentProfile, getSessionUser } from "@/lib/auth/session";
import { needsSocialProfileCompletion } from "@/lib/auth/social";
import { sendWelcomeOnce } from "@/lib/email/notify/server";
import { signupConsent } from "@/lib/legal/legal-config";
import { normalizeReferralCode, REFERRAL_COOKIE, referralCookieOptions } from "@/lib/referrals/referral-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tryClaimAnonTakeAfterAuth } from "@/lib/takes/anon-account-claim";

/** Last step of a new Google / Apple account: ksywka + Regulamin (same consent record as e-mail sign-up). */
export async function finishSocialSignupAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const next = formData.get("next");
  if (!needsSocialProfileCompletion(user)) redirect(postAuthRedirectPath(null, next, "/account"));

  const ksywka = validateDisplayName(String(formData.get("displayName") ?? ""));
  if (!ksywka.ok) return { error: ksywka.error, success: false };
  if (formData.get("acceptTerms") !== "on") {
    return { error: "Zaakceptuj Regulamin i Politykę prywatności, aby założyć konto.", success: false };
  }

  const failed = { error: "Nie udało się dokończyć zakładania konta. Spróbuj ponownie.", success: false };
  const supabase = await createSupabaseServerClient();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ display_name: ksywka.value })
    .eq("id", user.id);
  if (profileError) return failed;
  // Consent last: until it is stored, the account stays on this form.
  const { error } = await supabase.auth.updateUser({ data: { display_name: ksywka.value, ...signupConsent() } });
  if (error) return failed;
  updateTag(`auth-profile-${user.id}`);

  after(() => sendWelcomeOnce(user.id).then(() => {}));
  try {
    const jar = await cookies();
    const referralCode = normalizeReferralCode(jar.get(REFERRAL_COOKIE)?.value);
    if (referralCode) {
      const { recordReferral, settleReferralReward } = await import("@/lib/referrals/referral-service");
      await recordReferral(user.id, referralCode);
      await settleReferralReward(user.id);
      jar.set(REFERRAL_COOKIE, "", referralCookieOptions(process.env.NODE_ENV === "production", 0));
    }
  } catch {
    // Best-effort, same as e-mail sign-up.
  }
  const { hookProfileCompleted } = await import("@/lib/creator-progress/award-hooks");
  await hookProfileCompleted(user.id);

  const context = await getCurrentProfile();
  const claim = context ? await tryClaimAnonTakeAfterAuth(context) : null;
  redirect(postAuthRedirectPath(claim, next, "/studio"));
}
