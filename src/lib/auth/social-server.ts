import "server-only";

import { headers } from "next/headers";

import { enabledSocialProviders, type SocialProvider } from "@/lib/auth/social";

/**
 * Providers to offer to this request (env flag + app build). AUTH_SOCIAL_PROVIDERS is read on the
 * server; a change on Vercel takes effect with the next production deployment.
 */
export async function socialProvidersForRequest(): Promise<SocialProvider[]> {
  return enabledSocialProviders({
    configured: process.env.AUTH_SOCIAL_PROVIDERS,
    userAgent: (await headers()).get("user-agent"),
  });
}
