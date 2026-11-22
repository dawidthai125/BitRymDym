/**
 * Whose listen copy is this file? (Owner 2026-11-22)
 *   npm run leak:identify -- --beat <beatId> --file <leaked audio: mp3/wav/m4a/…>
 * Runs on the E3 host (service role env). Decodes the file and the beat's master(s), aligns them and scores every
 * listen copy ever made for that beat. z above ~10 is a match; wrong copies stay near 0.
 * Prints copy id, account number and z. Never prints e-mails, keys or URLs.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { detectWatermark } from "../src/lib/beats/listen-copy/watermark";
import { decodeMono, downloadMaster } from "../src/lib/beats/listen-copy/listen-copy-worker";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const beatId = arg("--beat");
  const file = arg("--file");
  if (!beatId || !file) {
    console.log("usage: --beat <beatId> --file <path>");
    process.exitCode = 2;
    return;
  }
  const admin = createSupabaseAdminClient();
  const { data: copies, error } = await admin
    .from("beat_listen_copies")
    .select("id, user_id, master_asset_id, created_at")
    .eq("beat_id", beatId);
  if (error) throw new Error(error.message);
  if (!copies?.length) {
    console.log(JSON.stringify({ event: "no_copies", beatId }));
    return;
  }
  const work = await mkdtemp(path.join(tmpdir(), "brd-leak-"));
  try {
    const suspect = await decodeMono(path.resolve(file), work, "suspect");
    const byMaster = new Map<string, typeof copies>();
    for (const c of copies) byMaster.set(c.master_asset_id as string, [...(byMaster.get(c.master_asset_id as string) ?? []), c]);
    const results: Array<{ copyId: string; userId: string; z: number }> = [];
    for (const [masterId, group] of byMaster) {
      const src = await downloadMaster(admin, masterId, work);
      const master = await decodeMono(src, work, `master-${masterId}`);
      const r = detectWatermark(suspect, master, group.map((c) => c.id as string));
      for (const s of r.scores) {
        const row = group.find((c) => c.id === s.copyId)!;
        results.push({ copyId: s.copyId, userId: row.user_id as string, z: Math.round(s.z * 10) / 10 });
      }
    }
    results.sort((a, b) => b.z - a.z);
    const top = results.slice(0, 5);
    const ids = top.map((t) => t.userId);
    const { data: profiles } = await admin.from("profiles").select("id, user_number, display_name").in("id", ids);
    for (const t of top) {
      const p = profiles?.find((x) => x.id === t.userId);
      console.log(JSON.stringify({ z: t.z, match: t.z >= 10, copyId: t.copyId, userId: t.userId, userNumber: p?.user_number ?? null, name: p?.display_name ?? null }));
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.log(JSON.stringify({ event: "fatal", message: e instanceof Error ? e.message.slice(0, 160) : "unknown" }));
  process.exitCode = 1;
});
