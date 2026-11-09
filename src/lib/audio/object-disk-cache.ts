import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/** Worker disk on the VPS. A repeat mix or master reads this instead of Supabase. */
export function objectCacheDir(): string {
  const configured = process.env.BITRYMDYM_OBJECT_CACHE_DIR?.trim();
  if (configured) return configured;
  return path.join(homedir(), ".cache", "bitrymdym-objects");
}

export function objectCachePath(bucket: string, objectKey: string): string {
  const name = createHash("sha256").update(`${bucket}\n${objectKey}`).digest("hex");
  return path.join(objectCacheDir(), name);
}

export async function readObjectCache(
  bucket: string,
  objectKey: string,
): Promise<Uint8Array | null> {
  try {
    const info = await stat(objectCachePath(bucket, objectKey));
    if (info.size < 1) return null;
    return new Uint8Array(await readFile(objectCachePath(bucket, objectKey)));
  } catch {
    return null;
  }
}

export async function writeObjectCache(
  bucket: string,
  objectKey: string,
  bytes: Uint8Array,
): Promise<void> {
  if (bytes.byteLength < 1) return;
  const dir = objectCacheDir();
  await mkdir(dir, { recursive: true });
  const file = objectCachePath(bucket, objectKey);
  const part = `${file}.part`;
  await writeFile(part, bytes);
  await rename(part, file);
}
