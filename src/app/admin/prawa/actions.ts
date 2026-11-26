"use server";

import { revalidatePath } from "next/cache";

import {
  staffCloseReport,
  staffHideSample,
  staffReleaseWork,
  staffRemoveWork,
  type StaffOutcome,
} from "@/lib/rights/content-reports";
import { requireRole } from "@/lib/auth/session";
import { archiveBeat } from "@/lib/beats/service";
import { blockTakenDownAudio, hashSampleBeforeRemoval } from "@/lib/rights/upload-screen";

/**
 * Owner order 2026-11-26: a takedown blocks the file everywhere, for good (blocked_audio_fingerprints).
 * The takedown itself already happened; a failed blocklist write is reported to the moderator.
 */
async function blockAfterTakedown(kind: "work" | "beat" | "sample", id: string, note: string, reportId?: string): Promise<StaffOutcome> {
  const ctx = await requireRole(["ADMIN"]);
  const r = await blockTakenDownAudio({ kind, sourceId: id, reason: note || "Zdjęte z katalogu przez moderatora.", reportId: reportId ?? null, actorId: ctx.userId });
  if (r.ok) return { ok: true };
  console.error("[admin-prawa] blocklist write failed", kind, id, r.error);
  return { ok: false, message: "Zdjęte, ale nie udało się dopisać pliku do listy blokad. Spróbuj jeszcze raz." };
}

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
  return out.ok ? blockAfterTakedown("work", workId, note, reportId) : out;
}

export async function hideSampleAction(sampleId: string, note: string, reportId?: string): Promise<StaffOutcome> {
  // Before the removal: the sample's catalogue copy is deleted with it, its fingerprint is copied now.
  const blocked = await blockAfterTakedown("sample", sampleId, note, reportId);
  if (!blocked.ok) return blocked;
  await hashSampleBeforeRemoval(sampleId);
  const out = await staffHideSample(sampleId, note);
  if (out.ok && reportId) await staffCloseReport(reportId, "removed", note);
  if (out.ok) refresh(`/sampel/${sampleId}`);
  return out;
}

export async function archiveBeatAction(beatId: string, note: string, reportId?: string): Promise<StaffOutcome> {
  await requireRole(["ADMIN"]);
  try {
    await archiveBeat(beatId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message.slice(0, 160) : "Nie udało się zarchiwizować bitu." };
  }
  if (reportId) await staffCloseReport(reportId, "removed", note);
  refresh(`/beat/${beatId}`);
  return blockAfterTakedown("beat", beatId, note, reportId);
}

export async function rejectReportAction(reportId: string, note: string): Promise<StaffOutcome> {
  const out = await staffCloseReport(reportId, "rejected", note);
  if (out.ok) refresh();
  return out;
}
