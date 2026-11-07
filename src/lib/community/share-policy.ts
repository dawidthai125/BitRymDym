import { ANONYMIZED_PUBLIC_AUTHOR } from "@/lib/auth/display-name";

/** Shown when a platform beat has no producer name. */
export const PLATFORM_AUTHOR = "BitRymDym";

export function publicAuthorName(input: {
  ownership: "PLATFORM" | "USER";
  displayName?: string | null;
  producer?: string | null;
}): string {
  if (input.ownership === "PLATFORM") {
    return input.producer?.trim() || input.displayName?.trim() || PLATFORM_AUTHOR;
  }
  return input.displayName?.trim() || input.producer?.trim() || ANONYMIZED_PUBLIC_AUTHOR;
}

/** Public catalogue is the author's choice. Ranking and ratings use the same gate. */
export function isPubliclyListed(input: { published: boolean; listed: boolean }): boolean {
  return input.published && input.listed;
}

export function canRatePublic(input: { published: boolean; listed: boolean }): boolean {
  return isPubliclyListed(input);
}

/** Comments exist only on a public listing, and only while the author leaves them on. */
export function canCommentPublic(input: {
  published: boolean;
  listed: boolean;
  allowComments: boolean;
}): boolean {
  return isPubliclyListed(input) && input.allowComments;
}
