"use server";

import { requestPurchasedBeatWav, type PurchasedWavResult } from "@/lib/beats/purchased-wav";

export async function requestPurchasedBeatWavAction(beatId: string): Promise<PurchasedWavResult> {
  return requestPurchasedBeatWav(beatId);
}
