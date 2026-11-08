/** User access token from Authorization. Not a cookie and not the service role env. */
const USER_JWT = /^Bearer\s+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/;

export function userAccessBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = USER_JWT.exec(header.trim());
  return match?.[1] ?? null;
}
