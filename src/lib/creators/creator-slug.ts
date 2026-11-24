/** Address of a public creator profile: /tworca/<public id>-<ksywka>. Pure. */

/** No 0/1/l/o: the id stays readable when somebody types it. */
const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const ID_LENGTH = 10;

/** Random id from 10 secure bytes (32 symbols, 50 bits). */
export function publicIdFromBytes(bytes: Uint8Array): string {
  let id = "";
  for (let i = 0; i < ID_LENGTH; i += 1) id += ID_ALPHABET[(bytes[i] ?? 0) % ID_ALPHABET.length];
  return id;
}

/** "Żółty MC_2" → "zolty-mc-2". Letters outside Latin are left out; "" when nothing is left. */
export function slugifyKsywka(name: string | null | undefined): string {
  return (name ?? "")
    .replace(/[łŁ]/g, "l")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Null without a ksywka: there is no page to show. */
export function creatorSlug(publicId: string, name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const tail = slugifyKsywka(name);
  return tail ? `${publicId}-${tail}` : publicId;
}

export function creatorPath(publicId: string | null | undefined, name: string | null | undefined): string | null {
  const slug = publicId ? creatorSlug(publicId, name) : null;
  return slug ? `/tworca/${slug}` : null;
}

/** The id part of an address; null for anything that cannot be one (no database call then). */
export function publicIdFromSlug(slug: string): string | null {
  const match = /^([a-km-np-z2-9]{10})(?:-[^/]{0,120})?$/.exec(slug);
  return match ? match[1]! : null;
}
