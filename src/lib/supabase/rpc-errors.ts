/**
 * True when PostgREST/Postgres says the RPC function does not exist yet
 * (migration not applied): PGRST202 = not in schema cache, 42883 = undefined function.
 */
export function isMissingRpcFunction(error: { code?: string | null } | null | undefined): boolean {
  return !!error && (error.code === "PGRST202" || error.code === "42883");
}
