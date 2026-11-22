"use server";

import { revalidatePath } from "next/cache";

import { featureWorkForWeek, unfeatureWorkForWeek, type FeatureOutcome } from "@/lib/catalog/featured-work-server";

function revalidateFeatured(workId: string) {
  revalidatePath("/admin/utwory");
  revalidatePath("/");
  revalidatePath("/utwory");
  revalidatePath(`/utwor/${workId}`);
}

/** ADMIN only (requireRole inside featureWorkForWeek). */
export async function adminFeatureWorkAction(workId: string, note: string): Promise<FeatureOutcome> {
  const outcome = await featureWorkForWeek({ workId, note });
  if (outcome.ok) revalidateFeatured(workId);
  return outcome;
}

/** ADMIN only (requireRole inside unfeatureWorkForWeek). */
export async function adminUnfeatureWorkAction(workId: string): Promise<FeatureOutcome> {
  const outcome = await unfeatureWorkForWeek(workId);
  if (outcome.ok) revalidateFeatured(workId);
  return outcome;
}
