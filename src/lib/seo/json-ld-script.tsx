import { headers } from "next/headers";

import { serializeJsonLd, type JsonLdObject } from "@/lib/seo/json-ld";

/**
 * Server component: one JSON-LD data block. Native <script> (not next/script) per the
 * Next.js JSON-LD guide; nonce from middleware CSP for strict policies.
 */
export async function JsonLdScript({ data }: { data: JsonLdObject }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
