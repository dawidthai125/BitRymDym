"use server";

import { revalidatePath } from "next/cache";

import {
  staffCloseReport,
  staffHideSample,
  staffReleaseWork,
  staffRemoveWork,
  type StaffOutcome,
} from "@/lib/rights/content-reports";
import { archiveBeat } from "@/lib/beats/service";

function refresh(path?: string) {
  revalidatePath("/admin/prawa");
  revalidatePath("/utwory");
  revalidatePath("/");
  if (path) revalidatePath(path);
}

/** ADMIN only (requireRole inside each staff function). */
export async function releaseWorkAction(workId: string, note: string): Promise<StaffOutcome> {
  const out = await staffReleaseWork(workId, note);
  if (out.ok) refresh(`/utwor/${workId}`);
  return out;
}

export async function removeWorkAction(workId: string, note: string, reportId?: string): Promise<StaffOutcome> {
  const out = await staffRemoveWork(workId, note);
  if (out.ok && reportId) await staffCloseReport(reportId, "removed", note);
  if (out.ok) refresh(`/utwor/${workId}`);
  return out;
}

export async function hideSampleAction(sampleId: string, note: string, reportId?: string): Promise<StaffOutcome> {
  const out = await staffHideSample(sampleId, note);
  if (out.ok && reportId) await staffCloseReport(reportId, "removed", note);
  if (out.ok) refresh(`/sampel/${sampleId}`);
  return out;
}

export async function archiveBeatAction(beatId: string, note: string, reportId?: string): Promise<StaffOutcome> {
  try {
    await archiveBeat(beatId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message.slice(0, 160) : "Nie udało się zarchiwizować bitu." };
  }
  if (reportId) await staffCloseReport(reportId, "removed", note);
  refresh(`/beat/${beatId}`);
  return { ok: true };
}

export async function rejectReportAction(reportId: string, note: string): Promise<StaffOutcome> {
  const out = await staffCloseReport(reportId, "rejected", note);
  if (out.ok) refresh();
  return out;
}
