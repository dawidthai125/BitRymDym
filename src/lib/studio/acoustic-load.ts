import { loadAcousticBank, type AcousticBank } from "@/lib/studio/acoustic-bank";

const FILE_NAME = /^(catalog\.json|[a-z0-9][a-z0-9-]{0,40}\.wav)$/;

let bank: AcousticBank | null = null;
let pending: Promise<AcousticBank | null> | null = null;

/** The bank already in memory. Null until the first load finishes, and when it failed. */
export function peekAcousticBank(): AcousticBank | null {
  return bank;
}

/** One fetch of /acoustic for this page. Later calls share it. */
export function preloadAcousticBank(): Promise<AcousticBank | null> {
  if (bank) return Promise.resolve(bank);
  if (typeof fetch !== "function") return Promise.resolve(null);
  if (!pending) {
    pending = loadAcousticBank(async (file) => {
      if (!FILE_NAME.test(file)) return null;
      const res = await fetch(`/acoustic/${file}`);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    })
      .then((loaded) => {
        bank = loaded;
        return loaded;
      })
      .catch(() => null);
  }
  return pending;
}
