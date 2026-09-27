import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth/session";
import { canAccessAdminNav } from "@/lib/auth/permissions";

export default async function AdminIndexPage() {
  const context = await getCurrentProfile();
  if (canAccessAdminNav(context?.profile.role)) {
    redirect("/admin/beats");
  }
  redirect("/admin/moderation");
}
