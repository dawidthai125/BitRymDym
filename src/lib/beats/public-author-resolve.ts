import { ANONYMIZED_PUBLIC_AUTHOR } from "@/lib/auth/display-name";
import type { Beat } from "@/types/domain";

/**
 * Resolve public author label for a beat (OTD-ACCOUNT-02) — pure.
 * USER + living owner → profiles.display_name (SSOT).
 * Fallback → historical beats.producer.
 * Never email / UUID / user_number.
 */
export function resolvePublicAuthor(params: {
  ownershipType: Beat["ownershipType"];
  ownerId: string | null;
  producer: string | null;
  ownerDisplayName: string | null | undefined;
}): string {
  if (params.ownershipType === "USER") {
    const fromProfile = params.ownerDisplayName?.trim();
    if (fromProfile) return fromProfile;
    if (!params.ownerId) {
      return params.producer?.trim() || ANONYMIZED_PUBLIC_AUTHOR;
    }
  }
  return params.producer?.trim() || "—";
}
