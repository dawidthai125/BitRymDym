import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadAcousticBank, type AcousticBank } from "@/lib/studio/acoustic-bank";

const FILE_NAME = /^(catalog\.json|[a-z0-9][a-z0-9-]{0,40}\.wav)$/;

async function readLocal(file: string): Promise<Uint8Array | null> {
  if (!FILE_NAME.test(file)) return null;
  try {
    return new Uint8Array(await readFile(path.join(process.cwd(), "public", "acoustic", file)));
  } catch {
    return null;
  }
}

/** Current deployment's static files, when the function image has no public folder. */
async function readDeployed(file: string): Promise<Uint8Array | null> {
  const host = process.env.VERCEL_URL;
  if (!host || !FILE_NAME.test(file)) return null;
  try {
    const res = await fetch(`https://${host}/acoustic/${file}`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Disk first, then this deployment's public URL. Null keeps the synthesizer. */
export async function loadAcousticBankFromPublic(): Promise<AcousticBank | null> {
  return (await loadAcousticBank(readLocal)) ?? (await loadAcousticBank(readDeployed));
}
