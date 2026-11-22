"use server";

import { revalidatePath } from "next/cache";

import { confirmLeakCheck, startLeakCheck, type StartLeakCheckResult } from "@/lib/admin/leak-checks";

export async function adminStartLeakCheckAction(input: { beatId: string; fileName: string; size: number }): Promise<StartLeakCheckResult> {
  return startLeakCheck(input);
}

export async function adminConfirmLeakCheckAction(checkId: string): Promise<{ ok: boolean }> {
  const r = await confirmLeakCheck(checkId);
  if (r.ok) revalidatePath("/admin/wycieki");
  return r;
}
