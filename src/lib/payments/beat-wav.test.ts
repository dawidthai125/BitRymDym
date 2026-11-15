import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isPurchasedWavContentType } from "@/lib/payments/beat-wav";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261115210000_paid_beat_wav.sql"), "utf8");

describe("paid beat wav", () => {
  it("accepts a wav master and refuses an mp3", () => {
    expect(isPurchasedWavContentType("audio/wav")).toBe(true);
    expect(isPurchasedWavContentType("audio/x-wav")).toBe(true);
    expect(isPurchasedWavContentType(" audio/wav ")).toBe(true);
    expect(isPurchasedWavContentType("audio/mpeg")).toBe(false);
    expect(isPurchasedWavContentType("audio/flac")).toBe(false);
    expect(isPurchasedWavContentType(null)).toBe(false);
  });

  it("locks the sale at 1999 grosz and keeps the grant on service_role", () => {
    expect(sql).toMatch(/product_kind in \('plan', 'addon', 'pack', 'beat'\)/);
    expect(sql).toMatch(/product_kind = 'beat' and beat_id is not null/);
    expect(sql).toMatch(/amount_grosz = 1999/);
    expect(sql).toMatch(/p_amount is distinct from 1999/);
    expect(sql).toMatch(/grant select on public\.beat_purchases to authenticated/i);
    expect(sql).toMatch(/revoke all on public\.beat_purchases from anon, authenticated/i);
    expect(sql).toMatch(/Only service_role may mutate beat_purchases/);
    expect(sql).toMatch(/grant execute on function public\.grant_payu_beat_wav\(text, integer, text, text, text\) to service_role/i);
    expect(sql).toMatch(/on conflict \(user_id, beat_id\) do nothing/i);
    expect(sql).toMatch(/'already'/);
    expect(sql).not.toMatch(/apply_p24_purchase/);
    expect(sql).not.toMatch(/grant_p24_quota_pack/);
  });

  it("downloads a purchased wav on its own path", () => {
    const download = readFileSync(join(process.cwd(), "src/lib/beats/purchased-wav.ts"), "utf8");
    const button = readFileSync(join(process.cwd(), "src/components/beats/download-button.tsx"), "utf8");
    const page = readFileSync(join(process.cwd(), "src/app/beat/[id]/page.tsx"), "utf8");
    expect(download).toContain("beat_purchases");
    expect(download).toContain('eq("purpose", "MASTER")');
    expect(download).not.toContain("requestBeatAudioAccess");
    expect(download).not.toContain("canDownloadOriginalBeatMaster");
    expect(button).toContain("requestBeatAudioAccessAction");
    expect(button).not.toContain("requestPurchasedBeatWav");
    expect(page).toContain('originalMasterDownloadAllowed={beat.ownershipType === "USER"}');
  });
});
