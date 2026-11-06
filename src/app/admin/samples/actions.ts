"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { requireModerationAccess } from "@/lib/beats/service";
import { reviewStudioSample } from "@/lib/studio/samples/sample-service";

export async function reviewStudioSampleAction(formData: FormData) {
  await requireModerationAccess();
  const auth = await requireUser();
  const sampleId = String(formData.get("sampleId") ?? "");
  const action = formData.get("decision") === "reject" ? "reject" : "approve";
  const note = String(formData.get("note") ?? "");
  const result = await reviewStudioSample(auth, {
    sampleId,
    action,
    note,
  });
  revalidatePath("/admin/samples");
  if (!result.ok) {
    redirect(`/admin/samples?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/admin/samples?ok=1");
}
