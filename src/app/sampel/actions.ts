"use server";

import { revalidatePath } from "next/cache";

import { adminRemoveCatalogSample, adminUpdateCatalogSample, type AdminSampleResult } from "@/lib/studio/samples/sample-admin";

export async function updateCatalogSampleAction(formData: FormData): Promise<AdminSampleResult> {
  const result = await adminUpdateCatalogSample({
    sampleId: String(formData.get("sampleId") ?? ""),
    title: formData.get("title"),
    instrument: formData.get("instrument"),
    sampleType: formData.get("sampleType"),
    bpm: formData.get("bpm"),
    bars: formData.get("bars"),
    musicalKey: formData.get("musicalKey"),
  });
  if (result.ok) revalidatePath("/sampel");
  return result;
}

export async function removeCatalogSampleAction(sampleId: string): Promise<AdminSampleResult> {
  const result = await adminRemoveCatalogSample(sampleId);
  if (result.ok) revalidatePath("/sampel");
  return result;
}
